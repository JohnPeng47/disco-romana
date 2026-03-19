'use client';

import { useRef, useEffect, useCallback } from 'react';
import { useGame } from './GameProvider';
import { getAvailableConversations } from '../app/engine';

export default function NpcSelectScreen() {
  const { data, state, dispatch } = useGame();
  const prevAvailableRef = useRef<Set<string>>(new Set());
  const newConvosRef = useRef<Set<string>>(new Set());

  const available = data && state
    ? getAvailableConversations(state, data.conversations, data.phase.powerShiftConversationId)
    : [];

  // Track which conversations are newly available
  useEffect(() => {
    const currentIds = new Set(available.map(c => c.id));
    const prevIds = prevAvailableRef.current;

    for (const id of currentIds) {
      if (!prevIds.has(id)) {
        newConvosRef.current.add(id);
      }
    }
    prevAvailableRef.current = currentIds;
  }, [available]);

  const handleSelect = useCallback((convoId: string) => {
    const convo = data?.conversations[convoId];
    const isInbound = convo?.direction === 'inbound';
    if (!isInbound) {
      dispatch({ type: 'USE_TURN' });
    }
    newConvosRef.current.delete(convoId);
    dispatch({ type: 'START_CONVERSATION', convoId });
  }, [data, dispatch]);

  const handleAnimationEnd = useCallback((convoId: string) => {
    newConvosRef.current.delete(convoId);
  }, []);

  if (!data || !state) return null;

  return (
    <div className="npc-select-screen screen active" style={{ display: 'flex' }}>
      <h2>Choose Your Audience</h2>
      <p>Each outbound conversation costs one turn. Inbound conversations are free.</p>
      <div className="npc-grid">
        {available.length === 0 ? (
          <p style={{ color: 'var(--text-dim)', textAlign: 'center' }}>
            No conversations available.
          </p>
        ) : (
          available.map(convo => {
            const npc = data.npcs[convo.npcId];
            if (!npc) return null;
            const faction = data.phase.factions.find(f => f.id === npc.factionId);
            const isInbound = convo.direction === 'inbound';
            const isNew = newConvosRef.current.has(convo.id);
            const classes = [
              'npc-card',
              isInbound ? 'inbound' : '',
              isNew ? 'new-convo' : '',
            ].filter(Boolean).join(' ');

            return (
              <div
                key={convo.id}
                className={classes}
                onClick={() => handleSelect(convo.id)}
                onAnimationEnd={() => handleAnimationEnd(convo.id)}
              >
                <div className="npc-name">{npc.name}</div>
                <div className="npc-faction">
                  {faction ? faction.name : npc.factionId || 'Independent'}
                  {isInbound && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--accent-dim)' }}>seeks you out</span>}
                </div>
                <div className="npc-rank">{npc.rank}</div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
