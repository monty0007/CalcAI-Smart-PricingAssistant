/**
 * vmSpecs.js
 * ──────────
 * Loads vm_specs.json into a JavaScript Map once at module import time.
 * Every lookup is O(1) — no DB round-trip, no JSON re-parse per request.
 *
 * Keys are normalised to lowercase so lookups are case-insensitive.
 *
 * Usage:
 *   import { specMap, lookupSpec, normalizeSkuName } from './vmSpecs.js';
 *
 *   const spec = lookupSpec('Standard_D4s_v3');
 *   // → { vCpus: 4, memoryGib: 16, type: 'General Purpose', ... }
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── Load JSON once at module init ─────────────────────────────────
const specsPath = join(__dirname, '../data/vm_specs.json');

let raw;
try {
    raw = JSON.parse(readFileSync(specsPath, 'utf8'));
    console.log(`[vmSpecs] Loaded ${Object.keys(raw).length} VM spec entries into memory`);
} catch (err) {
    console.warn(`[vmSpecs] Could not load ${specsPath}: ${err.message}`);
    raw = {};
}

/**
 * specMap — Map<string, object>
 * Key: lowercase SKU name (e.g. "standard_d4s_v3")
 * Value: spec object from vm_specs.json
 */
export const specMap = new Map(
    Object.entries(raw).map(([k, v]) => [k.toLowerCase(), v])
);

// ── Normalise SKU name ─────────────────────────────────────────────
/**
 * Converts DB-stored SKU names to the Standard_* format.
 * Examples:
 *   "A0"        → "Standard_A0"
 *   "D4s v3"    → "Standard_D4s_v3"
 *   "Standard_D4s_v3" → unchanged
 */
export function normalizeSkuName(raw) {
    if (!raw) return raw;
    const s = raw.trim();
    if (/^Standard_/i.test(s)) return s;          // already normalised
    return 'Standard_' + s.replace(/\s+/g, '_');  // "D4s v3" → "Standard_D4s_v3"
}

// ── O(1) lookup with multiple fallback strategies ──────────────────
/**
 * Look up the in-memory spec for a SKU.
 * Returns null if not found.
 *
 * Fallback order:
 *   1. Exact match (case-insensitive)
 *   2. With "Standard_" prefix added
 *   3. Without "Standard_" prefix (for bare names like "D4s_v3")
 */
export function lookupSpec(skuName) {
    if (!skuName) return null;

    const lower = skuName.toLowerCase();

    // 1. Direct lowercase match
    if (specMap.has(lower)) return specMap.get(lower);

    // 2. Try normalised form
    const normalized = normalizeSkuName(skuName).toLowerCase();
    if (specMap.has(normalized)) return specMap.get(normalized);

    // 3. Try without "standard_" prefix in case the key is stored bare
    const bare = lower.replace(/^standard_/, '');
    for (const [key, val] of specMap) {
        if (key.replace(/^standard_/, '') === bare) return val;
    }

    return null;
}
