import test from 'node:test';import assert from 'node:assert/strict';import {PRIMARY_PAGES,pageFromPath,resolvePage} from '../apps/web/public/venue-streamline.mjs';
test('primary venue destinations are exactly Home, MIXX, TV and Results',()=>{assert.deepEqual(PRIMARY_PAGES,['home','mixx','tvs','revenue']);assert.equal(Object.isFrozen(PRIMARY_PAGES),true);});
for(const page of ['home','mixx','tvs','revenue','billing','themes','admin','brands'])test(`active ${page} wins over the unchanged root URL`,()=>assert.equal(resolvePage({activePage:page,pathname:'/'}),page));
test('explicit render state wins over a stale route',()=>assert.equal(resolvePage({mainPage:'mixx',pathname:'/tvs'}),'mixx'));
test('active navigation wins over stale main-page metadata',()=>assert.equal(resolvePage({activePage:'tvs',mainPage:'home',pathname:'/'}),'tvs'));
test('URL fallback supports root, known routes and trailing slashes',()=>{for(const [path,page] of [['/','home'],['/mixx/','mixx'],['/tvs/','tvs'],['/revenue/','revenue']])assert.equal(resolvePage({pathname:path}),page);});
test('unrelated pages are not classified as Home',()=>{for(const path of ['/player/','/screens','/setup','/music','/unknown'])assert.equal(pageFromPath(path),null);});
