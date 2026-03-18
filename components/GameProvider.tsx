'use client';

import React, { createContext, useContext, useReducer, useCallback } from 'react';
import type {
  GameData,
  GameState,
  ConversationState,
  GameAction,
  Screen,
  MessageEntry,
  ChoiceEntry,
} from '@lib/types';
import { initState } from '@lib/engine';

interface GameContextValue {
  data: GameData | null;
  state: GameState | null;
  convo: ConversationState;
  screen: Screen;
  gameOverTitle: string;
  gameOverReason: string;
  dispatch: React.Dispatch<GameAction>;
}

const defaultConvo: ConversationState = {
  convoId: null,
  currentNodeId: null,
  rollHistory: [],
  messages: [],
  choices: null,
  lastNodeWasAutoResolved: false,
  waitingForContinue: false,
};

const GameContext = createContext<GameContextValue | null>(null);

interface FullState {
  data: GameData | null;
  state: GameState | null;
  convo: ConversationState;
  screen: Screen;
  gameOverTitle: string;
  gameOverReason: string;
  msgCounter: number;
}

function reducer(s: FullState, action: GameAction): FullState {
  switch (action.type) {
    case 'LOAD_DATA': {
      const gameState = initState(action.data);
      return {
        ...s,
        data: action.data,
        state: gameState,
        screen: 'npc-select',
      };
    }
    case 'SET_SCREEN':
      return { ...s, screen: action.screen };
    case 'START_CONVERSATION': {
      return {
        ...s,
        screen: 'conversation',
        convo: {
          convoId: action.convoId,
          currentNodeId: s.data!.conversations[action.convoId].entryNodeId,
          rollHistory: [],
          messages: [],
          choices: null,
          lastNodeWasAutoResolved: false,
          waitingForContinue: false,
        },
      };
    }
    case 'ADD_MESSAGE': {
      const id = s.msgCounter + 1;
      return {
        ...s,
        msgCounter: id,
        convo: {
          ...s.convo,
          messages: [...s.convo.messages, { ...action.message, id }],
        },
      };
    }
    case 'SET_CHOICES':
      return {
        ...s,
        convo: { ...s.convo, choices: action.choices },
      };
    case 'ADVANCE_NODE':
      return {
        ...s,
        convo: {
          ...s.convo,
          currentNodeId: action.nodeId,
        },
        state: s.state
          ? {
              ...s.state,
              visitedNodes: new Set([...s.state.visitedNodes, action.nodeId]),
            }
          : s.state,
      };
    case 'APPLY_EXIT_EFFECTS': {
      // This is handled imperatively in the conversation component
      // because it needs the engine's applyExitEffects return value.
      // The state update is done via direct state setting.
      return s;
    }
    case 'END_CONVERSATION':
      return {
        ...s,
        screen: 'npc-select',
        convo: defaultConvo,
      };
    case 'USE_TURN':
      return {
        ...s,
        state: s.state
          ? { ...s.state, turnsRemaining: s.state.turnsRemaining - 1 }
          : s.state,
      };
    case 'RECORD_ROLL':
      return {
        ...s,
        convo: {
          ...s.convo,
          rollHistory: [...s.convo.rollHistory, action.outcome],
        },
      };
    case 'SET_WAITING_FOR_CONTINUE':
      return {
        ...s,
        convo: { ...s.convo, waitingForContinue: action.waiting },
      };
    case 'SET_LAST_AUTO_RESOLVED':
      return {
        ...s,
        convo: { ...s.convo, lastNodeWasAutoResolved: action.value },
      };
    case 'SET_GAME_OVER':
      return {
        ...s,
        screen: 'game-over',
        gameOverTitle: action.title,
        gameOverReason: action.reason,
      };
    case 'SET_GAME_STATE':
      return { ...s, state: action.state };
    default:
      return s;
  }
}

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [fullState, dispatch] = useReducer(reducer, {
    data: null,
    state: null,
    convo: defaultConvo,
    screen: 'npc-select' as Screen,
    gameOverTitle: '',
    gameOverReason: '',
    msgCounter: 0,
  });

  const value: GameContextValue = {
    data: fullState.data,
    state: fullState.state,
    convo: fullState.convo,
    screen: fullState.screen,
    gameOverTitle: fullState.gameOverTitle,
    gameOverReason: fullState.gameOverReason,
    dispatch,
  };

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used within GameProvider');
  return ctx;
}

// Helper to update state directly (for exit effects which need engine return value)
export function useGameStateUpdater() {
  const { dispatch } = useGame();
  // We'll handle state updates through a custom action pattern
  return dispatch;
}
