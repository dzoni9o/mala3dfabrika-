// Raspored kutijica: čista logika bez DOM-a i bez WASM-a (može da se testira u Node-u).
// Koordinate: x ide zdesno, y od PREDNJE strane (y = 0 je prednja strana fioke).
// Redovi se vode odozgo nadole kako se vide na planu; poslednji red je prednji.

export const BED = 256;          // ploča Bambu Lab A1, mm
export const MIN_INNER = 10;     // najmanja unutrašnja mera kutijice
export const MIN_CELL = 8;       // najmanja unutrašnja mera jedne pregrade
export const MIN_H = 16;
export const LIP_H = 3;          // visina usne poklopca

export const PRESETS = {
  jaka:   { zid: 1.6, dno: 1.2, pregrada: 1.2, poklopac: 1.2, usna: 1.2 },
  lagana: { zid: 0.8, dno: 0.8, pregrada: 0.8, poklopac: 0.8, usna: 0.8 },
};

let uid = 0;
const nid = (p) => p + (++uid);
export function reseed(s) { let m = uid; for (const r of s.rows) { m = Math.max(m, parseInt(r.id.slice(1), 10) || 0); for (const b of r.boxes) m = Math.max(m, parseInt(b.id.slice(1), 10) || 0); } uid = m; }

export function novaKutija(o = {}) {
  return { id: nid('k'), w: 50, fix: false, h: null, cx: 1, cy: 1, lid: false, handle: 'nema', r: 3, zid: null, ...o };
}
export function noviRed(o = {}) {
  return { id: nid('r'), d: 50, fix: false, boxes: [novaKutija()], ...o };
}

export function pocetnoStanje() {
  const s = {
    v: 1, W: 300, D: 200, H: 60, gap: 0.2,
    print: { preset: 'jaka', ...PRESETS.jaka, tol: 0.2 },
    rows: [
      noviRed({ boxes: [novaKutija(), novaKutija(), novaKutija()] }),
      noviRed({ boxes: [novaKutija(), novaKutija()] }),
    ],
  };
  normalize(s);
  return s;
}

const r3 = (x) => Math.round(x * 1000) / 1000;
const r1 = (x) => Math.round(x * 10) / 10;

// ---------------------------------------------------------------- raspodela
// items: [{ v, fix, min, max }]; vraća { vals, ok, why }
// Slobodne stavke dele ostatak srazmerno trenutnoj veličini, uz poštovanje min/max.
export function distribute(total, items) {
  const n = items.length;
  const vals = items.map((it) => it.v);
  let free = items.map((it, i) => (it.fix ? -1 : i)).filter((i) => i >= 0);
  if (!free.length) {
    const sum = vals.reduce((a, b) => a + b, 0);
    return { vals, ok: Math.abs(sum - total) < 1e-6, why: 'nema slobodnih' };
  }
  let pool = total - items.reduce((a, it) => a + (it.fix ? it.v : 0), 0);
  const done = new Set();
  let guard = 0;
  while (guard++ < 20) {
    const act = free.filter((i) => !done.has(i));
    if (!act.length) break;
    const wsum = act.reduce((a, i) => a + Math.max(items[i].v, 1), 0);
    let bad = false;
    for (const i of act) {
      const x = pool * Math.max(items[i].v, 1) / wsum;
      const lo = items[i].min ?? 0, hi = items[i].max ?? Infinity;
      if (x < lo - 1e-9) { vals[i] = lo; done.add(i); pool -= lo; bad = true; break; }
      if (x > hi + 1e-9) { vals[i] = hi; done.add(i); pool -= hi; bad = true; break; }
    }
    if (!bad) { for (const i of act) vals[i] = pool * Math.max(items[i].v, 1) / wsum; pool = 0; for (const i of act) done.add(i); break; }
  }
  const sum = vals.reduce((a, b) => a + b, 0);
  if (Math.abs(sum - total) > 1e-6) {
    // ne može da se uklopi: razvuci/skupi sve srazmerno, da plan i dalje popunjava prostor
    const f = total / (sum || 1);
    return { vals: vals.map((x) => x * f), ok: false, why: sum > total ? 'premalo mesta' : 'previše mesta' };
  }
  return { vals, ok: true };
}

