import type { Phase } from "./models";
import type { Conversation } from "../conversation/models";

// Integrate hankweave here
/**
 * This is what you send to the LLM on each generation pass.
 * The LLM returns Conversation objects conforming to the types above.
 */
export interface GenerationPrompt<T extends string, R extends string> {
  pass: "skeleton" | "factional_dialogue" | "reputation_passives";
  phase: Phase<T, R>;
  /** Only relevant for passes 2 and 3 — the skeleton to flesh out */
  existingConversations?: Conversation<T, R>[];
  /** Constraints the LLM must respect */
  constraints: {
    maxNodesPerConversation: number;
    maxActiveOptionsPerNode: number;
    maxExitStatesPerConversation: number;
    convergencePointsPerConversation: number;
    passiveToActiveRatio: number;
    /** Narrative anchors that MUST appear in the phase */
    narrativeAnchors: string[];
  };
}
