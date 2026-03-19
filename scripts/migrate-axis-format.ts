/**
 * Migration script: convert legacy conversation JSON to new axis format.
 *
 * Transforms:
 * 1. Exit effects: "faction_standing" → "axis_shift" with operations[]
 * 2. Roll factors: { personalFavor, factionAlignment, force, wealth } → modifiers[]
 * 3. Convergence conditions: { type: "faction_standing", factionId, min } → { type: "axis_gate", op }
 * 4. Preconditions: { type: "faction_standing", ... } → { type: "axis_gate", op }
 *
 * Usage: npx tsx scripts/migrate-axis-format.ts <dir>
 */

import fs from 'fs';
import path from 'path';

const dir = process.argv[2];
if (!dir) {
  console.error('Usage: npx tsx scripts/migrate-axis-format.ts <dir>');
  process.exit(1);
}

function findJsonFiles(dirPath: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...findJsonFiles(full));
    } else if (entry.name.endsWith('.json')) {
      results.push(full);
    }
  }
  return results;
}

function migrateEffect(effect: any): any {
  if (effect.type === 'faction_standing') {
    return {
      type: 'axis_shift',
      operations: (effect.deltas || []).map((d: any) => ({
        verb: 'shift',
        axis: 'factions',
        key: d.factionId,
        shift: d.shift,
        reason: d.reason,
      })),
    };
  }
  // Migrate nested preconditionOverride on unlock/lock effects
  if (effect.preconditionOverride) {
    effect = { ...effect, preconditionOverride: migratePrecondition(effect.preconditionOverride) };
  }
  return effect;
}

function migrateRollFactors(roll: any, npcId: string): any {
  if (!roll) return roll;
  const newRoll = { ...roll };

  if (roll.factors && !roll.modifiers) {
    const f = roll.factors;
    const modifiers: any[] = [];

    // personalFavor → read from personalFavors axis keyed by NPC
    if (f.personalFavor && f.personalFavor !== 0) {
      modifiers.push({
        verb: 'roll',
        axis: 'personalFavors',
        key: npcId,
        weight: f.personalFavor,
      });
    }

    // factionAlignment → we need to know which faction; use the NPC's faction
    // We'll pass npcFactionId from the caller
    if (f.factionAlignment && f.factionAlignment !== 0) {
      modifiers.push({
        verb: 'roll',
        axis: 'factions',
        key: '__FACTION__', // placeholder, resolved below
        weight: f.factionAlignment,
      });
    }

    if (f.force && f.force !== 0) {
      modifiers.push({
        verb: 'roll',
        axis: 'force',
        weight: f.force,
      });
    }

    if (f.wealth && f.wealth !== 0) {
      modifiers.push({
        verb: 'roll',
        axis: 'wealth',
        weight: f.wealth,
      });
    }

    newRoll.modifiers = modifiers;
    delete newRoll.factors;
  }

  return newRoll;
}

function migrateConvergenceCondition(cond: any): any {
  if (cond.type === 'faction_standing') {
    return {
      type: 'axis_gate',
      op: {
        verb: 'gate',
        axis: 'factions',
        key: cond.factionId,
        min: cond.min,
      },
    };
  }
  return cond;
}

function migratePrecondition(p: any): any {
  if (p.type === 'faction_standing') {
    return {
      type: 'axis_gate',
      op: {
        verb: 'gate',
        axis: 'factions',
        key: p.factionId,
        min: p.min ?? p.minStanding ?? 0,
      },
    };
  }
  if (p.type === 'any_of' && p.conditions) {
    return {
      ...p,
      conditions: p.conditions.map(migratePrecondition),
    };
  }
  return p;
}

function migrateConversation(convo: any, npcFactionId: string | null): any {
  const npcId = convo.npcId;

  // Migrate preconditions
  if (convo.preconditions) {
    convo.preconditions = convo.preconditions.map(migratePrecondition);
  }

  // Migrate nodes
  for (const [nodeId, node] of Object.entries(convo.nodes) as [string, any][]) {
    // Active nodes: migrate roll factors
    if (node.type === 'active' && node.options) {
      for (const opt of node.options) {
        if (opt.roll) {
          opt.roll = migrateRollFactors(opt.roll, npcId);
          // Resolve __FACTION__ placeholder
          if (npcFactionId) {
            for (const mod of opt.roll.modifiers || []) {
              if (mod.key === '__FACTION__') {
                mod.key = npcFactionId;
              }
            }
          } else {
            // Remove faction modifiers if no faction
            opt.roll.modifiers = (opt.roll.modifiers || []).filter(
              (m: any) => m.key !== '__FACTION__'
            );
          }
        }
      }
    }

    // Convergence nodes: migrate conditions
    if (node.type === 'convergence' && node.routes) {
      for (const route of node.routes) {
        route.condition = migrateConvergenceCondition(route.condition);
      }
    }
  }

  // Migrate exit states
  if (convo.exitStates) {
    for (const es of convo.exitStates) {
      if (es.effects) {
        es.effects = es.effects.map(migrateEffect);
      }
    }
  }

  return convo;
}

// --- Main ---

// Load NPC faction mappings
const npcFactions: Record<string, string | null> = {};
const charsDir = path.join(dir, 'characters');
if (fs.existsSync(charsDir)) {
  for (const npcDir of fs.readdirSync(charsDir)) {
    const npcJsonPath = path.join(charsDir, npcDir, 'npc.json');
    if (fs.existsSync(npcJsonPath)) {
      const npc = JSON.parse(fs.readFileSync(npcJsonPath, 'utf-8'));
      npcFactions[npc.id] = npc.factionId || null;
    }
  }
}

// Migrate all conversation files
const files = findJsonFiles(dir);
let migratedCount = 0;

for (const file of files) {
  const raw = fs.readFileSync(file, 'utf-8');
  const data = JSON.parse(raw);

  // Only migrate conversation files (have nodes + exitStates)
  if (!data.nodes || !data.exitStates) continue;

  const npcFactionId = npcFactions[data.npcId] || null;
  const migrated = migrateConversation(data, npcFactionId);
  const output = JSON.stringify(migrated, null, 2) + '\n';

  if (output !== raw) {
    fs.writeFileSync(file, output);
    migratedCount++;
    console.log(`Migrated: ${path.relative(dir, file)}`);
  }
}

console.log(`\nDone. ${migratedCount} files migrated.`);
