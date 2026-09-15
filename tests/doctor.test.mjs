import test from 'node:test';
import assert from 'node:assert/strict';
import {readiness} from '../scripts/doctor.mjs';
const configured = () => ({NODE_ENV:'production',APP_ORIGIN:'https://venue.example.com',APP_SECRET:'a'.repeat(40),DEMO_MODE:'false',SIGNUPS_ENABLED:'false',BUNNY_LIBRARY_ID:'12',BUNNY_API_KEY:'private-bunny-key',BUNNY_CDN_HOST:'media.example.b-cdn.net',BUNNY_TOKEN_KEY:'private-token',R2_ACCOUNT_ID:'account',R2_BUCKET:'masters',R2_ACCESS_KEY_ID:'access',R2_SECRET_ACCESS_KEY:'r2-private',STRIPE_SECRET_KEY:'stripe-private',STRIPE_PRICE_PAID:'paid',STRIPE_PRICE_PREMIUM:'premium',STRIPE_WEBHOOK_SECRET:'webhook-private',COMMERCE_URL:'https://retailer.example.com/shop',COMMERCE_WEBHOOK_SECRET:'merchant-private',COMMISSION_BPS:'1000'});
const status = (report, id) => report.checks.find(check => check.id === id)?.status;
test('doctor allows local development without claiming media is connected', () => {
  const r=readiness({},'22.16.0');assert.equal(r.configurationValid,true);assert.equal(status(r,'bunny'),'warning');assert.equal(r.liveProviderTestsPerformed,false);assert.equal(r.productionApprovalGranted,false);
});
test('doctor rejects unsupported Node versions', () => {
  for (const version of ['20.19.0','22.15.0','invalid']) assert.equal(status(readiness({},version),'node'),'error');
  for (const version of ['22.16.0','24.1.0']) assert.equal(status(readiness({},version),'node'),'ok');
});
test('doctor rejects unsafe production origins and weak secrets', () => {
  for (const origin of ['http://venue.example.com','https://localhost','https://127.0.0.1','https://[::1]','https://venue.example.com/path','https://user:secret@venue.example.com','not-a-url'])
    assert.equal(status(readiness({...configured(),APP_ORIGIN:origin}),'origin'),'error');
  assert.equal(status(readiness({...configured(),APP_SECRET:'short'}),'session-secret'),'error');
});
test('doctor refuses production demo programming and missing media configuration', () => {
  assert.equal(status(readiness({...configured(),DEMO_MODE:'true'}),'demo'),'error');
  assert.equal(status(readiness({...configured(),BUNNY_API_KEY:''}),'bunny'),'error');
  assert.equal(status(readiness({...configured(),BUNNY_CDN_HOST:'https://cdn.example.com/path'}),'bunny-host'),'error');
});
test('doctor never confuses present credentials with verified provider service', () => {
  const r=readiness(configured(),'24.1.0');assert.equal(r.configurationValid,true);assert.equal(r.liveProviderTestsPerformed,false);assert.equal(r.productionApprovalGranted,false);
  for (const id of ['bunny','r2','stripe','retailer']) assert.equal(status(r,id),'ok');
  assert.equal(status(r,'storage'),'warning');assert.equal(status(r,'launch'),'warning');
});
test('doctor never emits secret values or malformed confidential URLs', () => {
  const env=configured();env.APP_ORIGIN='https://private-user:private-password@example.com';env.COMMERCE_URL='https://merchant-user:merchant-password@example.com';
  const result=JSON.stringify(readiness(env));
  for (const key of ['APP_SECRET','BUNNY_API_KEY','BUNNY_TOKEN_KEY','R2_SECRET_ACCESS_KEY','STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET','COMMERCE_WEBHOOK_SECRET']) assert.ok(!result.includes(env[key]));
  for (const value of ['private-user','private-password','merchant-user','merchant-password']) assert.ok(!result.includes(value));
});
test('doctor validates commission and TV allowance without inventing commercial rates', () => {
  for(const value of ['-1','10001','1.5','not-a-number']) assert.equal(status(readiness({...configured(),COMMISSION_BPS:value}),'commission'),'error');
  assert.equal(status(readiness({...configured(),COMMISSION_BPS:'0'}),'commission'),'warning');
  for(const value of ['0','101','2.5']) assert.equal(status(readiness({...configured(),FREE_TV_LIMIT:value}),'tv-limit'),'error');
});
test('doctor rejects non-HTTPS retailer destinations and warns about rollout settings', () => {
  assert.equal(status(readiness({...configured(),COMMERCE_URL:'http://retailer.example.com'}),'retailer-url'),'error');
  const r=readiness({...configured(),SIGNUPS_ENABLED:'true',TRUST_PROXY:'true'});assert.equal(status(r,'signup'),'warning');assert.equal(status(r,'proxy'),'warning');
});
