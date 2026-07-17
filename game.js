'use strict';
/* ============================================================================
   AI AGENT SIMULATOR — incremental. 4 layers: Cash → Compute → Models → Singularity.
   Architecture: CONFIG holds every balance number; simulation and rendering are
   separated; DOM builds once per unlock and updates in place (no innerHTML in
   hot paths — lesson learned from Manuscript's eaten-clicks bug).
============================================================================ */
// Big numbers via break_infinity.js: <script> loads it before this file in the
// browser (window.Decimal); Node/tests require it directly since there's no window.
const Decimal = typeof module !== 'undefined' ? require('./break_infinity.min.js') : window.Decimal;
const CONFIG = {
  saveKey: 'ai_agent_sim_v1',
  saveVersion: 4,
  tickRate: 10,
  autosaveMs: 10000,
  clickBase: 1,
  clickShareBase: 0.005, // every click also earns 0.5% of $/sec, so clicking never goes obsolete
  cascadeRate: 0.04, // higher tiers produce lower tiers at this fraction/sec per unit // $ per manual prompt
  tiers: [
    { id: 'chatbot',    name: 'Chatbot',        desc: 'Answers tickets for pennies', baseCost: 10,      costMult: 1.16, glyph: '💬' },
    { id: 'copywriter', name: 'Copywriter',     desc: 'Produces Chatbots\' scripts', baseCost: 600,     costMult: 1.19, glyph: '✍️' },
    { id: 'coder',      name: 'Coder Agent',    desc: 'Builds Copywriter tooling',   baseCost: 4e4,     costMult: 1.22, glyph: '🧑‍💻' },
    { id: 'researcher', name: 'Researcher',     desc: 'Discovers Coder techniques',  baseCost: 3e6,     costMult: 1.25, glyph: '🔬' },
    { id: 'manager',    name: 'Manager Agent',  desc: 'Recruits Researchers',        baseCost: 2.5e8,   costMult: 1.28, glyph: '🧭' },
    { id: 'swarm',      name: 'Agent Swarm',    desc: 'Self-replicating Managers',   baseCost: 2e10,    costMult: 1.31, glyph: '🌐' },
  ],
  milestone: { per: 25, mult: 2 }, // every 25 PURCHASED of a tier: that tier x2
  costScaling: { softStart: 130, factor: 1.012, exp: 1.5 }, // progressive cost growth past 130 purchases
  upgrades: [ // cash upgrades — reset on Compute prestige
    { id: 'gpu1',   name: 'Consumer GPUs',    desc: 'All agents x2',            cost: 5e3,   mult: { all: 2 } },
    { id: 'prompt', name: 'Prompt Library',   desc: 'Clicking x10 and +1.5% of $/s per click', cost: 2e4, mult: { click: 10, clickRate: 0.015 } },
    { id: 'gpu2',   name: 'Datacenter Racks', desc: 'All agents x3',            cost: 5e6,   mult: { all: 3 } },
    { id: 'api',    name: 'API Reselling',    desc: 'Chatbots x5',              cost: 8e7,   mult: { tier0: 5 } },
    { id: 'gpu3',   name: 'Custom Silicon',   desc: 'All agents x4',            cost: 1e10,  mult: { all: 4 } },
    { id: 'viral',  name: 'Viral Demo',       desc: 'Clicks earn +3% of $/s',   cost: 5e11,  mult: { clickRate: 0.03 } },
    { id: 'gpu4',   name: 'Orbital Compute',  desc: 'All agents x6',            cost: 2e13,  mult: { all: 6 } },
  ],
  compute: { // layer 2
    unlockCash: 1e15,          // cashThisRun needed to see/do the reset
    gainExp: 0.42,             // gain = floor((cashThisRun/unlockCash)^gainExp)
    bonusPerPoint: 0.35,       // +35% all production per compute point EARNED this model cycle
    shop: [ // spend compute points — reset on Model prestige (Singularity can make permanent)
      { id: 'auto1', name: 'Autobuy Chatbot–Coder',   desc: 'Auto-purchases tiers 1–3 each second', cost: 12 },
      { id: 'auto2', name: 'Autobuy all agents',      desc: 'Auto-purchases every tier each second', cost: 60 },
      { id: 'boost', name: 'Overclock',               desc: 'All agents x5',                        cost: 150 },
      { id: 'autoup',name: 'Autobuy upgrades',        desc: 'Cash upgrades purchase themselves',    cost: 400 },
      { id: 'start', name: 'Seed Funding',            desc: 'Start runs with $1e6',                 cost: 1000 },
    ],
  },
  models: { // layer 3
    unlockBestGain: 20,         // record-run compute gain needed for v1
    reqMult: 12,                // base of the superexponential requirement curve
    reqCurve: 1.6,              // req = unlock * reqMult^(level^reqCurve) — sim-tuned
    bonusPerLevel: 6,           // all production x6 per model version (compounding)
  },
  singularity: { // layer 4
    unlockModelLevel: 8,
    shardsFor: lvl => Math.pow(lvl - 7, 2), // v8 -> 1, v9 -> 4, v10 -> 9...
    shop: [
      { id: 'permauto',  name: 'Recursive Tooling', desc: 'Compute shop purchases become permanent',      cost: 1 },
      { id: 'achpower',  name: 'Benchmark Fame',    desc: 'Achievement bonus 2% → 5% each',               cost: 2 },
      { id: 'headstart', name: 'Warm Boot',         desc: 'Start every model cycle with 100 compute',     cost: 3 },
      { id: 'modelboost',name: 'Scaling Laws',      desc: 'Model bonus x6 → x9 per version',              cost: 5 },
      { id: 'timewarp',  name: 'Inference Speedup', desc: 'All production x3 per Singularity (stacks)',   cost: 8 },
    ],
  },
  achievementBonus: 0.02,
  achievements: [
    { id: 'firstDollar', name: 'Seed Round',        desc: 'Earn your first dollar',          check: g => g.lifetimeCash.gte(1) },
    { id: 'cash1e3',     name: 'Ramen Profitable',  desc: 'Earn $1,000 lifetime',            check: g => g.lifetimeCash.gte(1e3) },
    { id: 'cash1e6',     name: 'Unicorn Larva',     desc: 'Earn $1M lifetime',               check: g => g.lifetimeCash.gte(1e6) },
    { id: 'cash1e9',     name: 'Decacorn',          desc: 'Earn $1B lifetime',               check: g => g.lifetimeCash.gte(1e9) },
    { id: 'cash1e12',    name: 'GDP of a Nation',   desc: 'Earn $1T lifetime',               check: g => g.lifetimeCash.gte(1e12) },
    { id: 'cash1e15',    name: 'Post-Scarcity',     desc: 'Earn $1Q lifetime',               check: g => g.lifetimeCash.gte(1e15) },
    { id: 'cash1e21',    name: 'Money Singularity', desc: 'Earn $1e21 lifetime',             check: g => g.lifetimeCash.gte(1e21) },
    { id: 'tier0',       name: 'Hello World',       desc: 'Deploy a Chatbot',                check: g => g.tiers[0].purchased >= 1 },
    { id: 'tier2',       name: 'It Codes Itself',   desc: 'Deploy a Coder Agent',            check: g => g.tiers[2].purchased >= 1 },
    { id: 'tier5',       name: 'The Swarm Awakens', desc: 'Deploy an Agent Swarm',           check: g => g.tiers[5].purchased >= 1 },
    { id: 'tier0x100',   name: 'Call Center',       desc: 'Own 100 purchased Chatbots',      check: g => g.tiers[0].purchased >= 100 },
    { id: 'allTiers25',  name: 'Org Chart',         desc: '25+ purchased of every tier',     check: g => g.tiers.every(t => t.purchased >= 25) },
    { id: 'clicks100',   name: 'Prompt Engineer',   desc: 'Run 100 manual prompts',          check: g => g.totalClicks >= 100 },
    { id: 'clicks2500',  name: 'Carpal Tunnel',     desc: 'Run 2,500 manual prompts',        check: g => g.totalClicks >= 2500 },
    { id: 'rate1e6',     name: 'Printing Money',    desc: 'Exceed $1M/sec',                  check: g => cashPerSecond().gte(1e6) },
    { id: 'rate1e12',    name: 'Firehose',          desc: 'Exceed $1T/sec',                  check: g => cashPerSecond().gte(1e12) },
    { id: 'compute1',    name: 'First Cluster',     desc: 'Prestige for Compute',            check: g => g.stats.computeResets >= 1 },
    { id: 'compute10',   name: 'Serial Renter',     desc: 'Prestige for Compute 10 times',   check: g => g.stats.computeResets >= 10 },
    { id: 'compute1e3',  name: 'Hyperscaler',       desc: 'Earn 1,000 total compute (cycle)',check: g => g.compute.thisModelEarned.gte(1e3) },
    { id: 'shopAll',     name: 'Fully Automated',   desc: 'Own every compute upgrade at once',check: g => CONFIG.compute.shop.every(s => g.compute.shop[s.id]) },
    { id: 'model1',      name: 'Foundation v1',     desc: 'Train your first Model',          check: g => g.models.level >= 1 },
    { id: 'model4',      name: 'Frontier Lab',      desc: 'Reach Model v4',                  check: g => g.models.level >= 4 },
    { id: 'model8',      name: 'AGI Rumors',        desc: 'Reach Model v8',                  check: g => g.models.level >= 8 },
    { id: 'sing1',       name: 'The Event',         desc: 'Trigger the Singularity',         check: g => g.stats.singularities >= 1 },
    { id: 'sing3',       name: 'Recursive Self-Improvement', desc: '3 Singularities',        check: g => g.stats.singularities >= 3 },
    { id: 'shardShopAll',name: 'Beyond the Curve',  desc: 'Own every Singularity upgrade',   check: g => CONFIG.singularity.shop.every(s => g.singularity.shop[s.id]) },
    { id: 'play1h',      name: 'Shift One',         desc: 'Play for 1 hour',                 check: g => g.stats.playtime >= 3600 },
    { id: 'play10h',     name: 'Overtime',          desc: 'Play for 10 hours',               check: g => g.stats.playtime >= 36000 },
    { id: 'noClick',     name: 'Hands Off',         desc: 'Reach $1e9 in a run with <10 clicks', check: g => g.cashThisRun.gte(1e9) && g.clicksThisRun < 10 },
    { id: 'fastCompute', name: 'Speedrun',          desc: 'Compute prestige within 5 min of a run start', check: g => g.stats.lastComputeRunSecs !== null && g.stats.lastComputeRunSecs <= 300 },
    { id: 'tokenizeOnce', name: 'Ledger Opened',    desc: 'Activate Tokenize',               check: g => g.tokenize.unlocked },
    { id: 'agiBuyOne',    name: 'Recruited',        desc: 'Buy an AGI agent',                check: g => Object.keys(g.agiAgents.owned).length >= 1 },
    { id: 'agiEquip3',    name: 'Full Squad',       desc: 'Equip 3 AGI agents at once',      check: g => g.agiAgents.equipped.length >= 3 },
    { id: 'token1',       name: 'First Block',      desc: 'Earn 1 token',                    check: g => g.blockchain.lifetimeTokens.gte(1) },
    { id: 'token1e6',     name: 'Whale Watching',   desc: 'Earn 1,000,000 tokens',           check: g => g.blockchain.lifetimeTokens.gte(1e6) },
    { id: 'contractsAll', name: 'Fully Decentralized', desc: 'Own every Smart Contract',     check: g => CONFIG.blockchain.contracts.every(c => g.blockchain.contracts[c.id]) },
  ],
  offline: { capSecs: 8 * 3600, minSecs: 10 },
  // ===== Tokenize layer + AGI Agents (see SPEC-TOKENIZE.md) =====
  agiAgents: { // shard sink + equip strategy — bought once, equipped into 3 slots
    unlockShards: 100,       // one-time cost to unlock the whole system
    unlockSingularities: 3,  // AND requires this many singularities
    slots: 3,
    list: [
      { id: 'opus',   name: 'OPUS-9',    title: 'The Executive', cost: 40,  locked: false,
        desc: 'Full automation: auto-prestige compute on record-caliber runs, auto-train models when possible' },
      { id: 'midas',  name: 'MIDAS',     title: 'The Rainmaker',  cost: 40,  locked: false,
        desc: 'ALL cash production ^1.05 then x1e6' },
      { id: 'oracle', name: 'ORACLE',    title: 'The Miner',      cost: 60,  locked: false,
        desc: 'Token gain x25' },
      { id: 'ghost',  name: 'GHOST',     title: '???',            cost: 150, locked: true,
        desc: 'awaiting classification' },
      { id: 'atlas2', name: 'ATLAS-Ω', title: '???',         cost: 250, locked: true,
        desc: 'awaiting classification' },
    ],
  },
  tokenize: {
    // 1e1000 can't exist as a JS number literal (parses to Infinity) — stored as
    // a string and parsed via `new Decimal(...)` at every use site.
    unlockCash: '1e1000',
  },
  blockchain: { // layer 5 — a second idle "world" unlocked by Tokenize, runs alongside layer 1
    // Node Runner's raw owned-count would otherwise mirror tier0's 1-unit-per-second
    // cash pacing; scaled down so the free starter unit yields a first token in ~30s
    // (spec: "progression ~2x slower than cash's early curve").
    nodeRunnerTokenRate: 1 / 30,
    validatorCascadeRate: 0.04, // matches the cash world's inter-tier cascade pacing
    validators: [ // tier k produces tier k-1; tier 0 (Node Runner) produces Tokens
      { id: 'noderunner', name: 'Node Runner',    desc: 'Feeds Tokens directly',      baseCost: '1e995', costMult: 1.14, currency: 'cash',  glyph: '🔹' },
      { id: 'staking',    name: 'Staking Pool',   desc: 'Feeds Node Runners',         baseCost: '1e998', costMult: 1.17, currency: 'cash',  glyph: '🔷' },
      { id: 'mining',     name: 'Mining Farm',    desc: 'Feeds Staking Pools',        baseCost: 10,      costMult: 1.20, currency: 'token', glyph: '⛏️' },
      { id: 'dao',        name: 'DAO Council',    desc: 'Feeds Mining Farms',         baseCost: 1000,    costMult: 1.25, currency: 'token', glyph: '🏛️' },
      { id: 'whale',      name: 'Protocol Whale', desc: 'Feeds DAO Councils',         baseCost: 1e5,     costMult: 1.32, currency: 'token', glyph: '🐋' },
    ],
    contracts: [ // one-time upgrades, priced in tokens
      { id: 'consensusTuning', name: 'Consensus Tuning', desc: 'All Validators x3',                cost: 50,    mult: { allValidators: 3 } },
      { id: 'sharding',        name: 'Sharding',         desc: 'All Validators x10',               cost: 5000,  mult: { allValidators: 10 } },
      { id: 'gasOptimizer',    name: 'Gas Optimizer',    desc: 'Validator costs -30%',              cost: 800,   mult: { costReduction: 0.3 } },
      { id: 'bridgeProtocol',  name: 'Bridge Protocol',  desc: 'Cash production x1e3',              cost: 2000,  mult: { cashCross: 1e3 } },
      { id: 'liquidityMining', name: 'Liquidity Mining', desc: 'Vice-versa bridge: Token production x1e3', cost: 20000, mult: { tokenAll: 1e3 } },
      { id: 'genesisBlock',    name: 'Genesis Block',    desc: 'Token production x10',              cost: 1e5,   mult: { tokenAll: 10 } },
    ],
  },
};

