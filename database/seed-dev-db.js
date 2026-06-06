const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const databasePath = path.join(__dirname, "drink-group-buy-dev.sqlite");
const seedPath = path.join(__dirname, "seed-dev.sql");

const seed = fs.readFileSync(seedPath, "utf8");
const database = new DatabaseSync(databasePath);

database.exec("PRAGMA foreign_keys = ON;");
database.exec(seed);
database.close();

console.log(`Seeded development database: ${databasePath}`);
