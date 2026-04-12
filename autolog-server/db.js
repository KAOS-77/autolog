const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'autolog.db');

let db;

function getDb() {
  if (db) return db;

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS vehicles (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      make TEXT,
      model TEXT,
      year TEXT,
      trim TEXT,
      owner_name TEXT,
      owner_phone TEXT,
      owner_email TEXT,
      mileage TEXT,
      notes TEXT,
      photo TEXT,
      added_at TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS records (
      id TEXT PRIMARY KEY,
      vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id),
      date TEXT,
      mileage TEXT,
      service_types TEXT,
      notes TEXT,
      parts_used TEXT,
      parts_cost REAL,
      labor_cost REAL,
      tax_amount REAL,
      total_cost REAL,
      shop_name TEXT,
      shop_phone TEXT,
      shop_addr TEXT,
      tech_name TEXT,
      next_service TEXT,
      warranty TEXT,
      added_at TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_vehicles_user ON vehicles(user_id);
    CREATE INDEX IF NOT EXISTS idx_records_vehicle ON records(vehicle_id);
    CREATE INDEX IF NOT EXISTS idx_records_user ON records(user_id);
  `);

  return db;
}

module.exports = { getDb };
