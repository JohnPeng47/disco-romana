'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useGame } from './GameProvider';
import Message from './Message';
import ChoiceButton from './ChoiceButton';
import {
  resolvePassive,
  resolveConvergence,
  resolveRoll,
  applyExitEffects,
  getNextNodeId,
} from '@lib/engine';
import type { ChoiceEntry, GameState } from '@lib/types';

function delay(ms: number) {
  return new Promise<void>(r => setTimeout(r, ms));
}

export default function ConversationScreen() {
  const { data, state, convo, dispatch } = useGame();
  const scrollRef = useRef<HTMLDivElement>(null);
  const processingRef = useRef(false);

  // Keep refs to latest values for async functions
  const stateRef = useRef(state);
  const dataRef = useRef(data);
  const convoRef = useRef(convo);
  stateRef.current = state;
  dataRef.current = data;
  convoRef.current = convo;

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [convo.messages, convo.choices, scrollToBottom]);

  // Process a node — may chain into the next node for auto-resolved types.
  // This is the core conversation driver. It shows NPC dialogue, then either
  // presents choices (active/noop/exit-return) or auto-resolves and chains
  // to the next node (passive/convergence).
  const processNode = useCallback(async (nodeId: string, lastWasAuto: boolean = false) => {
    const curData = dataRef.current;
    const curState = stateRef.current;
    const curConvo = convoRef.current;
    if (!curData || !curState || !curConvo.convoId) return;

    const conversation = curData.conversations[curConvo.convoId];
    const node = conversation.nodes[nodeId];
    if (!node) return;

    // Track visited
    dispatch({ type: 'ADVANCE_NODE', nodeId });

    const npc = curData.npcs[conversation.npcId];
    const npcName = npc ? npc.name : 'Narrator';
    const isAutoResolved = node.type === 'passive' || node.type === 'convergence';

    // Gate consecutive auto-resolved nodes with a "Continue..." button
    if (isAutoResolved && lastWasAuto) {
      dispatch({
        type: 'SET_CHOICES',
        choices: [{ index: 0, text: 'Continue...', locked: false, hasRoll: false, type: 'continue' }],
      });
      return;
    }

    // Show NPC dialogue
    if (node.npcDialogue && node.npcDialogue.trim()) {
      dispatch({ type: 'ADD_MESSAGE', message: { type: 'npc', speaker: npcName, text: node.npcDialogue } });
      await delay(300);
    }

    switch (node.type) {
      case 'active': {
        const choices: ChoiceEntry[] = node.options.map((opt: any, i: number) => {
          const locked = opt.visibilityRequirement &&
            ((stateRef.current!.reputation as Record<string, number>)[opt.visibilityRequirement.trait] || 0) < opt.visibilityRequirement.minValue;
          return {
            index: i,
            text: opt.playerDialogue,
            locked: !!locked,
            lockTag: locked ? `${opt.visibilityRequirement.trait} ${opt.visibilityRequirement.minValue}+` : undefined,
            hasRoll: !!opt.roll,
            type: 'active' as const,
          };
        });
        dispatch({ type: 'SET_CHOICES', choices });
        break;
      }
      case 'passive': {
        const result = resolvePassive(stateRef.current!, node);
        await delay(600);
        if (result.matchedTrait) {
          dispatch({ type: 'ADD_MESSAGE', message: { type: 'system', text: `Your ${result.matchedTrait} speaks for you.` } });
          await delay(300);
        }
        dispatch({ type: 'ADD_MESSAGE', message: { type: 'player', speaker: 'You', text: result.dialogue } });
        await delay(400);
        // Chain directly to next node
        await processNode(result.nextNodeId, true);
        break;
      }
      case 'noop': {
        const choices: ChoiceEntry[] = node.options.map((opt: any, i: number) => ({
          index: i,
          text: opt.playerDialogue,
          locked: false,
          hasRoll: false,
          type: 'noop' as const,
        }));
        dispatch({ type: 'SET_CHOICES', choices });
        break;
      }
      case 'convergence': {
        const nextNodeId = resolveConvergence(stateRef.current!, node, convoRef.current.rollHistory);
        await delay(400);
        // Chain directly to next node
        await processNode(nextNodeId, true);
        break;
      }
      case 'exit': {
        const curState2 = stateRef.current!;
        const convoId = convoRef.current.convoId!;
        const conv = dataRef.current!.conversations[convoId];
        const exitState = conv.exitStates.find((es: any) => es.id === node.exitStateId);
        if (!exitState) return;

        const stateWithHistory: GameState = {
          ...curState2,
          reputation: { ...curState2.reputation },
          factionStandings: { ...curState2.factionStandings },
          personalFavors: { ...curState2.personalFavors },
          exitStateHistory: [
            ...curState2.exitStateHistory,
            { conversationId: convoId, exitStateId: node.exitStateId },
          ],
          visitedNodes: new Set(curState2.visitedNodes),
        };

        const { newState: afterEffects, results } = applyExitEffects(stateWithHistory, exitState);

        await delay(600);
        dispatch({ type: 'ADD_MESSAGE', message: { type: 'system', text: exitState.narrativeLabel } });
        await delay(300);

        let gameOver = false;
        let gameOverReason = '';
        for (const r of results) {
          dispatch({
            type: 'ADD_MESSAGE',
            message: {
              type: 'effect',
              text: `${r.text}${r.reason ? ` — ${r.reason}` : ''}`,
              effectPositive: r.positive,
            },
          });
          if (r.gameOver) {
            gameOver = true;
            gameOverReason = r.gameOverReason || r.reason;
          }
          await delay(200);
        }

        dispatch({ type: 'SET_GAME_STATE', state: afterEffects });

        if (gameOver) {
          await delay(1000);
          dispatch({ type: 'SET_GAME_OVER', title: 'Your Story Ends', reason: gameOverReason });
          return;
        }

        await delay(500);
        dispatch({
          type: 'SET_CHOICES',
          choices: [{ index: 0, text: 'Continue...', locked: false, hasRoll: false, type: 'return' }],
        });
        break;
      }
    }
  }, [dispatch]);

  // Initial trigger: process entry node when conversation starts
  useEffect(() => {
    if (!data || !state || !convo.convoId || !convo.currentNodeId) return;
    if (processingRef.current) return;

    processingRef.current = true;
    processNode(convo.currentNodeId, false).finally(() => {
      processingRef.current = false;
    });
    // Only run when a new conversation starts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convo.convoId]);

  const handleChoice = useCallback(async (choice: ChoiceEntry) => {
    const curData = dataRef.current;
    const curState = stateRef.current;
    const curConvo = convoRef.current;
    if (!curData || !curState || !curConvo.convoId) return;

    dispatch({ type: 'SET_CHOICES', choices: null });

    if (choice.type === 'continue') {
      // Continue gate — re-process current node without the auto-resolve gate
      const nodeId = curConvo.currentNodeId;
      if (nodeId) {
        await processNode(nodeId, false);
      }
      return;
    }

    if (choice.type === 'return') {
      if (curState.turnsRemaining <= 0) {
        const psId = curData.phase.powerShiftConversationId;
        if (curData.conversations[psId]) {
          dispatch({ type: 'ADD_MESSAGE', message: { type: 'system', text: 'The crisis arrives. Your alliances are about to be tested.' } });
          dispatch({ type: 'START_CONVERSATION', convoId: psId });
        } else {
          dispatch({ type: 'SET_GAME_OVER', title: 'Phase Complete', reason: 'The power shift conversation was not found.' });
        }
      } else {
        dispatch({ type: 'END_CONVERSATION' });
      }
      return;
    }

    const conversation = curData.conversations[curConvo.convoId];
    const node = conversation.nodes[curConvo.currentNodeId!];

    if (choice.type === 'active') {
      const opt = node.options[choice.index];
      dispatch({ type: 'ADD_MESSAGE', message: { type: 'player', speaker: 'You', text: opt.playerDialogue } });
      await delay(400);

      let nextNodeId: string | null;
      if (opt.roll) {
        const result = resolveRoll(stateRef.current!, opt.roll);
        dispatch({
          type: 'ADD_MESSAGE',
          message: { type: 'roll', text: '', rollData: result },
        });
        dispatch({ type: 'RECORD_ROLL', outcome: result.outcome });
        await delay(800);
        nextNodeId = getNextNodeId(opt, result.outcome);
      } else {
        nextNodeId = getNextNodeId(opt);
      }

      if (!nextNodeId) {
        dispatch({ type: 'ADD_MESSAGE', message: { type: 'system', text: '[Error: conversation path broken]' } });
        dispatch({
          type: 'SET_CHOICES',
          choices: [{ index: 0, text: 'Return...', locked: false, hasRoll: false, type: 'return' }],
        });
        return;
      }

      // Directly chain to next node instead of relying on useEffect
      await processNode(nextNodeId, false);
    }

    if (choice.type === 'noop') {
      const opt = node.options[choice.index];
      dispatch({ type: 'ADD_MESSAGE', message: { type: 'player', speaker: 'You', text: opt.playerDialogue } });
      await delay(400);
      // Directly chain to next node
      await processNode(opt.nextNodeId, false);
    }
  }, [dispatch, processNode]);

  if (!data || !state) return null;

  return (
    <div className="main-area" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="conversation-scroll" ref={scrollRef}>
        {convo.messages.map(msg => (
          <Message key={msg.id} msg={msg} />
        ))}
      </div>
      {convo.choices && convo.choices.length > 0 && (
        <div className="choices-panel">
          {convo.choices.map(choice => (
            <ChoiceButton
              key={choice.index}
              choice={choice}
              onClick={() => handleChoice(choice)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
