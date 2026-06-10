// js/game.js

// ===== 当前存档数据 =====
let currentSave = null;
let currentSlotIndex = -1;

// ===== 页面加载 =====
window.onload = function() {
    const currentUser = getCurrentUser();
    if (!currentUser) {
        window.location.href = 'index.html';
        return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const slotParam = urlParams.get('slot');
    if (slotParam === null) {
        alert('没有指定存档，返回主选单。');
        window.location.href = 'menu.html';
        return;
    }

    currentSlotIndex = parseInt(slotParam);
    const saves = getSaveSlots();
    currentSave = saves[currentSlotIndex];

    if (!currentSave) {
        alert('存档数据丢失，返回主选单。');
        window.location.href = 'menu.html';
        return;
    }

    updateDisplay();
};

// ===== 更新界面 =====
function updateDisplay() {
    if (!currentSave) return;

    document.getElementById('player-name').textContent = currentSave.playerName || '无名修士';
    document.getElementById('player-profession').textContent = currentSave.profession || '未知';
    document.getElementById('player-chips').textContent = (currentSave.chips || 0).toLocaleString();
    document.getElementById('player-story').textContent = currentSave.characterDesc || '暂无记录';

    const round = currentSave.round || 1;
    const totalRounds = currentSave.totalRounds || 5;
    document.getElementById('tournament-progress').textContent = `第 ${round} / ${totalRounds} 局`;

    const remainingPlayers = Math.max(2, 9 - (round - 1));
    document.getElementById('remaining-players').textContent = remainingPlayers + ' 人';

    const progressPercent = ((round - 1) / (totalRounds - 1)) * 100;
    document.getElementById('progress-fill').style.width = Math.min(progressPercent, 100) + '%';
}

// ===== 开始下一局 =====
function startNextRound() {
    if (!currentSave) return;

    if (currentSave.chips <= 0) {
        showModal('气运已尽', '你的筹码已经归零，无法继续比赛。', [
            { text: '读取存档', action: () => { openLoadModal(); } },
            { text: '返回主选单', action: () => { window.location.href = 'menu.html'; } }
        ]);
        return;
    }

    if (currentSave.round > currentSave.totalRounds) {
        showModal('恭喜飞升', '你已经赢得了所有比赛，成功飞升上界！', [
            { text: '返回主选单', action: () => { window.location.href = 'menu.html'; } }
        ]);
        return;
    }

    alert('牌局进行中...（功能开发中，下一版本实现德扑核心逻辑）');
    simulateRoundResult();
}

// ===== 模拟一局结果（临时） =====
function simulateRoundResult() {
    if (!currentSave) return;

    const win = Math.random() > 0.4;
    const chipsChange = win ? Math.floor(Math.random() * 3000 + 1000) : -Math.floor(Math.random() * 2000 + 500);
    
    currentSave.chips += chipsChange;
    if (currentSave.chips < 0) currentSave.chips = 0;
    
    currentSave.round += 1;
    currentSave.status = '牌局间歇';
    currentSave.playDuration = Math.floor((Date.now() - (currentSave.startTime || Date.now())) / 1000);

    saveToSlot(currentSlotIndex, currentSave);
    updateDisplay();

    const resultText = win ? '你赢得了这一局！' : '你输掉了这一局。';
    showModal('牌局结束', `${resultText}\n当前气运：${currentSave.chips.toLocaleString()}`, [
        { text: '继续', action: () => {} }
    ]);

    if (currentSave.chips <= 0) {
        setTimeout(() => {
            showModal('身死道消', '你的气运已被夺尽，身死道消。', [
                { text: '读取存档', action: () => { openLoadModal(); } },
                { text: '重新开始', action: () => { window.location.href = 'story-intro.html'; } }
            ]);
        }, 500);
    } else if (currentSave.round > currentSave.totalRounds) {
        setTimeout(() => {
            showModal('飞升上界', '你赢得了所有比赛，成功飞升！', [
                { text: '返回主选单', action: () => { window.location.href = 'menu.html'; } }
            ]);
        }, 500);
    }
}

// ===== 打开保存存档弹窗 =====
function openSaveModal() {
    const saves = getSaveSlots();
    let slotsHtml = '';

    saves.forEach((save, index) => {
        if (save) {
            slotsHtml += `
                <div class="slot-item" onclick="selectSaveSlot(${index})">
                    <div class="slot-name">${save.playerName || '无名修士'}</div>
                    <div class="slot-info">职业: ${save.profession || '未知'} | 气运: ${(save.chips || 0).toLocaleString()} | 进度: 第${save.round || 1}局</div>
                </div>
            `;
        } else {
            slotsHtml += `
                <div class="slot-item empty" onclick="selectSaveSlot(${index})">
                    存档${index + 1}：空空如也
                </div>
            `;
        }
    });

    showModal('保存进度 - 选择存档位', slotsHtml, [
        { text: '取消', action: () => {} }
    ]);
}

// ===== 选择保存到哪个槽位 =====
function selectSaveSlot(slotIndex) {
    closeModal();
    showModal('确认保存', `确定要保存到存档${slotIndex + 1}吗？`, [
        { text: '取消', action: () => {} },
        { text: '确认保存', action: () => {
            if (currentSave) {
                currentSave.playDuration = Math.floor((Date.now() - (currentSave.startTime || Date.now())) / 1000);
                saveToSlot(slotIndex, currentSave);
                showModal('保存成功', '存档已保存。', [{ text: '确定', action: () => {} }]);
            }
        }, isConfirm: true }
    ]);
}

// ===== 打开读取存档弹窗 =====
function openLoadModal() {
    const saves = getSaveSlots();
    let slotsHtml = '';

    saves.forEach((save, index) => {
        if (save) {
            slotsHtml += `
                <div class="slot-item" onclick="selectLoadSlot(${index})">
                    <div class="slot-name">${save.playerName || '无名修士'}</div>
                    <div class="slot-info">职业: ${save.profession || '未知'} | 气运: ${(save.chips || 0).toLocaleString()} | 进度: 第${save.round || 1}局</div>
                </div>
            `;
        } else {
            slotsHtml += `
                <div class="slot-item empty">
                    存档${index + 1}：空空如也
                </div>
            `;
        }
    });

    showModal('读取进度 - 选择存档', slotsHtml, [
        { text: '取消', action: () => {} }
    ]);
}

// ===== 选择读取哪个槽位 =====
function selectLoadSlot(slotIndex) {
    closeModal();
    showModal('确认读取', '读取存档将覆盖当前未保存的进度，确定吗？', [
        { text: '取消', action: () => {} },
        { text: '确认读取', action: () => {
            const saves = getSaveSlots();
            const saveData = saves[slotIndex];
            if (saveData) {
                currentSave = saveData;
                currentSlotIndex = slotIndex;
                updateDisplay();
                showModal('读取成功', '存档已加载。', [{ text: '确定', action: () => {} }]);
            } else {
                showModal('读取失败', '该存档位没有数据。', [{ text: '确定', action: () => {} }]);
            }
        }, isConfirm: true }
    ]);
}

// ===== 玩法说明 =====
function showRules() {
    showModal('玩法说明', 
        '以最权威的 WSOP $10,000 无限注德州扑克主赛事为标准蓝本。\n\n' +
        '• 每局9人桌，逐轮淘汰\n' +
        '• 最终进入决赛桌争夺冠军\n' +
        '• 赢光所有对手的筹码即为飞升成功\n' +
        '• 筹码归零则为身死道消\n\n' +
        'GM命令（开发调试用）：\n' +
        '/add_chips [数量] - 增加筹码\n' +
        '/skip_hand - 跳过当前对局\n' +
        '/win_tournament - 直接获胜',
        [{ text: '知道了', action: () => {} }]
    );
}

// ===== 返回主选单（二次确认） =====
function confirmReturnMenu() {
    showModal('确认返回', '返回主选单后，当前进度将自动保存。', [
        { text: '取消', action: () => {} },
        { text: '确认返回', action: () => { 
            if (currentSave) {
                currentSave.playDuration = Math.floor((Date.now() - (currentSave.startTime || Date.now())) / 1000);
                saveToSlot(currentSlotIndex, currentSave);
            }
            window.location.href = 'menu.html';
        }, isConfirm: true }
    ]);
}

// ===== 弹窗系统 =====
function showModal(title, content, buttons) {
    const overlay = document.getElementById('modal-overlay');
    const titleEl = document.getElementById('modal-title');
    const messageEl = document.getElementById('modal-message');
    const buttonsEl = document.getElementById('modal-buttons');

    titleEl.textContent = title;

    if (content.startsWith('<')) {
        messageEl.innerHTML = content;
    } else {
        messageEl.textContent = content;
    }

    buttonsEl.innerHTML = '';
    buttons.forEach(btn => {
        const button = document.createElement('button');
        button.textContent = btn.text;
        if (btn.isConfirm) {
            button.className = 'confirm';
        }
        button.onclick = function() {
            closeModal();
            if (btn.action) btn.action();
        };
        buttonsEl.appendChild(button);
    });

    overlay.classList.add('active');
}

function closeModal() {
    document.getElementById('modal-overlay').classList.remove('active');
}