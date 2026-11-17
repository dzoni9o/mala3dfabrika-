// Mala 3D fabrika: generator slova-lampi (JavaScript port Python generatora).
// Geometrija: manifold-3d (WASM). Fontovi: opentype.js.

export const DEFAULTS = {
  visina: 150, dubina: 20, zid_bocni: 3.6, zid_zadnji: 1.6, difuzor: 1.2, zazor: 0.1,
  podebljanje: 3, rupa: 12, rupa_dodatak: 0.2, glava_r: 7.5, slobodan_r: 8,
  zub_duzina: 4, zub_sirina: 1, zub_razmak: 30,
  postolje_visina: 25, postolje_dubina: 85, postolje_ivica: 14,
  sirina_stope: 50, tlo_dodatak: 2, min_ulaz: 8, ispod_dna: 1, tol: 0.2, sto_max: 250,
  razmak: 0, most: 1.5, max_deo: 230, rupa_iznad: 14, zica_rupa: 4,
};
export const LAGANO = { zid_bocni: 2.0, dubina: 18, postolje_visina: 16, postolje_dubina: 50, postolje_ivica: 10 };

export class Nepodrzano extends Error {}

const SEG = 48;

export function makeEngine(mf) {
  const CS = mf.CrossSection, M = mf.Manifold;

  // ---------------------------------------------------------------- pomocne
  const bnd = (cs) => { const b = cs.bounds(); return [b.min[0], b.min[1], b.max[0], b.max[1]]; };
  const rect = (x0, y0, x1, y1) => CS.square([x1 - x0, y1 - y0]).translate([x0, y0]);
  const circ = (r, n = SEG) => CS.circle(r, n);
  const inter = (a, b) => a.intersect(b);
  const sub = (a, b) => a.subtract(b);
  const add = (a, b) => a.add(b);
  const off = (cs, d, join = 'Round') => cs.offset(d, join, 2.0, SEG);
  const sorted = (arr, f) => arr.slice().sort((p, q) => f(p) - f(q));

  function glyphPolys(font, ch) {
    const g = font.charToGlyph(ch);
    if (!g || g.index === 0) throw new Nepodrzano("font nema slovo '" + ch + "'");
    const contours = [];
    let cur = null;
    const steps = 20;
    for (const c of g.path.commands) {
      if (c.type === 'M') cur = [[c.x, c.y]];
      else if (c.type === 'L') cur.push([c.x, c.y]);
      else if (c.type === 'C') {
        const p0 = cur[cur.length - 1];
        for (let i = 1; i <= steps; i++) {
          const t = i / steps, a = (1 - t) ** 3, b = 3 * (1 - t) ** 2 * t, cc = 3 * (1 - t) * t * t, d = t ** 3;
          cur.push([a * p0[0] + b * c.x1 + cc * c.x2 + d * c.x, a * p0[1] + b * c.y1 + cc * c.y2 + d * c.y]);
        }
      } else if (c.type === 'Q') {
        const p0 = cur[cur.length - 1];
        for (let i = 1; i <= steps; i++) {
          const t = i / steps, a = (1 - t) ** 2, b = 2 * (1 - t) * t, d = t * t;
          cur.push([a * p0[0] + b * c.x1 + d * c.x, a * p0[1] + b * c.y1 + d * c.y]);
        }
      } else if (c.type === 'Z') {
        if (cur && cur.length > 2) contours.push(cur);
        cur = null;
      }
    }
    if (cur && cur.length > 2) contours.push(cur);
    if (!contours.length) throw new Nepodrzano("slovo '" + ch + "' nema obris");
    return { contours, adv: g.advanceWidth };
  }

  const shift = (contours, dx) => contours.map((c) => c.map((p) => [p[0] + dx, p[1]]));

  function raspored(font, tekst, razmak) {
    let x = 0, cs = null;
    const centri = [];
    for (const ch of tekst) {
      if (/\s/.test(ch)) throw new Nepodrzano('ime je jedna reč (bez razmaka)');
      const { contours, adv } = glyphPolys(font, ch);
      const part = new CS(shift(contours, x), 'NonZero');
      cs = cs ? add(cs, part) : part;
      centri.push(x + adv / 2);
      x += adv + razmak;
    }
    return { cs, centri };
  }

  // ---------------------------------------------------------------- geometrija
  function nadjiTlo(O, a) {
    const [ox0, oy0, ox1] = bnd(O);
    const cilj = Math.min(a.sirina_stope, 0.5 * (ox1 - ox0));
    let y = oy0 + 0.4;
    while (y < oy0 + 90) {
      const deo = inter(O, rect(ox0 - 1, oy0 - 1, ox1 + 1, y));
      if (!deo.isEmpty()) {
        const b = bnd(deo);
        if (b[2] - b[0] >= cilj) break;
      }
      y += 0.2;
    }
    const tlo = Math.max(y + a.tlo_dodatak, oy0 + a.min_ulaz);
    return tlo;
  }

  function nadjiRupu(C, tlo, xc, a) {
    const yMin = tlo + a.glava_r + a.rupa_iznad;
    const E = inter(off(C, -a.slobodan_r), rect(-2000, yMin, 2000, 2000));
    if (E.isEmpty()) return null;
    const ylow = bnd(E)[1];
    const krug = circ(a.slobodan_r);
    for (let korak = 0; korak < 12; korak++) {
      const yh = ylow + 0.15 + 0.25 * korak;
      const traka = inter(E, rect(-2000, yh - 0.05, 2000, yh + 0.05));
      if (traka.isEmpty()) continue;
      const cand = sorted(traka.decompose().map((d) => { const b = bnd(d); return (b[0] + b[2]) / 2; }),
        (x) => Math.abs(x - xc));
      for (const x of cand) {
        if (sub(krug.translate([x, yh]), C).area() < 1e-3) return [x, yh];
      }
    }
    return null;
  }

  function nadjiZube(C, hx, hy, a) {
    const mala = circ(0.05, 8);
    const malaA = mala.area();
    const unutra = (p) => inter(mala.translate([p[0], p[1]]), C).area() > 0.5 * malaA;
    const rects = [];
    for (const P of C.toPolygons()) {
      const n0 = P.length;
      const Q = P.concat([P[0]]);
      const L = [], cum = [0];
      for (let i = 0; i < n0; i++) {
        const l = Math.hypot(Q[i + 1][0] - Q[i][0], Q[i + 1][1] - Q[i][1]);
        L.push(l); cum.push(cum[i] + l);
      }
      const per = cum[cum.length - 1];
      if (per < 1e-6) continue;
      const poz = (sv) => {
        sv = ((sv % per) + per) % per;
        let lo = 0, hi = cum.length - 1;               // searchsorted(cum, sv, 'right') - 1
        while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] <= sv) lo = mid + 1; else hi = mid; }
        let i = Math.min(lo - 1, L.length - 1);
        if (i < 0) i = 0;
        const t = L[i] > 0 ? (sv - cum[i]) / L[i] : 0;
        return [Q[i][0] + (Q[i + 1][0] - Q[i][0]) * t, Q[i][1] + (Q[i + 1][1] - Q[i][1]) * t];
      };
      const n = Math.max(2, Math.round(per / a.zub_razmak));
      for (let k = 0; k < n; k++) {
        const sv = (k + 0.5) * per / n;
        const pt = poz(sv), pa = poz(sv + 1.5), pb = poz(sv - 1.5);
        let tg = [pa[0] - pb[0], pa[1] - pb[1]];
        const ln = Math.hypot(tg[0], tg[1]);
        if (ln < 1e-9) continue;
        tg = [tg[0] / ln, tg[1] / ln];
        let nr = [-tg[1], tg[0]];
        if (!unutra([pt[0] + nr[0] * 0.4, pt[1] + nr[1] * 0.4])) { nr = [-nr[0], -nr[1]]; tg = [-tg[0], -tg[1]]; }
        if (Math.hypot(pt[0] - hx, pt[1] - hy) < a.slobodan_r + 2.5) continue;
        const h = a.zub_duzina / 2;
        const pts = [
          [pt[0] - tg[0] * h - nr[0] * 0.4, pt[1] - tg[1] * h - nr[1] * 0.4],
          [pt[0] + tg[0] * h - nr[0] * 0.4, pt[1] + tg[1] * h - nr[1] * 0.4],
          [pt[0] + tg[0] * h + nr[0] * a.zub_sirina, pt[1] + tg[1] * h + nr[1] * a.zub_sirina],
          [pt[0] - tg[0] * h + nr[0] * a.zub_sirina, pt[1] - tg[1] * h + nr[1] * a.zub_sirina],
        ];
        rects.push(new CS([pts], 'NonZero'));
      }
    }
    if (!rects.length) return { zubi: new CS([], 'NonZero'), n: 0 };
    let zubi = rects[0];
    for (let i = 1; i < rects.length; i++) zubi = add(zubi, rects[i]);
    return { zubi: inter(zubi, off(C, 0.3)), n: rects.length };
  }

  function mostovi(slovo, a) {
    let rez = slovo, n = 0;
    for (let guard = 0; guard < 40; guard++) {
      const comps = rez.decompose();
      if (comps.length < 2) return { slovo: rez, n };
      let best = null;
      const pts = comps.map((c) => [].concat(...c.toPolygons()));
      for (let i = 0; i < comps.length; i++) {
        for (let j = i + 1; j < comps.length; j++) {
          for (const p of pts[i]) for (const q of pts[j]) {
            const d = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2;
            if (!best || d < best.d) best = { d, p, q };
          }
        }
      }
      let { p, q } = best;
      const len = Math.max(Math.hypot(q[0] - p[0], q[1] - p[1]), 1e-9);
      const u = [(q[0] - p[0]) / len, (q[1] - p[1]) / len];
      p = [p[0] - u[0] * 0.8, p[1] - u[1] * 0.8];
      q = [q[0] + u[0] * 0.8, q[1] + u[1] * 0.8];
      const nn = [-u[1] * a.most / 2, u[0] * a.most / 2];
      rez = add(rez, new CS([[[p[0] + nn[0], p[1] + nn[1]], [q[0] + nn[0], q[1] + nn[1]],
        [q[0] - nn[0], q[1] - nn[1]], [p[0] - nn[0], p[1] - nn[1]]]], 'NonZero'));
      n++;
    }
    throw new Nepodrzano('previše odvojenih delova');
  }

  const jedna = (cs) => cs.decompose().length === 1;

  function najdiRez(Oc, Cc, prethodni, cilj, prozori, ostalo, maxDeo) {
    const bx1 = bnd(Oc)[2];
    for (const prozor of prozori) {
      let best = null;
      for (let x = cilj - prozor; x <= cilj + prozor + 1e-9; x += 1.0) {
        if (x - prethodni > maxDeo || bx1 - x > ostalo * maxDeo || x - prethodni < 20) continue;
        const L = inter(Cc, rect(x - 0.25, -1e4, x + 0.25, 1e4)).area() / 0.5;
        const key = L + 0.05 * Math.abs(x - cilj);
        if (best && key >= best[0]) continue;
        const levo = inter(Oc, rect(prethodni, -1e4, x, 1e4));
        const desno = inter(Oc, rect(x, -1e4, 1e4, 1e4));
        if (levo.isEmpty() || desno.isEmpty() || !(jedna(levo) && jedna(desno))) continue;
        best = [key, x];
      }
      if (best) return best[1];
    }
    throw new Nepodrzano('ne mogu da nađem mesto reza gde delovi ostaju povezani; probaj veći najveći deo ili razmak slova');
  }

  // ---------------------------------------------------------------- cela reč (ili jedno slovo)
  function izgradiRec(raw, a, podeb) {
    const m = podeb + a.zid_bocni;
    const [x0, y0, , y1] = bnd(raw);
    const s = (a.visina - 2 * m) / (y1 - y0);
    if (s <= 0) throw new Nepodrzano('visina je premala za ovo podebljanje');
    let slovo = raw.translate([-x0, -y0]).scale([s, s]);
    const mm = mostovi(slovo, a);
    slovo = mm.slovo;
    const core = off(slovo, podeb);
    const C = core.translate([0, m]);
    const O = off(core, a.zid_bocni).translate([0, m]);

    const komadi = [];
    const Ocs = sorted(O.decompose(), (c) => bnd(c)[0]);
    Ocs.forEach((Oc, ci) => {
      const [bx0, , bx1] = bnd(Oc);
      const Cc = inter(C, Oc);
      const W = bx1 - bx0;
      const n = Math.ceil(W / a.max_deo - 1e-9);
      const rezovi = [];
      let prev = bx0;
      for (let k = 1; k < n; k++) {
        const cut = najdiRez(Oc, Cc, prev, bx0 + k * W / n, [0.15 * W / n, 0.3 * W / n, 0.5 * W / n], n - k, a.max_deo);
        rezovi.push(cut); prev = cut;
      }
      const g = [-1e4, ...rezovi, 1e4];
      for (let k = 0; k < n; k++) {
        const slab = rect(g[k], -1e4, g[k + 1], 1e4);
        komadi.push({ O: inter(Oc, slab), C: inter(Cc, slab), celina: ci, rez_l: k > 0, rez_d: k < n - 1, xa: g[k], xb: g[k + 1] });
      }
    });
    for (const k of komadi) if (k.C.isEmpty()) throw new Nepodrzano('prazan deo posle rezanja');

    for (const k of komadi) k.tlo = nadjiTlo(k.O, a);
    const T = Math.max(...komadi.map((k) => k.tlo));
    const Y0 = T - (a.postolje_visina - 6.0);
    for (const k of komadi) {
      const ploca = rect(-1e4, Y0, 1e4, 1e4);
      k.O = inter(k.O, ploca); k.C = inter(k.C, ploca);
      if (k.O.isEmpty() || k.C.isEmpty()) throw new Nepodrzano('deo je ceo ispod nivoa postolja; povećaj visinu postolja');
    }
    for (const k of komadi) {
      const [ox0, oy0, ox1] = bnd(k.O);
      const deo = inter(k.O, rect(ox0 - 1, oy0 - 1, ox1 + 1, T));
      const b = bnd(deo);
      k.xl = b[0]; k.xr = b[2]; k.oy0 = oy0;
      k.bar = rect(k.xl, oy0 - a.ispod_dna, k.xr, T);
      if (add(k.O, k.bar).decompose().length > 1) throw new Nepodrzano('deo ima odvojene delove koji ne dodiruju postolje');
    }
    komadi.sort((p, q) => (p.xl - q.xl) || (p.xr - q.xr));
    for (let i = 0; i + 1 < komadi.length; i++) {
      if (komadi[i].xr > komadi[i + 1].xl + 1e-6) throw new Nepodrzano('stope dva dela se preklapaju (probaj veći razmak slova)');
    }

    let najbolja = null;
    komadi.forEach((k, i) => {
      const r = nadjiRupu(k.C, T, (k.xl + k.xr) / 2, a);
      if (r && (!najbolja || r[1] < najbolja[2] - 1e-6)) najbolja = [i, r[0], r[1]];
    });
    if (!najbolja) return null;
    const [si, hx, hy] = najbolja;
    komadi[si].rupa = [hx, hy];

    const celine = [...new Set(komadi.map((k) => k.celina))].sort((p, q) => p - q);
    const a2 = { ...a, glava_r: a.zica_rupa / 2, rupa_iznad: 5.0, slobodan_r: a.zica_rupa / 2 + 1.5 };
    if (celine.length > 1) {
      for (const c of celine) {
        if (komadi[si].celina === c) continue;
        let nasao = null;
        komadi.forEach((k, i) => {
          if (k.celina !== c) return;
          const r = nadjiRupu(k.C, T, (k.xl + k.xr) / 2, a2);
          if (r && (!nasao || r[1] < nasao[2])) nasao = [i, r[0], r[1]];
        });
        if (nasao) komadi[nasao[0]].zica = [nasao[1], nasao[2]];
      }
      const Cs = sub(komadi[si].C, circ(a.slobodan_r + a.zica_rupa / 2 + 2).translate([hx, hy]));
      const r = nadjiRupu(Cs, T, hx, a2);
      if (r) komadi[si].zica = r;
    }

    const depth = a.dubina;
    for (const k of komadi) {
      const hs = k.rupa || [1e6, 1e6];
      let { zubi, n: bz } = nadjiZube(k.C, hs[0], hs[1], a);
      if (bz && k.rez_l) zubi = sub(zubi, rect(-1e4, -1e4, k.xa + 4.0, 1e4));
      if (bz && k.rez_d) zubi = sub(zubi, rect(k.xb - 4.0, -1e4, 1e4, 1e4));
      if (bz) zubi = inter(zubi, rect(k.xa, -1e4, k.xb, 1e4));
      if (k.zica && bz) zubi = sub(zubi, circ(a.zica_rupa / 2 + 2.5).translate(k.zica));
      k.zubi = zubi; k.broj_zuba = zubi.isEmpty() ? 0 : bz;
      let telo = M.extrude(add(k.O, k.bar), depth);
      telo = sub(telo, M.extrude(k.C, depth - a.zid_zadnji + 1).translate([0, 0, a.zid_zadnji]));
      if (k.broj_zuba) {
        const h = (depth - a.difuzor) - (a.zid_zadnji - 0.1);
        telo = add(telo, M.extrude(zubi, h).translate([0, 0, a.zid_zadnji - 0.1]));
      }
      if (k.rupa) {
        const d = a.rupa + a.rupa_dodatak;
        telo = sub(telo, M.cylinder(a.zid_zadnji + 2, d / 2, d / 2, 96).translate([hs[0], hs[1], -1]));
      }
      if (k.zica) {
        const d = a.zica_rupa;
        telo = sub(telo, M.cylinder(a.zid_zadnji + 2, d / 2, d / 2, 48).translate([k.zica[0], k.zica[1], -1]));
      }
      const Cd = off(k.C, -a.zazor, 'Miter');
      k.telo = telo;
      k.dif_s = M.extrude(Cd, a.difuzor).translate([0, 0, depth - a.difuzor]);
      k.dif_p = M.extrude(Cd, a.difuzor).rotate([0, 180, 0]).translate([0, 0, a.difuzor]);
    }

    const XL = komadi[0].xl, XR = komadi[komadi.length - 1].xr;
    const iv = a.postolje_ivica, bd = a.postolje_dubina;
    const fp = off(rect(XL, depth / 2 - bd / 2 + iv, XR, depth / 2 + bd / 2 - iv), iv);
    const dubinaProreza = Math.max(...komadi.map((k) => T - (k.oy0 - a.ispod_dna - a.tol) + 1));
    const baseH = Math.max(a.postolje_visina, dubinaProreza + 4.0);
    const gr = [-1e4];
    for (let i = 0; i + 1 < komadi.length; i++) gr.push((komadi[i].xr + komadi[i + 1].xl) / 2);
    gr.push(1e4);
    komadi.forEach((k, i) => {
      const blok = M.extrude(inter(fp, rect(gr[i], -1e4, gr[i + 1], 1e4)), baseH);
      const slot2d = rect(k.xl - a.tol, k.oy0 - a.ispod_dna - a.tol, k.xr + a.tol, T + 1);
      let slot = M.extrude(slot2d, depth + 2 * a.tol).translate([0, 0, -(depth + a.tol)]);
      slot = slot.rotate([90, 0, 0]).translate([0, 0, baseH - T]);
      k.blok = sub(blok, slot);
      const uP = k.telo.rotate([90, 0, 0]).translate([0, depth, baseH - T]);
      k.pr = {
        telo_postolje: Math.abs(inter(uP, k.blok).volume()),
        difuzor_telo: Math.abs(inter(k.dif_s, k.telo).volume()),
      };
      if (k.rupa) {
        const glava = M.cylinder(6, a.glava_r, a.glava_r, 64).translate([hx, hy, -6]);
        const gp = glava.rotate([90, 0, 0]).translate([0, depth, baseH - T]);
        k.pr.glava_postolje = Math.abs(inter(gp, k.blok).volume());
        k.pr.razmak_glave = hy - a.glava_r - T;
      }
    });
    return { komadi, T, baseH, O, C, XL, XR, podeb, mostovi: mm.n, rupa: [hx, hy], si, celine: celine.length };
  }

  // ---------------------------------------------------------------- javni ulaz
  /** Računa jedno ime (spojeno) ili jedno slovo. Vraća ravne podatke (bez WASM objekata). */
  function izradi(font, tekst, a) {
    tekst = tekst.trim();
    if (!tekst) throw new Nepodrzano('upiši slovo ili ime');
    let podeb = a.podebljanje, r = null, rasp = null, sc = 1, x0r = 0;
    for (let i = 0; i < 9; i++) {
      const m = podeb + a.zid_bocni;
      const b0 = bnd(raspored(font, tekst, 0).cs);
      const s = (a.visina - 2 * m) / (b0[3] - b0[1]);
      rasp = raspored(font, tekst, a.razmak / s);
      r = izgradiRec(rasp.cs, a, podeb);
      if (r) { sc = s; x0r = bnd(rasp.cs)[0]; break; }
      podeb += 0.5;
    }
    if (!r) throw new Nepodrzano('nigde u kanalu ne staje utičnica; probaj deblji font ili veće podebljanje');
    const chars = [...tekst];
    const xs = rasp.centri.map((c) => (c - x0r) * sc);
    const out = { tekst, podeb: r.podeb, T: r.T, baseH: r.baseH, XL: r.XL, XR: r.XR, mostovi: r.mostovi,
      celine: r.celine, rupa: r.rupa, si: r.si, O: r.O.toPolygons(), C: r.C.toPolygons(), delovi: [], a: { ...a } };
    r.komadi.forEach((k, i) => {
      const bb = bnd(k.O);
      const slova = chars.filter((c, j) => xs[j] >= bb[0] - 1e-6 && xs[j] <= bb[2] + 1e-6).join('');
      const sx = -(k.xl + k.xr) / 2;
      const mesh = (man, tr) => {
        const mm = tr ? man.translate([sx, 0, 0]) : man;
        const g = mm.getMesh();
        return { v: new Float32Array(g.vertProperties), t: new Uint32Array(g.triVerts), np: g.numProp };
      };
      const dep = a.dubina, baseH = r.baseH, T = r.T;
      const stand = (man) => man.rotate([90, 0, 0]).translate([0, dep, baseH - T]);
      out.delovi.push({
        br: i + 1, slova, sx, rez_l: k.rez_l, rez_d: k.rez_d, xa: k.xa, xb: k.xb, xl: k.xl, xr: k.xr, oy0: k.oy0,
        rupa: k.rupa || null, zica: k.zica || null, broj_zuba: k.broj_zuba,
        O: k.O.toPolygons(), C: k.C.toPolygons(), zubi: k.zubi.toPolygons(),
        telo: mesh(k.telo, true), difuzor: mesh(k.dif_p, true), postolje: mesh(k.blok, true),
        // sklopljeno (za 3D prikaz): koordinate cele reči
        r_telo: mesh(k.telo, false), r_dif: mesh(k.dif_s, false), r_pos: mesh(stand(k.blok), false),
        bbox_telo: (() => { const b = k.telo.boundingBox(); return [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]]; })(),
        bbox_pos: (() => { const b = k.blok.boundingBox(); return [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]]; })(),
        vol: { telo: k.telo.volume(), difuzor: k.dif_p.volume(), postolje: k.blok.volume() },
        pr: k.pr,
      });
    });
    return out;
  }

  return { izradi, bnd };
}

// ---------------------------------------------------------------- STL
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
