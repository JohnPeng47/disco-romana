# Phase Generation

## Single phase

```bash
cd generation
npx hankweave ./hank.json .
```

This runs two codons sequentially:
1. **generate** (opus) — writes `phase.json`, `characters/*/npc.json`, `characters/*/convo_*.json`, `power_shift/convo.json`
2. **validate** (sonnet) — reads all files, checks cross-references, fixes errors, writes `validation_report.json`

Data files (`prompt.md`, `phase-input.json`) are mounted as read-only via hankweave's `<%DATA_DIR%>` template variable.

## Parallel generation across phases

Each phase is independent — run them concurrently as separate hankweave instances:

```bash
# Create per-phase input files
for phase in social_war sullan_civil_war rise_of_pompey triumvirate; do
  mkdir -p "runs/$phase"
  cp hank.json "runs/$phase/"
  # Generate phase-input.json for each phase (script or manual)
done

# Run all in parallel
for phase in runs/*/; do
  npx hankweave "$phase/hank.json" "$phase" &
done
wait
```

Each instance gets its own workspace, checkpoints, and output folder. No conflicts.

## After generation

The output folder structure:

```
phase.json
characters/
  marcus_crassus/
    npc.json
    convo_0.json
    convo_1.json
  lucius_sulla/
    npc.json
    convo_0.json
  ...
power_shift/
  convo.json
validation_report.json
```

A runtime loader walks this structure and assembles the full `Phase<RomanaTrait, CursusRank>` object by:
1. Reading `phase.json` for metadata and factions
2. Globbing `characters/*/npc.json` → `availableNpcs`
3. Globbing `characters/*/convo_*.json` + `power_shift/convo.json` → `conversations`

## Recovery

If generation fails mid-way:
- Hankweave checkpoints after the generate codon completes
- `npx hankweave ./hank.json . --resume` picks up from the last checkpoint
- If only validation fails, the generated content is preserved — fix and re-validate

If you want to re-run just the generate step with different parameters:
- Edit `phase-input.json`
- `npx hankweave ./hank.json . --start-new`
