'use client';

import { useState } from 'react';
import type { MessageEntry } from '../app/types';
import { useGame } from './GameProvider';

function PinButton({ compositeId }: { compositeId: string }) {
  const [copied, setCopied] = useState(false);

  const handleClick = () => {
    navigator.clipboard.writeText(compositeId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 800);
    });
  };

  return (
    <button
      className="copy-moment-btn"
      title={compositeId}
      onClick={handleClick}
    >
      {copied ? 'copied' : 'PIN'}
    </button>
  );
}

export default function Message({ msg }: { msg: MessageEntry }) {
  const { playthroughId } = useGame();
  const compositeId = msg.conversationId && msg.nodeId
    ? `${playthroughId}::${msg.conversationId}::${msg.nodeId}`
    : null;

  const pin = compositeId ? <PinButton compositeId={compositeId} /> : null;

  if (msg.type === 'system') {
    return <div className="msg msg-system">{pin}{msg.text}</div>;
  }

  if (msg.type === 'effect') {
    const color = msg.effectPositive ? 'var(--green)' : 'var(--red)';
    return (
      <div className="msg msg-effect">
        {pin}
        <span style={{ color }}>{msg.text}</span>
      </div>
    );
  }

  if (msg.type === 'roll' && msg.rollData) {
    const r = msg.rollData;
    const diceStr = r.rolls.join(' + ');
    const modStr = r.modifier >= 0 ? `+${r.modifier}` : `${r.modifier}`;
    return (
      <div className={`msg roll-result roll-${r.outcome}`}>
        {pin}
        Roll: [{diceStr}] {modStr} = {r.finalTotal} vs {r.threshold}
        {' — '}<strong>{r.outcome.toUpperCase()}</strong>
      </div>
    );
  }

  const className = msg.type === 'npc' ? 'msg msg-npc' : 'msg msg-player';
  return (
    <div className={className}>
      {pin}
      <div className="speaker">{msg.speaker}</div>
      <div>{msg.text}</div>
    </div>
  );
}
