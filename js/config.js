// js/config.js
// ⚠️ 请把下面的占位符替换为你 Supabase 项目的真实值
const SUPABASE_URL = 'https://sloixtzjuvyxryjaljb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsb2l4dGp6dXZ5Ynh5cmphbGpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMTM3NDQsImV4cCI6MjA5NjU4OTc0NH0.kOd3D0rBDbZ95QgnlvvExbAXcTPW5_Y5u3-Ie_xPUyQ';

let supabaseClient = null;
let supabaseReady = false;

function initSupabase() {
    // Supabase 已禁用，全部使用 localStorage
    supabaseReady = false;
    console.log('Supabase 已禁用，使用本地存储');
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSupabase);
} else {
    initSupabase();
}
