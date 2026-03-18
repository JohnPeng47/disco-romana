import type {
  PhaseId,
  ConversationId,
  FactionId,
  NpcId,
} from "../config";
import type { ReputationProfile } from "../conversation/effects/reputation";
import type { ConditionalStub } from "../conversation/stubs";
import type { Conversation } from "../conversation/models";

export interface Phase<T extends string, R extends string> {
  id: PhaseId;
  narrativePeriod: string;
  factions: FactionDefinition[];
  availableNpcs: NpcDefinition<T, R>[];
  conversations: Conversation<T, R>[];
  conditionalStubPool: ConditionalStub[];
  totalMoves: number;
  /** The conversation that triggers when turns hit 0. Routes via faction standings to rank_change or game_over exits. */
  powerShiftConversationId: ConversationId;
  /** Next phase to load on rank_change. Absent if this is the final phase. */
  nextPhaseId?: PhaseId;
}

export interface FactionDefinition {
  id: FactionId;
  name: string;
  description: string;
  /** What happens to this faction at the power shift */
  shiftFate: "survives" | "destroyed" | "splits" | "merges";
  /** If splits/merges, which factions result */
  successorFactionIds?: FactionId[];
}

export interface NpcDefinition<T extends string, R extends string> {
  id: NpcId;
  name: string;
  factionId: FactionId;
  rank: R;
  /** NPC's own reputation — determines how they respond to yours */
  reputationProfile: ReputationProfile<T>;
  /** How many conversations this NPC has in this phase */
  conversationArcLength: number;
}
