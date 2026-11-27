'use strict';

/* ================= ข้อมูล ================= */
const STORAGE_KEY = 'kapook-om-v1'; // อย่าเปลี่ยน — เป็นที่เก็บข้อมูล
const APP_VERSION = '18';
// ชุดข้อมูลทั้งหมด (ต้องตรงกับ NAMES ใน cloud.js)
const COLLECTIONS = ['goals', 'entries', 'txns', 'categories', 'recurring', 'plans'];
const GOAL_ICONS = [
  'house', 'shield-check', 'car', 'plane', 'graduation-cap',
  'gem', 'baby', 'heart-pulse', 'smartphone', 'gift',
  'briefcase', 'piggy-bank', 'target', 'wallet', 'coins',
  'trending-up', 'credit-card', 'landmark',
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

/* ---------- ประเภทเป้า: ออมเงิน / ลงทุน / หนี้-ผ่อน ---------- */
const GOAL_TYPES = {
  saving: { label: 'เป้าหมายออม', icon: 'piggy-bank', in: 'ฝากเข้า', out: 'ถอนออก' },
  invest: { label: 'การลงทุน', icon: 'trending-up', in: 'ซื้อ/ลงทุนเพิ่ม', out: 'ขาย/ถอนออก' },
  debt: { label: 'หนี้/ผ่อน', icon: 'credit-card', in: 'จ่ายงวด', out: 'ปรับลด/คืน' },
};
const goalType = (g) => (GOAL_TYPES[g?.type] ? g.type : 'saving');
const numOr0 = (v) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : 0);
const hasMarket = (g) => g.marketValue !== undefined && g.marketValue !== null && g.marketValue !== '';

// มูลค่าที่นับเป็น "เงินออม": ลงทุน = มูลค่าปัจจุบัน (ถ้าระบุ) ไม่งั้น = ต้นทุน
function goalValue(g) {
  if (goalType(g) === 'invest' && hasMarket(g)) return numOr0(g.marketValue);
  return balanceOf(g.id);
}

function investInfo(g) {
  const cost = balanceOf(g.id);
  const value = goalValue(g);
  const pl = value - cost;
  return { cost, value, pl, pct: cost > 0 ? (pl / cost) * 100 : 0, known: hasMarket(g) };
}

// ---------- หนี้แบบขั้นบันได / ยกยอดมา ----------
// debtBalance = ยอดคงเหลือ ณ วันที่ debtAsOf, debtSteps = [{amount, months}] เริ่มเดือนของ debtAsOf
// งวดสุดท้ายที่ไม่ใส่จำนวนเดือน = จ่ายยอดนั้นไปเรื่อยๆ จนครบ
const ymDiff = (a, b) => (+b.slice(0, 4) - +a.slice(0, 4)) * 12 + (+b.slice(5, 7) - +a.slice(5, 7));
function ymLabel(ym, add = 0) {
  const d = new Date(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + add, 1);
  return `${MONTHS_TH[d.getMonth()]} ${d.getFullYear() + 543}`;
}
function stepAmountAt(steps, i) {
  let start = 0;
  for (let k = 0; k < steps.length; k++) {
    const m = Math.round(numOr0(steps[k].months));
    const last = k === steps.length - 1;
    if (i < start + m || (last && !m)) return { amount: numOr0(steps[k].amount), step: k };
    start += m;
  }
  return { amount: 0, step: -1 };
}
const isOpenEnded = (steps) => steps.length > 0 && !Math.round(numOr0(steps[steps.length - 1].months));
const scheduleTotal = (steps) => steps.reduce((s, x) => s + numOr0(x.amount) * Math.round(numOr0(x.months)), 0);
const scheduleMonths = (steps) => steps.reduce((s, x) => s + Math.round(numOr0(x.months)), 0);

// เดินตามตารางจากเดือน idx จนจ่ายครบ remaining → จำนวนเดือน + ยอดที่ตารางไม่พอ
function walkSchedule(steps, idx, remaining) {
  let left = 0, rem = remaining;
  while (rem > 0.005 && left < 1200) {
    const a = stepAmountAt(steps, idx + left).amount;
    if (!(a > 0)) break;
    rem -= a;
    left++;
  }
  return { left, short: rem > 0.005 ? rem : 0 };
}

