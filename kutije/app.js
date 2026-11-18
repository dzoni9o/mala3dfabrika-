import { BED, PRESETS, akcija, normalize, pocetnoStanje, delovi, findBox, reseed, minW, minDb, presetOf } from './layout.js';
import { stlBytes } from './geom.js';
import { threeMF, slozi } from './threemf.js';

const $ = (id) => document.getElementById(id);
const KEY = 'mala3d-kutije-v1';
const fmt = (x) => (Math.round(x * 10) / 10).toString().replace('.', ',');
const num = (v) => { const x = parseFloat(String(v).replace(',', '.')); return Number.isFinite(x) ? x : null; };

// ------------------------------------------------------------------ stanje
let S = null, RES = null, sel = null;
function valid(s) {
  return s && s.v === 1 && Array.isArray(s.rows) && s.rows.length && s.rows.every((r) => Array.isArray(r.boxes) && r.boxes.length && r.id && r.boxes.every((b) => b.id))
    && [s.W, s.D, s.H, s.gap].every(Number.isFinite) && s.print;
}
try { const j = JSON.parse(localStorage.getItem(KEY) || 'null'); if (valid(j)) { S = j; reseed(S); } } catch (e) { /* radi i bez memorije */ }
if (!S) S = pocetnoStanje();
RES = normalize(S);
sel = S.rows[0].boxes[0].id;
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

function go(a, opts = {}) {
  RES = akcija(S, a);
  if (!findBox(S, sel).box) sel = S.rows[0].boxes[0].id;
  save();
  renderAll(opts.keepEditor);
  schedule();
}

// ------------------------------------------------------------------ prostor i štampa
const SPACE = [['W', 'W'], ['D', 'D'], ['H', 'H'], ['gap', 'gap']];
for (const [id, k] of SPACE) {
  $(id).addEventListener('input', (e) => { const v = num(e.target.value); if (v != null && v > 0) go({ act: 'setSpace', k, v }, { keepEditor: true }); });
}
for (const k of ['zid', 'dno', 'pregrada', 'poklopac', 'usna', 'tol']) {
  $('p-' + k).addEventListener('input', (e) => { const v = num(e.target.value); if (v != null && v > 0) go({ act: 'print', k, v }, { keepEditor: true }); });
}
document.querySelectorAll('#preset button').forEach((b) => b.addEventListener('click', () => go({ act: 'preset', v: b.dataset.v })));
$('grid').addEventListener('click', () => go({ act: 'grid', cols: num($('g-c').value) || 1, rows: num($('g-r').value) || 1 }));
$('add-row').addEventListener('click', () => go({ act: 'addRow' }));
$('add-box').addEventListener('click', () => { const f = findBox(S, sel); go({ act: 'addBox', rowId: (f.row || S.rows[S.rows.length - 1]).id }); const r = (f.row || S.rows[S.rows.length - 1]); sel = r.boxes[r.boxes.length - 1].id; renderAll(); });
$('reset').addEventListener('click', () => { if (!confirm('Vratiti početno stanje? Raspored i podešavanja se brišu.')) return; S = pocetnoStanje(); RES = normalize(S); sel = S.rows[0].boxes[0].id; save(); renderAll(); schedule(); });

