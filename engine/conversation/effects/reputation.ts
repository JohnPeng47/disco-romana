/**
 * T = the trait axis union for this game.
 */
export type ReputationProfile<T extends string> = Record<T, number>;

export interface ReputationDelta<T extends string> {
  trait: T;
  shift: number; // positive = strengthen, negative = weaken
  /** Why this shift happened, for narrative generation */
  reason: string;
}
