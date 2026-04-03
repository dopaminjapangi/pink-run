import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const modulePath = fileURLToPath(import.meta.url);
const packageRoot = path.resolve(path.dirname(modulePath), "..");

const defaultDbPath = path.join(packageRoot, "data", "app.db");
const dbPath = process.env.DB_PATH?.trim() || defaultDbPath;

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec("PRAGMA foreign_keys = ON;");

const migrationDir = path.join(packageRoot, "db", "migrations");
const migrationFiles = fs
  .readdirSync(migrationDir)
  .filter((name) => name.endsWith(".sql"))
  .sort((a, b) => a.localeCompare(b));

for (const fileName of migrationFiles) {
  const migrationSql = fs.readFileSync(path.join(migrationDir, fileName), "utf8");
  db.exec(migrationSql);
}

function hasColumn(tableName, columnName) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  return columns.some((column) => column.name === columnName);
}

if (!hasColumn("run_state", "player_lane")) {
  db.exec("ALTER TABLE run_state ADD COLUMN player_lane INTEGER NOT NULL DEFAULT 1;");
}

export function runInTransaction(fn) {
  db.exec("BEGIN;");
  try {
    const result = fn();
    db.exec("COMMIT;");
    return result;
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
}

export default db;
