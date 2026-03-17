// comment: paramaterize this!
export interface RollFactors {
  personalFavor: number;    // -5 to +5, history with this NPC
  factionAlignment: number; // -5 to +5, their faction's view of you
  force: number;            // 0 to +5, military backing
  wealth: number;           // 0 to +5, economic resources
}

export interface RollConfig<T extends string> {
  dice: { count: number; sides: number }; // e.g. { count: 2, sides: 8 }
  baseThreshold: number;
  factors: RollFactors;
  reputationBonus?: {
    trait: T;
    weight: number; // how much this context rewards/punishes the trait
  };
}

export type RollOutcome = "success" | "partial" | "failure";
