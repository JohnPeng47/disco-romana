'use client';

import type { MessageEntry } from '@lib/types';

export default function Message({ msg }: { msg: MessageEntry }) {
  if (msg.type === 'system') {
    return <div className="msg msg-system">{msg.text}</div>;
  }

  if (msg.type === 'effect') {
    const color = msg.effectPositive ? 'var(--green)' : 'var(--red)';
    return (
      <div className="msg msg-effect">
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
        Roll: [{diceStr}] {modStr} = {r.finalTotal} vs {r.threshold}
        {' — '}<strong>{r.outcome.toUpperCase()}</strong>
      </div>
    );
  }

  const className = msg.type === 'npc' ? 'msg msg-npc' : 'msg msg-player';
  return (
    <div className={className}>
      <div className="speaker">{msg.speaker}</div>
      <div>{msg.text}</div>
    </div>
  );
}
