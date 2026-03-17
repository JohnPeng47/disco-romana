// ============================================
// Generic ID types — setting-agnostic
// ============================================

export type FactionId = string;
export type NpcId = string;
export type ConversationId = string;
export type NodeId = string;
export type PhaseId = string;

// ============================================
// Reputation system — parameterized by T (trait axes)
// ============================================

/**
 * T = the trait axis union for this game.
 * Roman: "severitas" | "clementia" | "audacia" | "calliditas"
 * Cyberpunk: "chrome" | "empathy" | "street_cred" | "netrunning"
 */
export type ReputationProfile<T extends string> = Record<T, number>;

export interface ReputationDelta<T extends string> {
  trait: T;
  shift: number; // positive = strengthen, negative = weaken
  /** Why this shift happened, for narrative generation */
  reason: string;
}