// zaokruživanje na 0,1 mm tako da zbir ostane tačan
function roundTo(total, vals, items) {
  const out = vals.map((x) => r1(x));
  let diff = r3(total - out.reduce((a, b) => a + b, 0));
  if (Math.abs(diff) > 1e-9) {
    let k = -1;
    for (let i = out.length - 1; i >= 0; i--) if (!items[i].fix) { k = i; break; }
    if (k < 0) k = out.length - 1;
    out[k] = r3(out[k] + diff);
  }
  return out;
}

// ---------------------------------------------------------------- parametri jedne kutijice
export function zid(s, b) { return b.zid ?? s.print.zid; }
export function minInnerX(s, b) { return Math.max(MIN_INNER, b.cx * MIN_CELL + (b.cx - 1) * s.print.pregrada); }
export function minInnerY(s, b) { return Math.max(MIN_INNER, b.cy * MIN_CELL + (b.cy - 1) * s.print.pregrada); }
export const minW = (s, b) => r1(2 * zid(s, b) + minInnerX(s, b) + s.gap + 0.05);
export const minDb = (s, b) => r1(2 * zid(s, b) + minInnerY(s, b) + s.gap + 0.05);
export const boxH = (s, b) => (b.h == null ? s.H : b.h);

// ---------------------------------------------------------------- rešavanje
export function solve(s) {
  const issues = [];
  const rows = s.rows;
  // dubine redova
  const rItems = rows.map((r) => ({
    v: r.d, fix: r.fix && rows.length > 1,
    min: Math.max(...r.boxes.map((b) => minDb(s, b))), max: BED + s.gap,
  }));
  const dr = distribute(s.D, rItems);
  const dep = roundTo(s.D, dr.vals, rItems);
  if (!dr.ok) {
    issues.push({ sev: 'err', rowId: null, code: 'redovi', msg: dr.why === 'premalo mesta'
      ? `Redovi ne staju u dubinu ${s.D} mm (zbir najmanjih mera je veći).` : `Redovi ne mogu da popune dubinu ${s.D} mm (najveća dubina reda je ${BED} mm).`,
      fix: dr.why === 'premalo mesta' ? { label: 'Ukloni poslednji red', act: 'removeRow', rowId: rows[rows.length - 1].id } : { label: 'Dodaj red', act: 'addRow' } });
  }
  const out = { rows: [], issues, ok: true };
  let ytop = 0;
  rows.forEach((row, ri) => {
    const d = dep[ri];
    const items = row.boxes.map((b) => ({
      v: b.w, fix: b.fix && row.boxes.length > 1, min: minW(s, b), max: BED + s.gap,
    }));
    const wr = distribute(s.W, items);
    const wid = roundTo(s.W, wr.vals, items);
    const R = { id: row.id, d, ytop, y: s.D - ytop - d, front: ri === rows.length - 1, ok: wr.ok, boxes: [] };
    if (!wr.ok) {
      const maxOne = (b, i) => r1(Math.min(BED + s.gap, s.W - items.reduce((a, it, j) => a + (j === i ? 0 : (it.fix ? it.v : it.min)), 0)));
      if (wr.why === 'premalo mesta') {
        const bi = row.boxes.findIndex((b) => b.fix);
        issues.push({ sev: 'err', rowId: row.id, boxId: bi >= 0 ? row.boxes[bi].id : null, code: 'sirina',
          msg: `Red ${ri + 1}: širina ${s.W} mm ne stiže ni za najmanje mere kutijica.` + (bi >= 0 ? ` Kutijica ${label(s, ri, bi)} može najviše ${Math.max(maxOne(row.boxes[bi], bi), 0)} mm.` : ''),
          fix: bi >= 0 && maxOne(row.boxes[bi], bi) >= items[bi].min ? { label: `Postavi na ${maxOne(row.boxes[bi], bi)} mm`, act: 'setW', rowId: row.id, boxId: row.boxes[bi].id, v: maxOne(row.boxes[bi], bi) }
            : { label: 'Ukloni poslednju kutijicu iz reda', act: 'removeBox', rowId: row.id, boxId: row.boxes[row.boxes.length - 1].id } });
      } else {
        issues.push({ sev: 'err', rowId: row.id, code: 'sirina',
          msg: `Red ${ri + 1}: kutijice ne mogu da popune ${s.W} mm (najviše ${BED} mm po kutijici).`,
          fix: { label: 'Dodaj kutijicu u red', act: 'addBox', rowId: row.id } });
      }
    }
    let x = 0;
    row.boxes.forEach((b, bi) => {
      const w = wid[bi];
      const B = {
        id: b.id, ri, bi, x, w, y: R.y, d, front: R.front,
        ow: r1(w - s.gap), od: r1(d - s.gap), h: boxH(s, b), src: b, label: label(s, ri, bi),
        t: zid(s, b), problems: [],
      };
      x = r3(x + w);
      R.boxes.push(B);
    });
    out.rows.push(R);
    ytop = r3(ytop + d);
  });
  // provere po kutijici
  for (const R of out.rows) for (const B of R.boxes) provera(s, out, R, B);
  out.ok = !issues.some((i) => i.sev === 'err');
  return out;
}

