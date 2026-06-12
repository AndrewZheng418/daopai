// js/poker-engine.js
// Complete Texas Hold'em engine with full hand evaluation and side pots

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const RANK_VALUE = { '2':2, '3':3, '4':4, '5':5, '6':6, '7':7, '8':8, '9':9, '10':10, 'J':11, 'Q':12, 'K':13, 'A':14 };

// Local fallbacks if story-data.js not loaded yet
function _t(key) { return (typeof getTerm === 'function') ? getTerm(key) : key; }
function _fmt(card) { return (typeof formatCard === 'function') ? formatCard(card) : card.toString(); }
function _fmtRank(ev) { return (typeof formatHandRank === 'function') ? formatHandRank(ev) : ev.name; }

class Card {
  constructor(suit, rank) {
    this.suit = suit;
    this.rank = rank;
    this.value = RANK_VALUE[rank];
  }
  toString() {
    return `${this.suit}${this.rank}`;
  }
}

class Deck {
  constructor() {
    this.cards = [];
    this.reset();
  }
  reset() {
    this.cards = [];
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        this.cards.push(new Card(suit, rank));
      }
    }
    this.shuffle();
  }
  shuffle() {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }
  deal() {
    return this.cards.pop();
  }
}

class Player {
  constructor(id, name, chips, isHuman = false) {
    this.id = id;
    this.name = name;
    this.chips = chips;
    this.isHuman = isHuman;
    this.holeCards = [];
    this.folded = false;
    this.allIn = false;
    this.eliminated = false;
    this.currentBet = 0; // this betting round
    this.totalBet = 0;   // this entire hand
    this.difficulty = 'normal'; // for AI
    this.bestHand = null; // evaluated at showdown
    this.actedThisRound = false;
  }

  resetForNewHand() {
    this.holeCards = [];
    this.folded = false;
    this.allIn = false;
    this.currentBet = 0;
    this.totalBet = 0;
    this.bestHand = null;
    this.actedThisRound = false;
  }

  bet(amount) {
    const actual = Math.min(amount, this.chips);
    this.chips -= actual;
    this.currentBet += actual;
    this.totalBet += actual;
    if (this.chips === 0 && actual > 0) this.allIn = true;
    return actual;
  }

  get isActive() {
    return !this.folded && !this.eliminated && (this.chips > 0 || this.allIn);
  }

  get canAct() {
    return !this.folded && !this.eliminated && !this.allIn && this.chips > 0;
  }
}

// ===== Hand Evaluation =====

