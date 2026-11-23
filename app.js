'use strict';

/* ================= ข้อมูล ================= */
const STORAGE_KEY = 'kapook-om-v1'; // อย่าเปลี่ยน — เป็นที่เก็บข้อมูล
const APP_VERSION = '11';
// ชุดข้อมูลทั้งหมด (ต้องตรงกับ NAMES ใน cloud.js)
const COLLECTIONS = ['goals', 'entries', 'txns', 'categories', 'recurring', 'plans'];
const GOAL_ICONS = [
  'house', 'shield-check', 'car', 'plane', 'graduation-cap',
  'gem', 'baby', 'heart-pulse', 'smartphone', 'gift',
  'briefcase', 'piggy-bank', 'target', 'wallet', 'coins',
];
// แปลงข้อมูลเวอร์ชันแรกที่ใช้อีโมจิ
const EMOJI_TO_ICON = {
  '🏠': 'house', '🛡️': 'shield-check', '🚗': 'car', '✈️': 'plane', '🎓': 'graduation-cap', '💍': 'gem',
  '👶': 'baby', '🏥': 'heart-pulse', '📱': 'smartphone', '💰': 'coins', '🐷': 'piggy-bank', '🎯': 'target',
};
const COLORS = ['#0f766e', '#2563eb', '#7c3aed', '#db2777', '#dc2626', '#ea580c', '#ca8a04', '#16a34a'];

const ico = (name, cls = '') =>
  `<svg class="ico ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS['piggy-bank']}</svg>`;
const goalIcon = (g) => (ICONS[g.icon] ? g.icon : EMOJI_TO_ICON[g.emoji] || 'piggy-bank');
const goalBadge = (g, cls = '') =>
  `<div class="goal-emoji ${cls}" style="background:${g.color}1f;color:${g.color}">${ico(goalIcon(g))}</div>`;

function emptyState() {
  return { version: 1, goals: [], entries: [], txns: [], categories: [], recurring: [], plans: [] };
}

// เติมชุดข้อมูลที่ยังไม่มี (ข้อมูลเวอร์ชันเก่า / ไฟล์ Import เก่า)
function normalize(data) {
  for (const k of COLLECTIONS) if (!Array.isArray(data[k])) data[k] = [];
  return data;
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const data = JSON.parse(raw);
    if (!Array.isArray(data.goals) || !Array.isArray(data.entries)) return emptyState();
    return normalize(data);
  } catch {
    return emptyState();
  }
}

let state = load();

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function save() {
  persist();
  window.cloudSync?.push(); // ส่งขึ้น Firebase ถ้าล็อกอินอยู่ (cloud.js)
}

// ช่องทางให้ cloud.js อ่าน/เขียนข้อมูล
window.appBridge = {
  getState: () => state,
  // รับข้อมูลจากคลาวด์ (เฉพาะส่วนที่ส่งมา) แล้ววาดหน้าจอใหม่ถ้ามีอะไรเปลี่ยน
  setData(part) {
    let changed = false;
    for (const k of COLLECTIONS) {
      if (part[k] && JSON.stringify(part[k]) !== JSON.stringify(state[k])) {
        state[k] = part[k];
        changed = true;
      }
    }
    if (!changed) return;
    persist();
    render({ keepScroll: true });
  },
  persist: () => persist(),
  ico: (...a) => ico(...a),
  toast: (m) => toast(m),
};

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/* ================= ตัวช่วย ================= */
const $ = (sel) => document.querySelector(sel);
const money = new Intl.NumberFormat('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const fmt = (n) => '฿' + money.format(n);
const fmtDate = (iso) =>
  new Date(iso + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
const fmtMonth = (ym) =>
  new Date(ym + '-01T00:00:00').toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.hidden = true), 2200);
}

const signed = (e) => (e.type === 'in' ? e.amount : -e.amount);
const goalById = (id) => state.goals.find((g) => g.id === id);
const entriesOf = (goalId) => state.entries.filter((e) => e.goalId === goalId);
const balanceOf = (goalId) => entriesOf(goalId).reduce((s, e) => s + signed(e), 0);
const sortEntries = (list) =>
  [...list].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);

