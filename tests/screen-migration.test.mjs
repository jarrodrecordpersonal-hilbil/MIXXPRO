import test from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../apps/server/db.mjs';
test('music setup and screen history migrations coexist without overwriting either schema',()=>{const db=openDatabase(':memory:');try{assert.deepEqual(db.all('SELECT version FROM migrations ORDER BY version').map(r=>r.version),[1,2,3,4,5,6,7,8]);for(const name of ['music_requests','venue_locations','playback_context','events','ledger'])assert.ok(db.get('SELECT name FROM sqlite_master WHERE type=\'table\' AND name=?',name));}finally{db.close();}});
