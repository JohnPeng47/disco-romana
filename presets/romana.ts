import type { GameConfig } from "../engine/config";

// ============================================
// Late Roman Republic preset
// ============================================

export type RomanaTrait = "severitas" | "clementia" | "audacia" | "calliditas";

export type CursusRank =
  | "private_citizen"
  | "military_tribune"
  | "quaestor"
  | "aedile"
  | "praetor"
  | "consul"
  | "proconsul"
  | "dictator";

export type RomanaContext = "senate" | "military" | "commerce" | "religious" | "private";

export const romanaConfig = {
  id: "romana",
  name: "Late Roman Republic",
  description: "Text-based grand strategy set ~130–27 BC. Disco Elysium meets Civ.",

  traits: ["severitas", "clementia", "audacia", "calliditas"],
  ranks: [
    "private_citizen",
    "military_tribune",
    "quaestor",
    "aedile",
    "praetor",
    "consul",
    "proconsul",
    "dictator",
  ],
  contexts: ["senate", "military", "commerce", "religious", "private"],

  defaultReputation: {
    severitas: 0,
    clementia: 0,
    audacia: 0,
    calliditas: 0,
  },
  startingRank: "private_citizen",
} as const satisfies GameConfig<RomanaTrait, CursusRank, RomanaContext>;

// ============================================
// Convenience type aliases for Roman game
// ============================================

import type { Conversation, ConversationNode, GameState, Phase, GenerationPrompt } from "../engine";

export type RomanaConversation = Conversation<RomanaTrait, CursusRank, RomanaContext>;
export type RomanaNode = ConversationNode<RomanaTrait, CursusRank, RomanaContext>;
export type RomanaGameState = GameState<RomanaTrait, CursusRank, RomanaContext>;
export type RomanaPhase = Phase<RomanaTrait, CursusRank, RomanaContext>;
export type RomanaGenerationPrompt = GenerationPrompt<RomanaTrait, CursusRank, RomanaContext>;
