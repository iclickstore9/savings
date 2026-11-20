'use strict';
/* ================= คาดการณ์ / คำนวณแผนออม =================
 * โหลดก่อน app.js — ใช้ตัวแปรจาก app.js ตอนถูกเรียกใช้งานเท่านั้น
 * สมมติฐาน: เดือนที่ 1 = เดือนถัดไป, ดอกเบี้ยคิดทบต้นรายเดือนก่อนฝาก
 */

const MONTHS_TH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const MAX_MONTHS = 1200; // 100 ปี

const defaultPlan = () => ({
  mode: 'time',
  steps: [{ amount: '', months: '' }],
  extras: [],
  rate: '',
  years: '',
  months: '',
  target: '',
});

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

// ป้ายเดือนจากวันนี้ + offset เดือน เช่น "ธ.ค. 2569"
function monthLabel(offset) {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  return `${MONTHS_TH[d.getMonth()]} ${d.getFullYear() + 543}`;
}

function durationText(m) {
  if (m <= 0) return 'ตอนนี้';
  const y = Math.floor(m / 12);
  const mm = m % 12;
  return [y ? `${y} ปี` : '', mm ? `${mm} เดือน` : ''].filter(Boolean).join(' ');
}

const activeSteps = (plan) => plan.steps.filter((s) => num(s.amount) > 0 || num(s.months) > 0);

// ความยาวแผน (เดือน) — Infinity ถ้ามีขั้นที่ไม่ระบุจำนวนเดือน
function planLength(steps) {
  let total = 0;
  for (const s of steps) {
    if (!(num(s.months) > 0)) return Infinity;
    total += num(s.months);
  }
  return total;
}

function depositAt(steps, i) {
  let acc = 0;
  for (const s of steps) {
    const m = num(s.months);
    if (!(m > 0)) return num(s.amount);
    if (i <= acc + m) return num(s.amount);
    acc += m;
  }
  return 0;
}

/**
 * จำลองยอดเงินรายเดือน
 * @returns {{ timeline: number[], reach: number|null, deposited: number }}
 *   timeline[i] = ยอดสิ้นเดือนที่ i (timeline[0] = ยอดปัจจุบัน)
 */
function simulate({ start, target, horizon, deposit, extras, rate, stopAtTarget }) {
  const r = rate / 100 / 12;
  const startMonth = new Date().getMonth(); // 0-11
  let bal = start;
  let deposited = 0;
  let reach = target && start >= target ? 0 : null;
  const timeline = [bal];
  for (let i = 1; i <= horizon; i++) {
    bal *= 1 + r;
    let add = deposit(i);
    const cal = (startMonth + i) % 12 + 1; // 1-12
    for (const e of extras) if (num(e.month) === cal) add += num(e.amount);
    bal += add;
    deposited += add;
    timeline.push(bal);
    if (target && reach === null && bal >= target - 0.005) {
      reach = i;
      if (stopAtTarget) break;
    }
  }
  return { timeline, reach, deposited };
}

function planTarget(g, plan) {
  return num(plan.target) > 0 ? num(plan.target) : num(g.target) > 0 ? num(g.target) : 0;
}

/** คำนวณผลลัพธ์ของแผน (ใช้ทั้งในหน้าคาดการณ์และสรุปในหน้าเป้าหมาย) */
function computePlan(g, plan) {
  const start = balanceOf(g.id);
  const target = planTarget(g, plan);
  const extras = plan.extras.filter((e) => num(e.amount) > 0);
  const rate = num(plan.rate);

  if (plan.mode === 'need') {
    const n = Math.round(num(plan.years) * 12 + num(plan.months));
    if (!target) return { kind: 'need-no-target' };
    if (!(n > 0)) return { kind: 'empty' };
    // ยอดเงินเป็นเส้นตรงตามยอดฝากรายเดือน x → B(x) = B0 + x * B1
    const base = simulate({ start, target: 0, horizon: n, deposit: () => 0, extras, rate });
    const unit = simulate({ start: 0, target: 0, horizon: n, deposit: () => 1, extras: [], rate });
    const b0 = base.timeline[n];
    const b1 = unit.timeline[n];
    const monthly = Math.max(0, (target - b0) / b1);
    return { kind: 'need', n, monthly, target, start, b0 };
  }

  const steps = activeSteps(plan);
  const len = planLength(steps);
  const hasInput = steps.some((s) => num(s.amount) > 0) || extras.length > 0 || rate > 0;
  if (!hasInput) return { kind: 'empty' };

  const finite = Number.isFinite(len);
  const horizon = finite ? Math.min(len, MAX_MONTHS) : target ? MAX_MONTHS : 120;
  const sim = simulate({
    start, target, horizon, extras, rate,
    deposit: (i) => depositAt(steps, i),
    stopAtTarget: !finite,
  });
  return { kind: 'time', ...sim, start, target, finite, len, horizon };
}

