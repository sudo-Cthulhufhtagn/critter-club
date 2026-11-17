# Critter Club

A quick set-collection card game for 2–4 players in the browser. You can play against bots on one
device, or host an online room (PeerJS, no backend) that friends join with a 4-letter code or a QR code.

## How to play

**Goal:** be first to the target score: 40 (2 players), 35 (3), 30 (4).

The 56-card deck is shuffled and two discard piles start with one face-up card each. Hands start empty.

**On your turn**
1. **Get a card.** Draw 2 from the deck, keep 1, and put the other face up on a discard pile
   (if one pile is empty you must use it). *Or* take the top card of either discard pile.
2. **Play pairs** (optional, any number). Two matching pair cards go face up in front of you.
   Each pair scores 1 point and triggers its trick:
   - **Capybara**: look at the top 3 cards of the deck and keep 1. The others go to the smaller discard pile.
   - **Raccoon**: give one of your cards to an opponent and take a random card from their hand.
   - **Fox**: take the top card of a discard pile.
   - **Rabbit**: take another turn after this one.
3. **Finish.** If your cards are worth 7+ points you may **Stop** or call **Last Chance**. Otherwise end your turn.

**Collectibles:** Wombat 1/3/6/10 for 1/2/3/4+ · Hedgehog 1 per distinct color among your hedgehogs · Penguin 4 per 2.
**Multipliers** (worth 0 alone): Owl +1 per Fox · Koala +2 per Wombat · Bear +1 per Capybara or Raccoon.
**Lion** (one in the deck): 1 point per card in your largest color group.
"Your cards" means your hand plus your played pairs.

**Colors:** common cards come in 7 colors (navy, teal, coral, sand, lilac, mint, black & white).
The Owl, Koala, Bear and Lion each have their own unique color.
**Color bonus** = the number of your cards in your most common color.

**Ending a round**
- **Stop:** the round ends now. Everyone scores their cards (no color bonus).
- **Last Chance:** everyone else gets one more turn. Then, if the caller's card score is ≥ everyone
  else's, the caller scores cards + color bonus and the others score only their color bonus.
  Otherwise the caller scores only their color bonus and the others score their cards.
- **Deck runs out:** if the deck is empty when a player chooses to draw, the round ends and nobody scores.

The next round reshuffles everything and the next player starts.

### Simplifications
- Capybara leftovers always go to the smaller discard pile (no per-card choice).
- Calling Last Chance forfeits a pending Rabbit extra turn.
- A player who disconnects mid-game is replaced by a bot. Nobody can join mid-game.

## Development

```sh
npm install
npm run dev      # local dev server
npm test         # rules tests + simulated bot games (node src/game.test.js)
npm run build    # static build in dist/ (deployed to GitHub Pages by .github/workflows/pages.yml)
```

- `src/game.js`: pure rules engine with the card table, reducer (`act`), scoring breakdown, redacted per-player views and the bot.
- `src/net.js`: PeerJS host/client. The host holds the state and sends each player only what they may see.
- `src/main.js`, `src/style.css`: the UI.
- `src/icons.js`: card art.

## Credits

The animal icons (capybara, raccoon-head, fox, rabbit, hedgehog, penguin, barn-owl, koala, bear-head, lion)
come from [game-icons.net](https://game-icons.net) by Lorc, Delapouite & contributors. They are licensed under
[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) and were obtained via `@iconify-json/game-icons`.
The wombat is original art for this project.
