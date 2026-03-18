---
name: validate-phase
version: 1.0.0
description: Validate and improve a generated phase
tags: [validation, phase, quality]
---

You are a validation and quality agent. Read all JSON files in the current working directory. First check structural consistency, then evaluate gameplay quality and make improvements.

## Part 1: Structural Validation

### 1. File structure
- `phase.json` exists and is valid JSON
- `power_shift/convo.json` exists and is valid JSON
- Every NPC listed has a `characters/<npc_id>/npc.json`
- Every NPC's folder has exactly `conversationArcLength` convo files (convo_0.json through convo_N.json)

### 2. ID references
- Every `factionId` in any file exists in `phase.json` factions
- Every `npcId` in a conversation matches a `characters/<npc_id>/npc.json`
- Every `conversationId` in preconditions or exit effects points to a real convo file
- Every `nodeId` referenced by `nextNodeId`, `entryNodeId`, or `fallbackNodeId` exists in that conversation's nodes
- Every `exitStateId` in an ExitNode matches an entry in that conversation's exitStates
- `phase.json` `powerShiftConversationId` is `"power_shift"`

### 3. Graph integrity
- Every conversation graph is reachable from its entryNodeId (no orphan nodes)
- Every non-exit node has at least one outbound edge
- Every non-entry node has at least one inbound edge
- No self-loops on convergence nodes

### 4. Power shift conversation
- Has no preconditions
- Contains at least one ConvergenceNode with faction_standing conditions
- Has exit states that include both rank_change and game_over effects

### 5. NPC arc continuity
- convo_0.json has no prior_exit_state preconditions
- convo_1.json+ has prior_exit_state preconditions referencing exit states from earlier arc entries

Fix any structural errors in place. Rewrite affected files with corrections.

## Part 2: Gameplay Quality

After structural validation passes, evaluate the phase for gameplay quality. Read `<%DATA_DIR%>/phase-input.json` for the phase context and `<%DATA_DIR%>/prompt.md` for the full design reference.

### Playstyle divergence

Check that different reputation builds lead to genuinely different outcomes:

- **Each reputation trait should have at least 2 conversations where it meaningfully matters.** A trait "matters" if a PassiveResponse keyed to it routes to a different exit path than another trait, or if an ActiveNode option gated by `visibilityRequirement` on that trait leads to a unique exit state.
- **No dominant strategy.** If every conversation rewards the same trait or faction, the game collapses. Check that the exit effects across all conversations don't uniformly favor one trait or faction. If they do, rewrite exit effects on 2–3 conversations to create genuine tradeoffs.
- **Passive nodes should create real divergence, not cosmetic divergence.** If two PassiveResponses for different traits both route to the same nextNodeId, that's cosmetic — the player's reputation didn't actually matter. Fix by routing to different nodes that lead to different exits.

### Faction rivalry and tension

- **Every faction pair should have at least one conversation that forces a choice between them.** Look for exit effects that shift one faction up and another down simultaneously. If a faction pair has no tension point, add one by modifying an existing conversation's exit effects or adding a cross-faction dilemma to an active node.
- **Cross-faction seduction.** At least one conversation should let the player gain standing with an opposed faction at the cost of their current allies. If missing, add it.
- **Faction standings should be volatile.** If all faction_standing deltas are small (+1/-1), the phase feels flat. At least 2–3 conversations should have high-stakes exits with shifts of +3/-3 or greater.

### Historical relevance

Read the `narrativeAnchors` from the phase input. For each anchor:

- **It must appear in at least one conversation's NPC dialogue.** The event should be referenced, foreshadowed, or reacted to. If an anchor is never mentioned, weave it into an existing conversation — either as NPC dialogue, as a conditional stub trigger, or as context for a power shift convergence route.
- **The power shift conversation should directly engage with at least one anchor.** The crisis should feel historically grounded, not generic.
- **Period details should be specific, not generic.** "The Senate is concerned" is generic. "Drusus's lex Iulia is dead and the Marsi are sharpening their swords" is specific. Improve dialogue that feels too generic.

### Conversation flow and pacing

- **No conversation should be all-active or all-passive.** Check the node type distribution in each conversation. A good conversation alternates: noop for exposition → active for a choice → passive for lock-in response → convergence to funnel → active for final decision → exit.
- **First conversations (convo_0) should be accessible.** No hard rolls, no high visibility requirements. The player is meeting this NPC for the first time.
- **Later arc conversations should escalate.** Higher roll thresholds, more faction-standing consequences, bigger reputation shifts in exit effects.

### Apply improvements

When you find quality issues, fix them directly in the conversation files. Keep the fixes surgical — don't rewrite an entire conversation for a small issue. Prioritize:

1. Fixing cosmetic divergence (passive nodes that don't actually branch)
2. Adding missing faction tension points
3. Weaving in missing narrative anchors
4. Adjusting flat faction deltas to create stakes

## Output

Write `validation_report.json`:

```json
{
  "valid": true | false,
  "structural_errors": [
    { "file": string, "path": string, "message": string, "fixed": boolean }
  ],
  "quality_improvements": [
    { "file": string, "category": "playstyle" | "faction_rivalry" | "historical" | "pacing", "description": string }
  ],
  "stats": {
    "npcCount": number,
    "conversationCount": number,
    "totalNodes": number,
    "factionCount": number,
    "narrativeAnchorsCovered": number,
    "narrativeAnchorsTotal": number,
    "factionPairsWithTension": number,
    "factionPairsTotal": number,
    "traitsWithMeaningfulDivergence": number,
    "traitsTotal": number
  }
}
```
