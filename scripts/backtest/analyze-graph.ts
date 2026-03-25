#!/usr/bin/env npx tsx

import * as fs from "fs";
import * as path from "path";

// ── Types ──

interface Dice {
  count: number;
  sides: number;
}

interface Roll {
  dice: Dice;
  baseThreshold: number;
  factors: Record<string, number>;
  reputationBonus: { trait: string; weight: number };
}

interface Option {
  playerDialogue: string;
  nextNodeId?: string;
  visibilityRequirement?: { trait: string; minValue: number };
  roll?: Roll;
  onSuccess?: { nextNodeId: string };
  onPartial?: { nextNodeId: string };
  onFailure?: { nextNodeId: string };
}

interface PassiveResponse {
  trait: string;
  threshold: number;
  playerDialogue: string;
  nextNodeId: string;
}

interface RouteCondition {
  type: string;
  factionId?: string;
  min?: number;
  trait?: string;
  nodeId?: string;
}

interface Route {
  condition: RouteCondition;
  nextNodeId: string;
}

interface ConvoNode {
  id: string;
  type: "active" | "passive" | "noop" | "convergence" | "exit";
  npcDialogue: string;
  options?: Option[];
  responses?: PassiveResponse[];
  fallbackResponse?: { playerDialogue: string; nextNodeId: string };
  routes?: Route[];
  fallbackNodeId?: string;
  exitStateId?: string;
}

interface EffectDelta {
  factionId?: string;
  trait?: string;
  shift: number;
  reason: string;
}

interface Effect {
  type: string;
  deltas?: EffectDelta[];
  conversationId?: string;
  newRank?: string;
  reason?: string;
  shift?: number;
}

interface ExitState {
  id: string;
  narrativeLabel: string;
  effects: Effect[];
}

interface Precondition {
  type: string;
  npcId?: string;
  conversationId?: string;
  requiredExitStateIds?: string[];
  factionId?: string;
  min?: number;
  conditions?: Precondition[];
}

interface Conversation {
  id: string;
  npcId: string;
  phaseId: string;
  sequenceIndex: number;
  preconditions: Precondition[];
  entryNodeId: string;
  nodes: Record<string, ConvoNode>;
  exitStates: ExitState[];
}

interface NPC {
  id: string;
  name: string;
  factionId: string;
  rank: string;
  reputationProfile: Record<string, number>;
  conversationArcLength: number;
}

// ── Data Loading ──

const DEFAULT_OUTPUT_DIR = path.resolve(__dirname, "../../generation/output");
let OUTPUT_DIR = DEFAULT_OUTPUT_DIR;

function loadConversations(dir?: string): Conversation[] {
  const outputDir = dir || OUTPUT_DIR;
  const convos: Conversation[] = [];
  const charsDir = path.join(outputDir, "characters");

  if (fs.existsSync(charsDir)) {
    for (const npcDir of fs.readdirSync(charsDir)) {
      const fullDir = path.join(charsDir, npcDir);
      if (!fs.statSync(fullDir).isDirectory()) continue;
      for (const file of fs.readdirSync(fullDir)) {
        if (file.startsWith("convo_") && file.endsWith(".json")) {
          convos.push(JSON.parse(fs.readFileSync(path.join(fullDir, file), "utf-8")));
        }
      }
    }
  }

  // Power shift
  const psPath = path.join(outputDir, "power_shift", "convo.json");
  if (fs.existsSync(psPath)) {
    convos.push(JSON.parse(fs.readFileSync(psPath, "utf-8")));
  }

  return convos;
}

function loadNPCs(dir?: string): Map<string, NPC> {
  const outputDir = dir || OUTPUT_DIR;
  const npcs = new Map<string, NPC>();
  const charsDir = path.join(outputDir, "characters");
  for (const npcDir of fs.readdirSync(charsDir)) {
    if (!fs.existsSync(charsDir)) return npcs;
    const npcPath = path.join(charsDir, npcDir, "npc.json");
    if (fs.existsSync(npcPath)) {
      const npc: NPC = JSON.parse(fs.readFileSync(npcPath, "utf-8"));
      npcs.set(npc.id, npc);
    }
  }
  return npcs;
}

interface PhaseConfig {
  totalMoves: number;
  powerShiftConversationId: string;
}

function loadPhase(dir?: string): PhaseConfig | null {
  const outputDir = dir || OUTPUT_DIR;
  const phasePath = path.join(outputDir, "phase.json");
  if (!fs.existsSync(phasePath)) return null;
  const data = JSON.parse(fs.readFileSync(phasePath, "utf-8"));
  return {
    totalMoves: data.totalMoves || 20,
    powerShiftConversationId: data.powerShiftConversationId || "power_shift",
  };
}

// ── Analysis ──

interface GateInfo {
  nodeId: string;
  trait: string;
  minValue: number;
  type: "visibility" | "passive";
}

interface EdgeInfo {
  from: string;
  to: string;
  condition?: string;
  isRollSuccess?: boolean;
  isRollFailure?: boolean;
  isRollPartial?: boolean;
  isFallback?: boolean;
}

interface PathToExit {
  exitId: string;
  exitLabel: string;
  paths: string[][];
}

interface ConvoAnalysis {
  convo: Conversation;
  totalNodes: number;
  exitNodes: number;
  reachableNodes: Set<string>;
  unreachableNodes: string[];
  gates: GateInfo[];
  edges: EdgeInfo[];
  pathsToExits: PathToExit[];
  deadEnds: string[];
}

function getEdges(convo: Conversation): EdgeInfo[] {
  const edges: EdgeInfo[] = [];
  for (const node of Object.values(convo.nodes)) {
    switch (node.type) {
      case "active":
      case "noop":
        for (const opt of node.options || []) {
          if (opt.nextNodeId) {
            edges.push({ from: node.id, to: opt.nextNodeId });
          }
          if (opt.roll) {
            if (opt.onSuccess) edges.push({ from: node.id, to: opt.onSuccess.nextNodeId, isRollSuccess: true });
            if (opt.onPartial) edges.push({ from: node.id, to: opt.onPartial.nextNodeId, isRollPartial: true });
            if (opt.onFailure) edges.push({ from: node.id, to: opt.onFailure.nextNodeId, isRollFailure: true });
          }
        }
        break;
      case "passive":
        for (const resp of node.responses || []) {
          edges.push({ from: node.id, to: resp.nextNodeId, condition: `${resp.trait} >= ${resp.threshold}` });
        }
        if (node.fallbackResponse) {
          edges.push({ from: node.id, to: node.fallbackResponse.nextNodeId, isFallback: true });
        }
        break;
      case "convergence":
        for (const route of node.routes || []) {
          const cond = describeCondition(route.condition);
          edges.push({ from: node.id, to: route.nextNodeId, condition: cond });
        }
        if (node.fallbackNodeId) {
          edges.push({ from: node.id, to: node.fallbackNodeId, isFallback: true });
        }
        break;
    }
  }
  return edges;
}

function describeCondition(c: RouteCondition): string {
  switch (c.type) {
    case "faction_standing":
      return `${c.factionId} >= ${c.min}`;
    case "reputation_dominant":
      return `dominant: ${c.trait}`;
    case "visited_node":
      return `visited: ${c.nodeId}`;
    default:
      return `${c.type}`;
  }
}

function getGates(convo: Conversation): GateInfo[] {
  const gates: GateInfo[] = [];
  for (const node of Object.values(convo.nodes)) {
    if (node.type === "active" || node.type === "noop") {
      for (const opt of node.options || []) {
        if (opt.visibilityRequirement) {
          gates.push({
            nodeId: opt.nextNodeId || node.id,
            trait: opt.visibilityRequirement.trait,
            minValue: opt.visibilityRequirement.minValue,
            type: "visibility",
          });
        }
      }
    }
    if (node.type === "passive") {
      for (const resp of node.responses || []) {
        gates.push({
          nodeId: resp.nextNodeId,
          trait: resp.trait,
          minValue: resp.threshold,
          type: "passive",
        });
      }
    }
  }
  return gates;
}

function bfsReachable(convo: Conversation): Set<string> {
  const visited = new Set<string>();
  const edges = getEdges(convo);
  const adjList = new Map<string, string[]>();
  for (const e of edges) {
    if (!adjList.has(e.from)) adjList.set(e.from, []);
    adjList.get(e.from)!.push(e.to);
  }

  const queue = [convo.entryNodeId];
  visited.add(convo.entryNodeId);
  while (queue.length > 0) {
    const curr = queue.shift()!;
    for (const next of adjList.get(curr) || []) {
      if (!visited.has(next)) {
        visited.add(next);
        queue.push(next);
      }
    }
  }
  return visited;
}

function findPathsToExits(convo: Conversation): PathToExit[] {
  const edges = getEdges(convo);
  const adjList = new Map<string, string[]>();
  for (const e of edges) {
    if (!adjList.has(e.from)) adjList.set(e.from, []);
    adjList.get(e.from)!.push(e.to);
  }

  const results: PathToExit[] = [];
  const exitNodes = Object.values(convo.nodes).filter((n) => n.type === "exit");

  for (const exitNode of exitNodes) {
    const exitState = convo.exitStates.find((es) => es.id === exitNode.exitStateId);
    const paths: string[][] = [];

    // DFS with path tracking, limit to prevent explosion
    const MAX_PATHS = 20;
    const dfs = (current: string, path: string[], visited: Set<string>) => {
      if (paths.length >= MAX_PATHS) return;
      if (current === exitNode.id) {
        paths.push([...path]);
        return;
      }
      for (const next of adjList.get(current) || []) {
        if (!visited.has(next)) {
          visited.add(next);
          path.push(next);
          dfs(next, path, visited);
          path.pop();
          visited.delete(next);
        }
      }
    };

    dfs(convo.entryNodeId, [convo.entryNodeId], new Set([convo.entryNodeId]));
    results.push({
      exitId: exitNode.exitStateId || exitNode.id,
      exitLabel: exitState?.narrativeLabel || exitNode.id,
      paths,
    });
  }

  return results;
}

