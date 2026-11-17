# Critter Club — SSAP Correction Spec

Goal: make the rules engine faithful to **Sea Salt & Paper** (official rules in
`rules/sea_salt_and_paper_rules.md`), while keeping the land-animal reskin.
Source of truth for mechanics = that rulebook. This file maps SSAP → animals and
lists every behavioral change. Current code: `src/game.js`.

## Card table (14 types, 58 cards total)

Mapping chosen so counts land exactly on 58 and existing icons are reused.

| # | Animal `type` | icon | SSAP role | kind | count | notes |
|---|---|---|---|---|---|---|
| 1 | fox | fox | Crab | duo | 9 | effect: look through ONE pile, take ANY card |
| 2 | rabbit | rabbit | Boat | duo | 8 | effect: extra turn |
| 3 | capybara | capybara | Fish | duo | 7 | effect: draw TOP of deck to hand |
| 4 | raccoon | raccoon-head | Swimmer | duo | 5 | pairs with badger (mixed) |
| 5 | badger | **new** (game-icons `badger`) | Shark | duo | 5 | raccoon+badger pair: steal a random card |
| 6 | wombat | wombat | Shell | collect | 6 | 0/2/4/6/8/10 for 1..6 |
| 7 | hedgehog | hedgehog | Octopus | collect | 5 | 0/3/6/9/12 for 1..5 |
| 8 | penguin | penguin | Penguin | collect | 3 | 1/3/5 for 1..3 |
| 9 | mole | **new** (game-icons `mole`) | Sailor | collect | 2 | 0/5 for 1..2 |
| 10 | deer | **new** (game-icons `stag-head`) | Mermaid | mermaid | 4 | see mermaid scoring; counts as `mono` (white) |
| 11 | owl | barn-owl | Lighthouse | mult | 1 | 1 per rabbit; does NOT count as a rabbit |
| 12 | koala | koala | Shoal of fish | mult | 1 | 1 per capybara; does NOT count as a capybara |
| 13 | bear | bear-head | Penguin colony | mult | 1 | **2** per penguin; does NOT count as a penguin |
| 14 | lion | lion | Captain | mult | 1 | **3** per mole; does NOT count as a mole |

Sum: 9+8+7+5+5 + 6+5+3+2 + 4 + 1+1+1+1 = **58**.

Colors: keep the 7 common colors cycling across non-mermaid cards. Deer (mermaid)
color = `mono` (white) — mermaids count as white for color bonus AND mermaid scoring.

## Scoring (replaces `scoreCards`)

- **Duos — 1 pt per pair, held OR played.** Count over hand+played.
  - Same-type duos (fox, rabbit, capybara): pairs = floor(count / 2).
  - Mixed duo: swimmer+shark pairs = min(count raccoon, count badger).
  - Total duo points = sum of those pair counts. (Decouple from `played.length`.)
- **Collectors** (count = total of that type in hand+played):
  - wombat/Shell: [0,0,2,4,6,8,10][min(n,6)]
  - hedgehog/Octopus: [0,0,3,6,9,12][min(n,5)]
  - penguin/Penguin: [0,1,3,5][min(n,3)]
  - mole/Sailor: [0,0,5][min(n,2)]
- **Multipliers** (each card worth 0 alone):
  - owl: 1 × (# rabbit). koala: 1 × (# capybara). bear: 2 × (# penguin). lion: 3 × (# mole).
  - A multiplier card does NOT count toward the base it multiplies (owl is not a rabbit, etc.).
    In practice this is automatic since each has its own `type`; keep it that way.
- **Mermaids (deer):** order the player's color groups by size, descending. The k-th
  deer scores the size of the k-th largest color group — **each color used by at most
  one deer**. (Mermaids count as `mono` when forming groups.) Example: 2 deer, color
  counts {blue:4, green:3, ...} → deer#1 = 4, deer#2 = 3, total 7.
  - With more deer than available colors, extra deer score 0.
- **Color bonus** (LAST CHANCE only): size of the player's largest color group
  (mermaids = mono). Unchanged from current `colorBonus`, but verify mermaids count as mono.

## Turn / flow changes

- **Deck = 58** via the card table above. `buildDeck` unchanged in shape.
- **fox (Crab) effect:** new step — player picks a pile, then picks ANY card from that
  pile (not just the top). Reveal the pile to the chooser only. `legalActions` must
  enumerate every card in both piles.
- **capybara (Fish) effect:** draw top of deck into hand, no choice. If deck empty, no-op.
  Remove the old peek-3-keep-1 `capybara` step entirely.
- **raccoon+badger (Swimmer+Shark) effect:** this is a MIXED pair — `playPair` must accept
  two cards of types {raccoon, badger} (one of each), not two of the same type. Effect:
  steal ONE random card from a chosen opponent into your hand (one-way; no give-back).
  Old `raccoon` swap step is replaced by a `steal` step.
- **rabbit (Boat) effect:** extra turn — unchanged.
- **Mermaid instant win:** after any card enters a player's hand (draw/take/fish/crab/steal),
  if that player holds all 4 deer → game ends immediately, that player wins
  (`phase='gameOver'`, winner = that player), regardless of score. Check in all acquisition paths.
- **End-of-round (STOP/LAST CHANCE):** keep current logic — it already matches:
  STOP = everyone scores card points, no color bonus. LAST CHANCE = compare card totals;
  caller ≥ all others → caller gets cards+colorBonus, others only colorBonus; else caller
  only colorBonus, others cards. Verify against rulebook wording; do not rewrite if correct.
- **Empty deck:** align to rulebook — "deck empty at the end of a turn → round ends
  immediately, nobody scores." Current voids when a draw is attempted on an empty deck; keep
  that behavior (it is the same outcome) unless tests show a turn can end with an empty deck
  without triggering it.
- Targets 40/35/30 and MIN_TO_END = 7 are already correct — leave them.

## Also update

- `src/game.test.js`: adjust deck-size assertion (58), duo-in-hand scoring, collector
  tables, mermaid scoring, mixed-pair, instant win. Keep the fuzzing/bot sim.
- `src/main.js` + `src/style.css`: UI for the new fox (pick-any-from-pile), fish (auto),
  steal (pick opponent), mermaid display + instant-win banner. Card text strings.
- `src/icons.js`: add `badger`, `mole`, `stag-head` from `@iconify-json/game-icons`.
- `README.md`: update card list, effects, collector/multiplier tables, mermaid rule.
- `botAction`: handle new steps (crab pick, steal target) without crashing; simple heuristics.
