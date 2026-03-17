import type {
  PhaseId,
  FactionId,
  NpcId,
  NodeId,
  ConversationId,
  ReputationProfile,
} from "../core/models";
import type { CommitmentConstraint } from "../commitments/models";
import type { PatronageSlot } from "../patronage/models";

export interface GameState<T extends string, R extends string, C extends string> {
  seed: number;
  currentPhase: PhaseId;
  currentRank: R;
  turnsRemaining: number;
  reputation: ReputationProfile<T>;
  factionStandings: Record<FactionId, number>;
  personalFavors: Record<NpcId, number>;
  activePatronages: PatronageSlot<T, C>[];
  activeCommitments: CommitmentConstraint<T>[];
  /** Which exit states have been reached — drives preconditions */
  exitStateHistory: { conversationId: ConversationId; exitStateId: string }[];
  /** Which nodes have been visited — drives convergence routing */
  visitedNodes: Set<NodeId>;
  force: number;
  wealth: number;
}
