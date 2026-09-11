import { Worker } from 'node:worker_threads';

export async function readDocument(bytes, type, signal) {
  signal?.throwIfAborted();
  if (!['pdf', 'docx'].includes(type) || bytes.length > 2 * 1024 * 1024) throw new Error('Unsupported document or document byte limit exceeded.');
  const worker = new Worker(new URL('./document-worker.js', import.meta.url), {
    workerData: { bytes, type }, resourceLimits: { maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 32 },
    stdout: true, stderr: true, env: {},
  });
  // Parser diagnostics can contain source content; never forward them to logs.
  worker.stdout.resume(); worker.stderr.resume();
  let timer, onAbort;
  try {
    return await new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Document extraction timed out.')), 15000);
      onAbort = () => reject(new Error('Document extraction cancelled.'));
      signal?.addEventListener('abort', onAbort, { once: true });
      if (signal?.aborted) { onAbort(); return; }
      worker.once('message', result => result.ok ? resolve(result.content) : reject(new Error('Document text could not be extracted within the supported format and limits.')));
      worker.once('error', () => reject(new Error('Document extraction failed within the allowed resources.')));
      worker.once('exit', () => reject(new Error('Document reader stopped before extraction completed.')));
    });
  } finally {
    clearTimeout(timer); signal?.removeEventListener('abort', onAbort);
    await worker.terminate();
  }
}
