// 3MF izvoz (standardni 3MF, otvara se u Bambu Studio / OrcaSlicer / PrusaSlicer).
// parts: [{ name, mesh: {v, t, np}, x, y }]: x, y je pomeraj na ploči (donji levi ugao dela), z = 0.

const esc = (s) => String(s).replace(/[<>&"]/g, '_');

export function modelXml(parts) {
  const L = [];
  L.push('<?xml version="1.0" encoding="UTF-8"?>');
  L.push('<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">');
  L.push('<metadata name="Application">Mala 3D fabrika</metadata>');
  L.push('<resources>');
  parts.forEach((p, i) => {
    const m = p.mesh, np = m.np || 3, nv = m.v.length / np;
    L.push(`<object id="${i + 1}" name="${esc(p.name)}" type="model"><mesh><vertices>`);
    const vs = new Array(nv);
    for (let k = 0; k < nv; k++) vs[k] = `<vertex x="${+m.v[k * np].toFixed(3)}" y="${+m.v[k * np + 1].toFixed(3)}" z="${+m.v[k * np + 2].toFixed(3)}"/>`;
    L.push(vs.join(''));
    let mnx = Infinity, mny = Infinity;
    for (let k = 0; k < nv; k++) { mnx = Math.min(mnx, m.v[k * np]); mny = Math.min(mny, m.v[k * np + 1]); }
    p._tx = p.x - mnx; p._ty = p.y - mny;   // dno-levi ugao dela na zadatu poziciju na ploči
    L.push('</vertices><triangles>');
    const ts = new Array(m.t.length / 3);
    for (let k = 0; k < ts.length; k++) ts[k] = `<triangle v1="${m.t[3 * k]}" v2="${m.t[3 * k + 1]}" v3="${m.t[3 * k + 2]}"/>`;
    L.push(ts.join(''));
    L.push('</triangles></mesh></object>');
  });
  L.push('</resources><build>');
  parts.forEach((p, i) => L.push(`<item objectid="${i + 1}" transform="1 0 0 0 1 0 0 0 1 ${+p._tx.toFixed(3)} ${+p._ty.toFixed(3)} 0"/>`));
  L.push('</build></model>');
  return L.join('\n');
}

const CT = '<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>';
const RELS = '<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>';

export async function threeMF(JSZipCtor, parts) {
  const z = new JSZipCtor();
  z.file('[Content_Types].xml', CT);
  z.file('_rels/.rels', RELS);
  z.file('3D/3dmodel.model', modelXml(parts));
  return z.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

// Slaganje delova na ploče (police), razmak 5 mm od ivice i između delova.
// items: [{ name, mesh, w, d }] -> [[{ name, mesh, x, y }]] (jedna lista po ploči)
export function slozi(items, bed = 256, gap = 5, margin = 4) {
  const list = items.slice().sort((a, b) => b.d - a.d || b.w - a.w);
  const plates = [];
  let cur = null;
  const novaPloca = () => { cur = { rows: [], y: margin, parts: [] }; plates.push(cur); };
  novaPloca();
  for (const it of list) {
    let placed = false;
    for (let tries = 0; tries < 2 && !placed; tries++) {
      for (const row of cur.rows) {
        if (row.x + it.w + margin <= bed && row.y + it.d + margin <= bed) {
          cur.parts.push({ ...it, x: row.x, y: row.y }); row.x += it.w + gap; row.h = Math.max(row.h, it.d); placed = true; break;
        }
      }
      if (placed) break;
      const ny = cur.rows.length ? cur.y : margin;
      if (ny + it.d + margin <= bed && margin + it.w + margin <= bed) {
        const row = { x: margin + it.w + gap, y: ny, h: it.d };
        cur.rows.push(row); cur.y = ny + it.d + gap; cur.parts.push({ ...it, x: margin, y: ny }); placed = true;
      } else if (cur.parts.length) { novaPloca(); }
      else { cur.parts.push({ ...it, x: margin, y: margin, preveliko: true }); placed = true; }
    }
  }
  return plates.map((p) => p.parts);
}
