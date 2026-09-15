import {openDatabase} from '../apps/server/db.mjs';
import {configuration} from '../apps/server/app.mjs';
import {resolve,dirname} from 'node:path';
import {mkdirSync} from 'node:fs';
const config=configuration(),target=resolve(process.argv[2]||`data/backups/mixxpro-${Date.now()}.sqlite`);
mkdirSync(dirname(target),{recursive:true,mode:0o700});const db=openDatabase(config.DB_PATH);
db.run('VACUUM INTO ?',target);db.close();console.log('Consistent database backup created:',target);
