/** Read-only launch diagnostics. Never connects to providers or prints secret values. */
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export function readiness(env = process.env, nodeVersion = process.versions.node) {
  const production = env.NODE_ENV === 'production';
  const checks = [];
  const add = (id, status, label, detail) => checks.push({id, status, label, detail});
  const present = key => typeof env[key] === 'string' && env[key].trim().length > 0;
  const [major, minor] = String(nodeVersion).split('.').map(Number);
  add('node', major > 22 || major === 22 && minor >= 16 ? 'ok' : 'error',
    'Node runtime', 'The application requires Node 22.16 or newer.');

  let origin;
  try { origin = new URL(env.APP_ORIGIN || 'http://localhost:3000'); } catch { /* Report safely below. */ }
  const validOrigin = origin && ['http:', 'https:'].includes(origin.protocol) && !origin.username && !origin.password &&
    !origin.search && !origin.hash && origin.pathname === '/';
  const local = validOrigin && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
  add('origin', !validOrigin || production && (origin.protocol !== 'https:' || local) ? 'error' : 'ok',
    'App address', production ? 'Use the shared public HTTPS origin, with no credentials, path, query or fragment.' : 'For separate devices, use a shared reachable HTTPS address; localhost works only on this computer.');
  add('session-secret', present('APP_SECRET') && env.APP_SECRET.length >= 32 ? 'ok' : production ? 'error' : 'warning',
    'Stable app secret', 'Configure a private random APP_SECRET of at least 32 characters before deployment.');
  add('demo', env.DEMO_MODE === 'true' ? production ? 'error' : 'warning' : 'ok',
    'Sample programming', 'DEMO_MODE must be false in production. Sample films are not licensed venue programming.');
  add('storage', 'warning', 'Persistent database and backups',
    'Use one persistent host for the SQLite pilot. Confirm the mounted database volume and a tested off-host restore; configuration alone cannot prove persistence.');
  add('signup', production && env.SIGNUPS_ENABLED === 'true' ? 'warning' : 'ok',
    'Venue registration', production ? 'Keep public registration disabled until the launch/security review is complete.' : 'Development registration is available by default.');
  if (env.TRUST_PROXY === 'true') add('proxy', 'warning', 'Trusted reverse proxy',
    'Use only a dedicated proxy that overwrites X-Real-IP. Keep the application port private.');

  const group = (id, label, keys, required = false) => {
    const missing = keys.filter(key => !present(key));
    const status = missing.length ? required ? 'error' : 'warning' : 'ok';
    add(id, status, label, missing.length ? 'Not configured: ' + missing.join(', ') + '.' : 'Required configuration is present. A live provider test has NOT been performed.');
  };
  group('bunny', 'Bunny Stream video', ['BUNNY_LIBRARY_ID', 'BUNNY_API_KEY', 'BUNNY_CDN_HOST', 'BUNNY_TOKEN_KEY'], production);
  if (present('BUNNY_CDN_HOST') && !/^[a-z0-9.-]+$/i.test(env.BUNNY_CDN_HOST))
    add('bunny-host', 'error', 'Bunny hostname format', 'Use the CDN hostname only, without a scheme, path, credentials or query.');
  group('r2', 'Private original-file archive', ['R2_ACCOUNT_ID', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']);
  group('stripe', 'Paid subscriptions', ['STRIPE_SECRET_KEY', 'STRIPE_PRICE_PAID', 'STRIPE_PRICE_PREMIUM', 'STRIPE_WEBHOOK_SECRET']);
  group('retailer', 'Retail attribution', ['COMMERCE_URL', 'COMMERCE_WEBHOOK_SECRET']);
  if (present('COMMERCE_URL')) {
    let merchant;
    try { merchant = new URL(env.COMMERCE_URL); } catch { /* Do not echo user input. */ }
    add('retailer-url', merchant && merchant.protocol === 'https:' && !merchant.username && !merchant.password ? 'ok' : 'error',
      'Retail partner address', 'Use a fixed HTTPS retail destination. This check does not verify licensing, age checks or fulfillment.');
  }
  const basisPoints = Number(env.COMMISSION_BPS || 0);
  add('commission', !Number.isSafeInteger(basisPoints) || basisPoints < 0 || basisPoints > 10000 ? 'error' : basisPoints ? 'ok' : 'warning',
    'Revenue-share terms', basisPoints === 0 ? 'Commission is unset or zero. No nonzero commission will accrue.' : 'Use approved integer basis points between 0 and 10000; configuration is not a payout.');
  const freeTvs = Number(env.FREE_TV_LIMIT || 5);
  add('tv-limit', Number.isSafeInteger(freeTvs) && freeTvs >= 1 && freeTvs <= 100 ? 'ok' : 'error',
    'Free TV allowance', 'Use an approved whole-number allowance from 1 to 100.');
  add('launch', 'warning', 'Remaining launch acceptance',
    'Live Bunny/R2/billing/retailer tests, physical-TV and offline-restart checks, content rights, security review and executed 5-/10-year installation terms remain separate acceptance gates.');
  return {
    mode: production ? 'production configuration' : 'development configuration',
    configurationValid: !checks.some(check => check.status === 'error'),
    liveProviderTestsPerformed: false,
    productionApprovalGranted: false,
    checks
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const report = readiness();
  if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
  else {
    console.log('MIXXPRO launch check — ' + report.mode + '\n');
    for (const check of report.checks) console.log(`- [${check.status.toUpperCase()}] ${check.label}\n  ${check.detail}`);
    console.log('\nConfiguration review only. No live connections, charges, uploads, deployments or production approval.');
  }
  process.exitCode = report.configurationValid ? 0 : 1;
}