/* ================= หน้าจอ ================= */
function route() {
  const m = location.hash.match(/^#\/goal\/(.+)$/);
  if (m && goalById(m[1])) return { view: 'goal', id: m[1] };
  const mm = location.hash.match(/^#\/money(?:\/(\d{4}-\d{2}))?$/);
  if (mm) return { view: 'money', month: mm[1] || Money.curMonth() };
  return { view: 'home' };
}

function render(opts) {
  const keepScroll = opts?.keepScroll === true;
  const r = route();
  const app = $('#app');
  document.querySelectorAll('.tabbar a').forEach((a) =>
    a.classList.toggle('active', a.dataset.tab === (r.view === 'money' ? 'money' : 'save')));
  if (r.view === 'money') {
    $('#title').textContent = 'รายรับรายจ่าย';
    $('#backBtn').hidden = true;
    app.innerHTML = Money.renderMoney(r.month);
  } else if (r.view === 'goal') {
    const g = goalById(r.id);
    $('#title').textContent = g.name;
    $('#backBtn').hidden = false;
    app.innerHTML = renderGoal(g);
  } else {
    $('#title').textContent = 'กระปุกออม';
    $('#backBtn').hidden = true;
    app.innerHTML = renderHome();
  }
  if (!keepScroll) window.scrollTo(0, 0);
}

function progressBar(g, bal) {
  if (!g.target) return '';
  const pct = Math.max(0, Math.min(100, (bal / g.target) * 100));
  return `<div class="progress"><div style="width:${pct}%;background:${g.color}"></div></div>`;
}

function goalSub(g, bal) {
  if (!g.target) return `${entriesOf(g.id).length} รายการ`;
  const pct = Math.floor((bal / g.target) * 100);
  return `เป้า ${fmt(g.target)} · ${pct}%`;
}

function renderHome() {
  if (state.goals.length === 0) {
    return `
      <div class="empty">
        <div class="empty-ico">${ico('piggy-bank')}</div>
        <p>ยังไม่มีเป้าหมายการออม</p>
        <button class="btn primary" data-action="new-goal">${ico('plus')} สร้างเป้าหมายแรก</button>
      </div>`;
  }
  const total = state.entries.reduce((s, e) => s + signed(e), 0);
  const goals = state.goals
    .map((g) => {
      const bal = balanceOf(g.id);
      return `
      <button class="card goal-card" data-goal="${g.id}">
        <div class="goal-head">
          ${goalBadge(g)}
          <div>
            <div class="goal-name">${esc(g.name)}</div>
            <div class="goal-sub">${goalSub(g, bal)}</div>
          </div>
          <div class="goal-amount">${fmt(bal)}</div>
        </div>
        ${progressBar(g, bal)}
      </button>`;
    })
    .join('');

  const recent = sortEntries(state.entries).slice(0, 5);
  const ym = today().slice(0, 7);
  const thisMonth = state.entries.filter((e) => e.date.startsWith(ym)).reduce((s, e) => s + signed(e), 0);
  return `
    <section class="summary">
      <div class="label">เงินออมทั้งหมด</div>
      <div class="big">${fmt(total)}</div>
      <div class="sub">เดือนนี้ ${thisMonth >= 0 ? '+' : '−'}${fmt(Math.abs(thisMonth))} · ${state.goals.length} เป้าหมาย</div>
    </section>

    <div class="section-title">
      <h2>เป้าหมาย</h2>
      <button class="link-btn" data-action="new-goal">${ico('plus')} เพิ่ม</button>
    </div>
    ${goals}

    ${recent.length ? `
    <div class="section-title"><h2>ล่าสุด</h2></div>
    <div class="card entry-list">${recent.map((e) => entryRow(e, true)).join('')}</div>` : ''}
  `;
}

function entryRow(e, showGoal) {
  const g = goalById(e.goalId);
  const label = e.note || (e.type === 'in' ? 'ฝากเข้า' : 'ถอนออก');
  return `
    <div class="entry" data-entry="${e.id}">
      ${showGoal ? goalBadge(g, 'sm') : `<div class="goal-emoji sm dir ${e.type}">${ico(e.type === 'in' ? 'arrow-down-left' : 'arrow-up-right')}</div>`}
      <div class="meta">
        <div class="note">${esc(label)}</div>
        <div class="date">${fmtDate(e.date)}${showGoal ? ' · ' + esc(g.name) : ''}</div>
      </div>
      <div class="amt ${e.type}">${e.type === 'in' ? '+' : '−'}${fmt(e.amount)}</div>
    </div>`;
}

function renderGoal(g) {
  const list = sortEntries(entriesOf(g.id));
  const bal = balanceOf(g.id);
  const totalIn = list.filter((e) => e.type === 'in').reduce((s, e) => s + e.amount, 0);
  const totalOut = list.filter((e) => e.type === 'out').reduce((s, e) => s + e.amount, 0);

  // จัดกลุ่มตามเดือน
  const groups = {};
  for (const e of list) (groups[e.date.slice(0, 7)] ||= []).push(e);
  const history = Object.entries(groups)
    .map(([ym, items]) => {
      const sum = items.reduce((s, e) => s + signed(e), 0);
      return `
        <div class="month-head"><span>${fmtMonth(ym)}</span><span>${sum >= 0 ? '+' : '−'}${fmt(Math.abs(sum))}</span></div>
        <div class="card entry-list">${items.map((e) => entryRow(e, false)).join('')}</div>`;
    })
    .join('');

  const remain = g.target ? Math.max(0, g.target - bal) : 0;
  return `
    <section class="card goal-detail-head">
      ${goalBadge(g, 'lg')}
      <div class="big" style="color:${g.color}">${fmt(bal)}</div>
      ${g.target ? `<div class="muted">จากเป้า ${fmt(g.target)} (${Math.floor((bal / g.target) * 100)}%)</div>` : ''}
      ${progressBar(g, bal)}
      <div class="stats">
        <div class="stat"><div class="k">ฝากรวม</div><div class="v amt in">${fmt(totalIn)}</div></div>
        <div class="stat"><div class="k">ถอนรวม</div><div class="v amt out">${fmt(totalOut)}</div></div>
        ${g.target ? `<div class="stat" style="grid-column:span 2"><div class="k">ขาดอีก</div><div class="v">${remain ? fmt(remain) : 'ถึงเป้าแล้ว 🎉'}</div></div>` : ''}
      </div>
    </section>

    <button class="card plan-card" data-action="plan" data-id="${g.id}">
      <div class="plan-ico">${ico("calculator")}</div>
      <div class="plan-text">
        <div class="plan-title">คาดการณ์</div>
        <div class="plan-sub">${esc(planSummary(g)) || "ฝากเดือนละเท่าไร ถึงเป้าเมื่อไร"}</div>
      </div>
      ${ico("chevron-left", "flip")}
    </button>

    <div class="section-title">
      <h2>ประวัติ</h2>
      <button class="link-btn" data-action="edit-goal" data-id="${g.id}">แก้ไขเป้าหมาย</button>
    </div>
    ${history || `<div class="empty"><p>ยังไม่มีรายการ<br/>กดปุ่ม + ด้านล่างเพื่อบันทึก</p></div>`}
  `;
}

/* ================= ฟอร์มเป้าหมาย ================= */
const goalDialog = $('#goalDialog');
const goalForm = $('#goalForm');
let editingGoalId = null;

function pickerRow(container, items, input, isColor) {
  container.innerHTML = items
    .map((v) => `<button type="button" data-v="${v}" ${isColor ? `style="background:${v}"` : ''}>${isColor ? '' : ico(v)}</button>`)
    .join('');
  const select = (v) => {
    input.value = v;
    container.querySelectorAll('button').forEach((b) => b.classList.toggle('sel', b.dataset.v === v));
  };
  container.onclick = (ev) => {
    const b = ev.target.closest('button');
    if (b) select(b.dataset.v);
  };
  return select;
}
const selectIcon = pickerRow($('#emojiRow'), GOAL_ICONS, goalForm.icon, false);
const selectColor = pickerRow($('#colorRow'), COLORS, goalForm.color, true);

function openGoalForm(id) {
  editingGoalId = id || null;
  const g = id ? goalById(id) : null;
  $('#goalDialogTitle').textContent = g ? 'แก้ไขเป้าหมาย' : 'เป้าหมายใหม่';
  goalForm.name.value = g?.name || '';
  goalForm.target.value = g?.target || '';
  selectIcon(g ? goalIcon(g) : GOAL_ICONS[state.goals.length % GOAL_ICONS.length]);
  selectColor(g?.color || COLORS[state.goals.length % COLORS.length]);
  $('#goalDeleteBtn').hidden = !g;
  goalDialog.showModal();
}

goalForm.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const data = {
    name: goalForm.name.value.trim(),
    icon: goalForm.icon.value,
    color: goalForm.color.value,
    target: parseFloat(goalForm.target.value) || 0,
  };
  if (!data.name) return;
  if (editingGoalId) {
    Object.assign(goalById(editingGoalId), data);
    toast('บันทึกแล้ว');
  } else {
    state.goals.push({ id: uid(), createdAt: Date.now(), ...data });
    toast('สร้างเป้าหมายแล้ว');
  }
  save();
  goalDialog.close();
  render();
});

