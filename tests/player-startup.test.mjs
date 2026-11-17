import test from 'node:test';
import assert from 'node:assert/strict';
import {loadSavedCredential} from '../apps/player/public/startup.mjs';

test('a slow credential read returns the existing pairing instead of starting a new one',async()=>{
  let attempts=0;
  const credential=await loadSavedCredential(async()=>{attempts++;await new Promise(resolve=>setTimeout(resolve,40));return {value:'paired-device-secret'};},{timeoutMs:200});
  assert.equal(credential,'paired-device-secret');
  assert.equal(attempts,1);
});

test('an actual empty credential store allows a first-time TV to pair',async()=>{
  let retried=false;
  const credential=await loadSavedCredential(async()=>undefined,{timeoutMs:100,onRetry:()=>{retried=true;}});
  assert.equal(credential,null);
  assert.equal(retried,false);
});

test('temporary IndexedDB failures are retried without falsely treating the TV as unpaired',async()=>{
  let count=0,retries=0,sleeps=0;
  const credential=await loadSavedCredential(async()=>{
    count++;
    if(count===1)throw new Error('IndexedDB temporarily locked');
    return {value:'restored-token'};
  },{timeoutMs:100,retryDelayMs:1,onRetry:()=>{retries++;},sleep:async()=>{sleeps++;}});
  assert.equal(credential,'restored-token');
  assert.equal(count,2);
  assert.equal(retries,1);
  assert.equal(sleeps,1);
});

test('a hung IndexedDB request times out and retries rather than displaying a pairing code',async()=>{
  let count=0,retries=0;
  const credential=await loadSavedCredential(()=>{
    count++;
    return count===1 ? new Promise(()=>{}) : Promise.resolve({value:'persisted-token'});
  },{timeoutMs:15,retryDelayMs:1,onRetry:()=>{retries++;},sleep:async()=>{}});
  assert.equal(credential,'persisted-token');
  assert.equal(count,2);
  assert.equal(retries,1);
});
