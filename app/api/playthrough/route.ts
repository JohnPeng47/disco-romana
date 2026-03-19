import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@lib/db';

// POST /api/playthrough — flush steps from the client
// Body: { playthroughId: string, steps: { conversationId, nodeId, action, ts }[] }
export async function POST(req: NextRequest) {
  const { playthroughId, steps } = await req.json();
  if (!playthroughId || !Array.isArray(steps) || steps.length === 0) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const db = getDb();

  // Upsert playthrough
  db.prepare('INSERT OR IGNORE INTO playthroughs (id) VALUES (?)').run(playthroughId);

  // Insert steps (ignore dupes)
  const insert = db.prepare(
    'INSERT OR IGNORE INTO steps (playthrough_id, conversation_id, node_id, action, ts, choice_index, choice_text) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  const tx = db.transaction((rows: typeof steps) => {
    for (const s of rows) {
      insert.run(playthroughId, s.conversationId, s.nodeId, s.action, s.ts, s.choiceIndex ?? null, s.choiceText ?? null);
    }
  });
  tx(steps);

  return NextResponse.json({ ok: true, count: steps.length });
}

// GET /api/playthrough?id=xxx — get full playthrough log
// GET /api/playthrough?id=xxx&upTo=convoId::nodeId — get steps up to a node
// GET /api/playthrough (no id) — list all playthroughs
export async function GET(req: NextRequest) {
  const db = getDb();
  const id = req.nextUrl.searchParams.get('id');

  if (!id) {
    const rows = db.prepare(
      'SELECT p.id, p.created_at, COUNT(s.id) as step_count FROM playthroughs p LEFT JOIN steps s ON s.playthrough_id = p.id GROUP BY p.id ORDER BY p.created_at DESC'
    ).all();
    return NextResponse.json(rows);
  }

  const upTo = req.nextUrl.searchParams.get('upTo');
  let steps;

  if (upTo) {
    const [convoId, nodeId] = upTo.split('::');
    // Find the timestamp of the target step
    const target = db.prepare(
      'SELECT ts FROM steps WHERE playthrough_id = ? AND conversation_id = ? AND node_id = ? LIMIT 1'
    ).get(id, convoId, nodeId) as { ts: number } | undefined;

    if (!target) {
      return NextResponse.json({ error: 'Node not found in playthrough' }, { status: 404 });
    }

    steps = db.prepare(
      'SELECT conversation_id, node_id, action, ts, choice_index, choice_text FROM steps WHERE playthrough_id = ? AND ts <= ? ORDER BY ts ASC'
    ).all(id, target.ts);
  } else {
    steps = db.prepare(
      'SELECT conversation_id, node_id, action, ts, choice_index, choice_text FROM steps WHERE playthrough_id = ? ORDER BY ts ASC'
    ).all(id);
  }

  return NextResponse.json({ playthroughId: id, steps });
}
