/* ==========================================================================
   run-all.mjs — one command for the whole suite.

   The suites share a port and several of them only mean anything against a
   particular server state (a hosted coach present, absent, or configured but
   refusing), so the runner owns the server: it starts one per state, runs the
   suites that belong to it, and shuts it down again. Running them by hand
   against whichever server happened to be up is how a green run stops meaning
   anything.

   Run: node tools/run-all.mjs
   ========================================================================== */
import { spawn } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const PORT = Number(process.env.PORT || 8777);

/* Each group is [server mode, suites…]. '' means no hosted coach at all. */
const GROUPS = [
  ['1', ['e2e', 'e2e2', 'e2e3', 'e2e4', 'e2e5', 'e2e6', 'e2e8', 'e2e9', 'e2e11']],
  ['1', ['e2e7', 'e2e10']],
  ['', ['e2e7']],
  ['fail', ['e2e10']]
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* A server left running from an earlier session answers on this port in
   whatever mode it was started with, and every suite then silently tests the
   wrong thing — which reads as a string of real failures. Refuse to start. */
async function portIsFree() {
  try {
    await fetch(`http://localhost:${PORT}/index.html`, { signal: AbortSignal.timeout(1500) });
    return false;
  } catch {
    return true;
  }
}

async function withServer(mode, fn) {
  const srv = spawn('node', [path.join(ROOT, 'tools/serve.mjs'), String(PORT)], {
    cwd: ROOT,
    env: { ...process.env, COACH: mode },
    stdio: 'ignore'
  });
  /* Wait for it to actually answer — a fixed sleep turns a slow start into a
     mysterious first-suite failure. */
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://localhost:${PORT}/index.html`);
      if (res.ok) break;
    } catch { /* not up yet */ }
    await sleep(150);
  }
  try {
    return await fn();
  } finally {
    srv.kill('SIGTERM');
    await sleep(300);
  }
}

/**
 * Run a suite and return everything it printed. Collecting the streams as they
 * arrive, rather than with execFileSync, is what makes a suite that dies
 * halfway still hand back the line that says why.
 */
function run(cmd, args, mode) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: ROOT, env: { ...process.env, COACH: mode } });
    let out = '';
    const kill = setTimeout(() => child.kill('SIGKILL'), 240000);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('error', (e) => { out += `FATAL could not start: ${e.message}`; });
    /* 'exit', not 'close': Playwright leaves a browser process holding the
       inherited stdio pipes for a moment after the suite itself is gone, and
       waiting for those to close hangs until the timeout fires — which looks
       exactly like a suite that failed. */
    child.on('exit', (code) => {
      clearTimeout(kill);
      setTimeout(() => resolve({ out, code }), 80);
    });
  });
}

const label = (suite, mode) => `${suite}${mode === '1' ? '' : mode === '' ? ' (no coach)' : ` (coach ${mode})`}`;

if (!(await portIsFree())) {
  console.error(`Something is already serving on port ${PORT}. Stop it first — otherwise these suites test whatever it is serving, not what they mean to.`);
  process.exit(2);
}

let failed = 0;

/* The coach function's own unit checks need no browser and no server. */
{
  const { out, code } = await run('node', [path.join(ROOT, 'tools/fn-test.mjs')], '');
  const ok = code === 0;
  if (!ok) failed++;
  console.log(`${'fn-test'.padEnd(22)} ${ok ? 'PASS' : 'FAIL'}`);
  if (!ok) console.log(`  ${(out.split('\n').find((l) => /^(FAIL:|FATAL)/.test(l)) || out.slice(-200)).slice(0, 220)}`);
}

for (const [mode, suites] of GROUPS) {
  await withServer(mode, async () => {
    for (const suite of suites) {
      /* The older suites report by exit code and never print the word PASS,
         so the exit code — not the output — is the verdict. */
      const { out, code } = await run('node', [path.join(ROOT, `tools/${suite}.mjs`)], mode);
      const ok = code === 0;
      if (!ok) failed++;
      console.log(`${label(suite, mode).padEnd(22)} ${ok ? 'PASS' : 'FAIL'}`);
      if (!ok) {
        const why = out.split('\n').filter((l) => /^(FAIL:|FATAL)/.test(l)).slice(0, 1);
        console.log(`  ${why[0] ? why[0].slice(0, 220) : `no diagnosis; ${out.length} bytes of output: ${out.slice(-300).trim()}`}`);
      }
    }
  });
}

console.log(failed ? `\n${failed} run(s) failed` : '\nall suites pass');
process.exit(failed ? 1 : 0);
