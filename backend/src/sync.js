import { upsertPrices, createSyncLog, completeSyncLog } from './db.js';

const AZURE_API_URL = 'https://prices.azure.com/api/retail/prices';

// Services to sync — covers all major Azure service families
const SERVICES_TO_SYNC = [
    'Virtual Machines',
    'Storage',
    'SQL Database',
    'Azure Cosmos DB',
    'Azure App Service',
    'Container Instances',
    'Azure Kubernetes Service',
    'Azure Functions',
    'Bandwidth',
    'Load Balancer',
    'VPN Gateway',
    'Azure DNS',
    'Azure Firewall',
    'Azure Cache for Redis',
    'Azure Database for PostgreSQL',
    'Azure Database for MySQL',
    'Cognitive Services',
    'Azure Monitor',
    'Key Vault',
    'Azure Active Directory',
    'Event Hubs',
    'Service Bus',
    'Azure Blob Storage',
    'Content Delivery Network',
    'Azure DevOps',
    'Azure Machine Learning',
    'Azure Synapse Analytics',
];

// Currencies to sync
const CURRENCIES_TO_SYNC = ['USD', 'INR', 'EUR', 'GBP'];

// Top regions to sync
const REGIONS_TO_SYNC = [
    'eastus', 'eastus2', 'westus', 'westus2', 'westus3',
    'centralus', 'northeurope', 'westeurope', 'uksouth',
    'southeastasia', 'eastasia', 'japaneast',
    'australiaeast', 'canadacentral', 'centralindia',
    'brazilsouth', 'koreacentral', 'francecentral',
    'germanywestcentral', 'southafricanorth',
];

/**
 * Fetch all pages from Azure Retail Prices API for a given filter
 */
async function fetchAllPages(filterString, currencyCode = 'USD', maxPages = 20000) {
    const items = [];
    let url = `${AZURE_API_URL}?$filter=${encodeURIComponent(filterString)}&currencyCode=${currencyCode}`;
    let pages = 0;

    while (url && pages < maxPages) {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Azure API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        items.push(...(data.Items || []));
        url = data.NextPageLink || null;
        pages++;
    }

    return items;
}

/**
 * Sync a single service for a specific region and currency
 */
export async function syncServiceRegionCurrency(serviceName, region, currency) {
    const filter = `serviceName eq '${serviceName}' and armRegionName eq '${region}'`;
    const items = await fetchAllPages(filter, currency);
    if (items.length > 0) {
        return await upsertPrices(items);
    }
    return 0;
}

/**
 * Sync a single service across all regions and currencies
 */
export async function syncService(serviceName) {
    let total = 0;
    for (const currency of CURRENCIES_TO_SYNC) {
        for (const region of REGIONS_TO_SYNC) {
            try {
                const count = await syncServiceRegionCurrency(serviceName, region, currency);
                total += count;
            } catch (err) {
                console.warn(`  ⚠ ${serviceName}/${region}/${currency}: ${err.message}`);
            }
            // Small delay to avoid rate limits during sync
            await new Promise(r => setTimeout(r, 100));
        }
    }
    return total;
}

/**
 * Run a full sync of all services
 */
export async function runFullSync() {
    console.log('🔄 Starting full Azure pricing sync...');
    console.log(`   Services: ${SERVICES_TO_SYNC.length}`);
    console.log(`   Regions: ${REGIONS_TO_SYNC.length}`);
    console.log(`   Currencies: ${CURRENCIES_TO_SYNC.length}`);

    const logId = await createSyncLog();
    const startTime = Date.now();
    let totalItems = 0;

    try {
        for (const service of SERVICES_TO_SYNC) {
            console.log(`  📦 Syncing: ${service}...`);
            const count = await syncService(service);
            totalItems += count;
            console.log(`     → ${count} items`);
        }

        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        await completeSyncLog(logId, totalItems);
        console.log(`✅ Sync complete: ${totalItems} items in ${duration}s`);
        return { totalItems, duration };
    } catch (err) {
        await completeSyncLog(logId, totalItems, err.message);
        console.error(`❌ Sync failed: ${err.message}`);
        throw err;
    }
}

/**
 * Quick sync — just the most popular services in eastus + USD
 * Good for initial setup / testing
 */
export async function runQuickSync() {
    console.log('⚡ Running quick sync (centralindia, INR only)...');
    const logId = await createSyncLog();
    const quickServices = ['Virtual Machines', 'Storage', 'SQL Database', 'Bandwidth', 'Azure App Service'];
    let totalItems = 0;

    try {
        for (const service of quickServices) {
            console.log(`  📦 Syncing: ${service}...`);
            const count = await syncServiceRegionCurrency(service, 'centralindia', 'INR');
            totalItems += count;
            console.log(`     → ${count} items`);
        }

        await completeSyncLog(logId, totalItems);
        console.log(`✅ Quick sync complete: ${totalItems} items`);
        return { totalItems };
    } catch (err) {
        await completeSyncLog(logId, totalItems, err.message);
        console.error(`❌ Quick sync failed: ${err.message}`);
        throw err;
    }
}