/* ============================== state ============================== */
function freshTiers() { return CONFIG.tiers.map(() => ({ owned: new Decimal(0), purchased: 0 })); }
function freshState() {
  return {
    cash: new Decimal(0), lifetimeCash: new Decimal(0), cashThisRun: new Decimal(0),
    tiers: freshTiers(),
    upgrades: {},               // id -> true (cash layer)
    totalClicks: 0, clicksThisRun: 0,
    runStartAt: Date.now(),
    compute: { points: new Decimal(0), thisModelEarned: new Decimal(0), bestGain: new Decimal(0), shop: {} },
    models: { level: 0 },
    singularity: { shards: 0, shop: {} },
    achievements: {},
    stats: { computeResets: 0, modelResets: 0, singularities: 0, playtime: 0, lastComputeRunSecs: null },
    settings: { soundOn: true },
    tokenize: { unlocked: false },
    agiAgents: { unlocked: false, owned: {}, equipped: [] },
    blockchain: {
      tokens: new Decimal(0), lifetimeTokens: new Decimal(0),
      validators: CONFIG.blockchain.validators.map(() => ({ owned: new Decimal(0), purchased: 0 })),
      contracts: {},
    },
    lastSaveTime: Date.now(),
  };
}
let game = freshState();

/* ============================== multipliers ============================== */
function achievementCount() { return Object.keys(game.achievements).length; }
function achievementMult() {
  const per = game.singularity.shop.achpower ? 0.05 : CONFIG.achievementBonus;
  return Math.pow(1 + per, achievementCount());
}
function modelMult() {
  const per = game.singularity.shop.modelboost ? 9 : CONFIG.models.bonusPerLevel;
  return new Decimal(per).pow(game.models.level);
}
function singularityMult() {
  return game.singularity.shop.timewarp ? new Decimal(3).pow(game.stats.singularities) : new Decimal(1);
}
function computeMult() {
  // softcap: linear to 300 points, then ^0.45 — stops the compute↔cash loop
  // from self-accelerating through the whole Model layer (sim-tuned)
  const e = game.compute.thisModelEarned;
  const eff = e.lte(300) ? e : e.minus(300).pow(0.45).plus(300);
  return new Decimal(1).plus(eff.times(CONFIG.compute.bonusPerPoint));
}
function upgradeAllMult() {
  let m = 1;
  for (const u of CONFIG.upgrades) if (game.upgrades[u.id] && u.mult.all) m *= u.mult.all;
  if (game.compute.shop.boost) m *= 5;
  return m;
}
function globalMult() {
  return new Decimal(upgradeAllMult()).times(computeMult()).times(modelMult()).times(achievementMult()).times(singularityMult());
}
function tierMult(i) {
  let m = new Decimal(CONFIG.milestone.mult).pow(Math.floor(game.tiers[i].purchased / CONFIG.milestone.per));
  for (const u of CONFIG.upgrades) if (game.upgrades[u.id] && u.mult['tier' + i]) m = m.times(u.mult['tier' + i]);
  return m;
}
function clickShare() {
  let share = CONFIG.clickShareBase;
  for (const u of CONFIG.upgrades) if (game.upgrades[u.id] && u.mult.clickRate) share += u.mult.clickRate;
  return share;
}
function clickFlat() {
  let p = CONFIG.clickBase;
  for (const u of CONFIG.upgrades) if (game.upgrades[u.id] && u.mult.click) p *= u.mult.click;
  return p * achievementMult();
}
function clickPower() {
  return new Decimal(clickFlat()).plus(cashPerSecond().times(clickShare()));
}
// full transparency for strategists: every number that feeds a decision
function statBreakdown() {
  return {
    upgradesMult: upgradeAllMult(),
    computeMult: computeMult(),
    modelMult: modelMult(),
    achMult: achievementMult(),
    singMult: singularityMult(),
    globalMult: globalMult(),
    clickFlat: clickFlat(),
    clickShare: clickShare(),
    computeGainFormula: 'floor((cashRun / ' + fmt(CONFIG.compute.unlockCash) + ')^' + CONFIG.compute.gainExp + ' / sqrt(1 + cycleEarned/150))',
    computeBonusRule: '+' + (CONFIG.compute.bonusPerPoint * 100) + '% ALL per compute point earned this cycle (linear to 300, then ^0.45)',
    modelReqFormula: fmt(CONFIG.models.unlockBestGain) + ' x ' + CONFIG.models.reqMult + '^(level^' + CONFIG.models.reqCurve + ') as ONE record run',
    milestoneRule: 'every ' + CONFIG.milestone.per + ' purchased: that tier x' + CONFIG.milestone.mult,
    costScaleRule: 'past ' + CONFIG.costScaling.softStart + ' purchases, costs also grow x' + CONFIG.costScaling.factor + '^(extra^' + CONFIG.costScaling.exp + ')',
    recordRule: 'a reset is a RECORD only if its gain >= 2x compute earned before it this cycle',
    shardRule: 'shards = (modelLevel - 7)^2 at Singularity',
    achEach: '+' + (game.singularity.shop.achpower ? 5 : CONFIG.achievementBonus * 100) + '% ALL per achievement',
    cascadeRule: 'each unit of a tier makes ' + CONFIG.cascadeRate + '/sec of the tier below (x its multipliers)',
  };
}
// cash needed for the next +1 compute point (at current cycle earnings)
function cashForNextComputePoint() {
  const g = computeGain();
  const dim = new Decimal(1).plus(game.compute.thisModelEarned.div(150)).sqrt();
  return new Decimal(CONFIG.compute.unlockCash).times(g.plus(1).times(dim).pow(1 / CONFIG.compute.gainExp));
}
function cashPerSecond() {
  const raw = game.tiers[0].owned.times(tierMult(0)).times(globalMult()).times(cashCrossMult());
  return midasBoost(raw);
}

