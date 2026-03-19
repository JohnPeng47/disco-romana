import fs from 'fs';
import path from 'path';
import type { GameData, NpcData, ConversationData, PhaseData } from './types';

export function loadGameData(dataPath: string): GameData {
  const absPath = path.resolve(dataPath);

  const phaseRaw = fs.readFileSync(path.join(absPath, 'phase.json'), 'utf-8');
  const phase: PhaseData = JSON.parse(phaseRaw);

  // Load NPC manifest
  let npcIds: string[];
  const manifestPath = path.join(absPath, 'npc-manifest.json');
  if (fs.existsSync(manifestPath)) {
    npcIds = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  } else {
    // Scan characters directory
    const charsDir = path.join(absPath, 'characters');
    npcIds = fs.existsSync(charsDir)
      ? fs.readdirSync(charsDir).filter(d =>
          fs.statSync(path.join(charsDir, d)).isDirectory()
        )
      : [];
  }

  const npcs: Record<string, NpcData> = {};
  const conversations: Record<string, ConversationData> = {};

  for (const npcId of npcIds) {
    const npcPath = path.join(absPath, 'characters', npcId, 'npc.json');
    if (!fs.existsSync(npcPath)) continue;

    const npc: NpcData = JSON.parse(fs.readFileSync(npcPath, 'utf-8'));
    npcs[npcId] = npc;

    for (let i = 0; i < npc.conversationArcLength; i++) {
      const convoPath = path.join(absPath, 'characters', npcId, `convo_${i}.json`);
      if (!fs.existsSync(convoPath)) continue;
      const convo: ConversationData = JSON.parse(fs.readFileSync(convoPath, 'utf-8'));
      conversations[convo.id] = convo;
    }
  }

  // Load power shift conversation
  const psPath = path.join(absPath, 'power_shift', 'convo.json');
  if (fs.existsSync(psPath)) {
    const ps: ConversationData = JSON.parse(fs.readFileSync(psPath, 'utf-8'));
    conversations[ps.id] = ps;
  }

  return { phase, npcs, conversations };
}
