export interface ConditionalStub {
  /** What event triggers this stub */
  triggerEvent: string; // e.g. "post_assassination_attempt", "post_proscription"
  /** Different versions based on NPC's relative status to player */
  variants: {
    statusRelation: "higher" | "peer" | "lower";
    dialogue: string;
  }[];
}
