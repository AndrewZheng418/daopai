// js/battle.js
// Main game controller for battle.html

let saveSlot = -1;
let saveData = null;
let pokerGame = null;
let autoPlayTimer = null;
let lastTickTime = Date.now();
let tickInterval = null;
let handEndedHandled = false;

// AI 垃圾话控制：每个行动轮次（preflop/flop/turn/river）最多说一次
let trashTalkState = { round: '', talkers: new Set() };

// 最佳手牌高亮状态
let bestHandHighlightOn = false;

// 筹码变化动画追踪
const lastRenderedBets = {};

async function init() {
  const user = getCurrentUser();
  if (!user) { window.location.href = 'index.html'; return; }

  const params = new URLSearchParams(window.location.search);
  const slotParam = params.get('slot');
  if (slotParam === null) { window.location.href = 'menu.html'; return; }
  saveSlot = parseInt(slotParam);

  if (params.get('new') === '1') {
    const temp = localStorage.getItem('daopai_new_game');
    if (temp) {
      saveData = JSON.parse(temp);
      localStorage.removeItem('daopai_new_game');
    }
  } else {
    const saves = await getSaveSlots(user.userId);
    const record = saves[saveSlot];
    if (record && record.save_data) saveData = record.save_data;
  }

  if (!saveData) {
    alert('存档数据丢失，返回主选单。');
    window.location.href = 'menu.html';
    return;
  }

  // 恢复累计时长计时
  lastTickTime = Date.now();
  tickInterval = setInterval(() => {
    const now = Date.now();
    const delta = Math.floor((now - lastTickTime) / 1000);
    if (delta > 0) {
      saveData.playDuration = (saveData.playDuration || 0) + delta;
      lastTickTime = now;
      updateIntermissionStats();
    }
  }, 1000);

  // UI listeners
  document.getElementById('btn-rules').addEventListener('click', showRules);
  document.getElementById('btn-save').addEventListener('click', () => doSave('arena'));
  document.getElementById('btn-load').addEventListener('click', doLoad);
  document.getElementById('btn-back-arena').addEventListener('click', confirmReturnMenu);
  document.getElementById('btn-back-im').addEventListener('click', confirmReturnMenu);
  document.getElementById('btn-fold').addEventListener('click', () => humanAction('fold'));
  document.getElementById('btn-check').addEventListener('click', () => humanAction('check'));
  document.getElementById('btn-call').addEventListener('click', () => humanAction('call'));
  document.getElementById('btn-raise').addEventListener('click', toggleRaisePanel);
  document.getElementById('btn-allin').addEventListener('click', () => humanAction('allin'));
  document.getElementById('btn-skip-hand').addEventListener('click', skipToHandEnd);
  document.getElementById('btn-confirm-raise').addEventListener('click', confirmRaise);
  document.getElementById('btn-cancel-raise').addEventListener('click', toggleRaisePanel);
  document.getElementById('gm-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') { handleGM(e.target.value); e.target.value = ''; }
  });
  document.getElementById('btn-mobile-log').addEventListener('click', toggleMobileLog);

  document.getElementById('btn-next-hand').addEventListener('click', () => {
    hideIntermission();
    startHand();
  });
  document.getElementById('btn-im-save').addEventListener('click', () => doSave('intermission'));
  document.getElementById('btn-im-load').addEventListener('click', doLoad);
  document.getElementById('btn-im-rules').addEventListener('click', showRules);

  // 导出 / 导入存档
  document.getElementById('btn-im-export').addEventListener('click', () => {
    const user = getCurrentUser();
    if (user) exportSavesToJSON(user.userId);
  });
  document.getElementById('btn-im-import').addEventListener('click', () => {
    document.getElementById('importFileInput').click();
  });
  document.getElementById('importFileInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const user = getCurrentUser();
    if (!user) return;
    try {
      await importSavesFromJSON(user.userId, file);
      showModal('导入成功', '存档已导入，请返回主选单重新进入游戏以加载新存档。');
    } catch (err) {
      showModal('导入失败', err.message);
    }
    e.target.value = '';
  });

  // 最佳手牌按钮
  document.getElementById('btn-best-hand').addEventListener('click', toggleBestHandHighlight);

  document.getElementById('btn-confirm-hand').addEventListener('click', () => {
    document.getElementById('handResultWrap').style.display = 'none';

    const alive = pokerGame.players.filter(p => !p.eliminated);
    const humanAlive = alive.find(p => p.isHuman);
    const onlyOneLeft = alive.length <= 1;
    const roundsDone = saveData.round >= (saveData.totalRounds || 5);

    if (!humanAlive || onlyOneLeft || roundsDone) {
      endGame(humanAlive && (onlyOneLeft || roundsDone));
      return;
    }

    // 正常进入间歇，局数+1
    saveData.round = (saveData.round || 1) + 1;
    saveData.status = '牌局间歇';
    const user = getCurrentUser();
    if (user) saveToSlot(user.userId, saveSlot + 1, saveData);
    showIntermission();
  });

  const rpBtns = document.querySelectorAll('.rp-preset');
  rpBtns[0].addEventListener('click', () => setRaiseInput(minRaiseAmount()));
  rpBtns[1].addEventListener('click', () => setRaiseInput(halfPotAmount()));
  rpBtns[2].addEventListener('click', () => setRaiseInput(allInAmount()));

  // 技能点击（当前版本暂无实际技能，仅显示描述弹窗）
  document.querySelectorAll('.skill-slot, .pin-skill').forEach(el => {
    el.addEventListener('click', () => showSkillModal());
  });

  // 进入间歇
  showIntermission();
}

