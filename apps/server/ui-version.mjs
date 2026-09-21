import {createHash} from 'node:crypto';
import {readdirSync,readFileSync} from 'node:fs';
import {join,relative} from 'node:path';

/** Fingerprint public UI source only. Stable across restarts and checkout paths. */
export function uiVersion(root){
 const files=[];
 const walk=directory=>{for(const entry of readdirSync(directory,{withFileTypes:true})){const path=join(directory,entry.name);if(entry.isDirectory())walk(path);else if(entry.isFile())files.push(path);}};
 walk(join(root,'apps/web/public'));walk(join(root,'apps/web/screens'));
 files.push(join(root,'packages/domain/src/runtime.mjs'));
 const hash=createHash('sha256');
 for(const file of files.sort()){hash.update(relative(root,file));hash.update('\0');hash.update(readFileSync(file));hash.update('\0');}
 return hash.digest('hex');
}
