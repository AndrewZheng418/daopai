// js/ai.js
// AI decision engine with poker-style profiles.

const AI_PROFILES = {
  TAG: {
    label: '紧凶',
    tightness: 70,
    aggression: 80,
    bluff: 18,
    allInCall: 76,
    callBias: 42
  },
  LAG: {
    label: '松凶',
    tightness: 40,
    aggression: 85,
    bluff: 38,
    allInCall: 68,
    callBias: 45
  },
  NIT: {
    label: '岩石',
    tightness: 90,
    aggression: 30,
    bluff: 4,
    allInCall: 88,
    callBias: 24
  },
  FISH: {
    label: '鱼',
    tightness: 60,
    aggression: 20,
    bluff: 8,
    allInCall: 62,
    callBias: 70
  },
  BALANCED: {
    label: '均衡',
    tightness: 55,
    aggression: 55,
    bluff: 16,
    allInCall: 72,
    callBias: 48
  }
};

const AI_PROFILE_WEIGHTS = {
  easy: [
    ['FISH', 72],
    ['BALANCED', 18],
    ['NIT', 10]
  ],
  normal: [
    ['TAG', 60],
    ['NIT', 25],
    ['BALANCED', 15]
  ],
  hard: [
    ['TAG', 45],
    ['LAG', 45],
    ['NIT', 10]
  ]
};

function pickWeighted(items) {
  const total = items.reduce((sum, item) => sum + item[1], 0);
  let roll = Math.random() * total;
  for (const [key, weight] of items) {
    roll -= weight;
    if (roll <= 0) return key;
  }
  return items[items.length - 1][0];
}

function createAIProfile(difficulty = 'normal') {
  const weights = AI_PROFILE_WEIGHTS[difficulty] || AI_PROFILE_WEIGHTS.normal;
  const key = pickWeighted(weights);
  return { key, ...AI_PROFILES[key] };
}

function getAIProfile(player, difficulty = 'normal') {
  if (player && player.aiProfile) return player.aiProfile;
  const fallback = difficulty === 'easy' ? AI_PROFILES.FISH : (difficulty === 'hard' ? AI_PROFILES.LAG : AI_PROFILES.TAG);
  return { key: difficulty || 'normal', ...fallback };
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function preflopHandStrength(holeCards) {
  const [c1, c2] = holeCards || [];
  if (!c1 || !c2) return 0;

  const high = Math.max(c1.value, c2.value);
  const low = Math.min(c1.value, c2.value);
  const pair = c1.value === c2.value;
  const suited = c1.suit === c2.suit;
  const gap = high - low;

  if (pair) {
    return clamp01(0.48 + (high / 14) * 0.45);
  }

  let score = (high / 14) * 0.35 + (low / 14) * 0.25;
  if (high === 14) score += 0.16;
  if (high >= 13 && low >= 10) score += 0.12;
  else if (low >= 10) score += 0.08;
  if (suited) score += 0.06;
  if (gap === 1) score += 0.05;
  else if (gap === 2) score += 0.025;
  else if (gap >= 5) score -= 0.08;
  if (low <= 5 && high < 11) score -= 0.06;

  return clamp01(score);
}

function estimateHandStrength(holeCards, communityCards) {
  if (!communityCards || communityCards.length === 0) {
    return preflopHandStrength(holeCards);
  } else {
    const all = holeCards.concat(communityCards);
    const ev = evaluateHand(all);
    const base = {
      'high card': 0.15,
      'one pair': 0.35,
      'two pair': 0.5,
      'three of a kind': 0.6,
      'straight': 0.7,
      'flush': 0.75,
      'full house': 0.85,
      'four of a kind': 0.92,
      'straight flush': 0.98
    };
    let score = base[ev.name] || 0.1;
    score += (ev.kickers[0] / 14) * 0.02;
    return clamp01(score);
  }
}

function decideAction(game, player, difficulty) {
  const toCall = game.currentBet - player.currentBet;
  const strength = estimateHandStrength(player.holeCards, game.communityCards);
  const profile = getAIProfile(player, difficulty);
  const noise = (Math.random() * 0.04) - 0.02;
  const effective = clamp01(strength + noise);
  const tightness = profile.tightness / 100;
  const aggression = profile.aggression / 100;
  const bluff = profile.bluff / 100;
  const callBias = profile.callBias / 100;

  const entryThreshold = 0.18 + tightness * 0.42;
  const callThreshold = Math.max(0.16, entryThreshold - callBias * 0.16);
  const raiseThreshold = 0.46 + tightness * 0.16 - aggression * 0.12;

  if (toCall >= player.chips) {
    const activeOpponents = game.players.filter(p => p !== player && !p.folded && !p.eliminated).length;
    const multiwayPenalty = Math.min(0.12, Math.max(0, activeOpponents - 1) * 0.03);
    const allInThreshold = Math.min(0.95, (profile.allInCall / 100) + multiwayPenalty);
    return effective >= allInThreshold ? { action: 'allin' } : { action: 'fold' };
  }

  if (toCall === 0) {
    const bluffRaise = effective < entryThreshold && Math.random() < bluff * 0.25;
    if ((effective >= raiseThreshold && Math.random() < aggression) || bluffRaise) {
      const raiseAmt = game.currentBet + game.minRaise + Math.floor(Math.random() * game.minRaise * 2);
      return { action: 'raise', amount: Math.min(raiseAmt, player.chips + player.currentBet) };
    }
    return { action: 'check' };
  }

  const pressure = Math.min(1, toCall / Math.max(1, player.chips + player.currentBet));
  const pressuredCallThreshold = callThreshold + pressure * (0.16 + tightness * 0.14);

  if (effective < pressuredCallThreshold) {
    if (profile.key === 'LAG' && Math.random() < bluff * 0.22 && pressure < 0.35) {
      const raiseAmt = game.currentBet + game.minRaise * (1 + Math.floor(Math.random() * 3));
      return { action: 'raise', amount: Math.min(raiseAmt, player.chips + player.currentBet) };
    }
    return { action: 'fold' };
  }

  if (effective >= raiseThreshold && Math.random() < aggression) {
    const mul = profile.key === 'LAG' ? (1 + Math.floor(Math.random() * 4)) : (1 + Math.floor(Math.random() * 2));
    const raiseAmt = game.currentBet + game.minRaise * mul;
    return { action: 'raise', amount: Math.min(raiseAmt, player.chips + player.currentBet) };
  }

  return { action: 'call' };
}
