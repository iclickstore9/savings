'use strict';
/* ================= ธีม (โหมดสว่าง/มืด + สีหลัก) =================
 * โหลดใน <head> เพื่อใส่ธีมก่อนหน้าแสดง (ไม่กะพริบ)
 * เก็บแยกตามเครื่องใน localStorage (ไม่ซิงก์)
 */
window.Theme = (() => {
  const KEY = 'kapook-om-theme';
  const MODES = [['auto', 'ตามมือถือ'], ['light', 'สว่าง'], ['dark', 'มืด']];
  const ACCENTS = [
    ['teal', 'เขียวน้ำทะเล', '#0f766e'],
    ['blue', 'น้ำเงิน', '#1d4ed8'],
    ['purple', 'ม่วง', '#6d28d9'],
    ['pink', 'ชมพู', '#be185d'],
    ['gold', 'ทอง', '#a16207'],
    ['slate', 'เทาเข้ม', '#334155'],
  ];
  const root = document.documentElement;

  function get() {
    try {
      const t = JSON.parse(localStorage.getItem(KEY) || '{}');
      return { mode: MODES.some((m) => m[0] === t.mode) ? t.mode : 'auto', accent: ACCENTS.some((a) => a[0] === t.accent) ? t.accent : 'teal' };
    } catch {
      return { mode: 'auto', accent: 'teal' };
    }
  }

  // แถบสถานะของมือถือให้กลืนกับพื้นหลังแอป
  function syncStatusBar() {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (!meta || !document.body) return;
    meta.content = getComputedStyle(document.body).backgroundColor || '#f3f5f4';
  }

  function apply(t = get()) {
    if (t.mode === 'auto') root.removeAttribute('data-mode');
    else root.setAttribute('data-mode', t.mode);
    if (t.accent === 'teal') root.removeAttribute('data-accent');
    else root.setAttribute('data-accent', t.accent);
    syncStatusBar();
  }

  function set(patch) {
    const t = { ...get(), ...patch };
    localStorage.setItem(KEY, JSON.stringify(t));
    apply(t);
    renderPicker();
  }

  // ---------- ส่วนเลือกธีมในเมนู ⋮ ----------
  function renderPicker() {
    const box = document.getElementById('themeBox');
    if (!box) return;
    const t = get();
    // ICONS ประกาศด้วย const ใน icons.js (ไม่อยู่บน window)
    const check = typeof ICONS !== 'undefined'
      ? `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS.check}</svg>`
      : '<span class="ico">✓</span>';
    box.innerHTML = `
      <div class="segmented seg3">
        ${MODES.map(([v, label]) => `<label><input type="radio" name="themeMode" value="${v}" ${t.mode === v ? 'checked' : ''} /><span>${label}</span></label>`).join('')}
      </div>
      <div class="accent-row" role="radiogroup" aria-label="สีหลัก">
        ${ACCENTS.map(([v, label, color]) => `<button type="button" class="${t.accent === v ? 'sel' : ''}" data-accent="${v}" style="background:${color}" role="radio" aria-checked="${t.accent === v}" aria-label="${label}" title="${label}">${check}</button>`).join('')}
      </div>`;
  }

  function wire() {
    const box = document.getElementById('themeBox');
    if (!box) return;
    renderPicker();
    box.addEventListener('change', (ev) => {
      if (ev.target.name === 'themeMode') set({ mode: ev.target.value });
    });
    box.addEventListener('click', (ev) => {
      // จำกัดเฉพาะปุ่มสี (แท็ก <html> ก็มี data-accent)
      const b = ev.target.closest('button[data-accent]');
      if (b) set({ accent: b.dataset.accent });
    });
    syncStatusBar();
    matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', syncStatusBar);
  }

  apply();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();

  return { get, set, apply };
})();
