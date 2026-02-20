import { query } from './src/db.js';

async function checkDuplicates() {
  console.log("Checking total count...");
  const countRes = await query('SELECT COUNT(*) as total FROM azure_prices');
  console.log("Total rows:", countRes.rows[0].total);

  console.log("\nChecking duplicates based on (sku_id, meter_id, currency_code, type, arm_region_name, reservation_term)...");
  const dupeQuery = `
    SELECT sku_id, meter_id, currency_code, type, arm_region_name, reservation_term, count(*) as count
    FROM azure_prices
    GROUP BY sku_id, meter_id, currency_code, type, arm_region_name, reservation_term
    HAVING count(*) > 1
    ORDER BY count DESC
    LIMIT 10;
  `;
  const dupesRes = await query(dupeQuery);
  if (dupesRes.rows.length > 0) {
    console.log(`Found duplicate groups! Top 10 JSON:`);
    console.log(JSON.stringify(dupesRes.rows, null, 2));

    // Total duplicate rows count
    const totalDupesQuery = `
      WITH dupe_counts AS (
        SELECT count(*) - 1 as extra
        FROM azure_prices
        GROUP BY sku_id, meter_id, currency_code, type, arm_region_name, reservation_term
        HAVING count(*) > 1
      )
      SELECT sum(extra) as total_duplicates FROM dupe_counts;
    `;
    const totalDupes = await query(totalDupesQuery);
    console.log("Total duplicate rows to remove:", totalDupes.rows[0].total_duplicates || 0);
  } else {
    console.log("No duplicates found with full unique key!");
  }

  process.exit();
}
checkDuplicates().catch(err => {
  console.error(err);
  process.exit(1);
});
