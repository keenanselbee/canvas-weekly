import { _electron as electron } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { weeklyAcceptanceFixture, weeklyAcceptanceCriteria } from './weekly-acceptance-fixture.mjs';
import { plannerEvidence, renderEvidencePack } from '../src/evidence-pack.js';
import { renderMarkdown } from '../src/guide.js';
import { renderHtml } from '../src/guide-html.js';
import { buildStudyPlan } from '../src/study-plan.js';

if (process.argv.length !== 3 || !['--prepare', '--live'].includes(process.argv[2])) throw new Error('Use --prepare for offline review files or --live for one real AI run with fictional course data.');
const live = process.argv[2] === '--live';
const root = path.resolve(import.meta.dirname, '..');
const planner = path.join(root, '.local/app/planner');
await fs.mkdir(path.join(root, '.codex-temp'), { recursive: true });
const directory = await fs.mkdtemp(path.join(root, '.codex-temp/weekly-acceptance-'));
const guide = weeklyAcceptanceFixture();
const evidence = plannerEvidence(guide);
await fs.writeFile(path.join(directory, 'Course Information.md'), renderEvidencePack(guide));
await fs.writeFile(path.join(directory, 'review.md'), '# Full weekly guide acceptance review\n\nFictional data only. Passing the output validator does not prove semantic accuracy. Review the generated guide against every criterion.\n\n'
  + weeklyAcceptanceCriteria.map(text => `- [ ] ${text}`).join('\n') + '\n');
await fs.writeFile(path.join(directory, 'input.json'), JSON.stringify(evidence, null, 2));
console.log(`Acceptance files: ${directory}`);
if (!live) { console.log('Prepared fictional evidence and review criteria. No Canvas or AI calls.'); process.exit(0); }
// Do not migrate old credentials or start sign-in as a side effect of a test.
try { await fs.access(path.join(planner, 'remembered-login.json')); }
catch {
  console.error('Live check not run: sign in to ChatGPT in the development Canvas Weekly app, then retry. Existing legacy credentials were not opened or changed.');
  process.exit(2);
}
const entry = path.join(directory, 'runner.cjs');
await fs.writeFile(entry, "const { app } = require('electron'); app.setPath('userData', __dirname); app.whenReady().then(() => {}); setInterval(() => {}, 1000);\n");
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const application = await electron.launch({ args: [entry], env });
const startedAt = Date.now();
try {
  const result = await application.evaluate(async ({ safeStorage }, { moduleUrl, planner, evidence }) => {
    const require = process.getBuiltinModule('module').createRequire(moduleUrl);
    const { CodexClient } = require('./codex-client.js');
    const client = new CodexClient({ directory: planner, secrets: {
      encrypt: value => { if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows credential protection is unavailable.'); return safeStorage.encryptString(value); },
      decrypt: value => safeStorage.decryptString(value),
    } });
    let toolRequests = 0;
    let lastModelText = '';
    const receive = client.receive;
    client.receive = function (message) {
      if (message.method && message.id !== undefined) toolRequests++;
      if (message.method === 'item/completed' && message.params?.item?.type === 'agentMessage') lastModelText = message.params.item.text;
      return receive.call(this, message);
    };
    try {
      await client.start();
      if (!client.state.connected) return { connected: false };
      try {
        const output = await client.plan(evidence, AbortSignal.timeout(210000), { weekly: true });
        return { connected: true, output, usage: client.state.usage, toolRequests, runtime: client.runtime.source };
      } catch (error) {
        return { connected: true, error: error.message, lastModelText, usage: client.state.usage, toolRequests };
      }
    } finally { await client.stop(); }
  }, { moduleUrl: new URL('../src/codex-client.js', import.meta.url).href, planner, evidence });
  if (!result.connected) { console.error('Live check not run: the saved ChatGPT sign-in could not be restored. Reconnect in the development app.'); process.exitCode = 2; }
  else if (result.error) {
    await fs.writeFile(path.join(directory, 'failed-result.json'), JSON.stringify(result, null, 2));
    console.error('Live planning failed. The local failed-result.json contains the error and any returned fictional guide for review.');
    process.exitCode = 1;
  } else {
    guide.aiGuide = { ...result.output, generatedAt: new Date().toISOString(), preferencesUsed: evidence.studentPreferences };
    guide.priorities = guide.aiGuide.courses.flatMap(course => course.tasks);
    guide.studyPlan = buildStudyPlan(guide);
    await fs.writeFile(path.join(directory, 'Weekly Plan.md'), renderMarkdown(guide));
    await fs.writeFile(path.join(directory, 'Weekly Plan.html'), renderHtml(guide));
    const report = { schemaValidated: true, semanticReview: 'pending', durationSeconds: Math.round((Date.now() - startedAt) / 1000), courseCount: result.output.courses.length,
      taskCount: guide.priorities.length, usage: result.usage, toolRequests: result.toolRequests, runtime: result.runtime };
    await fs.writeFile(path.join(directory, 'result.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
    if (result.toolRequests) throw new Error('The model requested a tool. The client rejected it; acceptance review failed.');
    console.log('Real model output validated. Review Weekly Plan.md against review.md before recording a quality pass. No Canvas requests were made.');
  }
} finally { await application.close(); }