function debtStepInfo(g) {
  const steps = (g.debtSteps || []).filter((s) => numOr0(s.amount) > 0);
  const asOf = g.debtAsOf || today();
  const total = numOr0(g.debtBalance);
  const list = entriesOf(g.id).filter((e) => e.date >= asOf);
  const paid = list.reduce((s, e) => s + signed(e), 0);
  const remaining = Math.max(0, total - paid);
  const ym = today().slice(0, 7);
  const curIdx = Math.max(0, ymDiff(asOf.slice(0, 7), ym));
  const paidNow = list.some((e) => e.type === 'in' && e.date.startsWith(ym));
  const nextIdx = curIdx + (paidNow ? 1 : 0);
  const next = stepAmountAt(steps, nextIdx);
  const w = remaining > 0.005 ? walkSchedule(steps, nextIdx, remaining) : { left: 0, short: 0 };
  return {
    mode: 'steps', steps, asOf, total, paid, remaining, per: 1,
    inst: next.amount || (steps.length ? numOr0(steps[steps.length - 1].amount) : 0),
    step: next.step, stepCount: steps.length,
    paidCount: list.filter((e) => e.type === 'in').length,
    left: remaining > 0.005 ? Math.max(1, w.left) : 0,
    short: w.short,
    lastOffset: w.left ? (paidNow ? 1 : 0) + w.left - 1 : 0,
    pct: total > 0 ? Math.min(1, paid / total) : 0,
  };
}

function debtInfo(g) {
  if (g.debtMode === 'steps') return debtStepInfo(g);
  const inst = numOr0(g.installment);
  const count = Math.round(numOr0(g.installments));
  const per = g.period === 'year' ? 12 : 1;
  const total = inst * count;
  const paid = Math.round(numOr0(g.paidBefore)) * inst + balanceOf(g.id);
  const remaining = Math.max(0, total - paid);
  const paidCount = inst > 0 ? Math.min(count, Math.floor((paid + 0.005) / inst)) : 0;
  const left = inst > 0 && remaining > 0.005 ? Math.ceil(remaining / inst - 1e-9) : 0;
  // จ่ายงวดของรอบนี้ไปแล้วหรือยัง → งวดสุดท้ายประมาณเดือนไหน
  const ym = today().slice(0, 7), yr = ym.slice(0, 4);
  const paidNow = entriesOf(g.id).some((e) => e.type === 'in' && (per === 12 ? e.date.startsWith(yr) : e.date.startsWith(ym)));
  const lastOffset = left ? (paidNow ? per : 0) + (left - 1) * per : 0;
  return { inst, count, per, total, paid, remaining, paidCount, left, lastOffset, pct: total > 0 ? Math.min(1, paid / total) : 0 };
}

