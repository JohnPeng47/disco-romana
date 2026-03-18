import type { FactionId, NpcId, ConversationId } from "../config";

// comment: okay this class is very liable to change, lets design around that
// - improve_suggestion: lets add
export interface ConversationPrecondition<R extends string> {
  type: "min_rank" | "faction_standing" | "prior_exit_state" | "phase_event";
  factionId?: FactionId;
  npcId?: NpcId;
  conversationId?: ConversationId;
  /** For prior_exit_state: which exit state(s) from a prior conversation enable this one */
  requiredExitStateIds?: string[];
  minRank?: R;
  minStanding?: number;
}
