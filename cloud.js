/* ================= ซิงก์ข้อมูลกับ Firebase =================
 * - ล็อกอิน Google → เก็บข้อมูลที่ users/{uid}/goals/{id} และ users/{uid}/entries/{id}
 * - บันทึกในเครื่องทันที แล้วส่งขึ้น Firestore (ออฟไลน์ได้ — Firestore เก็บคิวไว้ให้)
 * - ฟังการเปลี่ยนแปลงแบบ real-time จากเครื่องอื่น
 * - ล็อกอินครั้งแรกในเครื่องนี้: รวมข้อมูลในเครื่องกับบนคลาวด์ (ไม่มีอะไรหาย)
 */
import { firebaseConfig } from './firebase-config.js';

const SDK = 'https://www.gstatic.com/firebasejs/13.4.0/';
const SYNC_KEY = 'kapook-om-sync'; // จำว่าเครื่องนี้ผูกกับบัญชีไหนแล้ว
const NAMES = ['goals', 'entries', 'txns', 'categories', 'recurring']; // ต้องตรงกับ COLLECTIONS ใน app.js

const bridge = window.appBridge;
const $ = (s) => document.querySelector(s);
const el = {
  section: $('#syncSection'),
  status: $('#syncStatus'),
  info: $('#syncInfo'),
  login: $('#loginBtn'),
  logout: $('#logoutBtn'),
  localNote: $('#localNote'),
  badge: $('#syncBadge'),
};

// ---------- สถานะบนหน้าจอ ----------
const STATUS = {
  off: { text: '', icon: null },
  signedOut: { text: 'ยังไม่ได้เชื่อม', icon: null },
  connecting: { text: 'กำลังเชื่อม…', icon: 'refresh-cw', spin: true },
  syncing: { text: 'กำลังซิงก์…', icon: 'refresh-cw', spin: true },
  synced: { text: 'ซิงก์แล้ว', icon: 'cloud-check', ok: true },
  offline: { text: 'ออฟไลน์ — จะซิงก์เมื่อมีเน็ต', icon: 'cloud-off', warn: true },
  error: { text: 'ซิงก์ไม่สำเร็จ', icon: 'cloud-off', warn: true },
};
function setStatus(key, detail = '') {
  const s = STATUS[key];
  el.status.textContent = s.text;
  el.status.className = 'sync-status' + (s.ok ? ' ok' : '') + (s.warn ? ' warn' : '');
  if (detail) el.info.textContent = detail;
  el.badge.hidden = !s.icon;
  if (s.icon) {
    el.badge.innerHTML = bridge.ico(s.icon, s.spin ? 'spin' : '');
    el.badge.className = 'icon-btn sync-badge' + (s.warn ? ' warn' : '') + (s.ok ? ' ok' : '');
    el.badge.setAttribute('aria-label', s.text);
  }
}

// ---------- ตัวช่วยข้อมูล ----------
const keyOf = (item) => JSON.stringify({ ...item, updatedAt: undefined });
const clean = (item) => JSON.parse(JSON.stringify(item)); // Firestore ไม่รับ undefined
const byCreated = (a, b) => (a.createdAt || 0) - (b.createdAt || 0);

