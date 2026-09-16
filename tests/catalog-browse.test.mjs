import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const route=readFileSync(new URL('../apps/server/routes/venue.mjs',import.meta.url),'utf8');

test('catalog requires venue access and returns only published ready rights-confirmed content',()=>{
  assert.match(route,/path==='\/api\/catalog'/);
  assert.match(route,/const \{venue\}=access\(req\)/);
  assert.match(route,/status='published'/);
  assert.match(route,/ready=1/);
  assert.match(route,/rights_confirmed=1/);
  assert.match(route,/rights_until IS NULL OR rights_until>\?/);
});

test('catalog keeps premium gating and does not expose Bunny asset IDs',()=>{
  assert.match(route,/venue\.plan!=='premium'&&c\.premium_only/);
  const mapping=route.match(/const content=rows[\s\S]*?return json\(res,200/)[0];
  assert.doesNotMatch(mapping,/asset_id:c\.asset_id/);
  assert.match(mapping,/title:c\.title/);
  assert.match(mapping,/tags:parse\(c\.tags,\[\]\)/);
});
