import type {
  GameState,
  GameData,
  ConversationData,
  RollResult,
  RomanaTrait,
  CursusRank,
} from './types';

export function initState(data: GameData): GameState {
  const { phase, npcs } = data;
  const factionStandings: Record<string, number> = {};
  for (const faction of phase.factions) {
    factionStandings[faction.id] = 0;
  }
  const personalFavors: Record<string, number> = {};
  for (const npcId in npcs) {
    personalFavors[npcId] = 0;
  }
  return {
    currentPhase: phase.id,
    currentRank: 'citizen',
    turnsRemaining: phase.totalMoves,
    reputation: { severitas: 0, clementia: 0, audacia: 0, calliditas: 0 },
    factionStandings,
    personalFavors,
    exitStateHistory: [],
    visitedNodes: new Set(),
    firedEvents: new Set(),
    lastNpcId: null,
    force: 0,
    wealth: 0,
  };
}

export function getAvailableConversations(
  state: GameState,
  conversations: Record<string, ConversationData>,
  powerShiftConvoId: string
): ConversationData[] {
  const available: ConversationData[] = [];
  for (const [id, convo] of Object.entries(conversations)) {
    if (id === powerShiftConvoId) continue;
    if (state.lastNpcId && convo.npcId === state.lastNpcId) continue;
    if (!checkPreconditions(state, convo.preconditions)) continue;
    const completed = state.exitStateHistory.some(h => h.conversationId === id);
    if (!completed) available.push(convo);
  }
  return available;
}

export function checkPreconditions(state: GameState, preconditions: any[]): boolean {
  if (!preconditions || preconditions.length === 0) return true;
  return preconditions.every(p => checkSinglePrecondition(state, p));
}

function checkSinglePrecondition(state: GameState, p: any): boolean {
  switch (p.type) {
    case 'min_rank': {
      const ranks: CursusRank[] = ['citizen', 'magistrate', 'consul'];
      return ranks.indexOf(state.currentRank) >= ranks.indexOf(p.minRank);
    }
    case 'faction_standing':
      return (state.factionStandings[p.factionId] || 0) >= (p.min ?? p.minStanding ?? 0);
    case 'prior_exit_state':
      return (p.requiredExitStateIds || []).some((esId: string) =>
        state.exitStateHistory.some(
          h => h.conversationId === p.conversationId && h.exitStateId === esId
        )
      );
    case 'any_of':
      return (p.conditions || []).some((c: any) => checkSinglePrecondition(state, c));
    case 'event':
    case 'phase_event':
      return state.firedEvents.has(p.eventId);
    default:
      return true;
  }
}

export function resolvePassive(
  state: GameState,
  node: any
): { dialogue: string; nextNodeId: string; matchedTrait: string | null } {
  for (const response of node.responses) {
    const traitVal = state.reputation[response.trait as RomanaTrait] || 0;
    if (traitVal >= response.threshold) {
      return {
        dialogue: response.playerDialogue,
        nextNodeId: response.nextNodeId,
        matchedTrait: response.trait,
      };
    }
  }
  return {
    dialogue: node.fallbackResponse.playerDialogue,
    nextNodeId: node.fallbackResponse.nextNodeId,
    matchedTrait: null,
  };
}

export function resolveConvergence(
  state: GameState,
  node: any,
  rollHistory: string[]
): string {
  for (const route of node.routes) {
    const cond = route.condition;
    let matches = false;
    switch (cond.type) {
      case 'reputation_dominant': {
        const rep = state.reputation;
        const entries = Object.entries(rep) as [string, number][];
        const dominant = entries.sort((a, b) => b[1] - a[1])[0];
        matches = dominant != null && dominant[0] === cond.trait;
        break;
      }
      case 'roll_history':
        matches = rollHistory.filter(r => r === 'success').length >= cond.minSuccesses;
        break;
      case 'visited_node':
        matches = state.visitedNodes.has(cond.nodeId);
        break;
      case 'faction_standing':
        matches = (state.factionStandings[cond.factionId] || 0) >= cond.min;
        break;
    }
    if (matches) return route.nextNodeId;
  }
  return node.fallbackNodeId;
}

