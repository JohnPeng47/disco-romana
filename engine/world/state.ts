import type {
  PhaseId,
  FactionId,
  NpcId,
  NodeId,
  ConversationId,
} from "../config";
import type { ReputationProfile } from "../conversation/effects/reputation";
export interface GameState<T extends string, R extends string> {
  seed: number;
  currentPhase: PhaseId;
  currentRank: R;
  turnsRemaining: number;
  reputation: ReputationProfile<T>;
  factionStandings: Record<FactionId, number>;
  personalFavors: Record<NpcId, number>;
  /** Which exit states have been reached — drives preconditions */
  exitStateHistory: { conversationId: ConversationId; exitStateId: string }[];
  /** Which nodes have been visited — drives convergence routing */
  visitedNodes: Set<NodeId>;
  force: number;
  wealth: number;
}
