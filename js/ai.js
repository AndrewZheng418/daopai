// js/ai.js
// AI decision engine with 3 difficulty levels

function estimateHandStrength(holeCards, communityCards) {
  if (!communityCards || communityCards.length === 0) {
    const [c1, c2] = holeCards;
    if (!c1 || !c2) return 0;
    const pair = c1.value === c2.value ? 1 : 0;
    const suited = c1.suit === c2.suit ? 1 : 0;
    const high = Math.max(c1.value, c2.value);
    const gap = Math.abs(c1.value - c2.value);
    let score = (high / 14) * 0.3;
    if (pair) score += 0.3 + (high / 14) * 0.2;
    if (suited) score += 0.05;
    if (gap === 1) score += 0.05;
    if (gap === 2) score += 0.02;
    return Math.min(score, 1);
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
    return Math.min(score, 1);
  }
}

function decideAction(game, player, difficulty) {
  const toCall = game.currentBet - player.currentBet;
  const strength = estimateHandStrength(player.holeCards, game.communityCards);
  const noise = (Math.random() * 0.06) - 0.03;
  const effective = Math.max(0, Math.min(1, strength + noise));

  let foldThreshold, raiseThreshold, aggression;
  if (difficulty === 'easy') {
    // 鱼 + 紧弱：容易支付，跟注过多，诈唬不足；只玩超强牌，翻牌后胆小，遇加注常弃牌
    foldThreshold = 0.08;
    raiseThreshold = 0.82;
    aggression = 0.12;
  } else if (difficulty === 'normal') {
    // 紧凶：翻牌前只玩强牌，翻牌后激进，频繁3-bet，持续下注
    foldThreshold = 0.22;
    raiseThreshold = 0.52;
    aggression = 0.68;
  } else {
    // 松凶 + 紧凶混合：入池率高，经常诈唬，翻牌前加注范围广，翻牌后超池下注
    foldThreshold = 0.10;
    raiseThreshold = 0.38;
    aggression = 0.92;
  }

  if (toCall === 0) {
    if (effective >= raiseThreshold && Math.random() < aggression) {
      const raiseAmt = game.currentBet + game.minRaise + Math.floor(Math.random() * game.minRaise * 2);
      return { action: 'raise', amount: Math.min(raiseAmt, player.chips + player.currentBet) };
    }
    return { action: 'check' };
  }

  if (effective < foldThreshold) {
    if (difficulty === 'hard' && Math.random() < 0.12) {
      const raiseAmt = game.currentBet + game.minRaise * (1 + Math.floor(Math.random() * 3));
      return { action: 'raise', amount: Math.min(raiseAmt, player.chips + player.currentBet) };
    }
    return { action: 'fold' };
  }

  if (effective >= raiseThreshold && Math.random() < aggression) {
    const mul = difficulty === 'hard' ? (1 + Math.floor(Math.random() * 4)) : (1 + Math.floor(Math.random() * 2));
    const raiseAmt = game.currentBet + game.minRaise * mul;
    return { action: 'raise', amount: Math.min(raiseAmt, player.chips + player.currentBet) };
  }

  if (toCall >= player.chips) {
    return effective >= foldThreshold * 1.4 ? { action: 'allin' } : { action: 'fold' };
  }

  return { action: 'call' };
}
