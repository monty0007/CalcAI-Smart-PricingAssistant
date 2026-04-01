import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, Check, SlidersHorizontal, ArrowUp, ArrowDown, Server } from 'lucide-react';
import { useEstimate } from '../context/EstimateContext';
import { fetchVmList, fetchVmPricingCompare, formatPrice, SUPPORTED_CURRENCIES, fetchBestVmPrices } from '../services/azurePricingApi';

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
        const vcpuMatch = parts[0].match(/([A-Za-z]+)(\d+)/);
        if (vcpuMatch) lines.push(`${vcpuMatch[2]} — The number of vCPUs`);
    }
    const vPart = parts.find(p => /^v\d+$/i.test(p));
    if (vPart) lines.push(`${vPart} — version`);
    return lines;
}

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

// ── Main Page ────────────────────────────────────────────────────
export default function VmComparisonPage() {
    const { region, currency, setCurrency } = useEstimate();

    const [searchQuery, setSearchQuery] = useState('');
    const [visibleCount, setVisibleCount] = useState(100);
    const [allVms, setAllVms] = useState([]);
    const [vmRows, setVmRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(null);
    const [sortConfig, setSortConfig] = useState({ key: 'linuxPrice', direction: 'asc' });
    const [selectedSkus, setSelectedSkus] = useState([]);

    const [showPricingCard, setShowPricingCard] = useState(false);
    const [pricingPeriod, setPricingPeriod] = useState('monthly');
    const [customHours, setCustomHours] = useState(730);
    const [pricingData, setPricingData] = useState(null);
    const [pricingLoading, setPricingLoading] = useState(false);

    const [hoveredSku, setHoveredSku] = useState(null);
    const [bestPrices, setBestPrices] = useState({});

    // Infinite scroll sentinel ref
    const sentinelRef = useRef(null);

    // IntersectionObserver for infinite scroll
    const loadMore = useCallback(() => {
        setVisibleCount(prev => {
            if (prev >= vmRows.length) return prev;
            return prev + 100;
        });
    }, [vmRows.length]);

    useEffect(() => {
        const sentinel = sentinelRef.current;
        if (!sentinel) return;
        const observer = new IntersectionObserver(
            ([entry]) => { if (entry.isIntersecting) loadMore(); },
            { rootMargin: '200px' }
        );
        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [loadMore]);

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

    // Fetch ALL VMs in one shot
    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setLoadError(null);
        setAllVms([]);
        setVmRows([]);

        fetchVmList({ currency, region })
            .then(data => {
                if (cancelled) return;
                setAllVms(data.items || []);
                setLoading(false);
            })
            .catch(err => {
                if (!cancelled) {
                    setLoadError(err.message || 'Failed to load VM list');
                    setLoading(false);
                }
            });

        return () => { cancelled = true; };
    }, [currency, region]);

    // Client-side filter + sort
    useEffect(() => {
        const q = searchQuery.trim().toLowerCase();
        let rows = allVms;

        if (q) {
            const term = q.startsWith('standard_') ? q.slice(9) : q;
            rows = rows.filter(vm => vm.skuName.toLowerCase().includes(term));
        }

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

    const SortIcon = ({ col }) => {
        if (sortConfig.key !== col) return null;
        return sortConfig.direction === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />;
    };

    return (
        <div className="vm-page content-area">
            {/* ── Header ──────────────────────────────────── */}
            <div className="vm-header-bar">
                <div className="vm-header-left">
                    <div className="vm-header-icon"><Server size={20} /></div>
                    <div>
                        <h1 className="vm-header-title">Azure VM Pricing</h1>
                        <p className="vm-header-sub">
                            Compare pay-as-you-go hourly pricing across all Azure VM sizes
                        </p>
                    </div>
                </div>
                <div className="vm-header-right">
                    <select className="ctrl-select" value={currency} onChange={e => setCurrency(e.target.value, [])}>
                        {SUPPORTED_CURRENCIES.map(c => (
                            <option key={c.code} value={c.code}>{c.code} ({c.symbol})</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* ── Search + Stats ───────────────────────────── */}
            <div className="vm-toolbar">
                <div className="vm-search-wrap">
                    <Search size={14} className="search-icon" />
                    <input
                        type="text"
                        className="vm-search-input"
                        placeholder="Search VMs  (e.g. D2s, B4ms, E8)"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                    />
                    {searchQuery && (
                        <button className="search-clear-btn" onClick={() => setSearchQuery('')}><X size={13} /></button>
                    )}
                </div>
                <div className="vm-stats-row">
                    {!loading && (
                        <>
                            <span className="vm-count-badge">{vmRows.length.toLocaleString()} VMs</span>
                            {vmRows.length < allVms.length && (
                                <span className="vm-filtered-note">of {allVms.length.toLocaleString()}</span>
                            )}
                            <span className="vm-showing-note">Showing {Math.min(visibleCount, vmRows.length).toLocaleString()}</span>
                        </>
                    )}
                </div>
            </div>

            {/* ── VM Table ──────────────────────────────────── */}
            <div className="vm-table-container">
                <table className="vm-table">
                    <thead>
                        <tr>
                            <th style={{ width: 36 }}></th>
                            <th className="sortable-th" onClick={() => handleSort('skuName')}>
                                VM Name <SortIcon col="skuName" />
                            </th>
                            <th className="sortable-th" onClick={() => handleSort('linuxPrice')}>
                                Linux / hr <SortIcon col="linuxPrice" />
                            </th>
                            <th className="sortable-th" onClick={() => handleSort('windowsPrice')}>
                                Windows / hr <SortIcon col="windowsPrice" />
                            </th>
                            <th className="sortable-th" onClick={() => handleSort('bestRegion')}>
                                Best Region <SortIcon col="bestRegion" />
                            </th>
                            <th className="sortable-th" onClick={() => handleSort('diffPercent')}>
                                Savings <SortIcon col="diffPercent" />
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {vmRows.slice(0, visibleCount).map((vm, idx) => {
                            const isSelected = selectedSkus.includes(vm.skuName);
                            const tooltipLines = getTooltipLines(vm.skuName);
                            const isHovered = hoveredSku === vm.skuName;

                            return (
                                <tr
                                    key={vm.skuName}
                                    className={`vm-row ${isSelected ? 'selected' : ''}`}
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
                                                <span className="current-region-tag">Current</span>
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
                                    <p>No VMs found matching your search</p>
                                    <span>Try a different search term</span>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>

                {/* Infinite scroll sentinel */}
                {!loading && visibleCount < vmRows.length && (
                    <div ref={sentinelRef} className="vm-scroll-sentinel">
                        <div className="spinner-small" />
                    </div>
                )}
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
