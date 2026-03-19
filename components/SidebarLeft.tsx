'use client';

import { useGame } from './GameProvider';
import StatBar from './StatBar';
import { readAxis } from '../engine/axes';

const traitNames: Record<string, string> = {
  severitas: 'Severitas',
  clementia: 'Clementia',
  audacia: 'Audacia',
  calliditas: 'Calliditas',
};

const rankLabels: Record<string, string> = {
  citizen: 'Private Citizen',
  magistrate: 'Magistrate',
  consul: 'Consul',
};

export default function SidebarLeft() {
  const { data, state } = useGame();

  if (!data || !state) return null;

  return (
    <div className="sidebar-left">
      <div className="sidebar-section">
        <h3>Reputation</h3>
        {Object.entries(traitNames).map(([trait, label]) => (
          <StatBar key={trait} label={label} value={state.reputation[trait as keyof typeof state.reputation] || 0} />
        ))}
      </div>
      <div className="sidebar-section">
        <h3>Factions</h3>
        {data.phase.factions.map(faction => (
          <StatBar
            key={faction.id}
            label={faction.name}
            value={readAxis(state.axes, 'factions', faction.id)}
          />
        ))}
      </div>
      <div className="sidebar-section">
        <h3>Rank</h3>
        <div className="stat-row">
          <span className="stat-value">{rankLabels[state.currentRank] || state.currentRank}</span>
        </div>
      </div>
    </div>
  );
}
