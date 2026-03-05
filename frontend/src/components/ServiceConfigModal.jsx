import { useState, useEffect, useMemo } from 'react';
import { X, Search, Plus, ChevronDown, ChevronUp, HardDrive, Wifi, Info } from 'lucide-react';
import { fetchServicePricingFull, fetchManagedDisks, fetchBandwidth, formatPrice } from '../services/azurePricingApi';
import { useEstimate } from '../context/EstimateContext';
import { AZURE_REGIONS } from '../data/serviceCatalog';

// ── Helpers ──────────────────────────────────────────
function extractCategory(productName, serviceName) {
    let cat = (productName || '').replace(serviceName, '').trim().replace(/^-\s*/, '');
    return cat || 'General';
}

function extractSeries(productName) {
    // "Virtual Machines D Series Windows" -> "D Series"
    let s = (productName || '')
        .replace(/Virtual Machines\s*/i, '')
        .replace(/\s*Scale Set\s*/i, '')
        .replace(/\s*Windows$/i, '')
        .replace(/\s*Linux$/i, '')
        .replace(/\s*Red Hat.*$/i, '')
        .replace(/\s*SUSE.*$/i, '')
        .replace(/\s*Ubuntu.*$/i, '') // Add other OSes as needed
        .trim();
    return s || 'General';
}

function detectOS(productName) {
    const p = (productName || '').toLowerCase();
    if (p.includes('windows')) return 'Windows';
    if (p.includes('red hat') || p.includes('rhel')) return 'Red Hat';
    if (p.includes('ubuntu')) return 'Ubuntu';
    if (p.includes('suse') || p.includes('sles')) return 'SUSE';
    return 'Linux';
}

function isVMLike(serviceName) {
    const s = (serviceName || '').toLowerCase();
    return s.includes('virtual machine') || s.includes('cloud service');
}

function getBaseProductName(productName) {
    // "Virtual Machines Dv3 Series Windows" → "Virtual Machines Dv3 Series"
    return (productName || '')
        .replace(/\s+Windows$/i, '')
        .replace(/\s+Red Hat.*$/i, '')
        .replace(/\s+SUSE.*$/i, '')
        .replace(/\s+Ubuntu.*$/i, '')
        .trim();
}

// ── Savings Plan Discount Estimates ──────────────────
const SAVINGS_PLANS = [
    { id: 'payg', label: 'Pay as you go', discount: 0, tag: null },
    { id: 'sp1y', label: '1 Year Savings Plan', discount: 0.31, tag: '~31% savings' },
    { id: 'sp3y', label: '3 Year Savings Plan', discount: 0.53, tag: '~53% savings' },
];

// ── Managed Disk Tiers ───────────────────────────────
const DISK_TIERS = [
    { id: 'standard-hdd', label: 'Standard HDD', keyword: 'Standard HDD' },
    { id: 'standard-ssd', label: 'Standard SSD', keyword: 'Standard SSD' },
    { id: 'premium-ssd', label: 'Premium SSD', keyword: 'Premium SSD' },
];

