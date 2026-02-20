import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, ArrowLeft, X, Check, ChevronDown, Download, SlidersHorizontal, Info } from 'lucide-react';
import { useEstimate } from '../context/EstimateContext';
import { VM_SPECS } from '../data/vmSpecs';
import { fetchVmList, fetchVmComparison, fetchVmPricingCompare, formatPrice, SUPPORTED_CURRENCIES } from '../services/azurePricingApi';
import { AZURE_REGIONS } from '../data/serviceCatalog';

// ── Helpers ──────────────────────────────────────────────────────

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
    A: 'A — Entry-level VMs for dev/test',
    B: 'B — Burstable economical VMs',
    D: 'D — General purpose with balanced performance',
    E: 'E — Memory optimized with high memory-to-CPU',
    F: 'F — Compute optimized with high CPU-to-memory',
    G: 'G — Memory and storage optimized',
    H: 'H — High performance computing',
    L: 'L — Storage optimized with high disk throughput',
    M: 'M — Memory optimized with ultra high core count',
    N: 'N — GPU enabled VMs',
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
        if (vcpuMatch) lines.push(`${vcpuMatch[2]} — The number of vCPUs`);
    }
    const vPart = parts.find(p => /^v\d+$/i.test(p));
    if (vPart) lines.push(`${vPart} — version`);
    if (spec?.vCpus && !lines.some(l => l.includes('vCPUs'))) {
        lines.push(`${spec.vCpus} — The number of vCPUs`);
    }
    return lines;
}

// ── Tooltip component ─────────────────────────────────────────────
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