async function main() {
  if (!firebaseConfig || !firebaseConfig.apiKey) return setStatus('off'); // ยังไม่ตั้งค่า → ใช้แบบในเครื่อง
  el.section.hidden = false;
  setStatus('connecting', '');

  let A, F, app;
  try {
    const [appMod, authMod, fsMod] = await Promise.all([
      import(SDK + 'firebase-app.js'),
      import(SDK + 'firebase-auth.js'),
      import(SDK + 'firebase-firestore.js'),
    ]);
    A = authMod;
    F = fsMod;
    app = appMod.initializeApp(firebaseConfig);
  } catch (e) {
    console.warn('โหลด Firebase ไม่ได้', e);
    setStatus('offline', 'ยังโหลดระบบซิงก์ไม่ได้ (ไม่มีเน็ต?) ข้อมูลยังบันทึกในเครื่องตามปกติ');
    window.addEventListener('online', () => location.reload(), { once: true });
    return;
  }

  const auth = A.getAuth(app);
  const db = F.initializeFirestore(app, {
    localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }),
  });

  let user = null;
  let ready = false; // ซิงก์พร้อม (รวมข้อมูลครั้งแรกเสร็จแล้ว)
  let unsubs = [];
  const synced = Object.fromEntries(NAMES.map((n) => [n, new Map()])); // id → key ของข้อมูลที่ตรงกับคลาวด์
  const meta = Object.fromEntries(NAMES.map((n) => [n, null]));

  const col = (name) => F.collection(db, 'users', user.uid, name);
  const ref = (name, id) => F.doc(db, 'users', user.uid, name, id);

  async function commitOps(ops) {
    // writeBatch รับได้ไม่เกิน 500 รายการต่อครั้ง
    for (let i = 0; i < ops.length; i += 450) {
      const batch = F.writeBatch(db);
      for (const op of ops.slice(i, i + 450)) {
        if (op.del) batch.delete(op.ref);
        else batch.set(op.ref, op.data);
      }
      await batch.commit();
    }
  }

  // ส่งการเปลี่ยนแปลงในเครื่องขึ้นคลาวด์ (เรียกจาก save() ทุกครั้ง)
  function push() {
    if (!ready || !user) return;
    const s = bridge.getState();
    const ops = [];
    for (const name of NAMES) {
      const ids = new Set();
      for (const item of s[name] || []) {
        ids.add(item.id);
        const k = keyOf(item);
        if (synced[name].get(item.id) !== k) {
          item.updatedAt = Date.now();
          synced[name].set(item.id, k);
          ops.push({ ref: ref(name, item.id), data: clean(item) });
        }
      }
      for (const id of [...synced[name].keys()]) {
        if (!ids.has(id)) {
          synced[name].delete(id);
          ops.push({ ref: ref(name, id), del: true });
        }
      }
    }
    if (!ops.length) return;
    bridge.persist(); // บันทึก updatedAt ลงเครื่องด้วย
    setStatus(navigator.onLine ? 'syncing' : 'offline');
    // ไม่ต้องรอ — Firestore อัปเดตแคชในเครื่องทันทีและส่งขึ้นเมื่อมีเน็ต
    commitOps(ops).catch((e) => {
      console.error(e);
      setStatus('error', 'ซิงก์ไม่สำเร็จ: ' + (e.code || e.message));
    });
  }
  window.cloudSync = { push };

  // ล็อกอินครั้งแรกในเครื่องนี้ → รวมข้อมูลในเครื่อง + คลาวด์ (เลือกตัวที่แก้ล่าสุดถ้า id ซ้ำ)
  async function firstMerge() {
    const rec = JSON.parse(localStorage.getItem(SYNC_KEY) || 'null');
    if (rec && rec.uid === user.uid) return;
    const snaps = await Promise.all(NAMES.map((n) => F.getDocsFromServer(col(n))));
    const s = bridge.getState();
    const ops = [];
    const merged = {};
    let uploaded = 0;
    NAMES.forEach((name, i) => {
      const cloud = new Map(snaps[i].docs.map((d) => [d.id, d.data()]));
      for (const item of s[name] || []) {
        const c = cloud.get(item.id);
        if (!c || (item.updatedAt || 0) > (c.updatedAt || 0)) {
          const data = clean({ ...item, updatedAt: item.updatedAt || Date.now() });
          cloud.set(item.id, data);
          ops.push({ ref: ref(name, item.id), data });
          uploaded++;
        }
      }
      merged[name] = [...cloud.values()].sort(byCreated);
    });
    await commitOps(ops);
    bridge.setData(merged);
    localStorage.setItem(SYNC_KEY, JSON.stringify({ uid: user.uid, at: Date.now() }));
    if (uploaded) bridge.toast(`อัปโหลดข้อมูลในเครื่อง ${uploaded} รายการแล้ว`);
  }

  function updateSyncStatus() {
    const all = NAMES.map((n) => meta[n]);
    if (all.some((m) => !m)) return;
    const pending = all.some((m) => m.hasPendingWrites);
    const cached = all.some((m) => m.fromCache);
    if (pending) setStatus(navigator.onLine ? 'syncing' : 'offline');
    else if (cached && !navigator.onLine) setStatus('offline');
    else setStatus('synced');
  }

  function subscribe() {
    unsubs = NAMES.map((name) =>
      F.onSnapshot(
        col(name),
        { includeMetadataChanges: true },
        (snap) => {
          meta[name] = snap.metadata;
          const list = snap.docs.map((d) => d.data()).sort(byCreated);
          synced[name] = new Map(list.map((x) => [x.id, keyOf(x)]));
          bridge.setData({ [name]: list });
          updateSyncStatus();
        },
        (e) => {
          console.error(e);
          setStatus('error', 'อ่านข้อมูลจากคลาวด์ไม่ได้: ' + (e.code || e.message));
        }
      )
    );
  }

  function stop() {
    unsubs.forEach((u) => u());
    unsubs = [];
    ready = false;
    for (const n of NAMES) {
      meta[n] = null;
      synced[n].clear();
    }
  }

  async function start() {
    setStatus('connecting');
    try {
      await firstMerge();
    } catch (e) {
      console.error(e);
      if (!navigator.onLine || e.code === 'unavailable') {
        setStatus('offline', 'เชื่อมครั้งแรกต้องมีเน็ต จะลองใหม่เมื่อออนไลน์');
        window.addEventListener('online', () => user && start(), { once: true });
      } else {
        setStatus('error', 'เชื่อมไม่สำเร็จ: ' + (e.code || e.message));
      }
      return;
    }
    subscribe();
    ready = true;
    push(); // เผื่อมีการแก้ไขระหว่างกำลังเชื่อม
  }

  A.onAuthStateChanged(auth, (u) => {
    stop();
    user = u;
    el.login.hidden = !!u;
    el.logout.hidden = !u;
    el.localNote.hidden = !!u;
    if (u) {
      el.info.textContent = `บัญชี: ${u.email || u.displayName || ''}`;
      start();
    } else {
      el.info.textContent = 'เข้าสู่ระบบเพื่อซิงก์ข้อมูลระหว่างมือถือ/คอม และสำรองบนคลาวด์';
      setStatus('signedOut');
      el.badge.hidden = true;
    }
  });

  // ล็อกอิน: ใช้ popup ก่อน ถ้าเปิดไม่ได้ค่อยใช้ redirect
  A.getRedirectResult(auth).catch((e) => setStatus('error', 'ล็อกอินไม่สำเร็จ: ' + (e.code || e.message)));
  el.login.addEventListener('click', async () => {
    const provider = new A.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      await A.signInWithPopup(auth, provider);
    } catch (e) {
      if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/cancelled-popup-request'].includes(e.code)) {
        await A.signInWithRedirect(auth, provider);
      } else if (e.code !== 'auth/popup-closed-by-user') {
        setStatus('error', 'ล็อกอินไม่สำเร็จ: ' + (e.code || e.message));
      }
    }
  });

  el.logout.addEventListener('click', async () => {
    if (!confirm('ออกจากระบบ? ข้อมูลยังอยู่ในเครื่องนี้และบนคลาวด์ แต่จะไม่ซิงก์จนกว่าจะเข้าสู่ระบบใหม่')) return;
    localStorage.removeItem(SYNC_KEY);
    await A.signOut(auth);
    bridge.toast('ออกจากระบบแล้ว');
  });

  window.addEventListener('online', updateSyncStatus);
  window.addEventListener('offline', updateSyncStatus);
}

main();
