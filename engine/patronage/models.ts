import type { NpcId, FactionId, ReputationDelta } from "../core/models";
import type { RollFactors } from "../rolls/models";

export interface PatronageSlot<T extends string, C extends string> {
  npcId: NpcId;
  factionId: FactionId;
  /** Mechanical bonus while patron is active */
  bonus: Partial<RollFactors>;
  /** Contexts where this patron overrides passive turn resolution */
  passiveOverrides: {
    contextFilter: C;
    forcedTrait: T;
    /** What the patron "makes you say" */
    overrideDialogue: string;
  }[];
  /** Cost of breaking this patronage */
  breakCost: {
    reputationDeltas: ReputationDelta<T>[];
    factionStandingLoss: { factionId: FactionId; delta: number }[];
    /** The patron becomes hostile */
    createsEnemy: boolean;
  };
}