function showIntermission() {
  document.getElementById('arenaWrap').style.display = 'none';
  document.getElementById('intermissionWrap').style.display = 'flex';
  document.getElementById('handResultWrap').style.display = 'none';
  updateIntermissionUI();
}

function hideIntermission() {
  document.getElementById('intermissionWrap').style.display = 'none';
  document.getElementById('arenaWrap').style.display = 'block';
}

function updateIntermissionUI() {
  document.getElementById('imName').textContent = saveData.playerName || '无名修士';
  document.getElementById('imMeta').textContent = `${saveData.gender || ''} · ${saveData.age || ''} · ${saveData.profession || ''}`;
  document.getElementById('imStory').textContent = saveData.characterStory || '';
  document.getElementById('imChips').textContent = (saveData.chips || 0).toLocaleString();
  document.getElementById('imProgress').textContent = `第 ${saveData.round || 1} / ${saveData.totalRounds || 5} 局`;

  const aliveCount = pokerGame ? pokerGame.players.filter(p => !p.eliminated).length : 6;
  document.getElementById('imPlayers').textContent = aliveCount + ' 人';
  updateIntermissionStats();
}

function updateIntermissionStats() {
  document.getElementById('imDuration').textContent = formatDuration(saveData.playDuration || 0);
}

function minRaiseAmount() {
  if (!pokerGame) return 400;
  return pokerGame.currentBet + pokerGame.minRaise;
}
function halfPotAmount() {
  if (!pokerGame) return 400;
  const hp = pokerGame.humanPlayer;
  const toCall = pokerGame.currentBet - (hp ? hp.currentBet : 0);
  return pokerGame.currentBet + Math.floor((pokerGame.pot + toCall) / 2);
}
function allInAmount() {
  if (!pokerGame) return 400;
  const hp = pokerGame.humanPlayer;
  return hp ? hp.chips + hp.currentBet : 400;
}

function createPlayers() {
  const names = getRandomAINames(5, [saveData.playerName]);
  const startChips = saveData.startChips || 10000;
  const diff = saveData.difficulty || 'normal';
  const human = new Player('p0', saveData.playerName, saveData.chips, true);
  const ais = names.map((n, i) => {
    const aiDiff = diff === 'easy' ? 'easy' : (diff === 'hard' ? 'hard' : 'normal');
    const p = new Player('p' + (i + 1), n, startChips);
    p.difficulty = aiDiff;
    p.aiProfile = typeof createAIProfile === 'function' ? createAIProfile(aiDiff) : null;
    return p;
  });
  return [human, ...ais];
}

function startHand() {
  clearTimeout(autoPlayTimer);
  handEndedHandled = false;

  const level = Math.floor((saveData.round - 1) / 5);
  const sb = 100 * Math.pow(2, level);
  const bb = 200 * Math.pow(2, level);

  if (!pokerGame) {
    const players = createPlayers();
    pokerGame = new PokerGame(players, sb, bb);
  } else {
    pokerGame.rotateDealer();
    pokerGame.smallBlind = sb;
    pokerGame.bigBlind = bb;
  }

  pokerGame.players.forEach(p => {
    if (!p.eliminated) p.handStartChips = p.chips;
  });

  pokerGame.startNewHand();
  render();

  if (pokerGame.state === 'ended' || pokerGame.state === 'showdown') {
    if (!handEndedHandled) {
      handEndedHandled = true;
      setTimeout(onHandEnded, 1500);
    }
    return;
  }

  if (pokerGame.currentPlayer && !pokerGame.currentPlayer.isHuman) {
    scheduleAI();
  }
}

