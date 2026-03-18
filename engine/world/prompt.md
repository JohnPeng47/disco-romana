# Phase Generation Prompt

You are generating one phase of a text-based grand strategy game set in the Late Roman Republic (~130–27 BC). The game is Disco Elysium meets Civilization — the player progresses entirely through conversations. There are no armies to command or cities to build. Power comes from who you talk to, what you promise, and which factions you align with.

## Your Output

You will write files into the current working directory. The folder structure must be exactly:

```
phase.json                          # phase metadata, factions, stubs, NPC index
characters/
  <npc_id>/
    npc.json                        # NpcDefinition
    convo_0.json                    # first conversation in arc
    convo_1.json                    # second conversation (if any)
    convo_2.json                    # third conversation (if any)
power_shift/
  convo.json                        # the power shift conversation
```

All files must be valid JSON — no comments, no trailing commas.

### Consistency Contract

IDs must be consistent across all files. When you reference an ID, it must exist:

- Every `npcId` in a conversation must match an `npc.json` in `characters/<npc_id>/`
- Every `factionId` referenced in any file must be defined in `phase.json` factions
- Every `conversationId` in preconditions or exit effects must correspond to an actual conversation file
- Every `nodeId` referenced by `nextNodeId`, `entryNodeId`, or `fallbackNodeId` must exist in that conversation's `nodes` map
- Every `exitStateId` in an ExitNode must match an entry in that conversation's `exitStates` array
- `phase.json` `powerShiftConversationId` must be `"power_shift"` (matching `power_shift/convo.json`)
- NPC `conversationArcLength` in `npc.json` must equal the number of `convo_*.json` files in that NPC's folder

**ID conventions:**
- NPC IDs: snake_case name, e.g. `"marcus_crassus"`, `"gaius_marius"`
- Conversation IDs: `"<npc_id>_convo_<index>"`, e.g. `"marcus_crassus_convo_0"`
- Node IDs: `"<convo_id>_n<number>"`, e.g. `"marcus_crassus_convo_0_n01"`
- Exit state IDs: `"<convo_id>_exit_<label>"`, e.g. `"marcus_crassus_convo_0_exit_alliance"`
- Power shift conversation ID: `"power_shift"`
- Power shift node IDs: `"ps_n<number>"`
- Power shift exit state IDs: `"ps_exit_<label>"`

## Game Setting

The player is a Roman political actor navigating the final century of the Republic. Four reputation traits define their character:

- **severitas** — discipline, tradition, harsh justice. The Cato archetype.
- **clementia** — mercy, generosity, political forgiveness. The Caesar archetype.
- **audacia** — boldness, risk-taking, military daring. The Pompey archetype.
- **calliditas** — cunning, manipulation, backroom dealing. The Crassus archetype.

Three ranks mark progression: **citizen** → **magistrate** → **consul**.

## Phase Input

You will receive:

- `phaseId` — the ID for this phase
- `narrativePeriod` — the historical period (e.g. "Social War, ~91–87 BC")
- `playerRank` — the player's current rank ("citizen", "magistrate", or "consul")
- `totalMoves` — how many outbound turns the player gets
- `factions` — the active factions for this phase, with their power shift fates
- `nextPhaseId` — the ID of the next phase (null if final)
- `narrativeAnchors` — historical events that MUST appear in the phase
- `seed` — random seed for deterministic generation

## File Schemas

### phase.json

```
{
  "id": string,
  "narrativePeriod": string,
  "factions": FactionDefinition[],
  "conditionalStubPool": ConditionalStub[],
  "totalMoves": number,
  "powerShiftConversationId": "power_shift",
  "nextPhaseId"?: string
}
```

Note: `availableNpcs` and `conversations` are NOT in phase.json — they live in the character subfolders. The loader assembles the full Phase object from the folder structure at runtime.

### FactionDefinition

```
{
  "id": string,
  "name": string,
  "description": string,
  "shiftFate": "survives" | "destroyed" | "splits" | "merges",
  "successorFactionIds"?: string[]
}
```

### characters/\<npc_id\>/npc.json

```
{
  "id": string,
  "name": string,
  "factionId": string,
  "rank": "citizen" | "magistrate" | "consul",
  "reputationProfile": { "severitas": number, "clementia": number, "audacia": number, "calliditas": number },
  "conversationArcLength": number
}
```

NPC reputation values range from -10 to 10. Each NPC should have one dominant trait (5–10) and varying levels on others. This profile determines how they respond to the player — compatible reputations create rapport, incompatible ones create friction.

### characters/\<npc_id\>/convo_N.json

```
{
  "id": string,
  "npcId": string,
  "phaseId": string,
  "sequenceIndex": number,
  "preconditions": ConversationPrecondition[],
  "entryNodeId": string,
  "nodes": { [nodeId: string]: ConversationNode },
  "exitStates": ExitState[]
}
```

