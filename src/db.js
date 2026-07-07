const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
for (const d of [DATA_DIR, path.join(DATA_DIR, 'media'), path.join(DATA_DIR, 'media', 'images'), path.join(DATA_DIR, 'media', 'uploads')]) {
  fs.mkdirSync(d, { recursive: true });
}

const db = new Database(path.join(DATA_DIR, 'site.db'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  date TEXT,
  body TEXT,
  images TEXT DEFAULT '[]',
  published INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  datum TEXT,
  titel TEXT,
  ort TEXT,
  hinweis TEXT,
  sort INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS galleries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  sort INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gallery_id INTEGER,
  file TEXT NOT NULL,
  caption TEXT,
  sort INTEGER DEFAULT 0
);
`);

module.exports = { db, DATA_DIR };