/* ============================== economy ============================== */
function tierCost(i, purchased) {
  const t = CONFIG.tiers[i];
  // progressive scaling past `softStart` purchases (AD-style): in-run growth is
  // exponential, so without this any late-game requirement falls in minutes
  const extra = Math.max(0, purchased - CONFIG.costScaling.softStart);
  const scale = new Decimal(CONFIG.costScaling.factor).pow(Math.pow(extra, CONFIG.costScaling.exp));
  return new Decimal(t.baseCost).times(new Decimal(t.costMult).pow(purchased)).times(scale);
}
function tierCostN(i, purchased, n) {
  let total = new Decimal(0);
  for (let k = 0; k < n; k++) total = total.plus(tierCost(i, purchased + k));
  return total;
}
function tierMaxAffordable(i) {
  const t = game.tiers[i];
  let n = 0; let spend = new Decimal(0);
  while (n < 5000) {
    const c = tierCost(i, t.purchased + n);
    if (spend.plus(c).gt(game.cash)) break;
    spend = spend.plus(c); n++;
  }
  return n;
}
function buyTier(i, amount) {
  const t = game.tiers[i];
  const n = amount === 'max' ? tierMaxAffordable(i) : amount;
  if (n <= 0) return false;
  const cost = tierCostN(i, t.purchased, n);
  if (cost.gt(game.cash)) return false;
  game.cash = game.cash.minus(cost);
  t.purchased += n; t.owned = t.owned.plus(n);
  ui.dirtyStructure = true;
  return true;
}
function buyUpgrade(id) {
  const u = CONFIG.upgrades.find(x => x.id === id);
  if (!u || game.upgrades[id] || game.cash.lt(u.cost)) return false;
  game.cash = game.cash.minus(u.cost); game.upgrades[id] = true;
  ui.dirtyStructure = true;
  return true;
}
function buyComputeShop(id) {
  const s = CONFIG.compute.shop.find(x => x.id === id);
  if (!s || game.compute.shop[id] || game.compute.points.lt(s.cost)) return false;
  game.compute.points = game.compute.points.minus(s.cost); game.compute.shop[id] = true;
  ui.dirtyStructure = true;
  return true;
}
function buyShardShop(id) {
  const s = CONFIG.singularity.shop.find(x => x.id === id);
  if (!s || game.singularity.shop[id] || game.singularity.shards < s.cost) return false;
  game.singularity.shards -= s.cost; game.singularity.shop[id] = true;
  ui.dirtyStructure = true;
  return true;
}