const signedFmt = (v) => `${v >= 0 ? '+' : '−'}${fmt(Math.abs(Math.round(v * 100) / 100))}`;
const pctFmt = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}%`;
const plClass = (v) => (v >= 0 ? 'in' : 'out');

function progressBar(g, ratio) {
  if (ratio === null || ratio === undefined) return '';
  const pct = Math.max(0, Math.min(100, ratio * 100));
  return `<div class="progress"><div style="width:${pct}%;background:${g.color}"></div></div>`;
}

function goalCard(g) {
  const t = goalType(g);
  let amount, sub, ratio = null, amountLabel = '';
  if (t === 'debt') {
    const d = debtInfo(g);
    amount = fmt(d.remaining);
    amountLabel = 'คงเหลือ';
    sub = !d.left ? 'จ่ายครบแล้ว 🎉'
      : d.mode === 'steps' && d.short ? `ตารางผ่อนไม่พอ · ขาดอีก ${fmt(d.short)}`
      : d.mode === 'steps' ? `เหลือ ${durationText(d.left)} · งวดถัดไป ${fmt(d.inst)}`
      : `เหลือ ${d.left} งวด · งวดละ ${fmt(d.inst)}`;
    ratio = d.total ? d.pct : null;
  } else if (t === 'invest') {
    const iv = investInfo(g);
    amount = fmt(iv.value);
    sub = iv.known && iv.cost > 0
      ? `<span class="amt ${plClass(iv.pl)}">${ico(iv.pl >= 0 ? 'trending-up' : 'arrow-down-left', 'pl-ico')} ${signedFmt(iv.pl)} (${pctFmt(iv.pct)})</span>`
      : `ต้นทุน ${fmt(iv.cost)}`;
    if (g.target) ratio = iv.value / g.target;
  } else {
    const bal = balanceOf(g.id);
    amount = fmt(bal);
    const parts = [];
    if (g.target) parts.push(`เป้า ${fmt(g.target)} · ${Math.floor((bal / g.target) * 100)}%`);
    if (numOr0(g.monthly)) parts.push(`เดือนละ ${fmt(numOr0(g.monthly))}`);
    if (!parts.length) parts.push(`${entriesOf(g.id).length} รายการ`);
    sub = parts.join(' · ');
    if (g.target) ratio = bal / g.target;
  }
  return `
    <button class="card goal-card" data-goal="${g.id}">
      <div class="goal-head">
        ${goalBadge(g)}
        <div class="goal-text">
          <div class="goal-name">${esc(g.name)}</div>
          <div class="goal-sub">${sub}</div>
        </div>
        <div class="goal-amount">${amountLabel ? `<small>${amountLabel}</small>` : ''}${amount}</div>
      </div>
      ${progressBar(g, ratio)}
    </button>`;
}

function renderHome() {
  if (state.goals.length === 0) {
    return `
      <div class="empty">
        <div class="empty-ico">${ico('piggy-bank')}</div>
        <p>ยังไม่มีเป้าหมาย<br/><small>ออมเงิน · ลงทุน · หนี้/ผ่อน</small></p>
        <button class="btn primary" data-action="new-goal">${ico('plus')} สร้างเป้าหมายแรก</button>
      </div>`;
  }
  const byType = { saving: [], invest: [], debt: [] };
  for (const g of state.goals) byType[goalType(g)].push(g);

  const savingTotal = [...byType.saving, ...byType.invest].reduce((s, g) => s + goalValue(g), 0);
  const debtLeft = byType.debt.reduce((s, g) => s + debtInfo(g).remaining, 0);
  const ym = today().slice(0, 7);
  const savingIds = new Set(byType.saving.map((g) => g.id));
  const thisMonth = state.entries.filter((e) => savingIds.has(e.goalId) && e.date.startsWith(ym)).reduce((s, e) => s + signed(e), 0);
  const invest = byType.invest.map(investInfo).filter((x) => x.known);
  const investPl = invest.reduce((s, x) => s + x.pl, 0);
  const investCost = invest.reduce((s, x) => s + x.cost, 0);
  const investCostAll = byType.invest.reduce((s, g) => s + balanceOf(g.id), 0);

  // สรุปสั้นๆ ฝั่งขวาของหัวข้อแต่ละกลุ่ม
  const sectionSum = (k) => {
    if (k === 'invest') {
      return invest.length
        ? `<span class="amt ${plClass(investPl)}">${signedFmt(investPl)}${investCost > 0 ? ` (${pctFmt((investPl / investCost) * 100)})` : ''}</span>`
        : `ต้นทุน ${fmt(investCostAll)}`;
    }
    if (k === 'debt') return `คงเหลือ <b>${fmt(debtLeft)}</b>`;
    return '';
  };

  const types = Object.keys(byType).filter((k) => byType[k].length);
  const sections = types
    .map((k, i) => {
      const sum = sectionSum(k);
      const add = i === 0
        ? `<button class="link-btn${sum ? ' icon-only' : ''}" data-action="new-goal" aria-label="เพิ่มเป้าหมาย">${ico('plus')}${sum ? '' : ' เพิ่ม'}</button>`
        : '';
      return `
      <div class="section-title">
        <h2>${GOAL_TYPES[k].label}</h2>
        <div class="st-right">${sum ? `<span class="st-sum">${sum}</span>` : ''}${add}</div>
      </div>
      ${byType[k].map(goalCard).join('')}`;
    })
    .join('');

  const recent = sortEntries(state.entries).slice(0, 5);
  return `
    <section class="summary">
      <div class="label">เงินออมทั้งหมด${byType.invest.length ? ' (รวมมูลค่าลงทุน)' : ''}</div>
      <div class="big">${fmt(savingTotal)}</div>
      <div class="sub">เดือนนี้ ${thisMonth >= 0 ? '+' : '−'}${fmt(Math.abs(thisMonth))} · ${state.goals.length} เป้าหมาย</div>
    </section>
    ${sections}
    ${recent.length ? `
    <div class="section-title"><h2>ล่าสุด</h2></div>
    <div class="card entry-list">${recent.map((e) => entryRow(e, true)).join('')}</div>` : ''}
  `;
}

function entryRow(e, showGoal) {
  const g = goalById(e.goalId);
  const T = GOAL_TYPES[goalType(g)];
  const label = e.note || (e.type === 'in' ? T.in : T.out);
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

function goalHistory(g) {
  const groups = {};
  for (const e of sortEntries(entriesOf(g.id))) (groups[e.date.slice(0, 7)] ||= []).push(e);
  return Object.entries(groups)
    .map(([ym, items]) => {
      const sum = items.reduce((s, e) => s + signed(e), 0);
      return `
        <div class="month-head"><span>${fmtMonth(ym)}</span><span>${sum >= 0 ? '+' : '−'}${fmt(Math.abs(sum))}</span></div>
        <div class="card entry-list">${items.map((e) => entryRow(e, false)).join('')}</div>`;
    })
    .join('');
}

function renderGoal(g) {
  const t = goalType(g);
  const list = entriesOf(g.id);
  const totalIn = list.filter((e) => e.type === 'in').reduce((s, e) => s + e.amount, 0);
  const totalOut = list.filter((e) => e.type === 'out').reduce((s, e) => s + e.amount, 0);
  let head;

  if (t === 'debt' && g.debtMode === 'steps') {
    const d = debtInfo(g);
    head = `
      <section class="card goal-detail-head">
        ${goalBadge(g, 'lg')}
        <div class="muted small">ยอดคงเหลือ</div>
        <div class="big" style="color:${g.color}">${fmt(d.remaining)}</div>
        <div class="muted">จ่ายแล้ว ${fmt(d.paid)} จากยอดยกมา ${fmt(d.total)} (${Math.round(d.pct * 100)}%)</div>
        ${progressBar(g, d.total ? d.pct : null)}
        <div class="stats">
          <div class="stat"><div class="k">งวดถัดไป${d.stepCount > 1 && d.step >= 0 ? ` · ช่วง ${d.step + 1}/${d.stepCount}` : ''}</div><div class="v">${fmt(d.inst)}/เดือน</div></div>
          <div class="stat"><div class="k">เหลืออีก</div><div class="v">${d.left ? durationText(d.left) : '—'}</div></div>
          <div class="stat"><div class="k">ยกยอดมาเมื่อ</div><div class="v">${fmtDate(d.asOf)}</div></div>
          <div class="stat"><div class="k">งวดสุดท้ายประมาณ</div><div class="v">${d.left ? monthLabel(d.lastOffset) : 'ครบแล้ว 🎉'}</div></div>
        </div>
        ${d.short ? `<div class="debt-warn">ตารางผ่อนที่ใส่ไว้ยังไม่พอ ขาดอีก ${fmt(d.short)} — กดแก้ไขเป้าหมายเพื่อเพิ่มช่วง</div>` : ''}
        ${d.left ? `<button class="btn primary pay-btn" data-action="pay-debt" data-id="${g.id}">${ico('check')} จ่ายงวด ${monthLabel(d.lastOffset - d.left + 1)} · ${fmt(Math.min(d.inst, d.remaining))}</button>` : ''}
      </section>`;
  } else if (t === 'debt') {
    const d = debtInfo(g);
    head = `
      <section class="card goal-detail-head">
        ${goalBadge(g, 'lg')}
        <div class="muted small">ยอดคงเหลือ</div>
        <div class="big" style="color:${g.color}">${fmt(d.remaining)}</div>
        <div class="muted">${d.total ? `จ่ายแล้ว ${d.paidCount}/${d.count} งวด (${Math.round(d.pct * 100)}%)` : 'ยังไม่ได้ตั้งค่างวด — กดแก้ไขเป้าหมาย'}</div>
        ${progressBar(g, d.total ? d.pct : null)}
        <div class="stats">
          <div class="stat"><div class="k">ค่างวด</div><div class="v">${fmt(d.inst)}/${d.per === 12 ? 'ปี' : 'เดือน'}</div></div>
          <div class="stat"><div class="k">เหลือ</div><div class="v">${d.left} งวด</div></div>
          <div class="stat"><div class="k">ยอดทั้งหมด</div><div class="v">${fmt(d.total)}</div></div>
          <div class="stat"><div class="k">งวดสุดท้ายประมาณ</div><div class="v">${d.left ? monthLabel(d.lastOffset) : 'ครบแล้ว 🎉'}</div></div>
        </div>
        ${d.left ? `<button class="btn primary pay-btn" data-action="pay-debt" data-id="${g.id}">${ico('check')} จ่ายงวดที่ ${d.paidCount + 1} · ${fmt(Math.min(d.inst, d.remaining))}</button>` : ''}
      </section>`;
  } else if (t === 'invest') {
    const iv = investInfo(g);
    head = `
      <section class="card goal-detail-head">
        ${goalBadge(g, 'lg')}
        <div class="muted small">มูลค่าปัจจุบัน</div>
        <div class="big" style="color:${g.color}">${fmt(iv.value)}</div>
        ${iv.known && iv.cost > 0
          ? `<div class="pl-line amt ${plClass(iv.pl)}">${ico(iv.pl >= 0 ? 'trending-up' : 'arrow-down-left')} ${iv.pl >= 0 ? 'กำไร' : 'ขาดทุน'} ${signedFmt(iv.pl)} (${pctFmt(iv.pct)})</div>`
          : `<div class="muted">ยังไม่ได้ระบุมูลค่าปัจจุบัน (แสดงเท่าต้นทุน)</div>`}
        ${g.target ? progressBar(g, iv.value / g.target) : ''}
        <div class="stats">
          <div class="stat"><div class="k">ต้นทุนสุทธิ</div><div class="v">${fmt(iv.cost)}</div></div>
          <div class="stat"><div class="k">อัปเดตล่าสุด</div><div class="v">${g.marketAt ? fmtDate(g.marketAt) : '—'}</div></div>
          <div class="stat"><div class="k">ซื้อรวม</div><div class="v amt in">${fmt(totalIn)}</div></div>
          <div class="stat"><div class="k">ขายรวม</div><div class="v amt out">${fmt(totalOut)}</div></div>
        </div>
        <button class="btn pay-btn soft" data-action="market" data-id="${g.id}">${ico('pencil')} อัปเดตมูลค่าปัจจุบัน</button>
      </section>`;
  } else {
    const bal = balanceOf(g.id);
    const remain = g.target ? Math.max(0, g.target - bal) : 0;
    head = `
      <section class="card goal-detail-head">
        ${goalBadge(g, 'lg')}
        <div class="big" style="color:${g.color}">${fmt(bal)}</div>
        ${g.target ? `<div class="muted">จากเป้า ${fmt(g.target)} (${Math.floor((bal / g.target) * 100)}%)</div>` : ''}
        ${progressBar(g, g.target ? bal / g.target : null)}
        <div class="stats">
          <div class="stat"><div class="k">ฝากรวม</div><div class="v amt in">${fmt(totalIn)}</div></div>
          <div class="stat"><div class="k">ถอนรวม</div><div class="v amt out">${fmt(totalOut)}</div></div>
          ${g.target ? `<div class="stat" style="grid-column:span 2"><div class="k">ขาดอีก</div><div class="v">${remain ? fmt(remain) : 'ถึงเป้าแล้ว 🎉'}</div></div>` : ''}
        </div>
      </section>`;
  }

  const monthly = numOr0(g.monthly);
  const memo = (t !== 'debt' && monthly) || g.note ? `
    <section class="card memo-card">
      ${t !== 'debt' && monthly ? `<div class="memo-row">${ico('repeat')} ตั้งใจออมเดือนละ <b>${fmt(monthly)}</b></div>` : ''}
      ${g.note ? `<div class="memo-note">${esc(g.note)}</div>` : ''}
    </section>` : '';

  const planCard = t === 'debt' ? '' : `
    <button class="card plan-card" data-action="plan" data-id="${g.id}">
      <div class="plan-ico">${ico('calculator')}</div>
      <div class="plan-text">
        <div class="plan-title">คาดการณ์</div>
        <div class="plan-sub">${esc(planSummary(g)) || 'ฝากเดือนละเท่าไร ถึงเป้าเมื่อไร'}</div>
      </div>
      ${ico('chevron-left', 'flip')}
    </button>`;

  return `
    ${head}
    ${memo}
    ${planCard}
    <div class="section-title">
      <h2>ประวัติ</h2>
      <button class="link-btn" data-action="edit-goal" data-id="${g.id}">แก้ไขเป้าหมาย</button>
    </div>
    ${goalHistory(g) || `<div class="empty"><p>ยังไม่มีรายการ<br/>กดปุ่ม + ด้านล่างเพื่อบันทึก</p></div>`}
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

