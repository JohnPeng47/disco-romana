import type {
  ConversationId,
  NodeId,
  NpcId,
  PhaseId,
  FactionId,
  ReputationDelta,
} from "../core/models";
import type { RollConfig } from "../rolls/models";
import type { CommitmentConstraint } from "../commitments/models";
import type { PatronageSlot } from "../patronage/models";
import type { ConditionalStub } from "../stubs/models";

// ============================================
// Conversation Structure
// ============================================

// comment: build a visualization structure for this node
/**
 * A single conversation is a directed graph of nodes with
 * convergence points. NOT a tree — nodes can have multiple
 * inbound edges (this is the funnel).
 *
 * T = reputation trait axes, R = rank progression, C = context filters
 */
export interface Conversation<T extends string, R extends string, C extends string> {
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
  nodes: Record<NodeId, ConversationNode<T, R, C>>;
  /** The exit states this conversation can produce */
  exitStates: ExitState<T, C>[];
}

// comment: okay this class is very liable to change, lets design around that
// - improve_suggestion: lets add
export interface ConversationPrecondition<R extends string> {
  type: "min_rank" | "faction_standing" | "prior_exit_state" | "phase_event" | "patronage";
  factionId?: FactionId;
  npcId?: NpcId;
  conversationId?: ConversationId;
  /** For prior_exit_state: which exit state(s) from a prior conversation enable this one */
  requiredExitStateIds?: string[];
  minRank?: R;
  minStanding?: number;
}

// ============================================
// Conversation Nodes (the diamond lattice)
// ============================================

export type ConversationNode<T extends string, R extends string, C extends string> =
  | PassiveNode<T, C>
  | ActiveNode<T, C>
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
export interface PassiveNode<T extends string, C extends string> extends NodeBase {
  type: "passive";
  /**
   * Ordered by priority. First matching threshold fires.
   * If none match, falls through to fallback.
   */
  responses: PassiveResponse<T, C>[];
  fallbackResponse: {
    playerDialogue: string;
    nextNodeId: NodeId;
    reputationDeltas: ReputationDelta<T>[];
  };
}

export interface PassiveResponse<T extends string, C extends string> {
  /** Which trait drives this response */
  trait: T;
  /** Minimum trait value for this to fire */
  threshold: number;
  /** Optional: only fires in certain contexts */
  contextFilter?: C;
  playerDialogue: string;
  nextNodeId: NodeId;
  reputationDeltas: ReputationDelta<T>[];
}

/**
 * Active: player chooses from options.
 * Each option may have a roll attached.
 */
export interface ActiveNode<T extends string, C extends string> extends NodeBase {
  type: "active";
  options: DialogueOption<T, C>[];
}

export interface DialogueOption<T extends string, C extends string> {
  playerDialogue: string;
  /** If present, this option requires a roll to land */
  roll?: RollConfig<T>;
  /** Where to go on success (or if no roll required) */
  onSuccess: {
    nextNodeId: NodeId;
    reputationDeltas: ReputationDelta<T>[];
  };
  /** Where to go on partial success (only if roll exists) */
  onPartial?: {
    nextNodeId: NodeId;
    reputationDeltas: ReputationDelta<T>[];
  };
  /** Where to go on failure (only if roll exists) */
  onFailure?: {
    nextNodeId: NodeId;
    reputationDeltas: ReputationDelta<T>[];
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

export interface ExitState<T extends string, C extends string> {
  id: string;
  /** Human-readable label for the LLM generation pass */
  narrativeLabel: string;
  /** Mechanical consequences */
  effects: ExitEffect<T, C>[];
}

export type ExitEffect<T extends string, C extends string> =
  | { type: "faction_standing"; factionId: FactionId; delta: number }
  | { type: "personal_favor"; npcId: NpcId; delta: number }
  | { type: "unlock_conversation"; conversationId: ConversationId }
  | { type: "lock_conversation"; conversationId: ConversationId }
  | { type: "commitment"; description: string; constrains: CommitmentConstraint<T>[] }
  | { type: "turn_penalty"; turns: number; reason: string }
  | { type: "force_delta"; delta: number }
  | { type: "wealth_delta"; delta: number }
  | { type: "patronage_offered"; npcId: NpcId; patron: PatronageSlot<T, C> };
