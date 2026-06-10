// js/storage.js
// Dual-backend storage: Supabase primary, localStorage fallback

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
  if (typeof supabaseReady !== 'undefined' && supabaseReady && typeof supabaseClient !== 'undefined' && supabaseClient) {
    const { data, error } = await supabaseClient
      .from('users')
      .select('*')
      .eq('username', username)
      .single();
    if (!error) return data;
    console.warn('Supabase getUserByUsername failed', error);
  }
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
  if (typeof supabaseReady !== 'undefined' && supabaseReady && typeof supabaseClient !== 'undefined' && supabaseClient) {
    const { data, error } = await supabaseClient
      .from('users')
      .insert([payload])
      .select()
      .single();
    if (!error && data) return data;
    console.warn('Supabase createUser failed, falling back', error);
  }
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
  let saves = [];
  if (typeof supabaseReady !== 'undefined' && supabaseReady && typeof supabaseClient !== 'undefined' && supabaseClient) {
    const { data, error } = await supabaseClient
      .from('saves')
      .select('*')
      .eq('user_id', userId)
      .order('slot_number', { ascending: true });
    if (!error && data) saves = data;
    else console.warn('Supabase getSaveSlots failed', error);
  } else {
    const key = STORAGE_PREFIX + 'saves_' + userId;
    saves = getLocalArray(key);
  }
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
  if (typeof supabaseReady !== 'undefined' && supabaseReady && typeof supabaseClient !== 'undefined' && supabaseClient) {
    const { data, error } = await supabaseClient
      .from('saves')
      .upsert(payload, { onConflict: ['user_id', 'slot_number'] })
      .select()
      .single();
    if (!error && data) return data;
    console.warn('Supabase saveToSlot failed, falling back', error);
  }
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
  if (typeof supabaseReady !== 'undefined' && supabaseReady && typeof supabaseClient !== 'undefined' && supabaseClient) {
    const { error } = await supabaseClient
      .from('saves')
      .delete()
      .eq('user_id', userId)
      .eq('slot_number', slotNumber);
    if (!error) return true;
  }
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
  if (typeof supabaseReady !== 'undefined' && supabaseReady && typeof supabaseClient !== 'undefined' && supabaseClient) {
    const { data, error } = await supabaseClient
      .from('users')
      .select('*')
      .eq('id', session.userId)
      .single();
    if (!error && data) return data;
  }
  const users = getLocalArray(STORAGE_PREFIX + 'users');
  return users.find(u => u.id === session.userId) || null;
}

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
