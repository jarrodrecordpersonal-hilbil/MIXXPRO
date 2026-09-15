type CachedAsset={contentId:string;url:string;expiresAt:number};type OfflineEvent={sequence:number;type:string;payload:unknown;occurredAt:string};
export class MixxPlayer{private sequence=0;private cache=new Map<string,CachedAsset>();private offline:OfflineEvent[]=[];constructor(private tvId:string,private apiBase:string){}
 async heartbeat(){return this.post('/player/heartbeat',{tvId:this.tvId,cacheSeconds:this.cacheSeconds()})}
 async syncManifest(){const manifest=await fetch(`${this.apiBase}/player/manifest?tv=${encodeURIComponent(this.tvId)}`).then(r=>r.json()) as {assets:CachedAsset[]};manifest.assets.forEach(a=>this.cache.set(a.contentId,a));return manifest}
 async pollCommands(){const commands=await fetch(`${this.apiBase}/player/commands?tv=${encodeURIComponent(this.tvId)}`).then(r=>r.json()) as {id:string;type:string;payload?:unknown}[];for(const command of commands){await this.execute(command);await this.post('/player/commands/ack',{id:command.id})}}
 async emit(type:string,payload:unknown){const event={sequence:++this.sequence,type,payload,occurredAt:new Date().toISOString()};try{await this.post('/player/events',event)}catch{this.offline.push(event)}}
 async flush(){const pending=[...this.offline];for(const event of pending){try{await this.post('/player/events',event);this.offline.shift()}catch{break}}}
 private cacheSeconds(){return this.cache.size*600}
 private async execute(command:{type:string;payload?:unknown}){if(command.type==='restart')location.reload();window.dispatchEvent(new CustomEvent('mixx-command',{detail:command}))}
 private async post(path:string,body:unknown){const r=await fetch(this.apiBase+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});if(!r.ok)throw new Error(`player API ${r.status}`);return r.json()}
}
