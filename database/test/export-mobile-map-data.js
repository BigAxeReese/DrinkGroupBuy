const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const databasePath = path.join(__dirname, "drink-group-buy-test.sqlite");
const outputPath = path.resolve(__dirname, "../../mobile/src/mock/databaseMapStores.js");
const database = new DatabaseSync(databasePath, { readOnly: true });

try {
  const stores = database.prepare(`
    SELECT
      stores.id,
      stores.name,
      stores.address,
      stores.phone,
      stores.business_status AS businessStatus,
      stores.distance_text AS distanceText,
      stores.latitude,
      stores.longitude,
      EXISTS (
        SELECT 1
        FROM deals
        WHERE deals.store_id = stores.id
          AND deals.status = 'recruiting'
      ) AS hasRecruitingDeal,
      (
        SELECT deals.id
        FROM deals
        WHERE deals.store_id = stores.id
          AND deals.status = 'recruiting'
        ORDER BY deals.created_at DESC
        LIMIT 1
      ) AS recruitingDealId
    FROM stores
    ORDER BY stores.id
  `).all().map((store) => ({
    ...store,
    hasRecruitingDeal: Boolean(store.hasRecruitingDeal)
  }));

  const contents = [
    "// Generated from database/test/drink-group-buy-test.sqlite.",
    "// Prototype only, not final API contract. Run database/test/export-mobile-map-data.js after reseeding.",
    "",
    `export const databaseMapStores = ${JSON.stringify(stores, null, 2)};`,
    ""
  ].join("\n");

  fs.writeFileSync(outputPath, contents, "utf8");
  console.log(`Exported ${stores.length} prototype map stores to ${outputPath}`);
} finally {
  database.close();
}
