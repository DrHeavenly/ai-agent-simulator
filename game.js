'use strict';
/* ============================================================================
   AI AGENT SIMULATOR — incremental. 4 layers: Cash → Compute → Models → Singularity.
   Architecture: CONFIG holds every balance number; simulation and rendering are
   separated; DOM builds once per unlock and updates in place (no innerHTML in
   hot paths — lesson learned from Manuscript's eaten-clicks bug).
============================================================================ */
const CONFIG = {
  saveKey: 'ai_agent_sim_v1',
  saveVersion: 2,
  tickRate: 10,
  autosaveMs: 10000,
  numberCap: 1e300,
  clickBase: 1, // $ per manual prompt
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
    { id: 'prompt', name: 'Prompt Library',   desc: 'Clicking x10',             cost: 2e4,   mult: { click: 10 } },
    { id: 'gpu2',   name: 'Datacenter Racks', desc: 'All agents x3',            cost: 5e6,   mult: { all: 3 } },
    { id: 'api',    name: 'API Reselling',    desc: 'Chatbots x5',              cost: 8e7,   mult: { tier0: 5 } },
    { id: 'gpu3',   name: 'Custom Silicon',   desc: 'All agents x4',            cost: 1e10,  mult: { all: 4 } },
    { id: 'viral',  name: 'Viral Demo',       desc: 'Clicking earns 2% of $/s', cost: 5e11,  mult: { clickRate: 0.02 } },
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
    { id: 'firstDollar', name: 'Seed Round',        desc: 'Earn your first dollar',          check: g => g.lifetimeCash >= 1 },
    { id: 'cash1e3',     name: 'Ramen Profitable',  desc: 'Earn $1,000 lifetime',            check: g => g.lifetimeCash >= 1e3 },
    { id: 'cash1e6',     name: 'Unicorn Larva',     desc: 'Earn $1M lifetime',               check: g => g.lifetimeCash >= 1e6 },
    { id: 'cash1e9',     name: 'Decacorn',          desc: 'Earn $1B lifetime',               check: g => g.lifetimeCash >= 1e9 },
    { id: 'cash1e12',    name: 'GDP of a Nation',   desc: 'Earn $1T lifetime',               check: g => g.lifetimeCash >= 1e12 },
    { id: 'cash1e15',    name: 'Post-Scarcity',     desc: 'Earn $1Q lifetime',               check: g => g.lifetimeCash >= 1e15 },
    { id: 'cash1e21',    name: 'Money Singularity', desc: 'Earn $1e21 lifetime',             check: g => g.lifetimeCash >= 1e21 },
    { id: 'tier0',       name: 'Hello World',       desc: 'Deploy a Chatbot',                check: g => g.tiers[0].purchased >= 1 },
    { id: 'tier2',       name: 'It Codes Itself',   desc: 'Deploy a Coder Agent',            check: g => g.tiers[2].purchased >= 1 },
    { id: 'tier5',       name: 'The Swarm Awakens', desc: 'Deploy an Agent Swarm',           check: g => g.tiers[5].purchased >= 1 },
    { id: 'tier0x100',   name: 'Call Center',       desc: 'Own 100 purchased Chatbots',      check: g => g.tiers[0].purchased >= 100 },
    { id: 'allTiers25',  name: 'Org Chart',         desc: '25+ purchased of every tier',     check: g => g.tiers.every(t => t.purchased >= 25) },
    { id: 'clicks100',   name: 'Prompt Engineer',   desc: 'Run 100 manual prompts',          check: g => g.totalClicks >= 100 },
    { id: 'clicks2500',  name: 'Carpal Tunnel',     desc: 'Run 2,500 manual prompts',        check: g => g.totalClicks >= 2500 },
    { id: 'rate1e6',     name: 'Printing Money',    desc: 'Exceed $1M/sec',                  check: g => cashPerSecond() >= 1e6 },
    { id: 'rate1e12',    name: 'Firehose',          desc: 'Exceed $1T/sec',                  check: g => cashPerSecond() >= 1e12 },
    { id: 'compute1',    name: 'First Cluster',     desc: 'Prestige for Compute',            check: g => g.stats.computeResets >= 1 },
    { id: 'compute10',   name: 'Serial Renter',     desc: 'Prestige for Compute 10 times',   check: g => g.stats.computeResets >= 10 },
    { id: 'compute1e3',  name: 'Hyperscaler',       desc: 'Earn 1,000 total compute (cycle)',check: g => g.compute.thisModelEarned >= 1e3 },
    { id: 'shopAll',     name: 'Fully Automated',   desc: 'Own every compute upgrade at once',check: g => CONFIG.compute.shop.every(s => g.compute.shop[s.id]) },
    { id: 'model1',      name: 'Foundation v1',     desc: 'Train your first Model',          check: g => g.models.level >= 1 },
    { id: 'model4',      name: 'Frontier Lab',      desc: 'Reach Model v4',                  check: g => g.models.level >= 4 },
    { id: 'model8',      name: 'AGI Rumors',        desc: 'Reach Model v8',                  check: g => g.models.level >= 8 },
    { id: 'sing1',       name: 'The Event',         desc: 'Trigger the Singularity',         check: g => g.stats.singularities >= 1 },
    { id: 'sing3',       name: 'Recursive Self-Improvement', desc: '3 Singularities',        check: g => g.stats.singularities >= 3 },
    { id: 'shardShopAll',name: 'Beyond the Curve',  desc: 'Own every Singularity upgrade',   check: g => CONFIG.singularity.shop.every(s => g.singularity.shop[s.id]) },
    { id: 'play1h',      name: 'Shift One',         desc: 'Play for 1 hour',                 check: g => g.stats.playtime >= 3600 },
    { id: 'play10h',     name: 'Overtime',          desc: 'Play for 10 hours',               check: g => g.stats.playtime >= 36000 },
    { id: 'noClick',     name: 'Hands Off',         desc: 'Reach $1e9 in a run with <10 clicks', check: g => g.cashThisRun >= 1e9 && g.clicksThisRun < 10 },
    { id: 'fastCompute', name: 'Speedrun',          desc: 'Compute prestige within 5 min of a run start', check: g => g.stats.lastComputeRunSecs !== null && g.stats.lastComputeRunSecs <= 300 },
  ],
  offline: { capSecs: 8 * 3600, minSecs: 10 },
};