function findDeadEnds(convo: Conversation): string[] {
  const deadEnds: string[] = [];
  for (const node of Object.values(convo.nodes)) {
    if (node.type === "exit") continue;
    const edges = getEdges(convo).filter((e) => e.from === node.id);
    if (edges.length === 0) {
      deadEnds.push(node.id);
    }
  }
  return deadEnds;
}

function analyzeConvo(convo: Conversation): ConvoAnalysis {
  const nodes = Object.values(convo.nodes);
  const reachable = bfsReachable(convo);
  const allIds = nodes.map((n) => n.id);
  const unreachable = allIds.filter((id) => !reachable.has(id));

  return {
    convo,
    totalNodes: nodes.length,
    exitNodes: nodes.filter((n) => n.type === "exit").length,
    reachableNodes: reachable,
    unreachableNodes: unreachable,
    gates: getGates(convo),
    edges: getEdges(convo),
    pathsToExits: findPathsToExits(convo),
    deadEnds: findDeadEnds(convo),
  };
}

// ── Faction Budget ──

interface FactionBudget {
  factionId: string;
  maxAchievable: number;
  minAchievable: number;
  sources: { convoId: string; exitId: string; exitLabel: string; shift: number }[];
}

function computeFactionBudgets(convos: Conversation[]): Map<string, FactionBudget> {
  const budgets = new Map<string, FactionBudget>();

  for (const convo of convos) {
    if (convo.id === "power_shift") continue;

    for (const es of convo.exitStates) {
      for (const effect of es.effects) {
        if (effect.type === "faction_standing" && effect.deltas) {
          for (const d of effect.deltas) {
            if (!budgets.has(d.factionId!)) {
              budgets.set(d.factionId!, {
                factionId: d.factionId!,
                maxAchievable: 0,
                minAchievable: 0,
                sources: [],
              });
            }
            budgets.get(d.factionId!)!.sources.push({
              convoId: convo.id,
              exitId: es.id,
              exitLabel: es.narrativeLabel,
              shift: d.shift,
            });
          }
        }
      }
    }
  }

  // For each faction, compute max/min by picking best/worst exit per conversation
  for (const budget of budgets.values()) {
    // Group sources by convoId
    const byConvo = new Map<string, { shift: number; exitId: string; exitLabel: string }[]>();
    for (const src of budget.sources) {
      if (!byConvo.has(src.convoId)) byConvo.set(src.convoId, []);
      byConvo.get(src.convoId)!.push(src);
    }

    let max = 0;
    let min = 0;
    for (const [, exits] of byConvo) {
      const shifts = exits.map((e) => e.shift);
      // Player will exit one of these per convo; also consider "no effect" (0) if not all exits affect this faction
      max += Math.max(0, ...shifts);
      min += Math.min(0, ...shifts);
    }
    budget.maxAchievable = max;
    budget.minAchievable = min;
  }

  return budgets;
}

// ── Unlock Chain ──

interface UnlockChain {
  convoId: string;
  npcId: string;
  exits: {
    exitId: string;
    exitLabel: string;
    unlocks: string[];
    factionDeltas: { factionId: string; shift: number }[];
    repDeltas: { trait: string; shift: number }[];
    isTerminal: boolean;
    hasGameOver: boolean;
    hasTurnPenalty: boolean;
  }[];
}

function buildUnlockChains(convos: Conversation[]): UnlockChain[] {
  const chains: UnlockChain[] = [];

  for (const convo of convos) {
    const chain: UnlockChain = { convoId: convo.id, npcId: convo.npcId, exits: [] };

    for (const es of convo.exitStates) {
      const unlocks: string[] = [];
      const factionDeltas: { factionId: string; shift: number }[] = [];
      const repDeltas: { trait: string; shift: number }[] = [];
      let hasGameOver = false;
      let hasTurnPenalty = false;

      for (const effect of es.effects) {
        if (effect.type === "unlock_conversation") unlocks.push(effect.conversationId!);
        if (effect.type === "faction_standing" && effect.deltas) {
          for (const d of effect.deltas) factionDeltas.push({ factionId: d.factionId!, shift: d.shift });
        }
        if (effect.type === "reputation" && effect.deltas) {
          for (const d of effect.deltas) repDeltas.push({ trait: d.trait!, shift: d.shift });
        }
        if (effect.type === "game_over") hasGameOver = true;
        if (effect.type === "turn_penalty") hasTurnPenalty = true;
      }

      // Check if any convo_1 requires this exit
      const isUnlocker = unlocks.length > 0 || convos.some(
        (c) => (c.preconditions || []).some(
          (p) => (p.requiredExitStateIds || []).includes(es.id)
        )
      );

      chain.exits.push({
        exitId: es.id,
        exitLabel: es.narrativeLabel,
        unlocks,
        factionDeltas,
        repDeltas,
        isTerminal: !isUnlocker,
        hasGameOver,
        hasTurnPenalty,
      });
    }

    chains.push(chain);
  }

  return chains;
}

// ── Bottleneck Detection ──

interface Bottleneck {
  type: "unreachable" | "narrow_gate" | "single_path_exit" | "power_shift_threshold" | "dead_end";
  severity: "warning" | "critical";
  message: string;
}

function detectBottlenecks(
  analyses: ConvoAnalysis[],
  chains: UnlockChain[],
  budgets: Map<string, FactionBudget>
): Bottleneck[] {
  const bottlenecks: Bottleneck[] = [];

  for (const a of analyses) {
    // Unreachable nodes
    for (const nodeId of a.unreachableNodes) {
      bottlenecks.push({
        type: "unreachable",
        severity: "critical",
        message: `${nodeId}: no inbound edges (orphan node)`,
      });
    }

    // Dead ends (non-exit with no outbound)
    for (const nodeId of a.deadEnds) {
      bottlenecks.push({
        type: "dead_end",
        severity: "critical",
        message: `${nodeId}: non-exit node with no outbound edges`,
      });
    }

    // Exits reachable only via a single narrow path
    for (const pte of a.pathsToExits) {
      if (pte.paths.length === 1) {
        bottlenecks.push({
          type: "single_path_exit",
          severity: "warning",
          message: `${a.convo.id} → ${pte.exitLabel} (${pte.exitId}): only 1 path (length ${pte.paths[0].length})`,
        });
      }
    }

    // High trait gates
    for (const gate of a.gates) {
      if (gate.minValue >= 6) {
        bottlenecks.push({
          type: "narrow_gate",
          severity: "warning",
          message: `${a.convo.id}: node ${gate.nodeId} requires ${gate.trait} >= ${gate.minValue} (${gate.type} gate)`,
        });
      }
    }
  }

  // Power shift faction thresholds
  const psConvo = analyses.find((a) => a.convo.id === "power_shift");
  if (psConvo) {
    for (const route of (psConvo.convo.nodes["ps_n02"]?.routes || [])) {
      const cond = route.condition;
      if (cond.type === "faction_standing" && cond.factionId && cond.min) {
        const budget = budgets.get(cond.factionId);
        if (budget) {
          if (budget.maxAchievable < cond.min) {
            bottlenecks.push({
              type: "power_shift_threshold",
              severity: "critical",
              message: `power_shift ${cond.factionId} path requires >= ${cond.min}, but max achievable is ${budget.maxAchievable} — UNREACHABLE`,
            });
          } else if (budget.maxAchievable - cond.min <= 1) {
            bottlenecks.push({
              type: "power_shift_threshold",
              severity: "warning",
              message: `power_shift ${cond.factionId} path requires >= ${cond.min}, max achievable is ${budget.maxAchievable} — tight margin`,
            });
          }
        }
      }
    }
  }

  return bottlenecks;
}

// ── Rendering ──

const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";
const MAGENTA = "\x1b[35m";

function shortNodeId(fullId: string): string {
  const parts = fullId.split("_");
  return parts[parts.length - 1];
}

