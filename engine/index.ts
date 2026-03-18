// Game config & IDs
export type {
  GameConfig,
  FactionId,
  NpcId,
  ConversationId,
  NodeId,
  PhaseId,
} from "./config";

// Conversation effects
export type { ReputationProfile, ReputationDelta } from "./conversation/effects/reputation";
export type { FactionDelta } from "./conversation/effects/faction";
export type { RollFactors, RollConfig, RollOutcome } from "./conversation/effects/rolls";

// Conversation graph
export type { ConditionalStub } from "./conversation/stubs";
export type { ConversationPrecondition } from "./conversation/preconditions";
export type {
  Conversation,
  ConversationNode,
  NodeBase,
  PassiveNode,
  PassiveResponse,
  ActiveNode,
  DialogueOption,
  NoopNode,
  ConvergenceNode,
  ConvergenceCondition,
  ExitNode,
  ExitState,
  ExitEffect,
} from "./conversation/models";

// World — phases, factions, NPCs, power shifts
export type {
  Phase,
  FactionDefinition,
  NpcDefinition,
} from "./world/models";

// Game state
export type { GameState } from "./world/state";

// Generation
export type { GenerationPrompt } from "./world/generation";
