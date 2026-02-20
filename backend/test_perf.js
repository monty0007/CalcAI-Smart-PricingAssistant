import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function test() {
    console.log("Starting test queries...");

    console.time("getBestVmPrices");
    const sql1 = `
    SELECT sku_name, MIN(retail_price) as min_price, arm_region_name
    FROM azure_prices
    WHERE service_name = 'Virtual Machines'
      AND type = 'Consumption'
      AND retail_price > 0
      AND currency_code = 'USD'
      AND product_name NOT ILIKE '%Windows%'
      AND product_name NOT ILIKE '%Spot%'
      AND product_name NOT ILIKE '%Low Priority%'
      AND is_active = TRUE
    GROUP BY sku_name, arm_region_name
  `;
    await pool.query(sql1);
    console.timeEnd("getBestVmPrices");

    console.time("queryPrices");
    const sql2 = `
        SELECT p.*
        FROM azure_prices p
        WHERE p.currency_code = 'USD' AND p.is_active = TRUE AND p.retail_price > 0
        ORDER BY p.retail_price ASC
        LIMIT 1
  `;
    await pool.query(sql2);
    console.timeEnd("queryPrices");

    process.exit(0);
}

test().catch(console.error);
