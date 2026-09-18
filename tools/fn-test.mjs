/* Unit checks for the coach function: discovery, the unconfigured fallback,
   origin and size guards, model pinning, token clamping, error masking and the
   daily quota. Anthropic is stubbed — nothing here touches the network. */
/* Caps are read when the module loads, exactly as they are on a deploy, so
   the test environment has to be in place before the import. */
process.env.COACH_DAILY_PER_DEVICE = '3';
process.env.COACH_DAILY_PER_IP = '50';
const { default: handler } = await import('../netlify/functions/coach.js');

const SITE = 'https://example.netlify.app/api/coach';
const out = {};
const fails = [];
const check = (name, cond) => { out[name] = cond; if (!cond) fails.push(name); };

const post = (body, headers = {}) => new Request(SITE, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-nf-client-connection-ip': '203.0.113.9', ...headers },
  body: JSON.stringify(body)
});

const MSG = { messages: [{ role: 'user', content: 'שלום' }], device: 'dev_test' };

/* ---------- no key configured ---------- */
delete process.env.ANTHROPIC_API_KEY;
out.discoveryClosed = await (await handler(new Request(SITE))).json();
check('discoveryReportsUnavailable', out.discoveryClosed.available === false);
check('unconfiguredReturns503', (await handler(post(MSG))).status === 503);

/* ---------- with a key, upstream stubbed ---------- */
process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key-do-not-use';
let seen = null;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  seen = { url: String(url), init, body: JSON.parse(init.body) };
  return new Response(JSON.stringify({ content: [{ type: 'text', text: 'תשובה' }] }), {
    status: 200, headers: { 'content-type': 'application/json' }
  });
};

out.discoveryOpen = await (await handler(new Request(SITE))).json();
check('discoveryReportsAvailable', out.discoveryOpen.available === true);

const ok = await handler(post({ ...MSG, max_tokens: 99999, temperature: 7, model: 'some-expensive-model' }));
check('proxied200', ok.status === 200);
check('keyNeverInResponse', !(await ok.clone().text()).includes('sk-ant'));
check('keySentUpstream', seen.init.headers['x-api-key'] === 'sk-ant-test-key-do-not-use');
check('modelPinnedServerSide', seen.body.model === 'claude-sonnet-4-5');
check('maxTokensClamped', seen.body.max_tokens === 1500);
check('temperatureClamped', seen.body.temperature === 1);
check('deviceNotForwarded', seen.body.device === undefined);

/* ---------- guards ---------- */
check('crossOriginRejected',
  (await handler(post(MSG, { origin: 'https://evil.example' }))).status === 403);
check('sameOriginAccepted',
  (await handler(post(MSG, { origin: 'https://example.netlify.app' }))).status === 200);
check('methodGuard', (await handler(new Request(SITE, { method: 'DELETE' }))).status === 405);
check('badJsonRejected', (await handler(new Request(SITE, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: 'not json'
}))).status === 400);
check('emptyMessagesRejected', (await handler(post({ messages: [] }))).status === 400);

const huge = 'x'.repeat(1_600_000);
check('oversizeRejected', (await handler(post({ ...MSG, blob: huge }))).status === 413);

/* ---------- upstream failures are masked ---------- */
globalThis.fetch = async () => new Response('{"error":{"message":"invalid x-api-key sk-ant-real"}}', { status: 401 });
const masked = await handler(post({ ...MSG, device: 'dev_mask' }));
out.maskedBody = await masked.text();
check('upstreamErrorMasked', masked.status === 502 && !out.maskedBody.includes('sk-ant'));

/* ---------- daily quota ---------- */
globalThis.fetch = async () => new Response(JSON.stringify({ content: [] }), { status: 200 });
let statuses = [];
for (let i = 0; i < 5; i++) {
  statuses.push((await handler(post({ ...MSG, device: 'dev_quota' }, { 'x-nf-client-connection-ip': '198.51.100.7' }))).status);
}
out.quotaStatuses = statuses;
check('quotaStopsAfterCap', statuses.filter((s) => s === 200).length <= 3 && statuses.at(-1) === 429);

globalThis.fetch = realFetch;
console.log(JSON.stringify(out, null, 2));
if (fails.length) { console.error('FAIL:', fails.join(', ')); process.exit(1); }
console.log('PASS');