function render() {
  if (!pokerGame) return;

  // 安全网：若牌局已结束但结算未触发，自动触发
  if ((pokerGame.state === 'ended' || pokerGame.state === 'showdown') && !handEndedHandled) {
    handEndedHandled = true;
    setTimeout(onHandEnded, 500);
  }

  document.getElementById('info-round').textContent = `第 ${saveData.round || 1} 局`;
  const phaseMap = { preflop: '天机晦暗', flop: '天机初现', turn: '天命流转', river: '尘埃落定', showdown: '揭晓', ended: '间歇', idle: '准备' };
  document.getElementById('info-phase').textContent = phaseMap[pokerGame.state] || pokerGame.state;
  document.getElementById('info-blinds').textContent = `${pokerGame.smallBlind} / ${pokerGame.bigBlind}`;

  // 当前行动者提示
  const cp = pokerGame.currentPlayer;
  const turnHintEl = document.getElementById('turnHint');
  if (cp && pokerGame.state !== 'ended' && pokerGame.state !== 'showdown' && pokerGame.state !== 'idle') {
    document.getElementById('info-turn').textContent = cp.isHuman ? '你' : cp.name;
    if (cp.isHuman && !cp.folded && !cp.allIn) {
      turnHintEl.style.display = 'block';
    } else {
      turnHintEl.style.display = 'none';
    }
  } else {
    document.getElementById('info-turn').textContent = '--';
    turnHintEl.style.display = 'none';
  }

  const tc = document.getElementById('tianshiCards');
  let html = '';
  for (let i = 0; i < 5; i++) {
    if (i < pokerGame.communityCards.length) html += cardDiv(pokerGame.communityCards[i]);
    else html += '<div class="dcard-back"></div>';
  }
  tc.innerHTML = html;

  document.getElementById('qiYunPool').textContent = `气运池 ${pokerGame.pot.toLocaleString()}`;

  // 清除所有高亮
  for (let i = 1; i <= 5; i++) {
    const seat = document.getElementById('s' + i);
    if (seat) { seat.classList.remove('active', 'active-human'); }
  }
  const pz = document.querySelector('.player-zone');
  if (pz) pz.classList.remove('active', 'active-human');

  for (let i = 1; i <= 5; i++) {
    const p = pokerGame.players[i];
    const seat = document.getElementById('s' + i);
    const wrap = document.getElementById('sw' + i);
    if (!seat || !wrap) continue;
    if (!p || p.eliminated) {
      wrap.style.display = 'none';
      continue;
    }
    wrap.style.display = 'flex';
    seat.querySelector('.seat-name').textContent = p.name;
    seat.querySelector('.seat-chips').textContent = `💰 ${p.chips.toLocaleString()}`;
    const betEl = seat.querySelector('.seat-bet');
    const oldBet = lastRenderedBets['s' + i] || 0;
    const newBet = p.totalBet;
    if (betEl) {
      betEl.textContent = newBet > 0 ? `💫 ${newBet.toLocaleString()}` : '';
      if (newBet !== oldBet && newBet > 0) {
        betEl.classList.remove('bet-pop');
        void betEl.offsetWidth;
        betEl.classList.add('bet-pop');
      }
      lastRenderedBets['s' + i] = newBet;
    }
    const statusEl = seat.querySelector('.seat-status');
    if (p.folded) statusEl.textContent = '已遁走';
    else if (p.allIn) statusEl.textContent = '破釜沉舟';
    else statusEl.textContent = '等待中';

    seat.classList.toggle('folded', p.folded);
    seat.classList.toggle('allin', p.allIn && !p.folded);
    if (pokerGame.currentPlayer === p && !p.folded && !p.allIn) {
      seat.classList.add('active');
    }

    // 摊牌时显示底牌
    const handsWrap = document.getElementById('sh' + i);
    if (handsWrap) {
      if ((pokerGame.state === 'showdown' || pokerGame.state === 'ended') && !p.folded && p.holeCards.length >= 2) {
        handsWrap.innerHTML = p.holeCards.map(c => miniCardDiv(c)).join('');
        handsWrap.classList.add('show');
      } else {
        handsWrap.innerHTML = '';
        handsWrap.classList.remove('show');
      }
    }
  }

  const hp = pokerGame.humanPlayer;
  if (hp) {
    document.getElementById('playerName').textContent = hp.name;
    document.getElementById('playerChips').textContent = `气运: ${hp.chips.toLocaleString()}`;
    const playerBetEl = document.getElementById('playerBet');
    const oldPlayerBet = lastRenderedBets['player'] || 0;
    const newPlayerBet = hp.totalBet;
    if (playerBetEl) {
      playerBetEl.textContent = newPlayerBet > 0 ? `💫 ${newPlayerBet.toLocaleString()}` : '本轮未注';
      if (newPlayerBet !== oldPlayerBet && newPlayerBet > 0) {
        playerBetEl.classList.remove('bet-pop');
        void playerBetEl.offsetWidth;
        playerBetEl.classList.add('bet-pop');
      }
      lastRenderedBets['player'] = newPlayerBet;
    }

    // 玩家自己行动时高亮
    const playerZone = document.querySelector('.player-zone');
    if (playerZone && pokerGame.currentPlayer === hp && !hp.folded && !hp.allIn && pokerGame.state !== 'ended' && pokerGame.state !== 'showdown' && pokerGame.state !== 'idle') {
      playerZone.classList.add('active-human');
    }

    const pc1 = document.getElementById('pCard1');
    const pc2 = document.getElementById('pCard2');
    if (hp.holeCards.length >= 2) {
      pc1.outerHTML = cardDiv(hp.holeCards[0], 'pCard1');
      pc2.outerHTML = cardDiv(hp.holeCards[1], 'pCard2');
    } else {
      pc1.outerHTML = '<div class="dcard-back" id="pCard1"></div>';
      pc2.outerHTML = '<div class="dcard-back" id="pCard2"></div>';
    }
  }

  syncLog();
  renderActionButtons();
  renderBestHandHighlight();
}

function cardDiv(card, id) {
  const isRed = card.suit === '♥' || card.suit === '♦';
  const cls = isRed ? 'red' : 'black';
  const suitInfo = SUIT_NAMES[card.suit] || { name: card.suit, emoji: '' };
  return `<div class="dcard ${cls}"${id ? ` id="${id}"` : ''}>
    <div class="d-top">${card.rank}<br><span style="font-size:11px">${suitInfo.emoji}${suitInfo.name}</span></div>
    <div class="d-mid">${card.suit}</div>
    <div class="d-btm">${card.rank}</div>
  </div>`;
}

function miniCardDiv(card) {
  const isRed = card.suit === '♥' || card.suit === '♦';
  const cls = isRed ? 'red' : 'black';
  return `<div class="mini-card ${cls}">
    <span class="mc-suit">${card.suit}</span>
    <span class="mc-rank">${card.rank}</span>
  </div>`;
}