/* ============================== prestige layers ============================== */
function computeGain() {
  if (game.cashThisRun.lt(CONFIG.compute.unlockCash)) return new Decimal(0);
  const raw = game.cashThisRun.div(CONFIG.compute.unlockCash).pow(CONFIG.compute.gainExp);
  // diminishing returns within a model cycle: the more compute already earned,
  // the bigger the run needed for the same gain — keeps record-hunting honest
  const dim = new Decimal(1).plus(game.compute.thisModelEarned.div(150)).sqrt();
  return Decimal.max(1, raw.div(dim).floor());
}
function doComputeReset() {
  const gain = computeGain();
  if (gain.lte(0)) return false;
  game.stats.lastComputeRunSecs = (Date.now() - game.runStartAt) / 1000;
  const earnedBefore = game.compute.thisModelEarned;
  game.compute.points = game.compute.points.plus(gain);
  game.compute.thisModelEarned = game.compute.thisModelEarned.plus(gain);
  // RECORD RUN rule: a reset only sets the model-training record if it alone
  // out-earns the whole cycle before it (2x) — farming can't inflate records
  if (gain.gte(earnedBefore.times(2)) && gain.gt(game.compute.bestGain)) game.compute.bestGain = gain;
  game.stats.computeResets += 1;
  resetCashLayer();
  if (typeof ui.sfxChord === 'function') ui.sfxChord(1);
  return true;
}
function resetCashLayer() {
  game.cash = game.compute.shop.start ? new Decimal(1e6) : new Decimal(0);
  game.cashThisRun = new Decimal(0); game.clicksThisRun = 0;
  game.tiers = freshTiers();
  game.upgrades = {};
  game.runStartAt = Date.now();
  ui.dirtyStructure = true;
}
function modelRequirement(level) {
  // superexponential (AD-style 10^(n^k)): in-run growth is exponential, so a
  // merely geometric requirement curve collapses — levels must outrun it
  return new Decimal(CONFIG.models.unlockBestGain).times(new Decimal(CONFIG.models.reqMult).pow(Math.pow(level, CONFIG.models.reqCurve)));
}
function canTrainModel() {
  return game.compute.bestGain.gte(modelRequirement(game.models.level));
}
function doModelReset() {
  if (!canTrainModel()) return false;
  game.models.level += 1;
  game.stats.modelResets += 1;
  // reset compute layer (points, cycle earnings, shop) unless made permanent
  game.compute.points = game.singularity.shop.headstart ? new Decimal(100) : new Decimal(0);
  game.compute.thisModelEarned = game.singularity.shop.headstart ? new Decimal(100) : new Decimal(0);
  game.compute.bestGain = new Decimal(0); // each model cycle demands a fresh record run
  if (!game.singularity.shop.permauto) game.compute.shop = {};
  resetCashLayer();
  if (typeof ui.sfxChord === 'function') ui.sfxChord(2);
  return true;
}
function canSingularity() { return game.models.level >= CONFIG.singularity.unlockModelLevel; }
function singularityShards() { return canSingularity() ? CONFIG.singularity.shardsFor(game.models.level) : 0; }
function doSingularity() {
  if (!canSingularity()) return false;
  game.singularity.shards += singularityShards();
  game.stats.singularities += 1;
  game.models.level = 0;
  game.compute = { points: new Decimal(0), thisModelEarned: new Decimal(0), bestGain: new Decimal(0), shop: {} };
  if (game.singularity.shop.headstart) { game.compute.points = new Decimal(100); game.compute.thisModelEarned = new Decimal(100); }
  resetCashLayer();
  if (typeof ui.sfxChord === 'function') ui.sfxChord(3);
  return true;
}