// ── Compare View ──────────────────────────────────────────────────
function CompareView({ selectedSkus, vmRows = [], onBack, onDeselect, currency, setCurrency }) {
    const [os, setOs] = useState('linux');
    const [compareData, setCompareData] = useState(null);
    const [loading, setLoading] = useState(true);

    // Build a map from skuName → API row data (has vCpus, memoryGib, etc. from DB)
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
                        {specRow('vCPUs', sku => getSpec(sku).vCpus ?? '—')}
                        {specRow('CPU Architecture', sku => getSpec(sku).architecture || 'x64')}
                        {specRow('Memory (GiB)', sku => getSpec(sku).memoryGib ?? '—')}
                        {specRow('Hyper-V Generations', sku => getSpec(sku).hyperVGen || 'V1')}
                        {specRow('ACUs', sku => getSpec(sku).acus ?? '—')}
                        {specRow('GPUs', sku => getSpec(sku).gpus ?? 0)}

                        <tr className="section-row"><td colSpan={selectedSkus.length + 1}>Network & Disk</td></tr>
                        {specRow('Max Network Interfaces', sku => getSpec(sku).maxNics ?? '—')}
                        {specRow('RDMA Enabled', sku => <BoolCell value={getSpec(sku).rdma} />)}
                        {specRow('Accelerated Net', sku => <BoolCell value={getSpec(sku).acceleratedNet} />)}
                        {specRow('OS Disk Size', sku => {
                            const s = getSpec(sku);
                            return s.osDiskSizeMb ? `${(s.osDiskSizeMb / 1024).toFixed(0)} GiB` : '—';
                        })}
                        {specRow('Res Disk Size', sku => {
                            const s = getSpec(sku);
                            return s.resDiskSizeMb ? `${(s.resDiskSizeMb / 1024).toFixed(0)} GiB` : '—';
                        })}
                        {specRow('Max Data Disks', sku => getSpec(sku).maxDisks ?? '—')}
                        {specRow('Support Premium Disk', sku => <BoolCell value={getSpec(sku).premiumDisk} />)}
                        {specRow('Combined IOPS', sku => getSpec(sku).combinedIops ?? '—', "Combined IOPS is a sum of all attached disk's IOPs")}
                        {specRow('Uncached Disk IOPS', sku => getSpec(sku).uncachedIops ?? '—')}
                        {specRow('Combined Write Throughput', sku => {
                            const bytes = getSpec(sku).combinedWriteBytes;
                            return bytes ? `${(bytes / 1048576).toFixed(0)} MiB/s` : '—';
                        }, "Combined Write is a sum of all attached disk's write throughput")}
                        {specRow('Combined Read Throughput', sku => {
                            const bytes = getSpec(sku).combinedReadBytes;
                            return bytes ? `${(bytes / 1048576).toFixed(0)} MiB/s` : '—';
                        }, "Combined Read is a sum of all attached disk's read throughput")}

                        <tr className="section-row"><td colSpan={selectedSkus.length + 1}>Price Summary</td></tr>
                        <tr>
                            <td className="label-col">Perf Score Ratio</td>
                            {selectedSkus.map(sku => {
                                const score = getSpec(sku)?.perfScore || 1;
                                return <td key={sku}><strong>{firstSkuScore > 0 ? (score / firstSkuScore).toFixed(2) : '—'}x</strong></td>;
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
                                                {entry ? formatPrice(entry.price, currency) : <span className="text-muted">—</span>}
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

// ── Main Page ─────────────────────────────────────────────────────
export default function VmComparisonPage() {
    const { region, currency, setCurrency } = useEstimate();

    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [vmRows, setVmRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [offset, setOffset] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [selectedSkus, setSelectedSkus] = useState([]);
    const [isComparing, setIsComparing] = useState(false);
    const [showPricingCard, setShowPricingCard] = useState(false);
    const [pricingPeriod, setPricingPeriod] = useState('monthly'); // 'monthly', 'hourly', or 'custom'
    const [customHours, setCustomHours] = useState(730);
    const [pricingData, setPricingData] = useState(null);
    const [pricingLoading, setPricingLoading] = useState(false);

    // Hardware Filters
    const [minVcpu, setMinVcpu] = useState('');
    const [maxVcpu, setMaxVcpu] = useState('');
    const [minMemory, setMinMemory] = useState('');
    const [maxMemory, setMaxMemory] = useState('');

    // Debounced Filter State
    const [debouncedFilters, setDebouncedFilters] = useState({
        search: '', minVcpu: '', maxVcpu: '', minMemory: '', maxMemory: ''
    });

    const [lastUpdate, setLastUpdate] = useState(null);
    const [hoveredSku, setHoveredSku] = useState(null);
    const LIMIT = 100;

    const searchTimeout = useRef(null);

    // Unified debouncer for all filters
    useEffect(() => {
        clearTimeout(searchTimeout.current);
        searchTimeout.current = setTimeout(() => {
            setDebouncedFilters({
                search: searchQuery,
                minVcpu, maxVcpu, minMemory, maxMemory
            });
            setOffset(0);
            setVmRows([]);
        }, 500);
        return () => clearTimeout(searchTimeout.current);
    }, [searchQuery, minVcpu, maxVcpu, minMemory, maxMemory]);

    useEffect(() => {
        const apiBase = import.meta.env.VITE_API_URL || '/azproxy';
        fetch(`${apiBase}/health`)
            .then(r => r.json())
            .then(d => {
                if (d.lastSync?.completedAt) setLastUpdate(new Date(d.lastSync.completedAt));
            })
            .catch(() => { });
    }, []);

    const loadRows = useCallback(async (currentOffset, reset = false) => {
        setLoading(true);
        try {
            const data = await fetchVmList({
                currency,
                region,
                search: debouncedFilters.search,
                minVcpu: debouncedFilters.minVcpu,
                maxVcpu: debouncedFilters.maxVcpu,
                minMemory: debouncedFilters.minMemory,
                maxMemory: debouncedFilters.maxMemory,
                limit: LIMIT,
                offset: currentOffset,
            });
            const newRows = data.items || [];
            setVmRows(prev => reset ? newRows : [...prev, ...newRows]);
            setHasMore(newRows.length === LIMIT);
        } catch (err) {
            console.error('Failed to load VM list', err);
        } finally {
            setLoading(false);
        }
    }, [currency, region, debouncedFilters]);

    useEffect(() => {
        setOffset(0);
        setVmRows([]);
        loadRows(0, true);
    }, [currency, region, debouncedFilters]);

    const loadMore = () => {
        const next = offset + LIMIT;
        setOffset(next);
        loadRows(next);
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
        : '—';

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
            {/* Hero */}
            <div className="vm-hero-block">
                <div className="vm-hero-top">
                    <h1 className="vm-hero-title">Azure VM Comparison</h1>
                    <div className="vm-hero-badges">
                        <button className="vm-badge-btn">
                            <Download size={13} /> Batch Export API
                        </button>
                        <span className="vm-badge-text">Download complete pricing datasets</span>
                    </div>
                </div>
                <p className="vm-hero-desc">
                    Discover and compare Azure Virtual Machines, Amazon EC2, and GCP instance specifications and pricing
                    across multiple tiers, payment options, and geographical regions, all on one comprehensive page.
                    Use the 'Best Price Region' feature to quickly find where a specific VM offers the greatest value.
                    For insights on optimizing cost vs. performance, visit our price/performance analysis page.
                </p>
                <p className="vm-hero-disclaimer">
                    The data is frequently updated from the Azure API, but may not be accurate. This site is not affiliated
                    with Microsoft or Azure. The latest update occurred on <strong>{updateDate} UTC</strong>
                </p>
            </div>

            {/* Controls bar */}
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
                    <span className="ctrl-pill">Per Hour</span>
                    <span className="ctrl-divider" />
                    <span className="ctrl-pill">Standard</span>
                    <span className="ctrl-divider" />
                    <span className="ctrl-pill highlight">Pay-as-you-go</span>
                </div>
            </div>

            {/* Filter row */}
            <div className="vm-filter-row">
                <div className="vm-stat-group" style={{ display: 'flex', gap: '16px' }}>
                    <div className="vm-stat-chip" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="stat-label">vCPUs:</span>
                        <input type="number" className="input-control" placeholder="Min" value={minVcpu} onChange={e => setMinVcpu(e.target.value)} style={{ width: '60px', padding: '4px 8px' }} />
                        <span className="stat-range">to</span>
                        <input type="number" className="input-control" placeholder="Max" value={maxVcpu} onChange={e => setMaxVcpu(e.target.value)} style={{ width: '60px', padding: '4px 8px' }} />
                    </div>
                    <div className="vm-stat-chip" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="stat-label">Memory (GiB):</span>
                        <input type="number" className="input-control" placeholder="Min" value={minMemory} onChange={e => setMinMemory(e.target.value)} style={{ width: '60px', padding: '4px 8px' }} />
                        <span className="stat-range">to</span>
                        <input type="number" className="input-control" placeholder="Max" value={maxMemory} onChange={e => setMaxMemory(e.target.value)} style={{ width: '60px', padding: '4px 8px' }} />
                    </div>
                </div>
                <div className="vm-search-wrap">
                    <Search size={15} className="search-icon" />
                    <input
                        type="text"
                        className="vm-search-input"
                        placeholder="Filter by Name or Series"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                    />
                </div>
                <button className="columns-btn">
                    <SlidersHorizontal size={14} /> Columns <ChevronDown size={12} />
                </button>
            </div>

            {/* VM Table — full width, no outer margin */}
            <div className="vm-table-container">
                <table className="vm-table">
                    <thead>
                        <tr>
                            <th style={{ width: 36 }}></th>
                            <th>VM Name</th>
                            <th>vCPUs</th>
                            <th>Memory (GiB)</th>
                            <th>Linux Price</th>
                            <th>Windows Price</th>
                            <th>Alternative VMs</th>
                            <th>Savings Options</th>
                            <th>Best Price Region / Diff</th>
                        </tr>
                    </thead>
                    <tbody>
                        {vmRows.map(vm => {
                            const spec = lookupSpec(vm.skuName);
                            const isSelected = selectedSkus.includes(vm.skuName);
                            const tooltipLines = getTooltipLines(vm.skuName, spec);
                            const isHovered = hoveredSku === vm.skuName;

                            return (
                                <tr
                                    key={vm.skuName}
                                    className={isSelected ? 'selected' : ''}
                                    onClick={() => toggleSelection(vm.skuName)}
                                >
                                    <td>
                                        <div className={`checkbox ${isSelected ? 'checked' : ''}`}>
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
                                            {(vm.canonicalName || spec?.type) && (
                                                <span className="sku-type">{vm.canonicalName || spec.type}</span>
                                            )}
                                            {isHovered && tooltipLines.length > 0 && (
                                                <VmTooltip lines={tooltipLines} />
                                            )}
                                        </div>
                                    </td>
                                    <td>{vm.vCpus ?? spec?.vCpus ?? <span className="text-muted">—</span>}</td>
                                    <td>{vm.memoryGib ?? spec?.memory ?? <span className="text-muted">—</span>}</td>
                                    <td className="price-cell">
                                        {vm.linuxPrice != null
                                            ? <span className="price-val">{formatPrice(vm.linuxPrice, currency)}</span>
                                            : <span className="price-na">—</span>}
                                    </td>
                                    <td className="price-cell">
                                        {vm.windowsPrice != null
                                            ? <span className="price-val">{formatPrice(vm.windowsPrice, currency)}</span>
                                            : <span className="price-na">—</span>}
                                    </td>
                                    <td>
                                        <button className="link-btn" onClick={e => e.stopPropagation()}>find better</button>
                                    </td>
                                    <td>
                                        <button className="link-btn" onClick={e => e.stopPropagation()}>compare</button>
                                    </td>
                                    <td>
                                        <div className="best-region-cell">
                                            <span className="best-region-name">{vm.bestRegion || '—'}</span>
                                            {vm.diffPercent > 0 && (
                                                <span className="diff-badge">/ -{vm.diffPercent}%</span>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}

                        {loading && (
                            <tr>
                                <td colSpan={9} style={{ textAlign: 'center', padding: 28 }}>
                                    <div className="spinner" style={{ margin: '0 auto' }} />
                                </td>
                            </tr>
                        )}
                        {!loading && vmRows.length === 0 && (
                            <tr>
                                <td colSpan={9} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                                    No VMs found
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {hasMore && !loading && (
                <div style={{ textAlign: 'center', padding: '16px 40px' }}>
                    <button className="btn-secondary" onClick={loadMore} style={{ padding: '8px 28px' }}>
                        Load More
                    </button>
                </div>
            )}

            {/* Selection bar */}
            {selectedSkus.length > 0 && (
                <div className="compare-bar">
                    <div className="compare-bar-info">
                        <span className="compare-count">{selectedSkus.length} selected</span>
                        <span className="compare-hint">{selectedSkus.join(', ')}</span>
                    </div>
                    <div className="compare-bar-actions">
                        <button className="btn-secondary" onClick={handleClear} style={{ padding: '8px 18px' }}>
                            Clear
                        </button>
                        <button
                            className="compare-btn"
                            disabled={selectedSkus.length < 2}
                            onClick={handleComparePricing}
                            style={{ marginRight: '10px', background: 'var(--success)', borderColor: 'var(--success)' }}
                        >
                            Compare Pricing
                        </button>
                        <button
                            className="compare-btn"
                            disabled={selectedSkus.length < 2}
                            onClick={() => setIsComparing(true)}
                        >
                            Compare Specs
                        </button>
                    </div>
                </div>
            )}

            {/* Pricing Compare Modal Overlay */}
            {showPricingCard && (
                <div className="modal-overlay" onClick={() => setShowPricingCard(false)} style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{
                        background: 'var(--bg-card)', padding: '24px 32px', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: '800px', boxShadow: '0 10px 40px rgba(0,0,0,0.2)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                            <h2 style={{ fontSize: '1.4rem', color: 'var(--text-primary)' }}>Pricing Comparison ({currency})</h2>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <select
                                    className="select-control"
                                    style={{ padding: '6px 30px 6px 12px', fontSize: '0.85rem' }}
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
                                        className="input-control"
                                        style={{ width: '80px', padding: '6px 12px', fontSize: '0.85rem' }}
                                        value={customHours === 0 ? '' : customHours}
                                        onChange={(e) => setCustomHours(Number(e.target.value) || 0)}
                                        min="1"
                                    />
                                )}
                                <button className="link-btn" style={{ marginLeft: '8px' }} onClick={() => setShowPricingCard(false)}><X size={20} color="var(--text-muted)" /></button>
                            </div>
                        </div>
                        {pricingLoading ? (
                            <div style={{ textAlign: 'center', padding: '40px 0' }}><div className="spinner" style={{ margin: '0 auto' }} /></div>
                        ) : pricingData ? (
                            <table className="vm-table" style={{ margin: 0, border: '1px solid var(--border-primary)', borderBottom: 'none' }}>
                                <thead>
                                    <tr>
                                        <th style={{ width: '150px' }}>Region</th>
                                        {pricingData.skus.map(sku => <th key={sku}>{sku}</th>)}
                                    </tr>
                                </thead>
                                <tbody>
                                    {pricingData.items.map(row => (
                                        <tr key={row.region}>
                                            <td style={{ fontWeight: 600, textTransform: 'capitalize' }}>
                                                {row.region.replace(/([A-Z])/g, ' $1').trim()}
                                            </td>
                                            {pricingData.skus.map(sku => {
                                                const price = row[sku];
                                                const multiplier = pricingPeriod === 'monthly' ? 730 : pricingPeriod === 'hourly' ? 1 : customHours;
                                                const suffix = pricingPeriod === 'monthly' ? '/mo' : pricingPeriod === 'hourly' ? '/hr' : `/${customHours}h`;

                                                return (
                                                    <td key={sku} className="price-cell">
                                                        {price ? (
                                                            <div>
                                                                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                                                    {formatPrice(price.linuxPrice * multiplier, pricingData.currency)} <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>{suffix} (Linux)</span>
                                                                </div>
                                                                <div style={{ marginTop: 6, fontWeight: 600, color: 'var(--text-primary)' }}>
                                                                    {formatPrice(price.windowsPrice * multiplier, pricingData.currency)} <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>{suffix} (Win)</span>
                                                                </div>
                                                            </div>
                                                        ) : <span className="text-muted">—</span>}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                    {pricingData.items.length === 0 && (
                                        <tr>
                                            <td colSpan={pricingData.skus.length + 1} style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)' }}>
                                                No pricing data available for selected regions.
                                            </td>
                                        </tr>
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
