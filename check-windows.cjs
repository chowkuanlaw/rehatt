'use strict';
const { NativeWorker } = require('./ai-monitor-main.cjs');
const { observe, PROVIDERS } = require('./ai-monitor-model.cjs');
async function check(worker, write = console.log) {
  const result = await worker.request('windows');
  if (!result?.ok) throw new Error(result?.error || 'Windows connection not available.');
  write('✓ Windows connection started.');
  let identified = 0, readable = 0;
  for (const target of result.windows || []) {
    let snapshot;
    try { snapshot = await worker.request('read', { target }); }
    catch { write('A window is not responding. Restore the window and try again.'); continue; }
    if (!Object.hasOwn(PROVIDERS, snapshot?.provider || '')) continue;
    identified++;
    const observation = observe(snapshot, snapshot.provider);
    const name = PROVIDERS[snapshot.provider].name;
    if (!observation.valid) {
      write(name + ': not readable. ' + (observation.login ? 'Log in first.' : snapshot.truncated ? 'Too much or incomplete window information.' : 'Keep the right chat visible in its own window.'));
      continue;
    }
    readable++;
    write(name + ': ' + (observation.composer ? 'input field found' : 'busy button found') +
      ' · AI message ' + (observation.assistant ? 'found' : 'not found yet') +
      ' · completion ' + (observation.completed ? 'found' : 'not found yet'));
  }
  if (!identified) write('No readable ChatGPT or Claude window yet. Open your chat in its own window and run this check again.');
  else if (readable) write('Now connect that chat in Kopi Island. Then test a question, a finished answer and a reply from the island.');
  write('This check sends nothing and shows no chat content. Test real sending and notifications separately.');
  return { identified, readable };
}
if (require.main === module) {
  const worker = new NativeWorker();
  check(worker).catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => worker.close());
}
module.exports = { check };
