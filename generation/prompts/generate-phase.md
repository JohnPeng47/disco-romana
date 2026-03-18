---
name: generate-phase
version: 1.0.0
description: Generate one phase of the Late Roman Republic game
tags: [generation, phase]
---

Read the file `<%DATA_DIR%>/prompt.md` for your full instructions and schema reference.

Read the file `<%DATA_DIR%>/phase-input.json` for the specific phase you are generating.

Write all output files into the current working directory following the folder structure described in the prompt. Use the Write tool (or equivalent file-writing tool) to create each file.

Remember: write files in order — phase.json first, then npc.json files, then convo_0.json files, then later arc conversations, then power_shift/convo.json last.

After writing all files, re-read phase.json and every npc.json and verify that all IDs referenced in conversation files actually exist. If you find inconsistencies, fix them before finishing.
