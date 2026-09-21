import {fail} from '../../packages/domain/src/runtime.mjs';

export const BILLBOARD_TEMPLATES=Object.freeze([
 {id:'store-pick',name:'The store selection',label:'Editable template',kind:'barrel-pick',title:'Meet your next store pick.',description:'Selected by our team. Ask us for the story behind this week’s selection.'},
 {id:'tasting',name:'Join the tasting',label:'Editable template',kind:'event',title:'A night for discovery.',description:'Join our next tasting. Ask in store for the date and details.'},
 {id:'mixxwave',name:'Discover your MIXX',label:'MIXXWAVE house message',kind:'event',title:'Find your kind of MIXX.',description:'Great stories. Fresh discoveries. Right here on MIXXWAVE.'},
]);

export function localTime(stamp,timeZone){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(stamp).map(p=>[p.type,p.value]));
 return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
export function scheduleTime(value,timeZone){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))fail(400,'Choose a complete date and time.');
 const guess=Date.parse(value+'Z');
 if(!Number.isFinite(guess)||guess<0||guess>=Date.UTC(2100,0,1)||new Date(guess).toISOString().slice(0,16)!==value)fail(400,'Choose a valid date and time before 2100.');
 // Named-zone wall time must resolve to exactly one instant, including DST edges.
 const offsets=new Set([-36,-12,0,12,36].map(h=>{const t=guess+h*3600000;return Date.parse(localTime(t,timeZone)+'Z')-t;}));
 const matches=[...offsets].map(offset=>guess-offset).filter(t=>localTime(t,timeZone)===value);
 if(matches.length!==1)fail(400,matches.length?'That time occurs twice when the clocks change. Choose a time before or after that hour.':'That time does not exist when the clocks change. Choose another time.');
 return matches[0];
}
export function destination(value,text){
 const raw=text(value??'','QR destination',1800,true);if(!raw)return '';
 let url;try{url=new URL(raw);}catch{fail(400,'Enter a complete HTTPS QR destination.');}
 if(url.protocol!=='https:'||url.username||url.password)fail(400,'Use an HTTPS destination without a username or password.');
 return url.href;
}
export function billboardView(db,row,timeZone,stamp){
 const p=row.promotion_id?db.get('SELECT active,starts_at,ends_at FROM promotions WHERE id=? AND venue_id=?',row.promotion_id,row.venue_id):null;
 const published=row.published_json?JSON.parse(row.published_json):null;
 const status=!p||!p.active?'draft':p.ends_at<=stamp?'expired':p.starts_at>stamp?'scheduled':'published';
 return {id:row.id,title:row.title,description:row.description,qrUrl:row.qr_url,templateId:row.template_id,groupName:row.group_name,startsLocal:localTime(row.starts_at,timeZone),endsLocal:localTime(row.ends_at,timeZone),startsAt:row.starts_at,endsAt:row.ends_at,revision:row.revision,publishedRevision:row.published_revision,status,published,updatedAt:row.updated_at};
}
export function billboardFor(db,tv,settings,stamp){
 if(settings.playbackMode==='clean'||settings.showVenuePromotions===false)return null;
 const rows=db.all('SELECT b.*,p.title AS live_title,p.description AS live_description,p.starts_at AS live_start,p.ends_at AS live_end FROM venue_billboards b JOIN promotions p ON p.id=b.promotion_id AND p.venue_id=b.venue_id WHERE b.venue_id=? AND p.active=1 AND p.starts_at<=? AND p.ends_at>? ORDER BY b.published_at DESC,b.id',tv.venue_id,stamp,stamp);
 const eligible=rows.map(row=>({row,published:JSON.parse(row.published_json)})).filter(({published:p})=>!p.groupName||p.groupName===(tv.group_name||''));
 eligible.sort((a,b)=>Number(!!b.published.groupName)-Number(!!a.published.groupName));
 const selected=eligible[0];if(!selected)return null;
 const {row,published}=selected;
 return {id:row.id,revision:row.published_revision,title:row.live_title,description:row.live_description,startsAt:row.live_start,endsAt:row.live_end,expiresAt:Math.min(row.live_end,stamp+15000),qrCode:settings.showQr!==false&&published.qrUrl?row.qr_code:null};
}