const TYPE_ICON_DEFAULT = { saving: 'piggy-bank', invest: 'trending-up', debt: 'credit-card' };
let iconTouched = false;
$('#emojiRow').addEventListener('click', () => (iconTouched = true));

function showGoalFields(type) {
  goalForm.querySelectorAll('[data-for]').forEach((el) => (el.hidden = !el.dataset.for.split(' ').includes(type)));
  goalForm.name.placeholder = { saving: 'เช่น สร้างบ้าน, เที่ยวญี่ปุ่น', invest: 'เช่น หุ้น SET, กองทุน RMF', debt: 'เช่น ผ่อนรถ, ประกันชีวิต' }[type];
  if (!editingGoalId && !iconTouched) selectIcon(TYPE_ICON_DEFAULT[type]);
  updateDebtPreview();
}

function updateDebtPreview() {
  const inst = numOr0(goalForm.installment.value);
  const count = Math.round(numOr0(goalForm.installments.value));
  const before = Math.round(numOr0(goalForm.paidBefore.value));
  const unit = goalForm.period.value === 'year' ? 'ปี' : 'เดือน';
  $('#debtPreview').textContent = inst && count
    ? `ยอดทั้งหมด ${fmt(inst * count)} · ${count} งวด (${count} ${unit})${before ? ` · จ่ายแล้ว ${before} งวด เหลือ ${Math.max(0, count - before)} งวด` : ''}`
    : 'ใส่ค่างวดและจำนวนงวด เพื่อคำนวณยอดคงเหลือและงวดที่เหลือ';
}

