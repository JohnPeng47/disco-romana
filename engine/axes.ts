// ============================================
// Generic Resource Axis System
// ============================================

// --- Axis definitions (declared in GameConfig) ---

export interface ScalarAxisDef {
  id: string;
  type: 'scalar';
  default: number;
  min?: number;
  max?: number;
}

export interface KeyedAxisDef {
  id: string;
  type: 'keyed';
  default: number;
  min?: number;
  max?: number;
}

export type ResourceAxisDef = ScalarAxisDef | KeyedAxisDef;

// --- Axis state (stored in GameState) ---

export interface AxesState {
  scalars: Record<string, number>;
  keyed: Record<string, Record<string, number>>;
}

// --- AxisOperation: the universal contract ---
// Every engine subsystem that reads or writes an axis uses this.

export type AxisOperation =
  | { verb: 'gate'; axis: string; key?: string; min: number }
  | { verb: 'roll'; axis: string; key?: string; weight: number }
  | { verb: 'shift'; axis: string; key?: string; shift: number; reason: string };

// --- Axis helpers ---

export function readAxis(axes: AxesState, axis: string, key?: string): number {
  if (key !== undefined) {
    return axes.keyed[axis]?.[key] ?? 0;
  }
  return axes.scalars[axis] ?? 0;
}

export function writeAxis(axes: AxesState, axis: string, value: number, key?: string): AxesState {
  if (key !== undefined) {
    return {
      ...axes,
      keyed: {
        ...axes.keyed,
        [axis]: {
          ...axes.keyed[axis],
          [key]: value,
        },
      },
    };
  }
  return {
    ...axes,
    scalars: {
      ...axes.scalars,
      [axis]: value,
    },
  };
}

export function clampAxis(value: number, def: ResourceAxisDef): number {
  const lo = def.min ?? -Infinity;
  const hi = def.max ?? Infinity;
  return Math.max(lo, Math.min(hi, value));
}

export function initAxes(
  defs: readonly ResourceAxisDef[],
  axisKeys: Record<string, string[]>,
): AxesState {
  const scalars: Record<string, number> = {};
  const keyed: Record<string, Record<string, number>> = {};

  for (const def of defs) {
    if (def.type === 'scalar') {
      scalars[def.id] = def.default;
    } else {
      keyed[def.id] = {};
      for (const key of axisKeys[def.id] ?? []) {
        keyed[def.id][key] = def.default;
      }
    }
  }

  return { scalars, keyed };
}

/** Evaluate an axis gate: is the value >= min? */
export function evalGate(axes: AxesState, op: Extract<AxisOperation, { verb: 'gate' }>): boolean {
  return readAxis(axes, op.axis, op.key) >= op.min;
}

/** Compute the weighted modifier contribution from axis roll operations */
export function evalRollModifiers(axes: AxesState, ops: Extract<AxisOperation, { verb: 'roll' }>[]): number {
  let total = 0;
  for (const op of ops) {
    total += readAxis(axes, op.axis, op.key) * op.weight;
  }
  return total;
}

/** Apply a shift operation, returning updated axes. Caller provides axisDefs for clamping. */
export function applyShift(
  axes: AxesState,
  op: Extract<AxisOperation, { verb: 'shift' }>,
  defs: readonly ResourceAxisDef[],
): AxesState {
  const def = defs.find(d => d.id === op.axis);
  const current = readAxis(axes, op.axis, op.key);
  const clamped = def ? clampAxis(current + op.shift, def) : current + op.shift;
  return writeAxis(axes, op.axis, clamped, op.key);
}
