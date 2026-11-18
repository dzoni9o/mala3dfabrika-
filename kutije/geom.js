// Geometrija kutijice i poklopca (manifold-3d). Kutijica se štampa na dnu, poklopac pločom nadole (usna gore).
// Koordinate: x 0..w, y 0..d (y = 0 je prednja strana), z 0..visina.

const SEG = 48;

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

  function telo(p) {
    const { w, d, h, lid, handle, front, cx, cy, r, t, f, td, lidT, lipH } = p;
    const hb = lid ? h - lidT : h;
    let body = rrect(w, d, r).extrude(hb);
    const iw = w - 2 * t, id = d - 2 * t;
    const cw = (iw - (cx - 1) * td) / cx, ch = (id - (cy - 1) * td) / cy;
    const ri = Math.max(0, Math.min(r - t, cw / 2 - 0.01, ch / 2 - 0.01));
    let cav = null;
    for (let i = 0; i < cx; i++) for (let j = 0; j < cy; j++) {
      const c = rrect(cw, ch, ri).translate([t + i * (cw + td), t + j * (ch + td)]);
      cav = cav ? uni(cav, c) : c;
    }
    body = sub(body, cav.extrude(hb - f + 1).translate([0, 0, f]));
    if (lid) {
      // vrhovi pregrada niži od usne poklopca
      const open = rrect(iw, id, Math.max(0, r - t)).translate([t, t]).extrude(lipH + 1.5).translate([0, 0, hb - lipH - 0.5]);
      body = sub(body, open);
    }
    if (handle === 'rupa') {
      if (lid) {
        const zc = Math.max(f + 8, Math.min(hb - 9, hb / 2));
        body = sub(body, cylY(7, t + 1.5, w / 2, -1, zc));
      } else {
        const nw = 16, z0 = hb - Math.min(12, hb - f - 2), zc = z0 + nw / 2;
        const cut = M.cube([nw, t + 1.5, hb - zc + 1]).translate([w / 2 - nw / 2, -1, zc]);
        body = sub(body, uni(cut, cylY(nw / 2, t + 1.5, w / 2, -1, zc)));
      }
    }
    if (handle === 'rucka' && front) {
      const tw = 20, out = 6, th = 1.6;
      const prof = new CS([[[0.6, hb], [-out, hb], [-out, hb - th], [0.6, hb - th - out - 0.6]]], 'NonZero');
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
