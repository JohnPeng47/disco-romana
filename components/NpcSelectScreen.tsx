'use client';

import { useGame } from './GameProvider';
import { getAvailableConversations } from '@lib/engine';

export default function NpcSelectScreen() {
  const { data, state, dispatch } = useGame();

  if (!data || !state) return null;

  const available = getAvailableConversations(
    state,
    data.conversations,
    data.phase.powerShiftConversationId
  );

  const handleSelect = (convoId: string) => {
    dispatch({ type: 'USE_TURN' });
    dispatch({ type: 'START_CONVERSATION', convoId });
  };

  return (
    <div className="npc-select-screen screen active" style={{ display: 'flex' }}>
      <h2>Choose Your Audience</h2>
      <p>Each outbound conversation costs one turn.</p>
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
            return (
              <div
                key={convo.id}
                className="npc-card"
                onClick={() => handleSelect(convo.id)}
              >
                <div className="npc-name">{npc.name}</div>
                <div className="npc-faction">{faction ? faction.name : npc.factionId || 'Independent'}</div>
                <div className="npc-rank">{npc.rank}</div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
