const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const testRoot = __dirname;
const databasePath = path.join(testRoot, "drink-group-buy-test.sqlite");
const schemaPath = path.join(testRoot, "schema.sql");
const seedPath = path.join(testRoot, "seed.sql");

if (fs.existsSync(databasePath)) {
  fs.rmSync(databasePath);
}

const database = new DatabaseSync(databasePath);

try {
  database.exec(fs.readFileSync(schemaPath, "utf8"));
  database.exec(fs.readFileSync(seedPath, "utf8"));
  database.exec("PRAGMA foreign_keys = ON;");
  console.log(`Created prototype test database: ${databasePath}`);
} finally {
  database.close();
}