$('#goalDeleteBtn').addEventListener('click', () => {
  const g = goalById(editingGoalId);
  const n = entriesOf(g.id).length;
  if (!confirm(`ลบ "${g.name}" และรายการทั้งหมด ${n} รายการ?`)) return;
  state.goals = state.goals.filter((x) => x.id !== g.id);
  Money.onGoalDeleted(g.id, entriesOf(g.id).map((e) => e.id));
  state.entries = state.entries.filter((e) => e.goalId !== g.id);
  save();
  goalDialog.close();
  location.hash = '#/';
  render();
  toast('ลบแล้ว');
});

/* ================= ฟอร์มรายการ ================= */
const entryDialog = $('#entryDialog');
const entryForm = $('#entryForm');
let editingEntryId = null;

function openEntryForm({ goalId, entryId } = {}) {
  if (state.goals.length === 0) return openGoalForm();
  editingEntryId = entryId || null;
  const e = entryId ? state.entries.find((x) => x.id === entryId) : null;
  entryForm.goalId.innerHTML = state.goals
    .map((g) => `<option value="${g.id}">${esc(g.name)}</option>`)
    .join('');
  entryForm.goalId.value = e?.goalId || goalId || state.goals[0].id;
  entryForm.type.value = e?.type || 'in';
  entryForm.amount.value = e?.amount ?? '';
  entryForm.date.value = e?.date || today();
  entryForm.note.value = e?.note || '';
  $('#entryDialogTitle').textContent = e ? 'แก้ไขรายการ' : 'บันทึกรายการ';
  $('#entryDeleteBtn').hidden = !e;
  entryDialog.showModal();
  if (!e) setTimeout(() => entryForm.amount.focus(), 250);
}

