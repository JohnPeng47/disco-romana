# Debug Game State

Load the Disco Romana web UI at any arbitrary game state for testing and debugging.

## How It Works

The debug system uses a `?debug=BASE64_JSON` URL query parameter. When present, the game boots normally (loads all phase/NPC/conversation data), then applies state overrides and optionally jumps directly into a conversation at a specific node.

## Debug Config Shape

```json
{
  "state": {
    "currentRank": "citizen" | "magistrate" | "consul",
    "turnsRemaining": 15,
    "reputation": { "severitas": 3, "clementia": -2, "audacia": 7, "calliditas": 1 },
    "factionStandings": { "optimates": 2, "populares": 5, "italian_allies": -1, "sullan_faction": -3 },
    "personalFavors": { "gaius_marius": 2 },
    "exitStateHistory": [
      { "conversationId": "gaius_marius_convo_0", "exitStateId": "gaius_marius_convo_0_exit_trusted" }
    ],
    "visitedNodes": ["gaius_marius_convo_0_n01", "gaius_marius_convo_0_n03"],
    "force": 2,
    "wealth": 1
  },
  "conversationId": "gaius_marius_convo_0",
  "nodeId": "gaius_marius_convo_0_n05"
}
```

All fields in `state` are optional — only include what you want to override. Omitted fields keep their default initialized values.

If `conversationId` is provided, the UI jumps directly into that conversation. If `nodeId` is also provided, it starts at that specific node (otherwise starts at the conversation's entry node). If neither is provided, the game loads to the NPC selection screen with the overridden state.

## Generating a Debug URL

### From the Browser Console

While playing, open the browser console and run:

```js
// Capture current state, targeting a specific conversation + node
generateDebugURL('gaius_marius_convo_0', 'gaius_marius_convo_0_n05')

// Capture current state, no conversation target (loads to NPC select)
generateDebugURL()

// Get the raw config object (for inspection / manual editing)
dumpDebugConfig('gaius_marius_convo_0', 'gaius_marius_convo_0_n05')
```

### Manually Constructing a URL

1. Create your debug config JSON object
2. Base64 encode it: `btoa(JSON.stringify(config))`
3. Append as query param: `http://localhost:PORT/ui/index.html?debug=ENCODED`

### From Claude Code

To generate a debug URL for a specific scenario:

```js
const config = {
  state: {
    reputation: { severitas: 0, clementia: 0, audacia: 7, calliditas: 0 },
    factionStandings: { populares: 4 },
    turnsRemaining: 10
  },
  conversationId: "gaius_marius_convo_0",
  nodeId: "gaius_marius_convo_0_n05"
};
const url = `index.html?debug=${btoa(JSON.stringify(config))}`;
```

## Example: Jump to Marius's Passive Node with High Audacia

This loads mid-conversation with Gaius Marius at the passive node where reputation determines your response about the Mithridatic command. With audacia at 7, the player's boldness will speak for them:

```
?debug=eyJzdGF0ZSI6eyJyZXB1dGF0aW9uIjp7InNldmVyaXRhcyI6MCwiY2xlbWVudGlhIjowLCJhdWRhY2lhIjo3LCJjYWxsaWRpdGFzIjowfSwiZmFjdGlvblN0YW5kaW5ncyI6eyJwb3B1bGFyZXMiOjR9LCJ0dXJuc1JlbWFpbmluZyI6MTB9LCJjb252ZXJzYXRpb25JZCI6ImdhaXVzX21hcml1c19jb252b18wIiwibm9kZUlkIjoiZ2FpdXNfbWFyaXVzX2NvbnZvXzBfbjA1In0=
```

## Key Node IDs for Testing

To find valid conversation and node IDs, look at the JSON files in `generation/output/characters/<npc_id>/convo_*.json`. Each conversation has:
- `id`: the conversation ID
- `entryNodeId`: the first node
- `nodes`: object keyed by node ID, each with a `type` field (active, passive, noop, convergence, exit)

## Tips

- To test the consecutive passive node continue gate, set reputation values high enough to trigger passive responses and target a node that chains into another auto-resolved node.
- The debug banner ("Debug: loaded at ...") appears in the conversation scroll to confirm debug mode is active.
- State is applied on top of normal initialization, so faction IDs must match what's in `phase.json`.
