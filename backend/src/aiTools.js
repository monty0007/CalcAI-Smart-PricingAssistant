import express from 'express';
import { query } from './db.js';

const router = express.Router();

/**
 * POST /api/tools/calculate_estimate
 * Called by the AI Assistant to convert a batch of workloads into an estimated cost breakdown.
 */
router.post('/calculate_estimate', async (req, res) => {
    try {
        const { items } = req.body;
        if (!items || !Array.isArray(items)) {
            return res.status(400).json({ error: 'items array is required' });
        }

        const breakdown = [];
        let total = 0;

        for (const item of items) {
            const { category, service, name, configuration } = item;

            // Build a dynamic search string from the configuration
            let searchKeywords = [];
            let isWindows = false;
            let isSpot = false;

            if (configuration) {
                const strCfg = JSON.stringify(configuration).toLowerCase();
                isWindows = strCfg.includes('windows');
                isSpot = strCfg.includes('spot') || strCfg.includes('low priority');

                if (configuration.sku) searchKeywords.push(configuration.sku);

                // Extract string values to use as keywords
                Object.values(configuration).forEach(val => {
                    if (typeof val === 'string' && val.length > 1 && val.length < 40) {
                        searchKeywords.push(val);
                    }
                });
            }
            if (service) searchKeywords.push(service);

            // Fuzzy match the DB using ILIKE
            let sql = `
                SELECT sku_name, product_name, raw_data->>'meterName' AS meter_name, retail_price, raw_data->>'unitOfMeasure' AS unit_of_measure, type
                FROM azure_prices
                WHERE currency_code = 'USD' AND is_active = TRUE
            `;
            const args = [];
            let paramIdx = 1;

            if (category === 'Compute' || category === 'Virtual Machines') {
                sql += ` AND service_name = 'Virtual Machines'`;
                if (isWindows) {
                    sql += ` AND product_name ILIKE '%Windows%'`;
                } else {
                    sql += ` AND product_name NOT ILIKE '%Windows%'`;
                }

                if (!isSpot) {
                    sql += ` AND product_name NOT ILIKE '%Spot%' AND product_name NOT ILIKE '%Low Priority%' AND sku_name NOT ILIKE '%Spot%' AND sku_name NOT ILIKE '%Low Priority%'`;
                }
            } else if (category === 'Storage' || category === 'Storage Accounts') {
                sql += ` AND service_name = 'Storage'`;
            }

            // Apply fuzzy search
            if (searchKeywords.length > 0) {
                // Try to find the SKU or product name match
                // Avoid using huge strings as keywords
                const importantKeyword = searchKeywords.find(k => k.length >= 3 && k.length <= 30) || searchKeywords[0];
                if (importantKeyword) {
                    // Try exact SKU match logic if it looks like a VM sku (e.g. contains v3, v4, v5, or matches word boundaries) 
                    const cleanSku = importantKeyword.replace(/_/g, ' ').trim();
                    sql += ` AND (sku_name ILIKE $${paramIdx} OR product_name ILIKE $${paramIdx} OR raw_data->>'meterName' ILIKE $${paramIdx})`;
                    args.push(`%${cleanSku}%`);
                    paramIdx++;
                }
            }

            // Order by cheapest to get a base price
            sql += ` ORDER BY retail_price ASC LIMIT 1`;

            const dbResult = await query(sql, args);

            let itemCost = 0;
            if (dbResult.rows.length > 0) {
                const row = dbResult.rows[0];
                // Try to guess a multiplier from configuration. If missing, assume 1 unit for 730 hours if Compute
                let multiplier = 1;

                if (configuration) {
                    const strCfg = JSON.stringify(configuration).toLowerCase();
                    const hoursMatch = strCfg.match(/(\\d+)\\s*(hours?|hr)/);
                    if (hoursMatch) {
                        multiplier *= parseInt(hoursMatch[1]);
                    } else if (category === 'Compute' || category === 'Virtual Machines') {
                        multiplier *= 730; // default 1 month
                    }

                    const qtyMatch = strCfg.match(/(?:quantity|count|instances?)["':\s]+(\\d+)/);
                    if (qtyMatch) {
                        multiplier *= parseInt(qtyMatch[1]);
                    } else if (configuration.quantity) {
                        multiplier *= Number(configuration.quantity);
                    }
                } else if (category === 'Compute' || category === 'Virtual Machines') {
                    multiplier = 730;
                }

                itemCost = row.retail_price * multiplier;
            }

            breakdown.push({
                name: name || service || 'Unknown Component',
                cost: parseFloat(itemCost.toFixed(2))
            });
            total += itemCost;
        }

        res.json({
            breakdown,
            total: parseFloat(total.toFixed(2)),
            currency: 'USD'
        });

    } catch (err) {
        console.error('Calculate estimate tool error:', err);
        res.status(500).json({ error: 'Failed to calculate estimate', message: err.message });
    }
});

export default router;