entryForm.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const amount = Math.round(parseFloat(entryForm.amount.value) * 100) / 100;
  if (!(amount > 0)) return;
  const data = {
    goalId: entryForm.goalId.value,
    type: entryForm.type.value,
    amount,
    date: entryForm.date.value || today(),
    note: entryForm.note.value.trim(),
  };
  if (editingEntryId) {
    const e = state.entries.find((x) => x.id === editingEntryId);
    Object.assign(e, data);
    Money.onEntryChanged(e);
  } else {
    state.entries.push({ id: uid(), createdAt: Date.now(), ...data });
  }
  save();
  entryDialog.close();
  render();
  toast(data.type === 'in' ? `ฝาก ${fmt(amount)} แล้ว` : `ถอน ${fmt(amount)} แล้ว`);
});

$('#entryDeleteBtn').addEventListener('click', () => {
  const e = state.entries.find((x) => x.id === editingEntryId);
  if (!confirm(e.txnId ? 'ลบรายการนี้? รายจ่าย "เงินออม" ที่ผูกไว้ในหน้ารายรับรายจ่ายจะถูกลบด้วย' : 'ลบรายการนี้?')) return;
  Money.onEntryDeleted(e);
  state.entries = state.entries.filter((x) => x.id !== editingEntryId);
  save();
  entryDialog.close();
  render();
  toast('ลบแล้ว');
});

/* ================= เมนู / สำรองข้อมูล ================= */
const menuDialog = $('#menuDialog');

$('#exportBtn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `kapook-om-backup-${today()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast('Export แล้ว');
});

$('#importBtn').addEventListener('click', () => $('#importFile').click());
$('#importFile').addEventListener('change', async (ev) => {
  const file = ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.goals) || !Array.isArray(data.entries)) throw new Error('bad');
    normalize(data);
    if (!confirm(`นำเข้า ${data.goals.length} เป้าหมาย, ${data.entries.length} รายการออม, ${data.txns.length} รายรับรายจ่าย?\nข้อมูลปัจจุบันจะถูกแทนที่`)) return;
    state = data;
    Money.ensureCategories();
    save();
    menuDialog.close();
    location.hash = '#/';
    render();
    toast('Import แล้ว');
  } catch {
    alert('ไฟล์ไม่ถูกต้อง');
  }
});

