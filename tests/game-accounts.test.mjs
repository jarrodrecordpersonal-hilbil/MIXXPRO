import test from 'node:test';
import assert from 'node:assert/strict';
import {createApplication,configuration} from '../apps/server/app.mjs';
import {hash} from '../apps/server/security.mjs';
import {teamRows} from '../apps/server/game-standings.mjs';

const password='player-account-password-2026';
async function setup(t){
 const app=createApplication({config:configuration({NODE_ENV:'test',DB_PATH:':memory:',DEMO_MODE:'true',APP_ORIGIN:'http://127.0.0.1',APP_SECRET:'accounts-and-teams-test-secret-2026'})});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>app.close());
 const base='http://127.0.0.1:'+app.server.address().port;
 const client=()=>({cookies:new Map(),csrf:'',async request(path,body,extra={}){
  const response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',Cookie:[...this.cookies].map(([k,v])=>k+'='+v).join('; '),'X-CSRF-Token':this.csrf,...extra},body:body===undefined?undefined:JSON.stringify(body)});
  for(const value of response.headers.getSetCookie()){const [pair]=value.split(';'),at=pair.indexOf('=');this.cookies.set(pair.slice(0,at),pair.slice(at+1));}
  const data=await response.json();return {status:response.status,body:data};
 },async view(code='PROOF26'){const r=await this.request('/api/public/games/'+code);assert.equal(r.status,200);this.csrf=r.body.account.csrf||'';return r.body;},async register(name){const email=name.toLowerCase().replace(/[^a-z0-9]/g,'')+'@example.test';const r=await this.request('/api/public/game-account/register',{name,email,password});assert.equal(r.status,201,JSON.stringify(r.body));await this.view();return email;},async join(code='PROOF26',name='Guest'){const r=await this.request('/api/public/games/'+code+'/join',{name});assert.equal(r.status,200,JSON.stringify(r.body));return (await this.view(code)).participant;}});
 const host=client();assert.equal((await host.request('/api/auth/signup',{email:'host@example.test',password,name:'Host',venueName:'Oak Store',type:'other'})).status,201);
 const session=(await host.request('/api/session')).body;host.csrf=session.csrf;
 app.db.run("UPDATE users SET platform_role='admin' WHERE id=?",session.user.id);
 const venue=session.venues[0].id,headers={'X-Venue-Id':venue};
 app.db.run("UPDATE venues SET qr_code='oak-qr' WHERE id=?",venue);
 const other='other-store';app.db.run("INSERT INTO venues(id,name,type,timezone,mix,qr_code,referral_code,created_at) VALUES(?,?,'other','UTC','{}',?,'other-ref',?)",other,'River Store','river-qr',Date.now());
 const created=await host.request('/api/admin/games/proof-trials-demo',{},headers);assert.equal(created.status,201);
 const event=(await host.view()).event,match=event.matchups[0],judge=event.judges[0];
 for(const v of [venue,other])app.db.run("INSERT INTO event_presentations VALUES(?,?, '',1,?,?)",event.id,v,Date.now(),Date.now());
 app.db.run("INSERT INTO tasting_events(id,code,name,status,created_at,updated_at) VALUES('second','SECOND','Second event','open',?,?)",Date.now(),Date.now());
 const phase=async value=>{const e=(await host.view()).event;const r=await host.request('/api/games/'+event.id+'/phase',{phase:value,matchupId:match.id,expectedRevision:e.stateRevision},headers);assert.equal(r.status,200,JSON.stringify(r.body));};
 return {app,host,client,event,match,judge,venue,other,headers,phase};
}

