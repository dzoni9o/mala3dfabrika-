// Računski deo: radi u Web Worker-u (ili u glavnoj niti ako worker nije dostupan).
import Module from './lib/manifold.js';
import opentype from './lib/opentype.module.js';
import { makeEngine, Nepodrzano } from './lamp.js';

export const FONTOVI = {
  dancing: ['DancingScript-Bold.ttf', 'Dancing Script', 'rukopisni, spoj slova'],
  pacifico: ['Pacifico-Regular.ttf', 'Pacifico', 'debeli rukopisni'],
  lobster: ['Lobster-Regular.ttf', 'Lobster', 'rukopisni, klasičan'],
  comfortaa: ['Comfortaa-Bold.ttf', 'Comfortaa', 'zaobljen, štampani'],
  nunito: ['Nunito-Black.ttf', 'Nunito', 'zaobljen, debeo'],
  baloo: ['Baloo2-Bold.ttf', 'Baloo 2', 'zaobljen, veseo'],
  poppins: ['Poppins-Bold.ttf', 'Poppins', 'geometrijski'],
  montserrat: ['Montserrat-Bold.ttf', 'Montserrat', 'moderan, čist'],
};

export function createHost() {
  let eng = null;
  const fonts = {};
  const ready = (async () => {
    const mf = await Module({ locateFile: () => new URL('./lib/manifold.wasm', import.meta.url).href });
    mf.setup();
    eng = makeEngine(mf);
  })();

  async function loadFont(key) {
    if (!fonts[key]) {
      const r = await fetch(new URL('./fonts/' + FONTOVI[key][0], import.meta.url));
      if (!r.ok) throw new Error('ne mogu da učitam font');
      fonts[key] = opentype.parse(await r.arrayBuffer());
    }
    return fonts[key];
  }

  async function run({ tekst, mode, font, params }) {
    await ready;
    const f = await loadFont(font);
    const rez = [];
    if (mode === 'posebno') {
      for (const ch of [...tekst].filter((c) => !/\s/.test(c))) rez.push(eng.izradi(f, ch, params));
    } else {
      rez.push(eng.izradi(f, tekst, params));
    }
    return rez;
  }
  return { run, ready };
}

export { Nepodrzano };
