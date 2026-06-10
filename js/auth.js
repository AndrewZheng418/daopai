// js/auth.js
// Authentication: username + SHA-256, dual backend

const AUTH_SESSION_KEY = STORAGE_PREFIX + 'session';

async function register(username, password, displayName) {
  if (!validateUserId(username)) throw new Error('账号仅限小写英文和数字，最长32位');
  if (!validatePassword(password)) throw new Error('密码仅限字母、数字、下划线，最长20位');

  const existing = await getUserByUsername(username);
  if (existing) throw new Error('该账号已存在');

  const hash = await hashPassword(password);
  const user = await createUser({
    username,
    password_hash: hash,
    display_name: displayName || username
  });

  const session = { userId: user.id, username: user.username, displayName: user.display_name };
  localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
  return session;
}

async function login(username, password) {
  if (!validateUserId(username)) throw new Error('账号格式错误');

  const user = await getUserByUsername(username);
  if (!user) throw new Error('账号不存在');

  const hash = await hashPassword(password);
  if (user.password_hash !== hash) throw new Error('密码错误');

  const session = { userId: user.id, username: user.username, displayName: user.display_name };
  localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
  return session;
}

function logout() {
  localStorage.removeItem(AUTH_SESSION_KEY);
}

function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_SESSION_KEY) || 'null');
  } catch {
    return null;
  }
}
