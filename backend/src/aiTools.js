import express from 'express';
import { query } from './db.js';

const router = express.Router();

/**
 * POST /api/tools/calculate_estimate
 * Called by the AI Assistant to convert a batch of workloads into an estimated cost breakdown.
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
            const { category, service, name, configuration = {} } = item;
            const cfg = configuration || {};

            // Normalised helpers
            const catLow = (category || '').toLowerCase();
            const svcLow = (service || '').toLowerCase();
            const cfgStr = JSON.stringify(cfg).toLowerCase();

            const isWindows = cfgStr.includes('windows');
            const isSpot = cfgStr.includes('spot') || cfgStr.includes('low priority');
            const is1Year = cfgStr.includes('1 year') || (cfg.reservation || '').toLowerCase().includes('1 year');
            const is3Year = cfgStr.includes('3 year') || (cfg.reservation || '').toLowerCase().includes('3 year');
            const region = (cfg.region || 'centralindia').toLowerCase().replace(/\s+/g, '');

            let sql = '';
            const args = [];
            let paramIdx = 1;

            // ──────────────────────────────────────────────
            // COMPUTE — Virtual Machines
            // ──────────────────────────────────────────────
            if (catLow === 'compute' || svcLow === 'virtual machines') {
                sql = `
                    SELECT sku_name, product_name, raw_data->>'meterName' AS meter_name,
                           retail_price, raw_data->>'unitOfMeasure' AS unit_of_measure
                    FROM azure_prices
                    WHERE currency_code = 'USD'
                      AND is_active = TRUE
                      AND service_name = 'Virtual Machines'
                `;

                if (region) { sql += ` AND arm_region_name = $${paramIdx}`; args.push(region); paramIdx++; }

                if (isWindows && !is1Year && !is3Year) {
                    sql += ` AND product_name ILIKE '%Windows%'`;
                } else if (!is1Year && !is3Year) {
                    sql += ` AND product_name NOT ILIKE '%Windows%'`;
                }

                if (!isSpot) {
                    sql += ` AND product_name NOT ILIKE '%Spot%' AND product_name NOT ILIKE '%Low Priority%'
                             AND sku_name NOT ILIKE '%Spot%' AND sku_name NOT ILIKE '%Low Priority%'`;
                }

                if (is1Year) {
                    sql += ` AND type = 'Reservation' AND reservation_term ILIKE '%1 Year%'`;
                } else if (is3Year) {
                    sql += ` AND type = 'Reservation' AND (reservation_term ILIKE '%3 Year%' OR reservation_term ILIKE '%3 Years%')`;
                } else {
                    sql += ` AND type = 'Consumption'`;
                }

                // SKU match
                if (cfg.sku) {
                    // Normalize spaces and underscores to % so "D8s v5" matches "Standard_D8s_v5"
                    const cleanSku = cfg.sku.replace(/[_\s]+/g, '%').trim();
                    sql += ` AND sku_name ILIKE $${paramIdx}`;
                    args.push(`%${cleanSku}%`);
                    paramIdx++;
                }

                // Don't limit to 1 immediately so we can sort by retail_price if multiple meters exist. 
                // However, the base query order by is fine.
                sql += ` AND retail_price > 0 ORDER BY retail_price ASC LIMIT 1`;

                console.log('VM SQL:', sql, args);
                const dbResult = await query(sql, args);
                let itemCost = 0;
                let osNote = '';

                if (dbResult.rows.length > 0) {
                    const row = dbResult.rows[0];
                    const qty = cfg.quantity || 1;

                    // Reservations are returned as total upfront prices (1 year or 3 years).
                    if (is1Year) {
                        itemCost = (row.retail_price / 12) * qty * rate;
                    } else if (is3Year) {
                        itemCost = (row.retail_price / 36) * qty * rate;
                    } else {
                        itemCost = row.retail_price * 730 * qty * rate;
                    }

                    // Add OS Cost if this is a Windows VM on a reservation (which only covers base compute)
                    if (isWindows && (is1Year || is3Year)) {
                        const cleanSku = (cfg.sku || '').replace(/[_\s]+/g, '%').trim();
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
                        `;
                        const osArgs = [`%${cleanSku}%`, region || 'centralindia'];
                        const osRes = await query(osSql, osArgs);
                        if (osRes.rows.length > 0 && osRes.rows[0].os_price_per_hour > 0) {
                            const osMonthlyCost = osRes.rows[0].os_price_per_hour * 730 * qty * rate;
                            itemCost += osMonthlyCost;
                            osNote = ' + Windows OS License';
                        }
                    }

                } else {
                    console.warn(`No VM match for sku=${cfg.sku}, region=${region}`);
                }

                breakdown.push({
                    name: name || `VM – ${cfg.sku || service}`,
                    cost: parseFloat(itemCost.toFixed(2)),
                    note: (dbResult.rows[0]?.sku_name || 'no match') + osNote,
                    debug_sql: sql,
                    debug_args: args
                });
                total += itemCost;
                continue;
            }

            // ──────────────────────────────────────────────
            // STORAGE — Managed Disks
            // ──────────────────────────────────────────────
            if (svcLow.includes('managed disk') || (catLow === 'storage' && cfg.diskType)) {
                sql = `
                    SELECT sku_name, product_name, raw_data->>'meterName' AS meter_name,
                           retail_price, raw_data->>'unitOfMeasure' AS unit_of_measure
                    FROM azure_prices
                    WHERE currency_code = 'USD'
                      AND is_active = TRUE
                      AND service_name = 'Storage'
                `;

                if (region) { sql += ` AND arm_region_name = $${paramIdx}`; args.push(region); paramIdx++; }

                // diskTier filter
                const diskTier = cfg.diskTier || '';
                if (diskTier.toLowerCase().includes('premium')) {
                    sql += ` AND product_name ILIKE '%Premium SSD%'`;
                } else if (diskTier.toLowerCase().includes('standard ssd') || diskTier === '') {
                    sql += ` AND product_name ILIKE '%Standard SSD%'`;
                } else if (diskTier.toLowerCase().includes('standard hdd') || diskTier.toLowerCase().includes('standard')) {
                    sql += ` AND product_name ILIKE '%Standard HDD%'`;
                }

                // diskRedundancy and Type filters
                const redundancy = (cfg.diskRedundancy || 'LRS').toUpperCase();
                const dType = cfg.diskType || '';

                // Usually sku_name format is "E10 LRS"
                if (dType && redundancy) {
                    sql += ` AND sku_name ILIKE $${paramIdx}`;
                    args.push(`%${dType} ${redundancy}%`);
                    paramIdx++;
                } else if (dType) {
                    sql += ` AND sku_name ILIKE $${paramIdx}`;
                    args.push(`%${dType}%`);
                    paramIdx++;
                } else {
                    sql += ` AND sku_name ILIKE $${paramIdx}`;
                    args.push(`%${redundancy}%`);
                    paramIdx++;
                }

                // Exclude transaction meters, we want the disk capacity pricing
                // The main disk capacity has meter_name = 'E10 Disks' etc, not 'Data Stored' for operations
                sql += ` AND retail_price > 0 AND (raw_data->>'meterName' IS NULL OR (raw_data->>'meterName' NOT ILIKE '%Transaction%' AND raw_data->>'meterName' NOT ILIKE '%Operation%'))`;

                sql += ` ORDER BY retail_price ASC LIMIT 1`;

                const dbResult = await query(sql, args);
                let itemCost = 0;
                if (dbResult.rows.length > 0) {
                    const qty = cfg.quantity || 1;
                    itemCost = dbResult.rows[0].retail_price * qty * rate;
                } else {
                    console.warn(`No Managed Disk match for diskType=${cfg.diskType}, tier=${diskTier}, redundancy=${redundancy}`);
                }

                breakdown.push({
                    name: name || `Disk – ${cfg.diskType || service}`,
                    cost: parseFloat(itemCost.toFixed(2)),
                    note: dbResult.rows[0]?.sku_name || 'no match'
                });
                total += itemCost;
                continue;
            }

            // ──────────────────────────────────────────────
            // NETWORKING — Bandwidth / Data Transfer
            // ──────────────────────────────────────────────
            if (catLow === 'networking' && (svcLow.includes('bandwidth') || svcLow.includes('egress') || svcLow.includes('content delivery') || cfg.dataTransferGB)) {
                sql = `
                    SELECT sku_name, product_name, raw_data->>'meterName' AS meter_name,
                           retail_price, raw_data->>'unitOfMeasure' AS unit_of_measure
                    FROM azure_prices
                    WHERE currency_code = 'USD'
                      AND is_active = TRUE
                      AND service_name = 'Bandwidth'
                `;

                // Bandwidth pricing is often grouped by Zones (Zone 1, Zone 2 etc) rather than specific regions 
                // like 'centralindia', so omitting the strict region match prevents returning 0 rows.

                const transferType = (cfg.transferType || 'Internet egress').toLowerCase();
                if (transferType.includes('inter region') || transferType.includes('inter-region')) {
                    sql += ` AND (raw_data->>'meterName' ILIKE '%Inter-Region%' OR raw_data->>'meterName' ILIKE '%Zone 1%')`;
                } else {
                    sql += ` AND raw_data->>'meterName' ILIKE '%Data Transfer Out%'`;
                }

                sql += ` ORDER BY retail_price ASC LIMIT 1`;

                const dbResult = await query(sql, args);
                let itemCost = 0;
                if (dbResult.rows.length > 0) {
                    const gb = cfg.dataTransferGB || 0;
                    itemCost = dbResult.rows[0].retail_price * gb * rate;
                }

                breakdown.push({
                    name: name || `Bandwidth – ${cfg.dataTransferGB || 0} GB`,
                    cost: parseFloat(itemCost.toFixed(2)),
                    note: dbResult.rows[0]?.meter_name || 'no match'
                });
                total += itemCost;
                continue;
            }

            // ──────────────────────────────────────────────
            // NETWORKING — IP Addresses
            // ──────────────────────────────────────────────
            if (catLow === 'networking' && svcLow.includes('ip')) {
                sql = `
                    SELECT retail_price, raw_data->>'meterName' AS meter_name, sku_name
                    FROM azure_prices
                    WHERE currency_code = 'USD'
                      AND is_active = TRUE
                      AND service_name ILIKE '%IP Addresses%'
                      AND raw_data->>'meterName' ILIKE '%Static%'
                    ORDER BY retail_price ASC LIMIT 1
                `;

                const dbResult = await query(sql, []);
                let itemCost = 0;
                if (dbResult.rows.length > 0) {
                    const qty = cfg.quantity || 1;
                    itemCost = dbResult.rows[0].retail_price * 730 * qty * rate;
                }

                breakdown.push({
                    name: name || 'Public IP Address',
                    cost: parseFloat(itemCost.toFixed(2)),
                    note: dbResult.rows[0]?.meter_name || 'no match'
                });
                total += itemCost;
                continue;
            }

            // ──────────────────────────────────────────────
            // SECURITY — Microsoft Defender for Cloud
            // ──────────────────────────────────────────────
            if (catLow === 'security' || svcLow.includes('defender')) {
                sql = `
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
                    const servers = cfg.serverCount || 1;
                    itemCost = dbResult.rows[0].retail_price * servers * 730 * rate;
                }

                breakdown.push({
                    name: name || 'Microsoft Defender for Cloud',
                    cost: parseFloat(itemCost.toFixed(2)),
                    note: dbResult.rows[0]?.meter_name || 'no match'
                });
                total += itemCost;
                continue;
            }

            // ──────────────────────────────────────────────
            // DEVOPS — Azure Monitor / Log Analytics
            // ──────────────────────────────────────────────
            if (catLow === 'devops' || svcLow.includes('monitor') || svcLow.includes('log analytics')) {
                sql = `
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
                    const gbPerDay = cfg.dataIngestionGB || 0.2;
                    itemCost = dbResult.rows[0].retail_price * gbPerDay * 30 * rate;
                }

                breakdown.push({
                    name: name || 'Azure Monitor Log Analytics',
                    cost: parseFloat(itemCost.toFixed(2)),
                    note: dbResult.rows[0]?.meter_name || 'no match'
                });
                total += itemCost;
                continue;
            }

            // ──────────────────────────────────────────────
            // GENERIC FALLBACK — keyword search
            // ──────────────────────────────────────────────
            {
                const keyword = cfg.sku || service || category || '';
                sql = `
                    SELECT retail_price, raw_data->>'meterName' AS meter_name, sku_name
                    FROM azure_prices
                    WHERE currency_code = 'USD'
                      AND is_active = TRUE
                      AND (sku_name ILIKE $1 OR product_name ILIKE $1 OR service_name ILIKE $1)
                    ORDER BY retail_price ASC LIMIT 1
                `;
                const dbResult = await query(sql, [`%${keyword}%`]);
                let itemCost = 0;
                if (dbResult.rows.length > 0) {
                    itemCost = dbResult.rows[0].retail_price * 730 * rate;
                }

                breakdown.push({
                    name: name || service || 'Unknown Component',
                    cost: parseFloat(itemCost.toFixed(2)),
                    note: dbResult.rows[0]?.sku_name || 'no match'
                });
                total += itemCost;
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
