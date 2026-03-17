import type {
  PhaseId,
  FactionId,
  NpcId,
  ReputationProfile,
} from "../core/models";
import type { RollOutcome } from "../rolls/models";
import type { ConditionalStub } from "../stubs/models";
import type { Conversation, ExitEffect } from "../conversation/models";

export interface Phase<T extends string, R extends string, C extends string> {
  id: PhaseId;
  narrativePeriod: string;
  factions: FactionDefinition[];
  availableNpcs: NpcDefinition<T, R>[];
  conversations: Conversation<T, R, C>[];
  conditionalStubPool: ConditionalStub[];
  totalMoves: number;
  powerShift: PowerShift<T, R, C>;
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

// comment: this needs to be better defined
export interface PowerShift<T extends string, R extends string, C extends string> {
  name: string;
  narrativeDescription: string;
  /** The crisis conversation sequence */
  crisisConversations: Conversation<T, R, C>[];
  /** Reputation trait that this shift rewards */
  favoredTrait: T;
  outcomes: PowerShiftOutcome<T, R, C>[];
}

export interface PowerShiftOutcome<T extends string, R extends string, C extends string> {
  type: "advancement" | "survival" | "setback" | "catastrophe";
  rollThreshold: RollOutcome;
  effects: ExitEffect<T, C>[];
  /** For advancement: which rank the player moves to */
  newRank?: R;
  /** For setback: turn penalty */
  turnPenalty?: number;
  /** Narrative shown to player */
  narrativeSummary: string;
  narrativeComparison: string;
}