test('saved accounts preserve guest picks across devices, sign-out and independent events',async t=>{
 const {app,client,phase,match}=await setup(t),a=client(),guest=await a.join();
 const resume=(await a.request('/api/public/games/PROOF26/link-device',{})).body.code;
 await phase('predictions');assert.equal((await a.request('/api/public/games/PROOF26/predict',{matchupId:match.id,entryId:match.entryAId})).status,200);
 const email=await a.register('Player One');
 assert.equal(app.db.get('SELECT COUNT(*) n FROM venues').n,2,'consumer signup must not create a venue');
 assert.equal(app.db.get('SELECT COUNT(*) n FROM members').n,1,'consumer signup must not create staff membership');
 assert.equal((await a.request('/api/public/games/PROOF26/save-account',{})).status,200);
 assert.equal((await a.view()).participant.id,guest.id);
 const b=client();assert.equal((await b.request('/api/public/game-account/login',{email,password})).status,200);
 assert.equal((await b.view()).participant.id,guest.id);assert.equal((await b.view()).predictions[0].entryId,match.entryAId);
 assert.equal((await client().request('/api/public/games/PROOF26/resume',{code:resume})).status,400,'old guest codes cannot reopen a saved account');
 assert.equal((await b.request('/api/public/games/PROOF26/link-device',{})).status,409);
 const second=await b.join('SECOND');assert.notEqual(second.id,guest.id);
 assert.equal((await a.view('SECOND')).participant.id,second.id);
 const history=await b.request('/api/public/game-account');assert.equal(history.body.history.length,2);
 assert.equal((await a.request('/api/auth/logout',{})).status,200);
 assert.equal((await a.view()).participant,null);assert.deepEqual((await a.view()).predictions,[]);
 assert.equal((await a.request('/api/public/games/PROOF26/predict',{matchupId:match.id,entryId:match.entryBId})).status,401);
 assert.equal((await a.request('/api/public/games/PROOF26/join',{name:'Same browser'})).status,401);
 assert.equal((await b.view()).predictions[0].entryId,match.entryAId,'other signed-in device remains valid');
 assert.equal(app.db.get('SELECT COUNT(*) n FROM game_participants').n,2);
});

test('account conflicts cannot combine players, reassign ownership or leak private account details',async t=>{
 const {app,client,event,host,headers}=await setup(t),a=client(),b=client();
 const email=await a.register('Account A'),one=await a.join(),two=await b.join();
 await b.register('Account B');assert.equal((await b.request('/api/public/games/PROOF26/save-account',{})).status,200);
 assert.equal((await b.request('/api/auth/logout',{})).status,200);
 assert.equal((await b.request('/api/public/game-account/login',{email,password})).status,200);
 assert.equal((await b.view()).participant.id,one.id,'a different account restores only its own canonical player');
 assert.equal(app.db.get('SELECT user_id FROM game_account_participants WHERE participant_id=?',two.id).user_id,app.db.get("SELECT id FROM users WHERE email='accountb@example.test'").id);
 const c=client(),three=await c.join();await c.request('/api/public/game-account/login',{email,password});await c.view();
 assert.equal((await c.request('/api/public/games/PROOF26/save-account',{})).status,409);
 assert.equal(app.db.get('SELECT 1 FROM game_account_participants WHERE participant_id=?',three.id),undefined);
 const anon=await client().view();assert.ok(!JSON.stringify(anon).includes(email));assert.equal(anon.account.csrf,null);
 const hostView=(await host.request('/api/games/'+event.id+'/host',undefined,headers)).body;
 assert.ok(!JSON.stringify(hostView).includes(email));
});

