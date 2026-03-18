import type { FactionId } from "../../config";

export interface FactionDelta {
  factionId: FactionId;
  shift: number; // positive = improve, negative = worsen
  /** Why this shift happened, for narrative generation */
  reason: string;
}
