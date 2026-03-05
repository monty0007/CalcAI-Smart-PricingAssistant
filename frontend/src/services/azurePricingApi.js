// Uses the backend API at VITE_API_URL (e.g. http://localhost:3001/api)
// Falls back to the Azure API proxy if VITE_API_URL is not set
const BASE_URL = import.meta.env.VITE_API_URL || '/azproxy';
const USE_BACKEND = !!import.meta.env.VITE_API_URL;

// ── Two-tier cache: in-memory (fast) + localStorage (persistent across refreshes) ──────
const memCache = new Map();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes
const LS_PREFIX = 'azpc_';
const MAX_LS_ENTRIES = 40; // guard against filling localStorage

function lsGet(key) {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (Date.now() - entry.t > CACHE_TTL) { localStorage.removeItem(LS_PREFIX + key); return null; }
    return entry.d;
  } catch { return null; }
}

function lsSet(key, data) {
  try {
    // Evict oldest if over cap
    const keys = Object.keys(localStorage).filter(k => k.startsWith(LS_PREFIX));
    if (keys.length >= MAX_LS_ENTRIES) {
      let oldest = null, oldestTs = Infinity;
      for (const k of keys) {
        try { const e = JSON.parse(localStorage.getItem(k)); if (e.t < oldestTs) { oldest = k; oldestTs = e.t; } } catch { oldest = k; }
      }
      if (oldest) localStorage.removeItem(oldest);
    }
    localStorage.setItem(LS_PREFIX + key, JSON.stringify({ t: Date.now(), d: data }));
  } catch { /* quota exceeded — ignore */ }
}

function cacheGet(key) {
  const mem = memCache.get(key);
  if (mem && Date.now() - mem.t < CACHE_TTL) return mem.d;
  const ls = lsGet(key);
  if (ls) { memCache.set(key, { t: Date.now(), d: ls }); return ls; }
  return null;
}

function cacheSet(key, data) {
  memCache.set(key, { t: Date.now(), d: data });
  lsSet(key, data);
}

/**
 * Fetch prices from the backend or Azure API
 */
export async function fetchPrices(filters = {}, currencyCode = 'USD', maxItems = 200, includeAll = false) {
  const cacheKey = JSON.stringify({ filters, currencyCode, maxItems, includeAll });

  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  let items;

  if (USE_BACKEND) {
    items = await fetchFromBackend(filters, currencyCode, maxItems);
  } else {
    items = await fetchFromAzure(filters, currencyCode, maxItems);
  }

  // Filter by type
  let filtered;
  if (includeAll) {
    filtered = items.filter(item => item.retailPrice > 0 && item.type !== 'DevTestConsumption');
  } else {
    filtered = items.filter(item => item.type === 'Consumption' && item.retailPrice > 0);
  }

  const result = {
    items: maxItems === 'all' ? filtered : filtered.slice(0, maxItems),
    totalFetched: items.length,
    currency: currencyCode,
  };

  cacheSet(cacheKey, result);
  return result;
}

// ── Backend fetch ─────────────────────────────
async function fetchFromBackend(filters, currencyCode, limit) {
  const params = new URLSearchParams();
  if (filters.serviceName) params.set('serviceName', filters.serviceName);
  if (filters.armRegionName) params.set('region', filters.armRegionName);
  if (currencyCode) params.set('currency', currencyCode);
  if (filters.contains) params.set('search', filters.contains);
  if (filters.productName) params.set('productName', filters.productName);
  params.set('limit', String(limit));

  const url = `${BASE_URL}/prices?${params.toString()}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Backend error: ${response.status}`);
  const data = await response.json();
  return data.Items || [];
}

