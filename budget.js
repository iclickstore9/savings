'use strict';
/* ================= วางแผนรายเดือน (คำนวณคร่าวๆ) =================
 * ใช้รายการประจำเป็นฐาน ปรับยอด/ไม่นับได้ + เพิ่มรับอื่นๆ/จ่ายอื่นๆ
 * ไม่สร้างรายการจริง และไม่แก้รายการประจำ
 * เก็บค่าที่ลองไว้ใน state.plans (เอกสารเดียว id 'budget') — ซิงก์ผ่าน cloud.js
 *   { id:'budget', overrides:{ [recurringId]: amount }, excluded:[recurringId], extras:[{ id, type, name, amount }] }
 */
window.Budget = (() => {
  const PLAN_ID = 'budget';
  const q = (s) => document.querySelector(s);
  const dialog = q('#budgetDialog');
  const body = q('#budgetBody');
  const n = (v) => {
    const x = parseFloat(v);
    return Number.isFinite(x) ? x : 0;
  };

  function getPlan(create) {
    let p = state.plans.find((x) => x.id === PLAN_ID);
    if (!p && create) {
      p = { id: PLAN_ID, createdAt: Date.now(), overrides: {}, excluded: [], extras: [] };
      state.plans.push(p);
    }
    if (p) {
      p.overrides ||= {};
      p.excluded ||= [];
      p.extras ||= [];
    }
    return p;
  }

  const emptyPlan = { overrides: {}, excluded: [], extras: [] };
  const amountOf = (p, r) => (r.id in p.overrides ? n(p.overrides[r.id]) : r.amount);
  const included = (p, r) => !p.excluded.includes(r.id);

  function compute(p = getPlan(false) || emptyPlan) {
    let income = 0;
    let expense = 0;
    for (const r of state.recurring) {
      if (!included(p, r)) continue;
      if (r.type === 'income') income += amountOf(p, r);
      else expense += amountOf(p, r);
    }
    for (const x of p.extras) {
      if (x.type === 'income') income += n(x.amount);
      else expense += n(x.amount);
    }
    const now = new Date();
    const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const left = income - expense;
    return { income, expense, left, days, perDay: left / days, hasData: state.recurring.length > 0 || p.extras.length > 0 };
  }

  // สรุปสั้นสำหรับการ์ดในหน้ารายรับรายจ่าย
  function summary() {
    const c = compute();
    if (!c.hasData) return 'ลองคำนวณว่าแต่ละเดือนจะเหลือใช้จ่ายกี่บาท';
    return `${c.left < 0 ? 'ติดลบ' : 'เหลือใช้จ่าย'}ประมาณ ${fmt(Math.abs(Math.round(c.left)))}/เดือน`;
  }

  function open() {
    getPlan(true);
    renderForm();
    dialog.showModal();
  }

  const money0 = (v) => fmt(Math.round(v));

  function recRow(p, r) {
    const on = included(p, r);
    const overridden = r.id in p.overrides && n(p.overrides[r.id]) !== r.amount;
    return `
      <div class="bp-row ${on ? '' : 'off'}">
        <label class="bp-check" aria-label="นับรายการนี้">
          <input type="checkbox" data-bp-toggle="${r.id}" ${on ? 'checked' : ''} />
          <span>${ico('check')}</span>
        </label>
        <div class="bp-name">
          <div>${esc(r.name)}</div>
          <small>${overridden ? `จริง ${fmt(r.amount)}` : 'รายการประจำ'}</small>
        </div>
        <input class="bp-amt ${overridden ? 'changed' : ''}" type="number" inputmode="decimal" min="0" step="any"
          data-bp-override="${r.id}" value="${esc(amountOf(p, r))}" ${on ? '' : 'disabled'} />
      </div>`;
  }

  function extraRow(x, i) {
    return `
      <div class="bp-row extra">
        <span class="bp-dot ${x.type}">${ico(x.type === 'income' ? 'arrow-down-left' : 'arrow-up-right')}</span>
        <input class="bp-name-input" data-bp-extra="${i}" data-k="name" value="${esc(x.name)}" placeholder="${x.type === 'income' ? 'รับอื่นๆ' : 'จ่ายอื่นๆ'}" maxlength="40" />
        <input class="bp-amt" type="number" inputmode="decimal" min="0" step="any" data-bp-extra="${i}" data-k="amount" value="${esc(x.amount)}" placeholder="0" />
        <button type="button" class="row-del" data-bp-del="${i}" aria-label="ลบ">${ico('x')}</button>
      </div>`;
  }

  function section(p, type) {
    const recs = state.recurring.filter((r) => r.type === type).sort((a, b) => a.day - b.day);
    const extras = p.extras.map((x, i) => [x, i]).filter(([x]) => x.type === type);
    const label = type === 'income' ? 'รายรับ' : 'รายจ่าย';
    return `
      <div class="sub-head"><span>${label}</span><small id="bpSum-${type}"></small></div>
      <div class="card bp-list">
        ${recs.map((r) => recRow(p, r)).join('')}
        ${extras.map(([x, i]) => extraRow(x, i)).join('')}
        ${!recs.length && !extras.length ? `<div class="muted small pad">ยังไม่มี${label}</div>` : ''}
      </div>
      <button type="button" class="link-btn" data-bp-add="${type}">${ico('plus')} เพิ่ม${type === 'income' ? 'รับ' : 'จ่าย'}อื่นๆ</button>`;
  }

  function renderForm() {
    const p = getPlan(true);
    body.innerHTML = `
      <h2>${ico('calculator')} วางแผนรายเดือน</h2>
      <p class="muted small">ลองตัวเลขคร่าวๆ — ไม่บันทึกเป็นรายการจริง และไม่แก้รายการประจำ</p>
      ${section(p, 'income')}
      ${section(p, 'expense')}
      <div id="bpResult" class="plan-result"></div>
      <div class="actions">
        <button type="button" class="btn ghost danger" id="bpReset">รีเซ็ต</button>
        <span class="spacer"></span>
        <button type="button" class="btn primary" data-close>เสร็จ</button>
      </div>`;
    updateResult();
  }

  function updateResult() {
    const c = compute(getPlan(true));
    q('#bpSum-income').textContent = fmt(Math.round(c.income));
    q('#bpSum-expense').textContent = fmt(Math.round(c.expense));
    q('#bpResult').innerHTML = `
      <div class="res-label">${c.left < 0 ? 'ติดลบต่อเดือน' : 'เหลือไว้ใช้จ่ายต่อเดือน'}</div>
      <div class="res-big ${c.left < 0 ? 'neg' : ''}">${c.left < 0 ? '−' : ''}${money0(Math.abs(c.left))}</div>
      ${c.left > 0 ? `<div class="res-sub">เฉลี่ยใช้ได้วันละ ${money0(c.perDay)} (${c.days} วัน)</div>` : ''}
      <div class="res-mini">
        <span>รับ <b>${money0(c.income)}</b></span>
        <span>จ่าย <b>${money0(c.expense)}</b></span>
      </div>`;
  }

  body.addEventListener('input', (ev) => {
    const el = ev.target;
    const p = getPlan(true);
    if (el.dataset.bpOverride) {
      const r = state.recurring.find((x) => x.id === el.dataset.bpOverride);
      const v = el.value === '' ? 0 : n(el.value);
      if (r && v === r.amount) delete p.overrides[r.id];
      else p.overrides[el.dataset.bpOverride] = v;
      const changed = r && el.dataset.bpOverride in p.overrides;
      el.classList.toggle('changed', !!changed);
      const small = el.closest('.bp-row').querySelector('.bp-name small');
      if (small && r) small.textContent = changed ? `จริง ${fmt(r.amount)}` : 'รายการประจำ';
    } else if (el.dataset.bpExtra !== undefined) {
      const x = p.extras[+el.dataset.bpExtra];
      x[el.dataset.k] = el.dataset.k === 'amount' ? (el.value === '' ? '' : n(el.value)) : el.value;
    } else return;
    save();
    updateResult();
  });

  body.addEventListener('change', (ev) => {
    const id = ev.target.dataset?.bpToggle;
    if (!id) return;
    const p = getPlan(true);
    p.excluded = ev.target.checked ? p.excluded.filter((x) => x !== id) : [...p.excluded, id];
    save();
    renderForm();
  });

  body.addEventListener('click', (ev) => {
    const p = getPlan(true);
    const add = ev.target.closest('[data-bp-add]');
    if (add) {
      p.extras.push({ id: uid(), type: add.dataset.bpAdd, name: '', amount: '' });
      save();
      renderForm();
      const inputs = body.querySelectorAll(`[data-bp-extra="${p.extras.length - 1}"][data-k="name"]`);
      inputs[0]?.focus();
      return;
    }
    const del = ev.target.closest('[data-bp-del]');
    if (del) {
      p.extras.splice(+del.dataset.bpDel, 1);
      save();
      renderForm();
      return;
    }
    if (ev.target.closest('#bpReset')) {
      if (!confirm('รีเซ็ต? ยอดที่ลองแก้, รายการที่ติ๊กออก และรับ/จ่ายอื่นๆ จะถูกล้าง')) return;
      Object.assign(p, { overrides: {}, excluded: [], extras: [] });
      save();
      renderForm();
    }
  });

  dialog.addEventListener('close', () => render({ keepScroll: true }));

  return { open, summary, compute };
})();
