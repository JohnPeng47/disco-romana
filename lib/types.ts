import type { RomanaTrait, CursusRank } from '@engine/../presets/romana';

// Re-export for convenience
export type { RomanaTrait, CursusRank };

// ============================================
// Game Data — what the API returns
// ============================================

export interface NpcData {
  id: string;
  name: string;
  factionId: string | null;
  rank: string;
  reputationProfile: Record<RomanaTrait, number>;
  conversationArcLength: number;
}

export interface FactionData {
  id: string;
  name: string;
  description: string;
  shiftFate: string;
  successorFactionIds?: string[];
}

export interface PhaseData {
  id: string;
  narrativePeriod: string;
  factions: FactionData[];
  totalMoves: number;
  powerShiftConversationId: string;
  nextPhaseId?: string;
}

export interface ConversationData {
  id: string;
  npcId: string;
  phaseId: string;
  sequenceIndex: number;
  preconditions: any[];
  entryNodeId: string;
  nodes: Record<string, any>;
  exitStates: any[];
}

export interface GameData {
  phase: PhaseData;
  npcs: Record<string, NpcData>;
  conversations: Record<string, ConversationData>;
}

// ============================================
// Game State — managed by reducer
// ============================================

export interface GameState {
  currentPhase: string;
  currentRank: CursusRank;
  turnsRemaining: number;
  reputation: Record<RomanaTrait, number>;
  factionStandings: Record<string, number>;
  personalFavors: Record<string, number>;
  exitStateHistory: { conversationId: string; exitStateId: string }[];
  visitedNodes: Set<string>;
  firedEvents: Set<string>;
  lastNpcId: string | null;
  force: number;
  wealth: number;
}

// ============================================
// Conversation State
// ============================================

export type MessageType = 'npc' | 'player' | 'system' | 'effect' | 'roll';

export interface MessageEntry {
  id: number;
  type: MessageType;
  speaker?: string;
  text: string;
  rollData?: RollResult;
  effectPositive?: boolean;
  conversationId?: string;
  nodeId?: string;
}

export interface RollResult {
  rolls: number[];
  total: number;
  modifier: number;
  finalTotal: number;
  threshold: number;
  outcome: 'success' | 'partial' | 'failure';
}

export type Screen = 'npc-select' | 'conversation' | 'game-over';

export interface ConversationState {
  convoId: string | null;
  currentNodeId: string | null;
  rollHistory: string[];
  messages: MessageEntry[];
  choices: ChoiceEntry[] | null;
  lastNodeWasAutoResolved: boolean;
  waitingForContinue: boolean;
}

export interface ChoiceEntry {
  index: number;
  text: string;
  locked: boolean;
  lockTag?: string;
  hasRoll: boolean;
  type: 'active' | 'noop' | 'continue' | 'return';
}

// ============================================
// Actions
// ============================================

export type GameAction =
  | { type: 'LOAD_DATA'; data: GameData }
  | { type: 'SET_SCREEN'; screen: Screen }
  | { type: 'START_CONVERSATION'; convoId: string }
  | { type: 'ADD_MESSAGE'; message: Omit<MessageEntry, 'id'> }
  | { type: 'SET_CHOICES'; choices: ChoiceEntry[] | null }
  | { type: 'ADVANCE_NODE'; nodeId: string }
  | { type: 'LOG_CHOICE'; choiceIndex: number; choiceText: string }
  | { type: 'APPLY_EXIT_EFFECTS'; convoId: string; exitStateId: string }
  | { type: 'END_CONVERSATION' }
  | { type: 'USE_TURN' }
  | { type: 'RECORD_ROLL'; outcome: string }
  | { type: 'SET_WAITING_FOR_CONTINUE'; waiting: boolean }
  | { type: 'SET_LAST_AUTO_RESOLVED'; value: boolean }
  | { type: 'SET_GAME_OVER'; title: string; reason: string }
  | { type: 'SET_GAME_STATE'; state: GameState };