$('#resetBtn').addEventListener('click', () => {
  if (!confirm('ลบข้อมูลทั้งหมด? (ควร Export สำรองก่อน)')) return;
  if (!confirm('ยืนยันอีกครั้ง: ลบทั้งหมดจริงหรือไม่?')) return;
  state = emptyState();
  save();
  Money.ensureCategories();
  menuDialog.close();
  location.hash = '#/';
  render();
});

/* ================= event รวม ================= */
$('#app').addEventListener('click', (ev) => {
  const goalBtn = ev.target.closest('[data-goal]');
  if (goalBtn) return void (location.hash = `#/goal/${goalBtn.dataset.goal}`);
  const entry = ev.target.closest('[data-entry]');
  if (entry) return openEntryForm({ entryId: entry.dataset.entry });
  const act = ev.target.closest('[data-action]');
  if (act?.dataset.action === 'new-goal') return openGoalForm();
  if (act?.dataset.action === 'edit-goal') return openGoalForm(act.dataset.id);
  if (act?.dataset.action === 'plan') return openPlan(act.dataset.id);
});

$('#fab').addEventListener('click', () => {
  const r = route();
  if (r.view === 'money') return Money.openTxnForm({ month: r.month });
  openEntryForm({ goalId: r.view === 'goal' ? r.id : undefined });
});
$('#backBtn').addEventListener('click', () => {
  if (history.length > 1) history.back();
  else location.hash = '#/';
});
$('#menuBtn').addEventListener('click', () => menuDialog.showModal());
$('#syncBadge').addEventListener('click', () => menuDialog.showModal());

// ปุ่มปิด + แตะพื้นหลังเพื่อปิด
document.querySelectorAll('dialog').forEach((d) => {
  d.addEventListener('click', (ev) => {
    if (ev.target === d || ev.target.closest('[data-close]')) d.close();
  });
  enableSwipeToClose(d);
  // ล็อกหน้าหลักไม่ให้เลื่อน/ดึงรีเฟรชระหว่างเปิด popup
  new MutationObserver(() => {
    const anyOpen = !!document.querySelector('dialog[open]');
    document.documentElement.classList.toggle('modal-open', anyOpen);
    if (!d.open) d.style.transform = d.style.transition = '';
  }).observe(d, { attributes: true, attributeFilter: ['open'] });
});

// ลาก popup ลงเพื่อปิด (และกันเบราว์เซอร์มือถือดึงรีเฟรช)
function enableSwipeToClose(d) {
  let startY = 0, dy = 0, tracking = false, dragging = false;
  d.addEventListener('touchstart', (ev) => {
    if (ev.touches.length !== 1) return;
    tracking = d.scrollTop <= 0; // ลากปิดได้เมื่ออยู่บนสุดของ popup
    dragging = false;
    startY = ev.touches[0].clientY;
    dy = 0;
  }, { passive: true });

  d.addEventListener('touchmove', (ev) => {
    if (!tracking) return;
    dy = ev.touches[0].clientY - startY;
    if (dy <= 0 && !dragging) { tracking = false; return; } // เลื่อนขึ้น = scroll ปกติ
    if (dy > 6) dragging = true;
    if (dragging) {
      ev.preventDefault(); // หยุด pull-to-refresh / scroll ของเบราว์เซอร์
      d.style.transition = 'none';
      d.style.transform = `translateY(${Math.max(0, dy)}px)`;
    }
  }, { passive: false });

  const end = () => {
    if (!dragging) return;
    dragging = tracking = false;
    if (dy > Math.min(140, d.offsetHeight * 0.25)) {
      d.style.transition = 'transform .18s ease-in';
      d.style.transform = 'translateY(100%)';
      setTimeout(() => d.close(), 170);
    } else {
      d.style.transition = 'transform .2s ease-out';
      d.style.transform = '';
    }
  };
  d.addEventListener('touchend', end);
  d.addEventListener('touchcancel', end);
}

document.getElementById('appVersion').textContent = 'เวอร์ชัน ' + APP_VERSION;
document.querySelectorAll('[data-ico]').forEach((el) => (el.outerHTML = ico(el.dataset.ico)));
Money.ensureCategories();
window.addEventListener('hashchange', render);
render();

// ขอให้เบราว์เซอร์ไม่ลบข้อมูลอัตโนมัติ
navigator.storage?.persist?.();

// PWA: ใช้งานออฟไลน์
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }));
}
