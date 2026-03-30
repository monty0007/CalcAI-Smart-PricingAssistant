"""
update_vm_types.py
──────────────────
Downloads the daily azure_vm_types.gz export from CloudPrice's Batch Export API,
parses the CSV, and upserts all rows into the `vm_types` Postgres table.

Usage:
    python update_vm_types.py

Environment variables required:
    DATABASE_URL          – PostgreSQL connection string
    CLOUDPRICE_API_KEY    – Your CloudPrice subscription key (from cloudprice.net dashboard)

Optional (override defaults):
    CLOUDPRICE_VM_TYPES_URL  – Full download URL (default: https://data.cloudprice.net/batch/azure/azure_vm_types.gz)
"""

import os
import sys
import csv
import gzip
import time
import io
import psycopg2
from psycopg2 import extras
from datetime import datetime

# ── Configuration ──────────────────────────────────────────────────────────────
CLOUDPRICE_VM_TYPES_URL = os.environ.get(
    'CLOUDPRICE_VM_TYPES_URL',
    'https://data.cloudprice.net/batch/azure/azure_vm_types.gz'
)

# ── DB connection ──────────────────────────────────────────────────────────────
def get_db_connection():
    """Load DATABASE_URL from env or from backend/.env, then connect."""
    if not os.environ.get('DATABASE_URL'):
        base_dir = os.path.dirname(__file__)
        for candidate in [
            os.path.join(base_dir, '../.env'),
            os.path.join(base_dir, '../../.env'),
        ]:
            try:
                with open(os.path.abspath(candidate), 'r') as f:
                    for line in f:
                        line = line.strip()
                        if line.startswith('DATABASE_URL='):
                            os.environ['DATABASE_URL'] = line.split('=', 1)[1].strip('"').strip("'")
                            break
                if os.environ.get('DATABASE_URL'):
                    break
            except Exception:
                pass

    db_url = os.environ.get('DATABASE_URL')
    if not db_url:
        print("❌  Error: DATABASE_URL not set. Provide it as an environment variable or in backend/.env")
        sys.exit(1)

    api_key = os.environ.get('CLOUDPRICE_API_KEY', '')
    if not api_key:
        print("⚠️   Warning: CLOUDPRICE_API_KEY not set. The download may fail with 401 Unauthorized.")
        print("     Set it with:  set CLOUDPRICE_API_KEY=your-key-here  (Windows)")

    try:
        conn = psycopg2.connect(db_url)
        return conn, api_key
    except Exception as e:
        print(f"❌  Error connecting to database: {e}")
        sys.exit(1)