test('account mutations enforce CSRF, session expiry, password security and guest authority',async t=>{
 const {app,client,event,venue,match,phase}=await setup(t),a=client(),b=client();
 const email=await a.register('Protected Player');await a.join();
 assert.equal((await a.request('/api/public/games/PROOF26/team',{venueCode:'oak-qr'},{'X-CSRF-Token':''})).status,403);
 assert.equal((await a.request('/api/games/'+event.id+'/phase',{phase:'complete',expectedRevision:0},{'X-Venue-Id':venue})).status,404);
 await phase('predictions');assert.equal((await a.request('/api/public/games/PROOF26/predict',{matchupId:match.id,entryId:match.entryAId},{'X-CSRF-Token':''})).status,403);
 assert.equal((await b.request('/api/public/game-account/login',{email,password})).status,200);await b.view();
 assert.equal((await a.request('/api/public/game-account/password',{currentPassword:'incorrect',password:'replacement-password-2026'})).status,401);
 assert.equal((await a.request('/api/public/game-account/password',{currentPassword:password,password:'replacement-password-2026'})).status,200);await a.view();
 assert.equal((await b.view()).participant,null,'password change invalidates other sessions');
 assert.equal((await b.request('/api/public/game-account/login',{email,password})).status,401);
 assert.equal((await b.request('/api/public/game-account/login',{email,password:'replacement-password-2026'})).status,200);await b.view();
 app.db.run('UPDATE sessions SET expires_at=0 WHERE token_hash=?',hash(b.cookies.get('mixx_session')));
 assert.equal((await b.view()).participant,null);
 assert.equal((await b.request('/api/public/game-account')).status,401);
 const u=app.db.get('SELECT * FROM users WHERE email=?',email);assert.ok(!u.password_hash.includes(password));
});

test('team membership is explicit, venue-resolved, capped, fixed and locked before play',async t=>{
 const {app,client,event,venue,phase}=await setup(t),players=[];
 for(let i=0;i<6;i++){const c=client();await c.register('Roster '+i);await c.join();players.push(c);}
 assert.equal((await players[0].view()).teams.length,0,'QR/location participation must not automatically make a team');
 const join=(c,venueCode='oak-qr')=>c.request('/api/public/games/PROOF26/team',{venueCode,venueId:'forged'});
 for(const c of players.slice(0,5))assert.equal((await join(c)).status,200);
 assert.equal((await join(players[0])).status,200,'repeat submission occupies one slot');
 assert.equal((await join(players[5])).status,409);
 assert.equal((await join(players[0],'river-qr')).status,409);
 assert.equal(app.db.get('SELECT COUNT(*) n FROM game_team_memberships WHERE event_id=? AND venue_id=?',event.id,venue).n,5);
 await phase('predictions');
 assert.equal((await join(players[5],'river-qr')).status,409);
 const view=await players[0].view();assert.equal(view.event.teamRules.locked,true);assert.equal(view.teams[0].memberCount,5);assert.equal(view.teams[0].rank,1);
 assert.equal((await join(players[0])).status,200,'reconciliation remains idempotent after lock');
 assert.equal((await client().request('/api/public/games/PROOF26/team',{venueCode:'oak-qr'})).status,401);
});

test('two stores share the authoritative individual scoring, including private judging and corrections',async t=>{
 const {app,client,host,event,match,judge,headers,venue,other,phase}=await setup(t),players=[];
 for(let i=0;i<10;i++){const c=client();await c.register('Scorer '+i);await c.join();assert.equal((await c.request('/api/public/games/PROOF26/team',{venueCode:i<5?'oak-qr':'river-qr'})).status,200);players.push(c);}
 await phase('predictions');
 for(let i=0;i<players.length;i++)for(const kind of ['bracket','judge'])assert.equal((await players[i].request('/api/public/games/PROOF26/predict',{matchupId:match.id,entryId:i<5?match.entryAId:match.entryBId,kind,judgeId:judge.id})).status,200);
 await phase('judging');assert.equal((await host.request('/api/games/'+event.id+'/judge-submit',{matchupId:match.id,judgeId:judge.id,winnerEntryId:match.entryAId},headers)).status,200);
 assert.ok((await players[0].view()).teams.every(t=>t.points===0),'team scores cannot reveal private judge choices');
 for(const [revision,winner,expected] of [[0,match.entryAId,[10,0]],[1,match.entryBId,[5,5]]]){
  const result=await host.request('/api/admin/games/'+event.id+'/publish-outcome',{matchupId:match.id,winnerEntryId:winner,expectedRevision:revision},headers);assert.equal(result.status,200);
  const phone=await players[0].view(),byVenue=new Map(phone.teams.map(t=>[t.venueId,t]));
  assert.equal(byVenue.get(venue).points,expected[0]);assert.equal(byVenue.get(other).points,expected[1]);
  assert.deepEqual(result.body.teams,phone.teams);assert.deepEqual(teamRows(app.db,event.id),phone.teams);
  if(revision===1)assert.ok(phone.teams.every(t=>t.rank===1),'equal points share rank');
 }
 await phase('results');await phase('complete');assert.ok((await players[0].view()).teams.every(t=>t.points===5));
});