// ---- ตารางผ่อนขั้นบันไดในฟอร์ม ----
let formSteps = [];
const debtStepsBox = $('#debtSteps');
$('#debtStepAdd').innerHTML = `${ico('plus')} เพิ่มช่วง`;

function showDebtMode(mode) {
  goalForm.querySelectorAll('[data-dmode]').forEach((el) => (el.hidden = el.dataset.dmode !== mode));
  if (mode === 'steps') renderDebtSteps();
}

function renderDebtSteps() {
  if (!formSteps.length) formSteps = [{ amount: '', months: '' }];
  debtStepsBox.innerHTML = formSteps
    .map((s, i) => `
      <div class="step-row">
        <span class="step-no">${i + 1}</span>
        <div class="step-fields">
          <label class="inline"><input type="number" inputmode="decimal" min="0" step="any" data-step="${i}.amount" value="${esc(s.amount)}" placeholder="บาท/เดือน" /></label>
          <label class="inline"><input type="number" inputmode="numeric" min="0" step="1" data-step="${i}.months" value="${esc(s.months)}" placeholder="${i === formSteps.length - 1 ? 'จนครบ' : '0'}" /></label>
        </div>
        ${formSteps.length > 1 ? `<button type="button" class="row-del" data-step-del="${i}" aria-label="ลบ">${ico('x')}</button>` : ''}
      </div>`)
    .join('');
  updateDebtStepsPreview();
}