/** ข้อความสรุปสั้น ๆ สำหรับหน้าเป้าหมาย */
function planSummary(g) {
  if (!g.plan) return '';
  const res = computePlan(g, g.plan);
  if (res.kind === 'need') {
    return res.monthly > 0
      ? `ต้องฝากเดือนละ ${fmt(Math.ceil(res.monthly))} เพื่อถึงเป้าใน ${durationText(res.n)}`
      : `ไม่ต้องฝากเพิ่มก็ถึงเป้าใน ${durationText(res.n)}`;
  }
  if (res.kind === 'time') {
    if (res.target && res.reach !== null)
      return res.reach === 0 ? 'ถึงเป้าแล้ว 🎉' : `ถึงเป้าในอีก ${durationText(res.reach)} (${monthLabel(res.reach)})`;
    if (res.target && res.finite)
      return `จบแผนมี ${fmt(res.timeline.at(-1))} ยังขาด ${fmt(res.target - res.timeline.at(-1))}`;
    if (res.target) return 'ตามแผนนี้ยังไม่ถึงเป้าภายใน 100 ปี';
    return `อีก ${durationText(res.timeline.length - 1)} จะมี ${fmt(res.timeline.at(-1))}`;
  }
  return '';
}

/* ---------------- หน้าจอคาดการณ์ ---------------- */
const planDialog = document.getElementById('planDialog');
const planBody = document.getElementById('planBody');
let planGoalId = null;

const planOf = () => goalById(planGoalId).plan;

function openPlan(goalId) {
  planGoalId = goalId;
  const g = goalById(goalId);
  if (!g.plan) g.plan = defaultPlan();
  renderPlanForm();
  planDialog.showModal();
}

const numInput = (path, value, placeholder, cls = '') =>
  `<input class="${cls}" type="number" inputmode="decimal" min="0" step="any" data-path="${path}" value="${esc(value)}" placeholder="${esc(placeholder)}" />`;

