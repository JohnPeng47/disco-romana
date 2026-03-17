import type { FactionId } from "../core/models";

export interface CommitmentConstraint<T extends string> {
  /** What this commitment prevents or forces */
  type: "blocks_exit_state" | "forces_passive_trait" | "faction_floor";
  /** If blocks_exit_state: which exit states become unavailable */
  blockedExitStateId?: string;
  /** If forces_passive_trait: overrides passive turn resolution */
  forcedTrait?: T;
  /** If faction_floor: can't drop below this standing */
  factionId?: FactionId;
  minStanding?: number;
}
