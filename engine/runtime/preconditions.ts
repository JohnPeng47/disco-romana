import type { GameConfig } from "../config";
import type { GameState } from "../world/state";
import { evalGate } from "../axes";

/**
 * Check all preconditions for a conversation.
 * Preconditions use the wire format (any[]) since they come from JSON data.
 */
export function checkPreconditions<T extends string, R extends string>(
  config: GameConfig<T, R>,
  state: GameState<T, R>,
  preconditions: any[],
): boolean {
  if (!preconditions || preconditions.length === 0) return true;
  return preconditions.every(p => checkSingle(config, state, p));
}

function checkSingle<T extends string, R extends string>(
  config: GameConfig<T, R>,
  state: GameState<T, R>,
  p: any,
): boolean {
  switch (p.type) {
    case 'min_rank': {
      const ranks = config.ranks;
      return ranks.indexOf(state.currentRank) >= ranks.indexOf(p.minRank);
    }
    case 'axis_gate':
      return evalGate(state.axes, p.op);
    // Legacy: faction_standing precondition → axis gate
    case 'faction_standing':
      return evalGate(state.axes, {
        verb: 'gate',
        axis: 'factions',
        key: p.factionId,
        min: p.min ?? p.minStanding ?? 0,
      });
    case 'prior_exit_state':
      return (p.requiredExitStateIds || []).some((esId: string) =>
        state.exitStateHistory.some(
          h => h.conversationId === p.conversationId && h.exitStateId === esId,
        ),
      );
    case 'any_of':
      return (p.conditions || []).some((c: any) => checkSingle(config, state, c));
    case 'event':
    case 'phase_event':
      return state.firedEvents.has(p.eventId);
    default:
      return true;
  }
}

/**
 * Get available conversations from the pool.
 */
export function getAvailableConversations<T extends string, R extends string>(
  config: GameConfig<T, R>,
  state: GameState<T, R>,
  conversations: Record<string, any>,
  powerShiftConvoId: string,
): any[] {
  const available: any[] = [];
  for (const [id, convo] of Object.entries(conversations)) {
    if (id === powerShiftConvoId) continue;
    if (state.lastNpcId && convo.npcId === state.lastNpcId) continue;
    if (!checkPreconditions(config, state, convo.preconditions)) continue;
    const completed = state.exitStateHistory.some(h => h.conversationId === id);
    if (!completed) available.push(convo);
  }
  return available;
}
