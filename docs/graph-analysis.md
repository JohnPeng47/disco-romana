# Envelope

Monte Carlo simulation of how many conversations are available to the player at each turn of a phase.

```
npx tsx scripts/backtest/analyze-graph.ts envelope [--path <dir>]
```

Runs 500 random playthroughs. Each run picks a random available conversation per turn and a random exit state, then re-evaluates preconditions (prior exit states, faction standing thresholds, `any_of` gates) to determine what's available next. Reports min, average, max, and standard deviation of `|R(t)|` (available conversation count) at each turn as an ASCII chart.

What it tells you:
- **Shape**: does content unlock progressively (diamond) or dump everything at once (rectangle)?
- **σ column**: how much player choices reshape the available content. Low σ means the graph is rigid regardless of path taken. High σ means choices meaningfully gate content.
- **Min hitting 0**: some playthroughs run out of available conversations before the phase ends — players can get locked out of content by bad exit choices.
- **Tail width**: how many open threads remain near the power shift. A good funnel narrows toward 0-2; a wide tail means too many unfinished arcs.

# Check

Sanity checks on conversation data.

```
npx tsx scripts/backtest/analyze-graph.ts check [--path <dir>] [--convo <id>]
```

Checks:
- **Reachability**: every node in a conversation must be reachable from its `entryNodeId`. Unreachable nodes are flagged as errors.
- **Word count**: no single dialogue line (NPC or player) should exceed 70 words. Offenders are flagged as warnings with the word count shown.

Exits with code 1 if any errors are found (warnings don't fail).
