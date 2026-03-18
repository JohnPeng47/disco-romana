'use client';

import { useGame } from './GameProvider';

export default function SidebarRight() {
  const { data } = useGame();

  if (!data) return null;

  return (
    <div className="sidebar-right">
      <div className="sidebar-section">
        <h3>Characters</h3>
        {Object.entries(data.npcs).map(([id, npc]) => {
          const faction = data.phase.factions.find(f => f.id === npc.factionId);
          return (
            <div key={id} className="npc-card" data-npc={id}>
              <div className="npc-name">{npc.name}</div>
              <div className="npc-faction">{faction ? faction.name : npc.factionId || 'Independent'}</div>
              <div className="npc-rank">{npc.rank}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