export function label(s, ri, bi) { return `R${ri + 1}K${bi + 1}`; }

function provera(s, out, R, B) {
  const b = B.src, p = s.print, I = out.issues;
  const add = (sev, code, msg, fix) => { I.push({ sev, code, boxId: B.id, rowId: R.id, msg: `${B.label}: ${msg}`, fix }); B.problems.push(sev); };
  const reqW = b.w, shown = B.w;
  if (R.ok && b.fix && R.boxes.length > 1 && Math.abs(reqW - shown) > 0.05) {
    add('err', 'trazeno', `traženo ${reqW} mm, a moguće je ${shown} mm.`, { label: `Postavi na ${shown} mm`, act: 'setW', rowId: R.id, boxId: b.id, v: shown });
  }
  if (B.ow > BED + 1e-6) {
    const n = Math.ceil((B.w) / (BED - 1));
    add('err', 'staje_w', `širina ${B.ow} mm ne staje na ploču ${BED} mm.`, { label: `Podeli na ${n} jednake kutijice`, act: 'split', rowId: R.id, boxId: b.id, n });
  }
  if (B.od > BED + 1e-6) {
    add('err', 'staje_d', `dubina ${B.od} mm ne staje na ploču ${BED} mm.`, { label: 'Dodaj još jedan red', act: 'addRow' });
  }
  if (R.ok && B.ow < 2 * B.t + minInnerX(s, b) - 1e-6) {
    add('err', 'min_w', `previše uska za zid ${B.t} mm i ${b.cx} pregrada (najmanje ${minW(s, b)} mm).`,
      b.cx > 1 ? { label: 'Smanji broj pregrada u širini', act: 'set', boxId: b.id, k: 'cx', v: Math.max(1, b.cx - 1) } : { label: `Postavi na ${minW(s, b)} mm`, act: 'setW', rowId: R.id, boxId: b.id, v: minW(s, b) });
  }
  if (B.od < 2 * B.t + minInnerY(s, b) - 1e-6) {
    add('err', 'min_d', `prerana za zid ${B.t} mm i ${b.cy} pregrada (najmanje ${minDb(s, b)} mm).`,
      b.cy > 1 ? { label: 'Smanji broj pregrada u dubini', act: 'set', boxId: b.id, k: 'cy', v: Math.max(1, b.cy - 1) } : { label: `Postavi dubinu reda na ${minDb(s, b)} mm`, act: 'setD', rowId: R.id, v: minDb(s, b) });
  }
  if (B.h > s.H + 1e-6) add('err', 'visina', `visina ${B.h} mm je veća od prostora (${s.H} mm).`, { label: `Spusti na ${s.H} mm`, act: 'set', boxId: b.id, k: 'h', v: s.H });
  if (B.h < MIN_H) add('err', 'niska', `preniska, najmanja visina je ${MIN_H} mm.`, { label: `Podigni na ${MIN_H} mm`, act: 'set', boxId: b.id, k: 'h', v: MIN_H });
  if (B.h > BED) add('err', 'staje_h', `visina ${B.h} mm je veća od visine ploče za štampu.`, { label: `Spusti na ${BED} mm`, act: 'set', boxId: b.id, k: 'h', v: BED });
  const hb = b.lid ? B.h - p.poklopac : B.h;
  B.hb = r1(hb);
  if (b.lid && hb - p.dno < LIP_H + 8) {
    add('err', 'poklopac_nizak', `sa poklopcem je preniska (telo ${r1(hb)} mm).`, { label: 'Ukloni poklopac', act: 'set', boxId: b.id, k: 'lid', v: false });
  }
  if (b.handle === 'rupa') {
    const need = b.lid ? p.dno + 18 : p.dno + 12;
    if (hb < need) add('warn', 'rupa_nisko', `kutijica je preniska za rupu za prst (treba telo ≥ ${need} mm).`, { label: 'Bez ručke', act: 'set', boxId: b.id, k: 'handle', v: 'nema' });
    if (!R.front) add('warn', 'rupa_red', 'rupa za prst gleda u susednu kutijicu i prst ne može da uđe; ima smisla samo u prednjem redu.', { label: 'Bez ručke', act: 'set', boxId: b.id, k: 'handle', v: 'nema' });
    if (B.ow < 30) add('warn', 'rupa_usko', 'preuska za rupu za prst (najmanje 30 mm).', { label: 'Bez ručke', act: 'set', boxId: b.id, k: 'handle', v: 'nema' });
  }
  if (b.handle === 'rucka') {
    if (!R.front) add('warn', 'rucka_red', 'ručka izlazi 6 mm napred i udarila bi u susednu kutijicu; moguća je samo u prednjem redu.', { label: 'Prebaci na rupu za prst', act: 'set', boxId: b.id, k: 'handle', v: 'rupa' });
    else if (B.ow < 34) add('warn', 'rucka_usko', 'preuska za ručku (najmanje 34 mm).', { label: 'Bez ručke', act: 'set', boxId: b.id, k: 'handle', v: 'nema' });
  }
  if (b.r > Math.min(B.ow, B.od) / 2 - 0.5) add('warn', 'ugao', `ugao ${b.r} mm je prevelik za ovu veličinu.`, { label: 'Smanji ugao', act: 'set', boxId: b.id, k: 'r', v: r1(Math.max(0, Math.min(B.ow, B.od) / 2 - 1)) });
}