function renderPlanForm() {
  const g = goalById(planGoalId);
  const p = g.plan;
  const stepsHtml = p.steps
    .map((s, i) => {
      const last = i === p.steps.length - 1;
      return `
      <div class="step-row">
        <span class="step-no">${i + 1}</span>
        <div class="step-fields">
          <label class="inline">เดือนละ ${numInput(`steps.${i}.amount`, s.amount, 'บาท')}</label>
          <label class="inline">นาน ${numInput(`steps.${i}.months`, s.months, last ? 'ตลอด' : 'เดือน', 'short')} เดือน</label>
        </div>
        ${p.steps.length > 1 ? `<button type="button" class="row-del" data-del="steps.${i}" aria-label="ลบ">${ico('x')}</button>` : ''}
      </div>`;
    })
    .join('');

  const monthOpts = (sel) =>
    MONTHS_TH.map((m, i) => `<option value="${i + 1}" ${num(sel) === i + 1 ? 'selected' : ''}>${m}</option>`).join('');
  const extrasHtml = p.extras
    .map(
      (e, i) => `
      <div class="step-row">
        <div class="step-fields">
          <label class="inline">${numInput(`extras.${i}.amount`, e.amount, 'บาท')}</label>
          <label class="inline">ทุกเดือน <select data-path="extras.${i}.month">${monthOpts(e.month)}</select></label>
        </div>
        <button type="button" class="row-del" data-del="extras.${i}" aria-label="ลบ">${ico('x')}</button>
      </div>`
    )
    .join('');

  planBody.innerHTML = `
    <h2>${ico('calculator')} คาดการณ์ · ${esc(g.name)}</h2>

    <div class="segmented">
      <label><input type="radio" name="planMode" value="time" ${p.mode === 'time' ? 'checked' : ''} /><span>ฝากเท่านี้ ถึงเมื่อไร</span></label>
      <label><input type="radio" name="planMode" value="need" ${p.mode === 'need' ? 'checked' : ''} /><span>ต้องฝากเดือนละเท่าไร</span></label>
    </div>

    <div class="two-col">
      <label>ยอดปัจจุบัน<div class="readonly">${fmt(balanceOf(g.id))}</div></label>
      <label>เป้าหมาย (บาท)${numInput('target', p.target, g.target ? money.format(g.target) : 'ไม่มีเป้า')}</label>
    </div>

    ${p.mode === 'time' ? `
    <div class="sub-head"><span>ฝากรายเดือน</span><small>ทำเป็นขั้นบันไดได้</small></div>
    <div class="rows">${stepsHtml}</div>
    <button type="button" class="link-btn" data-add="steps">${ico('plus')} เพิ่มขั้น</button>
    ` : `
    <div class="sub-head"><span>อยากถึงเป้าภายใน</span></div>
    <div class="two-col">
      <label class="inline">${numInput('years', p.years, '0')} ปี</label>
      <label class="inline">${numInput('months', p.months, '0')} เดือน</label>
    </div>
    `}

    <div class="sub-head"><span>เงินก้อนรายปี</span><small>เช่น โบนัส, เงินปันผล</small></div>
    <div class="rows">${extrasHtml || '<div class="muted small">ยังไม่มี</div>'}</div>
    <button type="button" class="link-btn" data-add="extras">${ico('plus')} เพิ่มเงินก้อน</button>

    <label>ดอกเบี้ย / ผลตอบแทน (% ต่อปี) <small>ไม่ใส่ก็ได้</small>
      ${numInput('rate', p.rate, '0')}
    </label>

    <div id="planResult" class="plan-result"></div>
    <p class="muted small center">เริ่มนับจาก ${monthLabel(1)} · ค่าที่กรอกบันทึกไว้อัตโนมัติ</p>

    <div class="actions">
      <button type="button" class="btn ghost danger" id="planReset">ล้างค่า</button>
      <span class="spacer"></span>
      <button type="button" class="btn primary" data-close>เสร็จ</button>
    </div>
  `;
  updatePlanResult();
}

function updatePlanResult() {
  const g = goalById(planGoalId);
  const res = computePlan(g, g.plan);
  const box = document.getElementById('planResult');
  box.innerHTML = renderResult(res);
}

function yearTable(timeline, endMonth) {
  const rows = [];
  for (let m = 12; m < endMonth && rows.length < 40; m += 12) rows.push(m);
  if (endMonth > 0) rows.push(endMonth);
  return `
    <table class="year-table">
      <thead><tr><th>เมื่อ</th><th>ยอดสะสม</th></tr></thead>
      <tbody>${rows
        .map((m) => `<tr><td>${durationText(m)}<small>${monthLabel(m)}</small></td><td>${fmt(Math.round(timeline[m]))}</td></tr>`)
        .join('')}</tbody>
    </table>`;
}

