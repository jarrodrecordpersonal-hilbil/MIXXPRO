/** Own-store playback telemetry. Validated device reports, NOT human-view attestation. */
export function ingestPlaybackEvents(db, tv, events, now = Date.now()) {
  const accepted = [], rejected = [];
  const reject = (event, reason) => rejected.push({id: typeof event?.id === 'string' ? event.id.slice(0,80) : null, reason});
  const validId = value => typeof value === 'string' && value.length > 0 && value.length <= 80;
  db.transaction(() => {
    for (const e of events) {
      if (!validId(e?.id)) { reject(e, 'invalid_id'); continue; }
      const duplicate = db.get('SELECT tv_id FROM events WHERE id=?',e.id);
      if (duplicate) {
        if (duplicate.tv_id === tv.id) accepted.push(e.id);
        else reject(e, 'invalid_context');
        continue;
      }
      if (!validId(e.playbackId) || !validId(e.manifestId) || !validId(e.contentId) ||
          (e.campaignId != null && !validId(e.campaignId))) { reject(e,'invalid_context'); continue; }
      const m = db.get('SELECT * FROM manifests WHERE id=? AND tv_id=?',e.manifestId,tv.id);
      let issued;
      try { issued = m ? JSON.parse(m.payload) : null; } catch { issued = null; }
      const item = issued?.items?.find(item => item.contentId === e.contentId &&
        (item.campaignId || null) === (e.campaignId || null) && (e.itemIndex == null || item.index === e.itemIndex));
      const timeValid = Number.isSafeInteger(e.occurredAt) && m && e.occurredAt >= m.created_at-5000 &&
        e.occurredAt <= m.expires_at && e.occurredAt <= now+300000 && e.occurredAt >= now-7*86400000;
      if (!item || !timeValid || !['tick','start','complete','skip','error','pause','resume'].includes(e.kind) ||
          !Number.isFinite(e.seconds) || e.seconds < 0 || e.seconds > 30 ||
          (e.sequence != null && (!Number.isSafeInteger(e.sequence) || e.sequence < 1)) ||
          (e.itemIndex != null && (!Number.isSafeInteger(e.itemIndex) || e.itemIndex < 0)) ||
          (e.source != null && !['cache','network','unknown'].includes(e.source))) {
        reject(e,'invalid_context'); continue;
      }
      if (e.sequence != null && db.get('SELECT id FROM events WHERE tv_id=? AND playback_id=? AND sequence=?',tv.id,e.playbackId,e.sequence)) {
        reject(e,'duplicate_sequence'); continue;
      }
      const context = db.get('SELECT * FROM playback_context WHERE tv_id=? AND playback_id=?',tv.id,e.playbackId);
      const old = context || db.get('SELECT manifest_id,content_id,campaign_id FROM events WHERE tv_id=? AND playback_id=? LIMIT 1',tv.id,e.playbackId);
      if (old && (old.manifest_id!==m.id || old.content_id!==e.contentId || (old.campaign_id||null)!==(e.campaignId||null) ||
          (context && context.item_index!==null && context.item_index!==e.itemIndex))) { reject(e,'playback_context_changed'); continue; }
      // Old players did not identify their queue slot. Do not invent exact slot duration for those reports.
      const planned = context?.planned_seconds ?? Math.min(item.duration, e.itemIndex == null ? item.duration : item.playSeconds);
      if (!Number.isFinite(planned) || planned <= 0) { reject(e,'invalid_context'); continue; }
      if (!context) db.run(`INSERT INTO playback_context
        (tv_id,playback_id,venue_id,manifest_id,content_id,campaign_id,brand_id,campaign_name,title,world,venue_name,tv_name,location,planned_seconds,is_demo,item_index)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,tv.id,e.playbackId,tv.venue_id,m.id,e.contentId,e.campaignId||null,
        item.brandId||null,item.campaignName||null,item.title,item.world||null,issued.venueName||null,issued.tvName||null,
        issued.venueLocation ? JSON.stringify(issued.venueLocation) : null,planned,item.demo?1:0,e.itemIndex??null);
      const used = db.get('SELECT COALESCE(SUM(seconds),0) seconds FROM events WHERE tv_id=? AND playback_id=?',tv.id,e.playbackId).seconds;
      const seconds = e.kind === 'tick' ? Math.max(0,Math.min(e.seconds,planned-used)) : 0;
      db.run(`INSERT INTO events (id,tv_id,manifest_id,content_id,campaign_id,playback_id,kind,seconds,occurred_at,received_at,delivery_source,sequence)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,e.id,tv.id,m.id,e.contentId,e.campaignId||null,e.playbackId,e.kind,seconds,e.occurredAt,now,e.source||'unknown',e.sequence??null);
      accepted.push(e.id);
    }
  });
  return {accepted,rejected};
}
