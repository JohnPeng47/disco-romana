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
  /** Optional faction definitions — absent in faction-free games */
  factions?: FactionDefinition[];
  availableNpcs: NpcDefinition<T, R>[];
  conversations: Conversation<T, R>[];
  conditionalStubPool: ConditionalStub[];
  totalMoves: number;
  /** Keys for each keyed axis, e.g. { factions: ["populares", "optimates"] } */
  axisKeys: Record<string, string[]>;
  /** The conversation that triggers when turns hit 0 */
  powerShiftConversationId: ConversationId;
  nextPhaseId?: PhaseId;
}

export interface FactionDefinition {
  id: FactionId;
  name: string;
  description: string;
  shiftFate: "survives" | "destroyed" | "splits" | "merges";
  successorFactionIds?: FactionId[];
}

export interface NpcDefinition<T extends string, R extends string> {
  id: NpcId;
  name: string;
  /** Optional — absent in faction-free games */
  factionId?: FactionId;
  rank: R;
  reputationProfile: ReputationProfile<T>;
  conversationArcLength: number;
}