function renderResult(res) {
  switch (res.kind) {
    case 'empty':
      return `<div class="muted center">กรอกยอดฝากเพื่อดูผลคาดการณ์</div>`;
    case 'need-no-target':
      return `<div class="muted center">ใส่ยอดเป้าหมายก่อน</div>`;
    case 'need': {
      if (res.monthly <= 0)
        return `<div class="res-big">ไม่ต้องฝากเพิ่ม 🎉</div>
          <div class="res-sub">ภายใน ${durationText(res.n)} จะมี ${fmt(Math.round(res.b0))} ถึงเป้าแล้ว</div>`;
      const rounded = Math.ceil(res.monthly / 100) * 100;
      return `
        <div class="res-label">ต้องฝากเดือนละ</div>
        <div class="res-big">${fmt(Math.ceil(res.monthly))}</div>
        <div class="res-sub">นาน ${durationText(res.n)} ถึงเป้า ${fmt(res.target)} ประมาณ ${monthLabel(res.n)}</div>
        <button type="button" class="btn block-center" data-use="${rounded}">${ico('trending-up')} ใช้ ${fmt(rounded)}/เดือน ไปคำนวณต่อ</button>`;
    }
    case 'time': {
      const { timeline, reach, target, finite } = res;
      const end = timeline.length - 1;
      const last = timeline[end];
      let head;
      if (target && reach === 0) {
        head = `<div class="res-big">ถึงเป้าแล้ว 🎉</div>`;
      } else if (target && reach !== null) {
        head = `
          <div class="res-label">ถึงเป้า ${fmt(target)} ในอีก</div>
          <div class="res-big">${durationText(reach)}</div>
          <div class="res-sub">ประมาณ ${monthLabel(reach)} · ณ ตอนนั้นมี ${fmt(Math.round(timeline[reach]))}</div>`;
      } else if (target && finite) {
        head = `
          <div class="res-label">จบแผน ${durationText(end)} (${monthLabel(end)}) จะมี</div>
          <div class="res-big">${fmt(Math.round(last))}</div>
          <div class="res-sub warn">ยังขาดอีก ${fmt(Math.round(target - last))} ลองเพิ่มขั้นหรือยอดฝาก</div>`;
      } else if (target) {
        head = `<div class="res-big small">ยังไม่ถึงเป้าภายใน 100 ปี</div>
          <div class="res-sub warn">ลองเพิ่มยอดฝากต่อเดือน</div>`;
      } else {
        head = `
          <div class="res-label">อีก ${durationText(end)} (${monthLabel(end)}) จะมี</div>
          <div class="res-big">${fmt(Math.round(last))}</div>`;
      }
      const tableEnd = reach !== null && reach > 0 ? reach : end;
      const added = sumDeposits(tableEnd);
      const interest = timeline[tableEnd] - res.start - added;
      return `
        ${head}
        ${tableEnd > 0 ? `
        <div class="res-mini">
          <span>ฝากเพิ่มรวม <b>${fmt(Math.round(added))}</b></span>
          ${num(planOf().rate) > 0 ? `<span>ดอกเบี้ย <b>${fmt(Math.round(interest))}</b></span>` : ''}
        </div>
        ${yearTable(timeline, tableEnd)}` : ''}`;
    }
  }
  return '';
}

// ยอดฝากสะสมถึงเดือน m (ไม่รวมดอกเบี้ย)
function sumDeposits(m) {
  const g = goalById(planGoalId);
  const p = g.plan;
  const steps = activeSteps(p);
  const extras = p.extras.filter((e) => num(e.amount) > 0);
  const startMonth = new Date().getMonth();
  let total = 0;
  for (let i = 1; i <= m; i++) {
    total += depositAt(steps, i);
    const cal = (startMonth + i) % 12 + 1;
    for (const e of extras) if (num(e.month) === cal) total += num(e.amount);
  }
  return total;
}

function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  while (keys.length > 1) o = o[keys.shift()];
  o[keys[0]] = value;
}

planBody.addEventListener('input', (ev) => {
  const el = ev.target;
  if (el.name === 'planMode') {
    planOf().mode = el.value;
    save();
    renderPlanForm();
    return;
  }
  if (!el.dataset.path) return;
  setPath(planOf(), el.dataset.path, el.value);
  save();
  updatePlanResult();
});

planBody.addEventListener('click', (ev) => {
  const p = planOf();
  const add = ev.target.closest('[data-add]');
  if (add) {
    if (add.dataset.add === 'steps') {
      const lastStep = p.steps.at(-1);
      // ขั้นก่อนหน้าต้องมีจำนวนเดือน ไม่งั้นขั้นใหม่จะไม่มีผล
      if (lastStep && !(num(lastStep.months) > 0)) lastStep.months = 6;
      p.steps.push({ amount: '', months: '' });
    } else {
      p.extras.push({ amount: '', month: 12 });
    }
    save();
    renderPlanForm();
    const inputs = planBody.querySelectorAll(`[data-path^="${add.dataset.add}.${p[add.dataset.add].length - 1}.amount"]`);
    inputs[0]?.focus();
    return;
  }
  const del = ev.target.closest('[data-del]');
  if (del) {
    const [key, idx] = del.dataset.del.split('.');
    p[key].splice(+idx, 1);
    save();
    renderPlanForm();
    return;
  }
  const use = ev.target.closest('[data-use]');
  if (use) {
    p.mode = 'time';
    p.steps = [{ amount: use.dataset.use, months: '' }];
    save();
    renderPlanForm();
    return;
  }
  if (ev.target.closest('#planReset')) {
    if (!confirm('ล้างค่าคาดการณ์ทั้งหมดของเป้านี้?')) return;
    goalById(planGoalId).plan = defaultPlan();
    save();
    renderPlanForm();
  }
});

planDialog.addEventListener('close', () => render());