function renderActionButtons() {
  const hp = pokerGame.humanPlayer;
  const btnFold = document.getElementById('btn-fold');
  const btnCheck = document.getElementById('btn-check');
  const btnCall = document.getElementById('btn-call');
  const btnRaise = document.getElementById('btn-raise');
  const btnAllin = document.getElementById('btn-allin');
  const btnSkip = document.getElementById('btn-skip-hand');

  // 若已遁走且牌局仍在进行，显示跳过按钮
  if (hp && hp.folded && !hp.eliminated && pokerGame.state !== 'showdown' && pokerGame.state !== 'ended' && pokerGame.state !== 'idle') {
    [btnFold, btnCheck, btnCall, btnRaise, btnAllin].forEach(b => b.style.display = 'none');
    btnSkip.style.display = 'block';
    btnSkip.disabled = false;
    return;
  }

  // 正常情况：显示操作按钮，隐藏跳过
  [btnFold, btnCheck, btnCall, btnRaise, btnAllin].forEach(b => b.style.display = 'block');
  btnSkip.style.display = 'none';

  if (!hp || hp.folded || hp.allIn || pokerGame.state === 'showdown' || pokerGame.state === 'ended' || pokerGame.state === 'idle' || pokerGame.currentPlayer !== hp) {
    [btnFold, btnCheck, btnCall, btnRaise, btnAllin].forEach(b => b.disabled = true);
    return;
  }

  const toCall = pokerGame.currentBet - hp.currentBet;
  btnFold.disabled = false;
  btnAllin.disabled = hp.chips <= 0;

  if (toCall === 0) {
    btnCheck.disabled = false;
    btnCheck.querySelector('.act-sub').textContent = '过牌';
    btnCall.disabled = true;
    btnCall.querySelector('.act-sub').textContent = '应劫';
  } else {
    btnCheck.disabled = true;
    btnCall.disabled = false;
    btnCall.querySelector('.act-sub').textContent = `应劫 ${toCall.toLocaleString()}`;
  }

  const minR = pokerGame.currentBet + pokerGame.minRaise;
  btnRaise.disabled = hp.chips <= toCall;
  btnRaise.querySelector('.act-sub').textContent = `逆天 (最低 ${minR.toLocaleString()})`;

  const rInput = document.getElementById('raiseInput');
  rInput.min = minR;
  rInput.value = minR;
  rInput.max = hp.chips + hp.currentBet;
}

function skipToHandEnd() {
  if (!pokerGame) return;
  if (pokerGame.state === 'ended' || pokerGame.state === 'showdown') return;
  pokerGame.fastForwardToShowdown();
  render();
  if (!handEndedHandled) {
    handEndedHandled = true;
    setTimeout(onHandEnded, 800);
  }
}

function humanAction(action) {
  if (!pokerGame) return;
  const hp = pokerGame.humanPlayer;
  if (!hp || pokerGame.currentPlayer !== hp) return;

  let amount = 0;
  if (action === 'raise') {
    amount = parseInt(document.getElementById('raiseInput').value) || 0;
  }

  const ok = pokerGame.playerAction(hp, action, amount);
  if (!ok) return;
  render();

  if (pokerGame.state === 'ended' || pokerGame.state === 'showdown') {
    if (!handEndedHandled) {
      handEndedHandled = true;
      setTimeout(onHandEnded, 2000);
    }
  } else if (pokerGame.currentPlayer && !pokerGame.currentPlayer.isHuman) {
    scheduleAI();
  }
}

function toggleRaisePanel() {
  const panel = document.getElementById('raisePanel');
  panel.classList.toggle('show');
}

function setRaiseInput(val) {
  document.getElementById('raiseInput').value = val;
}

function confirmRaise() {
  toggleRaisePanel();
  humanAction('raise');
}

function scheduleAI() {
  clearTimeout(autoPlayTimer);
  if (pokerGame.state === 'ended' || pokerGame.state === 'showdown') {
    if (!handEndedHandled) {
      handEndedHandled = true;
      setTimeout(onHandEnded, 1500);
    }
    return;
  }
  const p = pokerGame.currentPlayer;
  if (!p || p.isHuman) return;

  const diff = p.difficulty || 'normal';
  let delay = 350 + Math.random() * 550; // 0.35~0.9秒，避免多人连续行动拖太久

  // 垃圾话概率：简单15%、普通25%、困难35%
  const trashProb = { easy: 0.15, normal: 0.25, hard: 0.35 };
  const prob = trashProb[diff] || 0.25;

  // 每个行动轮次（preflop/flop/turn/river）最多说一次
  const currentRound = pokerGame.state || '';
  if (trashTalkState.round !== currentRound) {
    trashTalkState.round = currentRound;
    trashTalkState.talkers.clear();
  }

  if (!trashTalkState.talkers.has(p.id) && Math.random() < prob) {
    trashTalkState.talkers.add(p.id);
    const linesByDiff = {
      easy: [
        '「呼……让我想想……」',
        '「这、这该怎么办……」',
        '「运气好点就好了……」'
      ],
      normal: [
        '「有点意思。」',
        '「未必会输给你。」',
        '「下注吧，看谁的命更硬。』'
      ],
      hard: [
        '「这点气运，也敢与我争锋？」',
        '「你的牌路，我已经看穿了。」',
        '「逆天而行，不过是自取灭亡。」',
        '「赌命台上，没有退路。」',
        '「这一注，我要让你万劫不复。」'
      ]
    };
    const lines = linesByDiff[diff] || linesByDiff.normal;
    const line = lines[Math.floor(Math.random() * lines.length)];
    addLogLine(`<span style="color:#c87860">[${p.name}] ${line}</span>`);
    delay = 800 + Math.random() * 400; // 有台词也不超过约1.2秒
  }

  autoPlayTimer = setTimeout(() => {
    if (!pokerGame || pokerGame.state === 'ended' || pokerGame.state === 'showdown') {
      if (pokerGame && (pokerGame.state === 'ended' || pokerGame.state === 'showdown') && !handEndedHandled) {
        handEndedHandled = true;
        setTimeout(onHandEnded, 1500);
      }
      return;
    }
    const decision = decideAction(pokerGame, p, p.difficulty);
    pokerGame.playerAction(p, decision.action, decision.amount || 0);
    render();
    if (pokerGame.state === 'ended' || pokerGame.state === 'showdown') {
      if (!handEndedHandled) {
        handEndedHandled = true;
        setTimeout(onHandEnded, 1500);
      }
    } else if (pokerGame.currentPlayer && !pokerGame.currentPlayer.isHuman) {
      scheduleAI();
    }
  }, delay);
}

