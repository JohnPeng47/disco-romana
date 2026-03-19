'use client';

import type { ChoiceEntry } from '../app/types';

interface Props {
  choice: ChoiceEntry;
  onClick: () => void;
}

export default function ChoiceButton({ choice, onClick }: Props) {
  return (
    <button
      className={`choice-btn ${choice.locked ? 'locked' : ''}`}
      disabled={choice.locked}
      onClick={choice.locked ? undefined : onClick}
    >
      {choice.text}
      {choice.hasRoll && <span className="roll-tag">[Roll]</span>}
      {choice.lockTag && <span className="lock-tag">[{choice.lockTag}]</span>}
    </button>
  );
}
