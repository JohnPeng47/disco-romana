/**
 * Romana-specific engine adapter.
 * Partially applies romanaConfig so components don't need to pass it.
 */
import { romanaConfig } from '../presets/romana';
import type { GameState } from './types';
import {
  initState as _initState,
  getAvailableConversations as _getAvailableConversations,
  checkPreconditions as _checkPreconditions,
  resolvePassive as _resolvePassive,
  resolveConvergence as _resolveConvergence,
  resolveRoll as _resolveRoll,
  applyExitEffects as _applyExitEffects,
  getNextNodeId,
} from '../engine/runtime';
import type { EffectResult, RollResult } from '../engine/runtime';

export type { EffectResult, RollResult };
export { getNextNodeId };

import type { GameData } from './types';

/**
 * Accepts the wire-format GameData and derives axisKeys for Romana:
 * - factions: keyed by faction IDs from phase
 * - personalFavors: keyed by NPC IDs
 */
export function initState(data: GameData) {
  const axisKeys: Record<string, string[]> = {
    factions: data.phase.factions.map(f => f.id),
    personalFavors: Object.keys(data.npcs),
  };
  return _initState(romanaConfig, {
    phaseId: data.phase.id,
    totalMoves: data.phase.totalMoves,
    axisKeys,
  });
}

export function getAvailableConversations(
  state: GameState,
  conversations: Record<string, any>,
  powerShiftConvoId: string,
) {
  return _getAvailableConversations(romanaConfig, state, conversations, powerShiftConvoId);
}

export function checkPreconditions(state: GameState, preconditions: any[]) {
  return _checkPreconditions(romanaConfig, state, preconditions);
}

export function resolvePassive(state: GameState, node: any) {
  return _resolvePassive(state, node);
}

export function resolveConvergence(state: GameState, node: any, rollHistory: string[]) {
  return _resolveConvergence(state, node, rollHistory);
}

export function resolveRoll(state: GameState, rollConfig: any) {
  return _resolveRoll(state, rollConfig);
}

export function applyExitEffects(state: GameState, exitState: any) {
  return _applyExitEffects(romanaConfig, state, exitState);
}
