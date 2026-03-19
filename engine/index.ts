// Game config & IDs
export type {
  GameConfig,
  FactionId,
  NpcId,
  ConversationId,
  NodeId,
  PhaseId,
} from "./config";

// Axes
export type {
  ResourceAxisDef,
  ScalarAxisDef,
  KeyedAxisDef,
  AxesState,
  AxisOperation,
} from "./axes";
export {
  readAxis,
  writeAxis,
  clampAxis,
  initAxes,
  evalGate,
  evalRollModifiers,
  applyShift,
} from "./axes";

// Conversation effects
export type { ReputationProfile, ReputationDelta } from "./conversation/effects/reputation";
export type { AxisDelta } from "./conversation/effects/faction";
export type { RollConfig, RollOutcome } from "./conversation/effects/rolls";

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

// World — phases, factions, NPCs
export type {
  Phase,
  FactionDefinition,
  NpcDefinition,
} from "./world/models";

// Game state
export type { GameState } from "./world/state";

// Generation
export type { GenerationPrompt } from "./world/generation";

// Runtime
export {
  initState,
  getAvailableConversations,
  checkPreconditions,
  resolvePassive,
  resolveConvergence,
  resolveRoll,
  applyExitEffects,
  getNextNodeId,
} from "./runtime";
export type { EffectResult, RollResult } from "./runtime";
