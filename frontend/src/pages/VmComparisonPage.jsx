import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, ArrowLeft, X, Check, ChevronDown, Download, SlidersHorizontal, Info, ArrowUp, ArrowDown } from 'lucide-react';
import { useEstimate } from '../context/EstimateContext';
import { fetchVmList, fetchVmPricingCompare, formatPrice, SUPPORTED_CURRENCIES, fetchBestVmPrices } from '../services/azurePricingApi';
import { AZURE_REGIONS } from '../data/serviceCatalog';

// ── Helpers ──────────────────────────────────────────────────────

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

function getTooltipLines(skuName) {
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
    return lines;
}

// ── Tooltip component ────────────────────────────────────────────"─
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

// ── Compare View Removed ──────────────────────────────────────────

// ── Main Page ────────────────────────────────────────────────────"─
export default function VmComparisonPage() {
    const { region, currency, setCurrency } = useEstimate();

    const [searchQuery, setSearchQuery] = useState('');
    const [visibleCount, setVisibleCount] = useState(100);
    const [allVms, setAllVms] = useState([]);       // all VMs loaded from backend
    const [vmRows, setVmRows] = useState([]);         // filtered view shown in table
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(null);
    const [sortConfig, setSortConfig] = useState({ key: 'linuxPrice', direction: 'asc' });
    const [selectedSkus, setSelectedSkus] = useState([]);

    const observer = useRef();
    const lastRowRef = useCallback(node => {
        if (loading) return;
        if (observer.current) observer.current.disconnect();
        observer.current = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting && visibleCount < vmRows.length) {
                setVisibleCount(prev => prev + 100);
            }
        });
        if (node) observer.current.observe(node);
    }, [loading, visibleCount, vmRows.length]);

    const [showPricingCard, setShowPricingCard] = useState(false);
    const [pricingPeriod, setPricingPeriod] = useState('monthly');
    const [customHours, setCustomHours] = useState(730);
    const [pricingData, setPricingData] = useState(null);
    const [pricingLoading, setPricingLoading] = useState(false);

    const [lastUpdate, setLastUpdate] = useState(null);
    const [hoveredSku, setHoveredSku] = useState(null);
    const [bestPrices, setBestPrices] = useState({});

    // Fetch optimal prices
    useEffect(() => {
        let cancelled = false;
        fetchBestVmPrices(currency).then(data => {
            if (cancelled) return;
            const priceMap = {};
            (data.items || []).forEach(item => {
                const skuKey = `Standard_${item.skuName.trim().replace(/\s+/g, '_')}`;
                priceMap[skuKey] = { minPrice: item.minPrice, region: item.region };
            });
            setBestPrices(priceMap);
        }).catch(err => console.error("Failed to load best prices:", err));
        return () => { cancelled = true; };
    }, [currency]);

    // Fetch last sync time once
    useEffect(() => {
        const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
        fetch(`${apiBase}/health`)
            .then(r => r.json())
            .then(d => {
                if (d.lastSync?.completedAt) {
                    setLastUpdate(new Date(d.lastSync.completedAt));
                } else {
                    setLastUpdate('unknown');
                }
            })
            .catch(() => { setLastUpdate('unknown'); });
    }, []);

    // Fetch ALL VMs when region or currency changes (only two triggers)
    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setLoadError(null);
        setAllVms([]);
        setVmRows([]);

        fetchVmList({ currency, region, limit: 5000, offset: 0 })
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

        let rows = allVms;

        if (q) {
            // strip 'standard_' prefix so 'd4s' matches 'Standard_D4s_v3'
            const term = q.startsWith('standard_') ? q.slice(9) : q;
            rows = rows.filter(vm => vm.skuName.toLowerCase().includes(term));
        }

        // Apply best region and discount mapping
        rows = rows.map(vm => {
            const best = bestPrices[vm.skuName];
            let bestRegion = '';
            let isCurrent = false;
            let diffPercent = 0;

            if (best && vm.linuxPrice != null) {
                if (best.minPrice < vm.linuxPrice * 0.99) {
                    bestRegion = best.region;
                    diffPercent = Math.round(((vm.linuxPrice - best.minPrice) / vm.linuxPrice) * 100);
                } else if (vm.linuxPrice <= best.minPrice * 1.01) {
                    // Current region IS the best — show it with "(Current)" label
                    bestRegion = best.region;
                    isCurrent = true;
                } else {
                    bestRegion = best.region;
                }
            } else if (best && vm.linuxPrice == null) {
                bestRegion = best.region;
            }

            return { ...vm, bestRegion, isCurrent, diffPercent };
        });

        rows.sort((a, b) => {
            const getVal = (vm, key) => {
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
        setVisibleCount(100);
    }, [allVms, searchQuery, sortConfig, bestPrices]);

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
            if (prev.length >= 5) return prev;
            return [...prev, sku];
        });
    };

    const handleDeselect = (sku) => {
        setSelectedSkus(prev => prev.filter(s => s !== sku));
    };

    const handleClear = () => {
        setSelectedSkus([]);
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

    return (
        <div className="vm-page content-area">
            {/* ── Hero ──────────────────────────────────────────── */}
            <div className="vm-hero-block">
                <div className="vm-hero-top">
                    <div>
                        <h1 className="vm-hero-title">Azure VM Pricing</h1>
                        <p className="vm-hero-subtitle">
                            {allVms.length > 0 && !loading ? <><strong>{allVms.length}</strong> VMs{vmRows.length < allVms.length ? ` · ${vmRows.length} filtered` : ''} · </> : ''}
                            <span className="vm-update-chip">
                                {lastUpdate instanceof Date ? `Updated ${lastUpdate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : (lastUpdate === 'unknown' ? '' : 'Loading data...')}
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
                    Browse and compare Azure Virtual Machines strictly on price. Select up to 5 VMs to compare global regional pricing side-by-side.
                </p>
            </div>

            {/* ── Controls bar ──────────────────────────────────── */}
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

            {/* ── Filter row ────────────────────────────────────── */}
            <div className="vm-filter-row">
                <div className="vm-search-wrap" style={{ flex: 1, maxWidth: '500px' }}>
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
            </div>

            {/* ── VM Table ──────────────────────────────────────── */}
            <div className="vm-table-container">
                <table className="vm-table">
                    <thead>
                        <tr>
                            <th style={{ width: 36 }}></th>
                            <th className="sortable-th" onClick={() => handleSort('skuName')}>
                                VM Name {sortConfig.key === 'skuName' && (sortConfig.direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
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
                        {vmRows.slice(0, visibleCount).map((vm, idx) => {
                            const isSelected = selectedSkus.includes(vm.skuName);
                            const tooltipLines = getTooltipLines(vm.skuName);
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
                                            {vm.canonicalName && (
                                                <span className="sku-type-badge">{vm.canonicalName}</span>
                                            )}
                                            {isHovered && tooltipLines.length > 0 && (
                                                <VmTooltip lines={tooltipLines} />
                                            )}
                                        </div>
                                    </td>
                                    <td className="price-cell">
                                        {vm.linuxPrice != null ? (
                                            <span className={`price-badge ${vm.linuxPrice < 0.1 ? 'price-green' : vm.linuxPrice < 0.5 ? 'price-blue' : 'price-default'}`}>
                                                {formatPrice(vm.linuxPrice, currency)}
                                            </span>
                                        ) : <span className="price-na">—</span>}
                                    </td>
                                    <td className="price-cell">
                                        {vm.windowsPrice != null ? (
                                            <span className="price-badge price-default">
                                                {formatPrice(vm.windowsPrice, currency)}
                                            </span>
                                        ) : <span className="price-na">—</span>}
                                    </td>
                                    <td>
                                        <div className="best-region-cell">
                                            <span className="best-region-name">{vm.bestRegion || '—'}</span>
                                            {vm.isCurrent && (
                                                <span style={{
                                                    display: 'inline-block',
                                                    marginLeft: '6px',
                                                    padding: '1px 7px',
                                                    borderRadius: '20px',
                                                    fontSize: '0.7rem',
                                                    fontWeight: 600,
                                                    background: 'rgba(34, 197, 94, 0.15)',
                                                    color: 'rgb(34, 197, 94)',
                                                    border: '1px solid rgba(34, 197, 94, 0.3)',
                                                    letterSpacing: '0.03em'
                                                }}>Current</span>
                                            )}
                                        </div>
                                    </td>
                                    <td>
                                        {vm.diffPercent > 0 ? (
                                            <span className="savings-badge">-{vm.diffPercent}%</span>
                                        ) : <span className="price-na">—</span>}
                                    </td>
                                </tr>
                            );
                        })}

                        {loading && Array.from({ length: 8 }).map((_, i) => (
                            <tr key={`skel-${i}`} className="vm-row skeleton-row">
                                <td><div className="skel-box" style={{ width: 20, height: 20, borderRadius: 4 }} /></td>
                                <td><div className="skel-box" style={{ width: `${100 + (i % 3) * 40}px`, height: 14 }} /></td>
                                <td><div className="skel-box" style={{ width: 70, height: 22, borderRadius: 12 }} /></td>
                                <td><div className="skel-box" style={{ width: 70, height: 22, borderRadius: 12 }} /></td>
                                <td><div className="skel-box" style={{ width: 80, height: 14 }} /></td>
                                <td><div className="skel-box" style={{ width: 40, height: 18, borderRadius: 10 }} /></td>
                            </tr>
                        ))}

                        {!loading && vmRows.length === 0 && (
                            <tr>
                                <td colSpan={6} className="vm-empty-state">
                                    <SlidersHorizontal size={32} strokeWidth={1} />
                                    <p>No VMs found matching your filters</p>
                                    <span>Try adjusting the vCPU, Memory, or search filters above</span>
                                </td>
                            </tr>
                        )}
                        {!loading && visibleCount < vmRows.length && (
                            <tr ref={lastRowRef}>
                                <td colSpan={6} style={{ height: '40px' }}></td>
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

            {selectedSkus.length > 0 && (
                <div className="compare-bar">
                    <div className="compare-bar-info">
                        <div className="compare-count-pill">{selectedSkus.length} / 5</div>
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
                    </div>
                </div>
            )}

            {/* ── Pricing Compare Modal ──────────────────────────"─ */}
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
                                                        ) : <span className="price-na">—</span>}
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
