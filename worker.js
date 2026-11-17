import { createHost, Nepodrzano } from './host.js';
const host = createHost();
host.ready.then(() => postMessage({ ready: true })).catch((e) => postMessage({ fatal: String(e && e.message || e) }));
onmessage = async (e) => {
  const { id } = e.data;
  try {
    const res = await host.run(e.data);
    postMessage({ id, ok: true, res });
  } catch (err) {
    postMessage({ id, ok: false, msg: String(err && err.message || err), nep: err instanceof Nepodrzano });
  }
};