// ── Direct Azure API fetch (fallback) ─────────
async function fetchFromAzure(filters, currencyCode, maxItems) {
  const filterParts = [];
  if (filters.serviceName) filterParts.push(`serviceName eq '${filters.serviceName}'`);
  if (filters.serviceFamily) filterParts.push(`serviceFamily eq '${filters.serviceFamily}'`);
  if (filters.armRegionName) filterParts.push(`armRegionName eq '${filters.armRegionName}'`);
  if (filters.contains) filterParts.push(`contains(productName, '${filters.contains}')`);
  if (filters.productName) filterParts.push(`productName eq '${filters.productName}'`);

  const filterString = filterParts.join(' and ');
  const queryParts = [];
  if (filterString) queryParts.push(`$filter=${encodeURIComponent(filterString)}`);
  if (currencyCode !== 'USD') queryParts.push(`currencyCode=${encodeURIComponent(currencyCode)}`);

  const proxyBase = '/azproxy';
  const url = queryParts.length > 0 ? `${proxyBase}?${queryParts.join('&')}` : proxyBase;

  const allItems = [];
  let nextUrl = url;
  let pages = 0;
  const maxPages = Math.ceil(maxItems / 100);

  while (nextUrl && pages < maxPages) {
    let fetchUrl = nextUrl;
    if (fetchUrl.startsWith('https://prices.azure.com')) {
      fetchUrl = '/azproxy' + fetchUrl.replace('https://prices.azure.com/api/retail/prices', '');
    }

    const response = await fetch(fetchUrl);
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    const data = await response.json();
    allItems.push(...(data.Items || []));
    nextUrl = data.NextPageLink || null;
    pages++;
  }

  return allItems;
}

// ── Public fetch functions ────────────────────
export async function fetchServicePricingFull(serviceName, region = 'eastus', currency = 'USD') {
  return fetchPrices({ serviceName, armRegionName: region }, currency, 'all', true);
}

export async function fetchServicePricing(serviceName, region = 'eastus', currency = 'USD') {
  return fetchPrices({ serviceName, armRegionName: region }, currency, 200);
}

export async function searchPrices(query, region = 'eastus', currency = 'USD') {
  if (USE_BACKEND) {
    const params = new URLSearchParams({ q: query, region, currency, limit: '100' });
    const response = await fetch(`${BASE_URL}/prices/search?${params.toString()}`);
    if (!response.ok) throw new Error(`Search error: ${response.status}`);
    const data = await response.json();
    return { items: data.Items || [], currency };
  }
  return fetchPrices({ contains: query, armRegionName: region }, currency, 100);
}

export async function fetchManagedDisks(region = 'eastus', currency = 'USD') {
  return fetchPrices({ serviceName: 'Storage', armRegionName: region, contains: 'Managed Disks' }, currency, 200);
}

export async function fetchBandwidth(region = 'eastus', currency = 'USD') {
  return fetchPrices({ serviceName: 'Bandwidth', armRegionName: region }, currency, 100);
}

export function clearCache() {
  memCache.clear();
  try {
    Object.keys(localStorage)
      .filter(k => k.startsWith(LS_PREFIX))
      .forEach(k => localStorage.removeItem(k));
  } catch { /* ignore */ }
}

export async function fetchBestVmPrices(currency = 'USD') {
  if (USE_BACKEND) {
    try {
      const response = await fetch(`${BASE_URL}/best-vm-prices?currency=${currency}&limit=all`);
      if (!response.ok) throw new Error(`Best prices error: ${response.status}`);
      const data = await response.json();
      return data;
    } catch (error) {
      console.error("Error fetching best VM prices from backend:", error);
      return { items: [], currency };
    }
  }
  return { items: [], currency };
}

export async function fetchVmRegionalPrices(skuName, currency = 'USD') {
  if (USE_BACKEND) {
    try {
      // Fetch all prices for this SKU
      // The backend limit='all' or a high number ensures we get all regions
      const params = new URLSearchParams({
        skuName,
        currency,
        limit: '500',
        type: 'Consumption'
      });
      const response = await fetch(`${BASE_URL}/prices?${params.toString()}`);
      if (!response.ok) throw new Error(`Regional prices error: ${response.status}`);
      const data = await response.json();
      return data.Items || [];
    } catch (error) {
      console.error("Error fetching regional prices:", error);
      return [];
    }
  }
  return []; // Client-side fallback not implemented for full regional scan due to volume
}

