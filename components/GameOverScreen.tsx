'use client';

import { useGame } from './GameProvider';

export default function GameOverScreen() {
  const { gameOverTitle, gameOverReason } = useGame();

  return (
    <div className="game-over-screen screen active" style={{ display: 'flex' }}>
      <h2>{gameOverTitle}</h2>
      <p>{gameOverReason}</p>
    </div>
  );
}