function setIfIdle(id, v) { const el = $(id); if (document.activeElement !== el) el.value = v; }
function syncSpace() {
  setIfIdle('W', S.W); setIfIdle('D', S.D); setIfIdle('H', S.H); setIfIdle('gap', S.gap);
  const P = S.print;
  for (const k of ['zid', 'dno', 'pregrada', 'poklopac', 'usna', 'tol']) setIfIdle('p-' + k, P[k]);
  const p = presetOf(S);
  document.querySelectorAll('#preset button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === p)));
  $('preset-hint').textContent = p === 'lagana' ? 'Zid 0,8 mm (2 obima), dno 0,8 mm. Najmanje materijala i vremena, ali kutijice su meke.'
    : p === 'jaka' ? 'Zid 1,6 mm, dno 1,2 mm. Čvrste kutijice za alat i sitne delove.' : 'Prilagođene mere.';
}

// ------------------------------------------------------------------ lista kutijica i editor
function renderList() {
  let h = '';
  S.rows.forEach((row, ri) => {
    h += `<span class="rowtag">Red ${ri + 1}${ri === S.rows.length - 1 ? ' (prednji)' : ''} · ${fmt(RES.rows[ri].d)} mm</span>`;
    row.boxes.forEach((b, bi) => {
      const B = RES.rows[ri].boxes[bi];
      h += `<button type="button" data-id="${b.id}" aria-pressed="${b.id === sel}" class="${B.problems.includes('err') ? 'bad' : ''}">${B.label} · ${fmt(B.w)}</button>`;
    });
  });
  $('boxlist').innerHTML = h;
}
$('boxlist').addEventListener('click', (e) => { const b = e.target.closest('button[data-id]'); if (b) { sel = b.dataset.id; renderAll(); } });

function field(k, label, unit, extra = '') {
  return `<label class="num"><span>${label}</span><span class="in"><input type="number" data-k="${k}" step="any" inputmode="decimal" ${extra}><span class="u">${unit}</span></span><span data-tag="${k}"></span></label>`;
}
let builtFor = null;
function buildEditor() {
  const f = findBox(S, sel);
  if (!f.box) { $('editor').innerHTML = ''; builtFor = null; return; }
  builtFor = sel;
  $('editor').innerHTML = `<div class="editor">
    <h3 id="ed-title"></h3>
    <div class="row2">${field('w', 'Širina', 'mm')}${field('d', 'Dubina', 'mm')}${field('h', 'Visina', 'mm')}</div>
    <div class="row2">
      <label class="num"><span>Pregrade po širini</span><input type="number" data-k="cx" min="1" max="8" step="1" inputmode="numeric"></label>
      <label class="num"><span>Pregrade po dubini</span><input type="number" data-k="cy" min="1" max="8" step="1" inputmode="numeric"></label>
      ${field('r', 'Ugao (zaobljenje)', 'mm')}
    </div>
    <label class="chk"><input type="checkbox" data-k="lid"> Poklopac (nasadni, sa usnom)</label>
    <div><div class="hint" style="margin-bottom:4px">Ručka</div>
      <div class="seg" id="ed-handle" role="group" aria-label="Ručka">
        <button type="button" data-handle="nema">Bez</button><button type="button" data-handle="rupa">Rupa za prst</button><button type="button" data-handle="rucka">Ručka</button>
      </div>
      <p class="hint" id="ed-handle-hint" style="margin-top:4px"></p>
    </div>
    <div class="row2 c2">${field('zid', 'Debljina zida', 'mm', 'placeholder="opšta"')}<span></span></div>
    <div class="btnrow">
      <button type="button" class="mini" data-do="split">Podeli na 2</button>
      <button type="button" class="mini danger" data-do="remove">Ukloni</button>
    </div>
  </div>`;
  syncEditor();
}
function syncEditor() {
  const f = findBox(S, sel); if (!f.box) return;
  if (builtFor !== sel) { buildEditor(); return; }
  const b = f.box, ri = S.rows.indexOf(f.row), B = RES.rows[ri].boxes[f.bi], R = RES.rows[ri];
  const E = $('editor');
  const q = (k) => E.querySelector(`[data-k="${k}"]`);
  const put = (el, v) => { if (el && document.activeElement !== el) el.value = v; };
  $('ed-title').textContent = `${B.label} · ${fmt(B.ow)} × ${fmt(B.od)} × ${fmt(B.h)} mm`;
  const singleBox = f.row.boxes.length < 2, singleRow = S.rows.length < 2;
  put(q('w'), b.fix && !singleBox ? b.w : B.w); q('w').readOnly = singleBox;
  put(q('d'), f.row.fix && !singleRow ? f.row.d : R.d); q('d').readOnly = singleRow;
  put(q('h'), B.h); put(q('cx'), b.cx); put(q('cy'), b.cy); put(q('r'), b.r); put(q('zid'), b.zid ?? '');
  q('lid').checked = !!b.lid;
  q('w').classList.toggle('bad', b.fix && !singleBox && Math.abs(b.w - B.w) > 0.05);
  q('h').classList.toggle('bad', B.h > S.H + 1e-6);
  E.querySelector('[data-tag="w"]').innerHTML = singleBox ? '<span class="hint">jedina u redu</span>' : (b.fix ? '<button type="button" class="fixed-tag" data-do="unfixW">ručno · vrati na auto</button>' : '<span class="hint">auto</span>');
  E.querySelector('[data-tag="d"]').innerHTML = singleRow ? '<span class="hint">jedini red</span>' : (f.row.fix ? '<button type="button" class="fixed-tag" data-do="unfixD">ručno · vrati na auto</button>' : '<span class="hint">auto</span>');
  E.querySelector('[data-tag="h"]').innerHTML = b.h != null ? '<button type="button" class="fixed-tag" data-do="autoH">ručno · visina prostora</button>' : '<span class="hint">visina prostora</span>';
  E.querySelectorAll('#ed-handle button').forEach((x) => {
    x.setAttribute('aria-pressed', String(x.dataset.handle === b.handle));
    x.disabled = x.dataset.handle === 'rucka' && !R.front;
  });
  $('ed-handle-hint').textContent = b.handle === 'rupa' ? (b.lid ? 'Okrugla rupa Ø14 u prednjem zidu.' : 'Otvoren žleb od ivice prednjeg zida.')
    : b.handle === 'rucka' ? 'Klin 20 × 6 mm na prednjem zidu, izlazi 6 mm napred.' : (R.front ? '' : 'Ručka (izbočena) samo u prednjem redu.');
}
$('editor').addEventListener('input', (e) => {
  const k = e.target.dataset && e.target.dataset.k; if (!k || e.target.type === 'checkbox') return;
  const f = findBox(S, sel); if (!f.box) return;
  let v = num(e.target.value);
  if (k === 'zid') { go({ act: 'set', boxId: sel, k: 'zid', v: v != null && v > 0 ? v : null }, { keepEditor: true }); return; }
  if (v == null || v <= 0) return;
  if (k === 'w') go({ act: 'setW', rowId: f.row.id, boxId: sel, v }, { keepEditor: true });
  else if (k === 'd') go({ act: 'setD', rowId: f.row.id, v }, { keepEditor: true });
  else if (k === 'cx' || k === 'cy') go({ act: 'set', boxId: sel, k, v: Math.max(1, Math.min(8, Math.round(v))) }, { keepEditor: true });
  else go({ act: 'set', boxId: sel, k, v }, { keepEditor: true });
});
$('editor').addEventListener('change', (e) => {
  const k = e.target.dataset && e.target.dataset.k;
  if (k === 'lid') go({ act: 'set', boxId: sel, k: 'lid', v: e.target.checked });
  else if (k) { builtFor = sel; syncEditor(); }
});
$('editor').addEventListener('click', (e) => {
  const hb = e.target.closest('[data-handle]');
  if (hb && !hb.disabled) { go({ act: 'set', boxId: sel, k: 'handle', v: hb.dataset.handle }); return; }
  const d = e.target.closest('[data-do]'); if (!d) return;
  const f = findBox(S, sel); if (!f.box) return;
  const w = d.dataset.do;
  if (w === 'unfixW') go({ act: 'unfixW', rowId: f.row.id, boxId: sel });
  else if (w === 'unfixD') go({ act: 'unfixD', rowId: f.row.id });
  else if (w === 'autoH') go({ act: 'set', boxId: sel, k: 'h', v: null });
  else if (w === 'split') go({ act: 'split', rowId: f.row.id, boxId: sel, n: 2 });
  else if (w === 'remove') {
    const next = f.row.boxes[f.bi + 1] || f.row.boxes[f.bi - 1];
    go({ act: 'removeBox', rowId: f.row.id, boxId: sel });
    if (next && findBox(S, next.id).box) { sel = next.id; renderAll(); }
  }
});

// ------------------------------------------------------------------ 2D plan
function draw2d() {
  const svg = $('v2d');
  const W = S.W, D = S.D, g = S.gap;
  const pad = Math.max(W, D) * 0.09, fs = Math.max(W, D) / 40;
  svg.setAttribute('viewBox', `${-pad} ${-pad} ${W + 2 * pad} ${D + 2 * pad + fs * 1.6}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  let s = `<rect x="0" y="0" width="${W}" height="${D}" fill="none" stroke="var(--mute)" stroke-width="1" stroke-dasharray="4 3" vector-effect="non-scaling-stroke"/>`;
  s += `<text x="${W / 2}" y="${-pad * 0.35}" text-anchor="middle" font-size="${fs}" fill="var(--mute)">${fmt(W)} mm</text>`;
  s += `<text transform="translate(${-pad * 0.35} ${D / 2}) rotate(-90)" text-anchor="middle" font-size="${fs}" fill="var(--mute)">${fmt(D)} mm</text>`;
  s += `<text x="${W / 2}" y="${D + pad * 0.55 + fs}" text-anchor="middle" font-size="${fs * 0.85}" fill="var(--mute)" letter-spacing="2">▼ NAPRED (prednja strana)</text>`;
  RES.rows.forEach((R) => R.boxes.forEach((B) => {
    const b = B.src, x = B.x + g / 2, y = R.ytop + g / 2, w = B.ow, d = B.od;
    const bad = B.problems.includes('err'), warn = B.problems.includes('warn'), on = B.id === sel;
    const stroke = on ? 'var(--accent)' : bad ? 'var(--bad)' : warn ? 'var(--warn)' : 'var(--boxline)';
    s += `<g class="bx" data-id="${B.id}">`;
    s += `<rect x="${x}" y="${y}" width="${Math.max(w, 0.1)}" height="${Math.max(d, 0.1)}" rx="${Math.min(b.r, w / 2, d / 2)}" fill="${bad ? 'rgba(255,106,95,.14)' : 'var(--box)'}" stroke="${stroke}" stroke-width="${on ? 3 : 1.5}" vector-effect="non-scaling-stroke"/>`;
    const t = B.t, iw = w - 2 * t, id = d - 2 * t;
    if (iw > 1 && id > 1) {
      const cw = (iw - (b.cx - 1) * S.print.pregrada) / b.cx, ch = (id - (b.cy - 1) * S.print.pregrada) / b.cy;
      for (let i = 0; i < b.cx; i++) for (let j = 0; j < b.cy; j++) {
        s += `<rect x="${x + t + i * (cw + S.print.pregrada)}" y="${y + t + (b.cy - 1 - j) * (ch + S.print.pregrada)}" width="${Math.max(cw, 0.1)}" height="${Math.max(ch, 0.1)}" fill="${b.lid ? 'rgba(91,143,191,.28)' : 'rgba(0,0,0,.35)'}" stroke="var(--boxline)" stroke-opacity=".5" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
      }
    }
    // ručka na prednjoj (donjoj) ivici
    if (b.handle === 'rupa') s += `<circle cx="${x + w / 2}" cy="${y + d}" r="${Math.min(7, w / 5)}" fill="var(--bg)" stroke="${stroke}" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
    if (b.handle === 'rucka') s += `<rect x="${x + w / 2 - 10}" y="${y + d}" width="20" height="6" fill="var(--accent)" opacity=".85"/>`;
    const small = Math.min(w, d);
    const f1 = Math.max(Math.min(fs * 1.05, small / 5), fs * 0.45);
    s += `<text x="${x + w / 2}" y="${y + d / 2 - f1 * 0.15}" text-anchor="middle" font-size="${f1}" font-weight="700" fill="${on ? 'var(--accent)' : 'var(--fg)'}" stroke="var(--box)" stroke-width="${f1 * 0.28}" paint-order="stroke">${B.label}</text>`;
    s += `<text x="${x + w / 2}" y="${y + d / 2 + f1 * 1.05}" text-anchor="middle" font-size="${f1 * 0.78}" fill="var(--mute)" stroke="var(--box)" stroke-width="${f1 * 0.25}" paint-order="stroke">${fmt(w)}×${fmt(d)}×${fmt(B.h)}${b.lid ? ' · P' : ''}</text>`;
    s += '</g>';
  }));
  svg.innerHTML = s;
}
$('v2d').addEventListener('click', (e) => { const g = e.target.closest('.bx'); if (g) { sel = g.dataset.id; renderAll(); } });

// ------------------------------------------------------------------ provera, rezultat
const cache = new Map();   // ključ parametara -> rezultat geometrije
const keyOf = (p) => JSON.stringify(p);
let DEL = [];
function renderIssues() {
  const I = RES.issues;
  const el = $('issues');
  if (!I.length) { el.innerHTML = '<div class="issue ok">Sve staje: kutijice popunjavaju prostor i svaki deo staje na ploču.</div>'; return; }
  const fixes = [];
  el.innerHTML = I.map((i, n) => {
    if (i.fix) fixes[n] = i.fix;
    return `<div class="issue is${i.sev}"><span class="msg2">${i.sev === 'err' ? 'Ne ide: ' : 'Pažnja: '}${i.msg}</span>${i.fix ? `<span><button type="button" class="mini" data-fix="${n}">Predlog: ${i.fix.label}</button></span>` : ''}</div>`;
  }).join('');
  el.onclick = (e) => { const b = e.target.closest('[data-fix]'); if (!b) return; const f = fixes[+b.dataset.fix]; if (f) go({ ...f }); };
}
function renderResult() {
  const rho = 1.24 / 1000;   // g/mm3 PLA
  let g = 0, n = 0, bad = 0, secs = 0;
  const rows = [];
  for (const d of DEL) {
    const R = cache.get(keyOf(d.p));
    const B = RES.rows.flatMap((r) => r.boxes).find((b) => b.id === d.id);
    if (B && B.problems.includes('err')) { bad++; continue; }
    if (!R) continue;
    const m = (R.vol.telo + R.vol.poklopac) * rho, t = (R.vol.telo + R.vol.poklopac) / 9 * 1.15;
    g += m; secs += t; n += 1 + (R.poklopac ? 1 : 0);
    rows.push(`<tr><td><b>${d.label}</b></td><td>${fmt(d.p.w)} × ${fmt(d.p.d)} × ${fmt(d.p.h)}</td><td>${d.p.cx}×${d.p.cy}</td>
      <td>${d.p.lid ? '<span class="tag ok">poklopac</span> ' : ''}${d.p.handle !== 'nema' ? `<span class="tag">${d.p.handle === 'rupa' ? 'rupa' : 'ručka'}</span>` : ''}</td>
      <td>${Math.round(m)} g · ${Math.max(1, Math.round(t / 60))} min</td></tr>`);
  }
  $('sum').innerHTML = `
    <div><b>${DEL.length}</b><span>kutijica</span></div>
    <div><b>${n || '…'}</b><span>delova za štampu</span></div>
    <div><b>≈ ${Math.round(g)} g</b><span>PLA, ukupno</span></div>
    <div><b>≈ ${Math.floor(secs / 3600)} h ${Math.round((secs % 3600) / 60)} min</b><span>vreme štampe (procena)</span></div>`;
  $('parts').innerHTML = `<thead><tr><th>Kutijica</th><th>Spoljna mera, mm</th><th>Pregrade</th><th></th><th>Masa · vreme</th></tr></thead><tbody>${rows.join('')}</tbody>`;
  $('dl').disabled = !(RES.ok && DEL.length && DEL.every((d) => cache.has(keyOf(d.p))));
  $('dlmsg').textContent = RES.ok ? '' : 'Prvo reši greške iznad.';
}

// ------------------------------------------------------------------ računanje (worker + rezerva)
let worker = null, host = null, reqId = 0, waiters = new Map(), workerOK = null;
function initWorker() {
  try {
    worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const d = e.data;
      if (d.ready) { workerOK = true; return; }
      if (d.fatal) { failWorker(); return; }
      const w = waiters.get(d.id); if (!w) return; waiters.delete(d.id);
      d.ok ? w.res(d.res) : w.rej(new Error(d.msg));
    };
    worker.onerror = () => failWorker();
  } catch (e) { failWorker(); }
  setTimeout(() => { if (workerOK === null) failWorker(); }, 8000);
}
function failWorker() {
  if (workerOK === false) return; workerOK = false;
  if (worker) { try { worker.terminate(); } catch (e) {} worker = null; }
  for (const [, w] of waiters) w.rej(Object.assign(new Error('retry'), { retry: true }));
  waiters.clear();
}
async function compute(jobs) {
  if (worker && workerOK !== false) {
    try { return await new Promise((res, rej) => { const id = ++reqId; waiters.set(id, { res, rej }); worker.postMessage({ id, jobs }); }); }
    catch (e) { if (!e.retry) throw e; }
  }
  if (!host) { const m = await import('./host.js'); host = m.createHost(); }
  return host.run({ jobs });
}
initWorker();

let tm = null, busy = false, again = false;
function schedule() { clearTimeout(tm); badge('Čekam izmene…', true); tm = setTimeout(run, 350); }
function badge(t, b) { $('badge-t').textContent = t; $('badge').classList.toggle('busy', !!b); }
function showErr(msg) { const e = $('err'); e.hidden = !msg; e.textContent = msg || ''; }
async function run() {
  if (busy) { again = true; return; }
  busy = true; again = false;
  const ok = new Set(RES.rows.flatMap((r) => r.boxes).filter((b) => !b.problems.includes('err')).map((b) => b.id));
  DEL = delovi(S, RES);
  const jobs = [], seen = new Set();
  for (const d of DEL) { if (!ok.has(d.id)) continue; const k = keyOf(d.p); if (!cache.has(k) && !seen.has(k)) { seen.add(k); jobs.push({ key: k, p: d.p }); } }
  try {
    if (jobs.length) {
      badge('Računam geometriju…', true);
      const out = await compute(jobs);
      for (const o of out) cache.set(o.key, o.res);
      if (cache.size > 80) for (const k of [...cache.keys()].slice(0, cache.size - 60)) cache.delete(k);
    }
    showErr('');
    badge(RES.ok ? 'Spremno' : 'Ima grešaka u rasporedu', false);
  } catch (e) {
    showErr('Greška pri izradi geometrije: ' + (e && e.message || e));
    badge('Nije moguće', false);
  }
  busy = false;
  if (again) { again = false; return run(); }
  renderResult();
  if (!$('v3d').hasAttribute('hidden')) build3d();
}

// ------------------------------------------------------------------ 3D
let three = null;
function init3d() {
  if (three || typeof THREE === 'undefined' || !THREE.OrbitControls) return;
  const canvas = $('v3d');
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); } catch (e) { return; }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 1, 6000);
  camera.up.set(0, 0, 1);
  const controls = new THREE.OrbitControls(camera, canvas);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x555555, 0.9));
  const dl = new THREE.DirectionalLight(0xffffff, 0.8); dl.position.set(-200, -400, 600); scene.add(dl);
  const dl2 = new THREE.DirectionalLight(0xffffff, 0.35); dl2.position.set(300, 300, 200); scene.add(dl2);
  const group = new THREE.Group(); scene.add(group);
  const draw = () => renderer.render(scene, camera);
  controls.addEventListener('change', draw);
  const resize = () => {
    const st = $('stage'); const w = st.clientWidth, h = st.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); draw();
  };
  new ResizeObserver(resize).observe($('stage'));
  three = { renderer, scene, camera, controls, group, draw, resize, fitted: false, key: '' };
}
function toGeo(m) {
  const n = m.v.length / m.np, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { pos[3 * i] = m.v[i * m.np]; pos[3 * i + 1] = m.v[i * m.np + 1]; pos[3 * i + 2] = m.v[i * m.np + 2]; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(m.t, 1));
  const g2 = g.toNonIndexed(); g.dispose(); g2.computeVertexNormals();
  return g2;
}
function build3d() {
  init3d(); if (!three) return;
  const { group } = three;
  while (group.children.length) { const c = group.children.pop(); c.geometry && c.geometry.dispose(); }
  const exp = +$('o-exp').value, showLid = $('o-lid').checked;
  const mBody = new THREE.MeshStandardMaterial({ color: 0xbfc79a, roughness: 0.6, metalness: 0.05 });
  const mSel = new THREE.MeshStandardMaterial({ color: 0xeaff00, roughness: 0.5, metalness: 0.05 });
  const mLid = new THREE.MeshStandardMaterial({ color: 0x5b8fbf, roughness: 0.45, transparent: true, opacity: 0.8 });
  for (const d of DEL) {
    const R = cache.get(keyOf(d.p)); if (!R) continue;
    const hb = d.p.lid ? d.p.h - d.p.lidT : d.p.h;
    const t = new THREE.Mesh(toGeo(R.telo), d.id === sel ? mSel : mBody);
    t.position.set(d.x, d.y, 0); group.add(t);
    if (R.poklopac && showLid) {
      const l = new THREE.Mesh(toGeo(R.poklopac), mLid);
      l.rotation.x = Math.PI;
      l.position.set(d.x, d.y + d.p.d, hb + d.p.lidT + exp);
      group.add(l);
    }
  }
  const fr = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(S.W, S.D, S.H)), new THREE.LineBasicMaterial({ color: 0x8a8a7a }));
  fr.position.set(S.W / 2, S.D / 2, S.H / 2); group.add(fr);
  three.resize();
  const sz = Math.max(S.W, S.D, S.H), fitKey = [S.W, S.D, S.H].join('x');
  if (!three.fitted || three.key !== fitKey) {
    three.camera.position.set(S.W / 2 - sz * 0.15, -S.D * 0.55 - sz * 0.75, S.H + sz * 0.95);
    three.controls.target.set(S.W / 2, S.D / 2, S.H * 0.3);
    three.fitted = true; three.key = fitKey;
  }
  three.controls.update(); three.resize(); three.draw();
}
$('o-lid').addEventListener('change', build3d);
$('o-exp').addEventListener('input', build3d);
function setTab(t) {
  const is3 = t === '3d';
  $('tab2d').setAttribute('aria-selected', String(!is3)); $('tab3d').setAttribute('aria-selected', String(is3));
  $('v2d').toggleAttribute('hidden', is3); $('v3d').toggleAttribute('hidden', !is3); $('opts3d').toggleAttribute('hidden', !is3);
  if (is3) { build3d(); requestAnimationFrame(() => three && three.resize()); }
}
$('tab2d').addEventListener('click', () => setTab('2d'));
$('tab3d').addEventListener('click', () => setTab('3d'));

// ------------------------------------------------------------------ preuzimanje
function safe(t) {
  return String(t).replace(/Đ/g, 'Dj').replace(/đ/g, 'dj').normalize('NFKD').replace(/[^\x00-\x7f]/g, '').replace(/[^A-Za-z0-9_.-]+/g, '_') || 'x';
}
const dimStr = (d) => `${Math.round(d.p.w)}x${Math.round(d.p.d)}x${Math.round(d.p.h)}`;
function infoText() {
  const L = [`Mala 3D fabrika: modularne kutijice`, `Prostor: ${S.W} x ${S.D} x ${S.H} mm, zazor između kutijica ${S.gap} mm`,
    `Štampa: zid ${S.print.zid}, dno ${S.print.dno}, pregrada ${S.print.pregrada}, poklopac ${S.print.poklopac}, usna ${S.print.usna}, tolerancija ${S.print.tol} mm`, ''];
  for (const d of DEL) L.push(`${d.label}: ${dimStr(d)} mm, položaj x=${d.x.toFixed(1)} y(od prednje strane)=${d.y.toFixed(1)}, pregrade ${d.p.cx}x${d.p.cy}${d.p.lid ? ', poklopac' : ''}${d.p.handle !== 'nema' ? ', ' + d.p.handle : ''}`);
  L.push('', 'Telo štampaj na dnu, otvorom nagore, bez podupirača. Poklopac pločom nadole, usnom nagore.',
    'Svaki 3MF je već složen na ploču 256 x 256 mm (ako ne staje sve, ima više fajlova: _ploca1, _ploca2).',
    'Napomena: ručka (klin) izlazi 6 mm van mere kutijice, na prednjoj strani.');
  return L.join('\n');
}
$('dl').addEventListener('click', async () => {
  const msg = $('dlmsg'); msg.textContent = 'Pakujem…'; $('dl').disabled = true;
  try {
    const zip = new JSZip();
    const root = `kutije_${Math.round(S.W)}x${Math.round(S.D)}x${Math.round(S.H)}`;
    const all = [];
    for (const d of DEL) {
      const R = cache.get(keyOf(d.p));
      const folder = `${root}/${d.label}_${dimStr(d)}`;
      const base = `${d.label}_${dimStr(d)}`;
      zip.file(`${folder}/${base}_telo.stl`, stlBytes(R.telo));
      const items = [{ name: `${d.label}_telo`, mesh: R.telo, w: R.bbox.telo[0], d: R.bbox.telo[1] }];
      if (R.poklopac) { zip.file(`${folder}/${base}_poklopac.stl`, stlBytes(R.poklopac)); items.push({ name: `${d.label}_poklopac`, mesh: R.poklopac, w: R.bbox.poklopac[0], d: R.bbox.poklopac[1] }); }
      all.push(...items);
      const plates = slozi(items, BED);
      for (let i = 0; i < plates.length; i++) zip.file(`${folder}/${base}${plates.length > 1 ? '_ploca' + (i + 1) : ''}.3mf`, await threeMF(JSZip, plates[i]));
    }
    const plates = slozi(all, BED);
    for (let i = 0; i < plates.length; i++) zip.file(`${root}/sve_ploca${i + 1}.3mf`, await threeMF(JSZip, plates[i]));
    zip.file(`${root}/info.txt`, infoText());
    const data = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type: 'application/zip' })); a.download = `${root}.zip`;
    document.body.appendChild(a); a.click(); a.remove();
    msg.textContent = `Sačuvano (${(data.length / 1024).toFixed(0)} KB).`;
  } catch (e) { msg.textContent = 'Preuzimanje nije uspelo: ' + (e && e.message || e); }
  $('dl').disabled = false;
});

// ------------------------------------------------------------------ crtanje svega
function renderAll(keepEditor) {
  syncSpace();
  renderList();
  if (keepEditor) syncEditor(); else { builtFor = null; buildEditor(); }
  draw2d();
  renderIssues();
  renderResult();
}
renderAll();
badge('Učitavam…', true);
run();
// za proveru u pregledaču / testove
window.__kutije = { get S() { return S; }, get RES() { return RES; }, go, cache, setTab };
