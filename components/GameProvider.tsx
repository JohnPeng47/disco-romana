'use client';

import React, { createContext, useContext, useReducer, useCallback, useEffect, useRef } from 'react';
import type {
  GameData,
  GameState,
  ConversationState,
  GameAction,
  Screen,
  MessageEntry,
  ChoiceEntry,
} from '../app/types';
import { initState } from '../app/engine';

function generatePlaythroughId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 8; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

interface GameContextValue {
  data: GameData | null;
  state: GameState | null;
  convo: ConversationState;
  screen: Screen;
  gameOverTitle: string;
  gameOverReason: string;
  playthroughId: string;
  playthroughLog: PlaythroughStep[];
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

interface PlaythroughStep {
  conversationId: string;
  nodeId: string;
  action: string;
  ts: number;
  choiceIndex?: number;
  choiceText?: string;
}

interface FullState {
  data: GameData | null;
  state: GameState | null;
  convo: ConversationState;
  screen: Screen;
  gameOverTitle: string;
  gameOverReason: string;
  msgCounter: number;
  playthroughId: string;
  playthroughLog: PlaythroughStep[];
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
      const entryNodeId = s.data!.conversations[action.convoId].entryNodeId;
      return {
        ...s,
        screen: 'conversation',
        convo: {
          convoId: action.convoId,
          currentNodeId: entryNodeId,
          rollHistory: [],
          messages: [],
          choices: null,
          lastNodeWasAutoResolved: false,
          waitingForContinue: false,
        },
        playthroughLog: [
          ...s.playthroughLog,
          { conversationId: action.convoId, nodeId: entryNodeId, action: 'start', ts: Date.now() },
        ],
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
        playthroughLog: [
          ...s.playthroughLog,
          { conversationId: s.convo.convoId!, nodeId: action.nodeId, action: 'advance', ts: Date.now() },
        ],
      };
    case 'LOG_CHOICE':
      return {
        ...s,
        playthroughLog: [
          ...s.playthroughLog,
          {
            conversationId: s.convo.convoId!,
            nodeId: s.convo.currentNodeId!,
            action: 'choice',
            ts: Date.now(),
            choiceIndex: action.choiceIndex,
            choiceText: action.choiceText,
          },
        ],
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
    playthroughId: generatePlaythroughId(),
    playthroughLog: [],
  });

  const value: GameContextValue = {
    data: fullState.data,
    state: fullState.state,
    convo: fullState.convo,
    screen: fullState.screen,
    gameOverTitle: fullState.gameOverTitle,
    gameOverReason: fullState.gameOverReason,
    playthroughId: fullState.playthroughId,
    playthroughLog: fullState.playthroughLog,
    dispatch,
  };

  // Flush playthrough log to the database
  const flushedCountRef = useRef(0);
  useEffect(() => {
    const log = fullState.playthroughLog;
    const unflushed = log.slice(flushedCountRef.current);
    if (unflushed.length === 0) return;

    fetch('/api/playthrough', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playthroughId: fullState.playthroughId, steps: unflushed }),
    }).then(() => {
      flushedCountRef.current = log.length;
    }).catch(err => console.warn('Failed to flush playthrough:', err));
  }, [fullState.playthroughLog, fullState.playthroughId]);

  // Expose to console for debugging
  if (typeof window !== 'undefined') {
    (window as any).__playthrough = {
      id: fullState.playthroughId,
      log: fullState.playthroughLog,
      getStepsUpTo(pin: string) {
        const [pId, convoId, nodeId] = pin.split('::');
        if (pId !== fullState.playthroughId) return { error: 'PIN is from a different playthrough' };
        const idx = fullState.playthroughLog.findIndex(
          s => s.conversationId === convoId && s.nodeId === nodeId
        );
        if (idx === -1) return { error: 'Node not found in playthrough log' };
        return fullState.playthroughLog.slice(0, idx + 1);
      },
    };
  }

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
