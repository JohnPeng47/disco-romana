# Debug Conversation PIN

You are debugging a conversation playthrough in the Disco Romana game engine.

## Input

The user provided a PIN and optional issue description: `$ARGUMENTS`

A PIN has the format `playthroughId::conversationId::nodeId`. Parse it to extract the three parts.

## Steps

### 1. Fetch playthrough data

Use the playthrough API to get all steps up to the pinned node:

```bash
curl -s "http://localhost:3003/api/playthrough?id={playthroughId}&upTo={conversationId}::{nodeId}"
```

If the API is not running or returns an error, fall back to reading the SQLite database directly:

```bash
npx tsx -e "
const { getDb } = require('./app/db');
const db = getDb();
const steps = db.prepare(
  'SELECT conversation_id, node_id, action, ts, choice_index, choice_text FROM steps WHERE playthrough_id = ? ORDER BY ts ASC'
).all('{playthroughId}');
console.log(JSON.stringify(steps, null, 2));
"
```

### 2. Load conversation data

Read the conversation JSON file for the pinned conversation:

- Conversation files are in `generation/output/romana_1/characters/{npcId}/convo_{N}.json`
- The conversationId follows the pattern `{npcId}_convo_{N}`
- Extract the npcId and sequence number from the conversationId
- Also read the NPC definition from `generation/output/romana_1/characters/{npcId}/npc.json`

### 3. Replay game state to the PIN

Use the engine to reconstruct the game state at the pinned moment:

```bash
npx tsx -e "
const { romanaConfig } = require('./presets/romana');
const { initState } = require('./engine/runtime/init');
const { applyExitEffects } = require('./engine/runtime/effects');
const { readAxis } = require('./engine/axes');
const { loadGameData } = require('./app/data-loader');

const data = loadGameData('./generation/output/romana_1');
const axisKeys = {
  factions: data.phase.factions.map(f => f.id),
  personalFavors: Object.keys(data.npcs),
};
let state = initState(romanaConfig, {
  phaseId: data.phase.id,
  totalMoves: data.phase.totalMoves,
  axisKeys,
});

// Print initial state
console.log('=== INITIAL STATE ===');
console.log(JSON.stringify({ reputation: state.reputation, axes: state.axes, rank: state.currentRank }, null, 2));

// TODO: replay playthrough steps here to reconstruct state at the PIN
// For each completed conversation (start → exit sequence), apply exit effects

console.log('=== STATE AT PIN ===');
console.log(JSON.stringify({ reputation: state.reputation, axes: state.axes, rank: state.currentRank, turns: state.turnsRemaining }, null, 2));
"
```

### 4. Analyze the pinned node

Once you have the game state and conversation data at the PIN:

- **Identify the node type** (active, passive, noop, convergence, exit) at the pinned nodeId
- **For passive nodes**: Check which trait response would fire given current reputation. Show the threshold comparison for each response.
- **For active nodes**: Show all dialogue options, their visibility requirements (would they be locked?), and roll configs with computed modifiers from current axes state.
- **For convergence nodes**: Evaluate each route condition against current state to show which branch would be taken.
- **For exit nodes**: Show the exit state effects that would be applied (axis shifts, reputation changes, etc.)

### 5. Trace the path

Using the playthrough steps, reconstruct the path the player took through the conversation graph:

- Which nodes were visited in order
- What choices were made at active/noop nodes
- What passive responses fired
- What roll outcomes occurred

Show this as a compact trace:
```
aurelia_convo_0_n01 (passive) → clementia speaks → n03
aurelia_convo_0_n03 (active) → choice 1: "..." → n05
aurelia_convo_0_n05 (active) → choice 0: "..." [ROLL: 2d6+3 = 9 vs 7 SUCCESS] → n08
aurelia_convo_0_n08 (exit) → exit_trusted → [populares +2, clementia +1]
```

### 6. Investigate the issue

With all context assembled, investigate whatever issue the user described. Common issues include:

- **Wrong passive response firing**: Check reputation values vs thresholds
- **Conversation not available**: Check preconditions against current state (axis gates, prior exit states, rank)
- **Roll too hard/easy**: Compute the full modifier breakdown (axis values × weights + reputation bonus)
- **Wrong convergence branch**: Evaluate each condition in order, show which matches first
- **Missing effects**: Check exit state effects array in the conversation JSON
- **Stuck/broken path**: Check if nextNodeId references exist in the nodes map

## Output

Present your findings clearly:
1. **PIN context**: What conversation, what NPC, what node, what node type
2. **State at PIN**: Key reputation values, relevant axis values, rank, turns
3. **Path trace**: How the player got here
4. **Issue analysis**: What you found related to the described issue
5. **Suggested fix**: If applicable, what needs to change in the conversation JSON or engine code
