import type { GameConfig } from "../engine/config";
import type { Conversation, ConversationNode, ExitState } from "../engine/conversation/models";
import type { GameState } from "../engine/world/state";
import type { Phase } from "../engine/world/models";
import type { GenerationPrompt } from "../engine/world/generation";

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

  axes: [
    { id: "factions",       type: "keyed",  default: 0, min: -10, max: 10 },
    { id: "personalFavors", type: "keyed",  default: 0, min: -10, max: 10 },
    { id: "force",          type: "scalar", default: 0, min: 0,   max: 10 },
    { id: "wealth",         type: "scalar", default: 0, min: 0,   max: 10 },
  ],
} as const satisfies GameConfig<RomanaTrait, CursusRank>;

// ============================================
// Convenience type aliases for Roman game
// ============================================

export type RomanaConversation = Conversation<RomanaTrait, CursusRank>;
export type RomanaNode = ConversationNode<RomanaTrait>;
export type RomanaGameState = GameState<RomanaTrait, CursusRank>;
export type RomanaPhase = Phase<RomanaTrait, CursusRank>;
export type RomanaGenerationPrompt = GenerationPrompt<RomanaTrait, CursusRank>;