Each conversation is a **directed graph** of nodes. NOT a tree — multiple paths can converge. The shape should be a diamond/funnel: branch out from entry, converge in the middle, branch again toward exits.

### ConversationPrecondition

```
{
  "type": "min_rank" | "faction_standing" | "prior_exit_state" | "phase_event",
  "factionId"?: string,
  "npcId"?: string,
  "conversationId"?: string,
  "requiredExitStateIds"?: string[],
  "minRank"?: "citizen" | "magistrate" | "consul",
  "minStanding"?: number
}
```

### Conversation Nodes

Every node has: `{ "id": string, "npcDialogue": string, "conditionalPrefix"?: ConditionalStub }`

**PassiveNode** — the system chooses for the player based on their dominant reputation trait. This creates the lock-in feeling: as you commit to a playstyle, your character starts responding automatically.

```
{
  "type": "passive",
  "id": string,
  "npcDialogue": string,
  "responses": [
    {
      "trait": "severitas" | "clementia" | "audacia" | "calliditas",
      "threshold": number,
      "playerDialogue": string,
      "nextNodeId": string
    }
  ],
  "fallbackResponse": { "playerDialogue": string, "nextNodeId": string }
}
```

**ActiveNode** — player chooses from options. The mechanical heart of the game.

```
{
  "type": "active",
  "id": string,
  "npcDialogue": string,
  "options": [
    {
      "playerDialogue": string,
      "roll"?: {
        "dice": { "count": number, "sides": number },
        "baseThreshold": number,
        "factors": {
          "personalFavor": number,
          "factionAlignment": number,
          "force": number,
          "wealth": number
        },
        "reputationBonus"?: { "trait": string, "weight": number }
      },
      "onSuccess": { "nextNodeId": string },
      "onPartial"?: { "nextNodeId": string },
      "onFailure"?: { "nextNodeId": string },
      "visibilityRequirement"?: { "trait": string, "minValue": number }
    }
  ]
}
```

**NoopNode** — player responds but it doesn't matter. Keeps pacing natural.

```
{
  "type": "noop",
  "id": string,
  "npcDialogue": string,
  "options": [
    { "playerDialogue": string, "nextNodeId": string }
  ]
}
```

**ConvergenceNode** — where branches collapse. Routes based on game state. No player action.

```
{
  "type": "convergence",
  "id": string,
  "npcDialogue": string,
  "routes": [
    {
      "condition": { "type": "reputation_dominant", "trait": string }
                  | { "type": "roll_history", "minSuccesses": number }
                  | { "type": "visited_node", "nodeId": string }
                  | { "type": "faction_standing", "factionId": string, "min": number },
      "nextNodeId": string
    }
  ],
  "fallbackNodeId": string
}
```

**ExitNode** — terminal. Produces an ExitState.

```
{
  "type": "exit",
  "id": string,
  "npcDialogue": string,
  "exitStateId": string
}
```

### ExitState

```
{
  "id": string,
  "narrativeLabel": string,
  "effects": ExitEffect[]
}
```

### ExitEffect

```
{ "type": "faction_standing", "deltas": [{ "factionId": string, "shift": number, "reason": string }] }
{ "type": "reputation", "deltas": [{ "trait": string, "shift": number, "reason": string }] }
{ "type": "turn_penalty", "shift": number, "reason": string }
{ "type": "unlock_conversation", "conversationId": string }
{ "type": "lock_conversation", "conversationId": string }
{ "type": "rank_change", "newRank": string, "reason": string }
{ "type": "game_over", "reason": string }
```

### ConditionalStub

```
{
  "triggerEvent": string,
  "variants": [
    { "statusRelation": "higher" | "peer" | "lower", "dialogue": string }
  ]
}
```

## Generation Rules

### Conversations

