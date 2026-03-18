import type {
  ConversationId,
  NodeId,
  NpcId,
  PhaseId,
  FactionId,
} from "../config";
import type { RollConfig } from "./effects/rolls";
import type { FactionDelta } from "./effects/faction";
import type { ReputationDelta } from "./effects/reputation";
import type { ConditionalStub } from "./stubs";
import type { ConversationPrecondition } from "./preconditions";

// ============================================
// Conversation Structure
// ============================================

// comment: build a visualization structure for this node
/**
 * A single conversation is a directed graph of nodes with
 * convergence points. NOT a tree — nodes can have multiple
 * inbound edges (this is the funnel).
 *
 * T = reputation trait axes, R = rank progression
 */
export interface Conversation<T extends string, R extends string> {
  id: ConversationId;
  npcId: NpcId;
  phaseId: PhaseId;
  /** Which conversation in the NPC's arc (1st meeting, 2nd, etc.) */
  sequenceIndex: number;
  /** Preconditions for this conversation to be available */
  preconditions: ConversationPrecondition<R>[];
  /** The entry node — where the conversation starts */
  entryNodeId: NodeId;
  /** All nodes in the conversation graph */
  nodes: Record<NodeId, ConversationNode<T>>;
  /** The exit states this conversation can produce */
  exitStates: ExitState<T>[];
}

// ============================================
// Conversation Nodes (the diamond lattice)
// ============================================

export type ConversationNode<T extends string> =
  | PassiveNode<T>
  | ActiveNode<T>
  | NoopNode
  | ConvergenceNode<T>
  | ExitNode;

export interface NodeBase {
  id: NodeId;
  /** NPC dialogue delivered before player acts */
  npcDialogue: string;
  /** Optional: conditional prefix drawn from event stub pool */
  conditionalPrefix?: ConditionalStub;
}

/**
 * Passive: choice made FOR the player based on reputation.
 * This is the lock-in mechanic.
 */
export interface PassiveNode<T extends string> extends NodeBase {
  type: "passive";
  /**
   * Ordered by priority. First matching threshold fires.
   * If none match, falls through to fallback.
   */
  responses: PassiveResponse<T>[];
  fallbackResponse: {
    playerDialogue: string;
    nextNodeId: NodeId;
  };
}

export interface PassiveResponse<T extends string> {
  /** Which trait drives this response */
  trait: T;
  /** Minimum trait value for this to fire */
  threshold: number;
  playerDialogue: string;
  nextNodeId: NodeId;
}

/**
 * Active: player chooses from options.
 * Each option may have a roll attached.
 */
export interface ActiveNode<T extends string> extends NodeBase {
  type: "active";
  options: DialogueOption<T>[];
}

export interface DialogueOption<T extends string> {
  playerDialogue: string;
  /** If present, this option requires a roll to land */
  roll?: RollConfig<T>;
  /** Where to go on success (or if no roll required) */
  onSuccess: {
    nextNodeId: NodeId;
  };
  /** Where to go on partial success (only if roll exists) */
  onPartial?: {
    nextNodeId: NodeId;
  };
  /** Where to go on failure (only if roll exists) */
  onFailure?: {
    nextNodeId: NodeId;
  };
  /** Skill/trait floor: option only visible if player meets this */
  visibilityRequirement?: {
    trait: T;
    minValue: number;
  };
}

/**
 * Noop variant: player "responds" but it doesn't matter.
 * Advances the conversation. Keeps pacing natural.
 */
export interface NoopNode extends NodeBase {
  type: "noop";
  /** Flavor options — all lead to the same next node */
  options: {
    playerDialogue: string;
    nextNodeId: NodeId; // all point to same node
  }[];
}

/**
 * Convergence: where multiple branches collapse.
 * No player action — just routes to the appropriate
 * downstream node based on accumulated state.
 */
export interface ConvergenceNode<T extends string> extends NodeBase {
  type: "convergence";
  /**
   * Evaluate conditions to determine which branch to take.
   * First match wins.
   */
  routes: {
    condition: ConvergenceCondition<T>;
    nextNodeId: NodeId;
  }[];
  fallbackNodeId: NodeId;
}

export type ConvergenceCondition<T extends string> =
  | { type: "reputation_dominant"; trait: T }
  | { type: "roll_history"; minSuccesses: number }
  | { type: "visited_node"; nodeId: NodeId }
  | { type: "faction_standing"; factionId: FactionId; min: number };

/**
 * Exit: terminal node. Produces an ExitState
 * that feeds back into the game state.
 */
export interface ExitNode extends NodeBase {
  type: "exit";
  exitStateId: string;
}

// ============================================
// Exit States — the conversation's output
// ============================================

export interface ExitState<T extends string> {
  id: string;
  /** Human-readable label for the LLM generation pass */
  narrativeLabel: string;
  /** Mechanical consequences */
  effects: ExitEffect<T>[];
}

export type ExitEffect<T extends string, R extends string = string> =
  | { type: "faction_standing"; deltas: FactionDelta[] }
  | { type: "reputation"; deltas: ReputationDelta<T>[] }
  | { type: "turn_penalty"; shift: number; reason: string }
  | { type: "unlock_conversation"; conversationId: ConversationId }
  | { type: "lock_conversation"; conversationId: ConversationId }
  | { type: "rank_change"; newRank: R; reason: string }
  | { type: "game_over"; reason: string };
