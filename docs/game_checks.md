# Game Data Integrity Checks

Automated validation for the conversation graph and game state system. These checks catch bugs where the data *looks* valid JSON but creates broken gameplay — locked conversations, unreachable nodes, invalid references.

## Check Categories

### 1. Event Gate Integrity

**Problem:** Conversations gated by `type: "event"` or `type: "phase_event"` preconditions will be permanently locked if no `fire_event` exit effect ever fires that eventId.

**What to check:**
- For every precondition with `type: "event"` or `type: "phase_event"`, there must be at least one exit state somewhere that contains `{ "type": "fire_event", "eventId": "<matching_id>" }`.
- Events that should fire on a timer (e.g. Drusus's death if the player never talks to him) need a turn-based trigger mechanism — flag these as warnings if no fire_event exists.

**Engine context:** Prior to the fix, `checkSinglePrecondition` returned `true` for all event types, meaning event-gated conversations were always available. Now `firedEvents` is tracked in `GameState` and preconditions actually check it.

### 2. Conversation Reference Integrity

**What to check:**
- `unlock_conversation` and `lock_conversation` effects must reference conversation IDs that exist as actual `convo_*.json` files.
- `prior_exit_state` preconditions must reference:
  - A `conversationId` that exists
  - `requiredExitStateIds` that exist in that conversation's `exitStates` array

### 3. Node Graph Integrity

**What to check per conversation:**
- `entryNodeId` exists in the `nodes` map
- Every `nextNodeId` referenced by any option, response, or route exists in that conversation's `nodes` map
- Every `fallbackNodeId` on convergence nodes exists
- Every `exitStateId` on exit nodes matches an entry in `exitStates`
- No orphan nodes (nodes with no inbound edge except the entry node)
- All nodes are reachable from the entry node

### 4. Faction & Trait References

**What to check:**
- Every `factionId` in effects, preconditions, and convergence routes must be defined in `phase.json`
- Every trait in reputation effects, passive responses, convergence routes, visibility requirements, and roll bonuses must be one of: `severitas`, `clementia`, `audacia`, `calliditas`
- Every `npcId` in conversation files must have a corresponding `characters/<npcId>/npc.json`

### 5. Arc Length Consistency

**What to check:**
- Each NPC's `conversationArcLength` in `npc.json` must equal the number of `convo_*.json` files in that NPC's directory
- Sequence indices should be contiguous (0, 1, 2 — no gaps)

### 6. Direction Field

**What to check:**
- Every conversation should have a `direction` field (`"inbound"` or `"outbound"`)
- Inbound conversations don't cost a turn; outbound do. Missing direction defaults to outbound behavior.

## Running Checks

```bash
npx ts-node scripts/validate-phase.ts generation/output/romana_1
```

## Audit Results (2026-03-18)

### Bugs Found & Fixed

| Issue | Location | Fix |
|-------|----------|-----|
| Engine returned `true` for all event preconditions | `lib/engine.ts`, `ui/game.js` | Added `firedEvents: Set<string>` to `GameState`, preconditions now check it |
| `drusus_death` event gated but never fired | `aurelia/convo_1` required it, nothing fired it | Added `fire_event` to all 3 exit states of `marcus_drusus/convo_0` |
| `war_reaches_home` event gated but never fired | `aurelia/convo_2` required it, nothing fired it | Added `fire_event` to all 3 exit states of `aurelia/convo_1` |
| `titus_atticus/convo_2` referenced non-existent exit state | Precondition referenced `_exit_factional_informant` | Replaced with 4 actual faction-specific informant exit IDs |
| `marcus_drusus/npc.json` arc length wrong | `conversationArcLength: 1` but 2 convo files exist | Updated to 2 |
| `quintus_catulus/npc.json` arc length wrong | `conversationArcLength: 2` but 3 convo files exist | Updated to 3 |

### Passed Clean

- **Faction references**: All factionIds resolve to valid phase.json factions
- **Trait references**: All traits are valid (severitas, clementia, audacia, calliditas)
- **NPC references**: All npcIds have corresponding npc.json files
- **Node graph integrity**: All 27 conversations pass — every entryNodeId, nextNodeId, fallbackNodeId, exitStateId resolves correctly
- **unlock_conversation effects**: All 25 references point to existing conversations
- **Direction field**: 26/27 files have it (power_shift intentionally omitted — force-triggered)

### Known Acceptable Warnings

- `quintus_catulus/convo_2` has no `prior_exit_state` chain from convo_1 — by design, it gates on `optimates >= 3` faction standing instead
- `power_shift/convo.json` has no `direction` field — intentional, it's force-triggered at turn 0
- `power_shift/convo.json` uses `npcId: "narrator"` with no npc.json — intentional narrator/chorus figure

### Not Yet Implemented

- Turn-based auto-events (e.g. Drusus dying even if player never talks to him) — events currently only fire via `fire_event` exit effects

## Gameplay Rules

### Cooldown: No Repeat Character Visits

After finishing a conversation with an NPC, the player should not be able to immediately start another conversation with the same character. This prevents:
- Narratively absurd sequences (talking to Aurelia, then Aurelia again back-to-back)
- Exhausting an NPC's entire arc in one burst without interleaving other relationships
- Reducing the turn economy tension — the game should force you to spread your time across the cast

**Implementation:** Track `lastNpcId` in game state. `getAvailableConversations` filters out conversations whose `npcId` matches `lastNpcId`. The cooldown clears after any other conversation completes (not after a fixed number of turns).