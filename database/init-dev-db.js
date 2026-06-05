const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const databaseDir = __dirname;
const databasePath = path.join(databaseDir, "drink-group-buy-dev.sqlite");
const schemaPath = path.join(databaseDir, "schema.sql");

if (fs.existsSync(databasePath)) {
  fs.unlinkSync(databasePath);
}

const schema = fs.readFileSync(schemaPath, "utf8");
const database = new DatabaseSync(databasePath);

database.exec("PRAGMA foreign_keys = ON;");
database.exec(schema);
database.close();

console.log(`Created development database: ${databasePath}`);
