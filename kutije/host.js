// Računski deo: radi u Web Worker-u (ili u glavnoj niti ako worker nije dostupan).
import Module from '../lib/manifold.js';
import { makeEngine } from './geom.js';

export function createHost() {
  let eng = null;
  const ready = (async () => {
    const mf = await Module({ locateFile: () => new URL('../lib/manifold.wasm', import.meta.url).href });
    mf.setup();
    eng = makeEngine(mf);
  })();
  // jobs: [{ key, p }] -> [{ key, res }]
  async function run({ jobs }) {
    await ready;
    return jobs.map((j) => ({ key: j.key, res: eng.izradi(j.p) }));
  }
  return { run, ready };
}