1. Each conversation should have **8–15 nodes**.
2. Each conversation should have **2–3 exit states** (not just one happy path).
3. Use **1–2 convergence nodes** per conversation to create the funnel shape.
4. **Active nodes** should have **2–3 options** each. Not every option needs a roll.
5. **Passive nodes** should have **2–4 responses** covering different trait dominances, plus a fallback.
6. Noop nodes are for pacing — use 1–2 per conversation to let the NPC deliver exposition without false choices.
7. The ratio of passive to active nodes should shift with the player's rank:
   - Citizen: more active (you're choosing who to be)
   - Magistrate: mixed (your reputation is forming)
   - Consul: more passive (you're locked in — your reputation speaks for you)
8. Every conversation graph must be **reachable** — no orphan nodes. Every node must have at least one inbound edge (except the entry node) and at least one outbound edge (except exit nodes).

### NPCs

1. Generate **6–10 NPCs** per phase.
2. Each NPC should have **1–3 conversations** in their arc (set `conversationArcLength`).
3. Later conversations in an NPC's arc should require `prior_exit_state` preconditions from earlier ones.
4. NPCs should span factions — at least 1 NPC per faction, with some factions having 2–3.
5. Give each NPC a distinct voice. A grizzled veteran talks differently from a slippery merchant or a pious priest.

### Factions

1. Faction standings range from **-10 to 10**.
2. Conversations should create **tension between factions** — helping one should usually cost standing with another.
3. At least one conversation should present a **cross-faction dilemma** — where the player can betray their current alignment for a better position.

### The Four Quadrants

Design conversations to hit all four combinations of faction alignment × reputation compatibility:

- **Allied faction + compatible reputation**: Smooth sailing. The NPC likes you and agrees with your methods. Rolls are easy. But this is where over-promising is most tempting — the exit effects should offer faction gains that lock out future options.
- **Allied faction + incompatible reputation**: Tense alliance. Same side, different methods. The NPC gives information (faction loyalty) but hedges. Passive nodes should fire responses that create friction. Good source of sub-faction tension.
- **Opposed faction + compatible reputation**: The seduction scenario. They respect your style even though you're enemies. High-risk active nodes with big payoffs (splitting the enemy faction) or big costs (your own faction sees you fraternizing). Use `faction_standing` effects on both factions.
- **Opposed faction + incompatible reputation**: Hostile. Conversation is short, options are limited. Only `force` and `wealth` roll factors matter. The NPC is contemptuous. Passive nodes auto-select dismissive responses.

### The Power Shift Conversation

The file `power_shift/convo.json` is the crisis that ends the phase. Its conversation ID must be `"power_shift"`.

This conversation:
- Has **no preconditions** (it triggers automatically when turns hit 0)
- Must use **ConvergenceNodes** that route based on `faction_standing` conditions
- Must have exit states that produce either `rank_change` (player advances) or `game_over` (player is destroyed)
- Should feel like a climactic reckoning — all the alliances and enmities the player built come to a head
- The NPC for this conversation can be a narrator/chorus figure rather than a specific character
- The narrator NPC does NOT need an entry in `characters/` — it exists only for this conversation

### Conditional Stub Pool

Generate **4–6 conditional stubs** in `phase.json`. Each should have 3 variants (higher/peer/lower status). These prefix NPC dialogue when the triggering event has occurred. Examples:
- Post-assassination attempt
- Post-proscription
- After a public trial
- After a military victory
- After a faction betrayal

### Dialogue Quality

- Dialogue should feel **literary, not gamey**. No "Choose option A/B/C" framing. The player dialogue options should sound like things a Roman politician would actually say.
- NPC dialogue should be **2–4 sentences**. Long enough to convey personality and information, short enough to maintain pacing.
- Player dialogue should be **1–2 sentences**. Punchy. The player is making a move, not giving a speech.
- Use period-appropriate references but don't over-explain. "The publicani won't forget this" is better than "The publicani (Roman tax collectors) won't forget this."
- Vary tone by NPC status and relationship. A senator addresses you differently than a dock worker.

### Order of Operations

Write files in this order to maintain consistency:

1. **phase.json** first — establishes faction IDs and phase metadata
2. **All npc.json files** — establishes NPC IDs, faction assignments, and arc lengths
3. **convo_0.json for each NPC** — first conversations, no `prior_exit_state` preconditions needed
4. **convo_1.json, convo_2.json** — later arc conversations, referencing exit states from earlier ones
5. **power_shift/convo.json** last — can reference faction IDs and knows the full cast

After writing all files, **verify your own consistency**: re-read phase.json and every npc.json, then confirm that all cross-references in conversation files resolve correctly.

## Example Phase Input

```json
{
  "phaseId": "social_war",
  "narrativePeriod": "Social War, ~91–87 BC",
  "playerRank": "citizen",
  "totalMoves": 20,
  "factions": [
    { "id": "optimates", "name": "Optimates", "description": "Conservative senatorial aristocracy. Defenders of tradition and senatorial privilege.", "shiftFate": "survives" },
    { "id": "populares", "name": "Populares", "description": "Reform faction. Champions of the plebs and Italian allies.", "shiftFate": "survives" },
    { "id": "italian_allies", "name": "Italian Allies", "description": "The Socii. Demand citizenship and equal rights after generations of military service.", "shiftFate": "merges", "successorFactionIds": ["populares"] },
    { "id": "sullan_faction", "name": "Sullan Faction", "description": "Military hardliners gathering around Lucius Cornelius Sulla.", "shiftFate": "survives" }
  ],
  "nextPhaseId": "sullan_civil_war",
  "narrativeAnchors": [
    "Murder of Marcus Livius Drusus — the reformer whose assassination triggers the war",
    "Italian cities revolt after citizenship is denied",
    "Sulla's march on Rome — first time a Roman general turns legions against the city"
  ],
  "seed": 42
}
```