function updateDebtStepsPreview() {
  const box = $('#debtStepsPreview');
  const steps = formSteps.filter((s) => numOr0(s.amount) > 0);
  const bal = numOr0(goalForm.debtBalance.value);
  const asOf = goalForm.debtAsOf.value || today();
  if (!bal || !steps.length) {
    box.innerHTML = 'ใส่ยอดคงเหลือ และค่างวดแต่ละช่วง เช่น 1,000 × 12 เดือน แล้ว 1,500 × 24 เดือน';
    return;
  }
  const open = isOpenEnded(steps);
  const w = walkSchedule(steps, 0, bal);
  const lines = [];
  if (!open) {
    const tot = scheduleTotal(steps), months = scheduleMonths(steps);
    lines.push(`ตารางรวม ${fmt(tot)} · ${months} เดือน (${durationText(months)})`);
    const diff = tot - bal;
    if (diff < -0.5) {
      lines.push(`<span class="warn">น้อยกว่ายอดคงเหลือ ${fmt(-diff)} — หลังจบตารางจะยังเหลือหนี้</span> <button type="button" class="link-btn" id="debtUseTotal">ใช้ ${fmt(tot)} เป็นยอดคงเหลือ</button>`);
    } else if (diff > 0.5) {
      lines.push(`มากกว่ายอดคงเหลือ ${fmt(diff)} (ถ้ารวมดอกเบี้ยไว้ในค่างวด ใช้ยอดรวมตารางจะแม่นกว่า) <button type="button" class="link-btn" id="debtUseTotal">ใช้ ${fmt(tot)} เป็นยอดคงเหลือ</button>`);
    } else lines.push('<span class="ok">ตรงกับยอดคงเหลือพอดี ✓</span>');
  }
  if (w.left && !w.short) lines.push(`<span class="ok">จ่ายครบใน ${durationText(w.left)} · งวดสุดท้ายประมาณ ${ymLabel(asOf.slice(0, 7), w.left - 1)}</span>`);
  box.innerHTML = lines.join('<br>');
}

debtStepsBox.addEventListener('input', (ev) => {
  const p = ev.target.dataset.step;
  if (!p) return;
  const [i, k] = p.split('.');
  formSteps[+i][k] = ev.target.value;
  updateDebtStepsPreview();
});
debtStepsBox.addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-step-del]');
  if (!b) return;
  formSteps.splice(+b.dataset.stepDel, 1);
  renderDebtSteps();
});
$('#debtStepAdd').addEventListener('click', () => {
  formSteps.push({ amount: '', months: '' });
  renderDebtSteps();
  debtStepsBox.querySelector(`[data-step="${formSteps.length - 1}.amount"]`)?.focus();
});
$('#debtStepsPreview').addEventListener('click', (ev) => {
  if (ev.target.closest('#debtUseTotal')) {
    goalForm.debtBalance.value = Math.round(scheduleTotal(formSteps.filter((s) => numOr0(s.amount) > 0)) * 100) / 100;
    updateDebtStepsPreview();
  }
});

