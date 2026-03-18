'use client';

import { useGame } from './GameProvider';

export default function Header() {
  const { data, state } = useGame();

  if (!data || !state) return null;

  return (
    <div id="header">
      <h1>Disco Romana</h1>
      <span className="phase-info">{data.phase.narrativePeriod}</span>
      <span className="turn-counter">{state.turnsRemaining} turns remaining</span>
    </div>
  );
}