// ── Component ────────────────────────────────────────
export default function ServiceConfigModal({ service, onClose, editItem = null }) {
    const { addItem, updateItem, currency, region } = useEstimate();
    const vmMode = isVMLike(service.serviceName);

    // Core state
    const [allData, setAllData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedItem, setSelectedItem] = useState(null);
    const [filterText, setFilterText] = useState('');
    const [quantity, setQuantity] = useState(1);
    const [hoursPerMonth, setHoursPerMonth] = useState(730);
    const [selectedRegion, setSelectedRegion] = useState(region);
    const [toast, setToast] = useState(false);

    // Lock body scroll
    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, []);

    // Filters
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [selectedSeries, setSelectedSeries] = useState('All');
    const [selectedOS, setSelectedOS] = useState('All');

    // Pricing model
    const [pricingModel, setPricingModel] = useState('payg');
    const [hybridBenefit, setHybridBenefit] = useState(false);

    // Add-ons
    const [showDisks, setShowDisks] = useState(false);
    const [diskTier, setDiskTier] = useState('standard-hdd');
    const [diskData, setDiskData] = useState([]);
    const [selectedDisk, setSelectedDisk] = useState(null);
    const [diskCount, setDiskCount] = useState(0);

    const [showBandwidth, setShowBandwidth] = useState(false);
    const [bandwidthGB, setBandwidthGB] = useState(0);
    const [bandwidthData, setBandwidthData] = useState([]);

    // ── Fetch VM pricing ────────────────────────────
    useEffect(() => {
        async function load() {
            setLoading(true);
            setError(null);
            setSelectedItem(null);
            try {
                const data = await fetchServicePricingFull(service.serviceName, selectedRegion, currency);
                setAllData(data.items);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        }
        load();
    }, [service.serviceName, selectedRegion, currency]);

    // ── Fetch managed disks ─────────────────────────
    useEffect(() => {
        if (!vmMode) return;
        fetchManagedDisks(selectedRegion, currency)
            .then(data => setDiskData(data.items))
            .catch(() => { });
    }, [selectedRegion, currency, vmMode]);

    // ── Fetch bandwidth ──────────────────────────────
    useEffect(() => {
        if (!vmMode) return;
        fetchBandwidth(selectedRegion, currency)
            .then(data => setBandwidthData(data.items))
            .catch(() => { });
    }, [selectedRegion, currency, vmMode]);

    // ── Restore state for Editing ───────────────────
    useEffect(() => {
        if (editItem) {
            setQuantity(editItem.quantity || 1);
            setHoursPerMonth(editItem.hoursPerMonth || 730);

            if (editItem.location) {
                // simple mapping back to code if armRegionName was used
                const rName = editItem.location.toLowerCase();
                const matchedRegion = AZURE_REGIONS.find(r => r.code === rName || r.name.toLowerCase() === rName);
                if (matchedRegion) {
                    setSelectedRegion(matchedRegion.code);
                }
            }

            if (editItem.meterName) {
                const lowerMeter = editItem.meterName.toLowerCase();
                if (lowerMeter.includes('1 year')) setPricingModel('r1y');
                else if (lowerMeter.includes('3 year')) setPricingModel('r3y');
                else setPricingModel('payg');
            }
        }
    }, [editItem]);

    // ── Filter options from data ────────────────────
    const filterOptions = useMemo(() => {
        const categories = new Set();
        const series = new Set();
        const osTypes = new Set();

        // Only show Consumption items for category/OS filters
        allData.filter(i => i.type === 'Consumption').forEach(item => {
            categories.add(extractCategory(item.productName, item.serviceName));
            if (vmMode) {
                series.add(extractSeries(item.productName));
                osTypes.add(detectOS(item.productName));
            }
        });

        return {
            categories: ['All', ...Array.from(categories).sort()],
            series: ['All', ...Array.from(series).sort()],
            osTypes: ['All', ...Array.from(osTypes).sort()],
        };
    }, [allData, vmMode]);

    // Reset filters on data change ONLY IF NOT EDITING
    useEffect(() => {
        if (!editItem) {
            setSelectedCategory('All');
            setSelectedSeries('All');
            setSelectedOS('All');
            setFilterText('');
            setPricingModel('payg');
            setHybridBenefit(false);
        } else if (allData.length > 0) {
            // Pre-filter based on the item being edited
            const cat = extractCategory(editItem.productName, editItem.serviceName);
            setSelectedCategory(filterOptions.categories.includes(cat) ? cat : 'All');

            if (vmMode) {
                const series = extractSeries(editItem.productName);
                setSelectedSeries(filterOptions.series.includes(series) ? series : 'All');

                const os = detectOS(editItem.productName);
                setSelectedOS(filterOptions.osTypes.includes(os) ? os : 'All');
            }

            // Try to find the exact item to select
            const matchedItem = allData.find(i =>
                i.skuName === editItem.skuName &&
                i.productName === editItem.productName &&
                i.type === 'Consumption' // we match base instance
            );
            if (matchedItem) {
                setSelectedItem(matchedItem);
            }
        }
    }, [allData, editItem, filterOptions, vmMode]);

    // ── Filtered PAYG items for instance selection ──
    const filteredPricing = useMemo(() => {
        return allData
            .filter(item => {
                if (item.type !== 'Consumption') return false;
                // Exclude Low Priority / Spot for cleaner list
                const sku = (item.skuName || '').toLowerCase();
                if (sku.includes('low priority') || sku.includes('spot')) return false;

                if (selectedCategory !== 'All') {
                    if (extractCategory(item.productName, item.serviceName) !== selectedCategory) return false;
                }
                if (vmMode && selectedSeries !== 'All') {
                    if (extractSeries(item.productName) !== selectedSeries) return false;
                }
                if (vmMode && selectedOS !== 'All') {
                    if (detectOS(item.productName) !== selectedOS) return false;
                }
                if (filterText.trim()) {
                    const q = filterText.toLowerCase();
                    return (
                        (item.skuName || '').toLowerCase().includes(q) ||
                        (item.productName || '').toLowerCase().includes(q) ||
                        (item.meterName || '').toLowerCase().includes(q) ||
                        (item.armSkuName || '').toLowerCase().includes(q)
                    );
                }
                return true;
            })
            .sort((a, b) => a.retailPrice - b.retailPrice);
    }, [allData, selectedCategory, selectedSeries, selectedOS, filterText, vmMode]);

    // Auto-select first if not editing
    useEffect(() => {
        if (!editItem && filteredPricing.length > 0 && !filteredPricing.includes(selectedItem)) {
            setSelectedItem(filteredPricing[0]);
        }
    }, [filteredPricing, editItem, selectedItem]);

    // ── Reservation prices for selected instance ────
    const reservationPrices = useMemo(() => {
        if (!selectedItem) return {};
        const baseProd = getBaseProductName(selectedItem.productName);
        const sku = selectedItem.skuName;

        const reservations = allData.filter(
            i => i.type === 'Reservation' && i.skuName === sku &&
                getBaseProductName(i.productName) === baseProd
        );

        const result = {};
        reservations.forEach(r => {
            if (r.reservationTerm === '1 Year') result['r1y'] = r;
            if (r.reservationTerm === '3 Years') result['r3y'] = r;
        });
        return result;
    }, [selectedItem, allData]);

    // ── OS cost calculation (Windows premium) ───────
    const osCost = useMemo(() => {
        if (!vmMode || !selectedItem) return { extra: 0, os: 'Linux' };

        const os = detectOS(selectedItem.productName);
        if (os === 'Linux') return { extra: 0, os };

        // Find the Linux equivalent
        const baseProd = getBaseProductName(selectedItem.productName);
        const linuxItem = allData.find(
            i => i.type === 'Consumption' && i.skuName === selectedItem.skuName &&
                getBaseProductName(i.productName) === baseProd &&
                detectOS(i.productName) === 'Linux'
        );

        const linuxPrice = linuxItem ? linuxItem.retailPrice : 0;
        const extra = Math.max(0, selectedItem.retailPrice - linuxPrice);
        return { extra, os, linuxPrice };
    }, [selectedItem, allData, vmMode]);

    // ── Compute cost based on pricing model ──────────
    function getComputeHourlyPrice() {
        if (!selectedItem) return 0;
        const payg = selectedItem.retailPrice;

        // Base infrastructure cost (strip OS cost from PAYG if applicable)
        const computePayg = vmMode && osCost.extra > 0 ? Math.max(0, payg - osCost.extra) : payg;
        let basePrice = computePayg;

        if (pricingModel === 'payg') {
            basePrice = computePayg;
        } else {
            // Savings plans (estimated discount) apply to base compute
            const sp = SAVINGS_PLANS.find(s => s.id === pricingModel);
            if (sp) {
                basePrice = computePayg * (1 - sp.discount);
            } else if (pricingModel === 'r1y' && reservationPrices.r1y) {
                basePrice = reservationPrices.r1y.retailPrice / (365 * 24); // yearly price to hourly
            } else if (pricingModel === 'r3y' && reservationPrices.r3y) {
                basePrice = reservationPrices.r3y.retailPrice / (3 * 365 * 24);
            }
        }

        // Add back OS cost if NOT using hybrid benefit
        if (vmMode && osCost.extra > 0 && !hybridBenefit) {
            return basePrice + osCost.extra;
        }

        return basePrice;
    }

    function getUpfrontCost() {
        if (pricingModel === 'r1y' && reservationPrices.r1y) {
            return reservationPrices.r1y.retailPrice * quantity;
        }
        if (pricingModel === 'r3y' && reservationPrices.r3y) {
            return reservationPrices.r3y.retailPrice * quantity;
        }
        return 0;
    }

    // ── Monthly costs ────────────────────────────────
    const computeMonthly = (() => {
        const hourly = getComputeHourlyPrice();
        const base = hourly;
        const unit = (selectedItem?.unitOfMeasure || '').toLowerCase();
        if (unit.includes('hour')) return Math.max(0, base) * quantity * hoursPerMonth;
        if (unit.includes('month')) return Math.max(0, base) * quantity;
        return Math.max(0, base) * quantity;
    })();

    const osMonthly = 0; // OS cost is now folded directly into getComputeHourlyPrice()

    const diskMonthly = (() => {
        if (!selectedDisk || diskCount <= 0) return 0;
        return selectedDisk.retailPrice * diskCount;
    })();

    const bandwidthMonthly = (() => {
        if (bandwidthGB <= 0 || bandwidthData.length === 0) return 0;
        // First 5 GB/month free, then use cheapest tier
        const billableGB = Math.max(0, bandwidthGB - 5);
        const cheapest = bandwidthData
            .filter(b => b.type === 'Consumption' && b.retailPrice > 0)
            .sort((a, b) => a.retailPrice - b.retailPrice)[0];
        return cheapest ? cheapest.retailPrice * billableGB : 0;
    })();

    const totalMonthly = computeMonthly + diskMonthly + bandwidthMonthly;

    // ── Disk options filtered by tier ────────────────
    const filteredDisks = useMemo(() => {
        const tier = DISK_TIERS.find(t => t.id === diskTier);
        if (!tier) return [];
        return diskData
            .filter(d => d.type === 'Consumption' && d.productName?.includes(tier.keyword) &&
                d.unitOfMeasure?.toLowerCase().includes('month'))
            .sort((a, b) => a.retailPrice - b.retailPrice);
    }, [diskData, diskTier]);

    // Auto-select first disk
    useEffect(() => {
        if (filteredDisks.length > 0) {
            setSelectedDisk(filteredDisks[0]);
        } else {
            setSelectedDisk(null);
        }
    }, [filteredDisks]);

    // ── Add or Update to estimate ────────────────────
    function handleSaveItem() {
        if (!selectedItem) return;

        // Base item properties
        const itemConfig = {
            serviceName: selectedItem.serviceName,
            productName: selectedItem.productName,
            skuName: selectedItem.skuName,
            meterName: `${selectedItem.meterName} (${pricingModel === 'payg' ? 'PAYG' : pricingModel.toUpperCase()})`,
            retailPrice: getComputeHourlyPrice(),
            unitOfMeasure: selectedItem.unitOfMeasure,
            armRegionName: selectedItem.armRegionName,
            location: selectedItem.location,
            currencyCode: selectedItem.currencyCode,
            quantity,
            hoursPerMonth,
        };

        if (editItem) {
            // Update existing single instance
            updateItem(editItem.id, itemConfig);
        } else {
            // Add new instances
            const itemsToSave = [];
            itemsToSave.push(itemConfig);

            // Add disks as a separate item if needed
            if (selectedDisk && diskCount > 0) {
                itemsToSave.push({
                    serviceName: 'Managed Disks',
                    productName: selectedDisk.productName,
                    skuName: selectedDisk.skuName,
                    meterName: selectedDisk.meterName,
                    retailPrice: selectedDisk.retailPrice,
                    unitOfMeasure: selectedDisk.unitOfMeasure,
                    armRegionName: selectedDisk.armRegionName,
                    location: selectedDisk.location,
                    currencyCode: selectedDisk.currencyCode,
                    quantity: diskCount,
                    hoursPerMonth: 730,
                });
            }
            itemsToSave.forEach(i => addItem(i));
        }


        setToast(true);
        setTimeout(() => setToast(false), 2000);
    }

    function handleSaveAndClose() {
        handleSaveItem();
        setTimeout(() => onClose(), 300);
    }

    // ── Render ───────────────────────────────────────
    return (
        <>
            <div className="modal-overlay vm-config-overlay" onClick={onClose}>
                <div className="modal-content vm-config-modal" onClick={e => e.stopPropagation()}>
                    <div className="modal-header">
                        <div className="modal-header-text">
                            <h2>{service.serviceName}</h2>
                            <p className="modal-description">
                                {service.description}
                            </p>
                        </div>
                        <button className="modal-close" onClick={onClose}><X size={20} /></button>
                    </div>

                    <div className="modal-body">
                        {/* ── Section 1: Configuration ─────────── */}
                        <div className="modal-section">
                            <h4>Configuration</h4>
                            <div className="config-grid">
                                <div className="modal-field">
                                    <label>Region</label>
                                    <select value={selectedRegion} onChange={e => setSelectedRegion(e.target.value)}>
                                        {AZURE_REGIONS.map(r => <option key={r.code} value={r.code}>{r.name}</option>)}
                                    </select>
                                </div>
                                <div className="modal-field">
                                    <label>Category</label>
                                    <select value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)}>
                                        {filterOptions.categories.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                                {vmMode && (
                                    <>
                                        <div className="modal-field">
                                            <label>Instance Series</label>
                                            <select value={selectedSeries} onChange={e => setSelectedSeries(e.target.value)}>
                                                {filterOptions.series.map(s => <option key={s} value={s}>{s}</option>)}
                                            </select>
                                        </div>
                                        <div className="modal-field">
                                            <label>Operating System</label>
                                            <select value={selectedOS} onChange={e => setSelectedOS(e.target.value)}>
                                                {filterOptions.osTypes.map(o => <option key={o} value={o}>{o}</option>)}
                                            </select>
                                        </div>
                                    </>
                                )}
                                <div className="modal-field">
                                    <label>Currency</label>
                                    <input type="text" value={currency} disabled style={{ opacity: 0.6 }} />
                                </div>
                            </div>
                        </div>

                        {/* ── Section 2: Instance Selection ────── */}
                        <div className="modal-section">
                            <h4>
                                Select Instance
                                {!loading && ` (${filteredPricing.length})`}
                            </h4>
                            <div className="modal-field" style={{ position: 'relative', marginBottom: 16 }}>
                                <Search size={14} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                                <input
                                    type="text"
                                    className="search-input"
                                    style={{ paddingLeft: 40 }}
                                    placeholder="Search instances (e.g. D2, B1s, F4)..."
                                    value={filterText}
                                    onChange={e => setFilterText(e.target.value)}
                                />
                            </div>

                            {loading ? (
                                <div className="loading-spinner">
                                    <div className="spinner"></div>
                                    Fetching real-time pricing from Azure...
                                </div>
                            ) : error ? (
                                <div style={{ padding: 20, textAlign: 'center', color: 'var(--danger)' }}>Error: {error}</div>
                            ) : filteredPricing.length === 0 ? (
                                <div className="empty-state" style={{ padding: 20 }}>
                                    <p>No pricing found.</p>
                                    {currency !== 'USD' && (
                                        <p style={{ marginTop: 8, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                            The local database currently only contains <strong>USD</strong> pricing.
                                            <br />Please switch the currency to USD.
                                        </p>
                                    )}
                                    {currency === 'USD' && (
                                        <p style={{ marginTop: 8, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                            Try adjusting your filters or search terms.
                                        </p>
                                    )}
                                </div>
                            ) : (
                                <div className="pricing-list">
                                    {filteredPricing.slice(0, 100).map((item, idx) => (
                                        <div
                                            key={idx}
                                            className={`pricing-item ${selectedItem === item ? 'selected' : ''}`}
                                            onClick={() => setSelectedItem(item)}
                                        >
                                            <div className="pricing-item-info">
                                                <div className="pricing-item-name">{item.armSkuName || item.skuName || item.meterName}</div>
                                                <div className="pricing-item-meta">
                                                    <span>{item.meterName}</span>
                                                    <span>{extractCategory(item.productName, item.serviceName)}</span>
                                                </div>
                                            </div>
                                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                                <div className="pricing-item-price">{formatPrice(item.retailPrice, currency)}</div>
                                                <div className="pricing-item-unit">/{item.unitOfMeasure}</div>
                                            </div>
                                        </div>
                                    ))}
                                    {filteredPricing.length > 100 && (
                                        <div style={{ padding: '8px 12px', textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border)' }}>
                                            Showing top 100 of {filteredPricing.length} results. Use search to find more.
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* ── Section 3: Quantity ────────────────── */}
                        {selectedItem && (
                            <div className="modal-section">
                                <div className="config-grid">
                                    <div className="modal-field">
                                        <label>Instances (Qty)</label>
                                        <input type="number" min="1" value={quantity}
                                            onChange={e => setQuantity(Math.max(1, parseInt(e.target.value) || 1))} />
                                    </div>
                                    {(selectedItem.unitOfMeasure || '').toLowerCase().includes('hour') && (
                                        <div className="modal-field">
                                            <label>Hours per Month</label>
                                            <input type="number" min="1" max="744" value={hoursPerMonth}
                                                onChange={e => setHoursPerMonth(Math.max(1, parseInt(e.target.value) || 730))} />
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* ── Section 4: Savings Options ──────── */}
                        {selectedItem && vmMode && (
                            <div className="modal-section">
                                <h4>Savings Options</h4>
                                <div className="savings-options">
                                    {SAVINGS_PLANS.map(plan => (
                                        <label key={plan.id} className={`savings-option ${pricingModel === plan.id ? 'selected' : ''}`}>
                                            <input type="radio" name="pricing" value={plan.id}
                                                checked={pricingModel === plan.id} onChange={() => setPricingModel(plan.id)} />
                                            <div className="savings-label">
                                                <span>{plan.label}</span>
                                                {plan.tag && <span className="savings-tag">{plan.tag}</span>}
                                            </div>
                                        </label>
                                    ))}

                                    <div className="savings-divider"><span>Reservations</span></div>

                                    <label className={`savings-option ${pricingModel === 'r1y' ? 'selected' : ''} ${!reservationPrices.r1y ? 'disabled' : ''}`}>
                                        <input type="radio" name="pricing" value="r1y"
                                            checked={pricingModel === 'r1y'} onChange={() => setPricingModel('r1y')}
                                            disabled={!reservationPrices.r1y} />
                                        <div className="savings-label">
                                            <span>1 Year Reserved</span>
                                            {reservationPrices.r1y && (
                                                <span className="savings-tag savings-green">
                                                    {formatPrice(reservationPrices.r1y.retailPrice, currency)} upfront
                                                </span>
                                            )}
                                            {!reservationPrices.r1y && <span className="savings-tag">Not available</span>}
                                        </div>
                                    </label>

                                    <label className={`savings-option ${pricingModel === 'r3y' ? 'selected' : ''} ${!reservationPrices.r3y ? 'disabled' : ''}`}>
                                        <input type="radio" name="pricing" value="r3y"
                                            checked={pricingModel === 'r3y'} onChange={() => setPricingModel('r3y')}
                                            disabled={!reservationPrices.r3y} />
                                        <div className="savings-label">
                                            <span>3 Year Reserved</span>
                                            {reservationPrices.r3y && (
                                                <span className="savings-tag savings-green">
                                                    {formatPrice(reservationPrices.r3y.retailPrice, currency)} upfront
                                                </span>
                                            )}
                                            {!reservationPrices.r3y && <span className="savings-tag">Not available</span>}
                                        </div>
                                    </label>
                                </div>
                            </div>
                        )}

                        {/* ── Section 5: OS Licensing ──────────── */}
                        {selectedItem && vmMode && osCost.os !== 'Linux' && (
                            <div className="modal-section">
                                <h4>OS ({osCost.os})</h4>
                                <div className="savings-options">
                                    <label className={`savings-option ${!hybridBenefit ? 'selected' : ''}`}>
                                        <input type="radio" checked={!hybridBenefit} onChange={() => setHybridBenefit(false)} />
                                        <div className="savings-label">
                                            <span>License included</span>
                                            <span className="savings-tag">+{formatPrice(osCost.extra * quantity * hoursPerMonth, currency)}/mo</span>
                                        </div>
                                    </label>
                                    <label className={`savings-option ${hybridBenefit ? 'selected' : ''}`}>
                                        <input type="radio" checked={hybridBenefit} onChange={() => setHybridBenefit(true)} />
                                        <div className="savings-label">
                                            <span>Azure Hybrid Benefit</span>
                                        </div>
                                    </label>
                                </div>
                            </div>
                        )}

                        {/* ── Section 6: Managed Disks ──────────── */}
                        {selectedItem && vmMode && (
                            <div className="addon-section">
                                <button className="addon-toggle" onClick={() => setShowDisks(!showDisks)}>
                                    <HardDrive size={14} />
                                    Managed Disks
                                    <span className="addon-cost">{formatPrice(diskMonthly, currency)}</span>
                                    {showDisks ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                </button>
                                {showDisks && (
                                    <div className="addon-body">
                                        <div className="config-grid">
                                            <div className="modal-field">
                                                <label>Tier</label>
                                                <select value={diskTier} onChange={e => setDiskTier(e.target.value)}>
                                                    {DISK_TIERS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                                                </select>
                                            </div>
                                            <div className="modal-field">
                                                <label>Disk Size</label>
                                                <select value={selectedDisk?.skuId || ''} onChange={e => {
                                                    const d = filteredDisks.find(d => d.skuId === e.target.value);
                                                    if (d) setSelectedDisk(d);
                                                }}>
                                                    {filteredDisks.map(d => (
                                                        <option key={d.skuId} value={d.skuId}>
                                                            {d.meterName} — {formatPrice(d.retailPrice, currency)}/mo
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                            <div className="modal-field">
                                                <label>Number of Disks</label>
                                                <input type="number" min="0" value={diskCount}
                                                    onChange={e => setDiskCount(Math.max(0, parseInt(e.target.value) || 0))} />
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ── Section 7: Bandwidth ──────────────── */}
                        {selectedItem && vmMode && (
                            <div className="addon-section">
                                <button className="addon-toggle" onClick={() => setShowBandwidth(!showBandwidth)}>
                                    <Wifi size={14} />
                                    Bandwidth
                                    <span className="addon-cost">{formatPrice(bandwidthMonthly, currency)}</span>
                                    {showBandwidth ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                </button>
                                {showBandwidth && (
                                    <div className="addon-body">
                                        <div className="modal-field" style={{ maxWidth: 200 }}>
                                            <label>Outbound Data Transfer (GB/mo)</label>
                                            <input type="number" min="0" value={bandwidthGB}
                                                onChange={e => setBandwidthGB(Math.max(0, parseInt(e.target.value) || 0))} />
                                        </div>
                                        <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 6 }}>
                                            First 5 GB/month is free. Inbound data transfer is always free.
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ── Section 8: Cost Breakdown ─────────── */}
                        {selectedItem && (
                            <div className="cost-breakdown">
                                <h4>Cost Summary</h4>
                                <div className="cost-lines">
                                    <div className="cost-line">
                                        <span>Compute ({selectedItem.armSkuName || selectedItem.skuName})</span>
                                        <span>{formatPrice(computeMonthly, currency)}</span>
                                    </div>
                                    {vmMode && osCost.os !== 'Linux' && (
                                        <div className="cost-line" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                            <span>License Option</span>
                                            <span>{hybridBenefit ? 'Azure Hybrid Benefit' : 'License included'}</span>
                                        </div>
                                    )}
                                    {diskCount > 0 && (
                                        <div className="cost-line">
                                            <span>Managed Disks (×{diskCount})</span>
                                            <span>{formatPrice(diskMonthly, currency)}</span>
                                        </div>
                                    )}
                                    {bandwidthGB > 0 && (
                                        <div className="cost-line">
                                            <span>Bandwidth ({bandwidthGB} GB)</span>
                                            <span>{formatPrice(bandwidthMonthly, currency)}</span>
                                        </div>
                                    )}
                                    <div className="cost-line cost-total">
                                        <span>Estimated Monthly Cost</span>
                                        <span className="cost-amount">{formatPrice(totalMonthly, currency)}</span>
                                    </div>
                                    <div className="cost-line cost-sub">
                                        <span>Estimated Yearly Cost</span>
                                        <span>{formatPrice(totalMonthly * 12, currency)}</span>
                                    </div>
                                    {getUpfrontCost() > 0 && (
                                        <div className="cost-line cost-sub">
                                            <span>Upfront Cost</span>
                                            <span>{formatPrice(getUpfrontCost(), currency)}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="modal-footer">
                        <button className="btn-secondary" onClick={onClose}>Cancel</button>
                        {!editItem && (
                            <button className="btn-primary" onClick={handleSaveItem} disabled={!selectedItem}
                                style={{ flex: 'none', padding: '10px 24px', display: 'flex', alignItems: 'center', gap: 6, opacity: !selectedItem ? 0.5 : 1 }}>
                                <Plus size={16} /> Add More
                            </button>
                        )}
                        <button className="btn-primary" onClick={handleSaveAndClose} disabled={!selectedItem}
                            style={{ flex: 'none', padding: '10px 24px', opacity: !selectedItem ? 0.5 : 1 }}>
                            {editItem ? 'Update & Close' : 'Add & Close'}
                        </button>
                    </div>
                </div>
            </div>

            {toast && (
                <div className="toast">
                    <span className="toast-icon">✓</span>
                    Added to estimate!
                </div>
            )}
        </>
    );
}
