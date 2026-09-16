/** Deployment contracts and a production-config smoke test. No live providers. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApplication,configuration} from '../apps/server/app.mjs';
const blueprint=JSON.parse(readFileSync(new URL('../render.yaml',import.meta.url),'utf8'));
const service=blueprint.services[0];
const env=Object.fromEntries(service.envVars.map(e=>[e.key,e]));

test('Render pilot is one persistent Docker service, not an ephemeral free/static deployment',()=>{
  assert.equal(blueprint.services.length,1);assert.equal(service.type,'web');
  assert.equal(service.runtime,'docker');assert.equal(service.plan,'0.5c-512mb');
  assert.equal(service.numInstances,1);assert.equal(service.disk.sizeGB,5);
  assert.equal(service.disk.mountPath,'/app/data');
  assert.equal(env.DB_PATH.value,service.disk.mountPath+'/mixxpro.sqlite');
  assert.equal(blueprint.databases,undefined);assert.equal(service.scaling,undefined);
});
test('GoDaddy domain target and application origin agree, without rebranding MIXDATA',()=>{
  assert.deepEqual(service.domains,['mixxwave.com']);
  assert.equal(env.APP_ORIGIN.value,'https://mixxwave.com');
  assert.match(readFileSync(new URL('../apps/web/screens/index.html',import.meta.url),'utf8'),/MIXDATA/);
});
test('Bunny and Google credentials are requested privately and application secret is host-generated',()=>{
  for(const key of ['BUNNY_LIBRARY_ID','BUNNY_API_KEY','BUNNY_CDN_HOST','BUNNY_TOKEN_KEY','GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET']){
    assert.equal(env[key].sync,false);assert.equal(env[key].value,undefined);
  }
  assert.equal(env.APP_SECRET.generateValue,true);assert.equal(env.APP_SECRET.value,undefined);
  assert.equal(env.MIXX_ADMIN_PASSWORD,undefined);
  assert.equal(new Set(service.envVars.map(e=>e.key)).size,service.envVars.length);
});
test('Public venue signup is deliberate while demo media, commission and paid integrations remain off',()=>{
  assert.equal(env.NODE_ENV.value,'production');assert.equal(env.DEMO_MODE.value,'false');
  assert.equal(env.SIGNUPS_ENABLED.value,'true');assert.equal(env.TRUST_PROXY.value,'false');
  assert.equal(env.COMMISSION_BPS.value,'0');
  assert.equal(service.envVars.some(e=>/^STRIPE_|^COMMERCE_|^R2_/.test(e.key)),false);
});
test('Source auto-deploys and paid preview fleets are disabled in the template',()=>{
  assert.equal(service.autoDeployTrigger,'off');assert.equal(blueprint.previews.generation,'off');
  assert.equal(service.initialDeployHook,undefined);assert.equal(service.preDeployCommand,undefined);
  assert.equal(service.branch,'main');
});
test('Blueprint health port and database paths match the existing Docker image',()=>{
  const docker=readFileSync(new URL('../Dockerfile',import.meta.url),'utf8');
  assert.equal(service.dockerfilePath,'./Dockerfile');assert.equal(service.dockerContext,'.');
  assert.equal(service.healthCheckPath,'/api/health');assert.equal(env.PORT.value,'3000');
  assert.match(docker,/PORT=3000/);assert.match(docker,/DB_PATH=\/app\/data\/mixxpro\.sqlite/);
  assert.match(docker,/\/api\/health/);assert.match(docker,/USER node/);
});
test('Production configuration starts locally, keeps private configuration private and denies unauthenticated reporting',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'mixxwave-deploy-'));
  const values=Object.fromEntries(service.envVars.filter(e=>'value'in e).map(e=>[e.key,e.value]));
  const config=configuration({...values,DB_PATH:join(dir,'pilot.sqlite'),APP_SECRET:'test-only-stable-private-secret-not-for-deployment'});
  const app=createApplication({config});
  try{
    await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
    const base='http://127.0.0.1:'+app.server.address().port;
    const health=await fetch(base+service.healthCheckPath);assert.equal(health.status,200);
    assert.equal((await health.json()).ok,true);
    const publicConfig=await (await fetch(base+'/api/config')).json();
    assert.equal(publicConfig.demo,false);assert.equal(publicConfig.signups,true);assert.equal(publicConfig.googleReady,false);assert.equal(publicConfig.mediaReady,false);
    assert.equal(JSON.stringify(publicConfig).includes(config.APP_SECRET),false);
    assert.equal((await fetch(base+'/api/session')).status,401);
    assert.equal((await fetch(base+'/api/screen-activity?scope=network')).status,401);
    const signup=await fetch(base+'/api/auth/signup',{method:'POST',headers:{'Content-Type':'application/json',Origin:config.APP_ORIGIN},body:'{}'});
    assert.equal(signup.status,400);
    assert.deepEqual(app.db.all('SELECT version FROM migrations ORDER BY version').map(r=>r.version),[1,2,3]);
    assert.match((await fetch(base)).headers.get('strict-transport-security'),/max-age=/);
  }finally{await app.close();rmSync(dir,{recursive:true,force:true});}
});
