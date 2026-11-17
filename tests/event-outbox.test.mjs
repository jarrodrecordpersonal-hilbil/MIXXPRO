import test from 'node:test';
import assert from 'node:assert/strict';
import {drainEventOutbox} from '../apps/player/public/event-outbox.mjs';

function outbox(count) {
  const events = new Map(Array.from({length: count}, (_, i) => {
    const id = 'event-' + i;
    return [id, {id, kind: 'tick', seconds: 5}];
  }));
  const batches = [];
  return {
    events, batches,
    readEvents: async () => [...events.values()],
    sendEvents: async rows => {
      batches.push(rows.map(row => row.id));
      return {accepted: rows.map(row => row.id), rejected: []};
    },
    deleteEvent: async id => { events.delete(id); }
  };
}

test('reconnect drains more than one 100-event API batch', async () => {
  const queue = outbox(230);
  const result = await drainEventOutbox(queue);
  assert.deepEqual(result, {acknowledged: 230, rejected: 0});
  assert.deepEqual(queue.batches.map(rows => rows.length), [100, 100, 30]);
  assert.equal(queue.events.size, 0);
});

test('a bounded pass leaves remaining reports for the next reconnect tick', async () => {
  const queue = outbox(260);
  const result = await drainEventOutbox({...queue, maxBatches: 2});
  assert.deepEqual(result, {acknowledged: 200, rejected: 0});
  assert.equal(queue.events.size, 60);
  assert.deepEqual(queue.batches.map(rows => rows.length), [100, 100]);
});

test('only acknowledged events from the submitted batch can be removed', async () => {
  const queue = outbox(4);
  queue.sendEvents = async rows => {
    queue.batches.push(rows.map(row => row.id));
    return {accepted: ['event-0', 'not-in-this-batch'], rejected: [{id: 'event-1', reason: 'invalid_context'}]};
  };
  const result = await drainEventOutbox(queue);
  assert.deepEqual(result, {acknowledged: 2, rejected: 1});
  assert.deepEqual([...queue.events.keys()], ['event-2', 'event-3']);
  assert.equal(queue.batches.length, 1);
});

test('network failure keeps unsent events for a later retry', async () => {
  const queue = outbox(3);
  queue.sendEvents = async () => { throw Error('connection lost'); };
  await assert.rejects(drainEventOutbox(queue), /connection lost/);
  assert.equal(queue.events.size, 3);
});

test('an inactive player does not send queued reports', async () => {
  const queue = outbox(3);
  const result = await drainEventOutbox({...queue, active: () => false});
  assert.deepEqual(result, {acknowledged: 0, rejected: 0});
  assert.equal(queue.batches.length, 0);
  assert.equal(queue.events.size, 3);
});

test('an empty or unacknowledged response cannot cause an endless retry loop', async () => {
  const queue = outbox(101);
  queue.sendEvents = async rows => {
    queue.batches.push(rows.map(row => row.id));
    return {accepted: [], rejected: []};
  };
  const result = await drainEventOutbox(queue);
  assert.deepEqual(result, {acknowledged: 0, rejected: 0});
  assert.equal(queue.events.size, 101);
  assert.equal(queue.batches.length, 1);
});
