import type { GameConfig } from "../engine/config";

// ============================================
// Late Roman Republic preset
// ============================================

export type RomanaTrait = "severitas" | "clementia" | "audacia" | "calliditas";

export type CursusRank =
  | "citizen"
  | "magistrate"
  | "consul";

export const romanaConfig = {
  id: "romana",
  name: "Late Roman Republic",
  description: "Text-based grand strategy set ~130–27 BC. Disco Elysium meets Civ.",

  traits: ["severitas", "clementia", "audacia", "calliditas"],
  ranks: ["citizen", "magistrate", "consul"],

  defaultReputation: {
    severitas: 0,
    clementia: 0,
    audacia: 0,
    calliditas: 0,
  },
  startingRank: "citizen",
} as const satisfies GameConfig<RomanaTrait, CursusRank>;

// ============================================
// Convenience type aliases for Roman game
// ============================================

import type { Conversation, ConversationNode, GameState, Phase, GenerationPrompt } from "../engine";

export type RomanaConversation = Conversation<RomanaTrait, CursusRank>;
export type RomanaNode = ConversationNode<RomanaTrait>;
export type RomanaGameState = GameState<RomanaTrait, CursusRank>;
export type RomanaPhase = Phase<RomanaTrait, CursusRank>;
export type RomanaGenerationPrompt = GenerationPrompt<RomanaTrait, CursusRank>;