function evaluateHand(cards) {
  const counts = {};
  const suitCounts = {};

  for (const c of cards) {
    counts[c.value] = (counts[c.value] || 0) + 1;
    suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1;
  }

  const valuesDesc = Object.keys(counts).map(Number).sort((a, b) => b - a);

  let flushCards = null;
  for (const s in suitCounts) {
    if (suitCounts[s] >= 5) {
      flushCards = cards.filter(c => c.suit === s).sort((a, b) => b.value - a.value);
      break;
    }
  }

  const getStraightHigh = (vals) => {
    const unique = [...new Set(vals)].sort((a, b) => b - a);
    if (unique.length < 5) return null;
    if (unique.includes(14) && unique.includes(5) && unique.includes(4) && unique.includes(3) && unique.includes(2)) {
      return 5;
    }
    for (let i = 0; i <= unique.length - 5; i++) {
      if (unique[i] - unique[i + 4] === 4) {
        return unique[i];
      }
    }
    return null;
  };

  // Straight flush
  if (flushCards) {
    const flushVals = [...new Set(flushCards.map(c => c.value))].sort((a, b) => b - a);
    const sfHigh = getStraightHigh(flushVals);
    if (sfHigh) {
      return { rank: 8, name: 'straight flush', kickers: [sfHigh] };
    }
  }

  // Four of a kind
  const quads = valuesDesc.find(v => counts[v] === 4);
  if (quads) {
    const kicker = valuesDesc.find(v => v !== quads);
    return { rank: 7, name: 'four of a kind', kickers: [quads, kicker] };
  }

  // Full house
  const trips = valuesDesc.find(v => counts[v] === 3);
  if (trips) {
    const pair = valuesDesc.find(v => counts[v] >= 2 && v !== trips);
    if (pair) {
      return { rank: 6, name: 'full house', kickers: [trips, pair] };
    }
  }

  // Flush
  if (flushCards) {
    return { rank: 5, name: 'flush', kickers: flushCards.slice(0, 5).map(c => c.value) };
  }

  // Straight
  const straightHigh = getStraightHigh(valuesDesc);
  if (straightHigh) {
    return { rank: 4, name: 'straight', kickers: [straightHigh] };
  }

  // Three of a kind
  if (trips) {
    const kickers = valuesDesc.filter(v => v !== trips).slice(0, 2);
    return { rank: 3, name: 'three of a kind', kickers: [trips, ...kickers] };
  }

  // Two pair
  const pairs = valuesDesc.filter(v => counts[v] === 2);
  if (pairs.length >= 2) {
    const [p1, p2] = pairs.slice(0, 2);
    const kicker = valuesDesc.find(v => v !== p1 && v !== p2);
    return { rank: 2, name: 'two pair', kickers: [p1, p2, kicker] };
  }

  // One pair
  if (pairs.length === 1) {
    const kickers = valuesDesc.filter(v => v !== pairs[0]).slice(0, 3);
    return { rank: 1, name: 'one pair', kickers: [pairs[0], ...kickers] };
  }

  // High card
  return { rank: 0, name: 'high card', kickers: valuesDesc.slice(0, 5) };
}

function handScore(evalResult) {
  let score = evalResult.rank;
  const kickers = evalResult.kickers.slice();
  while (kickers.length < 5) kickers.push(0);
  for (const k of kickers) {
    score = score * 15 + k;
  }
  return score;
}

// ===== Game Engine =====

class PokerGame {
  constructor(players, smallBlind = 100, bigBlind = 200) {
    this.deck = new Deck();
    this.players = players;
    this.communityCards = [];
    this.pot = 0;
    this.sidePots = [];
    this.state = 'idle';
    this.dealerIndex = 0;
    this.smallBlind = smallBlind;
    this.bigBlind = bigBlind;
    this.minRaise = bigBlind;
    this.currentBet = 0;
    this.currentPlayerIndex = -1;
    this.lastRaiseIndex = -1;
    this.winners = [];
    this.returnedBets = [];
    this.handLog = [];
  }

  log(msg) {
    this.handLog.push(msg);
  }

  rotateDealer() {
    const start = this.dealerIndex;
    do {
      this.dealerIndex = (this.dealerIndex + 1) % this.players.length;
    } while (this.players[this.dealerIndex].eliminated && this.dealerIndex !== start);
  }

  activePlayers() {
    return this.players.filter(p => !p.eliminated);
  }

  nonFoldedPlayers() {
    return this.players.filter(p => !p.folded && !p.eliminated);
  }

  canActPlayers() {
    return this.players.filter(p => p.canAct);
  }

  bettingRoundComplete() {
    const actors = this.canActPlayers();
    if (actors.length === 0) return true;
    return actors.every(p => p.actedThisRound && p.currentBet === this.currentBet);
  }

  resetRoundActionAfterFullRaise(raiser) {
    for (const p of this.players) {
      if (p.canAct && p !== raiser) p.actedThisRound = false;
    }
    raiser.actedThisRound = true;
  }

  getNextActiveIndex(fromIndex) {
    let idx = (fromIndex + 1) % this.players.length;
    let loops = 0;
    while (loops < this.players.length) {
      const p = this.players[idx];
      if (!p.eliminated && !p.folded && !p.allIn && p.chips > 0) return idx;
      idx = (idx + 1) % this.players.length;
      loops++;
    }
    return -1;
  }

  getNextAnyIndex(fromIndex) {
    let idx = (fromIndex + 1) % this.players.length;
    let loops = 0;
    while (loops < this.players.length) {
      const p = this.players[idx];
      if (!p.eliminated) return idx;
      idx = (idx + 1) % this.players.length;
      loops++;
    }
    return -1;
  }

