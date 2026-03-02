import 'dotenv/config';
import { query } from './src/db.js';

(async () => {
  try {
    const res = await query(`
      SELECT retail_price, raw_data->>'meterName' AS meter_name, sku_name, product_name
      FROM azure_prices
      WHERE service_name = 'Bandwidth'
        AND retail_price > 0
      LIMIT 10
    `);
    console.log('Bandwidth rows:', res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
})();
