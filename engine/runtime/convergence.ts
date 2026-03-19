import type { GameState } from "../world/state";
import { evalGate } from "../axes";

export function resolveConvergence<T extends string, R extends string>(
  state: GameState<T, R>,
  node: any,
  rollHistory: string[],
): string {
  for (const route of node.routes) {
    const cond = route.condition;
    let matches = false;
    switch (cond.type) {
      case 'reputation_dominant': {
        const rep = state.reputation;
        const entries = Object.entries(rep) as [string, number][];
        const dominant = entries.sort((a, b) => b[1] - a[1])[0];
        matches = dominant != null && dominant[0] === cond.trait;
        break;
      }
      case 'roll_history':
        matches = rollHistory.filter(r => r === 'success').length >= cond.minSuccesses;
        break;
      case 'visited_node':
        matches = state.visitedNodes.has(cond.nodeId);
        break;
      case 'axis_gate':
        matches = evalGate(state.axes, cond.op);
        break;
      // Legacy: faction_standing convergence condition → axis gate
      case 'faction_standing':
        matches = evalGate(state.axes, {
          verb: 'gate',
          axis: 'factions',
          key: cond.factionId,
          min: cond.min,
        });
        break;
    }
    if (matches) return route.nextNodeId;
  }
  return node.fallbackNodeId;
}
