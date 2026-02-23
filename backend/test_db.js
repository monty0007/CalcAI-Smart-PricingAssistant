import db from './src/db.js';

const search = 'b16pls v2';
const region = 'eastus';

const sql = `
    SELECT
        CONCAT('Standard_', REPLACE(TRIM(p.sku_name), ' ', '_')) AS sku_key,
        p.sku_name                                                AS raw_sku,
        MIN(CASE WHEN LOWER(p.product_name) NOT LIKE '%windows%'
                 THEN p.retail_price END)                         AS linux_usd,
        MIN(CASE WHEN LOWER(p.product_name) LIKE '%windows%'
                 THEN p.retail_price END)                         AS windows_usd
    FROM azure_prices p
    WHERE
        p.arm_region_name = $1
        AND p.currency_code = 'USD'
        AND p.is_active = TRUE
        AND p.service_name = 'Virtual Machines'
        AND p.type = 'Consumption'
        AND LOWER(p.sku_name) NOT LIKE '%spot%'
        AND LOWER(p.sku_name) NOT LIKE '%low priority%'
        AND LOWER(p.sku_name) LIKE $2
    GROUP BY p.sku_name
    ORDER BY p.sku_name ASC
`;

db.query(sql, [region, `%${search}%`])
    .then(res => { console.log(JSON.stringify(res.rows, null, 2)); process.exit(0); })
    .catch(err => { console.error(err); process.exit(1); });
