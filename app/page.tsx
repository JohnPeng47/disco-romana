'use client';

import { useEffect } from 'react';
import { useGame } from '@components/GameProvider';
import Header from '@components/Header';
import SidebarLeft from '@components/SidebarLeft';
import SidebarRight from '@components/SidebarRight';
import MainArea from '@components/MainArea';

export default function Home() {
  const { data, dispatch } = useGame();

  useEffect(() => {
    if (data) return; // Already loaded
    fetch('/api/game-data')
      .then(r => r.json())
      .then(gameData => {
        if (gameData.error) {
          console.error(gameData.error);
          return;
        }
        dispatch({ type: 'LOAD_DATA', data: gameData });
      })
      .catch(e => console.error('Failed to load game data:', e));
  }, [data, dispatch]);

  if (!data) {
    return (
      <div id="app" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <p style={{ color: 'var(--text-dim)', fontStyle: 'italic' }}>Loading...</p>
      </div>
    );
  }

  return (
    <div id="app">
      <Header />
      <SidebarLeft />
      <MainArea />
      <SidebarRight />
    </div>
  );
}
