'use client';

import { useEffect, useRef } from 'react';
import { useGame } from './GameProvider';
import NpcSelectScreen from './NpcSelectScreen';
import ConversationScreen from './ConversationScreen';
import GameOverScreen from './GameOverScreen';

export default function MainArea() {
  const { screen, state, data, dispatch } = useGame();
  const powerShiftTriggered = useRef(false);

  useEffect(() => {
    if (
      screen === 'npc-select' &&
      state &&
      data &&
      state.turnsRemaining <= 0 &&
      !powerShiftTriggered.current
    ) {
      const psId = data.phase.powerShiftConversationId;
      if (data.conversations[psId]) {
        powerShiftTriggered.current = true;
        dispatch({
          type: 'ADD_MESSAGE',
          message: { type: 'system', text: 'The crisis arrives. Your alliances are about to be tested.' },
        });
        dispatch({ type: 'START_CONVERSATION', convoId: psId });
      }
    }
  }, [screen, state, data, dispatch]);

  switch (screen) {
    case 'npc-select':
      return <NpcSelectScreen />;
    case 'conversation':
      return <ConversationScreen />;
    case 'game-over':
      return <GameOverScreen />;
    default:
      return null;
  }
}