// zapiši rešene veličine u stanje (slobodne kutijice i redovi dobijaju svoju stvarnu meru)
export function normalize(s) {
  s.rows.forEach((r) => { if (!r.boxes.length) r.boxes.push(novaKutija()); });
  const res = solve(s);
  res.rows.forEach((R, ri) => {
    const row = s.rows[ri];
    if (!row.fix || s.rows.length === 1) row.d = R.d;
    R.boxes.forEach((B, bi) => { const b = row.boxes[bi]; if (!b.fix || row.boxes.length === 1) b.w = B.w; });
  });
  return solve(s);
}

// ---------------------------------------------------------------- akcije
function find(s, rowId, boxId) {
  const ri = s.rows.findIndex((r) => r.id === rowId);
  if (ri < 0) return {};
  const row = s.rows[ri];
  const bi = boxId ? row.boxes.findIndex((b) => b.id === boxId) : -1;
  return { ri, row, bi, box: bi >= 0 ? row.boxes[bi] : null };
}
export function findBox(s, boxId) {
  for (const row of s.rows) { const bi = row.boxes.findIndex((b) => b.id === boxId); if (bi >= 0) return { row, bi, box: row.boxes[bi] }; }
  return {};
}
// ako bi sve ostale bile zaključane, oslobodi najbližu susednu
function ensureFree(list, idx) {
  if (list.length < 2) return;
  if (list.some((it, i) => i !== idx && !it.fix)) return;
  const j = idx + 1 < list.length ? idx + 1 : idx - 1;
  list[j].fix = false;
}

