import type { ResourceAxisDef } from './axes';

// ============================================
// Generic ID types — setting-agnostic
// ============================================

export type FactionId = string;
export type NpcId = string;
export type ConversationId = string;
export type NodeId = string;
export type PhaseId = string;

// ============================================
// Game Config
// ============================================

/**
 * GameConfig defines the axes of a game instantiation.
 * All other generic types derive their type parameters from this.
 *
 * T = reputation trait axes
 * R = rank progression (ordered low → high)
 */
export interface GameConfig<T extends string, R extends string> {
  id: string;
  name: string;
  description: string;

  /** The reputation trait axes for this game */
  traits: readonly T[];
  /** Rank progression, ordered from lowest to highest */
  ranks: readonly R[];

  /** Default reputation values for a new player */
  defaultReputation: Record<T, number>;
  /** Starting rank */
  startingRank: R;

  /** Game-specific numeric resource axes (factions, favors, force, wealth, etc.) */
  axes: readonly ResourceAxisDef[];
}