goalForm.addEventListener('change', (ev) => {
  if (ev.target.name === 'gtype') showGoalFields(ev.target.value);
  if (ev.target.name === 'debtMode') showDebtMode(ev.target.value);
});
goalForm.addEventListener('input', (ev) => {
  if (['installment', 'installments', 'paidBefore'].includes(ev.target.name)) updateDebtPreview();
  if (['debtBalance', 'debtAsOf'].includes(ev.target.name)) updateDebtStepsPreview();
});
goalForm.period.addEventListener('change', updateDebtPreview);

function openGoalForm(id) {
  editingGoalId = id || null;
  iconTouched = false;
  const g = id ? goalById(id) : null;
  const t = g ? goalType(g) : 'saving';
  $('#goalDialogTitle').textContent = g ? 'แก้ไขเป้าหมาย' : 'เป้าหมายใหม่';
  goalForm.gtype.value = t;
  goalForm.name.value = g?.name || '';
  goalForm.target.value = g?.target || '';
  goalForm.monthly.value = g?.monthly || '';
  goalForm.installment.value = g?.installment || '';
  goalForm.installments.value = g?.installments || '';
  goalForm.period.value = g?.period || 'month';
  goalForm.paidBefore.value = g?.paidBefore || '';
  goalForm.debtMode.value = g?.debtMode === 'steps' ? 'steps' : 'fixed';
  goalForm.debtBalance.value = g?.debtBalance || '';
  goalForm.debtAsOf.value = g?.debtAsOf || today();
  formSteps = (g?.debtSteps || []).map((s) => ({ amount: s.amount || '', months: s.months || '' }));
  showDebtMode(goalForm.debtMode.value);
  goalForm.note.value = g?.note || '';
  selectIcon(g ? goalIcon(g) : TYPE_ICON_DEFAULT[t]);
  selectColor(g?.color || COLORS[state.goals.length % COLORS.length]);
  showGoalFields(t);
  $('#goalDeleteBtn').hidden = !g;
  goalDialog.showModal();
}

goalForm.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const type = goalForm.gtype.value;
  const data = {
    type,
    name: goalForm.name.value.trim(),
    icon: goalForm.icon.value,
    color: goalForm.color.value,
    note: goalForm.note.value.trim(),
    target: type === 'debt' ? 0 : numOr0(goalForm.target.value),
    monthly: type === 'debt' ? 0 : numOr0(goalForm.monthly.value),
  };
  if (type === 'debt' && goalForm.debtMode.value === 'steps') {
    const steps = formSteps
      .filter((s) => numOr0(s.amount) > 0)
      .map((s) => ({ amount: numOr0(s.amount), months: Math.round(numOr0(s.months)) }));
    Object.assign(data, {
      debtMode: 'steps',
      debtBalance: numOr0(goalForm.debtBalance.value),
      debtAsOf: goalForm.debtAsOf.value || today(),
      debtSteps: steps,
    });
    if (!(data.debtBalance > 0)) {
      toast('ใส่ยอดหนี้คงเหลือก่อน');
      goalForm.debtBalance.focus();
      return;
    }
    if (!steps.length) {
      toast('ใส่ค่างวดอย่างน้อย 1 ช่วง');
      debtStepsBox.querySelector('input')?.focus();
      return;
    }
  } else if (type === 'debt') {
    Object.assign(data, {
      debtMode: 'fixed',
      installment: numOr0(goalForm.installment.value),
      installments: Math.round(numOr0(goalForm.installments.value)),
      period: goalForm.period.value,
      paidBefore: Math.round(numOr0(goalForm.paidBefore.value)),
    });
    if (!(data.installment > 0) || !(data.installments > 0)) {
      toast('ใส่ค่างวดและจำนวนงวดก่อน');
      (data.installment > 0 ? goalForm.installments : goalForm.installment).focus();
      return;
    }
  }
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
  render({ keepScroll: !!editingGoalId });
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

// ข้อความในฟอร์มเปลี่ยนตามประเภทเป้า (ฝาก/ถอน, ซื้อ/ขาย, จ่ายงวด/ปรับลด)
function updateEntryLabels() {
  const g = goalById(entryForm.goalId.value);
  const T = GOAL_TYPES[goalType(g)];
  const spans = entryForm.querySelectorAll('.segmented span');
  spans[0].textContent = T.in;
  spans[1].textContent = T.out;
}
entryForm.goalId.addEventListener('change', () => {
  updateEntryLabels();
  const g = goalById(entryForm.goalId.value);
  if (!editingEntryId && goalType(g) === 'debt' && !entryForm.amount.value) entryForm.amount.value = numOr0(g.installment) || '';
});

