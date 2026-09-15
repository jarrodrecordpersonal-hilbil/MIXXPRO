import {readdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const files=[];function walk(root){for(const e of readdirSync(root,{withFileTypes:true})){if(['.git','node_modules','data','artifacts'].includes(e.name))continue;const p=join(root,e.name);if(e.isDirectory())walk(p);else if(/\.(mjs|js)$/.test(p))files.push(p);}}walk('.');
let failed=false;for(const f of files){const r=spawnSync(process.execPath,['--check',f],{encoding:'utf8'});if(r.status){console.error(f,r.stderr);failed=true;}}
const ui=['apps/web/public/app.mjs','apps/web/public/index.html','apps/player/public/index.html'].map(p=>readFileSync(p,'utf8')).join('\n');
if(/\bSets\b/.test(ui)){console.error('Forbidden product terminology in UI');failed=true;}
console.log(`${files.length} JavaScript modules syntax checked; UI terminology checked.`);if(failed)process.exit(1);