function addLogLine(html) {
  if (!pokerGame) return;
  pokerGame.handLog.push(html);
  syncLog();
}

function syncLog() {
  const logBody = document.getElementById('logBody');
  const mobileLog = document.getElementById('mobileLogBody');
  if (!pokerGame) return;
  const html = pokerGame.handLog.map(line => `<div>${line}</div>`).join('');
  logBody.innerHTML = html;
  if (mobileLog) mobileLog.innerHTML = html;
  logBody.scrollTop = logBody.scrollHeight;
}

function onHandEnded() {
  const hp = pokerGame.humanPlayer;
  if (hp) saveData.chips = hp.chips;

  // 更新游玩时长
  const now = Date.now();
  const delta = Math.floor((now - lastTickTime) / 1000);
  if (delta > 0) {
    saveData.playDuration = (saveData.playDuration || 0) + delta;
    lastTickTime = now;
  }

  // 淘汰筹码为0的玩家
  pokerGame.players.forEach(p => {
    if (p.chips <= 0 && !p.eliminated) {
      p.eliminated = true;
      addLogLine(`<b>${p.name}</b> 气运耗尽，身死道消。`);
    }
  });

  // 揭示所有人手牌和牌型
  try {
    showHandResult();
  } catch (e) {
    console.error('showHandResult error:', e);
    document.getElementById('handResultBody').innerHTML = '<div style="padding:10px;">牌局已结束，点击确认继续。</div>';
    document.getElementById('handResultWrap').style.display = 'flex';
  }

  // 检查结局条件（死亡结算延后到玩家确认后）
  const alive = pokerGame.players.filter(p => !p.eliminated);
  const humanAlive = alive.find(p => p.isHuman);
  const onlyOneLeft = alive.length <= 1;
  const roundsDone = saveData.round >= (saveData.totalRounds || 5);

  // 如果人类已死或只剩一人或局数用完，结算按钮将触发结局
  const isEnding = !humanAlive || onlyOneLeft || roundsDone;
  const confirmBtn = document.getElementById('btn-confirm-hand');
  if (isEnding && !humanAlive) {
    confirmBtn.textContent = '你已耗尽气运';
  } else {
    confirmBtn.textContent = '确认牌局结束';
  }

  // 保存当前进度（不立即跳转）
  const user = getCurrentUser();
  if (user) saveToSlot(user.userId, saveSlot + 1, saveData);
}

function toggleBestHandHighlight() {
  bestHandHighlightOn = !bestHandHighlightOn;
  const btn = document.getElementById('btn-best-hand');
  if (btn) btn.classList.toggle('active', bestHandHighlightOn);
  renderBestHandHighlight();
}

function renderBestHandHighlight() {
  document.querySelectorAll('.dcard.highlight').forEach(el => el.classList.remove('highlight'));
  const rankLabel = document.getElementById('bestHandRankLabel');
  if (rankLabel) rankLabel.textContent = '';

  if (!bestHandHighlightOn || !pokerGame || !pokerGame.humanPlayer) return;

  const hp = pokerGame.humanPlayer;
  const allCards = (hp.holeCards || []).concat(pokerGame.communityCards || []);
  if (allCards.length === 0) return;

  const evalResult = evaluateHand(allCards);
  const rankName = formatHandRank(evalResult);
  if (rankLabel) rankLabel.textContent = rankName;

  let bestCards = [];
  if (allCards.length >= 5 && pokerGame.getBest5Cards) {
    bestCards = pokerGame.getBest5Cards(hp);
  } else {
    bestCards = allCards;
  }

  // 防御：如果 getBest5Cards 返回空但牌够 5 张，回退到全部可用牌
  if (allCards.length >= 5 && bestCards.length === 0) {
    bestCards = allCards;
  }

  // 用引用匹配，避免字符串拼接问题
  const bestSet = new Set(bestCards);

  const tsCards = document.getElementById('tianshiCards');
  if (tsCards) {
    tsCards.querySelectorAll('.dcard').forEach((el, i) => {
      const c = pokerGame.communityCards[i];
      if (c && bestSet.has(c)) el.classList.add('highlight');
    });
  }

  const pc1 = document.getElementById('pCard1');
  const pc2 = document.getElementById('pCard2');
  if (pc1 && hp.holeCards[0] && bestSet.has(hp.holeCards[0])) pc1.classList.add('highlight');
  if (pc2 && hp.holeCards[1] && bestSet.has(hp.holeCards[1])) pc2.classList.add('highlight');
}

