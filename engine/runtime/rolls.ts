import type { GameState } from "../world/state";
import { evalRollModifiers } from "../axes";

export interface RollResult {
  rolls: number[];
  total: number;
  modifier: number;
  finalTotal: number;
  threshold: number;
  outcome: 'success' | 'partial' | 'failure';
}

export function resolveRoll<T extends string, R extends string>(
  state: GameState<T, R>,
  rollConfig: any,
): RollResult {
  let total = 0;
  const rolls: number[] = [];
  for (let i = 0; i < rollConfig.dice.count; i++) {
    const roll = Math.floor(Math.random() * rollConfig.dice.sides) + 1;
    rolls.push(roll);
    total += roll;
  }

  let modifier = 0;

  if (rollConfig.modifiers) {
    modifier += evalRollModifiers(state.axes, rollConfig.modifiers);
  }

  if (rollConfig.reputationBonus) {
    const traitVal = (state.reputation as Record<string, number>)[rollConfig.reputationBonus.trait] || 0;
    modifier += traitVal * rollConfig.reputationBonus.weight;
  }

  const finalTotal = total + modifier;
  const threshold = rollConfig.baseThreshold;

  let outcome: 'success' | 'partial' | 'failure';
  if (finalTotal >= threshold) {
    outcome = 'success';
  } else if (finalTotal >= threshold - 2) {
    outcome = 'partial';
  } else {
    outcome = 'failure';
  }

  return { rolls, total, modifier, finalTotal, threshold, outcome };
}
