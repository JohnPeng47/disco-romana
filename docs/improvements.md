# Improvements

Guidance for future conversation generation passes.

## 2. Precondition gating

Every generated conversation must have its `preconditions` array filled in based on the design doc's access requirements. Never leave it as `[]` unless the conversation is genuinely available from the start of the phase.

- If the design doc says "requires X OR Y", use the `any_of` precondition type wrapping both conditions.
- If the design doc says "requires X AND Y", list both conditions as separate entries in the array (the engine evaluates with AND/`every`).
- Common precondition types: `prior_exit_state` (completed a specific conversation with a specific outcome), `faction_standing` (minimum alignment with a faction), `min_rank`, `any_of` (OR wrapper).
- Conversations that are sequel arcs (convo_1, convo_2) should at minimum require a non-failure exit from the prior conversation in the arc.

## 3. Shorter Conversations
- You should be keeping each NPC dialogue turn to 