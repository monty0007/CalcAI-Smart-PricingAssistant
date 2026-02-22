import { useState, useEffect } from 'react';
import { Search, ArrowLeft, X, Check, ChevronDown, Download, SlidersHorizontal, Info, ArrowUp, ArrowDown } from 'lucide-react';
import { useEstimate } from '../context/EstimateContext';
import { VM_SPECS } from '../data/vmSpecs';
import { fetchVmList, fetchVmComparison, fetchVmPricingCompare, formatPrice, SUPPORTED_CURRENCIES } from '../services/azurePricingApi';
import { AZURE_REGIONS } from '../data/serviceCatalog';

// "€"€ Helpers "€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€

// Build a case-insensitive lookup map from VM_SPECS keys
const VM_SPECS_MAP = {};
Object.keys(VM_SPECS).forEach(key => {
    VM_SPECS_MAP[key.toLowerCase()] = key;
    // Also map without "Standard_" for short lookups
    const short = key.replace(/^Standard_/i, '').toLowerCase();
    VM_SPECS_MAP[short] = key;
});

function lookupSpec(skuName) {
    if (!skuName) return null;
    const exact = VM_SPECS[skuName];
    if (exact) return exact;
    const lower = skuName.toLowerCase();
    const canonical = VM_SPECS_MAP[lower];
    return canonical ? VM_SPECS[canonical] : null;
}

const SERIES_MAP = {
    A: 'A â€” Entry-level VMs for dev/test',
    B: 'B â€” Burstable economical VMs',
    D: 'D â€” General purpose with balanced performance',
    E: 'E â€” Memory optimized with high memory-to-CPU',
    F: 'F â€” Compute optimized with high CPU-to-memory',
    G: 'G â€” Memory and storage optimized',
    H: 'H â€” High performance computing',
    L: 'L â€” Storage optimized with high disk throughput',
    M: 'M â€” Memory optimized with ultra high core count',
    N: 'N â€” GPU enabled VMs',
};

function getTooltipLines(skuName, spec) {
    const lines = [];
    if (!skuName) return lines;
    const parts = skuName.split('_').filter(Boolean);
    if (parts[0]?.toLowerCase() === 'standard') {
        lines.push('Standard is recommended tier');
        parts.shift();
    }
    if (parts[0]) {
        const letter = parts[0].replace(/[^A-Za-z]/g, '')[0]?.toUpperCase();
        if (letter && SERIES_MAP[letter]) lines.push(SERIES_MAP[letter]);
        // Extract vCPU number from sku part
        const vcpuMatch = parts[0].match(/([A-Za-z]+)(\d+)/);
        if (vcpuMatch) lines.push(`${vcpuMatch[2]} â€” The number of vCPUs`);
    }
    const vPart = parts.find(p => /^v\d+$/i.test(p));
    if (vPart) lines.push(`${vPart} â€” version`);
    if (spec?.vCpus && !lines.some(l => l.includes('vCPUs'))) {
        lines.push(`${spec.vCpus} â€” The number of vCPUs`);
    }
    return lines;
}

// "€"€ Tooltip component "€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€
function VmTooltip({ lines }) {
    if (!lines || lines.length === 0) return null;
    return (
        <div className="vm-name-tooltip">
            {lines.map((l, i) => (
                <div key={i} className="tooltip-line">{l}</div>
            ))}
        </div>
    );
}

function BoolCell({ value }) {
    return (
        <span style={{ color: value ? 'var(--success)' : 'var(--text-muted)' }}>
            {value ? 'yes' : 'no'}
        </span>
    );
}

