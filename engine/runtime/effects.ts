import type { GameConfig } from "../config";
import type { GameState } from "../world/state";
import { applyShift } from "../axes";

export interface EffectResult {
  text: string;
  reason: string;
  positive: boolean;
  gameOver?: boolean;
  gameOverReason?: string;
}

export function applyExitEffects<T extends string, R extends string>(
  config: GameConfig<T, R>,
  state: GameState<T, R>,
  exitState: any,
): { newState: GameState<T, R>; results: EffectResult[] } {
  let newState: GameState<T, R> = {
    ...state,
    reputation: { ...state.reputation },
    axes: {
      scalars: { ...state.axes.scalars },
      keyed: Object.fromEntries(
        Object.entries(state.axes.keyed).map(([k, v]) => [k, { ...v }]),
      ),
    },
    exitStateHistory: [...state.exitStateHistory],
    visitedNodes: new Set(state.visitedNodes),
    firedEvents: new Set(state.firedEvents),
    lastNpcId: state.lastNpcId,
  };

  const results: EffectResult[] = [];
  const fmt = (n: number) => (n > 0 ? `+${n}` : `${n}`);

  for (const effect of exitState.effects) {
    switch (effect.type) {
      case 'axis_shift':
        for (const op of effect.operations) {
          newState = { ...newState, axes: applyShift(newState.axes, op, config.axes) };
          const label = op.key ? `${op.key}` : op.axis;
          results.push({
            text: `${label}: ${fmt(op.shift)}`,
            reason: op.reason,
            positive: op.shift > 0,
          });
        }
        break;
      case 'reputation':
        for (const delta of effect.deltas) {
          const trait = delta.trait as string as T;
          const old = (newState.reputation as Record<string, number>)[delta.trait] || 0;
          (newState.reputation as Record<string, number>)[delta.trait] = Math.max(-10, Math.min(10, old + delta.shift));
          results.push({
            text: `${delta.trait}: ${fmt(delta.shift)}`,
            reason: delta.reason,
            positive: delta.shift > 0,
          });
        }
        break;
      case 'turn_penalty':
        newState = { ...newState, turnsRemaining: Math.max(0, newState.turnsRemaining + effect.shift) };
        results.push({
          text: `Turns: ${fmt(effect.shift)}`,
          reason: effect.reason,
          positive: effect.shift > 0,
        });
        break;
      case 'unlock_conversation':
        results.push({ text: 'New conversation available', reason: '', positive: true });
        break;
      case 'lock_conversation':
        results.push({ text: 'Conversation locked', reason: '', positive: false });
        break;
      case 'rank_change':
        newState = { ...newState, currentRank: effect.newRank };
        results.push({ text: `Rank: ${effect.newRank}`, reason: effect.reason, positive: true });
        break;
      case 'fire_event':
        newState.firedEvents.add(effect.eventId);
        break;
      case 'game_over':
        results.push({
          text: 'GAME OVER',
          reason: effect.reason,
          positive: false,
          gameOver: true,
          gameOverReason: effect.reason,
        });
        break;
    }
  }

  return { newState, results };
}