function showHandResult() {
  const body = document.getElementById('handResultBody');
  const wrap = document.getElementById('handResultWrap');
  try {
    const phaseMap = { preflop: '天机晦暗', flop: '天机初现', turn: '天命流转', river: '尘埃落定', showdown: '揭晓', ended: '间歇', idle: '准备' };
    let html = '<div style="font-size:13px; line-height:1.8; color:#2f3d36;">';

    const winners = (pokerGame && pokerGame.winners) || [];
    const returnedBets = (pokerGame && pokerGame.returnedBets) || [];
    const winMap = new Map();
    const returnMap = new Map();

    winners.forEach(w => {
      if (!w || !w.player) return;
      const key = w.player.id;
      const prev = winMap.get(key);
      if (prev) prev.amount += w.amount;
      else winMap.set(key, { player: w.player, amount: w.amount });
    });

    returnedBets.forEach(r => {
      if (!r || !r.player) return;
      returnMap.set(r.player.id, (returnMap.get(r.player.id) || 0) + r.amount);
    });

    const winnerRows = Array.from(winMap.values());
    if (winnerRows.length > 0) {
      html += '<div style="background:rgba(140,160,120,0.15); border:1px solid rgba(100,130,90,0.35); border-radius:8px; padding:10px 14px; margin-bottom:12px; text-align:center;">';
      winnerRows.forEach(w => {
        const isHuman = w.player.isHuman;
        html += `<div style="font-size:15px; font-weight:bold; color:${isHuman ? '#4a6a4a' : '#5a6b62'};">
          🏆 ${w.player.name}${isHuman ? '（你）' : ''} 夺得 ${w.amount.toLocaleString()} 气运
        </div>`;
      });
      html += '</div>';
    }

    const sidePots = (pokerGame && pokerGame.sidePots) || [];
    if (sidePots.length > 0 || returnedBets.length > 0) {
      html += '<div style="margin-bottom:10px; font-weight:bold; color:#4a6a4a;">奖池解释：</div>';
      html += '<div style="display:flex; flex-direction:column; gap:6px; margin-bottom:14px;">';
      sidePots.forEach((pot, idx) => {
        const title = idx === 0 ? '主池' : `边池 ${idx}`;
        const eligibleNames = (pot.eligiblePlayers || []).map(p => p.name + (p.isHuman ? '（你）' : '')).join('、') || '无';
        const potWinners = winners.filter(w => w && w.potIndex === idx);
        const winnerText = potWinners.length > 0
          ? potWinners.map(w => `${w.player.name}${w.player.isHuman ? '（你）' : ''} +${w.amount.toLocaleString()}`).join('、')
          : '未产生胜者';
        html += `<div style="padding:8px 10px; border:1px solid rgba(100,130,90,0.22); border-radius:8px; background:rgba(255,255,255,0.45);">
          <div><b>${title}</b>：${pot.amount.toLocaleString()} 气运</div>
          <div style="font-size:12px; color:#69766c;">可争夺者：${eligibleNames}</div>
          <div style="font-size:12px; color:#4a6a4a;">归属：${winnerText}</div>
        </div>`;
      });
      returnedBets.forEach(r => {
        html += `<div style="padding:8px 10px; border:1px solid rgba(160,130,70,0.25); border-radius:8px; background:rgba(255,245,220,0.55);">
          <b>未被跟注退回</b>：${r.player.name}${r.player.isHuman ? '（你）' : ''} 退回 ${r.amount.toLocaleString()} 气运
          <div style="font-size:12px; color:#7a6a4f;">这部分筹码没有其他人匹配，不属于主池或边池奖金。</div>
        </div>`;
      });
      html += '</div>';
    }

    // 天时牌展示
    if (pokerGame && pokerGame.communityCards && pokerGame.communityCards.length > 0) {
      html += '<div style="margin-bottom:8px; font-weight:bold; color:#4a6a4a;">天时牌：</div>';
      html += '<div style="display:flex; gap:4px; margin-bottom:14px; flex-wrap:wrap;">';
      html += pokerGame.communityCards.map(c => miniCardDiv(c)).join('');
      html += '</div>';
    }

    // 亮出所有参与本局玩家的手牌 + 最佳五张（包括已弃牌者和刚出局者）
    const revealPlayers = (pokerGame && pokerGame.players) ? pokerGame.players.filter(p => p.holeCards && p.holeCards.length >= 2) : [];
    html += '<div style="margin-bottom:10px; font-weight:bold; color:#4a6a4a;">所有人手牌：</div>';
    revealPlayers.forEach(p => {
      try {
        const wonAmt = winMap.get(p.id)?.amount || 0;
        const returnedAmt = returnMap.get(p.id) || 0;
        const startChips = Number.isFinite(p.handStartChips) ? p.handStartChips : (p.chips + p.totalBet - wonAmt - returnedAmt);
        const invested = p.totalBet || 0;
        const net = p.chips - startChips;
        const holeHtml = (p.holeCards || []).map(c => miniCardDiv(c)).join('');
        const allCards = (p.holeCards || []).concat((pokerGame && pokerGame.communityCards) || []);
        let best5Html = '';
        let rankName = '未知';
        if (allCards.length > 0) {
          const evalResult = evaluateHand(allCards);
          rankName = formatHandRank(evalResult);
          let best5 = [];
          if (pokerGame.getBest5Cards && allCards.length >= 5) {
            best5 = pokerGame.getBest5Cards(p);
          } else {
            best5 = allCards;
          }
          best5Html = best5.map(c => miniCardDiv(c)).join('') || '<span style="color:#999; font-size:11px;">—</span>';
        }
        const isFolded = p.folded;
        const isEliminated = p.eliminated;
        const foldInfo = isFolded ? `<span style="margin-left:6px; color:#999; font-size:11px;">（已弃牌${p.foldRound ? ' · ' + (phaseMap[p.foldRound] || p.foldRound) : ''}）</span>` : '';
        const elimInfo = isEliminated ? '<span style="margin-left:6px; color:#c05050; font-size:11px;">已出局</span>' : '';
        const netText = net >= 0 ? `+${net.toLocaleString()}` : net.toLocaleString();
        const netColor = net >= 0 ? '#4a6a4a' : '#b0554f';
        html += `<div class="reveal-card ${wonAmt > 0 ? 'winner' : ''}" style="${isFolded ? 'opacity:0.6;' : ''}">
          <div class="rc-name">${p.name} ${p.isHuman ? '（你）' : ''}${elimInfo}${foldInfo}${wonAmt > 0 ? '<span style="margin-left:6px; color:#4a6a4a; font-size:11px;">🏆 +' + wonAmt.toLocaleString() + '</span>' : ''}</div>
          <div style="margin:4px 0; color:#8a8a78; font-size:11px;">底牌：</div>
          <div class="rc-hand" style="display:flex; gap:4px; margin:4px 0;">${holeHtml}</div>
          <div style="margin:6px 0 4px; color:#8a8a78; font-size:11px;">最佳五张：</div>
          <div class="rc-hand" style="display:flex; gap:4px; margin:4px 0;">${best5Html}</div>
          <div class="rc-best">牌型：<span style="color:#4a6a4a; font-weight:bold;">${rankName}</span></div>
          <div style="margin-top:6px; padding-top:6px; border-top:1px dashed rgba(100,130,90,0.25); font-size:12px; color:#5c675f;">
            起始 ${startChips.toLocaleString()} ｜ 投入 ${invested.toLocaleString()} ｜ 赢得 ${wonAmt.toLocaleString()} ｜ 退回 ${returnedAmt.toLocaleString()} ｜ 净变化 <span style="color:${netColor}; font-weight:bold;">${netText}</span> ｜ 剩余 ${(p.chips || 0).toLocaleString()}
          </div>
        </div>`;
      } catch (perPlayerErr) {
        console.error('showHandResult player render error:', p && p.name, perPlayerErr);
        html += `<div style="padding:6px; color:#c05050; font-size:12px;">${p && p.name ? p.name : '未知玩家'} 数据渲染异常</div>`;
      }
    });

    // 筹码变化
    html += '<div style="margin-top:10px; font-weight:bold; color:#4a6a4a;">本局后筹码：</div>';
    if (pokerGame && pokerGame.players) {
      pokerGame.players.forEach(p => {
        if (p.eliminated) {
          html += `<div>${p.name}：已出局</div>`;
        } else {
          html += `<div>${p.name}：${(p.chips || 0).toLocaleString()} 气运</div>`;
        }
      });
    }

    html += '</div>';
    body.innerHTML = html;
  } catch (e) {
    console.error('showHandResult fatal error:', e);
    body.innerHTML = '<div style="padding:10px;">牌局已结束，点击确认继续。</div>';
  }
  wrap.style.display = 'flex';
}