// "€"€ Compare View "€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€
function CompareView({ selectedSkus, vmRows = [], onBack, onDeselect, currency, setCurrency }) {
    const [os, setOs] = useState('linux');
    const [compareData, setCompareData] = useState(null);
    const [loading, setLoading] = useState(true);

    // Build a map from skuName â†’ API row data (has vCpus, memoryGib, etc. from DB)
    const apiSpecMap = {};
    vmRows.forEach(vm => { apiSpecMap[vm.skuName] = vm; });

    // Merge: API data first, then static vmSpecs fallback
    function getSpec(sku) {
        const apiRow = apiSpecMap[sku] || {};
        const staticSpec = lookupSpec(sku) || {};
        return {
            vCpus: apiRow.vCpus ?? staticSpec.vCpus ?? null,
            memoryGib: apiRow.memoryGib ?? staticSpec.memory ?? null,
            architecture: apiRow.cpuArchitecture || staticSpec.architecture || 'x64',
            hyperVGen: apiRow.hyperVGen || staticSpec.hyperVGen || 'V1',
            acus: apiRow.acus ?? staticSpec.acus ?? null,
            gpus: apiRow.gpus ?? staticSpec.gpus ?? 0,
            gpuType: apiRow.gpuType || null,
            maxNics: apiRow.maxNics ?? staticSpec.maxNics ?? null,
            rdma: apiRow.rdmaEnabled ?? staticSpec.rdma ?? false,
            acceleratedNet: apiRow.acceleratedNet ?? staticSpec.acceleratedNet ?? false,
            osDiskSizeMb: apiRow.osDiskSizeMb ?? null,
            resDiskSizeMb: apiRow.resDiskSizeMb ?? null,
            maxDisks: apiRow.maxDisks ?? staticSpec.maxDisks ?? null,
            premiumDisk: apiRow.premiumDisk ?? staticSpec.premiumDisk ?? false,
            combinedIops: apiRow.combinedIops ?? staticSpec.uncachedIops ?? null,
            uncachedIops: apiRow.uncachedIops ?? null,
            combinedWriteBytes: apiRow.combinedWriteBytes ?? null,
            combinedReadBytes: apiRow.combinedReadBytes ?? null,
            perfScore: apiRow.perfScore ?? staticSpec.score ?? null,
            similarVMs: apiRow.similarVMs || [],
            type: apiRow.canonicalName || staticSpec.type || null,
        };
    }
    useEffect(() => {
        setLoading(true);
        fetchVmComparison({ skus: selectedSkus, currency, os })
            .then(setCompareData)
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [selectedSkus, currency, os]);

    const regions = compareData?.regions || {};
    const allRegions = [...new Set(
        Object.values(regions).flatMap(r => r.map(e => e.region))
    )].sort();

    const firstSkuScore = getSpec(selectedSkus[0])?.perfScore || 1;

    const specRow = (label, fn, hint = null) => (
        <tr>
            <td className="label-col">
                {hint && <p className="sub-label">{hint}</p>}
                {label}
            </td>
            {selectedSkus.map(sku => <td key={sku}>{fn(sku)}</td>)}
        </tr>
    );

    return (
        <div className="vm-compare-page">
            <div className="compare-page-header">
                <button className="back-btn" onClick={onBack}>
                    <ArrowLeft size={16} /> Back to List
                </button>
                <h1>Compare Azure Virtual Machines</h1>
            </div>

            <div className="comparison-table-wrapper">
                <table className="comparison-table">
                    <thead>
                        <tr>
                            <th className="label-col">Name</th>
                            {selectedSkus.map(sku => (
                                <th key={sku} className="sku-header-cell">
                                    <div className="sku-header-inner">
                                        <span>{sku}</span>
                                        <button className="remove-sku-btn" onClick={() => onDeselect(sku)}>
                                            <X size={14} />
                                        </button>
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        <tr className="section-row"><td colSpan={selectedSkus.length + 1}>Details</td></tr>
                        <tr>
                            <td className="label-col">Details</td>
                            {selectedSkus.map(sku => (
                                <td key={sku} style={{ fontSize: '0.82rem', lineHeight: 1.7 }}>
                                    {getTooltipLines(sku, getSpec(sku)).map((l, i) => <div key={i}>{l}</div>)}
                                </td>
                            ))}
                        </tr>
                        {specRow('vCPUs', sku => getSpec(sku).vCpus ?? 'â€”')}
                        {specRow('CPU Architecture', sku => getSpec(sku).architecture || 'x64')}
                        {specRow('Memory (GiB)', sku => getSpec(sku).memoryGib ?? 'â€”')}
                        {specRow('Hyper-V Generations', sku => getSpec(sku).hyperVGen || 'V1')}
                        {specRow('ACUs', sku => getSpec(sku).acus ?? 'â€”')}
                        {specRow('GPUs', sku => getSpec(sku).gpus ?? 0)}

                        <tr className="section-row"><td colSpan={selectedSkus.length + 1}>Network & Disk</td></tr>
                        {specRow('Max Network Interfaces', sku => getSpec(sku).maxNics ?? 'â€”')}
                        {specRow('RDMA Enabled', sku => <BoolCell value={getSpec(sku).rdma} />)}
                        {specRow('Accelerated Net', sku => <BoolCell value={getSpec(sku).acceleratedNet} />)}
                        {specRow('OS Disk Size', sku => {
                            const s = getSpec(sku);
                            return s.osDiskSizeMb ? `${(s.osDiskSizeMb / 1024).toFixed(0)} GiB` : 'â€”';
                        })}
                        {specRow('Res Disk Size', sku => {
                            const s = getSpec(sku);
                            return s.resDiskSizeMb ? `${(s.resDiskSizeMb / 1024).toFixed(0)} GiB` : 'â€”';
                        })}
                        {specRow('Max Data Disks', sku => getSpec(sku).maxDisks ?? 'â€”')}
                        {specRow('Support Premium Disk', sku => <BoolCell value={getSpec(sku).premiumDisk} />)}
                        {specRow('Combined IOPS', sku => getSpec(sku).combinedIops ?? 'â€”', "Combined IOPS is a sum of all attached disk's IOPs")}
                        {specRow('Uncached Disk IOPS', sku => getSpec(sku).uncachedIops ?? 'â€”')}
                        {specRow('Combined Write Throughput', sku => {
                            const bytes = getSpec(sku).combinedWriteBytes;
                            return bytes ? `${(bytes / 1048576).toFixed(0)} MiB/s` : 'â€”';
                        }, "Combined Write is a sum of all attached disk's write throughput")}
                        {specRow('Combined Read Throughput', sku => {
                            const bytes = getSpec(sku).combinedReadBytes;
                            return bytes ? `${(bytes / 1048576).toFixed(0)} MiB/s` : 'â€”';
                        }, "Combined Read is a sum of all attached disk's read throughput")}

                        <tr className="section-row"><td colSpan={selectedSkus.length + 1}>Price Summary</td></tr>
                        <tr>
                            <td className="label-col">Perf Score Ratio</td>
                            {selectedSkus.map(sku => {
                                const score = getSpec(sku)?.perfScore || 1;
                                return <td key={sku}><strong>{firstSkuScore > 0 ? (score / firstSkuScore).toFixed(2) : 'â€”'}x</strong></td>;
                            })}
                        </tr>

                        {/* Regional Prices */}
                        <tr className="section-row">
                            <td colSpan={selectedSkus.length + 1}>
                                Regional Prices
                                <div className="regional-controls">
                                    <select className="select-control" value={currency} onChange={e => setCurrency(e.target.value)}>
                                        {SUPPORTED_CURRENCIES.map(c => (
                                            <option key={c.code} value={c.code}>{c.name} ({c.symbol})</option>
                                        ))}
                                    </select>
                                    <span className="ctrl-pill">Per Hour</span>
                                    <select className="select-control" value={os} onChange={e => setOs(e.target.value)}>
                                        <option value="linux">Linux</option>
                                        <option value="windows">Windows</option>
                                    </select>
                                    <span className="ctrl-pill">Standard</span>
                                    <span className="ctrl-pill">Pay-as-you-go</span>
                                </div>
                            </td>
                        </tr>
                        <tr className="regional-header-row">
                            <td className="label-col"><strong>Region</strong></td>
                            {selectedSkus.map(sku => <td key={sku}><strong>{sku}</strong></td>)}
                        </tr>
                        {loading ? (
                            <tr><td colSpan={selectedSkus.length + 1} style={{ textAlign: 'center', padding: 24 }}>
                                <div className="spinner" style={{ margin: '0 auto' }} />
                            </td></tr>
                        ) : allRegions.map(regionCode => {
                            const label = (() => {
                                for (const sku of selectedSkus) {
                                    const entry = regions[sku]?.find(e => e.region === regionCode);
                                    if (entry?.location) return entry.location;
                                }
                                return regionCode;
                            })();
                            const regionAzure = AZURE_REGIONS.find(r => r.code === regionCode);
                            const geo = regionAzure?.group || '';
                            return (
                                <tr key={regionCode} className="region-price-row">
                                    <td className="label-col">
                                        {geo && <span className="region-geo">{geo} / </span>}
                                        {label} ({regionCode})
                                    </td>
                                    {selectedSkus.map(sku => {
                                        const entry = regions[sku]?.find(e => e.region === regionCode);
                                        return (
                                            <td key={sku} className="price-cell">
                                                {entry ? formatPrice(entry.price, currency) : <span className="text-muted">â€”</span>}
                                            </td>
                                        );
                                    })}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// "€"€ Main Page "€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€
export default function VmComparisonPage() {
    const { region, currency, setCurrency } = useEstimate();

    const [searchQuery, setSearchQuery] = useState('');
    const [allVms, setAllVms] = useState([]);       // all VMs loaded from backend
    const [vmRows, setVmRows] = useState([]);         // filtered view shown in table
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(null);
    const [sortConfig, setSortConfig] = useState({ key: 'linuxPrice', direction: 'asc' });
    const [selectedSkus, setSelectedSkus] = useState([]);
    const [isComparing, setIsComparing] = useState(false);
    const [showPricingCard, setShowPricingCard] = useState(false);
    const [pricingPeriod, setPricingPeriod] = useState('monthly');
    const [customHours, setCustomHours] = useState(730);
    const [pricingData, setPricingData] = useState(null);
    const [pricingLoading, setPricingLoading] = useState(false);

    // Hardware Filters (client-side)
    const [minVcpu, setMinVcpu] = useState('');
    const [maxVcpu, setMaxVcpu] = useState('');
    const [minMemory, setMinMemory] = useState('');
    const [maxMemory, setMaxMemory] = useState('');

    const [lastUpdate, setLastUpdate] = useState(null);
    const [hoveredSku, setHoveredSku] = useState(null);

    // Fetch last sync time once
    useEffect(() => {
        const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
        fetch(`${apiBase}/health`)
            .then(r => r.json())
            .then(d => { if (d.lastSync?.completedAt) setLastUpdate(new Date(d.lastSync.completedAt)); })
            .catch(() => { });
    }, []);

    // Fetch ALL VMs when region or currency changes (only two triggers)
    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setLoadError(null);
        setAllVms([]);
        setVmRows([]);

        fetchVmList({ currency, region, limit: 2000, offset: 0 })
            .then(data => {
                if (cancelled) return;
                const rows = data.items || [];
                setAllVms(rows);
                setVmRows(rows); // start with full list, filters apply next
            })
            .catch(err => {
                if (!cancelled) setLoadError(err.message || 'Failed to load VM list');
            })
            .finally(() => { if (!cancelled) setLoading(false); });

        return () => { cancelled = true; };
    }, [currency, region]);

    // Client-side filter — runs instantly whenever filters or the full VM list changes
    useEffect(() => {
        const q = searchQuery.trim().toLowerCase();
        const minV = parseFloat(minVcpu);
        const maxV = parseFloat(maxVcpu);
        const minM = parseFloat(minMemory);
        const maxM = parseFloat(maxMemory);

        let rows = allVms;

        if (q) {
            // strip 'standard_' prefix so 'd4s' matches 'Standard_D4s_v3'
            const term = q.startsWith('standard_') ? q.slice(9) : q;
            rows = rows.filter(vm => vm.skuName.toLowerCase().includes(term));
        }
        if (!isNaN(minV)) rows = rows.filter(vm => (vm.specs?.vCpus ?? lookupSpec(vm.skuName)?.vCpus ?? 0) >= minV);
        if (!isNaN(maxV)) rows = rows.filter(vm => (vm.specs?.vCpus ?? lookupSpec(vm.skuName)?.vCpus ?? 9999) <= maxV);
        if (!isNaN(minM)) rows = rows.filter(vm => (vm.specs?.memoryGib ?? lookupSpec(vm.skuName)?.memory ?? 0) >= minM);
        if (!isNaN(maxM)) rows = rows.filter(vm => (vm.specs?.memoryGib ?? lookupSpec(vm.skuName)?.memory ?? 9999) <= maxM);

        rows.sort((a, b) => {
            const getVal = (vm, key) => {
                const spec = lookupSpec(vm.skuName);
                if (key === 'vCpus') return vm.vCpus ?? spec?.vCpus ?? 0;
                if (key === 'memoryGib') return vm.memoryGib ?? spec?.memory ?? spec?.memoryGib ?? 0;
                if (key === 'linuxPrice') return vm.linuxPrice ?? 999999;
                if (key === 'windowsPrice') return vm.windowsPrice ?? 999999;
                if (key === 'bestRegion') return vm.bestRegion || 'zzz';
                if (key === 'diffPercent') return vm.diffPercent ?? 0;
                return vm.skuName;
            };

            const aVal = getVal(a, sortConfig.key);
            const bVal = getVal(b, sortConfig.key);

            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });

        setVmRows(rows);
    }, [allVms, searchQuery, minVcpu, maxVcpu, minMemory, maxMemory, sortConfig]);

    const handleSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const toggleSelection = (sku) => {
        setSelectedSkus(prev => {
            if (prev.includes(sku)) return prev.filter(s => s !== sku);
            if (prev.length >= 2) return prev;
            return [...prev, sku];
        });
    };

    const handleDeselect = (sku) => {
        setSelectedSkus(prev => prev.filter(s => s !== sku));
        if (selectedSkus.length <= 1) setIsComparing(false);
    };

    const handleClear = () => {
        setSelectedSkus([]);
        setIsComparing(false);
        setShowPricingCard(false);
    };

    const handleComparePricing = async () => {
        setShowPricingCard(true);
        setPricingLoading(true);
        try {
            const data = await fetchVmPricingCompare({
                skus: selectedSkus,
                regions: ['centralindia', 'southindia'],
                currency: currency
            });
            setPricingData(data);
        } catch (err) {
            console.error('Failed to compare pricing:', err);
        } finally {
            setPricingLoading(false);
        }
    };

    const getRegionLabel = () => {
        const r = AZURE_REGIONS.find(x => x.code === region);
        return r ? `${r.name} (${region})` : region;
    };

    const updateDate = lastUpdate
        ? lastUpdate.toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
        : 'â€”';

    if (isComparing) {
        return (
            <div className="vm-page content-area">
                <CompareView
                    selectedSkus={selectedSkus}
                    vmRows={vmRows}
                    onBack={() => setIsComparing(false)}
                    onDeselect={handleDeselect}
                    currency={currency}
                    setCurrency={(c) => setCurrency(c, [])}
                />
            </div>
        );
    }

    return (
        <div className="vm-page content-area">
            {/* "€"€ Hero "€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€ */}
            <div className="vm-hero-block">
                <div className="vm-hero-top">
                    <div>
                        <h1 className="vm-hero-title">Azure VM Pricing</h1>
                        <p className="vm-hero-subtitle">
                            {allVms.length > 0 && !loading ? <><strong>{allVms.length}</strong> VMs{vmRows.length < allVms.length ? ` · ${vmRows.length} filtered` : ''} · </> : ''}
                            <span className="vm-update-chip">
                                {lastUpdate ? `Updated ${lastUpdate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : 'Loading data...'}
                            </span>
                        </p>
                    </div>
                    <div className="vm-hero-badges">
                        <span className="vm-badge-pill azure">Azure only</span>
                        <span className="vm-badge-pill payg">Pay-as-you-go</span>
                        <span className="vm-badge-pill hourly">Per Hour</span>
                    </div>
                </div>
                <p className="vm-hero-desc">
                    Browse and compare Azure Virtual Machines across SKUs, vCPU counts, memory, Linux and Windows pricing.
                    Select up to 2 VMs to compare specs and regional pricing side-by-side.
                </p>
            </div>

            {/* "€"€ Controls bar "€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€ */}
            <div className="vm-controls-bar">
                <div className="controls-group">
                    <select className="ctrl-select" value={currency} onChange={e => setCurrency(e.target.value, [])}>
                        {SUPPORTED_CURRENCIES.map(c => (
                            <option key={c.code} value={c.code}>{c.name} ({c.symbol})</option>
                        ))}
                    </select>
                    <span className="ctrl-divider" />
                    <span className="ctrl-pill">{getRegionLabel()}</span>
                    <span className="ctrl-divider" />
                    <span className="ctrl-pill">Standard</span>
                    <span className="ctrl-divider" />
                    <span className="ctrl-pill highlight">Pay-as-you-go</span>
                </div>
            </div>

            {/* "€"€ Filter row "€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€ */}
            <div className="vm-filter-row">
                <div className="vm-filter-group">
                    <div className="vm-filter-chip">
                        <label className="filter-label">vCPUs</label>
                        <div className="filter-range-inputs">
                            <input type="number" className="filter-range-input" placeholder="Min" min="1" value={minVcpu} onChange={e => setMinVcpu(e.target.value)} />
                            <span className="filter-range-sep">â€“</span>
                            <input type="number" className="filter-range-input" placeholder="Max" min="1" value={maxVcpu} onChange={e => setMaxVcpu(e.target.value)} />
                        </div>
                    </div>
                    <div className="vm-filter-chip">
                        <label className="filter-label">Memory (GiB)</label>
                        <div className="filter-range-inputs">
                            <input type="number" className="filter-range-input" placeholder="Min" min="1" value={minMemory} onChange={e => setMinMemory(e.target.value)} />
                            <span className="filter-range-sep">â€“</span>
                            <input type="number" className="filter-range-input" placeholder="Max" min="1" value={maxMemory} onChange={e => setMaxMemory(e.target.value)} />
                        </div>
                    </div>
                </div>
                <div className="vm-search-wrap">
                    <Search size={14} className="search-icon" />
                    <input
                        type="text"
                        className="vm-search-input"
                        placeholder="Filter by name or series (e.g. D2s, B4ms)"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                    />
                    {searchQuery && (
                        <button className="search-clear-btn" onClick={() => setSearchQuery('')}><X size={13} /></button>
                    )}
                </div>
                <button className="columns-btn">
                    <SlidersHorizontal size={14} /> Columns <ChevronDown size={12} />
                </button>
            </div>

            {/* "€"€ VM Table "€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€ */}
            <div className="vm-table-container">
                <table className="vm-table">
                    <thead>
                        <tr>
                            <th style={{ width: 36 }}></th>
                            <th className="sortable-th" onClick={() => handleSort('skuName')}>
                                VM Name {sortConfig.key === 'skuName' && (sortConfig.direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                            </th>
                            <th className="sortable-th" style={{ width: 90 }} onClick={() => handleSort('vCpus')}>
                                vCPUs {sortConfig.key === 'vCpus' && (sortConfig.direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                            </th>
                            <th className="sortable-th" style={{ width: 130 }} onClick={() => handleSort('memoryGib')}>
                                Memory (GiB) {sortConfig.key === 'memoryGib' && (sortConfig.direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                            </th>
                            <th className="sortable-th" onClick={() => handleSort('linuxPrice')}>
                                Linux / hr {sortConfig.key === 'linuxPrice' && (sortConfig.direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                            </th>
                            <th className="sortable-th" onClick={() => handleSort('windowsPrice')}>
                                Windows / hr {sortConfig.key === 'windowsPrice' && (sortConfig.direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                            </th>
                            <th className="sortable-th" onClick={() => handleSort('bestRegion')}>
                                Best Region {sortConfig.key === 'bestRegion' && (sortConfig.direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                            </th>
                            <th className="sortable-th" onClick={() => handleSort('diffPercent')}>
                                Savings {sortConfig.key === 'diffPercent' && (sortConfig.direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {vmRows.map((vm, idx) => {
                            const staticSpec = lookupSpec(vm.skuName);
                            const vCpus = vm.vCpus ?? staticSpec?.vCpus;
                            const memGib = vm.memoryGib ?? staticSpec?.memory;
                            const vCpuFromStatic = vm.vCpus == null && staticSpec?.vCpus != null;
                            const memFromStatic = vm.memoryGib == null && staticSpec?.memory != null;
                            const isSelected = selectedSkus.includes(vm.skuName);
                            const tooltipLines = getTooltipLines(vm.skuName, { vCpus });
                            const isHovered = hoveredSku === vm.skuName;
                            const isEven = idx % 2 === 0;

                            return (
                                <tr
                                    key={vm.skuName}
                                    className={`vm-row ${isSelected ? 'selected' : ''} ${isEven ? 'even' : ''}`}
                                    onClick={() => toggleSelection(vm.skuName)}
                                >
                                    <td>
                                        <div className={`vm-checkbox ${isSelected ? 'checked' : ''}`}>
                                            {isSelected && <Check size={11} color="white" strokeWidth={3} />}
                                        </div>
                                    </td>
                                    <td className="sku-cell">
                                        <div
                                            className="sku-name-wrap"
                                            onMouseEnter={() => setHoveredSku(vm.skuName)}
                                            onMouseLeave={() => setHoveredSku(null)}
                                        >
                                            <span className="sku-name">{vm.skuName}</span>
                                            {(vm.canonicalName || staticSpec?.type) && (
                                                <span className="sku-type-badge">{vm.canonicalName || staticSpec?.type}</span>
                                            )}
                                            {isHovered && tooltipLines.length > 0 && (
                                                <VmTooltip lines={tooltipLines} />
                                            )}
                                        </div>
                                    </td>
                                    <td>
                                        <span className={`spec-val ${!vCpus ? 'spec-missing' : ''}`}>
                                            {vCpus != null ? (vCpuFromStatic ? `~${vCpus}` : vCpus) : 'â€”'}
                                        </span>
                                    </td>
                                    <td>
                                        <span className={`spec-val ${!memGib ? 'spec-missing' : ''}`}>
                                            {memGib != null ? (memFromStatic ? `~${memGib}` : memGib) : 'â€”'}
                                        </span>
                                    </td>
                                    <td className="price-cell">
                                        {vm.linuxPrice != null ? (
                                            <span className={`price-badge ${vm.linuxPrice < 0.1 ? 'price-green' : vm.linuxPrice < 0.5 ? 'price-blue' : 'price-default'}`}>
                                                {formatPrice(vm.linuxPrice, currency)}
                                            </span>
                                        ) : <span className="price-na">â€”</span>}
                                    </td>
                                    <td className="price-cell">
                                        {vm.windowsPrice != null ? (
                                            <span className="price-badge price-default">
                                                {formatPrice(vm.windowsPrice, currency)}
                                            </span>
                                        ) : <span className="price-na">â€”</span>}
                                    </td>
                                    <td>
                                        <div className="best-region-cell">
                                            <span className="best-region-name">{vm.bestRegion || 'â€”'}</span>
                                        </div>
                                    </td>
                                    <td>
                                        {vm.diffPercent > 0 ? (
                                            <span className="savings-badge">-{vm.diffPercent}%</span>
                                        ) : <span className="price-na">â€”</span>}
                                    </td>
                                </tr>
                            );
                        })}

                        {/* Skeleton loading rows */}
                        {loading && Array.from({ length: 8 }).map((_, i) => (
                            <tr key={`skel-${i}`} className="vm-row skeleton-row">
                                <td><div className="skel-box" style={{ width: 20, height: 20, borderRadius: 4 }} /></td>
                                <td><div className="skel-box" style={{ width: `${100 + (i % 3) * 40}px`, height: 14 }} /></td>
                                <td><div className="skel-box" style={{ width: 30, height: 14 }} /></td>
                                <td><div className="skel-box" style={{ width: 40, height: 14 }} /></td>
                                <td><div className="skel-box" style={{ width: 70, height: 22, borderRadius: 12 }} /></td>
                                <td><div className="skel-box" style={{ width: 70, height: 22, borderRadius: 12 }} /></td>
                                <td><div className="skel-box" style={{ width: 80, height: 14 }} /></td>
                                <td><div className="skel-box" style={{ width: 40, height: 18, borderRadius: 10 }} /></td>
                            </tr>
                        ))}

                        {!loading && vmRows.length === 0 && (
                            <tr>
                                <td colSpan={8} className="vm-empty-state">
                                    <SlidersHorizontal size={32} strokeWidth={1} />
                                    <p>No VMs found matching your filters</p>
                                    <span>Try adjusting the vCPU, Memory, or search filters above</span>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {loadError && (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#ef4444' }}>
                    <p>Failed to load VM data: {loadError}</p>
                    <button className="btn-secondary" onClick={() => window.location.reload()}>Retry</button>
                </div>
            )}

            {/* "€"€ Selection bar "€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€ */}
            {selectedSkus.length > 0 && (
                <div className="compare-bar">
                    <div className="compare-bar-info">
                        <div className="compare-count-pill">{selectedSkus.length} / 2</div>
                        <div className="compare-selected-names">
                            {selectedSkus.map(s => (
                                <span key={s} className="compare-sku-chip">
                                    {s}
                                    <button onClick={e => { e.stopPropagation(); handleDeselect(s); }}><X size={11} /></button>
                                </span>
                            ))}
                        </div>
                    </div>
                    <div className="compare-bar-actions">
                        <button className="compare-bar-clear-btn" onClick={handleClear}>Clear</button>
                        <button
                            className="compare-bar-btn pricing"
                            disabled={selectedSkus.length < 2}
                            onClick={handleComparePricing}
                        >
                            Compare Pricing
                        </button>
                        <button
                            className="compare-bar-btn specs"
                            disabled={selectedSkus.length < 2}
                            onClick={() => setIsComparing(true)}
                        >
                            Compare Specs
                        </button>
                    </div>
                </div>
            )}

            {/* "€"€ Pricing Compare Modal "€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€"€ */}
            {showPricingCard && (
                <div className="modal-overlay" onClick={() => setShowPricingCard(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>Pricing Comparison <span className="modal-currency-badge">{currency}</span></h2>
                            <div className="modal-header-controls">
                                <select
                                    className="ctrl-select"
                                    value={pricingPeriod}
                                    onChange={(e) => setPricingPeriod(e.target.value)}
                                >
                                    <option value="monthly">Monthly (730h)</option>
                                    <option value="hourly">Hourly</option>
                                    <option value="custom">Custom Hours</option>
                                </select>
                                {pricingPeriod === 'custom' && (
                                    <input
                                        type="number"
                                        className="filter-range-input"
                                        style={{ width: '80px' }}
                                        value={customHours === 0 ? '' : customHours}
                                        onChange={(e) => setCustomHours(Number(e.target.value) || 0)}
                                        min="1"
                                    />
                                )}
                                <button className="modal-close-btn" onClick={() => setShowPricingCard(false)}><X size={18} /></button>
                            </div>
                        </div>
                        {pricingLoading ? (
                            <div style={{ textAlign: 'center', padding: '50px 0' }}>
                                <div className="spinner" style={{ margin: '0 auto' }} />
                            </div>
                        ) : pricingData ? (
                            <table className="vm-table" style={{ margin: 0 }}>
                                <thead>
                                    <tr>
                                        <th style={{ width: '160px' }}>Region</th>
                                        {pricingData.skus.map(sku => <th key={sku}>{sku}</th>)}
                                    </tr>
                                </thead>
                                <tbody>
                                    {pricingData.items.map(row => (
                                        <tr key={row.region}>
                                            <td className="region-label-cell">
                                                {row.region.replace(/([A-Z])/g, ' $1').trim()}
                                            </td>
                                            {pricingData.skus.map(sku => {
                                                const price = row[sku];
                                                const mult = pricingPeriod === 'monthly' ? 730 : pricingPeriod === 'hourly' ? 1 : customHours;
                                                const suffix = pricingPeriod === 'monthly' ? '/mo' : pricingPeriod === 'hourly' ? '/hr' : `/${customHours}h`;
                                                return (
                                                    <td key={sku} className="price-cell">
                                                        {price ? (
                                                            <div>
                                                                <div className="modal-price-row">
                                                                    <span className="price-badge price-green">{formatPrice(price.linuxPrice * mult, pricingData.currency)}</span>
                                                                    <span className="modal-price-label">{suffix} Linux</span>
                                                                </div>
                                                                <div className="modal-price-row" style={{ marginTop: 6 }}>
                                                                    <span className="price-badge price-default">{formatPrice(price.windowsPrice * mult, pricingData.currency)}</span>
                                                                    <span className="modal-price-label">{suffix} Win</span>
                                                                </div>
                                                            </div>
                                                        ) : <span className="price-na">â€”</span>}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                    {pricingData.items.length === 0 && (
                                        <tr><td colSpan={pricingData.skus.length + 1} style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)' }}>
                                            No pricing data available for selected regions.
                                        </td></tr>
                                    )}
                                </tbody>
                            </table>
                        ) : null}
                    </div>
                </div>
            )}
        </div>
    );
}
