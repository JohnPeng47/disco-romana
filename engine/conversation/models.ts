import type {
  ConversationId,
  NodeId,
  NpcId,
  PhaseId,
  FactionId,
} from "../config";
import type { AxisOperation } from "../axes";
import type { RollConfig } from "./effects/rolls";
import type { ReputationDelta } from "./effects/reputation";
import type { ConditionalStub } from "./stubs";
import type { ConversationPrecondition } from "./preconditions";

// ============================================
// Conversation Structure
// ============================================

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
  responses: PassiveResponse<T>[];
  fallbackResponse: {
    playerDialogue: string;
    nextNodeId: NodeId;
  };
}

export interface PassiveResponse<T extends string> {
  trait: T;
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
  roll?: RollConfig<T>;
  onSuccess: { nextNodeId: NodeId };
  onPartial?: { nextNodeId: NodeId };
  onFailure?: { nextNodeId: NodeId };
  visibilityRequirement?: {
    trait: T;
    minValue: number;
  };
}

/**
 * Noop variant: player "responds" but it doesn't matter.
 */
export interface NoopNode extends NodeBase {
  type: "noop";
  options: {
    playerDialogue: string;
    nextNodeId: NodeId;
  }[];
}

/**
 * Convergence: where multiple branches collapse.
 * Routes based on accumulated state.
 */
export interface ConvergenceNode<T extends string> extends NodeBase {
  type: "convergence";
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
  | { type: "axis_gate"; op: AxisOperation & { verb: 'gate' } };

/**
 * Exit: terminal node. Produces an ExitState.
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
  narrativeLabel: string;
  effects: ExitEffect<T>[];
}

export type ExitEffect<T extends string, R extends string = string> =
  | { type: "axis_shift"; operations: (AxisOperation & { verb: 'shift' })[] }
  | { type: "reputation"; deltas: ReputationDelta<T>[] }
  | { type: "turn_penalty"; shift: number; reason: string }
  | { type: "unlock_conversation"; conversationId: ConversationId }
  | { type: "lock_conversation"; conversationId: ConversationId }
  | { type: "rank_change"; newRank: R; reason: string }
  | { type: "fire_event"; eventId: string }
  | { type: "game_over"; reason: string };