/* ============================== simulation ============================== */
function addCash(x) {
  const d = x instanceof Decimal ? x : new Decimal(x);
  game.cash = game.cash.plus(d);
  game.lifetimeCash = game.lifetimeCash.plus(d);
  game.cashThisRun = game.cashThisRun.plus(d);
}
function tick(dt) {
  // cascade: tier i produces tier i-1; tier 0 produces cash
  const gm = globalMult();
  const gains = CONFIG.tiers.map(() => new Decimal(0));
  let cashGain = new Decimal(0);
  for (let i = 0; i < CONFIG.tiers.length; i++) {
    const owned = game.tiers[i].owned;
    if (owned.lte(0)) continue;
    if (i === 0) {
      // routed through cashPerSecond() so MIDAS/crossover boosts apply identically
      // here and in the displayed rate — no drift between the two.
      cashGain = cashGain.plus(cashPerSecond().times(dt));
    } else {
      const produced = owned.times(tierMult(i)).times(gm).times(dt);
      gains[i - 1] = gains[i - 1].plus(produced.times(CONFIG.cascadeRate)); // higher tiers feed slowly — AD pacing, not instant blowup
    }
  }
  for (let i = 0; i < gains.length; i++) game.tiers[i].owned = game.tiers[i].owned.plus(gains[i]);
  addCash(cashGain);
  tickBlockchain(dt);
  game.stats.playtime += dt;
  // autobuyers (once per ~second, cheap)
  autoTimer += dt;
  if (autoTimer >= 1) {
    autoTimer = 0;
    if (game.compute.shop.auto2) { for (let i = CONFIG.tiers.length - 1; i >= 0; i--) buyTier(i, 'max'); }
    else if (game.compute.shop.auto1) { for (let i = 2; i >= 0; i--) buyTier(i, 'max'); }
    if (game.compute.shop.autoup) for (const u of CONFIG.upgrades) buyUpgrade(u.id);
    // OPUS-9: auto-prestige compute on record-caliber runs, auto-train models when possible
    if (isAgentEquipped('opus')) {
      const earnedBefore = game.compute.thisModelEarned;
      const gain = computeGain();
      if (gain.gt(0) && gain.gte(earnedBefore.times(2))) doComputeReset();
      if (canTrainModel()) doModelReset();
    }
  }
}
let autoTimer = 0;

function manualClick(event) {
  const gain = clickPower();
  addCash(gain);
  game.totalClicks += 1; game.clicksThisRun += 1;
  if (typeof ui.clickFeedback === 'function') ui.clickFeedback(gain, event);
  if (typeof ui.sfxBlip === 'function') ui.sfxBlip();
}

