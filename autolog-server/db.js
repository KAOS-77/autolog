/*
 * MIGRAÇÃO PARA POSTGRESQL (quando necessário):
 *
 * 1. Instale as dependências:
 *      npm install pg
 *      npm uninstall better-sqlite3
 *
 * 2. Substitua a inicialização do banco:
 *      const { Pool } = require('pg');
 *      const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
 *      async function getDb() { return pool; }
 *
 * 3. Queries que precisam de atenção:
 *    - JSON_EACH (SQLite) → unnest(ARRAY[...]) ou jsonb_array_elements_text() (PostgreSQL)
 *    - service_types é armazenado como TEXT (JSON array) — no PG use coluna JSONB
 *    - db.prepare(...).run() → pool.query(text, params) — API assíncrona
 *    - better-sqlite3 é síncrono; pg é assíncrono (use async/await em todas as rotas)
 *
 * 4. Os IDs TEXT (uuid-like gerados pelo frontend) continuam compatíveis sem alteração.
 *
 * 5. No Railway: adicione o plugin PostgreSQL e use a variável DATABASE_URL gerada.
 */

const Database = require('better-sqlite3');
const path = require('path');

// Em produção no Railway: setar DB_PATH=/app/data/autolog.db (requer Volume configurado)
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'autolog.db');

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
