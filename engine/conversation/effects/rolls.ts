import type { AxisOperation } from "../../axes";

export interface RollConfig<T extends string> {
  dice: { count: number; sides: number };
  baseThreshold: number;
  /** Axis-based modifiers — each reads an axis value and applies a weight */
  modifiers: (AxisOperation & { verb: 'roll' })[];
  /** Reputation trait bonus on top of axis modifiers */
  reputationBonus?: {
    trait: T;
    weight: number;
  };
}

export type RollOutcome = "success" | "partial" | "failure";
