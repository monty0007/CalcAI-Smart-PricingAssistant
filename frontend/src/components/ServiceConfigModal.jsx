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

function isStorageLike(serviceName) {
    return (serviceName || '').toLowerCase() === 'storage';
}

// ── Storage helpers ───────────────────────────────────
function getStorageProductName(sType, perf, fStruct) {
    if (sType === 'file') return perf === 'premium' ? 'Premium Files' : 'Files v2';
    if (sType === 'data-lake') return fStruct === 'hierarchical'
        ? 'Azure Data Lake Storage Gen2 Hierarchical Namespace'
        : 'Azure Data Lake Storage Gen2 Flat Namespace';
    if (perf === 'premium') return fStruct === 'hierarchical'
        ? 'Premium Block Blob v2 Hierarchical Namespace'
        : 'Premium Block Blob';
    return fStruct === 'hierarchical'
        ? 'General Block Blob v2 Hierarchical Namespace'
        : 'General Block Blob v2';
}

function getStorageSkuName(tier, redund, perf) {
    if (perf === 'premium') return `Premium ${redund}`;
    const t = { hot: 'Hot', cool: 'Cool', cold: 'Cold', archive: 'Archive' }[tier] || 'Hot';
    return `${t} ${redund}`;
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

const SNAPSHOT_REDUNDANCY = [
    { id: 'LRS', label: 'LRS' },
    { id: 'ZRS', label: 'ZRS' }
];

const TRANSFER_TYPES = [
    'Inter-Region',
    'Internet Routing',
    'Routing Preference'
];

// ── Component ────────────────────────────────────────
export default function ServiceConfigModal({ service, onClose, editItem = null }) {
    const { addItem, updateItem, currency, region } = useEstimate();
    const vmMode = isVMLike(service.serviceName);
    const storageMode = isStorageLike(service.serviceName);

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
    const [selectedOS, setSelectedOS] = useState('Windows');

    // Pricing model
    const [pricingModel, setPricingModel] = useState('payg');
    const [hybridBenefit, setHybridBenefit] = useState(false);

    // OS License
    const [osLicenseIncluded] = useState(true);
    const [osHybridBenefit] = useState(false);

    // SQL / VM Type
    const [vmType] = useState('os-only');
    const [sqlLicenseIncluded] = useState(false);
    const [sqlHybridBenefit] = useState(false);

    // Add-ons
    const [showDisks, setShowDisks] = useState(false);
    const [diskTier, setDiskTier] = useState('standard-hdd');
    const [diskRedundancy, setDiskRedundancy] = useState('LRS');
    const [diskData, setDiskData] = useState([]);
    const [selectedDisk, setSelectedDisk] = useState(null);
    const [diskCount, setDiskCount] = useState(0);

    const [showSnapshot, setShowSnapshot] = useState(false);
    const [snapshotSizeGB, setSnapshotSizeGB] = useState(0);
    const [snapshotRedundancy, setSnapshotRedundancy] = useState('LRS');

    const [showConfidential, setShowConfidential] = useState(false);
    const [storageTransactionUnits, setStorageTransactionUnits] = useState(0);
    const [showStorageTransactions, setShowStorageTransactions] = useState(false);

    const [showBandwidth, setShowBandwidth] = useState(false);
    const [bandwidthGB, setBandwidthGB] = useState(0);
    const [bandwidthData, setBandwidthData] = useState([]);

    // ── Storage-specific state ────────────────────────
    const [storageType, setStorageType] = useState('block-blob');
    const [storagePerformance, setStoragePerformance] = useState('standard');
    const [fileStructure, setFileStructure] = useState('flat');
    const [accessTier, setAccessTier] = useState('hot');
    const [redundancy, setRedundancy] = useState('LRS');
    const [capacityGB, setCapacityGB] = useState(1000);
    const [writeOpsUnits, setWriteOpsUnits] = useState(10);
    const [listCreateOpsUnits, setListCreateOpsUnits] = useState(10);
    const [readOpsUnits, setReadOpsUnits] = useState(10);
    const [otherOpsUnits, setOtherOpsUnits] = useState(1);
    const [dataRetrievalGB, setDataRetrievalGB] = useState(0);
    const [sftpEnabled, setSftpEnabled] = useState(false);

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
            osTypes: Array.from(osTypes).sort(),
        };
    }, [allData, vmMode]);

    // Reset filters on data change ONLY IF NOT EDITING
    useEffect(() => {
        if (!editItem) {
            setSelectedCategory('All');
            setSelectedSeries('All');
            setSelectedOS('Windows');
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
                setSelectedOS(filterOptions.osTypes.includes(os) ? os : 'Windows');
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

    const osLicenseMonthly = (() => {
        if (!vmMode || osCost.os !== 'Windows' || hybridBenefit || !osLicenseIncluded) return 0;
        return osCost.extra * quantity * hoursPerMonth;
    })();

    const sqlLicenseMonthly = (() => {
        if (!vmMode || vmType !== 'sql-server' || sqlHybridBenefit || !sqlLicenseIncluded) return 0;
        const sqlCoreCount = selectedItem ? Math.max(4, selectedItem.cores || 4) : 4;
        const sqlPricePerHour = 0.37 * sqlCoreCount;
        return sqlPricePerHour * hoursPerMonth * quantity;
    })();

    const diskMonthly = (() => {
        if (!selectedDisk || diskCount <= 0) return 0;
        return selectedDisk.retailPrice * diskCount;
    })();

    const snapshotRate = snapshotRedundancy === 'ZRS' ? 0.065 : 0.05;
    const snapshotMonthly = showSnapshot ? (snapshotSizeGB * snapshotRate) : 0;

    const confidentialGiB = selectedItem ? selectedItem.ram || 0 : 0;
    const confidentialPricePerHour = 0.01;
    const confidentialMonthly = showConfidential ? (confidentialGiB * hoursPerMonth * confidentialPricePerHour) : 0;

    const storageTxPricePer10k = 0.005;
    const storageTxMonthly = storageTransactionUnits * storageTxPricePer10k;

    const bandwidthMonthly = (() => {
        if (bandwidthGB <= 0 || bandwidthData.length === 0) return 0;
        // First 5 GB/month free, then use cheapest tier
        const billableGB = Math.max(0, bandwidthGB - 5);
        const cheapest = bandwidthData
            .filter(b => b.type === 'Consumption' && b.retailPrice > 0)
            .sort((a, b) => a.retailPrice - b.retailPrice)[0];
        return cheapest ? cheapest.retailPrice * billableGB : 0;
    })();

    // ── Storage-specific memos ────────────────────────
    // Available options based on current storage selections
    const availableRedundancies = useMemo(() => {
        if (!storageMode) return [];
        if (storagePerformance === 'premium') return ['LRS', 'ZRS'];
        if (storageType === 'file') return ['LRS', 'ZRS', 'GRS', 'RA-GRS'];
        if (accessTier === 'archive') return ['LRS', 'GRS', 'RA-GRS'];
        return ['LRS', 'ZRS', 'GRS', 'RA-GRS', 'GZRS', 'RA-GZRS'];
    }, [storageMode, storagePerformance, storageType, accessTier]);

    const availableAccessTiers = useMemo(() => {
        if (!storageMode) return [];
        if (storagePerformance === 'premium') return ['hot'];
        if (storageType === 'file') return ['hot', 'cool'];
        if (['ZRS', 'GZRS', 'RA-GZRS'].includes(redundancy)) return ['hot', 'cool', 'cold'];
        return ['hot', 'cool', 'cold', 'archive'];
    }, [storageMode, storagePerformance, storageType, redundancy]);

    // Auto-correct invalid combos
    useEffect(() => {
        if (!storageMode) return;
        if (!availableRedundancies.includes(redundancy)) setRedundancy(availableRedundancies[0]);
    }, [availableRedundancies, redundancy, storageMode]);
    useEffect(() => {
        if (!storageMode) return;
        if (!availableAccessTiers.includes(accessTier)) setAccessTier(availableAccessTiers[0]);
    }, [availableAccessTiers, accessTier, storageMode]);
    useEffect(() => {
        if (!storageMode) return;
        if (storageType === 'data-lake') setFileStructure('hierarchical');
        if (storageType === 'file') setFileStructure('flat');
    }, [storageType, storageMode]);

    // Find pricing items for current storage selection
    const storageTargetItems = useMemo(() => {
        if (!storageMode || allData.length === 0) return [];
        const productName = getStorageProductName(storageType, storagePerformance, fileStructure);
        const skuName = getStorageSkuName(accessTier, redundancy, storagePerformance);
        return allData.filter(i =>
            i.productName === productName &&
            i.skuName === skuName &&
            i.type === 'Consumption'
        );
    }, [allData, storageMode, storageType, storagePerformance, fileStructure, accessTier, redundancy]);

    const storageCapacityPrice = useMemo(() => {
        const item = storageTargetItems.find(i => i.meterName?.includes('Data Stored'));
        return item?.retailPrice || 0;
    }, [storageTargetItems]);

    const storageWriteOpsPrice = useMemo(() => {
        const item = storageTargetItems.find(i => i.meterName?.includes('Write Operations'));
        return item?.retailPrice || 0;
    }, [storageTargetItems]);

    const storageListCreateOpsPrice = useMemo(() => {
        const item = storageTargetItems.find(i =>
            i.meterName?.includes('List and Create') ||
            i.meterName?.includes('List Operations')
        );
        return item?.retailPrice ?? storageWriteOpsPrice;
    }, [storageTargetItems, storageWriteOpsPrice]);

    const storageReadOpsPrice = useMemo(() => {
        const item = storageTargetItems.find(i => i.meterName?.includes('Read Operations'));
        return item?.retailPrice || 0;
    }, [storageTargetItems]);

    const storageAllOtherOpsPrice = useMemo(() => {
        const item = storageTargetItems.find(i =>
            i.meterName === 'All Other Operations' ||
            i.meterName?.includes('Other Operations')
        );
        return item?.retailPrice ?? storageReadOpsPrice;
    }, [storageTargetItems, storageReadOpsPrice]);

    const storageDataRetrievalPrice = useMemo(() => {
        const item = storageTargetItems.find(i => i.meterName?.includes('Data Retrieval'));
        return item?.retailPrice || 0;
    }, [storageTargetItems]);

    const storageDataWritePrice = useMemo(() => {
        const item = storageTargetItems.find(i => i.meterName?.includes('Data Write'));
        return item?.retailPrice || 0;
    }, [storageTargetItems]);

    // Storage monthly costs
    const storageCapacityMonthly = storageMode ? storageCapacityPrice * capacityGB : 0;
    const storageWriteMonthly = storageMode ? writeOpsUnits * storageWriteOpsPrice : 0;
    const storageListCreateMonthly = storageMode ? listCreateOpsUnits * storageListCreateOpsPrice : 0;
    const storageReadMonthly = storageMode ? readOpsUnits * storageReadOpsPrice : 0;
    const storageOtherMonthly = storageMode ? otherOpsUnits * storageAllOtherOpsPrice : 0;
    const storageRetrievalMonthly = storageMode ? dataRetrievalGB * storageDataRetrievalPrice : 0;
    const storageSFTPMonthly = storageMode && sftpEnabled ? 0.30 * 730 : 0;
    const storageMonthlyTotal = storageCapacityMonthly + storageWriteMonthly + storageListCreateMonthly + storageReadMonthly + storageOtherMonthly + storageRetrievalMonthly + storageSFTPMonthly;

    const totalMonthly = storageMode
        ? storageMonthlyTotal
        : computeMonthly + diskMonthly + snapshotMonthly + confidentialMonthly + storageTxMonthly + bandwidthMonthly + osLicenseMonthly + sqlLicenseMonthly;

    // ── Disk options filtered by tier and redundancy ────────────────
    const filteredDisks = useMemo(() => {
        const tier = DISK_TIERS.find(t => t.id === diskTier);
        if (!tier) return [];
        return diskData
            .filter(d =>
                d.type === 'Consumption' &&
                d.productName?.includes(tier.keyword) &&
                d.unitOfMeasure?.toLowerCase().includes('month') &&
                !(d.skuName?.toLowerCase().includes('mount') || d.meterName?.toLowerCase().includes('mount')) &&
                !(d.skuName?.toLowerCase().includes('burst') || d.meterName?.toLowerCase().includes('burst')) &&
                !(d.skuName?.toLowerCase().includes('snapshot') || d.meterName?.toLowerCase().includes('snapshot')) &&
                d.skuName?.includes(diskRedundancy)
            )
            .sort((a, b) => a.retailPrice - b.retailPrice);
    }, [diskData, diskTier, diskRedundancy]);

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
        // ── Storage save path ──────────────────────────
        if (storageMode) {
            const productName = getStorageProductName(storageType, storagePerformance, fileStructure);
            const skuName = getStorageSkuName(accessTier, redundancy, storagePerformance);
            const regionCode = selectedRegion;
            const storageItems = [];

            if (capacityGB > 0 && storageCapacityPrice > 0) {
                storageItems.push({
                    serviceName: 'Storage',
                    productName,
                    skuName,
                    meterName: `Capacity (${skuName} Data Stored)`,
                    retailPrice: storageCapacityPrice,
                    unitOfMeasure: '1 GB/Month',
                    armRegionName: regionCode,
                    location: regionCode,
                    currencyCode: currency,
                    quantity: capacityGB,
                    hoursPerMonth: 730,
                });
            }
            const opRows = [
                { label: 'Write Operations', qty: writeOpsUnits, price: storageWriteOpsPrice },
                { label: 'List & Create Container Operations', qty: listCreateOpsUnits, price: storageListCreateOpsPrice },
                { label: 'Read Operations', qty: readOpsUnits, price: storageReadOpsPrice },
                { label: 'All Other Operations', qty: otherOpsUnits, price: storageAllOtherOpsPrice },
            ];
            opRows.forEach(op => {
                if (op.qty > 0 && op.price > 0) {
                    storageItems.push({
                        serviceName: 'Storage',
                        productName,
                        skuName,
                        meterName: op.label,
                        retailPrice: op.price,
                        unitOfMeasure: '10K',
                        armRegionName: regionCode,
                        location: regionCode,
                        currencyCode: currency,
                        quantity: op.qty,
                        hoursPerMonth: 730,
                    });
                }
            });
            if (dataRetrievalGB > 0 && storageDataRetrievalPrice > 0) {
                storageItems.push({
                    serviceName: 'Storage',
                    productName,
                    skuName,
                    meterName: 'Data Retrieval',
                    retailPrice: storageDataRetrievalPrice,
                    unitOfMeasure: '1 GB',
                    armRegionName: regionCode,
                    location: regionCode,
                    currencyCode: currency,
                    quantity: dataRetrievalGB,
                    hoursPerMonth: 730,
                });
            }
            if (sftpEnabled) {
                storageItems.push({
                    serviceName: 'Storage',
                    productName: 'SFTP',
                    skuName: 'SFTP',
                    meterName: 'SFTP Enabled Hours',
                    retailPrice: 0.30,
                    unitOfMeasure: 'Hour',
                    armRegionName: regionCode,
                    location: regionCode,
                    currencyCode: currency,
                    quantity: 730,
                    hoursPerMonth: 730,
                });
            }

            if (storageItems.length === 0) return;
            storageItems.forEach(i => addItem(i));
            setToast(true);
            setTimeout(() => setToast(false), 2000);
            return;
        }

        if (!selectedItem) return;

        // Full hourly rate = compute + OS license (when applicable).
        // This way the cart shows one row with the true total cost the user will pay.
        const osExtra = vmMode && osCost.os !== 'Linux' && !hybridBenefit ? osCost.extra : 0;
        const fullHourlyPrice = getComputeHourlyPrice() + osExtra;

        const osLabel = osExtra > 0 ? ` + ${osCost.os} License` : '';
        const computeConfig = {
            serviceName: selectedItem.serviceName,
            productName: selectedItem.productName,
            skuName: selectedItem.skuName,
            meterName: `${selectedItem.meterName} (${pricingModel === 'payg' ? 'PAYG' : pricingModel.toUpperCase()})${osLabel}`,
            retailPrice: fullHourlyPrice,
            unitOfMeasure: selectedItem.unitOfMeasure,
            armRegionName: selectedItem.armRegionName,
            location: selectedItem.location,
            currencyCode: selectedItem.currencyCode,
            quantity,
            hoursPerMonth,
        };

        if (editItem) {
            updateItem(editItem.id, computeConfig);
        } else {
            const itemsToSave = [computeConfig];

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

            if (showSnapshot && snapshotSizeGB > 0) {
                itemsToSave.push({
                    serviceName: 'Managed Disks',
                    productName: `Snapshot (${snapshotRedundancy})`,
                    skuName: `Disk Snapshot`,
                    meterName: `Snapshot Storage`,
                    retailPrice: snapshotRate,
                    unitOfMeasure: 'GB',
                    armRegionName: selectedItem.armRegionName,
                    location: selectedItem.location,
                    currencyCode: selectedItem.currencyCode,
                    quantity: snapshotSizeGB,
                    hoursPerMonth: 730,
                });
            }

            if (showConfidential) {
                itemsToSave.push({
                    serviceName: 'Managed Disks',
                    productName: 'Confidential OS Encryption',
                    skuName: 'Confidential Encryption',
                    meterName: 'RAM Encryption',
                    retailPrice: confidentialPricePerHour,
                    unitOfMeasure: 'GiB',
                    armRegionName: selectedItem.armRegionName,
                    location: selectedItem.location,
                    currencyCode: selectedItem.currencyCode,
                    quantity: confidentialGiB,
                    hoursPerMonth: 730,
                });
            }

            if (showStorageTransactions && storageTransactionUnits > 0) {
                itemsToSave.push({
                    serviceName: 'Storage Transactions',
                    productName: 'Storage Transactions',
                    skuName: 'Storage Transactions',
                    meterName: '10k Transactions',
                    retailPrice: 0.005,
                    unitOfMeasure: '10k',
                    armRegionName: selectedItem.armRegionName,
                    location: selectedItem.location,
                    currencyCode: selectedItem.currencyCode,
                    quantity: storageTransactionUnits,
                    hoursPerMonth: 730,
                });
            }

            if (showBandwidth && bandwidthGB > 0 && bandwidthData.length > 0) {
                const billableGB = Math.max(0, bandwidthGB - 5);
                const cheapest = bandwidthData
                    .filter(b => b.type === 'Consumption' && b.retailPrice > 0)
                    .sort((a, b) => a.retailPrice - b.retailPrice)[0];

                if (cheapest && billableGB > 0) {
                    itemsToSave.push({
                        serviceName: 'Bandwidth',
                        productName: cheapest.productName,
                        skuName: cheapest.skuName,
                        meterName: cheapest.meterName,
                        retailPrice: cheapest.retailPrice,
                        unitOfMeasure: cheapest.unitOfMeasure,
                        armRegionName: cheapest.armRegionName,
                        location: cheapest.location,
                        currencyCode: cheapest.currencyCode,
                        quantity: billableGB,
                        hoursPerMonth: 730,
                    });
                }
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

                                {/* ── Storage-specific filters ── */}
                                {storageMode && (
                                    <>
                                        <div className="modal-field">
                                            <label>Type</label>
                                            <select value={storageType} onChange={e => setStorageType(e.target.value)}>
                                                <option value="block-blob">Block Blob Storage</option>
                                                <option value="data-lake">Azure Data Lake Storage</option>
                                                <option value="file">File Storage</option>
                                            </select>
                                        </div>
                                        {storageType !== 'file' && (
                                            <div className="modal-field">
                                                <label>Performance</label>
                                                <select value={storagePerformance} onChange={e => setStoragePerformance(e.target.value)}>
                                                    <option value="standard">Standard</option>
                                                    <option value="premium">Premium</option>
                                                </select>
                                            </div>
                                        )}
                                        {storageType === 'file' && (
                                            <div className="modal-field">
                                                <label>Performance</label>
                                                <select value={storagePerformance} onChange={e => setStoragePerformance(e.target.value)}>
                                                    <option value="standard">Standard</option>
                                                    <option value="premium">Premium</option>
                                                </select>
                                            </div>
                                        )}
                                        {storageType === 'block-blob' && (
                                            <div className="modal-field">
                                                <label>File Structure</label>
                                                <select value={fileStructure} onChange={e => setFileStructure(e.target.value)}>
                                                    <option value="flat">Flat Namespace</option>
                                                    <option value="hierarchical">Hierarchical Namespace</option>
                                                </select>
                                            </div>
                                        )}
                                        {storagePerformance === 'standard' && (
                                            <div className="modal-field">
                                                <label>Access Tier</label>
                                                <select value={accessTier} onChange={e => setAccessTier(e.target.value)}>
                                                    {availableAccessTiers.map(t => (
                                                        <option key={t} value={t}>
                                                            {t.charAt(0).toUpperCase() + t.slice(1)}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        )}
                                        <div className="modal-field">
                                            <label>Redundancy</label>
                                            <select value={redundancy} onChange={e => setRedundancy(e.target.value)}>
                                                {availableRedundancies.map(r => (
                                                    <option key={r} value={r}>{r}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </>
                                )}

                                {/* ── Non-storage filters ── */}
                                {!storageMode && (
                                    <div className="modal-field">
                                        <label>Category</label>
                                        <select value={selectedCategory} onChange={e => setSelectedCategory(e.target.value)}>
                                            {filterOptions.categories.map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </div>
                                )}
                                {!storageMode && vmMode && (
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

                        {/* ── Storage: Capacity & Operations ─── */}
                        {storageMode && (
                            <>
                                {loading && (
                                    <div className="modal-section">
                                        <div className="loading-spinner">
                                            <div className="spinner"></div>
                                            Fetching real-time pricing from Azure...
                                        </div>
                                    </div>
                                )}
                                {error && (
                                    <div className="modal-section" style={{ color: 'var(--danger)' }}>Error: {error}</div>
                                )}
                                {/* Capacity */}
                                <div className="modal-section">
                                    <h4>Capacity</h4>
                                    <div className="config-grid">
                                        <div className="modal-field">
                                            <label>Storage (GB)</label>
                                            <input type="number" min="1" value={capacityGB}
                                                onChange={e => setCapacityGB(Math.max(1, parseInt(e.target.value) || 1))} />
                                        </div>
                                    </div>
                                    {storageCapacityPrice > 0 && (
                                        <div className="price-formula" style={{ marginTop: 8 }}>
                                            <span className="formula-value">{capacityGB}</span>
                                            <span className="formula-label">GB</span>
                                            <span className="formula-op">×</span>
                                            <span className="formula-value">{formatPrice(storageCapacityPrice, currency)}</span>
                                            <span className="formula-label">Per GB/mo</span>
                                            <span className="formula-eq">=</span>
                                            <span className="formula-total">{formatPrice(storageCapacityMonthly, currency)}</span>
                                        </div>
                                    )}
                                    {!loading && storageCapacityPrice === 0 && (
                                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 6 }}>
                                            No pricing found for this combination. Try a different region, type, or redundancy.
                                        </p>
                                    )}
                                </div>

                                {/* Savings Options for Storage */}
                                <div className="modal-section">
                                    <h4>Savings Options</h4>
                                    <div className="savings-options">
                                        <label className="savings-option selected">
                                            <input type="radio" checked readOnly />
                                            <div className="savings-label">
                                                <span>Pay as you go</span>
                                            </div>
                                        </label>
                                        <label className="savings-option disabled">
                                            <input type="radio" disabled />
                                            <div className="savings-label">
                                                <span>1 Year Reserved</span>
                                                <span className="savings-tag">~38% savings — see Azure portal</span>
                                            </div>
                                        </label>
                                        <label className="savings-option disabled">
                                            <input type="radio" disabled />
                                            <div className="savings-label">
                                                <span>3 Year Reserved</span>
                                                <span className="savings-tag">~52% savings — see Azure portal</span>
                                            </div>
                                        </label>
                                    </div>
                                </div>

                                {/* Operations and Data Transfer */}
                                <div className="modal-section">
                                    <h4>Operations and Data Transfer</h4>
                                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 12 }}>
                                        Prices shown are per 10,000 operations.
                                    </p>

                                    {/* Write Operations */}
                                    <div className="storage-op-row">
                                        <div className="storage-op-label">
                                            <span>Write Operations</span>
                                        </div>
                                        <div className="price-formula">
                                            <input type="number" min="0" value={writeOpsUnits}
                                                onChange={e => setWriteOpsUnits(Math.max(0, parseInt(e.target.value) || 0))}
                                                style={{ width: 70 }} />
                                            <span className="formula-label">× 10,000 ops</span>
                                            <span className="formula-op">×</span>
                                            <span className="formula-value">{formatPrice(storageWriteOpsPrice, currency)}</span>
                                            <span className="formula-label">Per 10K</span>
                                            <span className="formula-eq">=</span>
                                            <span className="formula-total">{formatPrice(storageWriteMonthly, currency)}</span>
                                        </div>
                                    </div>

                                    {/* List and Create Container Operations */}
                                    <div className="storage-op-row">
                                        <div className="storage-op-label">
                                            <span>List and Create Container Operations</span>
                                        </div>
                                        <div className="price-formula">
                                            <input type="number" min="0" value={listCreateOpsUnits}
                                                onChange={e => setListCreateOpsUnits(Math.max(0, parseInt(e.target.value) || 0))}
                                                style={{ width: 70 }} />
                                            <span className="formula-label">× 10,000 ops</span>
                                            <span className="formula-op">×</span>
                                            <span className="formula-value">{formatPrice(storageListCreateOpsPrice, currency)}</span>
                                            <span className="formula-label">Per 10K</span>
                                            <span className="formula-eq">=</span>
                                            <span className="formula-total">{formatPrice(storageListCreateMonthly, currency)}</span>
                                        </div>
                                    </div>

                                    {/* Read Operations */}
                                    <div className="storage-op-row">
                                        <div className="storage-op-label">
                                            <span>Read Operations</span>
                                        </div>
                                        <div className="price-formula">
                                            <input type="number" min="0" value={readOpsUnits}
                                                onChange={e => setReadOpsUnits(Math.max(0, parseInt(e.target.value) || 0))}
                                                style={{ width: 70 }} />
                                            <span className="formula-label">× 10,000 ops</span>
                                            <span className="formula-op">×</span>
                                            <span className="formula-value">{formatPrice(storageReadOpsPrice, currency)}</span>
                                            <span className="formula-label">Per 10K</span>
                                            <span className="formula-eq">=</span>
                                            <span className="formula-total">{formatPrice(storageReadMonthly, currency)}</span>
                                        </div>
                                    </div>

                                    {/* All Other Operations */}
                                    <div className="storage-op-row">
                                        <div className="storage-op-label">
                                            <span>All Other Operations</span>
                                        </div>
                                        <div className="price-formula">
                                            <input type="number" min="0" value={otherOpsUnits}
                                                onChange={e => setOtherOpsUnits(Math.max(0, parseInt(e.target.value) || 0))}
                                                style={{ width: 70 }} />
                                            <span className="formula-label">× 10,000 ops</span>
                                            <span className="formula-op">×</span>
                                            <span className="formula-value">{formatPrice(storageAllOtherOpsPrice, currency)}</span>
                                            <span className="formula-label">Per 10K</span>
                                            <span className="formula-eq">=</span>
                                            <span className="formula-total">{formatPrice(storageOtherMonthly, currency)}</span>
                                        </div>
                                    </div>

                                    {/* Data Retrieval */}
                                    <div className="storage-op-row" style={{ marginTop: 16 }}>
                                        <div className="storage-op-label">
                                            <span>Data Retrieval</span>
                                        </div>
                                        <div className="price-formula">
                                            <input type="number" min="0" value={dataRetrievalGB}
                                                onChange={e => setDataRetrievalGB(Math.max(0, parseInt(e.target.value) || 0))}
                                                style={{ width: 70 }} />
                                            <span className="formula-label">GB</span>
                                            <span className="formula-op">×</span>
                                            <span className="formula-value">{formatPrice(storageDataRetrievalPrice, currency)}</span>
                                            <span className="formula-label">Per GB</span>
                                            <span className="formula-eq">=</span>
                                            <span className="formula-total">{formatPrice(storageRetrievalMonthly, currency)}</span>
                                        </div>
                                    </div>

                                    {/* Data Write note */}
                                    {storageDataWritePrice === 0 && (
                                        <div className="storage-op-row" style={{ marginTop: 8 }}>
                                            <div className="storage-op-label"><span>Data Write</span></div>
                                            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', paddingTop: 4 }}>
                                                Data write (per GB) is provided free of charge
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* SFTP */}
                                <div className="modal-section">
                                    <h4>SSH File Transfer Protocol (SFTP)</h4>
                                    <label className="toggle-row custom-checkbox-row">
                                        <input type="checkbox" className="custom-checkbox" checked={sftpEnabled}
                                            onChange={e => setSftpEnabled(e.target.checked)} />
                                        <span className="checkbox-label">Enable SFTP for this Storage Account</span>
                                        <div className="info-tooltip">
                                            <Info size={12} />
                                            <span className="tooltip-text">SFTP endpoint charges $0.30/hour while enabled (~{formatPrice(storageSFTPMonthly, currency)}/mo).</span>
                                        </div>
                                    </label>
                                </div>

                                {/* Storage Cost Breakdown */}
                                <div className="cost-breakdown">
                                    <h4>Cost Summary</h4>
                                    <div className="cost-lines">
                                        {storageCapacityMonthly > 0 && (
                                            <div className="cost-line">
                                                <span>Capacity ({capacityGB} GB, {redundancy})</span>
                                                <span>{formatPrice(storageCapacityMonthly, currency)}</span>
                                            </div>
                                        )}
                                        {(storageWriteMonthly + storageListCreateMonthly + storageReadMonthly + storageOtherMonthly) > 0 && (
                                            <div className="cost-line">
                                                <span>Operations</span>
                                                <span>{formatPrice(storageWriteMonthly + storageListCreateMonthly + storageReadMonthly + storageOtherMonthly, currency)}</span>
                                            </div>
                                        )}
                                        {storageRetrievalMonthly > 0 && (
                                            <div className="cost-line">
                                                <span>Data Retrieval ({dataRetrievalGB} GB)</span>
                                                <span>{formatPrice(storageRetrievalMonthly, currency)}</span>
                                            </div>
                                        )}
                                        {storageSFTPMonthly > 0 && (
                                            <div className="cost-line">
                                                <span>SFTP (730 hrs)</span>
                                                <span>{formatPrice(storageSFTPMonthly, currency)}</span>
                                            </div>
                                        )}
                                        <div className="cost-line cost-total">
                                            <span>Estimated Monthly Cost</span>
                                            <span className="cost-amount">{formatPrice(storageMonthlyTotal, currency)}</span>
                                        </div>
                                        <div className="cost-line cost-sub">
                                            <span>Estimated Yearly Cost</span>
                                            <span>{formatPrice(storageMonthlyTotal * 12, currency)}</span>
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}

                        {/* ── Section 2: Instance Selection ────── */}
                        {!storageMode && <div className="modal-section">
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
                                    <p style={{ marginTop: 8, color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                        Try adjusting your filters, search terms, or selected region.
                                    </p>
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
                        </div>}

                        {/* ── Section 3: Quantity ────────────────── */}
                        {!storageMode && selectedItem && (
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
                                        <div className="savings-label" style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
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

                        {/* ── Section 6: Add-ons ────────────────── */}
                        {vmMode && (
                            <div className="modal-section" style={{ marginTop: 8 }}>
                                <h4>Add-ons</h4>

                                {/* Managed Disks */}
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
                                                    <label>Redundancy</label>
                                                    <select value={diskRedundancy} onChange={e => setDiskRedundancy(e.target.value)}>
                                                        <option value="LRS">LRS</option>
                                                        <option value="ZRS">ZRS</option>
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

                                            {/* Sub-addon 1: Snapshots */}
                                            <div className="sub-addon">
                                                <label className="toggle-row custom-checkbox-row">
                                                    <input type="checkbox" className="custom-checkbox" checked={showSnapshot} onChange={e => setShowSnapshot(e.target.checked)} />
                                                    <span className="checkbox-label">Add Snapshot</span>
                                                    <div className="info-tooltip">
                                                        <Info size={12} />
                                                        <span className="tooltip-text">Snapshots provide a full, read-only copy of a managed disk.</span>
                                                    </div>
                                                </label>
                                                {showSnapshot && (
                                                    <div className="sub-addon-fields">
                                                        <div className="modal-field">
                                                            <label>Snapshot Redundancy</label>
                                                            <select value={snapshotRedundancy} onChange={e => setSnapshotRedundancy(e.target.value)}>
                                                                <option value="LRS">LRS - Locally Redundant</option>
                                                                <option value="ZRS">ZRS - Zone Redundant</option>
                                                            </select>
                                                        </div>
                                                        <div className="modal-field">
                                                            <label>Size of snapshot (GB)</label>
                                                            <input type="number" min="0" value={snapshotSizeGB}
                                                                onChange={e => setSnapshotSizeGB(Math.max(0, parseInt(e.target.value) || 0))} />
                                                        </div>
                                                        <div className="price-formula">
                                                            <span className="formula-value">{snapshotSizeGB}</span>
                                                            <span className="formula-label">GB</span>
                                                            <span className="formula-op">×</span>
                                                            <span className="formula-value">{formatPrice(snapshotRate, currency)}</span>
                                                            <span className="formula-label">Per GB</span>
                                                            <span className="formula-eq">=</span>
                                                            <span className="formula-total">{formatPrice(snapshotMonthly, currency)}</span>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Sub-addon 2: Confidential OS Encryption */}
                                            <div className="sub-addon">
                                                <label className="toggle-row custom-checkbox-row">
                                                    <input type="checkbox" className="custom-checkbox" checked={showConfidential} onChange={e => setShowConfidential(e.target.checked)} />
                                                    <span className="checkbox-label">Enable Confidential OS Encryption</span>
                                                    <div className="info-tooltip">
                                                        <Info size={12} />
                                                        <span className="tooltip-text">Confidential computing VMs encrypt data in use, which includes the OS disk.</span>
                                                    </div>
                                                </label>
                                                {showConfidential && (
                                                    <div className="sub-addon-fields">
                                                        <div className="price-formula">
                                                            <span className="formula-value">{confidentialGiB}</span>
                                                            <span className="formula-label">GiBs</span>
                                                            <span className="formula-op">×</span>
                                                            <span className="formula-value">730</span>
                                                            <span className="formula-label">Hours</span>
                                                            <span className="formula-op">×</span>
                                                            <span className="formula-value">{formatPrice(confidentialPricePerHour, currency)}</span>
                                                            <span className="formula-eq">=</span>
                                                            <span className="formula-total">{formatPrice(confidentialMonthly, currency)}</span>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Storage Transactions */}
                                <div className="addon-section">
                                    <button className="addon-toggle" onClick={() => setShowStorageTransactions(!showStorageTransactions)}>
                                        <HardDrive size={14} />
                                        Storage Transactions
                                        <span className="addon-cost">{formatPrice(storageTxMonthly, currency)}</span>
                                        {showStorageTransactions ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                    </button>
                                    {showStorageTransactions && (
                                        <div className="addon-body">
                                            <div className="modal-field" style={{ maxWidth: 200 }}>
                                                <label>Units (10,000s)</label>
                                                <input type="number" min="0" value={storageTransactionUnits}
                                                    onChange={e => setStorageTransactionUnits(Math.max(0, parseInt(e.target.value) || 0))} />
                                            </div>
                                            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 6 }}>
                                                Estimated storage transactions per month. Current rate: {formatPrice(0.005, currency)} per 10,000.
                                            </p>
                                        </div>
                                    )}
                                </div>

                                {/* Bandwidth */}
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
                                        <>
                                            <div className="cost-line" style={{ fontSize: '0.9rem' }}>
                                                <span>OS License ({osCost.os})</span>
                                                <span>{formatPrice(osLicenseMonthly, currency)}</span>
                                            </div>
                                            {hybridBenefit && (
                                                <div className="cost-line" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                    <span>↳ Azure Hybrid Benefit applied</span>
                                                    <span></span>
                                                </div>
                                            )}
                                        </>
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
                            <button className="btn-primary"
                                onClick={handleSaveItem}
                                disabled={storageMode ? false : !selectedItem}
                                style={{ flex: 'none', padding: '10px 24px', display: 'flex', alignItems: 'center', gap: 6, opacity: (!storageMode && !selectedItem) ? 0.5 : 1 }}>
                                <Plus size={16} /> Add More
                            </button>
                        )}
                        <button className="btn-primary"
                            onClick={handleSaveAndClose}
                            disabled={storageMode ? false : !selectedItem}
                            style={{ flex: 'none', padding: '10px 24px', opacity: (!storageMode && !selectedItem) ? 0.5 : 1 }}>
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