/* ============================== AGI agents ============================== */
function isAgentEquipped(id) { return game.agiAgents.equipped.includes(id); }
function canUnlockAgiAgents() {
  return !game.agiAgents.unlocked
    && game.stats.singularities >= CONFIG.agiAgents.unlockSingularities
    && game.singularity.shards >= CONFIG.agiAgents.unlockShards;
}
function unlockAgiAgents() {
  if (!canUnlockAgiAgents()) return false;
  game.singularity.shards -= CONFIG.agiAgents.unlockShards;
  game.agiAgents.unlocked = true;
  ui.dirtyStructure = true;
  return true;
}
function buyAgiAgent(id) {
  if (!game.agiAgents.unlocked) return false;
  const a = CONFIG.agiAgents.list.find(x => x.id === id);
  if (!a || game.agiAgents.owned[id] || game.singularity.shards < a.cost) return false;
  game.singularity.shards -= a.cost;
  game.agiAgents.owned[id] = true;
  ui.dirtyStructure = true;
  return true;
}
function equipAgiAgent(id) {
  if (!game.agiAgents.owned[id] || isAgentEquipped(id)) return false;
  if (game.agiAgents.equipped.length >= CONFIG.agiAgents.slots) return false;
  game.agiAgents.equipped.push(id);
  ui.dirtyStructure = true;
  return true;
}
function unequipAgiAgent(id) {
  const idx = game.agiAgents.equipped.indexOf(id);
  if (idx === -1) return false;
  game.agiAgents.equipped.splice(idx, 1);
  ui.dirtyStructure = true;
  return true;
}
// MIDAS: ALL cash production ^1.05 then x1e6 — applied to the rate, not per-tick
// deltas, so the boost doesn't drift with tick size (pow is superlinear).
function midasBoost(rate) {
  return isAgentEquipped('midas') ? rate.pow(1.05).times(1e6) : rate;
}

/* ============================== tokenize + blockchain ============================== */
function canTokenize() {
  return !game.tokenize.unlocked && game.cashThisRun.gte(new Decimal(CONFIG.tokenize.unlockCash));
}
function doTokenize() {
  if (!canTokenize()) return false;
  game.tokenize.unlocked = true;
  // free first Node Runner — income flows immediately, no clicking in this world
  game.blockchain.validators[0].owned = new Decimal(1);
  game.blockchain.validators[0].purchased = 1;
  ui.dirtyStructure = true;
  return true;
}
function contractCostReduction() {
  let r = new Decimal(1);
  for (const c of CONFIG.blockchain.contracts) if (game.blockchain.contracts[c.id] && c.mult.costReduction) r = r.times(1 - c.mult.costReduction);
  return r;
}
function validatorAllMult() {
  let m = new Decimal(1);
  for (const c of CONFIG.blockchain.contracts) if (game.blockchain.contracts[c.id] && c.mult.allValidators) m = m.times(c.mult.allValidators);
  return m;
}
// ORACLE (token gain x25) + any token-crossover contracts, applied only to the
// final Node Runner -> Token conversion, not the inter-validator cascade.
function tokenCrossMult() {
  let m = new Decimal(1);
  for (const c of CONFIG.blockchain.contracts) if (game.blockchain.contracts[c.id] && c.mult.tokenAll) m = m.times(c.mult.tokenAll);
  if (isAgentEquipped('oracle')) m = m.times(25);
  return m;
}
// Bridge Protocol et al: contracts that push the OTHER direction, into cash production.
function cashCrossMult() {
  let m = new Decimal(1);
  for (const c of CONFIG.blockchain.contracts) if (game.blockchain.contracts[c.id] && c.mult.cashCross) m = m.times(c.mult.cashCross);
  return m;
}
function tokenPerSecond() {
  if (!game.tokenize.unlocked) return new Decimal(0);
  const owned = game.blockchain.validators[0].owned;
  const rate = owned.times(validatorAllMult()).times(CONFIG.blockchain.nodeRunnerTokenRate);
  return rate.times(tokenCrossMult());
}
function validatorCost(i, purchased) {
  const v = CONFIG.blockchain.validators[i];
  return new Decimal(v.baseCost).times(new Decimal(v.costMult).pow(purchased)).times(contractCostReduction());
}
function validatorCostN(i, purchased, n) {
  let total = new Decimal(0);
  for (let k = 0; k < n; k++) total = total.plus(validatorCost(i, purchased + k));
  return total;
}
function validatorWallet(i) {
  return CONFIG.blockchain.validators[i].currency === 'token' ? game.blockchain.tokens : game.cash;
}
function validatorMaxAffordable(i) {
  const rec = game.blockchain.validators[i];
  const wallet = validatorWallet(i);
  let n = 0; let spend = new Decimal(0);
  while (n < 5000) {
    const c = validatorCost(i, rec.purchased + n);
    if (spend.plus(c).gt(wallet)) break;
    spend = spend.plus(c); n++;
  }
  return n;
}
function buyValidator(i, amount) {
  const rec = game.blockchain.validators[i];
  const n = amount === 'max' ? validatorMaxAffordable(i) : amount;
  if (n <= 0) return false;
  const cost = validatorCostN(i, rec.purchased, n);
  const isToken = CONFIG.blockchain.validators[i].currency === 'token';
  const wallet = isToken ? game.blockchain.tokens : game.cash;
  if (cost.gt(wallet)) return false;
  if (isToken) game.blockchain.tokens = game.blockchain.tokens.minus(cost);
  else game.cash = game.cash.minus(cost);
  rec.purchased += n; rec.owned = rec.owned.plus(n);
  ui.dirtyStructure = true;
  return true;
}
function buyContract(id) {
  const c = CONFIG.blockchain.contracts.find(x => x.id === id);
  if (!c || game.blockchain.contracts[id] || game.blockchain.tokens.lt(c.cost)) return false;
  game.blockchain.tokens = game.blockchain.tokens.minus(c.cost);
  game.blockchain.contracts[id] = true;
  ui.dirtyStructure = true;
  return true;
}
function tickBlockchain(dt) {
  if (!game.tokenize.unlocked) return;
  const vAllMult = validatorAllMult();
  const gains = CONFIG.blockchain.validators.map(() => new Decimal(0));
  const tokenGain = tokenPerSecond().times(dt); // tier 0: Node Runner -> Tokens (ORACLE applied here)
  for (let i = 1; i < CONFIG.blockchain.validators.length; i++) {
    const owned = game.blockchain.validators[i].owned;
    if (owned.lte(0)) continue;
    const produced = owned.times(vAllMult).times(dt);
    gains[i - 1] = gains[i - 1].plus(produced.times(CONFIG.blockchain.validatorCascadeRate));
  }
  for (let i = 0; i < gains.length; i++) game.blockchain.validators[i].owned = game.blockchain.validators[i].owned.plus(gains[i]);
  game.blockchain.tokens = game.blockchain.tokens.plus(tokenGain);
  game.blockchain.lifetimeTokens = game.blockchain.lifetimeTokens.plus(tokenGain);
}