export function resolveRoll(state: GameState, rollConfig: any): RollResult {
  let total = 0;
  const rolls: number[] = [];
  for (let i = 0; i < rollConfig.dice.count; i++) {
    const roll = Math.floor(Math.random() * rollConfig.dice.sides) + 1;
    rolls.push(roll);
    total += roll;
  }

  const factors = rollConfig.factors;
  let modifier =
    (factors.personalFavor || 0) +
    (factors.factionAlignment || 0) +
    (factors.force || 0) +
    (factors.wealth || 0);

  if (rollConfig.reputationBonus) {
    const traitVal = state.reputation[rollConfig.reputationBonus.trait as RomanaTrait] || 0;
    modifier += traitVal * rollConfig.reputationBonus.weight;
  }

  const finalTotal = total + modifier;
  const threshold = rollConfig.baseThreshold;

  let outcome: 'success' | 'partial' | 'failure';
  if (finalTotal >= threshold) {
    outcome = 'success';
  } else if (finalTotal >= threshold - 2) {
    outcome = 'partial';
  } else {
    outcome = 'failure';
  }

  return { rolls, total, modifier, finalTotal, threshold, outcome };
}

export interface EffectResult {
  text: string;
  reason: string;
  positive: boolean;
  gameOver?: boolean;
  gameOverReason?: string;
}

export function applyExitEffects(
  state: GameState,
  exitState: any
): { newState: GameState; results: EffectResult[] } {
  // Deep clone the state
  const newState: GameState = {
    ...state,
    reputation: { ...state.reputation },
    factionStandings: { ...state.factionStandings },
    personalFavors: { ...state.personalFavors },
    exitStateHistory: [...state.exitStateHistory],
    visitedNodes: new Set(state.visitedNodes),
    firedEvents: new Set(state.firedEvents),
    lastNpcId: state.lastNpcId,
  };

  const results: EffectResult[] = [];

  for (const effect of exitState.effects) {
    switch (effect.type) {
      case 'faction_standing':
        for (const delta of effect.deltas) {
          const old = newState.factionStandings[delta.factionId] || 0;
          newState.factionStandings[delta.factionId] = Math.max(-10, Math.min(10, old + delta.shift));
          results.push({
            text: `${delta.factionId}: ${delta.shift > 0 ? '+' : ''}${delta.shift}`,
            reason: delta.reason,
            positive: delta.shift > 0,
          });
        }
        break;
      case 'reputation':
        for (const delta of effect.deltas) {
          const trait = delta.trait as RomanaTrait;
          const old = newState.reputation[trait] || 0;
          newState.reputation[trait] = Math.max(-10, Math.min(10, old + delta.shift));
          results.push({
            text: `${delta.trait}: ${delta.shift > 0 ? '+' : ''}${delta.shift}`,
            reason: delta.reason,
            positive: delta.shift > 0,
          });
        }
        break;
      case 'turn_penalty':
        newState.turnsRemaining = Math.max(0, newState.turnsRemaining + effect.shift);
        results.push({
          text: `Turns: ${effect.shift > 0 ? '+' : ''}${effect.shift}`,
          reason: effect.reason,
          positive: effect.shift > 0,
        });
        break;
      case 'unlock_conversation':
        results.push({ text: 'New conversation available', reason: '', positive: true });
        break;
      case 'lock_conversation':
        results.push({ text: 'Conversation locked', reason: '', positive: false });
        break;
      case 'rank_change':
        newState.currentRank = effect.newRank;
        results.push({ text: `Rank: ${effect.newRank}`, reason: effect.reason, positive: true });
        break;
      case 'fire_event':
        newState.firedEvents.add(effect.eventId);
        break;
      case 'game_over':
        results.push({
          text: 'GAME OVER',
          reason: effect.reason,
          positive: false,
          gameOver: true,
          gameOverReason: effect.reason,
        });
        break;
    }
  }

  return { newState, results };
}

export function getNextNodeId(opt: any, rollOutcome?: string): string | null {
  if (!rollOutcome) {
    return opt.nextNodeId || (opt.onSuccess && opt.onSuccess.nextNodeId);
  }
  if (rollOutcome === 'success' && opt.onSuccess) return opt.onSuccess.nextNodeId;
  if (rollOutcome === 'partial' && opt.onPartial) return opt.onPartial.nextNodeId;
  if (rollOutcome === 'failure' && opt.onFailure) return opt.onFailure.nextNodeId;
  return (opt.onSuccess && opt.onSuccess.nextNodeId) || opt.nextNodeId;
}
