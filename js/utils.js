// js/utils.js

// ===== 弹窗系统 =====
function showModal(title, content) {
    let overlay = document.getElementById('global-modal-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'global-modal-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(60,65,55,0.35);display:none;justify-content:center;align-items:center;z-index:100;';
        overlay.innerHTML = `
            <div id="global-modal-box" style="background:#e0dcd4;border:1px solid rgba(140,150,130,0.35);border-radius:12px;padding:22px 26px;max-width:440px;max-height:82vh;overflow-y:auto;text-align:left;">
                <h4 id="global-modal-title" style="color:#6b7d73;margin-bottom:14px;font-size:16px;text-align:center;"></h4>
                <div id="global-modal-content" style="color:#5a6b62;font-size:13px;line-height:1.8;"></div>
                <button onclick="closeModal()" style="display:block;margin:16px auto 0;padding:7px 26px;border:1px solid rgba(140,150,130,0.4);border-radius:6px;background:rgba(140,150,130,0.12);color:#2f3d36;font-family:inherit;cursor:pointer;">知道了</button>
            </div>
        `;
        overlay.addEventListener('click', function(e) {
            if (e.target === overlay) closeModal();
        });
        document.body.appendChild(overlay);
    }
    document.getElementById('global-modal-title').textContent = title;
    const contentEl = document.getElementById('global-modal-content');
    if (typeof content === 'string') {
        contentEl.innerHTML = content;
    } else {
        contentEl.innerHTML = '';
        contentEl.appendChild(content);
    }
    overlay.style.display = 'flex';
}

function closeModal() {
    const overlay = document.getElementById('global-modal-overlay');
    if (overlay) overlay.style.display = 'none';
}

function showConfirm(title, message, onConfirm) {
    const box = document.createElement('div');
    box.innerHTML = '<p style="margin-bottom:16px;">' + message + '</p>';
    const btns = document.createElement('div');
    btns.style.cssText = 'display:flex;gap:10px;justify-content:center;';
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = '取消';
    cancelBtn.style.cssText = 'padding:6px 18px;border:1px solid rgba(140,150,130,0.3);border-radius:6px;background:rgba(140,150,130,0.1);color:#2f3d36;font-family:inherit;cursor:pointer;';
    cancelBtn.onclick = closeModal;
    const okBtn = document.createElement('button');
    okBtn.textContent = '确认';
    okBtn.style.cssText = 'padding:6px 18px;border:1px solid rgba(130,150,110,0.5);border-radius:6px;background:rgba(140,150,130,0.25);color:#4a6a4a;font-family:inherit;cursor:pointer;';
    okBtn.onclick = function() { closeModal(); if (onConfirm) onConfirm(); };
    btns.appendChild(cancelBtn);
    btns.appendChild(okBtn);
    box.appendChild(btns);
    showModal(title, box);
}

// ===== 格式化时间 =====
function formatDuration(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

// ===== 密码哈希 =====
async function hashPassword(password) {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
        try {
            const encoder = new TextEncoder();
            const data = encoder.encode(password);
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        } catch (e) {
            // crypto.subtle 在 file:// 等非安全上下文会抛错，使用纯 JS fallback
        }
    }
    return sha256Fallback(password);
}

function sha256Fallback(str) {
    const K = [
        0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
        0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
        0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
        0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
        0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
        0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
        0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
        0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
    ];
    let H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];

    const bytes = new TextEncoder().encode(str);
    const bitLen = bytes.length * 8;
    const padded = Array.from(bytes);
    padded.push(0x80);
    while ((padded.length * 8 + 64) % 512 !== 0) padded.push(0);
    for (let i = 7; i >= 0; i--) padded.push((bitLen >>> (i * 8)) & 0xff);

    const rotr = (n, x) => ((x >>> n) | (x << (32 - n))) >>> 0;
    const ch = (x, y, z) => (x & y) ^ (~x & z);
    const maj = (x, y, z) => (x & y) ^ (x & z) ^ (y & z);
    const ep0 = x => rotr(2, x) ^ rotr(13, x) ^ rotr(22, x);
    const ep1 = x => rotr(6, x) ^ rotr(11, x) ^ rotr(25, x);
    const sig0 = x => rotr(7, x) ^ rotr(18, x) ^ (x >>> 3);
    const sig1 = x => rotr(17, x) ^ rotr(19, x) ^ (x >>> 10);

    for (let i = 0; i < padded.length; i += 64) {
        const w = [];
        for (let t = 0; t < 16; t++) {
            w[t] = ((padded[i + t*4] << 24) | (padded[i + t*4 + 1] << 16) | (padded[i + t*4 + 2] << 8) | padded[i + t*4 + 3]) >>> 0;
        }
        for (let t = 16; t < 64; t++) {
            w[t] = (sig1(w[t-2]) + w[t-7] + sig0(w[t-15]) + w[t-16]) >>> 0;
        }
        let [a,b,c,d,e,f,g,h] = H;
        for (let t = 0; t < 64; t++) {
            const t1 = (h + ep1(e) + ch(e,f,g) + K[t] + w[t]) >>> 0;
            const t2 = (ep0(a) + maj(a,b,c)) >>> 0;
            h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
        }
        H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
        H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
    }
    return H.map(h => h.toString(16).padStart(8,'0')).join('');
}

// ===== 校验规则 =====
function validateUserId(userId) {
    const regex = /^[a-z0-9]{1,32}$/;
    return regex.test(userId);
}
function validatePassword(password) {
    const regex = /^[a-zA-Z0-9_]{1,20}$/;
    return regex.test(password);
}
function validatePlayerName(name) {
    const regex = /^[\u4e00-\u9fa5a-zA-Z0-9]{1,6}$/;
    return regex.test(name);
}