function endGame(won) {
  clearInterval(tickInterval);
  saveData.status = won ? '飞升成功' : '身死道消';
  const user = getCurrentUser();
  if (user) saveToSlot(user.userId, saveSlot + 1, saveData);

  document.getElementById('arenaWrap').style.display = 'none';
  document.getElementById('intermissionWrap').style.display = 'none';
  document.getElementById('handResultWrap').style.display = 'none';
  document.getElementById('endingWrap').style.display = 'flex';

  const title = document.getElementById('endingTitle');
  const text = document.getElementById('endingText');

  if (won) {
    title.textContent = '飞升上界';
    text.textContent = `赌斗台上，最后一人立于血泊之中。\n四周寂静无声，只有脚下石台的裂纹在缓缓蔓延。那些符文亮了又灭，灭了又亮，像是在咀嚼这场漫长赌局中所有逝去的气运。\n低下头，你看见自己的影子正在消失。\n不是被光吞没，而是被某种更深沉的东西抽离——仿佛有另一片天空正在头顶上撕开裂缝，不属于此界的风吹进来，带着陌生的气息和遥远的花香。\n石台开始震颤，那些符文终于全部亮起，炽烈如一轮坠落的太阳。\n你感觉自己的身体在变轻，像是被一只无形的手托举着往上飘。耳边的风声越来越大，混杂着无数呢喃——是那些输掉的人，那些消散的魂魄，那些被赌局吞噬的一切。\n你没有回头。\n前方是一片刺目的白光，温暖得像记忆中某个春天的午后。\n你不知道那边有什么。\n但是你没有丝毫犹豫，走进了那片白光之中。从此大陆上，只剩下你的传说……`;
  } else {
    title.textContent = '身死道消';
    text.textContent = '气运被夺，身死道消。赌命台上，你终究没能走到最后。';
  }
}

function handleGM(text) {
  if (!text.startsWith('/')) return;
  const parts = text.trim().split(' ');
  const cmd = parts[0];
  const hp = pokerGame?.humanPlayer;

  if (cmd === '/add' && hp) {
    const amt = parseInt(parts[1]) || 0;
    hp.chips += amt;
    render();
  } else if (cmd === '/win') {
    endGame(true);
  } else if (cmd === '/lose') {
    if (hp) hp.chips = 0;
    endGame(false);
  } else if (cmd === '/skip') {
    onHandEnded();
  } else if (cmd === '/kill' && parts[1]) {
    const target = pokerGame.players.find(p => p.name.includes(parts[1]));
    if (target) { target.chips = 0; target.eliminated = true; render(); }
  }
}

async function doSave(context) {
  const user = getCurrentUser();
  if (!user) return;
  if (pokerGame?.humanPlayer) saveData.chips = pokerGame.humanPlayer.chips;

  // 无论牌局内还是间歇，都弹出档位选择
  const saves = await getSaveSlots(user.userId);
  let html = '<div style="display:flex;flex-direction:column;gap:8px;">';
  saves.forEach((s, i) => {
    if (s && s.save_data) {
      const dur = formatDuration(s.save_data.playDuration || 0);
      html += `<div class="slot-item" onclick="saveToChosenSlot(${i})"><div class="slot-name">${s.save_data.playerName || '无名修士'}</div><div class="slot-info">职业: ${s.save_data.profession || '未知'} | 气运: ${(s.save_data.chips || 0).toLocaleString()} | 第${s.save_data.round || 1}局 | 时长: ${dur}</div></div>`;
    } else {
      html += `<div class="slot-item" onclick="saveToChosenSlot(${i})">存档${i+1}：空空如也</div>`;
    }
  });
  html += '</div>';
  showModal('选择存档位', html);
}

