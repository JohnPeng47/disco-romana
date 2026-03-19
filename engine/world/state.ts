import type {
  PhaseId,
  NpcId,
  NodeId,
  ConversationId,
} from "../config";
import type { ReputationProfile } from "../conversation/effects/reputation";
import type { AxesState } from "../axes";

export interface GameState<T extends string, R extends string> {
  currentPhase: PhaseId;
  currentRank: R;
  turnsRemaining: number;
  reputation: ReputationProfile<T>;
  /** Generic resource axes (factions, favors, force, wealth, etc.) */
  axes: AxesState;
  /** Which exit states have been reached — drives preconditions */
  exitStateHistory: { conversationId: ConversationId; exitStateId: string }[];
  /** Which nodes have been visited — drives convergence routing */
  visitedNodes: Set<NodeId>;
  /** Which events have fired — drives preconditions */
  firedEvents: Set<string>;
  /** Last NPC talked to — prevents consecutive same-NPC conversations */
  lastNpcId: NpcId | null;
}