/* ============================== state ============================== */
const clampN = n => (n > CONFIG.numberCap ? CONFIG.numberCap : n);
function freshTiers() { return CONFIG.tiers.map(() => ({ owned: 0, purchased: 0 })); }
function freshState() {
  return {
    cash: 0, lifetimeCash: 0, cashThisRun: 0,
    tiers: freshTiers(),
    upgrades: {},               // id -> true (cash layer)
    totalClicks: 0, clicksThisRun: 0,
    runStartAt: Date.now(),
    compute: { points: 0, thisModelEarned: 0, bestGain: 0, shop: {} },
    models: { level: 0 },
    singularity: { shards: 0, shop: {} },
    achievements: {},
    stats: { computeResets: 0, modelResets: 0, singularities: 0, playtime: 0, lastComputeRunSecs: null },
    settings: { soundOn: true },
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
  return Math.pow(per, game.models.level);
}
function singularityMult() {
  return game.singularity.shop.timewarp ? Math.pow(3, game.stats.singularities) : 1;
}
function computeMult() {
  // softcap: linear to 600 points, then ^0.55 — stops the compute↔cash loop
  // from self-accelerating through the whole Model layer (sim-tuned)
  const e = game.compute.thisModelEarned;
  const eff = e <= 300 ? e : 300 + Math.pow(e - 300, 0.45);
  return 1 + CONFIG.compute.bonusPerPoint * eff;
}
function upgradeAllMult() {
  let m = 1;
  for (const u of CONFIG.upgrades) if (game.upgrades[u.id] && u.mult.all) m *= u.mult.all;
  if (game.compute.shop.boost) m *= 5;
  return m;
}
function globalMult() {
  return clampN(upgradeAllMult() * computeMult() * modelMult() * achievementMult() * singularityMult());
}
function tierMult(i) {
  let m = Math.pow(CONFIG.milestone.mult, Math.floor(game.tiers[i].purchased / CONFIG.milestone.per));
  for (const u of CONFIG.upgrades) if (game.upgrades[u.id] && u.mult['tier' + i]) m *= u.mult['tier' + i];
  return m;
}
function clickPower() {
  let p = CONFIG.clickBase;
  for (const u of CONFIG.upgrades) if (game.upgrades[u.id] && u.mult.click) p *= u.mult.click;
  let bonus = 0;
  for (const u of CONFIG.upgrades) if (game.upgrades[u.id] && u.mult.clickRate) bonus += u.mult.clickRate * cashPerSecond();
  return p * achievementMult() + bonus;
}
function cashPerSecond() {
  return clampN(game.tiers[0].owned * tierMult(0) * globalMult());
}

/* ============================== economy ============================== */
function tierCost(i, purchased) {
  const t = CONFIG.tiers[i];
  // progressive scaling past `softStart` purchases (AD-style): in-run growth is
  // exponential, so without this any late-game requirement falls in minutes
  const extra = Math.max(0, purchased - CONFIG.costScaling.softStart);
  const scale = Math.pow(CONFIG.costScaling.factor, Math.pow(extra, CONFIG.costScaling.exp));
  return t.baseCost * Math.pow(t.costMult, purchased) * scale;
}
function tierCostN(i, purchased, n) {
  let total = 0;
  for (let k = 0; k < n; k++) total += tierCost(i, purchased + k);
  return total;
}
function tierMaxAffordable(i) {
  const t = game.tiers[i];
  let n = 0, spend = 0;
  while (n < 5000) {
    const c = tierCost(i, t.purchased + n);
    if (spend + c > game.cash) break;
    spend += c; n++;
  }
  return n;
}
function buyTier(i, amount) {
  const t = game.tiers[i];
  const n = amount === 'max' ? tierMaxAffordable(i) : amount;
  if (n <= 0) return false;
  const cost = tierCostN(i, t.purchased, n);
  if (cost > game.cash) return false;
  game.cash -= cost;
  t.purchased += n; t.owned += n;
  ui.dirtyStructure = true;
  return true;
}
function buyUpgrade(id) {
  const u = CONFIG.upgrades.find(x => x.id === id);
  if (!u || game.upgrades[id] || game.cash < u.cost) return false;
  game.cash -= u.cost; game.upgrades[id] = true;
  ui.dirtyStructure = true;
  return true;
}
function buyComputeShop(id) {
  const s = CONFIG.compute.shop.find(x => x.id === id);
  if (!s || game.compute.shop[id] || game.compute.points < s.cost) return false;
  game.compute.points -= s.cost; game.compute.shop[id] = true;
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
  if (game.cashThisRun < CONFIG.compute.unlockCash) return 0;
  const raw = Math.pow(game.cashThisRun / CONFIG.compute.unlockCash, CONFIG.compute.gainExp);
  // diminishing returns within a model cycle: the more compute already earned,
  // the bigger the run needed for the same gain — keeps record-hunting honest
  const dim = Math.sqrt(1 + game.compute.thisModelEarned / 150);
  return Math.max(1, Math.floor(raw / dim));
}
function doComputeReset() {
  const gain = computeGain();
  if (gain <= 0) return false;
  game.stats.lastComputeRunSecs = (Date.now() - game.runStartAt) / 1000;
  const earnedBefore = game.compute.thisModelEarned;
  game.compute.points += gain;
  game.compute.thisModelEarned += gain;
  // RECORD RUN rule: a reset only sets the model-training record if it alone
  // out-earns the whole cycle before it (2x) — farming can't inflate records
  if (gain >= 2 * earnedBefore && gain > game.compute.bestGain) game.compute.bestGain = gain;
  game.stats.computeResets += 1;
  resetCashLayer();
  if (typeof ui.sfxChord === 'function') ui.sfxChord(1);
  return true;
}
function resetCashLayer() {
  game.cash = game.compute.shop.start ? 1e6 : 0;
  game.cashThisRun = 0; game.clicksThisRun = 0;
  game.tiers = freshTiers();
  game.upgrades = {};
  game.runStartAt = Date.now();
  ui.dirtyStructure = true;
}
function modelRequirement(level) {
  // superexponential (AD-style 10^(n^k)): in-run growth is exponential, so a
  // merely geometric requirement curve collapses — levels must outrun it
  return CONFIG.models.unlockBestGain * Math.pow(CONFIG.models.reqMult, Math.pow(level, CONFIG.models.reqCurve));
}
function canTrainModel() {
  return game.compute.bestGain >= modelRequirement(game.models.level);
}
function doModelReset() {
  if (!canTrainModel()) return false;
  game.models.level += 1;
  game.stats.modelResets += 1;
  // reset compute layer (points, cycle earnings, shop) unless made permanent
  game.compute.points = game.singularity.shop.headstart ? 100 : 0;
  game.compute.thisModelEarned = game.singularity.shop.headstart ? 100 : 0;
  game.compute.bestGain = 0; // each model cycle demands a fresh record run
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
  game.compute = { points: 0, thisModelEarned: 0, bestGain: 0, shop: {} };
  if (game.singularity.shop.headstart) { game.compute.points = 100; game.compute.thisModelEarned = 100; }
  resetCashLayer();
  if (typeof ui.sfxChord === 'function') ui.sfxChord(3);
  return true;
}

/* ============================== simulation ============================== */
function addCash(x) {
  game.cash = clampN(game.cash + x);
  game.lifetimeCash = clampN(game.lifetimeCash + x);
  game.cashThisRun = clampN(game.cashThisRun + x);
}
function tick(dt) {
  // cascade: tier i produces tier i-1; tier 0 produces cash
  const gm = globalMult();
  const gains = new Array(CONFIG.tiers.length).fill(0);
  let cashGain = 0;
  for (let i = 0; i < CONFIG.tiers.length; i++) {
    const owned = game.tiers[i].owned;
    if (owned <= 0) continue;
    const produced = owned * tierMult(i) * gm * dt;
    if (i === 0) cashGain += produced;
    else gains[i - 1] += produced * 0.04; // higher tiers feed slowly — AD pacing, not instant blowup
  }
  for (let i = 0; i < gains.length; i++) game.tiers[i].owned = clampN(game.tiers[i].owned + gains[i]);
  addCash(cashGain);
  game.stats.playtime += dt;
  // autobuyers (once per ~second, cheap)
  autoTimer += dt;
  if (autoTimer >= 1) {
    autoTimer = 0;
    if (game.compute.shop.auto2) { for (let i = CONFIG.tiers.length - 1; i >= 0; i--) buyTier(i, 'max'); }
    else if (game.compute.shop.auto1) { for (let i = 2; i >= 0; i--) buyTier(i, 'max'); }
    if (game.compute.shop.autoup) for (const u of CONFIG.upgrades) buyUpgrade(u.id);
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
function buildSave() {
  return { version: CONFIG.saveVersion, lastSaveTime: Date.now(), game };
}
function save() {
  game.lastSaveTime = Date.now();
  try { localStorage.setItem(CONFIG.saveKey, JSON.stringify(buildSave())); } catch (e) { /* private mode */ }
}
function migrateSave(data) {
  // v1 -> v2: added `settings` (sound toggle) — old saves default to sound on
  if (data.version === 1) { data.version = 2; }
  return data;
}
function applySave(data) {
  if (!data || typeof data !== 'object' || !data.game) return false;
  if (data.version !== CONFIG.saveVersion) data = migrateSave(data);
  if (data.version !== CONFIG.saveVersion) return false;
  const fresh = freshState();
  // structured merge: unknown/missing fields fall back to fresh defaults
  game = { ...fresh, ...data.game };
  game.compute = { ...fresh.compute, ...data.game.compute };
  game.models = { ...fresh.models, ...data.game.models };
  game.singularity = { ...fresh.singularity, ...data.game.singularity };
  game.stats = { ...fresh.stats, ...data.game.stats };
  game.settings = { ...fresh.settings, ...data.game.settings };
  game.tiers = freshTiers().map((t, i) => ({ ...t, ...(data.game.tiers && data.game.tiers[i]) }));
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
    return { offlineSecs: elapsed, offlineCash: game.cash - before };
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
function fmt(n) {
  if (!isFinite(n) || n < 0) return '0';
  if (n < 1000) return n < 100 && !Number.isInteger(n) ? n.toFixed(1) : String(Math.floor(n));
  const tier = Math.floor(Math.log10(n) / 3);
  if (tier < SUFFIX.length) return (n / Math.pow(10, tier * 3)).toFixed(2) + SUFFIX[tier];
  const [m, e] = n.toExponential(2).split('e');
  return `${m}e${parseInt(e, 10)}`;
}
const fmtCash = n => '$' + fmt(n);

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
    const can = game.cash >= tierCost(0, 0);
    return { text: 'Deploy your first Chatbot', hint: fmtCash(tierCost(0, 0)),
             action: 'buyTier:0', ready: can };
  }
  const lockedTier = CONFIG.tiers.findIndex((t, i) => i > 0 && game.tiers[i].purchased < 1 && game.tiers[i - 1].purchased >= 1);
  if (game.cashThisRun >= CONFIG.compute.unlockCash) {
    if (canSingularity()) return { text: 'The Singularity awaits', hint: `+${fmt(singularityShards())} shards`, action: 'sing', ready: true };
    if (canTrainModel()) return { text: `Train Model v${game.models.level + 1}`, hint: 'resets compute layer', action: 'model', ready: true };
    return { text: 'Rent Compute (prestige)', hint: `+${fmt(computeGain())} compute`, action: 'compute', ready: true };
  }
  if (game.stats.computeResets > 0 && !canTrainModel())
    return { text: `Toward Model v${game.models.level + 1}`, hint: `best reset ${fmt(game.compute.bestGain)}/${fmt(modelRequirement(game.models.level))} — one BIG run`,
             action: 'tab:models', ready: false };
  if (lockedTier !== -1) {
    const can = game.cash >= tierCost(lockedTier, 0);
    return { text: `Unlock ${CONFIG.tiers[lockedTier].name}`, hint: fmtCash(CONFIG.tiers[lockedTier].baseCost),
             action: 'buyTier:' + lockedTier, ready: can };
  }
  return { text: 'Toward Compute prestige', hint: `${fmtCash(game.cashThisRun)}/${fmtCash(CONFIG.compute.unlockCash)}`,
           action: 'tab:compute', ready: false };
}

/* exported for the page + tests */
if (typeof module !== 'undefined') module.exports = {
  CONFIG, get game() { return game; }, freshState, tick, manualClick, buyTier, buyUpgrade,
  buyComputeShop, buyShardShop, doComputeReset, doModelReset, doSingularity, computeGain,
  canTrainModel, canSingularity, singularityShards, modelRequirement, cashPerSecond, clickPower,
  checkAchievements, save, load, exportSave, importSave, hardReset, toggleSound, fmt, fmtCash, nextGoal,
  tierCost, tierCostN, tierMaxAffordable, globalMult, tierMult, ui, addCash,
  _setGame: g => { game = g; },
};
