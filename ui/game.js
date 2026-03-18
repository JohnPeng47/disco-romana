// ============================================
// Disco Romana — Game Engine
// ============================================

class Game {
  constructor() {
    this.phase = null;
    this.npcs = {};
    this.conversations = {};
    this.state = null;
    this.currentConvo = null;
    this.currentNodeId = null;
    this.rollHistory = [];
  }

  // --- Data Loading ---

  async loadPhase(basePath) {
    const phaseData = await this.fetchJSON(`${basePath}/phase.json`);
    this.phase = phaseData;

    // Discover NPC folders
    const npcIds = await this.discoverNPCs(basePath);

    for (const npcId of npcIds) {
      const npc = await this.fetchJSON(`${basePath}/characters/${npcId}/npc.json`);
      this.npcs[npcId] = npc;

      for (let i = 0; i < npc.conversationArcLength; i++) {
        try {
          const convo = await this.fetchJSON(`${basePath}/characters/${npcId}/convo_${i}.json`);
          this.conversations[convo.id] = convo;
        } catch (e) {
          console.warn(`Missing convo_${i}.json for ${npcId}`);
        }
      }
    }

    // Load power shift conversation
    try {
      const ps = await this.fetchJSON(`${basePath}/power_shift/convo.json`);
      this.conversations[ps.id] = ps;
    } catch (e) {
      console.warn('No power_shift/convo.json found');
    }

    this.initState();
  }

  async discoverNPCs(basePath) {
    // Try fetching a manifest, fall back to known NPC list from phase data
    // Since we're loading from static files, we'll use the NPC IDs we can find
    const response = await fetch(`${basePath}/npc-manifest.json`).catch(() => null);
    if (response && response.ok) {
      return await response.json();
    }
    // Fall back: try all character directories listed in conversations
    const knownIds = new Set();
    for (const [id, convo] of Object.entries(this.conversations)) {
      knownIds.add(convo.npcId);
    }
    // Also try common pattern from phase data
    // We'll just scan what we loaded from the manifest or embed NPC IDs directly
    return Object.keys(this.npcs).length > 0 ? Object.keys(this.npcs) : [];
  }

