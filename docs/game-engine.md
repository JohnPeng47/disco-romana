# Game Engine

## `engine/` — Generic game engine (config-driven, game-agnostic)

| Module | Path | Purpose |
|---|---|---|
| **Axes** | `engine/axes.ts` | Generic numeric state system (resources, scalars, keyed maps). Read/write/clamp values, evaluate gates and roll modifiers. |
| **Config** | `engine/config.ts` | Type-level IDs (`FactionId`, `NpcId`, `ConversationId`, etc.) and `GameConfig` shape. |
| **Conversation models** | `engine/conversation/models.ts` | Conversation graph types: `PassiveNode`, `ActiveNode`, `ConvergenceNode`, `ExitNode`, dialogue options, exit effects. |
| **Preconditions** | `engine/conversation/preconditions.ts` | Gates that control when a conversation unlocks (axis thresholds, completed convos, etc.). |
| **Stubs** | `engine/conversation/stubs.ts` | Conditional dialogue prefabs that splice into existing graphs when phase events fire. |
| **Effects** | `engine/conversation/effects/` | Faction deltas, reputation deltas, roll configs/outcomes — the "output" side of a conversation node. |
| **World models** | `engine/world/models.ts` | `Phase`, `FactionDefinition`, `NpcDefinition`. |
| **World state** | `engine/world/state.ts` | `GameState` — the mutable player state (axes, completed convos, move counter). |
| **World generation** | `engine/world/generation.ts` | `GenerationPrompt` type for the LLM pipeline. |

## `engine/runtime/` — Turn resolution

| Module | Purpose |
|---|---|
| `init.ts` | Bootstrap a fresh `GameState` from config + axis keys. |
| `preconditions.ts` | Filter available conversations by axis gates. |
| `passive.ts` | Resolve passive (NPC-speaks) nodes. |
| `node.ts` | Navigate the conversation graph (`getNextNodeId`). |
| `rolls.ts` | Dice-roll resolution with axis-derived modifiers. |
| `convergence.ts` | Merge branching dialogue paths back together based on roll history. |
| `effects.ts` | Apply exit effects (axis shifts, unlock flags) to `GameState`. |

## `app/engine.ts` — Game-specific adapter

Partially applies the **Romana preset** (`presets/romana.ts`) to every engine function so the rest of the app doesn't pass config around. This is where the generic engine becomes the specific Late Roman Republic game.

## `app/` — Next.js frontend + API

- `components/` — React UI (conversation screen, NPC select, sidebars, stat bars)
- `app/api/game-data/` and `app/api/playthrough/` — API routes for loading generated data and tracking playthroughs
- `app/db.ts` / `app/data-loader.ts` — data persistence layer

## `generation/` — LLM content pipeline

- `generation/prompts/` — hankweave prompt templates for the two-pass generate→validate pipeline
- `generation/story/` — narrative context (backstory, character profiles, scene rewrites)
- `generation/output/` — generated JSON (phase definitions, NPC defs, conversation graphs)

## `hankweave-runtime/` — LLM orchestration (git submodule)

The pipeline runner that executes the generation prompts against LLMs.
