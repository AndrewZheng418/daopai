// js/main.js

const MENU_DATA = {
  qi: {
    text: '开始全新的剧情故事，你将化身神秘修士，以身入局，你能否逆天改命，夺取气运，登临仙门？',
    action: 'newgame'
  },
  cheng: {
    text: '读取已有的剧情故事存档，继续你的修仙之路。',
    action: 'load'
  },
  zhuan: {
    text: '每个玩法都是一个全新的世界，你准备好了吗？',
    action: 'dev'
  },
  he: {
    text: '与你的好友共同进行一场畅快淋漓的道牌斗法吧！',
    action: 'dev'
  }
};

window.addEventListener('DOMContentLoaded', async () => {
  const user = getCurrentUser();
  if (!user) {
    window.location.href = 'index.html';
    return;
  }

  const hitems = document.querySelectorAll('.menu-hitem');
  const detailBox = document.getElementById('menuDetail');
  const mdText = document.getElementById('mdText');
  const mdEnter = document.getElementById('mdEnter');
  let currentAction = '';

  hitems.forEach(item => {
    item.addEventListener('click', () => {
      hitems.forEach(el => el.classList.remove('active'));
      item.classList.add('active');

      const key = item.dataset.target;
      const data = MENU_DATA[key];
      mdText.textContent = data.text;
      currentAction = data.action;

      if (data.action === 'dev') {
        mdEnter.textContent = '进入';
        mdEnter.disabled = true;
        mdEnter.style.opacity = '0.5';
      } else {
        mdEnter.textContent = '进入';
        mdEnter.disabled = false;
        mdEnter.style.opacity = '1';
      }
      detailBox.style.display = 'block';
    });
  });

  mdEnter.addEventListener('click', async () => {
    if (currentAction === 'newgame') {
      window.location.href = 'story.html';
    } else if (currentAction === 'load') {
      const saves = await getSaveSlots(user.userId);
      openSaveModal(saves);
    } else if (currentAction === 'dev') {
      showModal('提示', '功能开发中，敬请期待！');
    }
  });

  document.getElementById('settings-btn')?.addEventListener('click', () => {
    showModal('设置', '暂无可用设置项');
  });

  document.getElementById('logout-btn-menu').addEventListener('click', () => {
    showConfirm('确认返回', '是否返回登录？', () => {
      logout();
      window.location.href = 'index.html';
    });
  });
});

function openSaveModal(saves) {
  let html = '<div style="display:flex;flex-direction:column;gap:8px;">';
  saves.forEach((s, i) => {
    if (s && s.save_data) {
      const dur = formatDuration(s.save_data.playDuration || 0);
      html += `<div class="slot-item" onclick="loadSave(${i})"><div class="slot-name">${s.save_data.playerName || '无名修士'}</div><div class="slot-info">职业: ${s.save_data.profession || '未知'} | 气运: ${(s.save_data.chips || 0).toLocaleString()} | 进度: 第${s.save_data.round || 1}局 | 状态: ${s.save_data.status || '进行中'} | 时长: ${dur}</div></div>`;
    } else {
      html += `<div class="slot-item empty">存档${i+1}：空空如也</div>`;
    }
  });
  html += '</div>';
  showModal('读取存档', html);
}

function loadSave(slotIndex) {
  closeModal();
  window.location.href = 'battle.html?slot=' + slotIndex;
}
