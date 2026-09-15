/** Domain rules shared by the API, dashboard and player. No provider credentials here. */
export const WORLDS = [
  {id:'bourbon', name:'Bourbon', icon:'glass', color:'#be8249', description:'Makers, stories & barrel culture', choices:['Stories','Barrel picks','Behind the bottle','Bourbon travel','Food pairings']},
  {id:'golf', name:'Golf', icon:'flag', color:'#6a9278', description:'Great courses. Better clubhouse company.', choices:['Courses','Destinations','Instruction','Gear','Golf + whiskey']},
  {id:'travel', name:'Travel', icon:'compass', color:'#759bb1', description:'The places you wish you were', choices:['Luxury escapes','Road trips','Hotels','Adventure','Food destinations']},
  {id:'cigar', name:'Cigar', icon:'wind', color:'#a68975', description:'A little slower. A little richer.', choices:['Lounge stories','Craft','Pairings','People']},
  {id:'food', name:'Food', icon:'fork', color:'#ae7970', description:'Chefs, fire & the perfect pairing', choices:['Steakhouses','Chefs','Technique','Pairings']},
  {id:'cocktails', name:'Cocktails', icon:'cocktail', color:'#9b8eb0', description:'Behind the bar & into the glass', choices:['Classics','Bartenders','Technique','Modern drinks']},
  {id:'music', name:'Music & culture', icon:'music', color:'#b99967', description:'The people behind the sound', choices:['Artists','Interviews','Culture','Live sessions']},
  {id:'outdoors', name:'Outdoors', icon:'mountain', color:'#828f70', description:'Take the long way home', choices:['Adventure','Lakes','Trails','Wild places']}
];
export const THEMES = [
  {id:'modern-luxury',name:'Modern Luxury',color:'#c7aa77',bg:'#141615',description:'Quiet, confident, refined'},
  {id:'classic-rickhouse',name:'Classic Rickhouse',color:'#dbac70',bg:'#251b16',description:'Warm oak & timeless stories'},
  {id:'speakeasy',name:'Speakeasy',color:'#d7a7ab',bg:'#25171f',description:'Low lights. Lasting impressions.'},
  {id:'sports-lounge',name:'Sports Lounge',color:'#99bedd',bg:'#142533',description:'Crisp, energetic, clear'},
  {id:'rustic-clubhouse',name:'Rustic Clubhouse',color:'#b2c18b',bg:'#20281d',description:'Relaxed greens & natural warmth'},
  {id:'high-energy',name:'High Energy',color:'#eab482',bg:'#312127',description:'A brighter after-hours feel'},
  {id:'minimal',name:'Minimal',color:'#dedbd1',bg:'#1b1e20',description:'Space for the content to breathe'},
  {id:'custom',name:'Your Brand',color:'#c7aa77',bg:'#171917',description:'Your accent. Your venue.'}
];
export function fail(status, message) { const e=new Error(message);e.status=status;throw e; }
export function text(value, name, max=160, optional=false) {
  if(optional && (value===undefined||value===null||value==='')) return '';
  if(typeof value!=='string'||!value.trim()||value.trim().length>max) fail(400,`${name} is required (maximum ${max} characters).`);
  return value.trim();
}
export function integer(value, name, min, max) { if(!Number.isSafeInteger(value)||value<min||value>max) fail(400,`${name} must be between ${min} and ${max}.`);return value; }
export function choice(value, values, name) { if(!values.includes(value))fail(400,`Choose a valid ${name}.`);return value; }
export function mixDefinition(input) {
  const mode=choice(input?.mode,['single','blend'],'MIXX mode');
  const worlds=input?.worlds;
  if(!worlds||Array.isArray(worlds)||typeof worlds!=='object')fail(400,'Pick a content world.');
  const entries=Object.entries(worlds);
  if(!entries.length||entries.length>8||(mode==='single'&&entries.length!==1))fail(400,'Choose one world for a MIXX, or multiple worlds for My Mix.');
  const clean={};for(const [id,weight]of entries){choice(id,WORLDS.map(w=>w.id),'world');clean[id]=choice(weight,['less','normal','more'],'weight');}
  const subcategories={};for(const [id,values] of Object.entries(input.subcategories||{})){
    const w=WORLDS.find(w=>w.id===id);if(!w||!clean[id]||!Array.isArray(values)||values.some(v=>!w.choices.includes(v)))fail(400,'Invalid subcategory.');subcategories[id]=[...new Set(values)];
  }
  return {mode,worlds:clean,subcategories,minutes:integer(input.minutes??180,'Block length',30,360),seed:integer(input.seed??1,'Shuffle seed',0,2147483647)};
}
export function entitled(content, plan, now=Date.now()) {
  return content.status==='published'&&content.rights_confirmed===1&&content.ready===1&&
    (content.rights_until===null||content.rights_until>now)&&
    (!content.premium_only||plan==='premium')&&(!content.sponsor||plan==='free')&&
    (plan!=='premium'||content.clean===1);
}
/** Deterministic duration-weighted rotation; crossover items count toward their selected world. */
export function rotation(catalog, definition, plan='free', now=Date.now()) {
  const def=mixDefinition(definition), weights={less:1,normal:2,more:3};
  let seed=def.seed|0;const rng=()=>{seed=(Math.imul(1664525,seed)+1013904223)|0;return (seed>>>0)/4294967296;};
  const eligible=catalog.filter(c=>entitled(c,plan,now)&&!c.sponsor);
  const pools=Object.keys(def.worlds).map(world=>({world,weight:weights[def.worlds[world]],served:0,items:eligible.filter(c=>{
    const worlds=Array.isArray(c.worlds)?c.worlds:JSON.parse(c.worlds||'[]');
    const tags=Array.isArray(c.tags)?c.tags:JSON.parse(c.tags||'[]');
    const filters=def.subcategories[world]||[];
    return worlds.includes(world)&&(!filters.length||filters.some(t=>tags.includes(t)));
  })})).filter(p=>p.items.length);
  if(!pools.length)return [];
  const lastUsed=new Map();let elapsed=0,last='',queue=[];
  while(elapsed<def.minutes*60&&queue.length<def.minutes*60){
    const p=pools.map(p=>({...p,score:p.served/p.weight+rng()*5})).sort((a,b)=>a.score-b.score)[0];
    let candidates=p.items.filter(c=>c.id!==last);if(!candidates.length)candidates=p.items;
    const item=candidates.map(c=>({c,score:(lastUsed.get(c.id)??-100000)+rng()*300})).sort((a,b)=>a.score-b.score)[0].c;
    const duration=Math.min(item.duration,def.minutes*60-elapsed);
    if(duration<=0)break;
    queue.push({...item,world:p.world,playSeconds:duration});elapsed+=duration;last=item.id;lastUsed.set(item.id,elapsed);
    pools.find(x=>x.world===p.world).served+=duration;
  }
  return queue;
}
export function hardwareEligible(contract, now=Date.now()) {
  return !!contract && [5,10].includes(contract.years)&&contract.status==='approved'&&!!contract.signed_ref&&contract.expires_at>now;
}
export function activeSchedule(schedules, tvId, timezone, now=Date.now()) {
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:timezone,weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(now));
  const val=t=>parts.find(p=>p.type===t)?.value;const day=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(val('weekday'));
  const current=Number(val('hour'))*60+Number(val('minute'));const mins=t=>Number(t.slice(0,2))*60+Number(t.slice(3));
  return schedules.filter(s=>s.active&&(!s.tv_ids.length||s.tv_ids.includes(tvId))).find(s=>{
    const start=mins(s.start_time),end=mins(s.end_time);
    if(start<end)return s.days.includes(day)&&current>=start&&current<end;
    return (s.days.includes(day)&&current>=start)||(s.days.includes((day+6)%7)&&current<end);
  })||null;
}
export function commission(netCents, refundedCents, bps){return Math.floor(Math.max(0,netCents-refundedCents)*bps/10000);}
