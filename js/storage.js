// js/storage.js
// localStorage only + JSON export/import

const STORAGE_PREFIX = 'daopai_';

function getLocalArray(key) {
  try {
    const val = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(val) ? val : [];
  } catch {
    return [];
  }
}

function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// --- Users ---

async function getUserByUsername(username) {
  const users = getLocalArray(STORAGE_PREFIX + 'users');
  return users.find(u => u.username === username) || null;
}

async function createUser({ username, password_hash, display_name }) {
  const payload = {
    id: generateId(),
    username,
    password_hash,
    display_name: display_name || username,
    created_at: new Date().toISOString()
  };
  const key = STORAGE_PREFIX + 'users';
  const users = getLocalArray(key);
  if (users.find(u => u.username === username)) {
    throw new Error('该用户名已被占用');
  }
  users.push(payload);
  localStorage.setItem(key, JSON.stringify(users));
  return payload;
}

// --- Saves ---

async function getSaveSlots(userId) {
  if (!userId) return [null, null, null];
  const key = STORAGE_PREFIX + 'saves_' + userId;
  const saves = getLocalArray(key);
  const slots = [null, null, null];
  for (const s of saves) {
    const idx = (typeof s.slot_number !== 'undefined' ? s.slot_number : s.slot) - 1;
    if (idx >= 0 && idx < 3) slots[idx] = s;
  }
  return slots;
}

async function saveToSlot(userId, slotNumber, saveData) {
  if (!userId || slotNumber < 1 || slotNumber > 3) throw new Error('无效的存档位');
  const payload = {
    user_id: userId,
    slot_number: slotNumber,
    save_data: saveData,
    updated_at: new Date().toISOString()
  };
  const key = STORAGE_PREFIX + 'saves_' + userId;
  const saves = getLocalArray(key);
  const idx = saves.findIndex(s => (typeof s.slot_number !== 'undefined' ? s.slot_number : s.slot) === slotNumber);
  const record = { ...payload, id: generateId() };
  if (idx >= 0) saves[idx] = record;
  else saves.push(record);
  localStorage.setItem(key, JSON.stringify(saves));
  return record;
}

async function deleteSlot(userId, slotNumber) {
  if (!userId) return false;
  const key = STORAGE_PREFIX + 'saves_' + userId;
  const saves = getLocalArray(key);
  const filtered = saves.filter(s => (typeof s.slot_number !== 'undefined' ? s.slot_number : s.slot) !== slotNumber);
  localStorage.setItem(key, JSON.stringify(filtered));
  return true;
}

// --- Legacy convenience wrappers ---

async function getUserData() {
  const session = JSON.parse(localStorage.getItem(STORAGE_PREFIX + 'session') || 'null');
  if (!session || !session.userId) return null;
  const users = getLocalArray(STORAGE_PREFIX + 'users');
  return users.find(u => u.id === session.userId) || null;
}

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// --- JSON export/import ---

function exportSavesToJSON(userId) {
  const key = STORAGE_PREFIX + 'saves_' + userId;
  const saves = getLocalArray(key);
  const blob = new Blob([JSON.stringify(saves, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `daopai_saves_${userId}_${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function importSavesFromJSON(userId, file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!Array.isArray(data)) throw new Error('存档文件格式不正确，应为数组');
        const key = STORAGE_PREFIX + 'saves_' + userId;
        localStorage.setItem(key, JSON.stringify(data));
        resolve(data);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsText(file);
  });
}
