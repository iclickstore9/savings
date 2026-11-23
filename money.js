'use strict';
/* ================= รายรับ-รายจ่าย =================
 * ข้อมูล (ซิงก์ผ่าน cloud.js เหมือน goals/entries):
 *   txns       { id, type:'income'|'expense', amount, categoryId, date, note,
 *                recurringId?, period?, goalEntryId?, createdAt, updatedAt }
 *   categories { id, type, name, icon, color, createdAt }
 *   recurring  { id, type, name, amount, categoryId, day, startMonth, skips[], createdAt }
 * โหลดก่อน app.js — ใช้ state/ico/fmt/save/render ของ app.js ตอนถูกเรียกเท่านั้น
 */
window.Money = (() => {
  const SAVING_CAT = 'c-saving';
  const DEFAULT_CATEGORIES = [
    ['c-food', 'expense', 'อาหาร', 'utensils', '#ea580c'],
    ['c-travel', 'expense', 'เดินทาง', 'bus', '#2563eb'],
    ['c-home', 'expense', 'บ้าน/ค่าเช่า', 'house', '#0f766e'],
    ['c-bills', 'expense', 'น้ำ ไฟ เน็ต', 'zap', '#ca8a04'],
    ['c-debt', 'expense', 'ผ่อน/หนี้', 'credit-card', '#dc2626'],
    ['c-insure', 'expense', 'ประกัน', 'shield-check', '#7c3aed'],
    ['c-shop', 'expense', 'ช้อปปิ้ง', 'shopping-bag', '#db2777'],
    ['c-health', 'expense', 'สุขภาพ', 'heart-pulse', '#16a34a'],
    ['c-fun', 'expense', 'บันเทิง', 'gamepad-2', '#7c3aed'],
    [SAVING_CAT, 'expense', 'เงินออม', 'piggy-bank', '#0f766e'],
    ['c-other', 'expense', 'อื่นๆ', 'circle-ellipsis', '#64748b'],
    ['c-salary', 'income', 'เงินเดือน', 'briefcase', '#16a34a'],
    ['c-side', 'income', 'รายได้เสริม', 'coins', '#0f766e'],
    ['c-bonus', 'income', 'โบนัส', 'gift', '#ca8a04'],
    ['c-inc-other', 'income', 'รายรับอื่นๆ', 'wallet', '#64748b'],
  ];
  const CAT_ICONS = [
    'utensils', 'coffee', 'bus', 'fuel', 'car', 'house', 'zap', 'wifi', 'credit-card', 'landmark',
    'shield-check', 'shopping-bag', 'shirt', 'heart-pulse', 'dumbbell', 'gamepad-2', 'book-open', 'graduation-cap', 'baby', 'paw-print',
    'users', 'gift', 'plane', 'smartphone', 'receipt', 'piggy-bank', 'briefcase', 'coins', 'banknote', 'hand-coins',
    'wallet', 'sparkles', 'circle-ellipsis',
  ];
  const CAT_COLORS = ['#0f766e', '#2563eb', '#7c3aed', '#db2777', '#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#64748b'];

  const q = (s) => document.querySelector(s);
  const curMonth = () => today().slice(0, 7);
  const pad = (n) => String(n).padStart(2, '0');
  const shiftMonth = (ym, d) => {
    const [y, m] = ym.split('-').map(Number);
    const dt = new Date(y, m - 1 + d, 1);
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}`;
  };
  const lastDay = (ym) => {
    const [y, m] = ym.split('-').map(Number);
    return new Date(y, m, 0).getDate();
  };
  const dateInMonth = (ym, day) => `${ym}-${pad(Math.min(Math.max(1, day), lastDay(ym)))}`;
  const fmtDay = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' });
  const round2 = (v) => Math.round(parseFloat(v) * 100) / 100;

  const catById = (id) => state.categories.find((c) => c.id === id);
  const catOf = (id) => catById(id) || { id, name: 'ไม่มีหมวด', icon: 'circle-ellipsis', color: '#64748b' };
  const catsOfType = (type) => state.categories.filter((c) => c.type === type);
  const catBadge = (c, cls = 'sm') =>
    `<div class="goal-emoji ${cls}" style="background:${c.color}1f;color:${c.color}">${ico(c.icon)}</div>`;
  const isSavingTxn = (t) => t.type === 'expense' && t.categoryId === SAVING_CAT;
  const linkedEntry = (t) => (t.goalEntryId ? state.entries.find((e) => e.id === t.goalEntryId) : null);
  const goalName = (id) => goalById(id)?.name;
  const goalOptions = (selected) =>
    '<option value="">ไม่เชื่อมเป้า</option>' +
    state.goals.map((g) => `<option value="${g.id}" ${g.id === selected ? 'selected' : ''}>${esc(g.name)}</option>`).join('');
  const entryNoteOf = (t) => (t.note ? `${t.note} (จากรายรับรายจ่าย)` : 'จากรายรับรายจ่าย');

  // ผูก/ย้าย/ยกเลิก ยอดฝากในเป้าออมให้ตรงกับรายจ่ายหมวดเงินออม
  function linkTxnToGoal(t, goalId) {
    const existing = linkedEntry(t);
    if (!goalId || !goalById(goalId) || !isSavingTxn(t)) {
      if (existing) state.entries = state.entries.filter((e) => e.id !== existing.id);
      delete t.goalEntryId;
      return;
    }
    if (existing) {
      Object.assign(existing, { goalId, amount: t.amount, date: t.date });
    } else {
      const e = { id: uid(), createdAt: Date.now(), goalId, type: 'in', amount: t.amount, date: t.date, note: entryNoteOf(t), txnId: t.id };
      state.entries.push(e);
      t.goalEntryId = e.id;
    }
  }

  const txnsOf = (ym) => state.txns.filter((t) => t.date.startsWith(ym));
  const sumType = (list, type) => list.filter((t) => t.type === type).reduce((s, t) => s + t.amount, 0);

  /* ---------- หมวดตั้งต้น ---------- */
  function ensureCategories() {
    if (state.catSeeded) return;
    const have = new Set(state.categories.map((c) => c.id));
    DEFAULT_CATEGORIES.forEach(([id, type, name, icon, color], i) => {
      if (!have.has(id)) state.categories.push({ id, type, name, icon, color, createdAt: i + 1 });
    });
    state.catSeeded = true;
    save();
  }
  function ensureSavingCat() {
    if (catById(SAVING_CAT)) return;
    const d = DEFAULT_CATEGORIES.find((c) => c[0] === SAVING_CAT);
    state.categories.push({ id: d[0], type: d[1], name: d[2], icon: d[3], color: d[4], createdAt: Date.now() });
  }

  /* ---------- รายการประจำที่รอยืนยัน ---------- */
  function pendingOf(ym) {
    if (ym > curMonth()) return [];
    return state.recurring
      .filter((r) => ym >= (r.startMonth || '0000-00'))
      .filter((r) => !(r.skips || []).includes(ym))
      .filter((r) => !state.txns.some((t) => t.recurringId === r.id && t.period === ym))
      .sort((a, b) => a.day - b.day);
  }

  /* ================= หน้าจอเดือน ================= */
  let filterCat = null;
  let lastMonth = null;

  function renderMoney(ym) {
    if (ym !== lastMonth) filterCat = null;
    lastMonth = ym;
    const list = txnsOf(ym);
    const income = sumType(list, 'income');
    const expense = sumType(list, 'expense');
    const balance = income - expense;
    const prevList = txnsOf(shiftMonth(ym, -1));
    const prevExpense = sumType(prevList, 'expense');
    const pending = pendingOf(ym);

    let compare = '';
    if (prevList.length && expense > 0) {
      const d = expense - prevExpense;
      const pct = prevExpense ? Math.round((Math.abs(d) / prevExpense) * 100) : null;
      compare = d === 0
        ? 'รายจ่ายเท่ากับเดือนก่อน'
        : `รายจ่าย${d > 0 ? 'มากกว่า' : 'น้อยกว่า'}เดือนก่อน ${fmt(Math.abs(d))}${pct !== null ? ` (${d > 0 ? '+' : '−'}${pct}%)` : ''}`;
      compare = `<div class="ms-compare ${d > 0 ? 'up' : 'down'}">${ico(d > 0 ? 'trending-up' : 'arrow-down-left')} ${compare}</div>`;
    }

    // รายจ่ายตามหมวด — แท่งแนวนอนเรียงมาก→น้อย สีเดียว
    const byCat = {};
    for (const t of list) if (t.type === 'expense') byCat[t.categoryId] = (byCat[t.categoryId] || 0) + t.amount;
    const rows = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
    const max = rows.length ? rows[0][1] : 0;
    const bars = rows
      .map(([id, amt]) => {
        const c = catOf(id);
        const pct = expense ? (amt / expense) * 100 : 0;
        return `
        <button class="cat-bar-row ${filterCat === id ? 'sel' : ''}" data-mact="filter" data-id="${esc(id)}" aria-label="${esc(c.name)} ${fmt(amt)} ${pct.toFixed(0)}%">
          ${catBadge(c)}
          <div class="cbr-main">
            <div class="cbr-top"><span class="cbr-name">${esc(c.name)}</span><span class="cbr-amt">${fmt(amt)}</span></div>
            <div class="cbr-track"><div class="cbr-bar" style="width:${Math.max(2, (amt / max) * 100)}%"></div><span class="cbr-pct">${pct < 1 ? '<1' : Math.round(pct)}%</span></div>
          </div>
        </button>`;
      })
      .join('');

    const shown = filterCat ? list.filter((t) => t.categoryId === filterCat) : list;
    const byDate = {};
    for (const t of [...shown].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)) (byDate[t.date] ||= []).push(t);
    const history = Object.entries(byDate)
      .map(([d, items]) => {
        const net = items.reduce((s, t) => s + (t.type === 'income' ? t.amount : -t.amount), 0);
        return `
        <div class="month-head"><span>${fmtDay(d)}</span><span>${net >= 0 ? '+' : '−'}${fmt(Math.abs(net))}</span></div>
        <div class="card entry-list">${items.map(txnRow).join('')}</div>`;
      })
      .join('');

    const pendingHtml = pending.length ? `
      <div class="section-title">
        <h2>รายการประจำรอยืนยัน <span class="count">${pending.length}</span></h2>
        <button class="link-btn" data-mact="recurring">จัดการ</button>
      </div>
      <div class="card entry-list">${pending.map((r) => pendingRow(r, ym)).join('')}</div>` : '';

    return `
      <div class="month-nav">
        <button class="icon-btn" data-mact="month" data-to="${shiftMonth(ym, -1)}" aria-label="เดือนก่อน">${ico('chevron-left')}</button>
        <h2>${fmtMonth(ym)}</h2>
        <button class="icon-btn" data-mact="month" data-to="${shiftMonth(ym, 1)}" aria-label="เดือนถัดไป">${ico('chevron-right')}</button>
      </div>

      <section class="card money-summary">
        <div class="ms-grid">
          <div><div class="k">รายรับ</div><div class="v amt in">+${fmt(income)}</div></div>
          <div><div class="k">รายจ่าย</div><div class="v amt out">−${fmt(expense)}</div></div>
        </div>
        <div class="ms-balance">
          <div class="k">คงเหลือ</div>
          <div class="big ${balance < 0 ? 'neg' : ''}">${balance < 0 ? '−' : ''}${fmt(Math.abs(balance))}</div>
        </div>
        ${compare}
        ${balance > 0 ? `<button class="btn save-left" data-mact="save-left">${ico('piggy-bank')} ออมเงินที่เหลือ</button>` : ''}
      </section>

      <button class="card plan-card" data-mact="budget">
        <div class="plan-ico">${ico('calculator')}</div>
        <div class="plan-text">
          <div class="plan-title">วางแผนรายเดือน</div>
          <div class="plan-sub">${esc(Budget.summary())}</div>
        </div>
        ${ico('chevron-right', 'muted-ico')}
      </button>

      <div class="quick-links">
        <button class="ql" data-mact="recurring">${ico('repeat')}<span>รายการประจำ</span><b>${state.recurring.length}</b></button>
        <button class="ql" data-mact="categories">${ico('tags')}<span>หมวดหมู่</span><b>${state.categories.length}</b></button>
      </div>

      ${pendingHtml}

      ${rows.length ? `
      <div class="section-title"><h2>รายจ่ายตามหมวด</h2>${filterCat ? `<button class="link-btn" data-mact="filter" data-id="">ดูทั้งหมด</button>` : ''}</div>
      <div class="card cat-bars">${bars}</div>` : ''}

      <div class="section-title"><h2>${filterCat ? `รายการ: ${esc(catOf(filterCat).name)}` : 'รายการ'}</h2></div>
      ${history || `<div class="empty"><div class="empty-ico">${ico('receipt')}</div><p>ยังไม่มีรายการเดือนนี้<br/>กดปุ่ม + เพื่อบันทึกรายรับ/รายจ่าย</p></div>`}
    `;
  }

  function txnRow(t) {
    const c = catOf(t.categoryId);
    const label = t.note || c.name;
    const tags = [c.name];
    if (t.recurringId) tags.push('ประจำ');
    const le = linkedEntry(t);
    if (le && goalName(le.goalId)) tags.push('→ ' + goalName(le.goalId));
    return `
      <div class="entry" data-mact="txn" data-id="${t.id}">
        ${catBadge(c)}
        <div class="meta">
          <div class="note">${esc(label)}</div>
          <div class="date">${tags.map(esc).join(' · ')}</div>
        </div>
        <div class="amt ${t.type === 'income' ? 'in' : 'out'}">${t.type === 'income' ? '+' : '−'}${fmt(t.amount)}</div>
      </div>`;
  }

  function pendingRow(r, ym) {
    const c = catOf(r.categoryId);
    return `
      <div class="entry pending">
        ${catBadge(c)}
        <div class="meta">
          <div class="note">${esc(r.name)}</div>
          <div class="date">ทุกวันที่ ${r.day}${r.goalId && goalName(r.goalId) ? ' → ' + esc(goalName(r.goalId)) : ''} · <span class="amt ${r.type === 'income' ? 'in' : 'out'}">${r.type === 'income' ? '+' : '−'}${fmt(r.amount)}</span></div>
        </div>
        <button class="icon-btn small" data-mact="pending-edit" data-id="${r.id}" data-ym="${ym}" aria-label="แก้ยอดก่อนยืนยัน">${ico('pencil')}</button>
        <button class="confirm-btn" data-mact="pending-ok" data-id="${r.id}" data-ym="${ym}" aria-label="ยืนยัน">${ico('check')}<span>ยืนยัน</span></button>
      </div>`;
  }

  /* ---------- คลิกในหน้าเดือน ---------- */
  q('#app').addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-mact]');
    if (!el) return;
    const { mact, id, ym } = el.dataset;
    if (mact === 'month') location.hash = `#/money/${el.dataset.to}`;
    else if (mact === 'filter') { filterCat = id && filterCat !== id ? id : null; render({ keepScroll: true }); }
    else if (mact === 'txn') openTxnForm({ txnId: id });
    else if (mact === 'pending-ok') confirmRecurring(id, ym);
    else if (mact === 'pending-edit') openTxnForm({ recurringId: id, period: ym });
    else if (mact === 'recurring') openRecList();
    else if (mact === 'categories') openCatList();
    else if (mact === 'save-left') openSaveLeft();
    else if (mact === 'budget') Budget.open();
  });

  /* ================= ฟอร์มรายรับ/รายจ่าย ================= */
  const txnDialog = q('#txnDialog');
  const txnForm = q('#txnForm');
  let txnCtx = {}; // { txnId } | { recurringId, period } | { month }

  function renderCatGrid(container, input, type, selected, onPick) {
    const cats = catsOfType(type);
    if (!cats.some((c) => c.id === selected)) selected = cats[0]?.id || '';
    input.value = selected;
    container.innerHTML = cats
      .map((c) => `<button type="button" class="${c.id === selected ? 'sel' : ''}" data-v="${c.id}" style="--c:${c.color}">${ico(c.icon)}<span>${esc(c.name)}</span></button>`)
      .join('') + `<button type="button" class="add-cat" data-add-cat="${type}">${ico('plus')}<span>เพิ่มหมวด</span></button>`;
    container.onclick = (ev) => {
      const add = ev.target.closest('[data-add-cat]');
      if (add) return openCatForm({ type: add.dataset.addCat, onSaved: (cid) => { renderCatGrid(container, input, type, cid, onPick); onPick?.(cid); } });
      const b = ev.target.closest('[data-v]');
      if (!b) return;
      input.value = b.dataset.v;
      container.querySelectorAll('[data-v]').forEach((x) => x.classList.toggle('sel', x === b));
      onPick?.(b.dataset.v);
    };
    onPick?.(selected);
  }

  // แสดงช่อง "เข้าเป้าหมาย" เมื่อเลือกหมวดเงินออม (รายจ่าย)
  function toggleGoalPick(wrap, select, type, catId, preferGoal) {
    const show = type === 'expense' && catId === SAVING_CAT;
    wrap.hidden = !show;
    if (!show) return;
    const cur = preferGoal !== undefined ? preferGoal : select.value || state.goals[0]?.id || '';
    select.innerHTML = goalOptions(cur);
  }

  function setTxnType(type, selected, preferGoal) {
    txnForm.ttype.value = type;
    q('#txnDialogTitle').textContent = (txnCtx.txnId ? 'แก้ไข' : 'บันทึก') + (type === 'income' ? 'รายรับ' : 'รายจ่าย');
    let first = true;
    renderCatGrid(q('#txnCats'), txnForm.categoryId, type, selected, (cid) => {
      toggleGoalPick(q('#txnGoalWrap'), txnForm.goalId, type, cid, first ? preferGoal : undefined);
      first = false;
    });
  }

  function openTxnForm(ctx = {}) {
    txnCtx = ctx;
    const t = ctx.txnId ? state.txns.find((x) => x.id === ctx.txnId) : null;
    const r = ctx.recurringId ? state.recurring.find((x) => x.id === ctx.recurringId) : null;
    const month = ctx.month || curMonth();
    const defDate = month === curMonth() ? today() : dateInMonth(month, 1);
    const type = t?.type || r?.type || 'expense';
    txnForm.amount.value = t?.amount ?? r?.amount ?? '';
    txnForm.date.value = t?.date || (r ? dateInMonth(ctx.period, r.day) : defDate);
    txnForm.note.value = t?.note ?? r?.name ?? '';
    txnForm.goalId.innerHTML = '';
    const le = t ? linkedEntry(t) : null;
    const preferGoal = t ? (le ? le.goalId : '') : r ? (r.goalId && goalById(r.goalId) ? r.goalId : '') : undefined;
    setTxnType(type, t?.categoryId || r?.categoryId, preferGoal);
    const info = q('#txnLinkInfo');
    info.hidden = true;
    if (le) { info.hidden = false; info.textContent = 'รายการนี้ผูกกับยอดฝากในเป้าออม แก้/ลบที่นี่ ยอดฝากจะเปลี่ยนตาม'; }
    else if (t?.recurringId || r) { info.hidden = false; info.textContent = `รายการประจำ${r ? ` "${r.name}" เดือน${fmtMonth(ctx.period)}` : ''}`; }
    q('#txnDeleteBtn').hidden = !t;
    q('#txnSkipBtn').hidden = !r;
    txnDialog.showModal();
    if (!t && !r) setTimeout(() => txnForm.amount.focus(), 250);
  }

  txnForm.addEventListener('change', (ev) => {
    if (ev.target.name === 'ttype') setTxnType(ev.target.value);
  });

  txnForm.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const amount = round2(txnForm.amount.value);
    if (!(amount > 0) || !txnForm.categoryId.value) return;
    const data = {
      type: txnForm.ttype.value,
      amount,
      categoryId: txnForm.categoryId.value,
      date: txnForm.date.value || today(),
      note: txnForm.note.value.trim(),
    };
    const goalId = q('#txnGoalWrap').hidden ? '' : txnForm.goalId.value;
    let t;
    if (txnCtx.txnId) {
      t = state.txns.find((x) => x.id === txnCtx.txnId);
      Object.assign(t, data);
    } else {
      t = { id: uid(), createdAt: Date.now(), ...data };
      if (txnCtx.recurringId) { t.recurringId = txnCtx.recurringId; t.period = txnCtx.period; }
      state.txns.push(t);
    }
    linkTxnToGoal(t, goalId);
    save();
    txnDialog.close();
    render({ keepScroll: true });
    toast(t.goalEntryId ? `ออม ${fmt(amount)} เข้า "${goalName(goalId)}" แล้ว` : `${data.type === 'income' ? 'รายรับ' : 'รายจ่าย'} ${fmt(amount)} บันทึกแล้ว`);
  });

  q('#txnDeleteBtn').addEventListener('click', () => {
    const t = state.txns.find((x) => x.id === txnCtx.txnId);
    if (!confirm(linkedEntry(t) ? 'ลบรายการนี้? ยอดฝากในเป้าออมที่ผูกไว้จะถูกลบด้วย' : 'ลบรายการนี้?')) return;
    deleteTxn(t.id);
    save();
    txnDialog.close();
    render({ keepScroll: true });
    toast('ลบแล้ว');
  });

  q('#txnSkipBtn').addEventListener('click', () => {
    const r = state.recurring.find((x) => x.id === txnCtx.recurringId);
    (r.skips ||= []).push(txnCtx.period);
    save();
    txnDialog.close();
    render({ keepScroll: true });
    toast(`ข้าม "${r.name}" เดือนนี้แล้ว`);
  });

  function deleteTxn(id) {
    const t = state.txns.find((x) => x.id === id);
    if (!t) return;
    state.txns = state.txns.filter((x) => x.id !== id);
    if (t.goalEntryId) state.entries = state.entries.filter((e) => e.id !== t.goalEntryId);
  }

  // เรียกจาก app.js เมื่อแก้/ลบยอดฝากในเป้าออมที่ผูกกับรายจ่าย
  function onEntryChanged(entry) {
    if (!entry.txnId) return;
    const t = state.txns.find((x) => x.id === entry.txnId);
    if (t) { t.amount = entry.amount; t.date = entry.date; }
  }
  function onGoalDeleted(goalId, removedEntryIds) {
    const ids = new Set(removedEntryIds);
    for (const t of state.txns) if (ids.has(t.goalEntryId)) delete t.goalEntryId;
    for (const r of state.recurring) if (r.goalId === goalId) r.goalId = '';
  }
  function onEntryDeleted(entry) {
    if (entry.txnId) state.txns = state.txns.filter((x) => x.id !== entry.txnId);
  }

  function confirmRecurring(id, ym) {
    const r = state.recurring.find((x) => x.id === id);
    const t = {
      id: uid(), createdAt: Date.now(), type: r.type, amount: r.amount, categoryId: r.categoryId,
      date: dateInMonth(ym, r.day), note: r.name, recurringId: r.id, period: ym,
    };
    state.txns.push(t);
    linkTxnToGoal(t, r.goalId);
    save();
    render({ keepScroll: true });
    toast(t.goalEntryId ? `ออม "${r.name}" ${fmt(r.amount)} เข้า "${goalName(r.goalId)}" แล้ว` : `ยืนยัน "${r.name}" ${fmt(r.amount)} แล้ว`);
  }

  /* ================= Google Calendar (ลิงก์เพิ่มนัด ไม่ต้องขอสิทธิ์) ================= */
  // วันครบกำหนดครั้งถัดไป (เดือนนี้ถ้ายังไม่ถึง ไม่งั้นเดือนหน้า) → นัดทั้งวันที่ซ้ำทุกเดือน
  function nextDue(day) {
    const ym = curMonth();
    const thisMonth = dateInMonth(ym, day);
    return thisMonth >= today() ? thisMonth : dateInMonth(shiftMonth(ym, 1), day);
  }
  function calendarUrl(r) {
    const start = nextDue(r.day);
    const d = new Date(start + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    const end = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
    // วันที่ 29-31: เดือนที่ไม่มีวันนั้นให้ใช้วันสุดท้ายของเดือน
    const rule = r.day > 28
      ? `RRULE:FREQ=MONTHLY;BYMONTHDAY=${r.day},-1;BYSETPOS=1`
      : `RRULE:FREQ=MONTHLY;BYMONTHDAY=${r.day}`;
    const c = catOf(r.categoryId);
    const isIn = r.type === 'income';
    const goal = r.goalId && goalName(r.goalId);
    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: `${isIn ? '💰' : '💳'} ${r.name} ${fmt(r.amount)}`,
      dates: `${start.replaceAll('-', '')}/${end}`,
      recur: rule,
      ctz: 'Asia/Bangkok',
      details: [
        `${isIn ? 'รายรับประจำ' : 'รายจ่ายประจำ'} ${fmt(r.amount)} ทุกวันที่ ${r.day}`,
        `หมวด: ${c.name}${goal ? ` → เป้า "${goal}"` : ''}`,
        '',
        `ยืนยันรายการในแอปกระปุกออม: ${location.origin}${location.pathname}#/money`,
      ].join('\n'),
    });
    return 'https://calendar.google.com/calendar/render?' + params.toString().replace(/\+/g, '%20');
  }
  function addToCalendar(r) {
    window.open(calendarUrl(r), '_blank', 'noopener');
  }

  /* ================= รายการประจำ ================= */
  const recDialog = q('#recDialog');
  const recFormDialog = q('#recFormDialog');
  const recForm = q('#recForm');
  let editingRecId = null;

  function openRecList() {
    renderRecList();
    recDialog.showModal();
  }

  function renderRecList() {
    const group = (type) => state.recurring.filter((r) => r.type === type).sort((a, b) => a.day - b.day);
    const total = (type) => group(type).reduce((s, r) => s + r.amount, 0);
    const rows = (type) => group(type)
      .map((r) => {
        const c = catOf(r.categoryId);
        return `
        <div class="entry" data-rec="${r.id}">
          ${catBadge(c)}
          <div class="meta"><div class="note">${esc(r.name)}</div><div class="date">ทุกวันที่ ${r.day} · ${esc(c.name)}${r.goalId && goalName(r.goalId) ? ' → ' + esc(goalName(r.goalId)) : ''}</div></div>
          <div class="amt ${type === 'income' ? 'in' : 'out'}">${fmt(r.amount)}</div>
          <button type="button" class="icon-btn small cal-btn" data-cal="${r.id}" aria-label="เพิ่ม ${esc(r.name)} ลง Google Calendar">${ico('calendar-plus')}</button>
        </div>`;
      })
      .join('') || `<div class="muted small pad">ยังไม่มี</div>`;
    const inc = total('income'), exp = total('expense');
    q('#recBody').innerHTML = `
      <h2>${ico('repeat')} รายการประจำ</h2>
      <p class="muted small">ทุกเดือนจะขึ้นให้กดยืนยันในหน้ารายรับรายจ่าย แก้ยอดก่อนยืนยันได้ · กด 📅 เพื่อเพิ่มนัดเตือนใน Google Calendar</p>
      <div class="rec-sum">
        <div><span class="k">รับประจำ</span><b class="amt in">${fmt(inc)}</b></div>
        <div><span class="k">จ่ายประจำ</span><b class="amt out">${fmt(exp)}</b></div>
        <div><span class="k">เหลือ/เดือน</span><b>${inc - exp < 0 ? '−' : ''}${fmt(Math.abs(inc - exp))}</b></div>
      </div>
      <div class="sub-head"><span>รายรับประจำ</span></div>
      <div class="card entry-list">${rows('income')}</div>
      <div class="sub-head"><span>รายจ่ายประจำ</span></div>
      <div class="card entry-list">${rows('expense')}</div>
      <div class="actions">
        <button type="button" class="btn" data-rec-add>${ico('plus')} เพิ่มรายการประจำ</button>
        <span class="spacer"></span>
        <button type="button" class="btn primary" data-close>เสร็จ</button>
      </div>`;
  }

  q('#recBody').addEventListener('click', (ev) => {
    const cal = ev.target.closest('[data-cal]');
    if (cal) return addToCalendar(state.recurring.find((x) => x.id === cal.dataset.cal));
    const row = ev.target.closest('[data-rec]');
    if (row) return openRecForm(row.dataset.rec);
    if (ev.target.closest('[data-rec-add]')) openRecForm();
  });

  function setRecType(type, selected, preferGoal) {
    recForm.rtype.value = type;
    let first = true;
    renderCatGrid(q('#recCats'), recForm.categoryId, type, selected, (cid) => {
      toggleGoalPick(q('#recGoalWrap'), recForm.goalId, type, cid, first ? preferGoal : undefined);
      first = false;
    });
  }

  function openRecForm(id) {
    editingRecId = id || null;
    const r = id ? state.recurring.find((x) => x.id === id) : null;
    q('#recFormTitle').textContent = r ? 'แก้ไขรายการประจำ' : 'รายการประจำใหม่';
    recForm.name.value = r?.name || '';
    recForm.amount.value = r?.amount ?? '';
    recForm.day.value = r?.day ?? new Date().getDate();
    recForm.goalId.innerHTML = '';
    setRecType(r?.type || 'expense', r?.categoryId, r ? (r.goalId && goalById(r.goalId) ? r.goalId : '') : undefined);
    q('#recDeleteBtn').hidden = !r;
    q('#recCalBtn').hidden = !r;
    recFormDialog.showModal();
  }

  recForm.addEventListener('change', (ev) => {
    if (ev.target.name === 'rtype') setRecType(ev.target.value);
  });

  recForm.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const amount = round2(recForm.amount.value);
    const day = Math.min(31, Math.max(1, parseInt(recForm.day.value, 10) || 1));
    const name = recForm.name.value.trim();
    if (!name || !(amount > 0) || !recForm.categoryId.value) return;
    const data = { type: recForm.rtype.value, name, amount, day, categoryId: recForm.categoryId.value };
    data.goalId = q('#recGoalWrap').hidden ? '' : recForm.goalId.value;
    if (editingRecId) Object.assign(state.recurring.find((x) => x.id === editingRecId), data);
    else state.recurring.push({ id: uid(), createdAt: Date.now(), startMonth: curMonth(), skips: [], ...data });
    save();
    recFormDialog.close();
    if (recDialog.open) renderRecList();
    render({ keepScroll: true });
    toast('บันทึกรายการประจำแล้ว');
  });

  q('#recCalBtn').addEventListener('click', () => {
    const r = state.recurring.find((x) => x.id === editingRecId);
    // ใช้ค่าที่กำลังแก้ในฟอร์ม (ยังไม่ต้องกดบันทึก)
    addToCalendar({
      ...r,
      name: recForm.name.value.trim() || r.name,
      amount: round2(recForm.amount.value) || r.amount,
      day: Math.min(31, Math.max(1, parseInt(recForm.day.value, 10) || r.day)),
      type: recForm.rtype.value,
      categoryId: recForm.categoryId.value || r.categoryId,
    });
  });

  q('#recDeleteBtn').addEventListener('click', () => {
    const r = state.recurring.find((x) => x.id === editingRecId);
    if (!confirm(`ลบรายการประจำ "${r.name}"? (รายการที่ยืนยันไปแล้วยังอยู่)`)) return;
    state.recurring = state.recurring.filter((x) => x.id !== editingRecId);
    save();
    recFormDialog.close();
    if (recDialog.open) renderRecList();
    render({ keepScroll: true });
  });

  /* ================= หมวดหมู่ ================= */
  const catDialog = q('#catDialog');
  const catFormDialog = q('#catFormDialog');
  const catForm = q('#catForm');
  let catCtx = {};

  function openCatList() {
    renderCatList();
    catDialog.showModal();
  }

  function renderCatList() {
    const used = (id) => state.txns.filter((t) => t.categoryId === id).length;
    const rows = (type) => catsOfType(type)
      .map((c) => `
        <div class="entry" data-cat="${c.id}">
          ${catBadge(c)}
          <div class="meta"><div class="note">${esc(c.name)}</div><div class="date">${used(c.id)} รายการ</div></div>
          ${ico('chevron-right', 'muted-ico')}
        </div>`)
      .join('') || `<div class="muted small pad">ยังไม่มี</div>`;
    q('#catBody').innerHTML = `
      <h2>${ico('tags')} หมวดหมู่</h2>
      <div class="sub-head"><span>รายจ่าย</span></div>
      <div class="card entry-list">${rows('expense')}</div>
      <div class="sub-head"><span>รายรับ</span></div>
      <div class="card entry-list">${rows('income')}</div>
      <div class="actions">
        <button type="button" class="btn" data-cat-add>${ico('plus')} เพิ่มหมวด</button>
        <span class="spacer"></span>
        <button type="button" class="btn primary" data-close>เสร็จ</button>
      </div>`;
  }

  q('#catBody').addEventListener('click', (ev) => {
    const row = ev.target.closest('[data-cat]');
    if (row) return openCatForm({ id: row.dataset.cat });
    if (ev.target.closest('[data-cat-add]')) openCatForm({});
  });

  let selectCatIcon, selectCatColor;
  function openCatForm(ctx) {
    catCtx = ctx;
    if (!selectCatIcon) {
      selectCatIcon = pickerRow(q('#catIconRow'), CAT_ICONS, catForm.icon, false);
      selectCatColor = pickerRow(q('#catColorRow'), CAT_COLORS, catForm.color, true);
    }
    const c = ctx.id ? catById(ctx.id) : null;
    q('#catFormTitle').textContent = c ? 'แก้ไขหมวดหมู่' : 'หมวดหมู่ใหม่';
    catForm.ctype.value = c?.type || ctx.type || 'expense';
    catForm.name.value = c?.name || '';
    selectCatIcon(c?.icon || 'sparkles');
    selectCatColor(c?.color || CAT_COLORS[state.categories.length % CAT_COLORS.length]);
    q('#catDeleteBtn').hidden = !c || c.id === SAVING_CAT;
    catFormDialog.showModal();
  }

  catForm.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const name = catForm.name.value.trim();
    if (!name) return;
    const data = { type: catForm.ctype.value, name, icon: catForm.icon.value, color: catForm.color.value };
    let id = catCtx.id;
    if (id) Object.assign(catById(id), data);
    else {
      id = uid();
      state.categories.push({ id, createdAt: Date.now(), ...data });
    }
    save();
    catFormDialog.close();
    if (catDialog.open) renderCatList();
    catCtx.onSaved?.(id);
    render({ keepScroll: true });
  });

  q('#catDeleteBtn').addEventListener('click', () => {
    const c = catById(catCtx.id);
    const n = state.txns.filter((t) => t.categoryId === c.id).length;
    if (!confirm(`ลบหมวด "${c.name}"?${n ? ` (${n} รายการเดิมจะแสดงเป็น "ไม่มีหมวด")` : ''}`)) return;
    state.categories = state.categories.filter((x) => x.id !== c.id);
    save();
    catFormDialog.close();
    if (catDialog.open) renderCatList();
    render({ keepScroll: true });
  });

  /* ================= ออมเงินที่เหลือ → เป้าออม ================= */
  const saveLeftDialog = q('#saveLeftDialog');
  const saveLeftForm = q('#saveLeftForm');

  function openSaveLeft() {
    if (!state.goals.length) {
      toast('สร้างเป้าหมายการออมก่อน (แท็บเงินออม)');
      return;
    }
    const ym = lastMonth;
    const list = txnsOf(ym);
    const left = sumType(list, 'income') - sumType(list, 'expense');
    saveLeftForm.goalId.innerHTML = state.goals.map((g) => `<option value="${g.id}">${esc(g.name)}</option>`).join('');
    saveLeftForm.amount.value = Math.max(0, round2(left));
    q('#saveLeftInfo').textContent = `${fmtMonth(ym)} เหลือ ${fmt(left)} — บันทึกเป็นรายจ่ายหมวด "เงินออม" และเป็นยอดฝากในเป้าที่เลือก`;
    saveLeftDialog.showModal();
  }

  saveLeftForm.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const amount = round2(saveLeftForm.amount.value);
    if (!(amount > 0)) return;
    const g = goalById(saveLeftForm.goalId.value);
    const ym = lastMonth;
    const date = ym === curMonth() ? today() : dateInMonth(ym, 31);
    ensureSavingCat();
    const entry = { id: uid(), createdAt: Date.now(), goalId: g.id, type: 'in', amount, date, note: `จากรายรับรายจ่าย ${fmtMonth(ym)}` };
    const txn = { id: uid(), createdAt: Date.now(), type: 'expense', amount, categoryId: SAVING_CAT, date, note: `ออมเข้า "${g.name}"`, goalEntryId: entry.id };
    entry.txnId = txn.id;
    state.entries.push(entry);
    state.txns.push(txn);
    save();
    saveLeftDialog.close();
    render({ keepScroll: true });
    toast(`ออม ${fmt(amount)} เข้า "${g.name}" แล้ว`);
  });

  return { calendarUrl, renderMoney, openTxnForm, ensureCategories, onEntryChanged, onEntryDeleted, onGoalDeleted, pendingOf, curMonth };
})();
