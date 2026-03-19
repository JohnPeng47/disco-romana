import type { GameState } from "../world/state";

export function resolvePassive<T extends string, R extends string>(
  state: GameState<T, R>,
  node: any,
): { dialogue: string; nextNodeId: string; matchedTrait: string | null } {
  for (const response of node.responses) {
    const traitVal = (state.reputation as Record<string, number>)[response.trait] || 0;
    if (traitVal >= response.threshold) {
      return {
        dialogue: response.playerDialogue,
        nextNodeId: response.nextNodeId,
        matchedTrait: response.trait,
      };
    }
  }
  return {
    dialogue: node.fallbackResponse.playerDialogue,
    nextNodeId: node.fallbackResponse.nextNodeId,
    matchedTrait: null,
  };
}
