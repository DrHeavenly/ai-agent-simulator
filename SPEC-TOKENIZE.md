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
  | opus | OPUS-9 "The Executive" | 40 | TOTAL automation of the pre-Tokenize game: auto-click at 5/sec (uses real clickPower incl. share), autobuy all tiers + cash upgrades + compute shop, auto-prestige compute (records included), auto-train models. Equipped OPUS-9 = the cash game plays itself. |
  | midas | MIDAS "The Rainmaker" | 40 | ALL cash production ^1.05 then x1e6 (post-Decimal, exponent boosts matter) |
  | oracle | ORACLE "The Miner" | 60 | token gain x25 — effectively required for token progression |
  | ghost | GHOST "The Accelerant" | 150 | game-SPEED multiplier, exponential: simulation dt x(4 · 2^singularities) while equipped. Boosts nothing directly — time itself runs faster (production, cascades, autobuyer cadence, token accrual all inherit it). Display the current speed factor on the agent card. |
  | atlas2 | ATLAS-Ω "The Key" | 250 | required to progress past the Blockchain's final stage (stage itself not yet implemented — gate exists, content later). While equipped: ALL income, cash AND tokens, is raised ^0.5 (sqrt — a brutal tax). The endgame tradeoff: you must wear the key that halves your exponents. |

- **Goal progression is MONOTONIC:** goals form an ordered checklist (first
  Chatbot → each tier unlock → first compute → first model → v8 → Singularity
  → 3 Singularities → AGI unlock → Tokenize → first token-tier validator →
  own all Smart Contracts). A completed goal NEVER reappears, even if the
  underlying condition later becomes false (e.g. post-reset). Persist
  `goalIndex` in the save; clicking the goal pill still executes/navigates.
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

## 8. Blockchain v2 — the redesign (fullness pass)

**Economy fix — Wrapped Cash (wCASH):** Blockchain purchases NEVER spend live
cash (OPUS resets make it volatile). Instead: a one-way "Wrap" converter in
the Blockchain world turns current cash into wCASH at any moment (player
choice of when to lock it in). wCASH is a Decimal, untouched by any reset.
All former cash-priced validators/contracts now price in wCASH. This is both
the fix and on-theme (wrapped assets). Wrapping is the bridge ritual between
worlds — make the button feel ceremonial.

**Blocks (production step 2):** validators don't just trickle tokens — every
N seconds (N shrinks with validator count) a BLOCK is mined: a visible,
celebrated event in the feed paying a token burst, with a small chance
(~1/12 blocks) of containing an ARTIFACT.

**Artifacts (collection layer):** permanent collectible relics (8 designs:
Genesis Shard, Dead Wallet Key, 51% Badge…), each a modest permanent boost
(x1.5-x3 token or wCASH efficiency). Collection panel shows silhouettes of
unfound ones. This is the persistent-engagement hook: blocks stay worth
watching because any block might drop one.

**Fork the Chain (nested prestige, unique mechanic):** resets validators +
contracts (NOT artifacts, NOT wCASH) for a FORK. Each fork: pick ONE of two
mutually exclusive chain rules (e.g. "PoS: validators 3x cheaper" vs "PoW:
blocks 2x faster"; next fork offers a new pair). Forks are a build-crafting
prestige — the reset choice IS the reward, no farmable currency. Fork
requirement: lifetimeTokens milestones (1e4, 1e7, 1e11, ...).

**Mempool (optional active play):** pending transactions accumulate in a
small tray (cap 8); clicking one "signs" it for an instant token burst
(~60s of income). Purely optional — idle players lose nothing structural,
active players get their fidget. This is the Blockchain's swarm-console
equivalent, not a copy of it.

## 9. Balance directives (v2 — the numbers were far too fast)
- AGI agents took ~5 min to fully acquire; target: ORACLE within ~30 min of
  AGI unlock, GHOST ~1.5h, ATLAS-Ω ~3h. Lever: shard costs stay, but shard
  INCOME must slow — singularity shards formula unchanged, so space out
  singularities: model requirement gains a x10^(singularities^1.5) factor.
- Token layer completed "instantly"; target ~2x slower than the early cash
  game. Levers: validator tier spacing x1e3 between tiers (not x50), token-
  priced tiers gated behind lifetimeTokens thresholds, contracts each gated
  behind a lifetimeTokens milestone in addition to price.
- All new constants in CONFIG; every gate visible in the transparency lines.

## 10. UI directives (v2)
- World switch swaps the ENTIRE page theme: body gets .world-chain class —
  chain palette (cyan/teal), grid overlay, mono type, blocky radii apply
  globally; simulator-only elements (swarm console, goal pill, cash-world
  tabs) hidden, replaced by chain equivalents (block feed, fork status,
  chain tabs). HUD shows ⬡ tokens + wCASH primary, cash secondary. Nothing
  from the simulator palette bleeds through, and vice versa.
- Purchases must NOT trigger structural rebuilds (blink/lag root cause):
  dirtyStructure only on genuine unlocks/world switches. Buy paths update
  in place via refs.
- Tokenize availability is PERMANENT once 1e1000 cashThisRun is first
  reached (persist a flag in stats; OPUS resets must not hide it again).
- Goal checklist: after the final goal completes, the pill fades out and is
  removed — no "all goals complete" placeholder.
- Remove player-facing meta-commentary from descriptions (e.g. "this is the
  strategy layer" on AGI agents) — the design should demonstrate purpose,
  not narrate it. Sweep ALL user-visible copy for this pattern.

## 7. Explicitly out of scope (v1)
GHOST and ATLAS-Ω effects (Finny designs), any reset-on-tokenize mechanics,
token prestige loops. Placeholder slots render but do nothing.