test('incomplete rosters stay unranked and wrong-event membership cannot be inserted',async t=>{
 const {app,client,event,venue,phase}=await setup(t),a=client();await a.register('Solo Team');const p=await a.join();
 await a.request('/api/public/games/PROOF26/team',{venueCode:'oak-qr'});
 await phase('predictions');const team=(await a.view()).teams[0];assert.equal(team.status,'incomplete');assert.equal(team.rank,null);
 const user=app.db.get('SELECT user_id FROM game_account_participants WHERE participant_id=?',p.id).user_id;
 assert.throws(()=>app.db.run('INSERT INTO game_account_participants VALUES(?,?,?,?)',user,'second',p.id,Date.now()),/constraint/i);
 assert.throws(()=>app.db.run('UPDATE game_team_memberships SET venue_id=? WHERE user_id=? AND event_id=?',venue,user,event.id),/cannot be reassigned/);
});

test('concurrent last-slot requests accept exactly one account and failed binding rolls back',async t=>{
 const {app,client,event}=await setup(t),players=[];
 for(let i=0;i<6;i++){const c=client();await c.register('Racer '+i);await c.join();players.push(c);}
 for(const c of players.slice(0,4))assert.equal((await c.request('/api/public/games/PROOF26/team',{venueCode:'oak-qr'})).status,200);
 const results=await Promise.all(players.slice(4).map(c=>c.request('/api/public/games/PROOF26/team',{venueCode:'oak-qr'})));
 assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 assert.equal(app.db.get('SELECT COUNT(*) n FROM game_team_memberships WHERE event_id=?',event.id).n,5);
 const c=client();await c.register('Rollback Player');const count=app.db.get('SELECT COUNT(*) n FROM game_participants').n;
 app.db.raw.exec("CREATE TRIGGER fail_account_binding BEFORE INSERT ON game_account_participants BEGIN SELECT RAISE(ABORT,'test rollback'); END;");
 assert.equal((await c.request('/api/public/games/PROOF26/save-account',{})).status,500);
 assert.equal(app.db.get('SELECT COUNT(*) n FROM game_participants').n,count);
 app.db.raw.exec('DROP TRIGGER fail_account_binding');
 assert.equal((await c.request('/api/public/games/PROOF26/save-account',{})).status,200);
 assert.equal(app.db.get('SELECT COUNT(*) n FROM game_participants').n,count+1);
});

test('account authentication is rate limited and accounts are off outside an enabled pilot',async t=>{
 const {client}=await setup(t),c=client();
 for(let i=0;i<15;i++)assert.equal((await c.request('/api/public/game-account/login',{email:'missing@example.test',password})).status,401);
 assert.equal((await c.request('/api/public/game-account/login',{email:'missing@example.test',password})).status,429);
 const config=configuration({NODE_ENV:'test',DB_PATH:':memory:',DEMO_MODE:'false'});assert.equal(config.GAME_ACCOUNTS_ENABLED,false);
 const app=createApplication({config});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>app.close());
 const response=await fetch('http://127.0.0.1:'+app.server.address().port+'/api/public/game-account/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'off@example.test',password,name:'Off'})});
 assert.equal(response.status,404);assert.equal(app.db.get('SELECT COUNT(*) n FROM game_profiles').n,0);
});
