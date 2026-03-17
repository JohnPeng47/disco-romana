/**
 * GameConfig defines the axes of a game instantiation.
 * All other generic types derive their type parameters from this.
 *
 * T = reputation trait axes
 * R = rank progression (ordered low → high)
 * C = context filters for passive resolution / patronage
 */
export interface GameConfig<T extends string, R extends string, C extends string> {
  id: string;
  name: string;
  description: string;

  /** The reputation trait axes for this game */
  traits: readonly T[];
  /** Rank progression, ordered from lowest to highest */
  ranks: readonly R[];
  /** Context filters — situations where passive resolution / patronage behaves differently */
  contexts: readonly C[];

  /** Default reputation values for a new player */
  defaultReputation: Record<T, number>;
  /** Starting rank */
  startingRank: R;
}