  async fetchJSON(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Failed to load ${url}: ${r.status}`);
    return r.json();
  }

  async loadFromEmbedded(phaseData, npcsArray, conversationsArray) {
    this.phase = phaseData;
    for (const npc of npcsArray) {
      this.npcs[npc.id] = npc;
    }
    for (const convo of conversationsArray) {
      this.conversations[convo.id] = convo;
    }
    this.initState();
  }

  initState() {
    this.state = {
      currentPhase: this.phase.id,
      currentRank: 'citizen',
      turnsRemaining: this.phase.totalMoves,
      reputation: { severitas: 0, clementia: 0, audacia: 0, calliditas: 0 },
      factionStandings: {},
      personalFavors: {},
      exitStateHistory: [],
      visitedNodes: new Set(),
      force: 0,
      wealth: 0,
    };

    for (const faction of this.phase.factions) {
      this.state.factionStandings[faction.id] = 0;
    }
    for (const npcId in this.npcs) {
      this.state.personalFavors[npcId] = 0;
    }
  }

  // --- Conversation Logic ---

  getAvailableConversations() {
    const available = [];
    for (const [id, convo] of Object.entries(this.conversations)) {
      if (id === this.phase.powerShiftConversationId) continue;
      if (this.checkPreconditions(convo.preconditions)) {
        // Check not already completed
        const completed = this.state.exitStateHistory.some(h => h.conversationId === id);
        if (!completed) {
          available.push(convo);
        }
      }
    }
    return available;
  }

  checkPreconditions(preconditions) {
    if (!preconditions || preconditions.length === 0) return true;
    return preconditions.every(p => {
      switch (p.type) {
        case 'min_rank': {
          const ranks = ['citizen', 'magistrate', 'consul'];
          return ranks.indexOf(this.state.currentRank) >= ranks.indexOf(p.minRank);
        }
        case 'faction_standing':
          return (this.state.factionStandings[p.factionId] || 0) >= (p.minStanding || 0);
        case 'prior_exit_state':
          return (p.requiredExitStateIds || []).some(esId =>
            this.state.exitStateHistory.some(h =>
              h.conversationId === p.conversationId && h.exitStateId === esId
            )
          );
        case 'phase_event':
          return true; // Phase events always available for now
        default:
          return true;
      }
    });
  }

  startConversation(convoId) {
    this.currentConvo = this.conversations[convoId];
    this.currentNodeId = this.currentConvo.entryNodeId;
    this.rollHistory = [];
    return this.getCurrentNode();
  }

  getCurrentNode() {
    return this.currentConvo.nodes[this.currentNodeId];
  }

  advanceToNode(nodeId) {
    this.currentNodeId = nodeId;
    this.state.visitedNodes.add(nodeId);
    return this.getCurrentNode();
  }

  resolvePassive(node) {
    // Find first matching response based on reputation
    for (const response of node.responses) {
      const traitVal = this.state.reputation[response.trait] || 0;
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

  resolveConvergence(node) {
    for (const route of node.routes) {
      const cond = route.condition;
      let matches = false;
      switch (cond.type) {
        case 'reputation_dominant': {
          const rep = this.state.reputation;
          const dominant = Object.entries(rep).sort((a, b) => b[1] - a[1])[0];
          matches = dominant && dominant[0] === cond.trait;
          break;
        }
        case 'roll_history':
          matches = this.rollHistory.filter(r => r === 'success').length >= cond.minSuccesses;
          break;
        case 'visited_node':
          matches = this.state.visitedNodes.has(cond.nodeId);
          break;
        case 'faction_standing':
          matches = (this.state.factionStandings[cond.factionId] || 0) >= cond.min;
          break;
      }
      if (matches) return route.nextNodeId;
    }
    return node.fallbackNodeId;
  }

  resolveRoll(rollConfig) {
    // Roll dice
    let total = 0;
    const rolls = [];
    for (let i = 0; i < rollConfig.dice.count; i++) {
      const roll = Math.floor(Math.random() * rollConfig.dice.sides) + 1;
      rolls.push(roll);
      total += roll;
    }

    // Add factors
    const factors = rollConfig.factors;
    let modifier = (factors.personalFavor || 0)
      + (factors.factionAlignment || 0)
      + (factors.force || 0)
      + (factors.wealth || 0);

    if (rollConfig.reputationBonus) {
      const traitVal = this.state.reputation[rollConfig.reputationBonus.trait] || 0;
      modifier += traitVal * rollConfig.reputationBonus.weight;
    }

    const finalTotal = total + modifier;
    const threshold = rollConfig.baseThreshold;

    let outcome;
    if (finalTotal >= threshold) {
      outcome = 'success';
    } else if (finalTotal >= threshold - 2) {
      outcome = 'partial';
    } else {
      outcome = 'failure';
    }

    this.rollHistory.push(outcome);

    return { rolls, total, modifier, finalTotal, threshold, outcome };
  }

  applyExitEffects(exitState) {
    const results = [];
    for (const effect of exitState.effects) {
      switch (effect.type) {
        case 'faction_standing':
          for (const delta of effect.deltas) {
            const old = this.state.factionStandings[delta.factionId] || 0;
            this.state.factionStandings[delta.factionId] = Math.max(-10, Math.min(10, old + delta.shift));
            results.push({ text: `${delta.factionId}: ${delta.shift > 0 ? '+' : ''}${delta.shift}`, reason: delta.reason, positive: delta.shift > 0 });
          }
          break;
        case 'reputation':
          for (const delta of effect.deltas) {
            const old = this.state.reputation[delta.trait] || 0;
            this.state.reputation[delta.trait] = Math.max(-10, Math.min(10, old + delta.shift));
            results.push({ text: `${delta.trait}: ${delta.shift > 0 ? '+' : ''}${delta.shift}`, reason: delta.reason, positive: delta.shift > 0 });
          }
          break;
        case 'turn_penalty':
          this.state.turnsRemaining = Math.max(0, this.state.turnsRemaining + effect.shift);
          results.push({ text: `Turns: ${effect.shift > 0 ? '+' : ''}${effect.shift}`, reason: effect.reason, positive: effect.shift > 0 });
          break;
        case 'unlock_conversation':
          results.push({ text: `New conversation available`, reason: '', positive: true });
          break;
        case 'lock_conversation':
          results.push({ text: `Conversation locked`, reason: '', positive: false });
          break;
        case 'rank_change':
          this.state.currentRank = effect.newRank;
          results.push({ text: `Rank: ${effect.newRank}`, reason: effect.reason, positive: true });
          break;
        case 'game_over':
          results.push({ text: `GAME OVER`, reason: effect.reason, positive: false, gameOver: true });
          break;
      }
    }
    return results;
  }

  endConversation(exitStateId) {
    const exitState = this.currentConvo.exitStates.find(es => es.id === exitStateId);
    if (!exitState) return [];

    this.state.exitStateHistory.push({
      conversationId: this.currentConvo.id,
      exitStateId: exitStateId,
    });

    const results = this.applyExitEffects(exitState);
    this.currentConvo = null;
    this.currentNodeId = null;
    return { exitState, results };
  }

  useTurn() {
    this.state.turnsRemaining--;
  }

  shouldTriggerPowerShift() {
    return this.state.turnsRemaining <= 0;
  }
}

// ============================================
// UI Controller
// ============================================

class GameUI {
  constructor(game) {
    this.game = game;
    this.elements = {
      phaseInfo: document.getElementById('phase-info'),
      turnCounter: document.getElementById('turn-counter'),
      reputationDisplay: document.getElementById('reputation-display'),
      factionDisplay: document.getElementById('faction-display'),
      rankDisplay: document.getElementById('rank-display'),
      npcList: document.getElementById('npc-list'),
      npcGrid: document.getElementById('npc-grid'),
      conversationScroll: document.getElementById('conversation-scroll'),
      choices: document.getElementById('choices'),
      npcSelectScreen: document.getElementById('npc-select-screen'),
      conversationScreen: document.getElementById('conversation-screen'),
      gameOverScreen: document.getElementById('game-over-screen'),
      gameOverTitle: document.getElementById('game-over-title'),
      gameOverReason: document.getElementById('game-over-reason'),
    };
  }

  init() {
    this.updateHeader();
    this.updateSidebars();
    this.showNPCSelection();
  }

  // --- Screen management ---

  showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    this.elements[screenId].classList.add('active');
  }

  // --- Header ---

  updateHeader() {
    this.elements.phaseInfo.textContent = this.game.phase.narrativePeriod;
    this.updateTurnCounter();
  }

  updateTurnCounter() {
    this.elements.turnCounter.textContent = `${this.game.state.turnsRemaining} turns remaining`;
  }

  // --- Sidebars ---

  updateSidebars() {
    this.updateReputation();
    this.updateFactions();
    this.updateRank();
    this.updateNPCList();
  }

  updateReputation() {
    const rep = this.game.state.reputation;
    const traitNames = { severitas: 'Severitas', clementia: 'Clementia', audacia: 'Audacia', calliditas: 'Calliditas' };
    let html = '';
    for (const [trait, label] of Object.entries(traitNames)) {
      const val = rep[trait] || 0;
      const pct = ((val + 10) / 20) * 100;
      const cls = val > 0 ? 'stat-positive' : val < 0 ? 'stat-negative' : '';
      html += `
        <div class="stat-row">
          <span class="stat-label">${label}</span>
          <span class="stat-value ${cls}">${val > 0 ? '+' : ''}${val}</span>
        </div>
        <div class="stat-bar"><div class="stat-bar-fill" style="width:${pct}%;background:${val > 0 ? 'var(--green)' : val < 0 ? 'var(--red)' : 'var(--text-dim)'}"></div></div>
      `;
    }
    this.elements.reputationDisplay.innerHTML = html;
  }

  updateFactions() {
    const standings = this.game.state.factionStandings;
    let html = '';
    for (const faction of this.game.phase.factions) {
      const val = standings[faction.id] || 0;
      const pct = ((val + 10) / 20) * 100;
      const cls = val > 0 ? 'stat-positive' : val < 0 ? 'stat-negative' : '';
      html += `
        <div class="stat-row">
          <span class="stat-label">${faction.name}</span>
          <span class="stat-value ${cls}">${val > 0 ? '+' : ''}${val}</span>
        </div>
        <div class="stat-bar"><div class="stat-bar-fill" style="width:${pct}%;background:${val > 0 ? 'var(--green)' : val < 0 ? 'var(--red)' : 'var(--text-dim)'}"></div></div>
      `;
    }
    this.elements.factionDisplay.innerHTML = html;
  }

  updateRank() {
    const rankLabels = { citizen: 'Private Citizen', magistrate: 'Magistrate', consul: 'Consul' };
    this.elements.rankDisplay.innerHTML = `
      <div class="stat-row">
        <span class="stat-value">${rankLabels[this.game.state.currentRank]}</span>
      </div>
    `;
  }

  updateNPCList() {
    let html = '';
    for (const [id, npc] of Object.entries(this.game.npcs)) {
      const faction = this.game.phase.factions.find(f => f.id === npc.factionId);
      html += `
        <div class="npc-card" data-npc="${id}">
          <div class="npc-name">${npc.name}</div>
          <div class="npc-faction">${faction ? faction.name : npc.factionId}</div>
          <div class="npc-rank">${npc.rank}</div>
        </div>
      `;
    }
    this.elements.npcList.innerHTML = html;
  }

  // --- NPC Selection ---

  showNPCSelection() {
    if (this.game.shouldTriggerPowerShift()) {
      this.triggerPowerShift();
      return;
    }

    this.showScreen('npcSelectScreen');
    this.updateSidebars();

    const available = this.game.getAvailableConversations();
    let html = '';

    for (const convo of available) {
      const npc = this.game.npcs[convo.npcId];
      if (!npc) continue;
      const faction = this.game.phase.factions.find(f => f.id === npc.factionId);
      html += `
        <div class="npc-card" onclick="ui.startConversation('${convo.id}')" data-convo="${convo.id}">
          <div class="npc-name">${npc.name}</div>
          <div class="npc-faction">${faction ? faction.name : npc.factionId}</div>
          <div class="npc-rank">${npc.rank}</div>
        </div>
      `;
    }

    if (html === '') {
      html = '<p style="color: var(--text-dim); text-align: center;">No conversations available.</p>';
    }

    this.elements.npcGrid.innerHTML = html;
  }

  // --- Conversation Flow ---

  startConversation(convoId) {
    this.game.useTurn();
    this.updateTurnCounter();

    this.elements.conversationScroll.innerHTML = '';
    this.showScreen('conversationScreen');

    const node = this.game.startConversation(convoId);
    this.processNode(node);
  }

  async processNode(node) {
    if (!node || !this.game.currentConvo) return;

    // Show NPC dialogue
    const npc = this.game.npcs[this.game.currentConvo.npcId];
    const npcName = npc ? npc.name : 'Narrator';

    if (node.npcDialogue && node.npcDialogue.trim()) {
      this.addMessage('npc', npcName, node.npcDialogue);
      await this.delay(300);
    }

    switch (node.type) {
      case 'active':
        this.showActiveChoices(node);
        break;
      case 'passive':
        await this.resolvePassiveNode(node);
        break;
      case 'noop':
        this.showNoopChoices(node);
        break;
      case 'convergence':
        await this.resolveConvergenceNode(node);
        break;
      case 'exit':
        await this.resolveExitNode(node);
        break;
    }
  }

  showActiveChoices(node) {
    this.elements.choices.classList.remove('hidden');
    let html = '';

    for (let i = 0; i < node.options.length; i++) {
      const opt = node.options[i];
      const locked = opt.visibilityRequirement &&
        (this.game.state.reputation[opt.visibilityRequirement.trait] || 0) < opt.visibilityRequirement.minValue;

      const rollTag = opt.roll ? `<span class="roll-tag">[Roll]</span>` : '';
      const lockTag = locked ? `<span class="lock-tag">[${opt.visibilityRequirement.trait} ${opt.visibilityRequirement.minValue}+]</span>` : '';

      html += `
        <button class="choice-btn ${locked ? 'locked' : ''}"
          ${locked ? 'disabled' : `onclick="ui.chooseActive(${i})"`}>
          ${opt.playerDialogue}${rollTag}${lockTag}
        </button>
      `;
    }

    this.elements.choices.innerHTML = html;
  }

  getNextNodeId(opt, rollOutcome) {
    // Handle both formats: opt.nextNodeId (simple) and opt.onSuccess.nextNodeId (roll-based)
    if (!rollOutcome) {
      return opt.nextNodeId || (opt.onSuccess && opt.onSuccess.nextNodeId);
    }
    if (rollOutcome === 'success' && opt.onSuccess) {
      return opt.onSuccess.nextNodeId;
    }
    if (rollOutcome === 'partial' && opt.onPartial) {
      return opt.onPartial.nextNodeId;
    }
    if (rollOutcome === 'failure' && opt.onFailure) {
      return opt.onFailure.nextNodeId;
    }
    // Fallback: success path or direct nextNodeId
    return (opt.onSuccess && opt.onSuccess.nextNodeId) || opt.nextNodeId;
  }

  async chooseActive(index) {
    const node = this.game.getCurrentNode();
    const opt = node.options[index];
    this.elements.choices.classList.add('hidden');

    this.addMessage('player', 'You', opt.playerDialogue);
    await this.delay(400);

    let nextNodeId;
    if (opt.roll) {
      const result = this.game.resolveRoll(opt.roll);
      this.showRollResult(result);
      await this.delay(800);
      nextNodeId = this.getNextNodeId(opt, result.outcome);
    } else {
      nextNodeId = this.getNextNodeId(opt);
    }

    if (!nextNodeId) {
      console.error('No nextNodeId found for option:', opt);
      this.addMessage('system', null, '[Error: conversation path broken]');
      this.elements.choices.classList.remove('hidden');
      this.elements.choices.innerHTML = `<button class="choice-btn" onclick="ui.endConversation()">Return...</button>`;
      return;
    }

    const next = this.game.advanceToNode(nextNodeId);
    if (!next) {
      console.error('Node not found:', nextNodeId);
      this.addMessage('system', null, '[Error: missing node]');
      this.elements.choices.classList.remove('hidden');
      this.elements.choices.innerHTML = `<button class="choice-btn" onclick="ui.endConversation()">Return...</button>`;
      return;
    }
    this.processNode(next);
  }

  async resolvePassiveNode(node) {
    const result = this.game.resolvePassive(node);

    await this.delay(600);
    if (result.matchedTrait) {
      this.addMessage('system', null, `Your ${result.matchedTrait} speaks for you.`);
      await this.delay(300);
    }
    this.addMessage('player', 'You', result.dialogue);
    await this.delay(400);

    const next = this.game.advanceToNode(result.nextNodeId);
    this.processNode(next);
  }

  showNoopChoices(node) {
    this.elements.choices.classList.remove('hidden');
    let html = '';

    for (let i = 0; i < node.options.length; i++) {
      const opt = node.options[i];
      html += `
        <button class="choice-btn" onclick="ui.chooseNoop(${i})">
          ${opt.playerDialogue}
        </button>
      `;
    }

    this.elements.choices.innerHTML = html;
  }

  async chooseNoop(index) {
    const node = this.game.getCurrentNode();
    const opt = node.options[index];
    this.elements.choices.classList.add('hidden');

    this.addMessage('player', 'You', opt.playerDialogue);
    await this.delay(400);

    const next = this.game.advanceToNode(opt.nextNodeId);
    this.processNode(next);
  }

  async resolveConvergenceNode(node) {
    const nextNodeId = this.game.resolveConvergence(node);
    await this.delay(400);
    const next = this.game.advanceToNode(nextNodeId);
    this.processNode(next);
  }

  async resolveExitNode(node) {
    const { exitState, results } = this.game.endConversation(node.exitStateId);
    await this.delay(600);

    if (exitState) {
      this.addMessage('system', null, exitState.narrativeLabel);
      await this.delay(300);
    }

    let gameOver = false;
    let gameOverReason = '';
    for (const r of results) {
      this.addEffect(r.text, r.reason, r.positive);
      if (r.gameOver) {
        gameOver = true;
        gameOverReason = r.reason;
      }
      await this.delay(200);
    }

    this.updateSidebars();

    if (gameOver) {
      await this.delay(1000);
      this.showGameOver('Your Story Ends', gameOverReason);
      return;
    }

    // Show "continue" button
    await this.delay(500);
    this.elements.choices.classList.remove('hidden');
    this.elements.choices.innerHTML = `
      <button class="choice-btn" onclick="ui.endConversation()">Continue...</button>
    `;
    this.scrollToBottom();
  }

  endConversation() {
    this.elements.choices.classList.add('hidden');
    this.showNPCSelection();
  }

  // --- Power Shift ---

  triggerPowerShift() {
    const psId = this.game.phase.powerShiftConversationId;
    if (this.game.conversations[psId]) {
      this.elements.conversationScroll.innerHTML = '';
      this.showScreen('conversationScreen');

      this.addMessage('system', null, 'The crisis arrives. Your alliances are about to be tested.');

      const node = this.game.startConversation(psId);
      setTimeout(() => this.processNode(node), 800);
    } else {
      this.showGameOver('Phase Complete', 'The power shift conversation was not found.');
    }
  }

  // --- Game Over ---

  showGameOver(title, reason) {
    this.showScreen('gameOverScreen');
    this.elements.gameOverTitle.textContent = title;
    this.elements.gameOverReason.textContent = reason;
  }

  // --- Message rendering ---

  addMessage(type, speaker, text) {
    const div = document.createElement('div');
    div.className = `msg msg-${type}`;
    if (type === 'system') {
      div.innerHTML = text;
    } else {
      div.innerHTML = `<div class="speaker">${speaker}</div><div>${text}</div>`;
    }
    this.elements.conversationScroll.appendChild(div);
    this.scrollToBottom();
  }

  addEffect(text, reason, positive) {
    const div = document.createElement('div');
    div.className = 'msg msg-effect';
    const color = positive ? 'var(--green)' : 'var(--red)';
    div.innerHTML = `<span style="color:${color}">${text}</span>${reason ? ` — ${reason}` : ''}`;
    this.elements.conversationScroll.appendChild(div);
    this.scrollToBottom();
  }

  showRollResult(result) {
    const div = document.createElement('div');
    div.className = `msg roll-result roll-${result.outcome}`;
    const diceStr = result.rolls.join(' + ');
    const modStr = result.modifier >= 0 ? `+${result.modifier}` : `${result.modifier}`;
    div.innerHTML = `
      Roll: [${diceStr}] ${modStr} = ${result.finalTotal} vs ${result.threshold}
      — <strong>${result.outcome.toUpperCase()}</strong>
    `;
    this.elements.conversationScroll.appendChild(div);
    this.scrollToBottom();
  }

  scrollToBottom() {
    const el = this.elements.conversationScroll;
    el.scrollTop = el.scrollHeight;
  }

  delay(ms) {
    return new Promise(r => setTimeout(r, ms));
  }
}

// ============================================
// Bootstrap
// ============================================

let game, ui;

async function boot() {
  game = new Game();
  ui = new GameUI(game);

  // Try loading from the generation output
  const basePath = '../generation/output';
  try {
    // First load phase.json to get faction data
    const phaseData = await game.fetchJSON(`${basePath}/phase.json`);
    game.phase = phaseData;

    // Load NPC manifest or discover from known IDs
    const npcManifest = await fetch(`${basePath}/npc-manifest.json`)
      .then(r => r.ok ? r.json() : null)
      .catch(() => null);

    let npcIds;
    if (npcManifest) {
      npcIds = npcManifest;
    } else {
      // Try loading each potential NPC directory
      // We'll try the IDs we know from the generation
      const candidates = [
        'gaius_marius', 'lucius_sulla', 'marcus_drusus',
        'publius_sulpicius', 'quintus_catulus', 'quintus_poppaedius',
        'tiberius_longinus'
      ];
      npcIds = [];
      for (const id of candidates) {
        try {
          const npc = await game.fetchJSON(`${basePath}/characters/${id}/npc.json`);
          game.npcs[id] = npc;
          npcIds.push(id);
        } catch (e) { /* skip */ }
      }
    }

    // Load NPC data
    for (const npcId of npcIds) {
      if (!game.npcs[npcId]) {
        try {
          game.npcs[npcId] = await game.fetchJSON(`${basePath}/characters/${npcId}/npc.json`);
        } catch (e) { continue; }
      }

      const npc = game.npcs[npcId];
      for (let i = 0; i < npc.conversationArcLength; i++) {
        try {
          const convo = await game.fetchJSON(`${basePath}/characters/${npcId}/convo_${i}.json`);
          game.conversations[convo.id] = convo;
        } catch (e) { /* skip missing convos */ }
      }
    }

    // Load power shift
    try {
      const ps = await game.fetchJSON(`${basePath}/power_shift/convo.json`);
      game.conversations[ps.id] = ps;
    } catch (e) { /* skip */ }

    game.initState();
    ui.init();

  } catch (e) {
    console.error('Failed to load game data:', e);
    document.getElementById('npc-select-screen').innerHTML = `
      <h2 style="color: var(--red);">Failed to Load</h2>
      <p>${e.message}</p>
      <p style="margin-top: 12px; color: var(--text-dim);">Make sure generation output exists in generation/output/</p>
    `;
  }
}

boot();
