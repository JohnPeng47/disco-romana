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

  // New format: modifiers array of AxisOperations with verb 'roll'
  if (rollConfig.modifiers) {
    modifier += evalRollModifiers(state.axes, rollConfig.modifiers);
  }

  // Legacy format: factors object with named fields
  if (rollConfig.factors) {
    const f = rollConfig.factors;
    // Legacy named factors → axis reads
    if (f.axes) {
      // Semi-migrated: factors.axes = { factions: { key: 'populares', weight: 2 }, ... }
      for (const [axisId, spec] of Object.entries(f.axes) as [string, any][]) {
        const val = spec.key
          ? (state.axes.keyed[axisId]?.[spec.key] ?? 0)
          : (state.axes.scalars[axisId] ?? 0);
        modifier += val * (spec.weight ?? 1);
      }
    } else {
      // Fully legacy: { personalFavor: 1, factionAlignment: 2, force: 0, wealth: 0 }
      modifier +=
        (f.personalFavor || 0) +
        (f.factionAlignment || 0) +
        (f.force || 0) +
        (f.wealth || 0);
    }
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