function renderReport(
  analyses: ConvoAnalysis[],
  chains: UnlockChain[],
  budgets: Map<string, FactionBudget>,
  bottlenecks: Bottleneck[]
) {
  console.log();
  console.log(`${BOLD}${"=".repeat(60)}${RESET}`);
  console.log(`${BOLD}  CONVERSATION GRAPH ANALYSIS${RESET}`);
  console.log(`${BOLD}${"=".repeat(60)}${RESET}`);

  // ── Summary Stats ──
  const totalNodes = analyses.reduce((s, a) => s + a.totalNodes, 0);
  const totalExits = analyses.reduce((s, a) => s + a.exitNodes, 0);
  const totalReachable = analyses.reduce((s, a) => s + a.reachableNodes.size, 0);
  const totalGates = analyses.reduce((s, a) => s + a.gates.length, 0);

  console.log();
  console.log(`${BOLD}  Summary${RESET}`);
  console.log(`  Conversations: ${analyses.length}`);
  console.log(`  Total nodes:   ${totalNodes} (${totalExits} exits)`);
  console.log(`  Reachable:     ${totalReachable}/${totalNodes} (${pct(totalReachable, totalNodes)})`);
  console.log(`  Trait gates:   ${totalGates}`);
  console.log(`  Bottlenecks:   ${bottlenecks.filter((b) => b.severity === "critical").length} critical, ${bottlenecks.filter((b) => b.severity === "warning").length} warnings`);

  // ── Per-Conversation Breakdown ──
  console.log();
  console.log(`${BOLD}${"─".repeat(60)}${RESET}`);
  console.log(`${BOLD}  Per-Conversation Breakdown${RESET}`);
  console.log(`${BOLD}${"─".repeat(60)}${RESET}`);

  for (const a of analyses) {
    console.log();
    const reachPct = pct(a.reachableNodes.size, a.totalNodes);
    console.log(`${BOLD}  ${a.convo.id}${RESET} ${DIM}(${a.convo.npcId})${RESET}`);
    console.log(`    Nodes: ${a.totalNodes} | Exits: ${a.exitNodes} | Reachable: ${a.reachableNodes.size}/${a.totalNodes} (${reachPct})`);

    // Preconditions
    if (a.convo.preconditions && a.convo.preconditions.length > 0) {
      for (const pre of a.convo.preconditions) {
        if (!pre.conversationId) continue;
        const reqIds = (pre.requiredExitStateIds || []).map((id) => {
          const shortId = id.replace(pre.conversationId + "_", "");
          return shortId;
        });
        console.log(`    ${CYAN}Requires:${RESET} ${pre.conversationId} → ${reqIds.join(" | ")}`);
      }
    }

    // Exits with path counts
    console.log(`    ${BOLD}Exits:${RESET}`);
    for (const pte of a.pathsToExits) {
      const shortest = pte.paths.length > 0 ? Math.min(...pte.paths.map((p) => p.length)) : 0;
      const check = pte.paths.length > 0 ? GREEN + "✓" + RESET : RED + "✗" + RESET;
      console.log(
        `      ${check} ${pte.exitLabel} ${DIM}(${pte.exitId.replace(a.convo.id + "_", "")})${RESET}` +
        `  ${pte.paths.length} path${pte.paths.length !== 1 ? "s" : ""}` +
        (shortest > 0 ? ` ${DIM}(shortest: ${shortest} nodes)${RESET}` : "")
      );
    }

    // Gates
    if (a.gates.length > 0) {
      console.log(`    ${BOLD}Trait gates:${RESET}`);
      // Deduplicate and show unique gates
      const seen = new Set<string>();
      for (const g of a.gates) {
        const key = `${g.nodeId}:${g.trait}:${g.minValue}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const color = g.minValue >= 6 ? RED : g.minValue >= 5 ? YELLOW : RESET;
        console.log(`      ${color}${shortNodeId(g.nodeId)}: ${g.trait} >= ${g.minValue}${RESET} ${DIM}(${g.type})${RESET}`);
      }
    }

    // Unreachable
    if (a.unreachableNodes.length > 0) {
      console.log(`    ${RED}Unreachable: ${a.unreachableNodes.map(shortNodeId).join(", ")}${RESET}`);
    }
    if (a.deadEnds.length > 0) {
      console.log(`    ${RED}Dead ends: ${a.deadEnds.map(shortNodeId).join(", ")}${RESET}`);
    }
  }

  // ── Unlock Chains ──
  console.log();
  console.log(`${BOLD}${"─".repeat(60)}${RESET}`);
  console.log(`${BOLD}  Unlock Chains${RESET}`);
  console.log(`${BOLD}${"─".repeat(60)}${RESET}`);

  // Group by NPC
  const chainsByNpc = new Map<string, UnlockChain[]>();
  for (const chain of chains) {
    if (!chainsByNpc.has(chain.npcId)) chainsByNpc.set(chain.npcId, []);
    chainsByNpc.get(chain.npcId)!.push(chain);
  }

  for (const [npcId, npcChains] of chainsByNpc) {
    console.log();
    console.log(`  ${BOLD}${npcId}${RESET}`);

    for (const chain of npcChains.sort((a, b) => {
      const ai = analyses.find((x) => x.convo.id === a.convoId)?.convo.sequenceIndex ?? 0;
      const bi = analyses.find((x) => x.convo.id === b.convoId)?.convo.sequenceIndex ?? 0;
      return ai - bi;
    })) {
      console.log(`    ${DIM}${chain.convoId}${RESET}`);

      for (let i = 0; i < chain.exits.length; i++) {
        const ex = chain.exits[i];
        const isLast = i === chain.exits.length - 1;
        const prefix = isLast ? "└─" : "├─";

        let unlockStr = "";
        if (ex.unlocks.length > 0) {
          unlockStr = ` ${GREEN}→ unlocks ${ex.unlocks.join(", ")}${RESET}`;
        } else if (ex.hasGameOver) {
          unlockStr = ` ${RED}→ GAME OVER${RESET}`;
        } else if (ex.isTerminal) {
          unlockStr = ` ${DIM}→ (terminal)${RESET}`;
        }

        const deltas = ex.factionDeltas.map((d) => {
          const sign = d.shift > 0 ? "+" : "";
          return `${d.factionId} ${sign}${d.shift}`;
        });
        const deltaStr = deltas.length > 0 ? ` ${DIM}[${deltas.join(", ")}]${RESET}` : "";

        const penalties: string[] = [];
        if (ex.hasTurnPenalty) penalties.push(`${RED}turn penalty${RESET}`);
        const penaltyStr = penalties.length > 0 ? ` ${penalties.join(", ")}` : "";

        console.log(`      ${prefix} ${ex.exitLabel}${unlockStr}${deltaStr}${penaltyStr}`);
      }
    }
  }

  // ── Faction Budget (Power Shift Reachability) ──
  console.log();
  console.log(`${BOLD}${"─".repeat(60)}${RESET}`);
  console.log(`${BOLD}  Power Shift Faction Budget${RESET}`);
  console.log(`${BOLD}${"─".repeat(60)}${RESET}`);

  const psConvo = analyses.find((a) => a.convo.id === "power_shift");
  const psRoutes = psConvo?.convo.nodes["ps_n02"]?.routes || [];

  for (const route of psRoutes) {
    const cond = route.condition;
    if (cond.type !== "faction_standing") continue;
    const budget = budgets.get(cond.factionId!);
    if (!budget) continue;

    const required = cond.min!;
    const margin = budget.maxAchievable - required;
    const color = margin < 0 ? RED : margin <= 1 ? YELLOW : GREEN;

    console.log();
    console.log(`  ${BOLD}${cond.factionId}${RESET} path ${DIM}(requires >= ${required})${RESET}`);
    console.log(`    ${color}Max achievable: ${budget.maxAchievable}${RESET} ${DIM}(margin: ${margin >= 0 ? "+" : ""}${margin})${RESET}`);
    console.log(`    Min achievable: ${budget.minAchievable}`);

    // Show best sources
    const byConvo = new Map<string, typeof budget.sources>();
    for (const src of budget.sources) {
      if (!byConvo.has(src.convoId)) byConvo.set(src.convoId, []);
      byConvo.get(src.convoId)!.push(src);
    }

    console.log(`    ${DIM}Sources:${RESET}`);
    for (const [convoId, sources] of byConvo) {
      const best = sources.reduce((a, b) => (a.shift > b.shift ? a : b));
      const worst = sources.reduce((a, b) => (a.shift < b.shift ? a : b));
      const rangeStr =
        best.shift === worst.shift
          ? `${fmtShift(best.shift)}`
          : `${fmtShift(worst.shift)} to ${fmtShift(best.shift)}`;
      console.log(`      ${convoId}: ${rangeStr} ${DIM}(best: ${best.exitLabel})${RESET}`);
    }
  }

  // ── Bottlenecks & Warnings ──
  console.log();
  console.log(`${BOLD}${"─".repeat(60)}${RESET}`);
  console.log(`${BOLD}  Bottlenecks & Warnings${RESET}`);
  console.log(`${BOLD}${"─".repeat(60)}${RESET}`);
  console.log();

  if (bottlenecks.length === 0) {
    console.log(`  ${GREEN}No bottlenecks detected.${RESET}`);
  } else {
    const criticals = bottlenecks.filter((b) => b.severity === "critical");
    const warnings = bottlenecks.filter((b) => b.severity === "warning");

    for (const b of criticals) {
      console.log(`  ${RED}CRITICAL${RESET} ${b.message}`);
    }
    for (const b of warnings) {
      console.log(`  ${YELLOW}WARNING${RESET}  ${b.message}`);
    }
  }

  console.log();
}

// ── Tree Rendering ──

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

function renderTree(convos: Conversation[]) {
  for (const convo of convos) {
    console.log();
    console.log(`${BOLD}${"=".repeat(70)}${RESET}`);
    console.log(`${BOLD}  ${convo.id}${RESET} ${DIM}(${convo.npcId})${RESET}`);
    console.log(`${BOLD}${"=".repeat(70)}${RESET}`);

    // Build adjacency with labels for the DAG walk
    const visited = new Set<string>();
    const backrefNodes = findBackrefs(convo);

    walkNode(convo, convo.entryNodeId, "", true, visited, backrefNodes);

    // Legend for exit states
    const exitNodes = Object.values(convo.nodes).filter((n) => n.type === "exit");
    if (exitNodes.length > 0) {
      console.log();
      console.log(`  ${BOLD}Exit States:${RESET}`);
      for (const en of exitNodes) {
        const es = convo.exitStates.find((e) => e.id === en.exitStateId);
        if (!es) continue;
        const effects: string[] = [];
        for (const eff of es.effects) {
          if (eff.type === "faction_standing" && eff.deltas) {
            for (const d of eff.deltas) {
              effects.push(`${d.factionId} ${d.shift > 0 ? "+" : ""}${d.shift}`);
            }
          }
          if (eff.type === "reputation" && eff.deltas) {
            for (const d of eff.deltas) {
              effects.push(`${d.trait} ${d.shift > 0 ? "+" : ""}${d.shift}`);
            }
          }
          if (eff.type === "unlock_conversation") effects.push(`${GREEN}unlocks ${eff.conversationId}${RESET}`);
          if (eff.type === "game_over") effects.push(`${RED}GAME OVER${RESET}`);
          if (eff.type === "turn_penalty") effects.push(`${RED}turn penalty${RESET}`);
          if (eff.type === "rank_change") effects.push(`rank → ${eff.newRank}`);
        }
        console.log(`    ${MAGENTA}${es.narrativeLabel}${RESET} ${DIM}(${es.id.replace(convo.id + "_", "")})${RESET}`);
        if (effects.length > 0) {
          console.log(`      ${DIM}${effects.join(", ")}${RESET}`);
        }
      }
    }
    console.log();
  }
}

/** Find nodes that have multiple inbound edges — these get a backreference marker instead of re-expanding. */
function findBackrefs(convo: Conversation): Set<string> {
  const inboundCount = new Map<string, number>();
  for (const node of Object.values(convo.nodes)) {
    for (const targetId of getNodeTargets(node)) {
      inboundCount.set(targetId, (inboundCount.get(targetId) || 0) + 1);
    }
  }
  // Nodes with >1 inbound are convergence points — show them once, backref after
  const backrefs = new Set<string>();
  for (const [id, count] of inboundCount) {
    if (count > 1) backrefs.add(id);
  }
  return backrefs;
}

function getNodeTargets(node: ConvoNode): string[] {
  const targets: string[] = [];
  switch (node.type) {
    case "active":
    case "noop":
      for (const opt of node.options || []) {
        if (opt.nextNodeId) targets.push(opt.nextNodeId);
        if (opt.onSuccess) targets.push(opt.onSuccess.nextNodeId);
        if (opt.onPartial) targets.push(opt.onPartial.nextNodeId);
        if (opt.onFailure) targets.push(opt.onFailure.nextNodeId);
      }
      break;
    case "passive":
      for (const resp of node.responses || []) targets.push(resp.nextNodeId);
      if (node.fallbackResponse) targets.push(node.fallbackResponse.nextNodeId);
      break;
    case "convergence":
      for (const route of node.routes || []) targets.push(route.nextNodeId);
      if (node.fallbackNodeId) targets.push(node.fallbackNodeId);
      break;
  }
  return targets;
}

function walkNode(
  convo: Conversation,
  nodeId: string,
  indent: string,
  isLast: boolean,
  visited: Set<string>,
  backrefNodes: Set<string>
) {
  const node = convo.nodes[nodeId];
  if (!node) {
    console.log(`${indent}${RED}??? missing node: ${nodeId}${RESET}`);
    return;
  }

  const sId = shortNodeId(node.id);
  const typeColors: Record<string, string> = {
    active: CYAN,
    passive: YELLOW,
    noop: DIM,
    convergence: MAGENTA,
    exit: GREEN,
  };
  const typeColor = typeColors[node.type] || RESET;
  const typeTag = `${typeColor}[${node.type}]${RESET}`;
  const dialogue = truncate(node.npcDialogue, 60);

  // If this is a backref node we've already expanded, show a pointer
  if (visited.has(nodeId)) {
    console.log(`${indent}${DIM}↳ ${sId} ${typeTag} (see above)${RESET}`);
    return;
  }

  visited.add(nodeId);

  // Node header
  if (node.type === "exit") {
    const es = convo.exitStates.find((e) => e.id === node.exitStateId);
    const label = es ? es.narrativeLabel : node.exitStateId || "?";
    console.log(`${indent}${BOLD}${sId}${RESET} ${typeTag} ${MAGENTA}⇒ ${label}${RESET}`);
    console.log(`${indent}${DIM}  "${dialogue}"${RESET}`);
    return;
  }

  console.log(`${indent}${BOLD}${sId}${RESET} ${typeTag} ${DIM}"${dialogue}"${RESET}`);

  // Render children based on node type
  const childIndent = indent + "  ";

  switch (node.type) {
    case "active":
    case "noop": {
      const opts = node.options || [];
      for (let i = 0; i < opts.length; i++) {
        const opt = opts[i];
        const last = i === opts.length - 1;
        const branch = last ? "└─" : "├─";
        const contIndent = childIndent + (last ? "  " : "│ ");
        const playerText = truncate(opt.playerDialogue, 50);

        if (opt.visibilityRequirement) {
          const req = opt.visibilityRequirement;
          const gateStr = `${YELLOW}[${req.trait} >= ${req.minValue}]${RESET} `;
          console.log(`${childIndent}${branch} ${gateStr}${DIM}"${playerText}"${RESET}`);
        } else {
          console.log(`${childIndent}${branch} ${DIM}"${playerText}"${RESET}`);
        }

        if (opt.roll) {
          // Roll branches
          const rollTargets: { label: string; nodeId: string }[] = [];
          if (opt.onSuccess) rollTargets.push({ label: `${GREEN}success${RESET}`, nodeId: opt.onSuccess.nextNodeId });
          if (opt.onPartial) rollTargets.push({ label: `${YELLOW}partial${RESET}`, nodeId: opt.onPartial.nextNodeId });
          if (opt.onFailure) rollTargets.push({ label: `${RED}failure${RESET}`, nodeId: opt.onFailure.nextNodeId });

          const rollInfo = `${DIM}🎲 ${opt.roll.dice.count}d${opt.roll.dice.sides} >= ${opt.roll.baseThreshold}${RESET}`;
          console.log(`${contIndent}${rollInfo}`);

          for (let j = 0; j < rollTargets.length; j++) {
            const rt = rollTargets[j];
            const rLast = j === rollTargets.length - 1;
            const rBranch = rLast ? "└─" : "├─";
            const rCont = contIndent + (rLast ? "  " : "│ ");
            console.log(`${contIndent}${rBranch} ${rt.label}:`);
            walkNode(convo, rt.nodeId, rCont, rLast, visited, backrefNodes);
          }
        } else if (opt.nextNodeId) {
          walkNode(convo, opt.nextNodeId, contIndent, last, visited, backrefNodes);
        }
      }
      break;
    }

    case "passive": {
      const responses = node.responses || [];
      const hasFallback = !!node.fallbackResponse;
      const totalChildren = responses.length + (hasFallback ? 1 : 0);

      for (let i = 0; i < responses.length; i++) {
        const resp = responses[i];
        const last = !hasFallback && i === responses.length - 1;
        const branch = last ? "└─" : "├─";
        const contIndent = childIndent + (last ? "  " : "│ ");
        console.log(`${childIndent}${branch} ${YELLOW}[${resp.trait} >= ${resp.threshold}]${RESET} ${DIM}"${truncate(resp.playerDialogue, 45)}"${RESET}`);
        walkNode(convo, resp.nextNodeId, contIndent, last, visited, backrefNodes);
      }

      if (hasFallback) {
        const fb = node.fallbackResponse!;
        console.log(`${childIndent}└─ ${DIM}(fallback)${RESET} ${DIM}"${truncate(fb.playerDialogue, 45)}"${RESET}`);
        const contIndent = childIndent + "  ";
        walkNode(convo, fb.nextNodeId, contIndent, true, visited, backrefNodes);
      }
      break;
    }

    case "convergence": {
      const routes = node.routes || [];
      const hasFallback = !!node.fallbackNodeId;

      for (let i = 0; i < routes.length; i++) {
        const route = routes[i];
        const last = !hasFallback && i === routes.length - 1;
        const branch = last ? "└─" : "├─";
        const contIndent = childIndent + (last ? "  " : "│ ");
        const condStr = describeCondition(route.condition);
        console.log(`${childIndent}${branch} ${MAGENTA}[${condStr}]${RESET}`);
        walkNode(convo, route.nextNodeId, contIndent, last, visited, backrefNodes);
      }

      if (hasFallback) {
        console.log(`${childIndent}└─ ${DIM}(fallback)${RESET}`);
        const contIndent = childIndent + "  ";
        walkNode(convo, node.fallbackNodeId!, contIndent, true, visited, backrefNodes);
      }
      break;
    }
  }
}

// ── Phase Flow (Cross-Conversation DAG) ──

function renderFlow(allConvos: Conversation[]) {
  // Build the cross-convo graph:
  // - Nodes are conversations
  // - Edges are exit_state → precondition links
  // - Power shift is the terminal node, gated by faction thresholds

  // Separate convo_0s (entry points), convo_1s (gated), and power_shift
  const convo0s = allConvos.filter((c) => c.sequenceIndex === 0 && c.id !== "power_shift");
  const convo1s = allConvos.filter((c) => c.sequenceIndex === 1);
  const powerShift = allConvos.find((c) => c.id === "power_shift");

  // Map: convoId → conversation for lookups
  const convoMap = new Map<string, Conversation>();
  for (const c of allConvos) convoMap.set(c.id, c);

  // Map: exitStateId → which convo it unlocks
  const exitUnlocks = new Map<string, string[]>();
  for (const c of allConvos) {
    for (const es of c.exitStates) {
      for (const eff of es.effects) {
        if (eff.type === "unlock_conversation" && eff.conversationId) {
          if (!exitUnlocks.has(es.id)) exitUnlocks.set(es.id, []);
          exitUnlocks.get(es.id)!.push(eff.conversationId);
        }
      }
    }
  }

  // Header
  console.log();
  console.log(`${BOLD}${"=".repeat(70)}${RESET}`);
  console.log(`${BOLD}  PHASE FLOW — Cross-Conversation Progression${RESET}`);
  console.log(`${BOLD}${"=".repeat(70)}${RESET}`);

  // Group convo_0s by NPC for the entry tier
  console.log();
  console.log(`${BOLD}  Entry Conversations (convo_0)${RESET} ${DIM}— all available from start${RESET}`);
  console.log(`${BOLD}${"─".repeat(70)}${RESET}`);

  // Track cumulative faction possibilities per NPC arc
  const npcArcs: {
    npcId: string;
    convo0: Conversation;
    convo1: Conversation | undefined;
    exits0: ExitState[];
    exits1: ExitState[];
  }[] = [];

  for (const c0 of convo0s.sort((a, b) => a.npcId.localeCompare(b.npcId))) {
    const c1 = convo1s.find((c) => c.npcId === c0.npcId);
    npcArcs.push({
      npcId: c0.npcId,
      convo0: c0,
      convo1: c1,
      exits0: c0.exitStates,
      exits1: c1 ? c1.exitStates : [],
    });
  }

  for (const arc of npcArcs) {
    console.log();
    console.log(`  ${BOLD}${arc.npcId}${RESET}`);
    console.log(`  ${CYAN}${arc.convo0.id}${RESET}`);

    for (let i = 0; i < arc.exits0.length; i++) {
      const es = arc.exits0[i];
      const isLast = i === arc.exits0.length - 1 && !arc.convo1;
      const branch = isLast ? "  └─" : "  ├─";

      // Faction/rep deltas
      const deltas = formatExitDeltas(es);
      const deltaStr = deltas ? ` ${DIM}${deltas}${RESET}` : "";

      // What does this exit unlock?
      const unlocked = exitUnlocks.get(es.id) || [];
      // Does the convo1 precondition accept this exit?
      let unlocksMark = "";
      if (arc.convo1) {
        const pre = (arc.convo1.preconditions || []).find((p) => p.conversationId === arc.convo0.id);
        const accepted = pre && (pre.requiredExitStateIds || []).includes(es.id);
        if (accepted) {
          unlocksMark = ` ${GREEN}→ ${arc.convo1.id}${RESET}`;
        } else {
          unlocksMark = ` ${DIM}→ (dead end)${RESET}`;
        }
      } else {
        // No convo_1 for this NPC
        unlocksMark = ` ${DIM}→ power_shift${RESET}`;
      }

      console.log(`${branch} ${MAGENTA}${es.narrativeLabel}${RESET}${unlocksMark}${deltaStr}`);
    }

    // convo_1
    if (arc.convo1) {
      const pre = (arc.convo1.preconditions || []).find((p) => p.conversationId === arc.convo0.id);
      const reqExits = (pre?.requiredExitStateIds || []).map((id) => {
        const es = arc.exits0.find((e) => e.id === id);
        return es ? es.narrativeLabel : id;
      });

      console.log(`  │`);
      console.log(`  ▼ ${DIM}requires: ${reqExits.join(" or ")}${RESET}`);
      console.log(`  ${CYAN}${arc.convo1.id}${RESET}`);

      for (let i = 0; i < arc.exits1.length; i++) {
        const es = arc.exits1[i];
        const isLast = i === arc.exits1.length - 1;
        const branch = isLast ? "  └─" : "  ├─";

        const deltas = formatExitDeltas(es);
        const deltaStr = deltas ? ` ${DIM}${deltas}${RESET}` : "";

        // Check for special effects
        let specialStr = "";
        for (const eff of es.effects) {
          if (eff.type === "game_over") specialStr += ` ${RED}GAME OVER${RESET}`;
          if (eff.type === "turn_penalty") specialStr += ` ${RED}turn penalty${RESET}`;
        }

        console.log(`${branch} ${MAGENTA}${es.narrativeLabel}${RESET} ${DIM}→ power_shift${RESET}${deltaStr}${specialStr}`);
      }
    }
  }

  // Power shift
  if (powerShift) {
    console.log();
    console.log(`${BOLD}${"─".repeat(70)}${RESET}`);
    console.log(`${BOLD}  Power Shift — Phase Climax${RESET}`);
    console.log(`${BOLD}${"─".repeat(70)}${RESET}`);
    console.log();

    // Show faction thresholds for entry routes
    const routeNode = powerShift.nodes["ps_n02"];
    if (routeNode && routeNode.type === "convergence") {
      console.log(`  ${CYAN}${powerShift.id}${RESET} ${DIM}(all faction standings from above feed in)${RESET}`);
      console.log();

      // For each route, show the threshold + which NPC arcs can contribute
      const routes = routeNode.routes || [];
      for (let i = 0; i < routes.length; i++) {
        const route = routes[i];
        const cond = route.condition;
        const isLast = i === routes.length - 1 && !routeNode.fallbackNodeId;
        const branch = isLast ? "  └─" : "  ├─";

        if (cond.type === "faction_standing" && cond.factionId) {
          const factionId = cond.factionId;
          const threshold = cond.min || 0;

          // Find all exit states across all convos that affect this faction
          const contributors: { convoId: string; exitLabel: string; shift: number }[] = [];
          for (const c of allConvos) {
            if (c.id === "power_shift") continue;
            for (const es of c.exitStates) {
              for (const eff of es.effects) {
                if (eff.type === "faction_standing" && eff.deltas) {
                  for (const d of eff.deltas) {
                    if (d.factionId === factionId && d.shift > 0) {
                      contributors.push({ convoId: c.id, exitLabel: es.narrativeLabel, shift: d.shift });
                    }
                  }
                }
              }
            }
          }

          // Find exits for this route
          const routeExits = findRouteExits(powerShift, route.nextNodeId);

          console.log(`${branch} ${BOLD}${factionId} >= ${threshold}${RESET}`);
          console.log(`  ${isLast ? " " : "│"}   ${DIM}Positive contributors:${RESET}`);
          for (const c of contributors) {
            console.log(`  ${isLast ? " " : "│"}     ${DIM}${c.convoId} → ${c.exitLabel} (+${c.shift})${RESET}`);
          }
          console.log(`  ${isLast ? " " : "│"}   ${DIM}Leads to:${RESET}`);
          for (const ex of routeExits) {
            const esObj = powerShift.exitStates.find((e) => e.id === ex.exitStateId);
            const label = esObj?.narrativeLabel || ex.exitStateId || "?";
            const gameOver = esObj?.effects.some((e) => e.type === "game_over");
            const tag = gameOver ? ` ${RED}GAME OVER${RESET}` : "";
            console.log(`  ${isLast ? " " : "│"}     ${GREEN}⇒ ${label}${RESET}${tag}`);
          }
        }
      }

      if (routeNode.fallbackNodeId) {
        const fallbackExits = findRouteExits(powerShift, routeNode.fallbackNodeId);
        console.log(`  └─ ${DIM}(no faction >= 4 — fallback)${RESET}`);
        console.log(`      ${DIM}Leads to:${RESET}`);
        for (const ex of fallbackExits) {
          const esObj = powerShift.exitStates.find((e) => e.id === ex.exitStateId);
          const label = esObj?.narrativeLabel || ex.exitStateId || "?";
          const gameOver = esObj?.effects.some((e) => e.type === "game_over");
          const tag = gameOver ? ` ${RED}GAME OVER${RESET}` : "";
          console.log(`      ${GREEN}⇒ ${label}${RESET}${tag}`);
        }
      }
    }

    // Final outcomes summary
    console.log();
    console.log(`  ${BOLD}Final Outcomes:${RESET}`);
    for (const es of powerShift.exitStates) {
      const gameOver = es.effects.some((e) => e.type === "game_over");
      const icon = gameOver ? RED + "✗" + RESET : GREEN + "✓" + RESET;
      const effects: string[] = [];
      for (const eff of es.effects) {
        if (eff.type === "rank_change") effects.push(`rank → ${eff.newRank}`);
        if (eff.type === "game_over") effects.push(`${RED}game over${RESET}`);
        if (eff.type === "reputation" && eff.deltas) {
          for (const d of eff.deltas) effects.push(`${d.trait} ${d.shift > 0 ? "+" : ""}${d.shift}`);
        }
      }
      const effStr = effects.length > 0 ? ` ${DIM}(${effects.join(", ")})${RESET}` : "";
      console.log(`    ${icon} ${es.narrativeLabel}${effStr}`);
    }
  }

  console.log();
}

/** Walk from a node to collect all reachable exit nodes (BFS). */
function findRouteExits(convo: Conversation, startNodeId: string): ConvoNode[] {
  const visited = new Set<string>();
  const queue = [startNodeId];
  visited.add(startNodeId);
  const exits: ConvoNode[] = [];

  while (queue.length > 0) {
    const id = queue.shift()!;
    const node = convo.nodes[id];
    if (!node) continue;

    if (node.type === "exit") {
      exits.push(node);
      continue;
    }

    for (const targetId of getNodeTargets(node)) {
      if (!visited.has(targetId)) {
        visited.add(targetId);
        queue.push(targetId);
      }
    }
  }

  return exits;
}

function formatExitDeltas(es: ExitState): string {
  const parts: string[] = [];
  for (const eff of es.effects) {
    if (eff.type === "faction_standing" && eff.deltas) {
      for (const d of eff.deltas) {
        parts.push(`${d.factionId} ${d.shift > 0 ? "+" : ""}${d.shift}`);
      }
    }
    if (eff.type === "reputation" && eff.deltas) {
      for (const d of eff.deltas) {
        parts.push(`${d.trait} ${d.shift > 0 ? "+" : ""}${d.shift}`);
      }
    }
  }
  return parts.length > 0 ? `[${parts.join(", ")}]` : "";
}

// ── Envelope: Narrative Width Over Time ──

interface GameState {
  completedConvos: Set<string>;
  completedExitStates: Set<string>;
  factionStandings: Map<string, number>;
}

interface TurnSnapshot {
  t: number;
  available: string[];
  completed: string | null;
  reachableCount: number;
  newUnlocks: string[];
}

function newGameState(): GameState {
  return {
    completedConvos: new Set(),
    completedExitStates: new Set(),
    factionStandings: new Map(),
  };
}

function cloneGameState(gs: GameState): GameState {
  return {
    completedConvos: new Set(gs.completedConvos),
    completedExitStates: new Set(gs.completedExitStates),
    factionStandings: new Map(gs.factionStandings),
  };
}

/** Check if a conversation's preconditions are met under the given game state. */
function preconditionsMet(convo: Conversation, gs: GameState): boolean {
  if (!convo.preconditions || convo.preconditions.length === 0) return true;
  // All preconditions must be satisfied (AND)
  return convo.preconditions.every((pre) => evalPrecondition(pre, gs));
}

function evalPrecondition(pre: Precondition, gs: GameState): boolean {
  switch (pre.type) {
    case "prior_exit_state": {
      const required = pre.requiredExitStateIds || [];
      // At least one of the required exit states must have been achieved
      return required.some((esId) => gs.completedExitStates.has(esId));
    }
    case "faction_standing": {
      const current = gs.factionStandings.get(pre.factionId!) || 0;
      return current >= (pre.min || 0);
    }
    case "any_of": {
      return (pre.conditions || []).some((c) => evalPrecondition(c, gs));
    }
    default:
      // Unknown precondition type — be permissive
      return true;
  }
}

/** Get the set of conversations available (preconditions met, not completed, not power_shift). */
function getAvailable(convos: Conversation[], gs: GameState, powerShiftId: string): Conversation[] {
  return convos.filter(
    (c) => c.id !== powerShiftId && !gs.completedConvos.has(c.id) && preconditionsMet(c, gs)
  );
}

/** Count distinct exit nodes reachable from entryNodeId (branching factor). */
function countExitNodes(convo: Conversation): number {
  const visited = new Set<string>();
  const queue = [convo.entryNodeId];
  visited.add(convo.entryNodeId);
  let exits = 0;
  while (queue.length > 0) {
    const id = queue.shift()!;
    const node = convo.nodes[id];
    if (!node) continue;
    if (node.type === "exit") { exits++; continue; }
    for (const t of getNodeTargets(node)) {
      if (!visited.has(t)) { visited.add(t); queue.push(t); }
    }
  }
  return exits;
}

/**
 * Simulate completing a conversation: pick the best exit state (the one that
 * maximizes faction gains / unlocks). Apply effects to game state.
 * Returns the exit state chosen.
 */
function simulateCompletion(convo: Conversation, gs: GameState, allConvos: Conversation[], powerShiftId: string): ExitState | null {
  if (convo.exitStates.length === 0) return null;

  // Score each exit by how many new conversations it would make available
  let bestExit: ExitState | null = null;
  let bestScore = -Infinity;

  for (const es of convo.exitStates) {
    const testGs = cloneGameState(gs);
    applyExitState(convo.id, es, testGs);
    const newAvail = getAvailable(allConvos, testGs, powerShiftId).length;
    if (newAvail > bestScore) {
      bestScore = newAvail;
      bestExit = es;
    }
  }

  if (bestExit) {
    applyExitState(convo.id, bestExit, gs);
  }
  return bestExit;
}

function applyExitState(convoId: string, es: ExitState, gs: GameState) {
  gs.completedConvos.add(convoId);
  gs.completedExitStates.add(es.id);
  for (const eff of es.effects) {
    if (eff.type === "faction_standing" && eff.deltas) {
      for (const d of eff.deltas) {
        const current = gs.factionStandings.get(d.factionId!) || 0;
        gs.factionStandings.set(d.factionId!, current + d.shift);
      }
    }
  }
}

/** Run the greedy max-envelope simulation. */
function simulateEnvelope(allConvos: Conversation[], totalMoves: number, powerShiftId: string): TurnSnapshot[] {
  const gs = newGameState();
  const snapshots: TurnSnapshot[] = [];

  for (let t = 0; t < totalMoves; t++) {
    const available = getAvailable(allConvos, gs, powerShiftId);
    const availIds = available.map((c) => c.id);

    // Pick the conversation to complete this turn (greedy: max new unlocks)
    let bestConvo: Conversation | null = null;
    let bestNewCount = -1;

    for (const c of available) {
      let maxNew = 0;
      for (const es of c.exitStates) {
        const innerGs = cloneGameState(gs);
        applyExitState(c.id, es, innerGs);
        const newAvail = getAvailable(allConvos, innerGs, powerShiftId).length;
        maxNew = Math.max(maxNew, newAvail);
      }
      if (maxNew > bestNewCount) {
        bestNewCount = maxNew;
        bestConvo = c;
      }
    }

    let completedId: string | null = null;
    let newUnlocks: string[] = [];

    if (bestConvo) {
      const prevAvail = new Set(availIds);
      completedId = bestConvo.id;
      simulateCompletion(bestConvo, gs, allConvos, powerShiftId);
      const nextAvail = getAvailable(allConvos, gs, powerShiftId);
      newUnlocks = nextAvail.filter((c) => !prevAvail.has(c.id)).map((c) => c.id);
    }

    snapshots.push({
      t,
      available: availIds,
      completed: completedId,
      reachableCount: available.length,
      newUnlocks,
    });

    if (available.length === 0) break;
  }

  return snapshots;
}

/** Run Monte Carlo: random completion order, return min/max/avg of |R(t)|. */
function monteCarloEnvelope(
  allConvos: Conversation[],
  totalMoves: number,
  powerShiftId: string,
  runs: number
): { min: number[]; max: number[]; avg: number[]; stddev: number[] } {
  const reachCounts: number[][] = Array.from({ length: totalMoves }, () => []);

  for (let r = 0; r < runs; r++) {
    const gs = newGameState();
    for (let t = 0; t < totalMoves; t++) {
      const available = getAvailable(allConvos, gs, powerShiftId);
      reachCounts[t].push(available.length);

      if (available.length === 0) {
        for (let tt = t + 1; tt < totalMoves; tt++) reachCounts[tt].push(0);
        break;
      }

      // Random pick, random exit
      const pick = available[Math.floor(Math.random() * available.length)];
      if (pick.exitStates.length > 0) {
        const es = pick.exitStates[Math.floor(Math.random() * pick.exitStates.length)];
        applyExitState(pick.id, es, gs);
      } else {
        gs.completedConvos.add(pick.id);
      }
    }
  }

  const avg = reachCounts.map((rs) => rs.length > 0 ? rs.reduce((a, b) => a + b, 0) / rs.length : 0);
  const stddev = reachCounts.map((rs, i) => {
    if (rs.length === 0) return 0;
    const mean = avg[i];
    const variance = rs.reduce((sum, v) => sum + (v - mean) ** 2, 0) / rs.length;
    return Math.sqrt(variance);
  });

  return {
    min: reachCounts.map((rs) => rs.length > 0 ? Math.min(...rs) : 0),
    max: reachCounts.map((rs) => rs.length > 0 ? Math.max(...rs) : 0),
    avg,
    stddev,
  };
}

function renderEnvelope(allConvos: Conversation[], totalMoves: number, powerShiftId: string) {
  const MC_RUNS = 500;
  const mc = monteCarloEnvelope(allConvos, totalMoves, powerShiftId, MC_RUNS);

  const totalConvos = allConvos.filter((c) => c.id !== powerShiftId).length;

  // ── Header ──
  console.log();
  console.log(`${BOLD}${"=".repeat(78)}${RESET}`);
  console.log(`${BOLD}  REACHABILITY ENVELOPE${RESET}`);
  console.log(`${BOLD}${"=".repeat(78)}${RESET}`);
  console.log();
  console.log(`  Moves: ${totalMoves}  |  Conversations: ${totalConvos}  |  Terminal: ${powerShiftId}  |  Runs: ${MC_RUNS}`);

  // ── ASCII Chart ──
  const chartW = 40;
  const maxVal = Math.max(...mc.max, 1);
  const scale = chartW / maxVal;

  console.log();
  console.log(`  ${BOLD}turn${RESET}  ${BOLD}${"chart".padEnd(chartW)}${RESET}  ${BOLD}min  avg   max    σ${RESET}`);
  console.log(`  ${DIM}${"─".repeat(chartW + 30)}${RESET}`);

  for (let t = 0; t < totalMoves; t++) {
    if (t >= mc.min.length) break;
    const lo = Math.round(mc.min[t] * scale);
    const hi = Math.round(mc.max[t] * scale);
    const avg = Math.round(mc.avg[t] * scale);
    const sigma = mc.stddev[t];

    let bar = "";
    for (let x = 0; x < chartW; x++) {
      if (x < lo) {
        bar += " ";
      } else if (x < avg) {
        bar += `${DIM}░${RESET}`;
      } else if (x === avg) {
        bar += `${CYAN}▓${RESET}`;
      } else if (x <= hi) {
        bar += `${DIM}░${RESET}`;
      } else {
        bar += " ";
      }
    }

    const turnLabel = `t=${String(t).padStart(2)}`;
    const stats = `${String(mc.min[t]).padStart(3)}  ${mc.avg[t].toFixed(1).padStart(4)}  ${String(mc.max[t]).padStart(4)}  ${sigma.toFixed(1).padStart(4)}`;
    console.log(`  ${turnLabel}  ${bar}  ${DIM}${stats}${RESET}`);
  }

  console.log(`  ${DIM}${"─".repeat(chartW + 30)}${RESET}`);
  console.log(`  ${DIM}░ min..max   ▓ average   σ = std deviation across ${MC_RUNS} runs${RESET}`);
  console.log();
}

/** Check if a precondition (possibly nested in any_of) references a specific convo via prior_exit_state. */
function hasExitStateDep(pre: Precondition, convoId: string): boolean {
  if (pre.type === "prior_exit_state" && pre.conversationId === convoId) return true;
  if (pre.type === "any_of" && pre.conditions) {
    return pre.conditions.some((c) => hasExitStateDep(c, convoId));
  }
  return false;
}

// ── Check: Sanity Checks ──

interface CheckIssue {
  severity: "error" | "warning";
  convoId: string;
  nodeId?: string;
  message: string;
}

function runChecks(convos: Conversation[]): CheckIssue[] {
  const issues: CheckIssue[] = [];
  const WORD_LIMIT = 70;

  // ── Collect all events fired and required across all conversations ──
  const eventsFired = new Map<string, string[]>(); // eventId → convoIds that fire it
  const eventsRequired = new Map<string, string[]>(); // eventId → convoIds that require it

  for (const convo of convos) {
    // Collect fire_event from exit state effects
    for (const es of convo.exitStates) {
      for (const eff of es.effects) {
        if (eff.type === "fire_event" && (eff as any).eventId) {
          const eventId = (eff as any).eventId;
          if (!eventsFired.has(eventId)) eventsFired.set(eventId, []);
          eventsFired.get(eventId)!.push(convo.id);
        }
      }
    }

    // Collect event/game_event preconditions
    collectEventPreconditions(convo.preconditions || [], convo.id, eventsRequired);
  }

  // ── Event integrity checks ──

  // Events required but never fired
  for (const [eventId, requiredBy] of eventsRequired) {
    if (!eventsFired.has(eventId)) {
      for (const convoId of requiredBy) {
        issues.push({
          severity: "error",
          convoId,
          message: `requires event "${eventId}" but nothing fires it — conversation is unreachable via events`,
        });
      }
    }
  }

  // Events fired but never required (not an error, but worth noting)
  for (const [eventId, firedBy] of eventsFired) {
    if (!eventsRequired.has(eventId)) {
      for (const convoId of firedBy) {
        issues.push({
          severity: "warning",
          convoId,
          message: `fires event "${eventId}" but no conversation requires it`,
        });
      }
    }
  }

  // ── Schema validation ──

  const VALID_NODE_TYPES = ["active", "passive", "noop", "convergence", "exit"];
  const VALID_TRAITS = ["severitas", "clementia", "audacia", "calliditas"];
  const VALID_EFFECT_TYPES = [
    "faction_standing", "reputation", "turn_penalty",
    "unlock_conversation", "lock_conversation",
    "rank_change", "game_over", "fire_event",
  ];
  const VALID_PRECONDITION_TYPES = [
    "min_rank", "faction_standing", "prior_exit_state",
    "phase_event", "event", "any_of",
  ];
  const VALID_CONVERGENCE_TYPES = [
    "reputation_dominant", "roll_history", "visited_node", "faction_standing",
  ];

  for (const convo of convos) {
    // Top-level required fields
    for (const field of ["id", "npcId", "phaseId", "entryNodeId", "nodes", "exitStates"] as const) {
      if ((convo as any)[field] === undefined) {
        issues.push({ severity: "error", convoId: convo.id || "unknown", message: `missing required field "${field}"` });
      }
    }
    if (typeof convo.sequenceIndex !== "number") {
      issues.push({ severity: "error", convoId: convo.id, message: `missing or non-number "sequenceIndex"` });
    }

    // Precondition schema
    for (const pre of convo.preconditions || []) {
      if (!VALID_PRECONDITION_TYPES.includes(pre.type)) {
        issues.push({ severity: "error", convoId: convo.id, message: `unknown precondition type "${pre.type}"` });
      }
      if (pre.type === "prior_exit_state") {
        if (!pre.conversationId) issues.push({ severity: "error", convoId: convo.id, message: `prior_exit_state precondition missing "conversationId"` });
        if (!pre.requiredExitStateIds || pre.requiredExitStateIds.length === 0) {
          issues.push({ severity: "error", convoId: convo.id, message: `prior_exit_state precondition missing "requiredExitStateIds"` });
        }
      }
      if (pre.type === "faction_standing" && !pre.factionId) {
        issues.push({ severity: "error", convoId: convo.id, message: `faction_standing precondition missing "factionId"` });
      }
      if ((pre.type === "event" || pre.type === "phase_event") && !(pre as any).eventId) {
        issues.push({ severity: "error", convoId: convo.id, message: `${pre.type} precondition missing "eventId"` });
      }
    }

    // Node schema
    for (const node of Object.values(convo.nodes)) {
      if (!node.id) {
        issues.push({ severity: "error", convoId: convo.id, message: `node missing "id" field` });
        continue;
      }
      if (!node.type || !VALID_NODE_TYPES.includes(node.type)) {
        issues.push({ severity: "error", convoId: convo.id, nodeId: node.id, message: `invalid node type "${node.type}"` });
        continue;
      }
      if (!node.npcDialogue && node.npcDialogue !== "") {
        issues.push({ severity: "warning", convoId: convo.id, nodeId: node.id, message: `missing "npcDialogue"` });
      }

      switch (node.type) {
        case "active": {
          if (!node.options || node.options.length === 0) {
            issues.push({ severity: "error", convoId: convo.id, nodeId: node.id, message: `active node has no options` });
          }
          for (const opt of node.options || []) {
            if (!opt.playerDialogue) {
              issues.push({ severity: "error", convoId: convo.id, nodeId: node.id, message: `option missing "playerDialogue"` });
            }
            // Must have either nextNodeId or onSuccess
            if (!opt.nextNodeId && !(opt.onSuccess && opt.onSuccess.nextNodeId)) {
              issues.push({ severity: "error", convoId: convo.id, nodeId: node.id, message: `option has no nextNodeId or onSuccess.nextNodeId` });
            }
            if (opt.roll) {
              if (!opt.roll.dice || !opt.roll.dice.count || !opt.roll.dice.sides) {
                issues.push({ severity: "error", convoId: convo.id, nodeId: node.id, message: `roll missing dice config` });
              }
              if (typeof opt.roll.baseThreshold !== "number") {
                issues.push({ severity: "error", convoId: convo.id, nodeId: node.id, message: `roll missing baseThreshold` });
              }
              if (opt.roll.reputationBonus && !VALID_TRAITS.includes(opt.roll.reputationBonus.trait)) {
                issues.push({ severity: "error", convoId: convo.id, nodeId: node.id, message: `roll reputationBonus uses invalid trait "${opt.roll.reputationBonus.trait}"` });
              }
            }
            if (opt.visibilityRequirement) {
              if (!VALID_TRAITS.includes(opt.visibilityRequirement.trait)) {
                issues.push({ severity: "error", convoId: convo.id, nodeId: node.id, message: `visibilityRequirement uses invalid trait "${opt.visibilityRequirement.trait}"` });
              }
            }
          }
          break;
        }
        case "passive": {
          if (!node.responses || node.responses.length === 0) {
            issues.push({ severity: "error", convoId: convo.id, nodeId: node.id, message: `passive node has no responses` });
          }
          for (const resp of node.responses || []) {
            if (!VALID_TRAITS.includes(resp.trait)) {
              issues.push({ severity: "error", convoId: convo.id, nodeId: node.id, message: `passive response uses invalid trait "${resp.trait}"` });
            }
            if (typeof resp.threshold !== "number") {
              issues.push({ severity: "error", convoId: convo.id, nodeId: node.id, message: `passive response missing "threshold"` });
            }
            if (!resp.playerDialogue) {
              issues.push({ severity: "error", convoId: convo.id, nodeId: node.id, message: `passive response missing "playerDialogue"` });
            }
            if (!resp.nextNodeId) {
              issues.push({ severity: "error", convoId: convo.id, nodeId: node.id, message: `passive response missing "nextNodeId"` });
            }
          }
          if (!node.fallbackResponse) {
            issues.push({ severity: "error", convoId: convo.id, nodeId: node.id, message: `passive node missing "fallbackResponse"` });
          } else {
            if (!node.fallbackResponse.playerDialogue) {
              issues.push({ severity: "error", convoId: convo.id, nodeId: node.id, message: `fallbackResponse missing "playerDialogue"` });
            }
            if (!node.fallbackResponse.nextNodeId) {
              issues.push({ severity: "error", convoId: convo.id, nodeId: node.id, message: `fallbackResponse missing "nextNodeId"` });
            }
          }
          break;
        }
        case "noop": {
          if (!node.options || node.options.length === 0) {
            issues.push({ severity: "error", convoId: convo.id, nodeId: node.id, message: `noop node has no options` });
          }
          for (const opt of node.options || []) {
            if (!opt.playerDialogue) {
              issues.push({ severity: "error", convoId: convo.id, nodeId: node.id, message: `noop option missing "playerDialogue"` });
            }
            if (!opt.nextNodeId) {
              issues.push({ severity: "error", convoId: convo.id, nodeId: node.id, message: `noop option missing "nextNodeId"` });
            }
          }
          break;
        }
        case "convergence": {
          if (!node.routes || node.routes.length === 0) {
            issues.push({ severity: "error", convoId: convo.id, nodeId: node.id, message: `convergence node has no routes` });
          }
          for (const route of node.routes || []) {
            if (!route.condition || !VALID_CONVERGENCE_TYPES.includes(route.condition.type)) {
              issues.push({ severity: "error", convoId: convo.id, nodeId: node.id, message: `convergence route has invalid condition type "${route.condition?.type}"` });
            }
            if (!route.nextNodeId) {
              issues.push({ severity: "error", convoId: convo.id, nodeId: node.id, message: `convergence route missing "nextNodeId"` });
            }
            if (route.condition?.type === "reputation_dominant" && !VALID_TRAITS.includes(route.condition.trait!)) {
              issues.push({ severity: "error", convoId: convo.id, nodeId: node.id, message: `convergence condition uses invalid trait "${route.condition.trait}"` });
            }
          }
          if (!node.fallbackNodeId) {
            issues.push({ severity: "error", convoId: convo.id, nodeId: node.id, message: `convergence node missing "fallbackNodeId"` });
          }
          break;
        }
        case "exit": {
          if (!node.exitStateId) {
            issues.push({ severity: "error", convoId: convo.id, nodeId: node.id, message: `exit node missing "exitStateId"` });
          } else {
            const found = convo.exitStates.some((es) => es.id === node.exitStateId);
            if (!found) {
              issues.push({ severity: "error", convoId: convo.id, nodeId: node.id, message: `exitStateId "${node.exitStateId}" not found in exitStates` });
            }
          }
          break;
        }
      }
    }

    // Exit state schema
    for (const es of convo.exitStates) {
      if (!es.id) {
        issues.push({ severity: "error", convoId: convo.id, message: `exit state missing "id"` });
      }
      if (!es.narrativeLabel) {
        issues.push({ severity: "warning", convoId: convo.id, message: `exit state "${es.id}" missing "narrativeLabel"` });
      }
      if (!es.effects || !Array.isArray(es.effects)) {
        issues.push({ severity: "error", convoId: convo.id, message: `exit state "${es.id}" missing "effects" array` });
        continue;
      }
      for (const eff of es.effects) {
        if (!VALID_EFFECT_TYPES.includes(eff.type)) {
          issues.push({ severity: "error", convoId: convo.id, message: `exit state "${es.id}" has unknown effect type "${eff.type}"` });
        }
        if (eff.type === "faction_standing" && eff.deltas) {
          for (const d of eff.deltas) {
            if (!d.factionId) issues.push({ severity: "error", convoId: convo.id, message: `faction_standing delta missing "factionId" in "${es.id}"` });
            if (typeof d.shift !== "number") issues.push({ severity: "error", convoId: convo.id, message: `faction_standing delta missing "shift" in "${es.id}"` });
          }
        }
        if (eff.type === "reputation" && eff.deltas) {
          for (const d of eff.deltas) {
            if (!VALID_TRAITS.includes(d.trait!)) {
              issues.push({ severity: "error", convoId: convo.id, message: `reputation delta uses invalid trait "${d.trait}" in "${es.id}"` });
            }
            if (typeof d.shift !== "number") issues.push({ severity: "error", convoId: convo.id, message: `reputation delta missing "shift" in "${es.id}"` });
          }
        }
        if (eff.type === "fire_event" && !(eff as any).eventId) {
          issues.push({ severity: "error", convoId: convo.id, message: `fire_event effect missing "eventId" in "${es.id}"` });
        }
      }

      // Check that at least one exit node references this exit state
      const referenced = Object.values(convo.nodes).some((n) => n.type === "exit" && n.exitStateId === es.id);
      if (!referenced) {
        issues.push({ severity: "warning", convoId: convo.id, message: `exit state "${es.id}" is never referenced by an exit node` });
      }
    }
  }

  // ── Per-conversation checks ──

  for (const convo of convos) {
    // 1. Reachability: all nodes reachable from entryNodeId
    const reachable = bfsReachable(convo);
    for (const nodeId of Object.keys(convo.nodes)) {
      if (!reachable.has(nodeId)) {
        issues.push({
          severity: "error",
          convoId: convo.id,
          nodeId,
          message: `unreachable node (no path from entry)`,
        });
      }
    }

    // 2. Word count on all dialogue lines
    for (const node of Object.values(convo.nodes)) {
      if (node.npcDialogue) {
        const words = node.npcDialogue.split(/\s+/).length;
        if (words > WORD_LIMIT) {
          issues.push({
            severity: "warning",
            convoId: convo.id,
            nodeId: node.id,
            message: `npcDialogue is ${words} words (limit ${WORD_LIMIT})`,
          });
        }
      }

      if (node.options) {
        for (const opt of node.options) {
          const words = opt.playerDialogue.split(/\s+/).length;
          if (words > WORD_LIMIT) {
            issues.push({
              severity: "warning",
              convoId: convo.id,
              nodeId: node.id,
              message: `playerDialogue is ${words} words (limit ${WORD_LIMIT}): "${opt.playerDialogue.slice(0, 60)}..."`,
            });
          }
        }
      }

      if (node.responses) {
        for (const resp of node.responses) {
          const words = resp.playerDialogue.split(/\s+/).length;
          if (words > WORD_LIMIT) {
            issues.push({
              severity: "warning",
              convoId: convo.id,
              nodeId: node.id,
              message: `playerDialogue is ${words} words (limit ${WORD_LIMIT}): "${resp.playerDialogue.slice(0, 60)}..."`,
            });
          }
        }
      }

      if (node.fallbackResponse) {
        const words = node.fallbackResponse.playerDialogue.split(/\s+/).length;
        if (words > WORD_LIMIT) {
          issues.push({
            severity: "warning",
            convoId: convo.id,
            nodeId: node.id,
            message: `fallback playerDialogue is ${words} words (limit ${WORD_LIMIT}): "${node.fallbackResponse.playerDialogue.slice(0, 60)}..."`,
          });
        }
      }
    }
  }

  return issues;
}

/** Recursively collect event/game_event preconditions from a precondition tree. */
function collectEventPreconditions(preconditions: Precondition[], convoId: string, out: Map<string, string[]>) {
  for (const pre of preconditions) {
    if ((pre.type === "event" || pre.type === "game_event") && (pre as any).eventId) {
      const eventId = (pre as any).eventId;
      if (!out.has(eventId)) out.set(eventId, []);
      out.get(eventId)!.push(convoId);
    }
    if (pre.type === "any_of" && pre.conditions) {
      collectEventPreconditions(pre.conditions, convoId, out);
    }
  }
}

function renderChecks(convos: Conversation[]) {
  const issues = runChecks(convos);

  console.log();
  console.log(`${BOLD}${"=".repeat(70)}${RESET}`);
  console.log(`${BOLD}  SANITY CHECK${RESET}`);
  console.log(`${BOLD}${"=".repeat(70)}${RESET}`);
  console.log();
  console.log(`  Checked ${convos.length} conversations`);

  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");

  // Categorize issues
  const schemaErrors = errors.filter((e) => !e.message.includes("event") && !e.message.includes("unreachable"));
  const eventErrors = errors.filter((e) => e.message.includes("event"));
  const reachErrors = errors.filter((e) => e.message.includes("unreachable"));
  const eventWarnings = warnings.filter((w) => w.message.includes("fires event"));
  const schemaWarnings = warnings.filter((w) => !w.message.includes("fires event") && !w.message.includes("words"));
  const wordWarnings = warnings.filter((w) => w.message.includes("words"));

  if (issues.length === 0) {
    console.log();
    console.log(`  ${GREEN}All checks passed.${RESET}`);
    console.log();
    return;
  }

  // Schema validation section
  if (schemaErrors.length > 0 || schemaWarnings.length > 0) {
    console.log();
    console.log(`  ${BOLD}Schema${RESET}  ${schemaErrors.length > 0 ? RED + schemaErrors.length + " error" + (schemaErrors.length !== 1 ? "s" : "") + RESET : ""}${schemaWarnings.length > 0 ? " " + YELLOW + schemaWarnings.length + " warning" + (schemaWarnings.length !== 1 ? "s" : "") + RESET : ""}`);
    for (const e of schemaErrors) {
      const loc = e.nodeId ? `${e.convoId} → ${shortNodeId(e.nodeId)}` : e.convoId;
      console.log(`    ${RED}ERROR${RESET}  ${loc}: ${e.message}`);
    }
    for (const w of schemaWarnings) {
      const loc = w.nodeId ? `${w.convoId} → ${shortNodeId(w.nodeId)}` : w.convoId;
      console.log(`    ${YELLOW}WARN${RESET}   ${loc}: ${w.message}`);
    }
  }

  // Event integrity section
  if (eventErrors.length > 0 || eventWarnings.length > 0) {
    console.log();
    console.log(`  ${BOLD}Events${RESET}`);
    for (const e of eventErrors) {
      console.log(`    ${RED}ERROR${RESET}  ${e.convoId}: ${e.message}`);
    }
    for (const w of eventWarnings) {
      console.log(`    ${YELLOW}WARN${RESET}   ${w.convoId}: ${w.message}`);
    }
  }

  // Node reachability section
  if (reachErrors.length > 0) {
    console.log();
    console.log(`  ${BOLD}Reachability${RESET}  ${RED}${reachErrors.length} error${reachErrors.length !== 1 ? "s" : ""}${RESET}`);
    for (const e of reachErrors) {
      const loc = e.nodeId ? `${e.convoId} → ${shortNodeId(e.nodeId)}` : e.convoId;
      console.log(`    ${RED}ERROR${RESET}  ${loc}: ${e.message}`);
    }
    console.log();
  }

  // Word count section
  if (wordWarnings.length > 0) {
    console.log();
    console.log(`  ${BOLD}Word count${RESET}  ${YELLOW}${wordWarnings.length} warning${wordWarnings.length !== 1 ? "s" : ""}${RESET}`);
    for (const w of wordWarnings) {
      const loc = w.nodeId ? `${w.convoId} → ${shortNodeId(w.nodeId)}` : w.convoId;
      console.log(`    ${YELLOW}WARN${RESET}   ${loc}: ${w.message}`);
    }
  }

  // Summary
  console.log();
  console.log(`  ${BOLD}Total:${RESET} ${errors.length} error${errors.length !== 1 ? "s" : ""}, ${warnings.length} warning${warnings.length !== 1 ? "s" : ""}`);
  console.log();

  if (errors.length > 0) process.exit(1);
}

function pct(a: number, b: number): string {
  if (b === 0) return "0%";
  return (((a / b) * 100).toFixed(1)) + "%";
}

function fmtShift(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

// ── Main ──

function printUsage() {
  console.log(`Usage: npx tsx scripts/backtest/analyze-graph.ts [command] [options]

Commands:
  analyze         Reachability analysis report (default)
  tree            Render intra-conversation DAG as a tree view
  flow            Render cross-conversation phase progression DAG
  envelope        Narrative width envelope W(t) over turns
  check           Schema validation + event integrity + reachability + word counts

Options:
  --path <dir>    Path to output directory (default: generation/output)
  --convo <id>    Filter to a specific conversation or NPC id
  --help          Show this help message

Examples:
  npx tsx scripts/backtest/analyze-graph.ts
  npx tsx scripts/backtest/analyze-graph.ts tree --convo gaius_marius_convo_0
  npx tsx scripts/backtest/analyze-graph.ts tree --path /other/output
  npx tsx scripts/backtest/analyze-graph.ts analyze --convo lucius_sulla
`);
}

function parseArgs() {
  const args = process.argv.slice(2);
  let command = "analyze";
  const positional = args.filter((a) => !a.startsWith("--"));

  if (positional.length > 0 && ["analyze", "tree", "flow", "envelope", "check"].includes(positional[0])) {
    command = positional[0];
  }

  return {
    command,
    help: args.includes("--help") || args.includes("-h"),
    convo: args.includes("--convo") ? args[args.indexOf("--convo") + 1] : null,
    path: args.includes("--path") ? args[args.indexOf("--path") + 1] : null,
  };
}

function main() {
  const opts = parseArgs();

  if (opts.help) {
    printUsage();
    process.exit(0);
  }

  if (opts.path) {
    OUTPUT_DIR = path.resolve(opts.path);
    if (!fs.existsSync(OUTPUT_DIR)) {
      console.error(`Path does not exist: ${OUTPUT_DIR}`);
      process.exit(1);
    }
  }

  let convos = loadConversations();
  const npcs = loadNPCs();

  if (convos.length === 0) {
    console.error(`No conversations found in ${OUTPUT_DIR}`);
    process.exit(1);
  }

  if (opts.convo) {
    convos = convos.filter((c) => c.id === opts.convo || c.npcId === opts.convo);
    if (convos.length === 0) {
      console.error(`No conversations found matching "${opts.convo}"`);
      process.exit(1);
    }
  }

  const allConvos = loadConversations();

  switch (opts.command) {
    case "tree":
      renderTree(convos);
      break;

    case "flow":
      renderFlow(allConvos);
      break;

    case "check":
      renderChecks(convos);
      break;

    case "envelope": {
      const phase = loadPhase();
      const totalMoves = phase?.totalMoves || 20;
      const psId = phase?.powerShiftConversationId || "power_shift";
      renderEnvelope(allConvos, totalMoves, psId);
      break;
    }

    case "analyze":
    default: {
      const analyses = convos.map(analyzeConvo);
      const chains = buildUnlockChains(opts.convo ? allConvos : convos);
      const budgets = computeFactionBudgets(allConvos);
      const bottlenecks = detectBottlenecks(analyses, chains, budgets);
      renderReport(analyses, chains, budgets, bottlenecks);
      break;
    }
  }
}

main();
