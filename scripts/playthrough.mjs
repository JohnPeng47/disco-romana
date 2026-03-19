#!/usr/bin/env node

/**
 * Query playthrough data from the SQLite database.
 *
 * Usage:
 *   node scripts/playthrough.mjs                           # list all playthroughs
 *   node scripts/playthrough.mjs <playthroughId>           # show full log
 *   node scripts/playthrough.mjs <pin>                     # show steps up to PIN
 *
 * PIN format: playthroughId::conversationId::nodeId
 */

import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '..', 'playthrough.db');

if (!existsSync(DB_PATH)) {
  console.error('No playthrough.db found. Play the game first to generate data.');
  process.exit(1);
}

const db = new Database(DB_PATH, { readonly: true });
const arg = process.argv[2];

if (!arg) {
  // List all playthroughs
  const rows = db.prepare(`
    SELECT p.id, datetime(p.created_at, 'unixepoch', 'localtime') as created,
           COUNT(s.id) as steps
    FROM playthroughs p
    LEFT JOIN steps s ON s.playthrough_id = p.id
    GROUP BY p.id
    ORDER BY p.created_at DESC
  `).all();

  if (rows.length === 0) {
    console.log('No playthroughs recorded yet.');
  } else {
    console.log(`${rows.length} playthrough(s):\n`);
    for (const r of rows) {
      console.log(`  ${r.id}  ${r.created}  (${r.steps} steps)`);
    }
  }
  process.exit(0);
}

// Check if it's a PIN (contains ::) or a plain playthroughId
const parts = arg.split('::');
const playthroughId = parts[0];

// Verify playthrough exists
const pt = db.prepare('SELECT * FROM playthroughs WHERE id = ?').get(playthroughId);
if (!pt) {
  console.error(`Playthrough '${playthroughId}' not found.`);
  process.exit(1);
}

let steps;
let label;

if (parts.length === 3) {
  // PIN: playthroughId::conversationId::nodeId
  const [, convoId, nodeId] = parts;

  const target = db.prepare(
    'SELECT ts FROM steps WHERE playthrough_id = ? AND conversation_id = ? AND node_id = ? LIMIT 1'
  ).get(playthroughId, convoId, nodeId);

  if (!target) {
    console.error(`Node ${convoId}::${nodeId} not found in playthrough ${playthroughId}.`);
    process.exit(1);
  }

  steps = db.prepare(
    'SELECT conversation_id, node_id, action, ts, choice_index, choice_text FROM steps WHERE playthrough_id = ? AND ts <= ? ORDER BY ts ASC'
  ).all(playthroughId, target.ts);

  label = `Steps up to ${convoId}::${nodeId}`;
} else {
  // Full log
  steps = db.prepare(
    'SELECT conversation_id, node_id, action, ts, choice_index, choice_text FROM steps WHERE playthrough_id = ? ORDER BY ts ASC'
  ).all(playthroughId);

  label = `Full playthrough`;
}

console.log(`\n${label} [${playthroughId}] (${steps.length} steps):\n`);

let currentConvo = null;
for (const s of steps) {
  if (s.conversation_id !== currentConvo) {
    currentConvo = s.conversation_id;
    console.log(`  -- ${currentConvo} --`);
  }
  const time = new Date(s.ts).toLocaleTimeString();
  if (s.action === 'choice') {
    console.log(`    CHOSE [${s.choice_index}] at ${s.node_id}  (${time})`);
    console.log(`           "${s.choice_text}"`);
  } else {
    console.log(`    ${s.action.padEnd(8)} ${s.node_id}  (${time})`);
  }
}

db.close();
