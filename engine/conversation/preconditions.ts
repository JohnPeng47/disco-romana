import type { NpcId, ConversationId } from "../config";
import type { AxisOperation } from "../axes";

export type ConversationPrecondition<R extends string> =
  | { type: 'min_rank'; minRank: R }
  | { type: 'axis_gate'; op: AxisOperation & { verb: 'gate' } }
  | { type: 'prior_exit_state'; conversationId: ConversationId; requiredExitStateIds: string[] }
  | { type: 'phase_event'; eventId: string }
  | { type: 'any_of'; conditions: ConversationPrecondition<R>[] };