// ── Currency helpers ──────────────────────────
export const SUPPORTED_CURRENCIES = [
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
  { code: 'BRL', symbol: 'R$', name: 'Brazilian Real' },
  { code: 'KRW', symbol: '₩', name: 'South Korean Won' },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar' },
  { code: 'DKK', symbol: 'kr', name: 'Danish Krone' },
  { code: 'NZD', symbol: 'NZ$', name: 'New Zealand Dollar' },
  { code: 'NOK', symbol: 'kr', name: 'Norwegian Krone' },
  { code: 'RUB', symbol: '₽', name: 'Russian Ruble' },
  { code: 'SEK', symbol: 'kr', name: 'Swedish Krona' },
  { code: 'CHF', symbol: 'Fr', name: 'Swiss Franc' },
  { code: 'TWD', symbol: 'NT$', name: 'New Taiwan Dollar' },
];

export function getCurrencySymbol(code) {
  const currency = SUPPORTED_CURRENCIES.find(c => c.code === code);
  return currency ? currency.symbol : '$';
}

export function formatPrice(price, currencyCode = 'USD') {
  const symbol = getCurrencySymbol(currencyCode);
  if (price === 0) return `${symbol}0.00`;
  if (price < 0.01) return `${symbol}${price.toFixed(6)}`;
  if (price < 1) return `${symbol}${price.toFixed(4)}`;
  if (price >= 1000) return `${symbol}${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `${symbol}${price.toFixed(2)}`;
}

/**
 * Fetch paginated VM list with Linux/Windows prices and best region
 */
export async function fetchVmList({
  currency = 'USD', region = 'eastus', search = '', limit = 100, offset = 0,
  minVcpu, maxVcpu, minMemory, maxMemory
} = {}) {
  const paramsObj = { currency, region, limit, offset };
  if (search) paramsObj.search = search;
  if (minVcpu) paramsObj.minVcpu = minVcpu;
  if (maxVcpu) paramsObj.maxVcpu = maxVcpu;
  if (minMemory) paramsObj.minMemory = minMemory;
  if (maxMemory) paramsObj.maxMemory = maxMemory;

  const params = new URLSearchParams(paramsObj);
  const response = await fetch(`${BASE_URL}/vm-list?${params.toString()}`);
  if (!response.ok) throw new Error(`VM list error: ${response.status}`);
  return response.json();
}

/**
 * Fetch regional prices for up to 2 SKUs for comparison view
 */
export async function fetchVmComparison({ skus = [], currency = 'USD', os = 'linux' } = {}) {
  const params = new URLSearchParams({ skus: skus.join(','), currency, os });
  const response = await fetch(`${BASE_URL}/vm-compare?${params.toString()}`);
  if (!response.ok) throw new Error(`VM compare error: ${response.status}`);
  return response.json();
}

/**
 * Fetch regional pricing matrix for selected VMs
 * @param {Object} params { skus: ['Standard_A1', 'Standard_A2'], regions: ['centralindia', 'southindia'], currency: 'INR' }
 */
export async function fetchVmPricingCompare(params) {
  const response = await fetch(`${BASE_URL}/vms/compare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!response.ok) throw new Error(`Pricing compare API error: ${response.status}`);
  return response.json();
}

/**
 * Sends a parsed workload stack to the backend /tools/calculate_estimate tool via API
 */
export async function calculateEstimate(items, currency = 'USD') {
  if (!USE_BACKEND) return { breakdown: [], total: 0, currency: 'USD' };
  const response = await fetch(`${BASE_URL}/tools/calculate_estimate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items, currency }),
  });
  if (!response.ok) throw new Error(`Calculate estimate tool error: ${response.status}`);
  return response.json();
}