export function akcija(s, a) {
  switch (a.act) {
    case 'setSpace': { s[a.k] = a.v; break; }
    case 'setW': { const { row, bi, box } = find(s, a.rowId, a.boxId); if (!box || row.boxes.length < 2) break; box.w = a.v; box.fix = true; ensureFree(row.boxes, bi); break; }
    case 'unfixW': { const { box } = find(s, a.rowId, a.boxId); if (box) box.fix = false; break; }
    case 'setD': { const ri = s.rows.findIndex((r) => r.id === a.rowId); if (ri < 0 || s.rows.length < 2) break; s.rows[ri].d = a.v; s.rows[ri].fix = true; ensureFree(s.rows, ri); break; }
    case 'unfixD': { const row = s.rows.find((r) => r.id === a.rowId); if (row) row.fix = false; break; }
    case 'set': { const { box } = findBox(s, a.boxId); if (box) { box[a.k] = a.v; if (a.k === 'lid' && !a.v && box.handle === 'rucka') box.handle = 'nema'; } break; }
    case 'addBox': {
      const { row } = find(s, a.rowId); if (!row) break;
      normalize(s);
      const n = row.boxes.length, fr = row.boxes.filter((b) => !b.fix), nb = novaKutija({ w: fr.length ? fr.reduce((a, b) => a + b.w, 0) / fr.length : s.W / (n + 1) });
      const src = row.boxes[row.boxes.length - 1];
      if (src) Object.assign(nb, { h: src.h, cx: src.cx, cy: src.cy, lid: src.lid, r: src.r, zid: src.zid });
      row.boxes.push(nb); break;
    }
    case 'removeBox': {
      const { row, bi } = find(s, a.rowId, a.boxId); if (!row || bi < 0) break;
      if (row.boxes.length === 1) { akcija(s, { act: 'removeRow', rowId: row.id }); break; }
      row.boxes.splice(bi, 1);
      if (row.boxes.every((b) => b.fix)) row.boxes[Math.min(bi, row.boxes.length - 1)].fix = false;
      break;
    }
    case 'addRow': {
      normalize(s);
      const n = s.rows.length;
      const frr = s.rows.filter((r) => !r.fix), nr = noviRed({ d: frr.length ? frr.reduce((a, r) => a + r.d, 0) / frr.length : s.D / (n + 1) });
      const last = s.rows[n - 1].boxes[0];
      if (last) Object.assign(nr.boxes[0], { h: last.h, cx: last.cx, cy: last.cy, lid: last.lid, r: last.r, zid: last.zid });
      s.rows.push(nr); break;
    }
    case 'removeRow': {
      if (s.rows.length < 2) break;
      const i = s.rows.findIndex((r) => r.id === a.rowId); if (i < 0) break;
      s.rows.splice(i, 1);
      if (s.rows.every((r) => r.fix)) s.rows[Math.min(i, s.rows.length - 1)].fix = false;
      break;
    }
    case 'split': {
      const { row, bi, box } = find(s, a.rowId, a.boxId); if (!box) break;
      normalize(s);
      const n = Math.max(2, a.n | 0), w = box.w / n;
      const parts = Array.from({ length: n }, (_, k) => (k === 0 ? Object.assign(box, { w }) : { ...box, id: nid('k'), w }));
      row.boxes.splice(bi, 1, ...parts); break;
    }
    case 'grid': {
      const cols = Math.max(1, a.cols | 0), rws = Math.max(1, a.rows | 0);
      const proto = s.rows[0] && s.rows[0].boxes[0] ? s.rows[0].boxes[0] : novaKutija();
      s.rows = Array.from({ length: rws }, () => noviRed({ d: s.D / rws, boxes: Array.from({ length: cols }, () => novaKutija({ w: s.W / cols, h: proto.h, cx: proto.cx, cy: proto.cy, lid: proto.lid, r: proto.r, zid: proto.zid })) }));
      break;
    }
    case 'preset': {
      const P = PRESETS[a.v]; if (!P) break;
      Object.assign(s.print, P, { preset: a.v }); break;
    }
    case 'print': { s.print[a.k] = a.v; s.print.preset = presetOf(s); break; }
    default: break;
  }
  return normalize(s);
}

export function presetOf(s) {
  const p = s.print;
  for (const [k, P] of Object.entries(PRESETS)) if (Object.keys(P).every((q) => Math.abs(p[q] - P[q]) < 1e-9)) return k;
  return null;
}

// Delovi za izradu: svaka kutijica kao parametri za generator geometrije
export function delovi(s, res) {
  const p = s.print, out = [];
  for (const R of res.rows) for (const B of R.boxes) {
    const b = B.src;
    out.push({
      id: B.id, label: B.label, x: r3(B.x + s.gap / 2), y: r3(B.y + s.gap / 2),
      p: { w: B.ow, d: B.od, h: B.h, lid: !!b.lid, handle: b.handle, front: B.front, cx: b.cx, cy: b.cy, r: b.r,
        t: B.t, f: p.dno, td: p.pregrada, lidT: p.poklopac, lipT: p.usna, lipH: LIP_H, tol: p.tol },
    });
  }
  return out;
}