function openEntryForm({ goalId, entryId } = {}) {
  if (state.goals.length === 0) return openGoalForm();
  editingEntryId = entryId || null;
  const e = entryId ? state.entries.find((x) => x.id === entryId) : null;
  entryForm.goalId.innerHTML = state.goals
    .map((g) => `<option value="${g.id}">${esc(g.name)}</option>`)
    .join('');
  entryForm.goalId.value = e?.goalId || goalId || state.goals[0].id;
  const g = goalById(entryForm.goalId.value);
  entryForm.type.value = e?.type || 'in';
  // หนี้: ใส่ค่างวดให้เลย
  entryForm.amount.value = e?.amount ?? (goalType(g) === 'debt' ? numOr0(g.installment) || '' : '');
  entryForm.date.value = e?.date || today();
  entryForm.note.value = e?.note || '';
  updateEntryLabels();
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
  const T = GOAL_TYPES[goalType(goalById(data.goalId))];
  toast(`${data.type === 'in' ? T.in : T.out} ${fmt(amount)} แล้ว`);
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

/* ================= ลงทุน: อัปเดตมูลค่า ================= */
const marketDialog = $('#marketDialog');
const marketForm = $('#marketForm');
let marketGoalId = null;

function openMarket(id) {
  marketGoalId = id;
  const g = goalById(id);
  const iv = investInfo(g);
  $('#marketInfo').textContent = `ต้นทุนสุทธิ ${fmt(iv.cost)} (ซื้อ − ขาย)`;
  marketForm.mvalue.value = iv.known ? iv.value : '';
  marketForm.mpl.value = iv.known ? Math.round(iv.pl * 100) / 100 : '';
  updateMarketPreview();
  marketDialog.showModal();
  setTimeout(() => marketForm.mvalue.focus(), 250);
}

function updateMarketPreview() {
  const cost = balanceOf(marketGoalId);
  const v = marketForm.mvalue.value;
  if (v === '') return ($('#marketPreview').textContent = '');
  const pl = numOr0(v) - cost;
  const pct = cost > 0 ? (pl / cost) * 100 : 0;
  $('#marketPreview').innerHTML = `<span class="amt ${plClass(pl)}">${pl >= 0 ? 'กำไร' : 'ขาดทุน'} ${signedFmt(pl)} (${pctFmt(pct)})</span>`;
}

// สองช่องคำนวณหากัน: มูลค่า = ต้นทุน + กำไร/ขาดทุน
marketForm.addEventListener('input', (ev) => {
  const cost = balanceOf(marketGoalId);
  if (ev.target.name === 'mvalue') marketForm.mpl.value = ev.target.value === '' ? '' : Math.round((numOr0(ev.target.value) - cost) * 100) / 100;
  if (ev.target.name === 'mpl') marketForm.mvalue.value = ev.target.value === '' || ev.target.value === '-' ? '' : Math.round((cost + numOr0(ev.target.value)) * 100) / 100;
  updateMarketPreview();
});

marketForm.addEventListener('submit', (ev) => {
  ev.preventDefault();
  if (marketForm.mvalue.value === '') return;
  const g = goalById(marketGoalId);
  g.marketValue = Math.round(numOr0(marketForm.mvalue.value) * 100) / 100;
  g.marketAt = today();
  save();
  marketDialog.close();
  render({ keepScroll: true });
  toast('อัปเดตมูลค่าแล้ว');
});

$('#marketClearBtn').addEventListener('click', () => {
  const g = goalById(marketGoalId);
  delete g.marketValue;
  delete g.marketAt;
  save();
  marketDialog.close();
  render({ keepScroll: true });
});

/* ================= หนี้: จ่ายงวด (แตะทีเดียว) ================= */
function payDebt(id) {
  const g = goalById(id);
  const d = debtInfo(g);
  if (!d.left) return;
  const amount = Math.round(Math.min(d.inst, d.remaining) * 100) / 100;
  const label = d.mode === 'steps' ? `งวด ${monthLabel(d.lastOffset - d.left + 1)}` : `งวดที่ ${d.paidCount + 1}`;
  state.entries.push({ id: uid(), createdAt: Date.now(), goalId: g.id, type: 'in', amount, date: today(), note: label });
  save();
  render({ keepScroll: true });
  toast(`จ่าย${label} · ${fmt(amount)} แล้ว`);
}

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
  if (act?.dataset.action === 'market') return openMarket(act.dataset.id);
  if (act?.dataset.action === 'pay-debt') return payDebt(act.dataset.id);
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
