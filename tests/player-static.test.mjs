import test from 'node:test';
import assert from 'node:assert/strict';
import {createApplication, configuration} from '../apps/server/app.mjs';

test('TV can import its outbox module without opening unrelated server files', async t => {
  const app = createApplication({config:configuration({
    NODE_ENV:'test', DB_PATH:':memory:', DEMO_MODE:'false',
    SIGNUPS_ENABLED:'false', APP_ORIGIN:'http://127.0.0.1',
    APP_SECRET:'outbox-static-routing-test-secret-2026'
  })});
  await new Promise(resolve => app.server.listen(0,'127.0.0.1',resolve));
  t.after(() => app.close());
  const base = 'http://127.0.0.1:' + app.server.address().port;

  const module = await fetch(base + '/player/event-outbox.mjs');
  assert.equal(module.status, 200);
  assert.match(module.headers.get('content-type') || '', /javascript/);
  assert.match(await module.text(), /export async function drainEventOutbox/);

  const startup = await fetch(base + '/player/startup.mjs');
  assert.equal(startup.status,200);
  assert.match(startup.headers.get('content-type') || '',/javascript/);
  assert.match(await startup.text(),/export async function loadSavedCredential/);

  const privateFile = await fetch(base + '/player/.env');
  assert.equal(privateFile.status, 404);
});