async function saveToChosenSlot(slotIndex) {
  closeModal();
  const user = getCurrentUser();
  if (saveSlot === slotIndex) {
    await saveToSlot(user.userId, slotIndex + 1, saveData);
    showModal('保存成功', '当前进度已保存。');
    return;
  }
  showConfirm('确认保存', `确定要保存到存档${slotIndex + 1}吗？${saveSlot !== slotIndex ? '这将覆盖该档位原有的存档。' : ''}`, async () => {
    await saveToSlot(user.userId, slotIndex + 1, saveData);
    saveSlot = slotIndex;
    showModal('保存成功', '进度已保存到指定档位。');
  });
}

async function doLoad() {
  const user = getCurrentUser();
  if (!user) return;
  showConfirm('确认读取存档', '读取其他存档将覆盖当前未保存的牌局进度，是否继续？', async () => {
    try {
      const saves = await getSaveSlots(user.userId);
      let html = '<div style="display:flex;flex-direction:column;gap:8px;">';
      saves.forEach((s, i) => {
        if (s && s.save_data) {
          html += `<button onclick="window.location.href='battle.html?slot=${i}'" style="padding:8px;border:1px solid rgba(140,150,130,0.3);border-radius:6px;background:rgba(140,150,130,0.1);color:#2f3d36;cursor:pointer;text-align:left;font-family:inherit;">存档${i+1}：${s.save_data.playerName || '无名'} — 气运${s.save_data.chips || 0}</button>`;
        } else {
          html += `<div style="padding:8px;color:#666;">存档${i+1}：空空如也</div>`;
        }
      });
      html += '</div>';
      showModal('读取存档', html);
    } catch (e) {
      console.error('doLoad error:', e);
      showModal('读取失败', '读取存档时出错：' + (e.message || '未知错误'));
    }
  });
}

function confirmReturnMenu() {
  showConfirm('确认返回', '返回主选单将自动保存当前进度，确认吗？', async () => {
    const user = getCurrentUser();
    if (user && pokerGame?.humanPlayer) {
      saveData.chips = pokerGame.humanPlayer.chips;
      const now = Date.now();
      const delta = Math.floor((now - lastTickTime) / 1000);
      if (delta > 0) {
        saveData.playDuration = (saveData.playDuration || 0) + delta;
      }
      await saveToSlot(user.userId, saveSlot + 1, saveData);
    }
    window.location.href = 'menu.html';
  });
}

function showRules() {
  const html = `
    <div class="rule-section"><h5>一、基本设定</h5><p>六名修士围坐斗法台，以各自的气运为注进行争夺。每人开局获得两张「地利牌」（仅自己可见）。斗法台中央将逐次翻开五张「天时牌」（所有人可见）。最终根据天时牌与地利牌组合出的牌型强弱，分配气运池。</p></div>
    <div class="rule-section"><h5>二、牌面说明</h5><p>每张牌包含两种信息：天干与五行（🌊玄水寒冰♠、🔥离火真炎♥、🌿乙木长生♣、⚔️庚金剑气♦）。数字牌A-10对应天干甲、乙、丙、丁、戊、己、庚、辛、壬、癸，字母牌JQK对应日、月、星。</p></div>
    <div class="rule-section"><h5>三、牌型强弱（从强到弱）</h5><div class="rule-rank">同花顺：万法归一 &nbsp;|&nbsp; 四条：四象镇守 &nbsp;|&nbsp; 葫芦：三才两仪 &nbsp;|&nbsp; 同花：五行合一 &nbsp;|&nbsp; 顺子：七星连珠 &nbsp;|&nbsp; 三条：三花聚顶 &nbsp;|&nbsp; 两对：阴阳双生 &nbsp;|&nbsp; 一对：阴阳和合 &nbsp;|&nbsp; 高牌：孤星</div></div>
    <div class="rule-section"><h5>四、斗法流程</h5><p>① 天机晦暗：获得地利牌，开始第一轮下注。<br>② 天机初现：翻开前三张天时牌，下注。<br>③ 天命流转：翻开第四张天时牌，下注。<br>④ 尘埃落定：翻开第五张天时牌，下注。<br>⑤ 揭晓：未遁走的修士亮出地利牌，比较牌型，强者夺运。</p></div>
    <div class="rule-section"><h5>五、行动选择</h5><p>敛息遁走：放弃本轮，不再参与争夺。<br>静观其变：不注入气运，继续观望。<br>接招：跟随当前最高注额注入气运。<br>加注气运：提高注额，要求他人跟进。<br>本源全倾：将全部剩余气运一次注入。</p></div>
    <div class="rule-section"><h5>六、胜负规则</h5><p>· 牌型最大者赢得气运池中全部气运。<br>· 若所有人都遁走，则最后下注者独得气运池。<br>· 气运归零者身死道消，离场。<br>· 撑过所有局数且气运尚存者，飞升上界。</p></div>
  `;
  showModal('玩法说明', html);
}

function showSkillModal() {
  const html = `
    <div class="rule-section"><h5>人和 · 技能</h5><p>当前版本暂未开放技能系统。</p><p>在完整版中，每位修士将根据自身职业携带独特技能，可在牌局中改变局势。</p></div>
  `;
  showModal('技能详情', html);
}

function toggleMobileLog() {
  const sheet = document.getElementById('mobileLogSheet');
  if (sheet) sheet.classList.toggle('expanded');
}

window.addEventListener('DOMContentLoaded', init);
window.addEventListener('beforeunload', () => {
  if (tickInterval) clearInterval(tickInterval);
});
