import {openDatabase} from '../apps/server/db.mjs';
import {configuration} from '../apps/server/app.mjs';
import {passwordHash,token} from '../apps/server/security.mjs';
const args=process.argv.slice(2);const value=(name,fallback='')=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
const email=value('--email').trim().toLowerCase(),role=value('--role','admin'),name=value('--name','MIXXWAVE Administrator'),brand=value('--brand');
if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!['admin','brand','venue'].includes(role)||(role==='brand'&&!brand)){
 console.error('Usage: npm run admin -- --email owner@example.com [--name Name] [--role admin|brand|venue] [--brand ID]');process.exit(1);
}
const password=process.env.MIXX_ADMIN_PASSWORD||token(18);if(password.length<12)throw Error('Use at least 12 password characters.');
const db=openDatabase(configuration().DB_PATH),existing=db.get('SELECT id FROM users WHERE email=?',email),digest=await passwordHash(password);
if(existing){db.run('UPDATE users SET password_hash=?,platform_role=?,brand_id=? WHERE id=?',digest,role,brand||null,existing.id);db.run('DELETE FROM sessions WHERE user_id=?',existing.id);}
else db.run('INSERT INTO users(id,email,password_hash,name,platform_role,brand_id,created_at) VALUES(?,?,?,?,?,?,?)',crypto.randomUUID(),email,digest,name,role,brand||null,Date.now());
db.close();console.log(`Account ready: ${email} (${role}). Existing sessions revoked.`);if(!process.env.MIXX_ADMIN_PASSWORD)console.log(`Generated password: ${password}\nStore this securely. It is not saved in the repository.`);