/* ============================== achievements ============================== */
function checkAchievements() {
  for (const a of CONFIG.achievements) {
    if (!game.achievements[a.id] && a.check(game)) {
      game.achievements[a.id] = Date.now();
      if (typeof ui.toast === 'function') ui.toast(`🏆 ${a.name}`, a.desc);
      if (typeof ui.sfxChime === 'function') ui.sfxChime();
      ui.dirtyStructure = true;
    }
  }
}

/* ============================== save / load ============================== */
// Decimal instances would otherwise be flattened by their own lossy toJSON()
// (a plain toNumber()) — pre-convert to strings ourselves before JSON.stringify.
function buildSave() {
  const g = game;
  const snapshot = {
    ...g,
    cash: g.cash.toString(),
    lifetimeCash: g.lifetimeCash.toString(),
    cashThisRun: g.cashThisRun.toString(),
    tiers: g.tiers.map(t => ({ ...t, owned: t.owned.toString() })),
    compute: {
      ...g.compute,
      points: g.compute.points.toString(),
      thisModelEarned: g.compute.thisModelEarned.toString(),
      bestGain: g.compute.bestGain.toString(),
    },
    blockchain: {
      ...g.blockchain,
      tokens: g.blockchain.tokens.toString(),
      lifetimeTokens: g.blockchain.lifetimeTokens.toString(),
      validators: g.blockchain.validators.map(v => ({ ...v, owned: v.owned.toString() })),
    },
  };
  return { version: CONFIG.saveVersion, lastSaveTime: Date.now(), game: snapshot };
}
function save() {
  game.lastSaveTime = Date.now();
  try { localStorage.setItem(CONFIG.saveKey, JSON.stringify(buildSave())); } catch (e) { /* private mode */ }
}
function migrateSave(data) {
  // v1 -> v2: added `settings` (sound toggle) — old saves default to sound on
  if (data.version === 1) { data.version = 2; }
  // v2 -> v3: cash/compute fields moved from plain numbers to Decimal (break_infinity.js);
  // no structural change needed here — applySave() parses either representation
  // via `new Decimal(value)`, which accepts both raw numbers and serialized strings.
  if (data.version === 2) { data.version = 3; }
  // v3 -> v4: added tokenize/agiAgents/blockchain — no structural change needed,
  // applySave()'s fresh-state merge fills in the new nested objects for saves
  // that predate them, so nothing existing is lost.
  if (data.version === 3) { data.version = 4; }
  return data;
}
function applySave(data) {
  if (!data || typeof data !== 'object' || !data.game) return false;
  while (data.version !== CONFIG.saveVersion) {
    const beforeVersion = data.version;
    data = migrateSave(data);
    if (data.version === beforeVersion) return false; // no migration path
  }
  const fresh = freshState();
  // structured merge: unknown/missing fields fall back to fresh defaults
  game = { ...fresh, ...data.game };
  game.compute = { ...fresh.compute, ...data.game.compute };
  game.models = { ...fresh.models, ...data.game.models };
  game.singularity = { ...fresh.singularity, ...data.game.singularity };
  game.stats = { ...fresh.stats, ...data.game.stats };
  game.settings = { ...fresh.settings, ...data.game.settings };
  game.tiers = freshTiers().map((t, i) => ({ ...t, ...(data.game.tiers && data.game.tiers[i]) }));
  game.tokenize = { ...fresh.tokenize, ...data.game.tokenize };
  game.agiAgents = { ...fresh.agiAgents, ...data.game.agiAgents };
  game.blockchain = { ...fresh.blockchain, ...data.game.blockchain };
  game.blockchain.validators = fresh.blockchain.validators.map((v, i) =>
    ({ ...v, ...(data.game.blockchain && data.game.blockchain.validators && data.game.blockchain.validators[i]) }));
  // Decimal fields: parse from string (current saves) or number (pre-Decimal saves) alike
  game.cash = new Decimal(game.cash || 0);
  game.lifetimeCash = new Decimal(game.lifetimeCash || 0);
  game.cashThisRun = new Decimal(game.cashThisRun || 0);
  game.tiers.forEach(t => { t.owned = new Decimal(t.owned || 0); });
  game.compute.points = new Decimal(game.compute.points || 0);
  game.compute.thisModelEarned = new Decimal(game.compute.thisModelEarned || 0);
  game.compute.bestGain = new Decimal(game.compute.bestGain || 0);
  game.blockchain.tokens = new Decimal(game.blockchain.tokens || 0);
  game.blockchain.lifetimeTokens = new Decimal(game.blockchain.lifetimeTokens || 0);
  game.blockchain.validators.forEach(v => { v.owned = new Decimal(v.owned || 0); });
  return true;
}
function load() {
  let raw;
  try { raw = localStorage.getItem(CONFIG.saveKey); } catch (e) { return null; }
  if (!raw) return null;
  let data;
  try { data = JSON.parse(raw); } catch (e) { return null; } // corrupt: start fresh, never crash
  if (!applySave(data)) return null;
  // offline progress
  const elapsed = Math.min((Date.now() - (data.lastSaveTime || Date.now())) / 1000, CONFIG.offline.capSecs);
  if (elapsed >= CONFIG.offline.minSecs) {
    const before = game.cash;
    const step = 1;
    for (let t = 0; t < elapsed; t += step) tick(step);
    return { offlineSecs: elapsed, offlineCash: game.cash.minus(before) };
  }
  return { offlineSecs: 0, offlineCash: 0 };
}
function exportSave() { return btoa(unescape(encodeURIComponent(JSON.stringify(buildSave())))); }
function importSave(str) {
  try { return applySave(JSON.parse(decodeURIComponent(escape(atob(str.trim()))))); }
  catch (e) { return false; }
}
function hardReset() { game = freshState(); try { localStorage.removeItem(CONFIG.saveKey); } catch (e) {} ui.dirtyStructure = true; }
function toggleSound() {
  game.settings.soundOn = !game.settings.soundOn;
  if (typeof ui.onSoundChange === 'function') ui.onSoundChange(game.settings.soundOn);
  return game.settings.soundOn;
}

