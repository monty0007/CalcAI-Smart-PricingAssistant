import express from 'express';
import { query } from './db.js';

const router = express.Router();

// ── Azure Region → Billing Zone Map ──────────────────────────────────────────
const ZONE_MAP = {
    // Zone 1 — North America, Europe
    eastus: 1, eastus2: 1, westus: 1, westus2: 1, westus3: 1, centralus: 1,
    northcentralus: 1, southcentralus: 1, westcentralus: 1,
    canadacentral: 1, canadaeast: 1,
    northeurope: 1, westeurope: 1, uksouth: 1, ukwest: 1,
    francecentral: 1, francesouth: 1, germanywestcentral: 1,
    switzerlandnorth: 1, switzerlandwest: 1, norwayeast: 1, norwaywest: 1,
    swedencentral: 1, polandcentral: 1, italynorth: 1, spaincentral: 1,
    // Zone 2 — Asia Pacific, Japan, India, Australia, Korea
    eastasia: 2, southeastasia: 2, japaneast: 2, japanwest: 2,
    centralindia: 2, southindia: 2, westindia: 2, jioindiawest: 2, jioindiacentral: 2,
    australiaeast: 2, australiasoutheast: 2, australiacentral: 2,
    koreacentral: 2, koreasouth: 2,
    // Zone 3 — Brazil, South Africa, Middle East
    brazilsouth: 3, brazilsoutheast: 3,
    southafricanorth: 3, southafricawest: 3,
    uaenorth: 3, uaecentral: 3, qatarcentral: 3, israelcentral: 3,
};

/**
 * POST /api/tools/calculate_estimate
 * Refactored to route on item.type instead of fuzzy category/service matching.
 */
