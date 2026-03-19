import type { AxisOperation } from "../../axes";

/** A shift operation on a named axis. Replaces the old FactionDelta. */
export type AxisDelta = AxisOperation & { verb: 'shift' };
