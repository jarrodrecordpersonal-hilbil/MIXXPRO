/** Drain the TV's persisted playback reports in bounded, acknowledged batches.
 * A successful HTTP request is not proof that every event was accepted.
 * Never delete an event without an ID acknowledged for that very batch.
 */
export async function drainEventOutbox({
  readEvents,
  sendEvents,
  deleteEvent,
  active = () => true,
  batchSize = 100,
  maxBatches = 3
}) {
  let acknowledged = 0, rejected = 0;
  for (let batch = 0; batch < maxBatches && active(); batch++) {
    const queued = (await readEvents()).slice(0, batchSize);
    if (!queued.length || !active()) break;
    const result = await sendEvents(queued);
    const sent = new Set(queued.map(event => event.id));
    const accepted = Array.isArray(result?.accepted) ? result.accepted : [];
    const invalid = Array.isArray(result?.rejected) ? result.rejected : [];
    const confirmed = new Set([...accepted, ...invalid.map(event => event?.id)]
      .filter(id => typeof id === 'string' && sent.has(id)));
    for (const id of confirmed) await deleteEvent(id);
    acknowledged += confirmed.size;
    rejected += invalid.filter(event => confirmed.has(event?.id)).length;
    // Do not spin on a server response that acknowledges only part of its batch.
    if (confirmed.size !== queued.length) break;
  }
  return {acknowledged, rejected};
}
