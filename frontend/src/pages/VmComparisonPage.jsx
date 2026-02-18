import { useState, useEffect, useMemo } from 'react';
import { Search, ArrowRight, TrendingDown, Server, Check, X, ChevronDown, ChevronUp, AlertCircle, Info } from 'lucide-react';
import { useEstimate } from '../context/EstimateContext';
import { VM_SPECS } from '../data/vmSpecs';
import { fetchBestVmPrices, fetchServicePricing, fetchVmRegionalPrices, formatPrice } from '../services/azurePricingApi';
import { AZURE_REGIONS } from '../data/serviceCatalog';

export default function VmComparisonPage() {
    const { region, currency } = useEstimate();
    const [searchQuery, setSearchQuery] = useState('');
    const [bestPrices, setBestPrices] = useState({});
    const [localPrices, setLocalPrices] = useState({});
    const [loading, setLoading] = useState(true);
    const [selectedWrappers, setSelectedWrappers] = useState(new Set());
    const [isComparing, setIsComparing] = useState(false);
    const [regionalPrices, setRegionalPrices] = useState({});
    const [loadingRegional, setLoadingRegional] = useState(false);

    // Load initial data
    useEffect(() => {
        let mounted = true;
        setLoading(true);

        const loadData = async () => {
            try {
                // Pre-compute normalization map
                const skuMap = {};
                Object.keys(VM_SPECS).forEach(key => {
                    const norm = key.replace('Standard_', '').replace(/_/g, ' ');
                    skuMap[norm] = key;
                    skuMap[key] = key;
                    // Also handle potential lower case DB
                    skuMap[norm.toLowerCase()] = key;
                });

                // 1. Fetch global best prices
                const best = await fetchBestVmPrices(currency);
                const bestMap = {};
                if (best && best.items) {
                    best.items.forEach(item => {
                        const originalName = item.skuName;
                        const key = skuMap[originalName] || skuMap[originalName.replace('Standard_', '').replace(/_/g, ' ')] || originalName;
                        bestMap[key] = { minPrice: item.minPrice, region: item.region };
                    });
                }

                // 2. Fetch prices for current region
                // The backend filtering for "search" might need adjustment if we want ALL consumption items 
                // but default limit is 500. Let's try to get more if needed.
                const local = await fetchServicePricing({
                    serviceName: 'Virtual Machines',
                    region,
                    currency,
                    type: 'Consumption',
                    limit: 'all' // Ensure we get everything
                });

                const localMap = {};
                if (local && local.Items) {
                    local.Items.forEach(item => {
                        const originalName = item.skuName;
                        // Try to map DB SKU to VM_SPECS key
                        const key = skuMap[originalName] || skuMap[originalName.replace(/_/g, ' ')] || originalName;

                        // Simple logic to find base Linux price (lowest for SKU)
                        if (!localMap[key] || item.retailPrice < localMap[key]) {
                            localMap[key] = item.retailPrice;
                        }
                    });
                }

                if (mounted) {
                    setBestPrices(bestMap);
                    setLocalPrices(localMap);
                    setLoading(false);
                }
            } catch (err) {
                console.error("Failed to load VM data", err);
                if (mounted) setLoading(false);
            }
        };

        loadData();
        return () => { mounted = false; };
    }, [region, currency]);

    // Fetch regional prices when entering comparison mode
    useEffect(() => {
        if (isComparing && selectedWrappers.size > 0) {
            setLoadingRegional(true);
            const selectedSkus = Array.from(selectedWrappers);

            Promise.all(selectedSkus.map(sku => fetchVmRegionalPrices(sku, currency)))
                .then(results => {
                    const priceMap = {}; // SKU -> Region -> Price

                    results.forEach((items, index) => {
                        const sku = selectedSkus[index];
                        if (!priceMap[sku]) priceMap[sku] = {};

                        items.forEach(item => {
                            // Assuming lowest price is base Linux
                            const regionName = item.armRegionName;
                            if (!priceMap[sku][regionName] || item.retailPrice < priceMap[sku][regionName]) {
                                priceMap[sku][regionName] = item.retailPrice;
                            }
                        });
                    });

                    setRegionalPrices(priceMap);
                    setLoadingRegional(false);
                })
                .catch(err => {
                    console.error("Failed to fetch regional prices", err);
                    setLoadingRegional(false);
                });
        }
    }, [isComparing, selectedWrappers, currency]);

    const vmRows = useMemo(() => {
        const allSkus = new Set([
            ...Object.keys(localPrices),
            ...Object.keys(bestPrices),
            ...Object.keys(VM_SPECS).filter(s => s.toLowerCase().includes(searchQuery.toLowerCase()))
        ]);

        return Array.from(allSkus).map(sku => {
            const specs = VM_SPECS[sku] || {
                vCpus: '?',
                memory: '?',
                type: 'General Purpose',
                score: 0
            };

            const localPrice = localPrices[sku] || null;
            const bestPriceData = bestPrices[sku] || null;
            const bestPrice = bestPriceData?.minPrice || null;
            const bestRegion = bestPriceData?.region || 'N/A';

            // Mock Windows price (usually ~1.8x Linux price for license)
            // Real implementation would fetch 'Windows' product names
            const windowsPrice = localPrice ? localPrice * 1.45 : null;

            let diffPercent = 0;
            if (localPrice && bestPrice && localPrice > bestPrice) {
                diffPercent = Math.round(((localPrice - bestPrice) / localPrice) * 100);
            }

            return {
                sku,
                ...specs,
                localPrice,
                windowsPrice,
                bestPrice,
                bestRegion,
                diffPercent
            };
        }).filter(row => {
            if (!searchQuery) return true;
            return row.sku.toLowerCase().includes(searchQuery.toLowerCase());
        }).filter(row => row.localPrice || row.bestPrice); // Only show existing VMs
    }, [localPrices, bestPrices, searchQuery]);

    const toggleSelection = (sku) => {
        const newSet = new Set(selectedWrappers);
        if (newSet.has(sku)) {
            newSet.delete(sku);
        } else {
            if (newSet.size >= 3) {
                // Don't add if already 3, maybe alert user?
                return;
            }
            newSet.add(sku);
        }
        setSelectedWrappers(newSet);
    };

    const handleClearSelection = () => {
        setSelectedWrappers(new Set());
        setIsComparing(false);
    };

    const getRegionName = (code) => {
        const r = AZURE_REGIONS.find(r => r.code === code);
        return r ? `${r.name} (${code})` : code;
    }

    // ── RENDER ───────────────────────────────────────────────────

    if (isComparing) {
        // Comparison View
        const selectedSkus = Array.from(selectedWrappers);
        return (
            <div className="vm-page main-layout">
                <div className="vm-header" style={{ marginBottom: '2rem' }}>
                    <button onClick={() => setIsComparing(false)} className="back-btn">
                        <ArrowRight size={16} style={{ transform: 'rotate(180deg)' }} /> Back to List
                    </button>
                    <h1>Compare Azure Virtual Machines</h1>
                </div>

                <div className="comparison-table-wrapper">
                    <table className="comparison-table">
                        <thead>
                            <tr>
                                <th className="label-col">Name</th>
                                {selectedSkus.map(sku => (
                                    <th key={sku} className="sku-header">
                                        <div className="header-content">
                                            <span className="sku-title">{sku}</span>
                                            <button className="remove-sku" onClick={() => toggleSelection(sku)}>
                                                <X size={14} />
                                            </button>
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            <tr className="section-header"><td colSpan={selectedSkus.length + 1}>Details</td></tr>

                            <tr>
                                <td className="label-col">Series Description</td>
                                {selectedSkus.map(sku => (
                                    <td key={sku}>{VM_SPECS[sku]?.type || 'N/A'}</td>
                                ))}
                            </tr>

                            <tr>
                                <td className="label-col">vCPUs</td>
                                {selectedSkus.map(sku => (
                                    <td key={sku}>{VM_SPECS[sku]?.vCpus}</td>
                                ))}
                            </tr>
                            <tr>
                                <td className="label-col">Architecture</td>
                                {selectedSkus.map(sku => (
                                    <td key={sku}>{VM_SPECS[sku]?.architecture || 'x64'}</td>
                                ))}
                            </tr>
                            <tr>
                                <td className="label-col">Memory (GiB)</td>
                                {selectedSkus.map(sku => (
                                    <td key={sku}>{VM_SPECS[sku]?.memory}</td>
                                ))}
                            </tr>
                            <tr>
                                <td className="label-col">Hyper-V Gen</td>
                                {selectedSkus.map(sku => (
                                    <td key={sku}>{VM_SPECS[sku]?.hyperVGen || 'V1'}</td>
                                ))}
                            </tr>
                            <tr>
                                <td className="label-col">ACUs</td>
                                {selectedSkus.map(sku => (
                                    <td key={sku}>{VM_SPECS[sku]?.acus || '100'}</td>
                                ))}
                            </tr>
                            <tr>
                                <td className="label-col">GPUs</td>
                                {selectedSkus.map(sku => (
                                    <td key={sku}>{VM_SPECS[sku]?.gpus || 0}</td>
                                ))}
                            </tr>

                            <tr className="section-header"><td colSpan={selectedSkus.length + 1}>Disk & Network</td></tr>

                            <tr>
                                <td className="label-col">Max Network Interfaces</td>
                                {selectedSkus.map(sku => (
                                    <td key={sku}>{VM_SPECS[sku]?.maxNics || 2}</td>
                                ))}
                            </tr>
                            <tr>
                                <td className="label-col">RDMA Enabled</td>
                                {selectedSkus.map(sku => (
                                    <td key={sku}>{VM_SPECS[sku]?.rdma ? 'Yes' : 'No'}</td>
                                ))}
                            </tr>
                            <tr>
                                <td className="label-col">Accelerated Net</td>
                                {selectedSkus.map(sku => (
                                    <td key={sku}>{VM_SPECS[sku]?.acceleratedNet ? 'Yes' : 'No'}</td>
                                ))}
                            </tr>
                            <tr>
                                <td className="label-col">OS Disk Size</td>
                                {selectedSkus.map(sku => (
                                    <td key={sku}>{VM_SPECS[sku]?.osDiskSize || '1023 GiB'}</td>
                                ))}
                            </tr>
                            <tr>
                                <td className="label-col">Res Disk Size</td>
                                {selectedSkus.map(sku => (
                                    <td key={sku}>{VM_SPECS[sku]?.resDiskSize || 'N/A'}</td>
                                ))}
                            </tr>
                            <tr>
                                <td className="label-col">Max Disks</td>
                                {selectedSkus.map(sku => (
                                    <td key={sku}>{VM_SPECS[sku]?.maxDisks || 2}</td>
                                ))}
                            </tr>
                            <tr>
                                <td className="label-col">Support Premium Disk</td>
                                {selectedSkus.map(sku => (
                                    <td key={sku}>{VM_SPECS[sku]?.premiumDisk ? 'Yes' : 'No'}</td>
                                ))}
                            </tr>
                            <tr>
                                <td className="label-col">
                                    Uncached Disk IOPS
                                    <p className="sub-label">Combined IOPS is a sum of all attached disk's IOPs</p>
                                </td>
                                {selectedSkus.map(sku => (
                                    <td key={sku}>{VM_SPECS[sku]?.uncachedIops || 'N/A'}</td>
                                ))}
                            </tr>
                            <tr>
                                <td className="label-col">
                                    Uncached Disk Throughput
                                    <p className="sub-label">Combined Write is a sum of all attached disk's write throughput</p>
                                </td>
                                {selectedSkus.map(sku => (
                                    <td key={sku}>{VM_SPECS[sku]?.uncacheThroughput || 'N/A'}</td>
                                ))}
                            </tr>

                            <tr className="section-header"><td colSpan={selectedSkus.length + 1}>Regional Prices ({currency}/hr)</td></tr>

                            {/* Regional Prices Logic */}
                            {loadingRegional ? (
                                <tr><td colSpan={selectedSkus.length + 1} style={{ textAlign: 'center', padding: '20px' }}>Loading prices...</td></tr>
                            ) : (
                                AZURE_REGIONS.map(r => {
                                    // Only show row if at least one VM has price
                                    const hasPrice = selectedSkus.some(sku => regionalPrices[sku] && regionalPrices[sku][r.code]);
                                    if (!hasPrice) return null;

                                    return (
                                        <tr key={r.code}>
                                            <td className="label-col">{r.name} <span className="text-muted">({r.code})</span></td>
                                            {selectedSkus.map(sku => {
                                                const price = regionalPrices[sku]?.[r.code];
                                                return (
                                                    <td key={sku} className={price ? '' : 'text-muted'}>
                                                        {price ? formatPrice(price, currency) : '—'}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    );
                                })
                            )}

                        </tbody>
                    </table>
                </div>
            </div>
        );
    }

    // List View
    return (
        <div className="vm-page main-layout">
            <div className="vm-hero">
                <h1>Azure VM Comparison</h1>
                <div className="badges">
                    <span className="badge">Batch Export API</span>
                    <span className="badge">Download complete pricing datasets</span>
                </div>
                <p className="hero-text">
                    Discover and compare Azure Virtual Machines, Amazon EC2, and GCP instance specifications and pricing across multiple tiers, payment options, and geographical regions, all on one comprehensive page. Use the 'Best Price Region' feature to quickly find where a specific VM offers the greatest value.
                </p>
                <p className="disclaimer">
                    The data is frequently updated from the Azure API, but may not be accurate. This site is not affiliated with Microsoft or Azure. The latest update occurred on {new Date().toLocaleDateString()} UTC
                </p>
            </div>

            <div className="vm-controls-bar">
                <div className="currency-indicator">
                    <span className="curr-label">{currency} ({currency === 'USD' ? '$' : currency})</span>
                </div>
                <div className="region-indicator">
                    {getRegionName(region)}
                </div>
                <div className="unit-indicator">Per Hour</div>
                <div className="tier-indicator">Standard</div>
                <div className="pay-indicator">Pay-as-you-go</div>
            </div>

            <div className="filter-row">
                <div className="filter-stats">
                    <div className="stat-box">
                        <span className="label">vCPUs</span>
                        <div className="value">1 <span className="to">to</span> 832</div>
                    </div>
                    <div className="stat-box">
                        <span className="label">Memory</span>
                        <div className="value">0.5 <span className="to">to</span> 15200</div>
                    </div>
                </div>

                <div className="search-box">
                    <Search size={18} className="icon" />
                    <input
                        type="text"
                        placeholder="Filter by Name or Regex"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>

                <button className="columns-btn">Columns <ChevronDown size={14} /></button>
            </div>

            <div className="vm-table-container">
                <table className="vm-table">
                    <thead>
                        <tr>
                            <th style={{ width: '40px' }}></th>
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
                        {vmRows.slice(0, 100).map(vm => (
                            <tr key={vm.sku} onClick={() => toggleSelection(vm.sku)} className={selectedWrappers.has(vm.sku) ? 'selected' : ''}>
                                <td>
                                    <div className={`checkbox ${selectedWrappers.has(vm.sku) ? 'checked' : ''}`}>
                                        {selectedWrappers.has(vm.sku) && <Check size={12} color="white" />}
                                    </div>
                                </td>
                                <td className="sku-cell">
                                    <span className="sku-name">{vm.sku}</span>
                                </td>
                                <td>{vm.vCpus}</td>
                                <td>{vm.memory}</td>
                                <td className="price-cell">
                                    {vm.localPrice ? formatPrice(vm.localPrice, currency) : '—'}
                                </td>
                                <td className="price-cell">
                                    {vm.windowsPrice ? formatPrice(vm.windowsPrice, currency) : '—'}
                                </td>
                                <td className="text-muted" style={{ fontSize: '0.9em' }}>find better</td>
                                <td className="text-muted" style={{ fontSize: '0.9em' }}>compare</td>
                                <td>
                                    <div className="best-region-cell">
                                        {vm.bestRegion}
                                        {vm.diffPercent > 0 && <span className="diff-tag"> / -{vm.diffPercent}%</span>}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Comparison Footer */}
            {selectedWrappers.size > 0 && (
                <div className="compare-bar">
                    <div className="selected-info">
                        <span className="count">{selectedWrappers.size} selected</span>
                        <span className="hint">Select up to 3 VMs to compare</span>
                    </div>
                    <div className="actions">
                        <button className="clear-btn" onClick={handleClearSelection}>Clear</button>
                        <button
                            className="compare-btn"
                            disabled={selectedWrappers.size < 2}
                            onClick={() => setIsComparing(true)}
                        >
                            Compare
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
