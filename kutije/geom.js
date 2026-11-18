// Geometrija kutijice i poklopca (manifold-3d). Kutijica se štampa na dnu, poklopac pločom nadole (usna gore).
// Koordinate: x 0..w, y 0..d (y = 0 je prednja strana), z 0..visina.

const SEG = 48;
const RIM_OUT = 0.8;   // koliko rub (kragna) viri van kosog zida
const RIM_H = 3;       // visina ruba

export function makeEngine(mf) {
  const CS = mf.CrossSection, M = mf.Manifold;

  const rrect = (w, d, r) => {
    r = Math.max(0, Math.min(r, w / 2 - 0.01, d / 2 - 0.01));
    if (r < 0.05) return CS.square([w, d]);
    return CS.square([w - 2 * r, d - 2 * r]).translate([r, r]).offset(r, 'Round', 2.0, SEG);
  };
  const sub = (a, b) => a.subtract(b);
  const uni = (a, b) => a.add(b);
  // cilindar duž y ose, centar (cx, y0 + len/2, cz)
  const cylY = (rad, len, cx, y0, cz) => M.cylinder(len, rad, rad, SEG, true).rotate([90, 0, 0]).translate([cx, y0 + len / 2, cz]);

  function mesh(man) {
    const g = man.getMesh();
    return { v: new Float32Array(g.vertProperties), t: new Uint32Array(g.triVerts), np: g.numProp };
  }
  const bb = (man) => { const b = man.boundingBox(); return [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]]; };

  // Spoljna (ili unutrašnja, uz extra = debljina zida) površina: kosi zid, širi gore, uz rub (kragnu) pri vrhu.
  // inset(z): koliko je obris uvučen u odnosu na vrh kutijice na visini z.
  const SLAB = 0.02;
  function slab(w, d, r, ins, z) {
    return rrect(w - 2 * ins, d - 2 * ins, Math.max(0, r - ins)).translate([ins, ins]).extrude(SLAB).translate([0, 0, z]);
  }
  function loft(w, d, r, i0, z0, i1, z1) {
    if (Math.abs(i0 - i1) < 1e-6) return rrect(w - 2 * i0, d - 2 * i0, Math.max(0, r - i0)).translate([i0, i0]).extrude(z1 - z0).translate([0, 0, z0]);
    return M.hull([slab(w, d, r, i0, z0), slab(w, d, r, i1, z1 - SLAB)]);
  }
  function profil(p, hb, extra, top) {
    const { w, d, r, nagib, rub } = p;
    const n = nagib || 0, ro = rub ? RIM_OUT : 0, rh = rub ? RIM_H : 0;
    if (!rub) {
      const s = loft(w, d, r, extra + n, 0, extra, hb);
      return top ? uni(s, loft(w, d, r, extra, hb - 0.01, extra, hb + top)) : s;
    }
    const zA = hb - rh, zB = zA + ro;
    let s = loft(w, d, r, extra + ro + n, 0, extra + ro, zA);
    s = uni(s, loft(w, d, r, extra + ro, zA - 0.01, extra, zB));
    s = uni(s, loft(w, d, r, extra, zB - 0.01, extra, hb + (top || 0)));
    return s;
  }

  function tekstura(p, hb, outer) {
    const { w, d, r, t, tex, nagib, rub } = p;
    if (!tex || tex === 'nema') return null;
    const dt = Math.min(0.6, t * 0.4), n = nagib || 0, ro = rub ? RIM_OUT : 0;
    const zLo = 3, zHi = hb - (rub ? RIM_H : 0) - 2;
    if (zHi - zLo < 6) return null;
    const shell = sub(outer, profil(p, hb, dt, 1));
    const cut = [];
    const reach = n + ro + dt + 0.4, m = r + 4;
    if (tex === 'zlebovi') {
      const pitch = 4.5, gw = 1.5;
      const bar = (x, y, bw, bh) => M.cube([bw, bh, zHi - zLo]).translate([x, y, zLo]);
      for (let x = m; x < w - m; x += pitch) {
        cut.push(bar(x, -1, gw, reach + 1)); cut.push(bar(x, d - reach, gw, reach + 1));
      }
      for (let y = m; y < d - m; y += pitch) {
        cut.push(bar(-1, y, reach + 1, gw)); cut.push(bar(w - reach, y, reach + 1, gw));
      }
    } else {
      const pitch = 3.2, gh = 1.0;
      for (let z = zLo; z < zHi - gh; z += pitch) cut.push(M.cube([w + 2, d + 2, gh]).translate([-1, -1, z]));
    }
    if (!cut.length) return null;
    return M.union(cut).intersect(shell);
  }

  function telo(p) {
    const { w, d, h, lid, handle, front, cx, cy, r, t, f, td, lidT, lipH } = p;
    const n = p.nagib || 0;
    const hb = lid ? h - lidT : h;
    const rubOn = !!p.rub && hb >= 14;
    const q = { ...p, rub: rubOn };
    const outer = profil(q, hb, 0, 0);
    let body = outer;
    const cavity = profil(q, hb, t, 2).intersect(M.cube([w + 2, d + 2, hb + 3]).translate([-1, -1, f]));
    body = sub(body, cavity);
    // pregrade (iste visine kao i zid, a ispod usne ako ima poklopac)
    if (cx > 1 || cy > 1) {
      const iw = w - 2 * t, id = d - 2 * t;
      const cw = (iw - (cx - 1) * td) / cx, ch = (id - (cy - 1) * td) / cy;
      const dh = (lid ? hb - lipH - 0.5 : hb) - f + 0.5;
      const bars = [];
      for (let i = 1; i < cx; i++) bars.push(M.cube([td, d, dh]).translate([t + i * cw + (i - 1) * td, 0, f - 0.5]));
      for (let j = 1; j < cy; j++) bars.push(M.cube([w, td, dh]).translate([0, t + j * ch + (j - 1) * td, f - 0.5]));
      body = uni(body, M.union(bars).intersect(outer));
    }
    const reach = t + n + (rubOn ? RIM_OUT : 0) + 1.5;
    if (handle === 'rupa') {
      if (lid) {
        const zc = Math.max(f + 8, Math.min(hb - 9, hb / 2));
        body = sub(body, cylY(7, reach, w / 2, -1, zc));
      } else {
        const nw = 16, z0 = hb - Math.min(12, hb - f - 2), zc = z0 + nw / 2;
        const cut = M.cube([nw, reach, hb - zc + 1]).translate([w / 2 - nw / 2, -1, zc]);
        body = sub(body, uni(cut, cylY(nw / 2, reach, w / 2, -1, zc)));
      }
    }
    const tx = tekstura(q, hb, outer);
    if (tx) body = sub(body, tx);
    if (handle === 'rucka' && front) {
      const tw = 20, out = 6, th = 1.6, inW = n + (rubOn ? RIM_OUT : 0) + 1;
      const prof = new CS([[[inW, hb], [-out, hb], [-out, hb - th], [inW, hb - th - out - inW]]], 'NonZero');
      const tab = prof.extrude(tw).rotate([90, 0, 90]).translate([w / 2 - tw / 2, 0, 0]);
      body = uni(body, tab);
    }
    return body;
  }

  function poklopac(p) {
    const { w, d, r, t, lidT, lipT, lipH, tol } = p;
    const st = Math.min(0.6, lidT / 2);
    let lid = rrect(w, d, r).extrude(lidT - st);
    lid = uni(lid, rrect(w - 2 * st, d - 2 * st, Math.max(0, r - st)).translate([st, st]).extrude(st).translate([0, 0, lidT - st]));
    const iw = w - 2 * t, id = d - 2 * t;
    const ri = Math.max(0, r - t);
    const outer = rrect(iw - 2 * tol, id - 2 * tol, Math.max(0, ri - tol)).translate([t + tol, t + tol]);
    const inner = outer.offset(-lipT, 'Round', 2.0, SEG);
    lid = uni(lid, sub(outer, inner).extrude(lipH).translate([0, 0, lidT - 0.01]));
    return lid;
  }

  function izradi(p) {
    const T = telo(p);
    const out = { telo: mesh(T), vol: { telo: T.volume(), poklopac: 0 }, bbox: { telo: bb(T), poklopac: null }, poklopac: null };
    if (p.lid) {
      const L = poklopac(p);
      out.poklopac = mesh(L); out.vol.poklopac = L.volume(); out.bbox.poklopac = bb(L);
    }
    return out;
  }
  return { izradi };
}

export function stlBytes(m) {
  const nt = m.t.length / 3, np = m.np || 3;
  const buf = new ArrayBuffer(84 + nt * 50);
  const dv = new DataView(buf);
  const head = 'Mala 3D fabrika';
  for (let i = 0; i < head.length; i++) dv.setUint8(i, head.charCodeAt(i));
  dv.setUint32(80, nt, true);
  let o = 84;
  const P = (i) => [m.v[i * np], m.v[i * np + 1], m.v[i * np + 2]];
  for (let i = 0; i < nt; i++) {
    const a = P(m.t[3 * i]), b = P(m.t[3 * i + 1]), c = P(m.t[3 * i + 2]);
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    for (const f of [nx, ny, nz, ...a, ...b, ...c]) { dv.setFloat32(o, f, true); o += 4; }
    dv.setUint16(o, 0, true); o += 2;
  }
  return new Uint8Array(buf);
}
