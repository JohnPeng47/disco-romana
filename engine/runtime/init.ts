import type { GameConfig } from "../config";
import type { GameState } from "../world/state";
import type { ReputationProfile } from "../conversation/effects/reputation";
import { initAxes } from "../axes";

export interface InitData {
  phaseId: string;
  totalMoves: number;
  axisKeys: Record<string, string[]>;
}

export function initState<T extends string, R extends string>(
  config: GameConfig<T, R>,
  data: InitData,
): GameState<T, R> {
  const reputation = { ...config.defaultReputation } as ReputationProfile<T>;

  return {
    currentPhase: data.phaseId,
    currentRank: config.startingRank,
    turnsRemaining: data.totalMoves,
    reputation,
    axes: initAxes(config.axes, data.axisKeys),
    exitStateHistory: [],
    visitedNodes: new Set(),
    firedEvents: new Set(),
    lastNpcId: null,
  };
}
