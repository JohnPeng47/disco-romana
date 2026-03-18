# Game Loop

## Phase Loop

```
┌─────────────────────────────────────────┐
│              PHASE START                │
│  Load Phase: factions, NPCs, convos    │
│  Set turnsRemaining = totalMoves       │
└──────────────┬──────────────────────────┘
               ▼
┌─────────────────────────────────────────┐
│            TURN LOOP                    │
│                                         │
│  while turnsRemaining > 0:             │
│                                         │
│    1. Display available conversations   │
│       - Outbound: grouped by location  │
│         (costs 1 turn)                 │
│       - Inbound: driven by game state  │
│         (free)                         │
│                                         │
│    2. Player selects a conversation     │
│       (or refuses — signals power)     │
│                                         │
│    3. Run conversation graph            │
│       (see Conversation Flow below)    │
│                                         │
│    4. Apply ExitEffects:               │
│       - faction_standing deltas        │
│       - reputation deltas              │
│       - turn_penalty                   │
│       - unlock/lock conversations      │
│                                         │
│    5. If outbound: turnsRemaining -= 1 │
└──────────────┬──────────────────────────┘
               ▼
┌─────────────────────────────────────────┐
│           POWER SHIFT                   │
│  Triggers when turnsRemaining == 0     │
│                                         │
│  Run powerShiftConversationId          │
│  (a normal Conversation whose          │
│   ConvergenceNodes route based on      │
│   faction standings)                   │
│                                         │
│  Exit produces one of:                 │
│    rank_change → advance to next phase │
│    game_over   → end                   │
└──────────────┬──────────────────────────┘
               ▼
┌─────────────────────────────────────────┐
│          PHASE TRANSITION               │
│  If rank_change:                       │
│    Update currentRank                  │
│    Load nextPhaseId                    │
│    Apply faction shiftFates            │
│    (destroyed, splits, merges)         │
│    → back to PHASE START              │
│                                         │
│  If game_over:                         │
│    Show final narrative                │
│    End game                            │
└─────────────────────────────────────────┘
```

## Conversation Flow

Each conversation is a directed graph traversal:

```
entryNodeId
    │
    ▼
┌──────────┐
│ NodeBase │  NPC speaks (npcDialogue)
│          │  Optional conditionalPrefix from stub pool
└────┬─────┘
     │
     ▼ (node type determines what happens next)

PASSIVE NODE
  Player's reputation determines the response.
  First PassiveResponse whose trait >= threshold fires.
  If none match → fallbackResponse.
  Player does not choose. This is the lock-in mechanic.
  → routes to nextNodeId

ACTIVE NODE
  Player chooses from DialogueOptions.
  Options may be gated by visibilityRequirement (trait >= minValue).
  If a roll is attached, RollConfig determines success/partial/failure.
  Each outcome routes to a different nextNodeId.
  → routes to selected nextNodeId

NOOP NODE
  Player picks from flavor options. All lead to same nextNodeId.
  Keeps pacing natural without mechanical consequence.
  → routes to nextNodeId

CONVERGENCE NODE
  No player action. Evaluates conditions against game state:
    - reputation_dominant: which trait is highest
    - roll_history: how many successes so far
    - visited_node: was a specific node reached
    - faction_standing: standing with a faction >= min
  First match wins. Fallback if none match.
  → routes to nextNodeId

EXIT NODE
  Terminal. Produces an ExitState with effects.
  Conversation ends. Effects applied to GameState.
```

## Exit Effects

Applied after a conversation reaches an ExitNode:

| Effect | What it does |
|--------|-------------|
| `faction_standing` | Shifts standing with one or more factions (FactionDelta: factionId, shift, reason) |
| `reputation` | Shifts reputation traits (ReputationDelta: trait, shift, reason) |
| `turn_penalty` | Adds or removes turns from turnsRemaining |
| `unlock_conversation` | Makes a conversation available |
| `lock_conversation` | Removes a conversation from availability |
| `rank_change` | Advances player to a new rank (power shift outcome) |
| `game_over` | Ends the game (power shift failure) |

## Four Quadrants

How faction alignment and reputation compatibility interact during conversations:

| | Compatible Reputation | Incompatible Reputation |
|---|---|---|
| **Allied Faction** | Easy rolls, smooth flow. Commitment trap — easy to over-promise. | Tense. Faction loyalty keeps them talking, but your methods create friction. Sub-faction splits emerge here. |
| **Opposed Faction** | The seduction scenario. High-risk, high-reward. Can split the enemy faction. Your own faction notices you fraternizing. | Pure hostility. Force and wealth are the only leverage. Coercion, not persuasion — others notice. |