# ── Table schema ───────────────────────────────────────────────────────────────
CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS vm_types (
    name                    TEXT PRIMARY KEY,
    cpu_desc                TEXT,
    cpu_architecture        TEXT,
    numa_nodes              INTEGER,
    perf_score              NUMERIC,
    hyper_v_gen             TEXT,
    max_net_interfaces      INTEGER,
    rdma_enabled            BOOLEAN,
    accelerated_net         BOOLEAN,
    combined_iops           BIGINT,
    uncached_disk_iops      BIGINT,
    combined_write_bytes    BIGINT,
    combined_read_bytes     BIGINT,
    acus                    INTEGER,
    gpus                    INTEGER,
    gpu_type                TEXT,
    gpu_ram_mb              NUMERIC,
    gpu_total_ram_mb        NUMERIC,
    canonical_name          TEXT,
    number_of_cores         INTEGER,
    os_disk_size_mb         INTEGER,
    resource_disk_size_mb   INTEGER,
    memory_mb               INTEGER,
    max_data_disk_count     INTEGER,
    support_premium_disk    BOOLEAN,
    similar_azure_vms       TEXT[],
    modified_date           DATE,
    updated_at              TIMESTAMPTZ DEFAULT NOW()
);
"""

# ── Helpers ────────────────────────────────────────────────────────────────────
def to_bool(val):
    if val is None or val == '':
        return None
    return str(val).strip().lower() in ('true', '1', 'yes')

def to_int(val):
    try:
        return int(float(val)) if val and val.strip() else None
    except Exception:
        return None

def to_float(val):
    try:
        return float(val) if val and val.strip() else None
    except Exception:
        return None

def to_date(val):
    if not val or not val.strip():
        return None
    for fmt in ('%Y-%m-%d', '%m/%d/%Y', '%d/%m/%Y', '%Y/%m/%d'):
        try:
            return datetime.strptime(val.strip(), fmt).date()
        except Exception:
            pass
    return None

def parse_array(val):
    """Parse a semicolon/comma separated list into a Python list."""
    if not val or not val.strip():
        return []
    separators = [';', ',', '|']
    for sep in separators:
        if sep in val:
            return [v.strip() for v in val.split(sep) if v.strip()]
    return [val.strip()] if val.strip() else []


# ── Download ───────────────────────────────────────────────────────────────────
def download_vm_types(api_key):
    """Download and decompress the gzip CSV. Returns list of dicts."""
    try:
        import requests
    except ImportError:
        print("❌  'requests' library is required. Run: pip install requests")
        sys.exit(1)

    headers = {}
    if api_key:
        headers['subscription-key'] = api_key

    print(f"📥  Downloading {CLOUDPRICE_VM_TYPES_URL} ...")
    for attempt in range(3):
        try:
            response = requests.get(CLOUDPRICE_VM_TYPES_URL, headers=headers, timeout=60)
            if response.status_code == 401:
                print("❌  401 Unauthorized – check your CLOUDPRICE_API_KEY")
                sys.exit(1)
            if response.status_code == 403:
                print("❌  403 Forbidden – your subscription may not include Batch Export")
                sys.exit(1)
            if response.status_code != 200:
                print(f"❌  HTTP {response.status_code}: {response.text[:200]}")
                sys.exit(1)
            break
        except requests.exceptions.RequestException as e:
            if attempt < 2:
                print(f"⚠️   Attempt {attempt + 1} failed: {e}. Retrying in 5 s ...")
                time.sleep(5)
            else:
                print(f"❌  Download failed after 3 attempts: {e}")
                sys.exit(1)

    print(f"✅  Downloaded {len(response.content) / 1024:.1f} KB")

    # Decompress
    try:
        decompressed = gzip.decompress(response.content)
    except Exception as e:
        print(f"❌  Failed to decompress gzip: {e}")
        sys.exit(1)

    # Parse CSV
    text = decompressed.decode('utf-8-sig')  # strip BOM if present
    reader = csv.DictReader(io.StringIO(text))
    rows = list(reader)
    print(f"📋  Parsed {len(rows)} VM type records")
    return rows


# ── Upsert ─────────────────────────────────────────────────────────────────────
def upsert_vm_types(conn, rows):
    """Ensure table exists, then upsert all rows."""
    cur = conn.cursor()

    # Create table if it doesn't exist
    cur.execute(CREATE_TABLE_SQL)
    conn.commit()
    print("✅  vm_types table ready")

    records = []
    for row in rows:
        # Column names from CloudPrice CSV (case-insensitive match)
        r = {k.strip(): v for k, v in row.items()}

        similar_raw = r.get('similarAzureVMs', '') or r.get('SimilarAzureVMs', '')
        similar = parse_array(similar_raw)

        records.append((
            r.get('name', '').strip() or r.get('Name', '').strip(),
            r.get('CPUdesc', '') or r.get('CpuDesc', ''),
            r.get('CpuArchitecture', '') or r.get('cpuArchitecture', ''),
            to_int(r.get('NUMAnodes') or r.get('numAnodes')),
            to_float(r.get('PerfScore') or r.get('perfScore')),
            r.get('HyperVGen', '') or r.get('hyperVGen', ''),
            to_int(r.get('MaxNetInter') or r.get('maxNetInter')),
            to_bool(r.get('RdmaEnabled') or r.get('rdmaEnabled')),
            to_bool(r.get('AcceleratedNet') or r.get('acceleratedNet')),
            to_int(r.get('CombinedIOPS') or r.get('combinedIOPS')),
            to_int(r.get('UncachedDiskIOPS') or r.get('uncachedDiskIOPS')),
            to_int(r.get('CombinedWriteBSecond') or r.get('combinedWriteBSecond')),
            to_int(r.get('CombinedReadBSecond') or r.get('combinedReadBSecond')),
            to_int(r.get('ACUs') or r.get('acus')),
            to_int(r.get('GPUs') or r.get('gpus')),
            r.get('GpuType', '') or r.get('gpuType', ''),
            to_float(r.get('GpuRAM') or r.get('gpuRAM')),
            to_float(r.get('GpuTotalRAM') or r.get('gpuTotalRAM')),
            r.get('canonicalname', '') or r.get('canonicalName', ''),
            to_int(r.get('numberOfCores')),
            to_int(r.get('osDiskSizeInMB')),
            to_int(r.get('resourceDiskSizeInMB')),
            to_int(r.get('memoryInMB')),
            to_int(r.get('maxDataDiskCount')),
            to_bool(r.get('supportPremiumDisk')),
            similar,
            to_date(r.get('modifiedDate')),
        ))

    # Filter out rows with no name
    records = [rec for rec in records if rec[0]]
    print(f"🔄  Upserting {len(records)} records ...")

    upsert_sql = """
    INSERT INTO vm_types (
        name, cpu_desc, cpu_architecture, numa_nodes, perf_score, hyper_v_gen,
        max_net_interfaces, rdma_enabled, accelerated_net, combined_iops,
        uncached_disk_iops, combined_write_bytes, combined_read_bytes, acus, gpus,
        gpu_type, gpu_ram_mb, gpu_total_ram_mb, canonical_name, number_of_cores,
        os_disk_size_mb, resource_disk_size_mb, memory_mb, max_data_disk_count,
        support_premium_disk, similar_azure_vms, modified_date, updated_at
    ) VALUES %s
    ON CONFLICT (name) DO UPDATE SET
        cpu_desc             = EXCLUDED.cpu_desc,
        cpu_architecture     = EXCLUDED.cpu_architecture,
        numa_nodes           = EXCLUDED.numa_nodes,
        perf_score           = EXCLUDED.perf_score,
        hyper_v_gen          = EXCLUDED.hyper_v_gen,
        max_net_interfaces   = EXCLUDED.max_net_interfaces,
        rdma_enabled         = EXCLUDED.rdma_enabled,
        accelerated_net      = EXCLUDED.accelerated_net,
        combined_iops        = EXCLUDED.combined_iops,
        uncached_disk_iops   = EXCLUDED.uncached_disk_iops,
        combined_write_bytes = EXCLUDED.combined_write_bytes,
        combined_read_bytes  = EXCLUDED.combined_read_bytes,
        acus                 = EXCLUDED.acus,
        gpus                 = EXCLUDED.gpus,
        gpu_type             = EXCLUDED.gpu_type,
        gpu_ram_mb           = EXCLUDED.gpu_ram_mb,
        gpu_total_ram_mb     = EXCLUDED.gpu_total_ram_mb,
        canonical_name       = EXCLUDED.canonical_name,
        number_of_cores      = EXCLUDED.number_of_cores,
        os_disk_size_mb      = EXCLUDED.os_disk_size_mb,
        resource_disk_size_mb = EXCLUDED.resource_disk_size_mb,
        memory_mb            = EXCLUDED.memory_mb,
        max_data_disk_count  = EXCLUDED.max_data_disk_count,
        support_premium_disk = EXCLUDED.support_premium_disk,
        similar_azure_vms    = EXCLUDED.similar_azure_vms,
        modified_date        = EXCLUDED.modified_date,
        updated_at           = NOW()
    """

    template = "(%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())"

    BATCH_SIZE = 500
    total_affected = 0

    for i in range(0, len(records), BATCH_SIZE):
        batch = records[i:i + BATCH_SIZE]
        try:
            extras.execute_values(cur, upsert_sql, batch, template=template, page_size=BATCH_SIZE)
            affected = cur.rowcount
            conn.commit()
            total_affected += affected
            print(f"  Batch {i // BATCH_SIZE + 1}: {affected} rows upserted")
        except Exception as e:
            conn.rollback()
            print(f"  ❌ Batch {i // BATCH_SIZE + 1} failed: {e}")

    cur.close()
    return total_affected


# ── Main ───────────────────────────────────────────────────────────────────────
def main():
    start = datetime.now()
    print("=" * 60)
    print("  CloudPrice Azure VM Types Sync")
    print(f"  Started: {start.strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)

    conn, api_key = get_db_connection()

    try:
        rows = download_vm_types(api_key)
        if not rows:
            print("⚠️   No records found in the downloaded file.")
            return

        affected = upsert_vm_types(conn, rows)

        elapsed = (datetime.now() - start).total_seconds()
        print()
        print("=" * 60)
        print("  ✅  Sync Complete!")
        print(f"  Records upserted : {affected}")
        print(f"  Time elapsed     : {elapsed:.1f}s")
        print("=" * 60)

    except KeyboardInterrupt:
        print("\n⚠️  Cancelled by user")
    finally:
        conn.close()


if __name__ == '__main__':
    main()
