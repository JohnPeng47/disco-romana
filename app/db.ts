import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'playthrough.db');

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
    _db.exec(`
      CREATE TABLE IF NOT EXISTS playthroughs (
        id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL DEFAULT (unixepoch())
      );
      CREATE TABLE IF NOT EXISTS steps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        playthrough_id TEXT NOT NULL REFERENCES playthroughs(id),
        conversation_id TEXT NOT NULL,
        node_id TEXT NOT NULL,
        action TEXT NOT NULL,
        ts INTEGER NOT NULL,
        choice_index INTEGER,
        choice_text TEXT,
        UNIQUE(playthrough_id, conversation_id, node_id, action, ts)
      );
      CREATE INDEX IF NOT EXISTS idx_steps_playthrough ON steps(playthrough_id);
    `);
  }
  return _db;
}