  startNewHand() {
    this.deck.reset();
    this.communityCards = [];
    this.pot = 0;
    this.sidePots = [];
    this.state = 'preflop';
    this.currentBet = 0;
    this.minRaise = this.bigBlind;
    this.winners = [];
    this.returnedBets = [];
    this.handLog = [];

    for (const p of this.players) {
      if (!p.eliminated) {
        p.resetForNewHand();
      } else {
        p.holeCards = [];
        p.bestHand = null;
      }
    }

    const active = this.activePlayers();
    if (active.length < 2) {
      this.state = 'ended';
      return;
    }

    while (this.players[this.dealerIndex].eliminated) {
      this.dealerIndex = (this.dealerIndex + 1) % this.players.length;
    }

    const headsUp = active.length === 2;
    const sbIdx = headsUp ? this.dealerIndex : this.getNextActiveIndex(this.dealerIndex);
    const bbIdx = this.getNextActiveIndex(sbIdx);
    const firstToAct = headsUp ? sbIdx : this.getNextActiveIndex(bbIdx);

    if (sbIdx === -1 || bbIdx === -1 || firstToAct === -1) {
      this.state = 'ended';
      return;
    }

    const sbPlayer = this.players[sbIdx];
    const bbPlayer = this.players[bbIdx];
    const sbAmt = sbPlayer.bet(Math.min(this.smallBlind, sbPlayer.chips));
    const bbAmt = bbPlayer.bet(Math.min(this.bigBlind, bbPlayer.chips));
    this.pot += sbAmt + bbAmt;
    this.currentBet = bbAmt;
    this.minRaise = Math.max(this.bigBlind, this.currentBet - sbAmt);

    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < this.players.length; j++) {
        const p = this.players[(this.dealerIndex + 1 + j) % this.players.length];
        if (!p.eliminated) p.holeCards.push(this.deck.deal());
      }
    }

    this.currentPlayerIndex = firstToAct;
    this.lastRaiseIndex = firstToAct;

    this.log(`${_t('dealer')}：${this.players[this.dealerIndex].name}`);
    this.log(`${_t('smallBlind')} ${sbPlayer.name} 投入 ${sbAmt} ${_t('chips')}`);
    this.log(`${_t('bigBlind')} ${bbPlayer.name} 投入 ${bbAmt} ${_t('chips')}`);
  }

  endBettingRound() {
    for (const p of this.players) {
      p.currentBet = 0;
      p.actedThisRound = false;
    }
    this.currentBet = 0;
    this.minRaise = this.bigBlind;

    if (this.state === 'preflop') {
      this.state = 'flop';
      this.dealCommunity(3);
    } else if (this.state === 'flop') {
      this.state = 'turn';
      this.dealCommunity(1);
    } else if (this.state === 'turn') {
      this.state = 'river';
      this.dealCommunity(1);
    } else if (this.state === 'river') {
      this.state = 'showdown';
      this.resolveShowdown();
      return;
    }

    const next = this.getNextActiveIndex(this.dealerIndex);
    this.currentPlayerIndex = next === -1 ? this.getNextActiveIndex(-1) : next;
    this.lastRaiseIndex = this.currentPlayerIndex;
  }

  dealCommunity(n) {
    this.deck.deal(); // burn
    for (let i = 0; i < n; i++) {
      this.communityCards.push(this.deck.deal());
    }
    const names = { flop: _t('flop'), turn: _t('turn'), river: _t('river') };
    this.log(`【${names[this.state] || this.state}】${_t('communityCards')}：${this.communityCards.map(c => _fmt(c)).join(' ')}`);
  }

  playerAction(player, action, amount = 0) {
    if (this.state === 'showdown' || this.state === 'ended') return false;
    if (this.players[this.currentPlayerIndex] !== player) return false;

    const toCall = this.currentBet - player.currentBet;
    let fullRaise = false;

    switch (action) {
      case 'fold':
        player.folded = true;
        player.foldRound = this.state;
        this.log(`${player.name} ${_t('fold')}`);
        break;

      case 'check':
        if (toCall > 0) return false;
        this.log(`${player.name} ${_t('check')}`);
        break;

      case 'call':
        if (toCall <= 0) {
          this.log(`${player.name} ${_t('check')}`);
        } else {
          const actual = player.bet(Math.min(toCall, player.chips));
          this.pot += actual;
          this.log(`${player.name} ${_t('call')} ${actual} ${_t('chips')}`);
        }
        break;

      case 'raise': {
        if (amount < this.currentBet + this.minRaise) return false;
        const additional = amount - player.currentBet;
        const actual = player.bet(Math.min(additional, player.chips));
        const newTotal = player.currentBet;
        if (newTotal > this.currentBet) {
          const diff = newTotal - this.currentBet;
          this.currentBet = newTotal;
          if (diff >= this.minRaise) {
            this.minRaise = diff;
            this.lastRaiseIndex = this.currentPlayerIndex;
            fullRaise = true;
          }
        }
        this.pot += actual;
        this.log(`${player.name} ${_t('raise')} 至 ${newTotal} ${_t('chips')}`);
        break;
      }

      case 'allin': {
        const allInAmt = player.chips;
        const actual = player.bet(allInAmt);
        const newTotal = player.currentBet;
        if (newTotal > this.currentBet) {
          const diff = newTotal - this.currentBet;
          this.currentBet = newTotal;
          if (diff >= this.minRaise) {
            this.minRaise = diff;
            this.lastRaiseIndex = this.currentPlayerIndex;
            fullRaise = true;
          }
        }
        this.pot += actual;
        this.log(`${player.name} ${_t('allIn')} ${actual} ${_t('chips')}`);
        break;
      }

      default:
        return false;
    }

    if (fullRaise) {
      this.resetRoundActionAfterFullRaise(player);
    } else {
      player.actedThisRound = true;
    }

    const notFolded = this.nonFoldedPlayers();
    if (notFolded.length === 1) {
      this.endHand(notFolded[0]);
      return true;
    }

    if (this.canActPlayers().length === 0) {
      this.fastForwardToShowdown();
      return true;
    }

    if (this.bettingRoundComplete()) {
      this.endBettingRound();
      return true;
    }

    this.advanceToNextPlayer();
    return true;
  }

  advanceToNextPlayer() {
    let safety = 0;
    while (safety < this.players.length) {
      this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
      const p = this.players[this.currentPlayerIndex];
      if (!p.eliminated && !p.folded && !p.allIn && p.chips > 0) {
        if (!p.actedThisRound || p.currentBet < this.currentBet) return;
      }
      safety++;
    }
    this.endBettingRound();
  }

  fastForwardToShowdown() {
    while (this.communityCards.length < 5) {
      if (this.communityCards.length === 0) {
        this.state = 'flop';
        this.dealCommunity(3);
      } else if (this.communityCards.length === 3) {
        this.state = 'turn';
        this.dealCommunity(1);
      } else if (this.communityCards.length === 4) {
        this.state = 'river';
        this.dealCommunity(1);
      }
    }
    this.state = 'showdown';
    this.resolveShowdown();
  }

  calculateSidePots() {
    const all = this.players.filter(p => !p.eliminated).slice().sort((a, b) => a.totalBet - b.totalBet);
    let prev = 0;
    const pots = [];
    const returnedBets = [];
    for (let i = 0; i < all.length; i++) {
      const diff = all[i].totalBet - prev;
      if (diff > 0) {
        const contributors = all.slice(i);
        const eligible = contributors.filter(p => !p.folded);
        const amount = diff * contributors.length;
        if (contributors.length === 1 && eligible.length === 1) {
          // No opponent matched this layer; it should be returned, not won as a side pot.
          returnedBets.push({ player: eligible[0], amount });
        } else if (eligible.length > 0) {
          pots.push({
            amount,
            eligiblePlayers: eligible,
            contributors
          });
        } else if (pots.length > 0) {
          // 若当前层级没有 eligible 玩家，将金额并入前一个 pot
          pots[pots.length - 1].amount += amount;
        }
        prev = all[i].totalBet;
      }
    }
    this.returnedBets = returnedBets;
    return pots;
  }

  resolveShowdown() {
    this.sidePots = this.calculateSidePots();

    for (const returned of this.returnedBets) {
      returned.player.chips += returned.amount;
      this.log(`${returned.player.name} 未被跟注的 ${returned.amount} ${_t('chips')} 退回`);
    }

    const results = this.players.map((p, idx) => {
      if (p.folded || p.eliminated) return null;
      const allCards = p.holeCards.concat(this.communityCards);
      const ev = evaluateHand(allCards);
      p.bestHand = ev;
      return { idx, player: p, ev, score: handScore(ev) };
    }).filter(r => r !== null);

    for (let potIndex = 0; potIndex < this.sidePots.length; potIndex++) {
      const pot = this.sidePots[potIndex];
      const eligible = results.filter(r => pot.eligiblePlayers.includes(r.player));
      if (eligible.length === 0) continue;
      eligible.sort((a, b) => b.score - a.score);
      const best = eligible[0].score;
      const winners = eligible.filter(r => r.score === best);
      const share = Math.floor(pot.amount / winners.length);
      const remainder = pot.amount - share * winners.length;
      for (let w = 0; w < winners.length; w++) {
        const amt = share + (w < remainder ? 1 : 0);
        winners[w].player.chips += amt;
        this.winners.push({
          player: winners[w].player,
          amount: amt,
          evalResult: winners[w].ev,
          potIndex,
          potAmount: pot.amount,
          eligiblePlayers: pot.eligiblePlayers
        });
      }
    }

    this.log(`=== ${_t('showdown')} ===`);
    for (const r of results) {
      const cardsStr = r.player.holeCards.map(c => _fmt(c)).join(' ');
      const best5 = this.getBest5Cards(r.player);
      const bestStr = best5.map(c => _fmt(c)).join(' ');
      this.log(`${r.player.name}：${cardsStr} — ${_fmtRank(r.ev)} | 最佳五张：${bestStr}`);
    }
    for (const w of this.winners) {
      if (w.amount > 0) {
        this.log(`${w.player.name} 夺得 ${w.amount} ${_t('chips')}`);
      }
    }

    for (const p of this.players) {
      if (p.chips <= 0 && !p.eliminated) {
        p.eliminated = true;
        this.log(`${p.name} ${_t('eliminated')}！`);
      }
    }

    this.state = 'ended';
  }

  getBest5Cards(player) {
    if (!player.holeCards.length) return [];
    const all = player.holeCards.concat(this.communityCards);
    // brute-force best 5 out of 7
    let best = [];
    let bestScore = -1;
    const n = all.length;
    for (let a = 0; a < n; a++) {
      for (let b = a + 1; b < n; b++) {
        for (let c = b + 1; c < n; c++) {
          for (let d = c + 1; d < n; d++) {
            for (let e = d + 1; e < n; e++) {
              const combo = [all[a], all[b], all[c], all[d], all[e]];
              const ev = evaluateHand(combo);
              const sc = handScore(ev);
              if (sc > bestScore) {
                bestScore = sc;
                best = combo;
              }
            }
          }
        }
      }
    }
    return best;
  }

  endHand(winner) {
    this.state = 'ended';
    winner.chips += this.pot;
    this.winners.push({ player: winner, amount: this.pot, evalResult: null });
    this.log(`${winner.name} 不战而胜，夺得 ${this.pot} ${_t('chips')}`);
    this.pot = 0;

    for (const p of this.players) {
      if (p.chips <= 0 && !p.eliminated) {
        p.eliminated = true;
        this.log(`${p.name} ${_t('eliminated')}！`);
      }
    }
  }

  get currentPlayer() {
    return this.players[this.currentPlayerIndex] || null;
  }

  get humanPlayer() {
    return this.players.find(p => p.isHuman) || null;
  }

  get activePlayerCount() {
    return this.players.filter(p => !p.eliminated).length;
  }
}
