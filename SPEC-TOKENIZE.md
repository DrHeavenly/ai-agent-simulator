# SPEC: Tokenize layer + AGI Agents

Authority for the new content. Where code and spec disagree, spec wins; where
spec is silent, choose the simplest option and flag it in your summary.

## 1. AGI Agents (shard sink + equip strategy)

- **Unlock:** costs 100 shards (one-time purchase) AND requires
  `stats.singularities >= 3`. Until then the tab shows locked with both
  requirements visible.
- **Inventory:** 3 equip slots. Agents are bought once (shards), then freely
  equipped/unequipped into slots. Owning > equipping: only EQUIPPED agents
  give their boost. This is the strategy layer — which 3 of 5 do you run?
- **The 5 agents:**
  | id | name | cost (shards) | boost |
  |---|---|---|---|
  | opus | OPUS-9 "The Executive" | 40 | full automation: auto-prestige compute when gain >= 2x cycle (records included), auto-train models when possible |
  | midas | MIDAS "The Rainmaker" | 40 | ALL cash production ^1.05 then x1e6 (post-Decimal, exponent boosts matter) |
  | oracle | ORACLE "The Miner" | 60 | token gain x25 — effectively required for token progression |
  | ghost | GHOST (locked art, "???") | 150 | placeholder — Finny designs later; show silhouette + "awaiting classification" |
  | atlas2 | ATLAS-Ω (locked art, "???") | 250 | placeholder — same treatment |
- Buying an agent does NOT consume singularities, only shards. Agents persist
  forever (never reset by anything).

## 2. Tokenize (prestige layer 5)

- **Requirement:** 1e1000 cash this run. (Judgment: with layers 1–4 multipliers
  compounding post-BI this is hours, not days — tune AFTER playtest, knob in
  CONFIG as `tokenize.unlockCash`.)
- **Effect on first activation:** unlocks Tokens + the Blockchain checkpoint
  (a second "world" view). NOT a reset in v1: nothing is wiped; Tokenize is a
  gateway, not a wipe. (Deliberate — the ask says previous layers stay
  accessible; a punishing wipe here would fight the 15-min-to-reach pacing.)
- Dock gains a **world switch**: two small icons (🖥 Simulator / ⛓ Blockchain)
  — instant toggle, both worlds run simultaneously.

## 3. Tokens (secondary currency, on the Blockchain)

- Earned ONLY in the Blockchain world by Validators (see below). No clicking
  anywhere in this world — it is fully idle by design.
- **Pacing:** first token within ~30s of entering; progression ~2x slower than
  cash's early curve (i.e., where cash tier2 unlocked at ~min 3, token
  equivalent lands ~min 6+). Late token walls should make ORACLE (x25) feel
  necessary, exactly as specced.
- Tokens are Decimal. Display with ⬡ prefix (e.g. ⬡ 4.21K).

## 4. The Blockchain world

Aesthetic: wireframe/crypto — same glass framework but: thin cyan/teal accent
(--chain:#39d4c8), monospace-first typography, grid-line background overlay,
blocky borders (4px radius vs 14), node-graph flourishes, hex ⬡ motifs.
Different mood, same design system — recognizably the same game.

Mechanics (all idle, bought with a mix of cash and tokens):
- **Validators** (the "managers", 5 tiers): Node Runner (cash), Staking Pool
  (cash), Mining Farm (tokens), DAO Council (tokens), Protocol Whale (tokens).
  Tier k produces tier k-1; tier 1 produces Tokens. You START with 1 Node
  Runner on first entry (the ask: income flows immediately, no clicking).
  Costs: cash tiers priced ~1e995+ (pocket change at entry — first purchases
  feel great), token tiers gate the mid/late game.
- **Smart Contracts** (upgrade shop, tokens): 6 one-time upgrades — validator
  multipliers, cash-world crossovers ("Bridge: cash production x1e3"), and a
  "Gas Optimizer" (validator costs -30%).
- **Block feed**: right-side ticker of fake blocks being mined
  (hash, reward, timestamp) — the Blockchain's equivalent of the swarm
  console: watchable idle motion. Purely cosmetic, driven by token rate.
- **Crossover rule (important):** token upgrades can boost the cash world and
  vice versa — the worlds should want each other, not ignore each other.

## 5. Achievements (append 6)
Tokenize once · buy an AGI agent · equip 3 agents at once · earn 1 token ·
earn 1e6 tokens · own every Smart Contract.

## 6. Numbers live in CONFIG
Every constant above goes in CONFIG.tokenize / CONFIG.agiAgents /
CONFIG.blockchain. Save: bump version, migrate, old saves keep everything.

## 7. Explicitly out of scope (v1)
GHOST and ATLAS-Ω effects (Finny designs), any reset-on-tokenize mechanics,
token prestige loops. Placeholder slots render but do nothing.
