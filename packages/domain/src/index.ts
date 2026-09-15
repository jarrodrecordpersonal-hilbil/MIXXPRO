export const MIXX_WORLDS = ["bourbon","golf","travel","cigar","food","cocktails","music","outdoors"] as const;
export type MixxWorld = typeof MIXX_WORLDS[number];
export type MixWeight = "less"|"normal"|"more";
export type VenuePlan = "free"|"paid"|"premium";
export type ThemeKey = "classic-rickhouse"|"modern-luxury"|"speakeasy"|"sports-lounge"|"rustic-clubhouse"|"high-energy"|"minimal"|"custom";
export type MixxDefinition = {mode:"single";world:MixxWorld;seed:number}|{mode:"blend";worlds:Partial<Record<MixxWorld,MixWeight>>;seed:number};
export type TvCommandType = "play"|"pause"|"next"|"shuffle"|"set_mixx"|"set_theme"|"restart";
export interface TvCommand{id:string;tvId:string;type:TvCommandType;payload?:unknown;createdAt:string;acknowledgedAt?:string}
export interface PlaybackContext{venueId:string;tvId:string;contentId:string;campaignId?:string;playbackId:string}
export const weightScore=(w:MixWeight)=>w==="more"?3:w==="normal"?2:1;
export function normalizeBlend(worlds:Partial<Record<MixxWorld,MixWeight>>){const entries=Object.entries(worlds) as [MixxWorld,MixWeight][];const total=entries.reduce((n,[,w])=>n+weightScore(w),0);return entries.map(([world,weight])=>({world,weight,share:total?weightScore(weight)/total:0}));}