router.post('/calculate_estimate', async (req, res) => {
    console.log('🔥 CALCULATE_ESTIMATE HIT');
    console.log('Items:', JSON.stringify(req.body.items, null, 2));
    try {
        const { items, currency = 'USD' } = req.body;
        if (!items || !Array.isArray(items)) {
            return res.status(400).json({ error: 'items array is required' });
        }

        // Fetch currency rate
        const rateRes = await query('SELECT rate_from_usd FROM currency_rates WHERE currency_code = $1', [currency]);
        const rate = rateRes.rows.length > 0 ? rateRes.rows[0].rate_from_usd : 1.0;

        const breakdown = [];
        let total = 0;

        for (const item of items) {
            const region = (item.region || 'centralindia').toLowerCase().replace(/\s+/g, '');
            const qty = item.quantity || 1;

            switch (item.type) {

                // ──────────────────────────────────────────────
                // VM — Virtual Machines (Two-Query Logic)
                // ──────────────────────────────────────────────
                case 'vm': {
                    const isWindows = (item.os || '').toLowerCase() === 'windows';
                    const is1Year = (item.reservation || '').toLowerCase().includes('1 year');
                    const is3Year = (item.reservation || '').toLowerCase().includes('3 year');
                    const isReserved = is1Year || is3Year;
                    const isSpot = (item.sku || '').toLowerCase().includes('spot');

                    // ── Query 1: Base compute price ──
                    let sql = `
                        SELECT sku_name, product_name, raw_data->>'meterName' AS meter_name,
                               retail_price, raw_data->>'unitOfMeasure' AS unit_of_measure
                        FROM azure_prices
                        WHERE currency_code = 'USD'
                          AND is_active = TRUE
                          AND service_name = 'Virtual Machines'
                          AND arm_region_name = $1
                    `;
                    const args = [region];
                    let paramIdx = 2;

                    // Reservations only cover base compute — NEVER filter on Windows for reservations
                    if (isReserved) {
                        sql += ` AND product_name NOT ILIKE '%Windows%'`;
                        if (is1Year) {
                            sql += ` AND type = 'Reservation' AND reservation_term ILIKE '%1 Year%'`;
                        } else {
                            sql += ` AND type = 'Reservation' AND (reservation_term ILIKE '%3 Year%' OR reservation_term ILIKE '%3 Years%')`;
                        }
                    } else {
                        // PAYG — filter on OS
                        if (isWindows) {
                            sql += ` AND product_name ILIKE '%Windows%'`;
                        } else {
                            sql += ` AND product_name NOT ILIKE '%Windows%'`;
                        }
                        sql += ` AND type = 'Consumption'`;
                    }

                    if (!isSpot) {
                        sql += ` AND product_name NOT ILIKE '%Spot%'
                                 AND product_name NOT ILIKE '%Low Priority%'
                                 AND product_name NOT ILIKE '%Promo%'
                                 AND product_name NOT ILIKE '%Dedicated Host%'
                                 AND sku_name NOT ILIKE '%Spot%'
                                 AND sku_name NOT ILIKE '%Low Priority%'`;
                    }

                    if (!isReserved) {
                        // For PAYG, ensure it's not a Windows reservation base row
                        sql += ` AND raw_data->>'meterName' NOT ILIKE '%Windows%'`;
                    }

                    if (item.sku) {
                        const cleanSku = item.sku.replace(/[_\s]+/g, '%').trim();
                        sql += ` AND sku_name ILIKE $${paramIdx}`;
                        args.push(`%${cleanSku}%`);
                        paramIdx++;
                    }

                    sql += ` AND retail_price > 0 ORDER BY retail_price ASC LIMIT 1`;

                    const res = await query(sql, args);
                    let itemCost = 0;
                    let osNote = '';

                    if (res.rows.length > 0) {
                        const row = res.rows[0];
                        if (is1Year) {
                            itemCost = (row.retail_price / 12) * qty * rate;
                        } else if (is3Year) {
                            itemCost = (row.retail_price / 36) * qty * rate;
                        } else {
                            itemCost = row.retail_price * 730 * qty * rate;
                        }

                        // ── Query 2: Windows OS surcharge (only for reserved Windows VMs) ──
                        if (isWindows && isReserved) {
                            const cleanSku = (item.sku || '').replace(/[_\s]+/g, '%').trim();
                            const osSql = `
                                SELECT 
                                    MAX(CASE WHEN product_name ILIKE '%Windows%' THEN retail_price ELSE 0 END) 
                                    - MAX(CASE WHEN product_name NOT ILIKE '%Windows%' THEN retail_price ELSE 0 END) 
                                    AS os_price_per_hour
                                FROM azure_prices
                                WHERE service_name = 'Virtual Machines' 
                                  AND type = 'Consumption' 
                                  AND sku_name ILIKE $1
                                  AND arm_region_name = $2
                                  AND currency_code = 'USD'
                                  AND is_active = TRUE
                                  AND retail_price > 0
                                  AND product_name NOT ILIKE '%Spot%'
                                  AND product_name NOT ILIKE '%Low Priority%'
                            `;
                            const osArgs = [`%${cleanSku}%`, region];
                            console.log('OS Surcharge SQL:', osSql, osArgs);
                            const osRes = await query(osSql, osArgs);
                            if (osRes.rows.length > 0 && osRes.rows[0].os_price_per_hour > 0) {
                                const osMonthlyCost = osRes.rows[0].os_price_per_hour * 730 * qty * rate;
                                itemCost += osMonthlyCost;
                                osNote = ` + Windows OS License ($${(osMonthlyCost / rate).toFixed(2)}/mo USD)`;
                            }
                        }
                    } else {
                        console.warn(`No VM match for sku=${item.sku}, region=${region}`);
                    }

                    breakdown.push({
                        name: item.name || `VM – ${item.sku || 'Unknown'}`,
                        cost: parseFloat(itemCost.toFixed(2)),
                        note: res.rows.length > 0
                            ? (res.rows[0].sku_name + osNote)
                            : 'No pricing match found'
                    });
                    total += itemCost;
                    break;
                }

                // ──────────────────────────────────────────────
                // MANAGED DISK + Transaction Pricing
                // ──────────────────────────────────────────────
                case 'managed_disk': {
                    let sql = `
                        SELECT sku_name, product_name, raw_data->>'meterName' AS meter_name,
                               retail_price, raw_data->>'unitOfMeasure' AS unit_of_measure
                        FROM azure_prices
                        WHERE currency_code = 'USD'
                          AND is_active = TRUE
                          AND service_name = 'Storage'
                          AND arm_region_name = $1
                    `;
                    const args = [region];
                    let paramIdx = 2;

                    // diskTier filter
                    const diskTier = (item.diskTier || '').toLowerCase();
                    if (diskTier.includes('premium')) {
                        sql += ` AND product_name ILIKE '%Premium SSD%'`;
                    } else if (diskTier.includes('standard hdd') || diskTier.includes('hdd')) {
                        sql += ` AND product_name ILIKE '%Standard HDD%'`;
                    } else {
                        // Default to Standard SSD
                        sql += ` AND product_name ILIKE '%Standard SSD%'`;
                    }

                    // diskType + redundancy filter (e.g. "E10 LRS")
                    const redundancy = (item.diskRedundancy || 'LRS').toUpperCase();
                    const dType = item.diskType || '';

                    if (dType && redundancy) {
                        sql += ` AND sku_name ILIKE $${paramIdx}`;
                        args.push(`%${dType} ${redundancy}%`);
                        paramIdx++;
                    } else if (dType) {
                        sql += ` AND sku_name ILIKE $${paramIdx}`;
                        args.push(`%${dType}%`);
                        paramIdx++;
                    }

                    // Exclude transaction meters — we want disk capacity pricing only
                    // Also exclude Disk Mount, Burst, and Snapshot variants
                    sql += ` AND retail_price > 0
                      AND (raw_data->>'meterName' IS NULL OR (
                        raw_data->>'meterName' NOT ILIKE '%Transaction%' AND
                        raw_data->>'meterName' NOT ILIKE '%Operation%'
                      ))
                      AND sku_name NOT ILIKE '%Mount%'
                      AND sku_name NOT ILIKE '%Burst%'
                      AND sku_name NOT ILIKE '%Snapshot%'
                      AND (raw_data->>'meterName') NOT ILIKE '%Mount%'
                      AND (raw_data->>'meterName') NOT ILIKE '%Burst%'
                      AND (raw_data->>'meterName') NOT ILIKE '%Snapshot%'`;
                    sql += ` ORDER BY retail_price ASC LIMIT 1`;

                    console.log('Disk SQL:', sql, args);
                    const dbResult = await query(sql, args);
                    let diskCapacityCost = 0;
                    if (dbResult.rows.length > 0) {
                        diskCapacityCost = dbResult.rows[0].retail_price * qty * rate;
                    } else {
                        console.warn(`No Managed Disk match for diskType=${dType}, tier=${diskTier}, redundancy=${redundancy}`);
                    }

                    breakdown.push({
                        name: item.name || `Disk – ${dType || 'Unknown'}`,
                        cost: parseFloat(diskCapacityCost.toFixed(2)),
                        note: dbResult.rows[0]?.sku_name || 'no match'
                    });
                    total += diskCapacityCost;

                    // ── Disk Transaction Pricing ──
                    const transactions = item.transactions || 0;
                    if (transactions > 0) {
                        const txSql = `
                            SELECT retail_price, raw_data->>'meterName' AS meter_name
                            FROM azure_prices
                            WHERE currency_code = 'USD'
                              AND is_active = TRUE
                              AND service_name = 'Storage'
                              AND arm_region_name = $1
                              AND (raw_data->>'meterName' ILIKE '%Disk Operations%' OR raw_data->>'meterName' ILIKE '%Transaction%')
                              AND retail_price > 0
                            ORDER BY retail_price ASC LIMIT 1
                        `;
                        const txResult = await query(txSql, [region]);
                        let txCost = 0;
                        if (txResult.rows.length > 0) {
                            // Azure bills per 10,000 operations
                            txCost = txResult.rows[0].retail_price * (transactions / 10000) * qty * rate;
                        }

                        breakdown.push({
                            name: (item.name || `Disk – ${dType}`) + ' (Transactions)',
                            cost: parseFloat(txCost.toFixed(2)),
                            note: txResult.rows[0]?.meter_name || 'no match'
                        });
                        total += txCost;
                    }
                    break;
                }

                // ──────────────────────────────────────────────
                // BANDWIDTH — with Zone Mapping
                // ──────────────────────────────────────────────
                case 'bandwidth': {
                    const sourceRegion = (item.sourceRegion || item.region || 'centralindia').toLowerCase().replace(/\s+/g, '');
                    const transferType = (item.transferType || 'internet').toLowerCase();
                    const gb = item.dataTransferGB || 0;

                    let sql = `
                        SELECT sku_name, product_name, raw_data->>'meterName' AS meter_name,
                               retail_price, raw_data->>'unitOfMeasure' AS unit_of_measure
                        FROM azure_prices
                        WHERE currency_code = 'USD'
                          AND is_active = TRUE
                          AND service_name = 'Bandwidth'
                    `;
                    const args = [];

                    if (transferType.includes('inter-region') || transferType.includes('inter region')) {
                        sql += ` AND (raw_data->>'meterName' ILIKE '%Inter-Region%' OR raw_data->>'meterName' ILIKE '%Inter Region%')`;
                    } else {
                        // Internet egress — use zone mapping for source region
                        const zone = ZONE_MAP[sourceRegion] || 1;
                        sql += ` AND raw_data->>'meterName' ILIKE $1`;
                        args.push(`%Zone ${zone}%`);
                    }

                    // Exclude inbound transfer and peering meters — only outbound egress applies
                    sql += ` AND (raw_data->>'meterName') NOT ILIKE '%Inbound%'
                      AND (raw_data->>'meterName') NOT ILIKE '%Peering%'
                      AND (raw_data->>'meterName') NOT ILIKE '%Ingress%'`;

                    sql += ` AND retail_price > 0 ORDER BY retail_price ASC LIMIT 1`;

                    console.log('Bandwidth SQL:', sql, args);
                    const dbResult = await query(sql, args);
                    let itemCost = 0;
                    if (dbResult.rows.length > 0) {
                        itemCost = dbResult.rows[0].retail_price * gb * rate;
                    }

                    breakdown.push({
                        name: item.name || `Bandwidth – ${gb} GB ${transferType}`,
                        cost: parseFloat(itemCost.toFixed(2)),
                        note: dbResult.rows[0]?.meter_name || 'no match'
                    });
                    total += itemCost;
                    break;
                }

                // ──────────────────────────────────────────────
                // IP ADDRESS
                // ──────────────────────────────────────────────
                case 'ip_address': {
                    const ipType = (item.ipType || 'Static').toLowerCase();
                    const sql = `
                        SELECT retail_price, raw_data->>'meterName' AS meter_name, sku_name
                        FROM azure_prices
                        WHERE currency_code = 'USD'
                          AND is_active = TRUE
                          AND service_name ILIKE '%IP Addresses%'
                          AND raw_data->>'meterName' ILIKE $1
                          AND arm_region_name = $2
                          AND retail_price > 0
                        ORDER BY retail_price ASC LIMIT 1
                    `;
                    const dbResult = await query(sql, [`%${ipType}%`, region]);
                    let itemCost = 0;
                    if (dbResult.rows.length > 0) {
                        itemCost = dbResult.rows[0].retail_price * 730 * qty * rate;
                    }

                    breakdown.push({
                        name: item.name || 'Public IP Address',
                        cost: parseFloat(itemCost.toFixed(2)),
                        note: dbResult.rows[0]?.meter_name || 'no match'
                    });
                    total += itemCost;
                    break;
                }

                // ──────────────────────────────────────────────
                // DEFENDER — Microsoft Defender for Cloud
                // ──────────────────────────────────────────────
                case 'defender': {
                    const servers = item.serverCount || 1;
                    const sql = `
                        SELECT retail_price, raw_data->>'meterName' AS meter_name, sku_name
                        FROM azure_prices
                        WHERE currency_code = 'USD'
                          AND is_active = TRUE
                          AND service_name = 'Microsoft Defender for Cloud'
                          AND product_name ILIKE '%Server%'
                          AND retail_price > 0
                        ORDER BY retail_price ASC LIMIT 1
                    `;
                    const dbResult = await query(sql, []);
                    let itemCost = 0;
                    if (dbResult.rows.length > 0) {
                        itemCost = dbResult.rows[0].retail_price * servers * 730 * rate;
                    }

                    breakdown.push({
                        name: item.name || 'Microsoft Defender for Cloud',
                        cost: parseFloat(itemCost.toFixed(2)),
                        note: dbResult.rows[0]?.meter_name || 'no match'
                    });
                    total += itemCost;
                    break;
                }

                // ──────────────────────────────────────────────
                // MONITOR — Azure Monitor / Log Analytics
                // ──────────────────────────────────────────────
                case 'monitor': {
                    const gbPerDay = item.dataIngestionGB || 0.2;
                    const sql = `
                        SELECT retail_price, raw_data->>'meterName' AS meter_name, sku_name
                        FROM azure_prices
                        WHERE currency_code = 'USD'
                          AND is_active = TRUE
                          AND service_name ILIKE '%Monitor%'
                          AND raw_data->>'meterName' ILIKE '%Data Ingestion%'
                          AND retail_price > 0
                        ORDER BY retail_price ASC LIMIT 1
                    `;
                    const dbResult = await query(sql, []);
                    let itemCost = 0;
                    if (dbResult.rows.length > 0) {
                        itemCost = dbResult.rows[0].retail_price * gbPerDay * 30 * rate;
                    }

                    breakdown.push({
                        name: item.name || 'Azure Monitor Log Analytics',
                        cost: parseFloat(itemCost.toFixed(2)),
                        note: dbResult.rows[0]?.meter_name || 'no match'
                    });
                    total += itemCost;
                    break;
                }

                // ──────────────────────────────────────────────
                // FALLBACK — keyword search
                // ──────────────────────────────────────────────
                default: {
                    const keyword = item.sku || item.name || item.type || '';
                    const sql = `
                        SELECT retail_price, raw_data->>'meterName' AS meter_name, sku_name
                        FROM azure_prices
                        WHERE currency_code = 'USD'
                          AND is_active = TRUE
                          AND (sku_name ILIKE $1 OR product_name ILIKE $1 OR service_name ILIKE $1)
                          AND retail_price > 0
                        ORDER BY retail_price ASC LIMIT 1
                    `;
                    const dbResult = await query(sql, [`%${keyword}%`]);
                    let itemCost = 0;
                    if (dbResult.rows.length > 0) {
                        itemCost = dbResult.rows[0].retail_price * 730 * rate;
                    }

                    breakdown.push({
                        name: item.name || 'Unknown Component',
                        cost: parseFloat(itemCost.toFixed(2)),
                        note: dbResult.rows[0]?.sku_name || 'no match'
                    });
                    total += itemCost;
                }
            }
        }

        res.json({
            breakdown,
            total: parseFloat(total.toFixed(2)),
            currency,
        });

    } catch (err) {
        console.error('Calculate estimate tool error:', err);
        res.status(500).json({ error: 'Failed to calculate estimate', message: err.message });
    }
});

export default router;
