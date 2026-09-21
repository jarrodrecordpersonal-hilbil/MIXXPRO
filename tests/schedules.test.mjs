import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createApplication,configuration} from '../apps/server/app.mjs';

let app,base,owner,other,tvId,foreignTvId,scheduleId;
const original={name:'Evenings',start:'18:00',end:'21:00',days:[1,2,3,4,5],theme:'speakeasy',mix:{mode:'blend',worlds:{golf:'more',bourbon:'normal'},subcategories:{golf:['Courses']},minutes:180,seed:7}};
async function request(path,{who=owner,method='GET',body,csrf=true}={}){
 const headers={'Content-Type':'application/json'};
 if(who){headers.Cookie=who.cookie;headers['X-Venue-Id']=who.venue;if(csrf)headers['X-CSRF-Token']=who.csrf;}
 const response=await fetch(base+'/api'+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
 return {status:response.status,data:await response.json(),headers:response.headers};
}
async function signup(name){
 const result=await request('/auth/signup',{who:null,method:'POST',body:{name,email:name+'@schedule.example',password:'test-schedule-password-2026',venueName:name+' venue',type:'golf'}});
 assert.equal(result.status,201);
 const who={venue:result.data.venueId,cookie:result.headers.get('set-cookie').split(';')[0]};
 const session=(await request('/session',{who})).data;return {...who,csrf:session.csrf,user:session.user.id};
}
async function pair(who){const issued=await request('/player/pair',{who:null,method:'POST',body:{}});const claimed=await request('/tvs/claim',{who,method:'POST',body:{code:issued.data.code,name:'Fixture TV'}});assert.equal(claimed.status,201);return claimed.data.tvId;}
before(async()=>{
 app=createApplication({config:configuration({DB_PATH:':memory:',SIGNUPS_ENABLED:'true',DEMO_MODE:'false',APP_SECRET:'schedule-fixture-not-a-live-secret-2026'})});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${app.server.address().port}`;app.config.APP_ORIGIN=base;
 owner=await signup('owner');other=await signup('other');tvId=await pair(owner);foreignTvId=await pair(other);
 app.db.run('INSERT INTO members VALUES(?,?,?)',owner.venue,other.user,'viewer');
});
after(async()=>app.close());

test('editing updates one schedule in place and preserves its creation priority, targeting and styling',async()=>{
 const created=await request('/schedules',{method:'POST',body:{...original,tvIds:[tvId]}});assert.equal(created.status,201);scheduleId=created.data.id;
 app.db.run('UPDATE schedules SET created_at=1 WHERE id=?',scheduleId);
 const newer=await request('/schedules',{method:'POST',body:{...original,name:'Later-created slot',tvIds:[]}});assert.equal(newer.status,201);
 const result=await request('/schedules/'+scheduleId,{method:'PATCH',body:{...original,name:'Late evenings',start:'22:00',end:'02:00',days:[5,6],tvIds:[tvId]}});assert.equal(result.status,200);assert.equal(result.data.id,scheduleId);
 const rows=(await request('/venue')).data.schedules;assert.equal(rows.length,2);assert.equal(rows[0].id,newer.data.id);
 const saved=rows.find(row=>row.id===scheduleId);assert.equal(saved.created_at,1);assert.equal(saved.name,'Late evenings');assert.equal(saved.start_time,'22:00');assert.equal(saved.end_time,'02:00');assert.deepEqual(saved.days,[5,6]);assert.deepEqual(saved.tv_ids,[tvId]);assert.deepEqual(saved.mix,original.mix);assert.equal(saved.theme,'speakeasy');assert.equal(saved.active,1);
});
test('schedule edits enforce venue isolation, viewer permissions and CSRF',async()=>{
 const options={method:'PATCH',body:{...original,tvIds:[tvId]}};
 assert.equal((await request('/schedules/'+scheduleId,{...options,who:other})).status,404);
 assert.equal((await request('/schedules/'+scheduleId,{...options,who:{...other,venue:owner.venue}})).status,403);
 assert.equal((await request('/schedules/'+scheduleId,{...options,csrf:false})).status,403);
 assert.equal((await request('/schedules/'+scheduleId,{...options,who:null})).status,401);
});
test('invalid edits leave the saved schedule unchanged',async()=>{
 const before=app.db.get('SELECT * FROM schedules WHERE id=?',scheduleId);
 for(const change of [{days:[]},{days:[7]},{start:'21:00',end:'21:00'},{end:'25:00'},{theme:'invented'},{mix:{...original.mix,worlds:{unknown:'normal'}}},{tvIds:[foreignTvId]}]){
  const result=await request('/schedules/'+scheduleId,{method:'PATCH',body:{...original,tvIds:[tvId],...change}});assert.equal(result.status,400,JSON.stringify(change));
  assert.deepEqual(app.db.get('SELECT * FROM schedules WHERE id=?',scheduleId),before);
 }
});
test('editing a removed schedule returns not found without recreating it',async()=>{
 assert.equal((await request('/schedules/'+scheduleId,{method:'DELETE',body:{}})).status,200);
 assert.equal((await request('/schedules/'+scheduleId,{method:'PATCH',body:{...original,tvIds:[tvId]}})).status,404);
 assert.equal(app.db.get('SELECT COUNT(*) n FROM schedules WHERE id=?',scheduleId).n,0);
});
