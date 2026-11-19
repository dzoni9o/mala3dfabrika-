// Čarobnjak: 4 koraka, običan jezik. Ne zna ništa o rasporedu, samo skuplja odgovore.
const NAMENE = [
  ['sitnice', 'Sitnice i pribor', 'Mnogo malih kutijica u mreži.'],
  ['alat', 'Alat i šrafovi', 'Nekoliko malih pozadi i dve veće napred.'],
  ['sam', 'Sam ću rasporediti', 'Počinje jedna kutijica, ti je deliš.'],
];
const STAMPACI = [
  [256, 'Bambu Lab A1', 'ploča 256 mm'],
  [180, 'Bambu Lab A1 mini', 'ploča 180 mm'],
  [220, 'Ne znam', 'bezbedno za većinu štampača (220 mm)'],
  [350, 'Veliki štampač', 'ploča 350 mm'],
];
const OBLICI = [
  ['ravne', 'Ravne', 'Obične pravougaone kutijice.'],
  ['kose', 'Kose sa rubom', 'Šire se ka vrhu, ima rub. Lepše izgleda.'],
  ['zlebovi', 'Kose sa žlebovima', 'Isto, plus uspravni žlebovi na zidovima.'],
];

const DRAWER = `<svg viewBox="0 0 320 190" class="wz-draw" aria-hidden="true">
  <g fill="none" stroke="#9a9a90" stroke-width="2">
    <path d="M40 70 L200 70 L270 30 L110 30 Z"/><path d="M40 70 L40 150 L200 150 L200 70"/><path d="M200 150 L270 110 L270 30"/>
  </g>
  <g stroke="#eaff00" stroke-width="2" fill="#eaff00" font-family="Space Mono,monospace" font-size="13">
    <path d="M40 168 L200 168 M40 163 L40 173 M200 163 L200 173" fill="none"/><text x="120" y="184" text-anchor="middle" stroke="none">širina</text>
    <path d="M214 150 L270 117 M214 146 L210 154 M270 113 L266 121" fill="none"/><text x="262" y="142" stroke="none">dubina</text>
    <path d="M22 70 L22 150 M17 70 L27 70 M17 150 L27 150" fill="none"/><text x="14" y="115" text-anchor="end" stroke="none">visina</text>
  </g></svg>`;

export function initWizard(root, { onDone, onSkip, start }) {
  let step = 0;
  const A = { W: 300, D: 200, H: 60, bed: 220, namena: 'sitnice', cvrsto: true, oblik: 'kose', lids: false, ...start };
  const N = 4;
  const cards = (list, key, cur, fmt) => `<div class="wz-cards">${list.map(([v, t, d]) =>
    `<button type="button" class="wz-card" data-k="${key}" data-v="${v}" aria-pressed="${String(v === cur)}"><b>${t}</b><span>${d}</span></button>`).join('')}</div>`;
  const body = [
    () => `<h2>Koliko je mesta?</h2>
      <p class="wz-sub">Izmeri unutra fioku ili policu, od zida do zida.</p>${DRAWER}
      <div class="wz-row">
        ${[['W', 'Širina'], ['D', 'Dubina'], ['H', 'Visina']].map(([k, t]) => `<label>${t}<span class="in"><input type="number" inputmode="decimal" step="any" data-n="${k}" value="${A[k]}"><span class="u">mm</span></span></label>`).join('')}
      </div>
      <p class="wz-sub">Visina je koliko visoko kutijice smeju da budu.</p>`,
    () => `<h2>Šta ćeš da držiš u njima?</h2><p class="wz-sub">Izaberi, sve možeš da promeniš posle.</p>${cards(NAMENE, 'namena', A.namena)}`,
    () => `<h2>Šta imaš za štampu?</h2>${cards(STAMPACI, 'bed', A.bed)}
      <h3>Kako da budu?</h3>${cards([[true, 'Čvrste', 'Deblji zidovi, izdržljive.'], [false, 'Štedljive', 'Tanji zidovi, brže i manje plastike.']], 'cvrsto', A.cvrsto)}`,
    () => `<h2>Kako da izgledaju?</h2>${cards(OBLICI, 'oblik', A.oblik)}
      <h3>Poklopci?</h3>${cards([[false, 'Bez poklopaca', 'Otvorene kutijice.'], [true, 'Sa poklopcima', 'Svaka dobija poklopac.']], 'lids', A.lids)}`,
  ];
  function valid() {
    if (step !== 0) return true;
    return [A.W, A.D, A.H].every((x) => Number.isFinite(x) && x >= 20);
  }
  function render() {
    root.innerHTML = `<div class="wz-card-wrap" role="dialog" aria-modal="true" aria-label="Čarobnjak">
      <div class="wz-top"><div class="wz-dots">${Array.from({ length: N }, (_, i) => `<i class="${i === step ? 'on' : i < step ? 'done' : ''}"></i>`).join('')}</div><span class="wz-n">Korak ${step + 1} od ${N}</span></div>
      <div class="wz-body">${body[step]()}</div>
      <div class="wz-nav">
        ${step > 0 ? '<button type="button" class="mini" data-nav="back">← Nazad</button>' : onSkip ? '<button type="button" class="mini" data-nav="skip">Preskoči</button>' : '<span></span>'}
        <button type="button" class="btn" data-nav="next" ${valid() ? '' : 'disabled'}>${step === N - 1 ? 'Napravi kutijice' : 'Dalje →'}</button>
      </div></div>`;
    const first = root.querySelector('input,[aria-pressed=true]'); if (first && step === 0) first.focus({ preventScroll: true });
  }
  root.addEventListener('input', (e) => {
    const k = e.target.dataset && e.target.dataset.n; if (!k) return;
    A[k] = parseFloat(String(e.target.value).replace(',', '.'));
    const nx = root.querySelector('[data-nav=next]'); if (nx) nx.disabled = !valid();
  });
  root.addEventListener('click', (e) => {
    const c = e.target.closest('.wz-card'); const nv = e.target.closest('[data-nav]');
    if (c) {
      const k = c.dataset.k; const raw = c.dataset.v;
      A[k] = raw === 'true' ? true : raw === 'false' ? false : /^\d+$/.test(raw) ? +raw : raw;
      root.querySelectorAll(`.wz-card[data-k="${k}"]`).forEach((x) => x.setAttribute('aria-pressed', String(x === c)));
      return;
    }
    if (!nv) return;
    const w = nv.dataset.nav;
    if (w === 'back') { step--; render(); }
    else if (w === 'skip') { root.hidden = true; onSkip(); }
    else if (w === 'next' && valid()) { if (step < N - 1) { step++; render(); } else { root.hidden = true; onDone({ ...A }); } }
  });
  return { open(v) { Object.assign(A, v || {}); step = 0; root.hidden = false; render(); } };
}