/* ============================== formatting ============================== */
const SUFFIX = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
function fmtPlain(n) {
  if (!isFinite(n) || n < 0) return '0';
  if (n < 1000) return n < 100 && !Number.isInteger(n) ? n.toFixed(1) : String(Math.floor(n));
  const tier = Math.floor(Math.log10(n) / 3);
  if (tier < SUFFIX.length) return (n / Math.pow(10, tier * 3)).toFixed(2) + SUFFIX[tier];
  const [m, e] = n.toExponential(2).split('e');
  return `${m}e${parseInt(e, 10)}`;
}
function fmt(n) {
  if (!(n instanceof Decimal)) return fmtPlain(n);
  if (isNaN(n.m) || n.lt(0)) return '0'; // break_infinity has no true Infinity state, only NaN
  if (n.lt(1e18)) return fmtPlain(n.toNumber()); // safely representable as a double below this
  let m = Math.round(n.m * 100) / 100;
  let e = n.e;
  if (m >= 10) { m /= 10; e += 1; } // carry: mantissa rounded up to 10.00
  return m.toFixed(2) + 'e' + e;
}
const fmtCash = n => '$' + fmt(n);
const fmtTok = n => '⬡ ' + fmt(n);

/* ============================== ui bridge ============================== */
// The DOM layer (ui.js inlined in index.html) assigns onto this object.
const ui = {
  dirtyStructure: true, toast: null, clickFeedback: null, onSoundChange: null,
  sfxBlip: null, sfxTick: null, sfxChime: null, sfxChord: null,
};

/* ============================== next goal ============================== */
// Each goal carries an `action` the UI executes on click — a goal you can see
// but not act on breaks player expectations. `ready` = clicking completes it
// right now; otherwise clicking navigates to where progress happens.
function nextGoal() {
  if (game.tiers[0].purchased < 1) {
    const can = game.cash.gte(tierCost(0, 0));
    return { text: 'Deploy your first Chatbot', hint: fmtCash(tierCost(0, 0)),
             action: 'buyTier:0', ready: can };
  }
  const lockedTier = CONFIG.tiers.findIndex((t, i) => i > 0 && game.tiers[i].purchased < 1 && game.tiers[i - 1].purchased >= 1);
  if (game.cashThisRun.gte(CONFIG.compute.unlockCash)) {
    if (canSingularity()) return { text: 'The Singularity awaits', hint: `+${fmt(singularityShards())} shards`, action: 'sing', ready: true };
    if (canTrainModel()) return { text: `Train Model v${game.models.level + 1}`, hint: 'resets compute layer', action: 'model', ready: true };
    return { text: 'Rent Compute (prestige)', hint: `+${fmt(computeGain())} compute`, action: 'compute', ready: true };
  }
  if (game.stats.computeResets > 0 && !canTrainModel())
    return { text: `Toward Model v${game.models.level + 1}`, hint: `best reset ${fmt(game.compute.bestGain)}/${fmt(modelRequirement(game.models.level))} — one BIG run`,
             action: 'tab:models', ready: false };
  if (lockedTier !== -1) {
    const can = game.cash.gte(tierCost(lockedTier, 0));
    return { text: `Unlock ${CONFIG.tiers[lockedTier].name}`, hint: fmtCash(CONFIG.tiers[lockedTier].baseCost),
             action: 'buyTier:' + lockedTier, ready: can };
  }
  return { text: 'Toward Compute prestige', hint: `${fmtCash(game.cashThisRun)}/${fmtCash(CONFIG.compute.unlockCash)}`,
           action: 'tab:compute', ready: false };
}

/* ============================== transparency helpers ============================== */
// Cash needed this run for a compute gain of g, inverting the gain formula
// (uses the CURRENT cycle's diminishing factor; gain is floored, so treat as ≥).
function cashForComputeGain(g) {
  const gd = g instanceof Decimal ? g : new Decimal(g);
  const dim = new Decimal(1).plus(game.compute.thisModelEarned.div(150)).sqrt();
  return new Decimal(CONFIG.compute.unlockCash).times(gd.times(dim).pow(1 / CONFIG.compute.gainExp));
}
// Per-unit output of tier i per second, with every multiplier applied.
// Tiers above 0 produce at cascadeRate — omitting it overstated output x25.
function tierUnitOutput(i) {
  const base = tierMult(i).times(globalMult());
  return i === 0 ? base : base.times(CONFIG.cascadeRate);
}
// Same pattern, for the Blockchain world: per-unit output of validator i per
// second. Validator 0 (Node Runner) converts straight to Tokens (ORACLE applies
// there); tiers above cascade into the validator below at validatorCascadeRate.
function validatorUnitOutput(i) {
  const base = validatorAllMult();
  return i === 0
    ? base.times(CONFIG.blockchain.nodeRunnerTokenRate).times(tokenCrossMult())
    : base.times(CONFIG.blockchain.validatorCascadeRate);
}
// Every factor of the global multiplier, separated for display.
function multBreakdown() {
  return {
    upgrades: upgradeAllMult(),
    compute: computeMult(),
    models: modelMult(),
    achievements: achievementMult(),
    singularity: singularityMult(),
    total: globalMult(),
  };
}

/* exported for the page + tests */
if (typeof module !== 'undefined') module.exports = {
  Decimal, CONFIG, get game() { return game; }, freshState, tick, manualClick, buyTier, buyUpgrade,
  buyComputeShop, buyShardShop, doComputeReset, doModelReset, doSingularity, computeGain,
  canTrainModel, canSingularity, singularityShards, modelRequirement, cashPerSecond, clickPower,
  checkAchievements, save, load, applySave, buildSave, exportSave, importSave, hardReset, toggleSound, fmt, fmtCash, fmtTok, nextGoal,
  tierCost, tierCostN, tierMaxAffordable, globalMult, tierMult, ui, addCash,
  statBreakdown, cashForNextComputePoint, clickShare, clickFlat,
  cashForComputeGain, tierUnitOutput, multBreakdown,
  isAgentEquipped, canUnlockAgiAgents, unlockAgiAgents, buyAgiAgent, equipAgiAgent, unequipAgiAgent,
  canTokenize, doTokenize, tokenPerSecond, validatorCost, validatorCostN, validatorMaxAffordable,
  buyValidator, buyContract, validatorAllMult, tokenCrossMult, cashCrossMult, contractCostReduction,
  validatorUnitOutput,
  _setGame: g => { game = g; },
};
