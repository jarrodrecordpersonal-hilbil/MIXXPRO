const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const encode = encodeURIComponent;
const formData = form => Object.fromEntries(new FormData(form));
const date = stamp => stamp ? new Intl.DateTimeFormat(undefined, {month:'short', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit', timeZoneName:'short'}).format(stamp) : 'Dates to be announced';
const localDate = stamp => {const d = new Date(stamp); return new Date(stamp - d.getTimezoneOffset() * 60000).toISOString().slice(0,16);};
const stageKeys = ['round1', 'round2', 'last-chance', 'final'];
const state = {resultScope: 'blends', resultBatch: '', dirty: false, preview: null, previewChecked: false, previewJudge: '1', code: location.pathname.split('/')[2] || '', view: new URL(location.href).searchParams.get('view') || 'play', data: null, index: null, host: null, judge: null, busy: false, online: true, authMode: 'login'};
const account = () => state.data?.account || state.index?.account || {};
function notice(message, error = false) {
  const node = $('#notice'); node.hidden = !message; node.textContent = message;
  node.className = 'notice' + (error ? ' error' : ''); node.setAttribute('role', error ? 'alert' : 'status');
}
async function api(path, body) {
  const response = await fetch(path, {method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin',
    headers: {'Content-Type':'application/json', ...(state.preview ? {'X-Preview-Judge':state.previewJudge} : {}), ...(account().csrf ? {'X-CSRF-Token': account().csrf} : {})},
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000)});
  const result = await response.json();
  if (!response.ok) { const error = new Error(result.error || 'This action could not be completed.'); error.status = response.status; throw error; }
  return result;
}
async function action(fn, success = '') {
  if (state.busy) return;
  const controls = [...$('#workspace').querySelectorAll('button')].map(node => [node, node.disabled]);
  const unsaved = [...$('#workspace').querySelectorAll('input,textarea,select')].map(node => ({name:node.name, component:node.dataset.component, value:node.value, checked:node.checked}));
  state.busy = true; $('#workspace').classList.add('busy');
  controls.forEach(([node]) => node.disabled = true);
  let refresh = false, preserve = false;
  try { await fn(); state.dirty = false; await load(); refresh = true; notice(success); }
  catch (error) {
    if (error.status === 409 && state.view === 'enter') {
      try { await load(); refresh = true; preserve = true; } catch {}
    }
    notice(error.message || 'Connection lost. Your unsent changes have not been saved.', true);
  } finally {
    state.busy = false; $('#workspace').classList.remove('busy');
    if (refresh) {
      render();
      if (preserve) for (const saved of unsaved) {
        const node = [...$('#workspace').querySelectorAll('input,textarea,select')].find(el => saved.component ? el.dataset.component === saved.component : saved.name && el.name === saved.name);
        if (node) { node.value = saved.value; node.checked = saved.checked; node.dispatchEvent(new Event('input')); }
      }
    } else controls.forEach(([node, disabled]) => node.disabled = disabled);
  }
}
function button(label, attrs = '', primary = false) {return `<button class="button ${primary ? 'primary' : 'outline'}" ${attrs}>${label}</button>`;}
function changeView(view) {
  if (state.busy) return;
  if (state.dirty && !confirm('You have unsaved changes. Leave without saving?')) return;
  state.dirty = false; state.view = view; notice('');
  const url = new URL(location.href); url.searchParams.set('view', view); history.replaceState(null, '', url);
  if (view === 'host' || view === 'judge') load().catch(error => notice(error.message, true));
  else render();
  $('#workspace').scrollIntoView({behavior:'smooth', block:'start'});
}
function previewTools() {
  if (!state.preview) return '';
  return `<article class="panel preview-tools"><p class="eyebrow">OPEN BUILD PREVIEW · NO SIGN-IN</p><h2>Try every side of the game.</h2><p>These are shared fictional teams, whiskeys and scores. Anyone with the link can operate the demo. Do not enter real personal details or recipes. Changes reset on restart or when someone resets the demo.</p><div class="hero-actions">${button('Try judge desk','data-go="judge"')}${button('Try producer desk','data-go="host"')}${button('Reset shared demo','data-preview-reset')}</div></article>`;
}
function authPanel() {
  if (state.preview) return previewTools();
  if (account().signedIn) {
    if (!account().profile && state.view === 'enter') return `<article class="panel auth-panel"><p class="eyebrow">YOUR PLAYER PROFILE</p><h2>What should we call you?</h2><p>This is your public player name, not your email.</p><form id="profile-form"><label class="field"><span>Public player name</span><input name="name" required maxlength="40" autocomplete="nickname"></label>${button('Save player name', 'type="submit"', true)}</form></article>`;
    return `<article class="panel auth-panel"><p class="eyebrow">YOUR ACCOUNT</p><h2>${esc(account().profile?.displayName || 'Signed in')}</h2><p>${esc(account().email)}</p>${button('Sign out', 'id="logout"')}</article>`;
  }
  const register = state.authMode === 'register';
  return `<article class="panel auth-panel"><p class="eyebrow">ONE ACCOUNT. YOUR SAVED BLENDS.</p><h2>${register ? 'Create your player account.' : 'Welcome back.'}</h2><p>Use the same account as MIXXWAVE and Bourbon Games. Audience predictions also work as a guest.</p><form id="auth-form">
    ${register ? '<label class="field"><span>Public player name</span><input name="name" autocomplete="nickname" maxlength="40" required></label>' : ''}
    <label class="field"><span>Email</span><input type="email" name="email" autocomplete="email" maxlength="254" required></label>
    <label class="field"><span>Password${register ? ' · at least 12 characters' : ''}</span><input type="password" name="password" autocomplete="${register ? 'new-password' : 'current-password'}" ${register ? 'minlength="12"' : ''} maxlength="200" required></label>
    ${button(register ? 'Create account' : 'Sign in', 'type="submit"', true)}</form>
    <p class="auth-switch">${register ? 'Already have an account?' : 'New here?'} <button class="text" id="auth-switch">${register ? 'Sign in' : 'Create an account'}</button></p>
    <p class="fine">Restricted pilot: password recovery and email verification are not available yet. Use test credentials while testing. Public player names and scores are visible; your email and recipe are not public.</p></article>`;
}
function board(rows, empty = 'Scores appear after a reveal.') {
  if (!rows?.length) return `<p class="empty">${empty}</p>`;
  let previous, rank = 0;
  return rows.slice(0, 20).map((row, index) => {if (row.totalPoints !== previous) rank = index + 1; previous = row.totalPoints;
    return `<div class="board-row"><span><i>${rank.toString().padStart(2,'0')}</i><b>${esc(row.name)}</b></span><strong>${row.totalPoints} pts</strong></div>`;}).join('');
}
function playPanel() {
  const d = state.data, event = d?.spotlight, target = d?.intake;
  return `<div class="grid"><article class="panel join-now"><p class="eyebrow">WATCH. PICK. WIN POINTS.</p><h2>${event ? 'Who takes this round?' : 'Your place in the game starts here.'}</h2>
    <p>${event ? (event.phase === 'predictions' ? 'A prediction round is open. Join now and make your picks before the server locks them.' : 'Join the room now. You can play the next unlocked prediction—even if earlier results have already been revealed.') : 'The producer is preparing the next show. Team entry stays open, and this page will show the next playable round as soon as it is ready.'}</p>
    ${event ? `<a class="button primary" id="play-event" href="/games/${encode(event.code)}">JOIN & PLAY <span aria-hidden="true">↗</span></a>` : button('Enter a blend', 'data-go="enter"', true)}
    <p class="fine">No purchase required for predictions. Missed points are not penalties. Each reveal has its own audience standings.</p>
  </article><article class="panel"><p class="eyebrow">NEXT CHANCE TO COMPETE</p><h2>${esc(target?.name || 'Next competition intake')}</h2><p>${esc(target?.explanation || 'Choose the next published season to enter.')}</p><p><strong>${target?.closesAt ? 'Recipe deadline' : 'Entry destination'}</strong><br>${esc(date(target?.closesAt))}</p>${button('Start your team’s blend →', 'data-go="enter"')}</article></div>`;
}
function recipePanel() {
  if (!account().signedIn || !account().profile) return authPanel();
  const d = state.data; if (!d) return '<p class="empty">A producer needs to create the first season before team entries can be saved.</p>';
  const draft = d.myEntries.find(row => row.status === 'draft'), queued = d.myEntries.find(row => row.status === 'queued');
  const components = draft?.components || d.season.components;
  const target = d.intake;
  const values = new Map((draft?.recipe || []).map(row => [row.code, row.bps / 100]));
  const canCreate = !queued;
  return `<div class="grid"><article class="panel"><div class="row"><p class="eyebrow">${draft ? 'YOUR SAVED DRAFT' : 'MAKE YOUR ENTRY'}</p><span class="badge">${state.preview ? 'SHARED TEST RECIPE' : 'PRIVATE RECIPE'}</span></div><h2>${queued ? 'Your blend is in the intake queue.' : draft ? 'Keep working on your blend.' : 'Start with a good name.'}</h2>
    ${queued ? `<p>Your recipe is saved and locked. It is not entered in the already-locked championship. The next intake date has not been promised.</p><p><strong>${esc(queued.blendName)}</strong></p>${target.batchId ? button('Review & enter the new judging batch', 'id="place-queued"', true) : ''}` : `<form id="recipe-form" data-id="${esc(draft?.id || '')}" data-revision="${draft?.revision || 0}" data-target="${esc(target.key)}">
      <h3 class="step-heading"><span>1</span> Name your team &amp; blend</h3><div class="form-grid"><label class="field"><span>Team name</span><input name="teamName" value="${esc(d.team?.name || '')}" ${d.team ? 'readonly' : ''} maxlength="60" required placeholder="Your club, crew or just you"></label><label class="field"><span>Blend name</span><input name="blendName" value="${esc(draft?.blendName || '')}" maxlength="70" required placeholder="Give it a name"></label></div>
      <p class="fine">${state.preview ? 'TEST RECIPE ONLY. Anyone using this preview can see or change the shared example entry. ' : ''}Use the labeled A–D components—not the House Pour. Your recipe must add up to 100%.</p>
      <h3 class="step-heading"><span>2</span> Build your recipe</h3>${components.map(component => `<div class="component"><span class="code">${esc(component.code)}</span><label for="pct-${esc(component.code)}">${esc(component.name)}<small>Share of your finished blend</small></label><div class="percent-stepper"><button type="button" data-adjust="-5" data-for="pct-${esc(component.code)}" aria-label="Reduce ${esc(component.code)} by 5 percentage points">−</button><input id="pct-${esc(component.code)}" data-component="${esc(component.code)}" type="number" inputmode="decimal" step="0.01" min="0" max="100" value="${values.get(component.code) ?? 0}" required aria-label="${esc(component.name)} percentage"><button type="button" data-adjust="5" data-for="pct-${esc(component.code)}" aria-label="Increase ${esc(component.code)} by 5 percentage points">+</button></div></div>`).join('')}
      <div class="total-line"><span>RECIPE TOTAL</span><output id="recipe-total">0.00%</output></div><p id="recipe-hint" class="fine" aria-live="polite"></p><details class="trial-help"><summary>How much do I pour for a small test?</summary><label class="field"><span>Trial blend size</span><select id="trial-size"><option value="10">10 mL trial</option><option value="20">20 mL trial</option></select></label><p id="trial-recipe"></p><p class="fine">Amounts are a measuring guide for one trial, not an inventory tracker or a recommendation to consume it all. Use your actual remaining liquid.</p></details><h3 class="step-heading"><span>3</span> Save, then submit when ready</h3>
      ${!draft ? '<label class="check"><input name="age21" type="checkbox" required><span>All competing team members are 21 or older.</span></label>' : ''}
      ${!target.batchId ? '<label class="check"><input id="accept-queue" type="checkbox" required><span>I understand this goes into the next eligible competition intake, not the locked championship. No judging date has been set.</span></label>' : ''}
      <div class="hero-actions">${button(draft ? 'Save draft' : 'Create & save draft', 'type="submit" data-submit="draft"', true)}${draft ? button('Submit & lock recipe', 'type="submit" data-submit="final"') : ''}</div>
      <p class="fine">Saving a draft does not reserve a judging place. Submitted recipes cannot be edited. No bottle purchase changes the judging score.</p></form>`}
  </article><div><article class="panel"><p class="eyebrow">CONFIRM YOUR DESTINATION</p><h2 id="intake-name">${esc(target.name)}</h2><p>${esc(target.explanation)}</p><p><strong>Submit by</strong><br>${esc(date(target.closesAt))}</p><p class="fine">The server checks this again when you submit. A full or closed batch moves your opportunity forward only after you review the new destination.</p></article>
  <article class="panel"><p class="eyebrow">YOUR ENTRIES</p>${d.myEntries.length ? d.myEntries.map(entry => `<div class="saved-entry"><div class="row"><strong>${esc(entry.blendName)}</strong><span class="badge ${entry.status === 'submitted' ? 'good' : ''}">${esc(entry.status)}</span></div><p>${esc(entry.batchName || 'Next competition intake')}</p>${entry.submittedAt ? `<p>Locked ${esc(date(entry.submittedAt))}</p>` : ''}</div>`).join('') : `<p>Your first saved draft will appear here. ${state.preview ? 'This is a shared example captain; no account is needed.' : 'Sign in on another device to pick up where you left off.'}</p>`}</article></div></div>`;
}
function resultsPanel() {
  const d = state.data, batches = d?.batches.filter(batch => batch.results.length) || [];
  const selected = batches.find(batch => batch.id === state.resultBatch) || batches.at(-1);
  const scope = `<div class="score-switch" aria-label="Score type"><button data-score-scope="blends" aria-pressed="${state.resultScope === 'blends'}">Blend scores</button><button data-score-scope="players" aria-pressed="${state.resultScope === 'players'}">Player scores</button></div>`;
  if (state.resultScope === 'players') return scope + `<section class="panel score-intro"><p class="eyebrow">WHISKEY DRAFT · PREDICTION GAME</p><h2>Your next round starts fresh.</h2><p>Pick the winning sample and each judge’s favorite. These points never change the blend competition.</p>${d?.audience ? `<p class="fine">Event ${esc(d.audience.eventCode)} · Published results only</p>` : ''}</section><div class="grid"><article class="panel"><p class="eyebrow">MOST RECENT REVEAL</p><h2>This round</h2>${board(d?.audience?.roundStandings,'No points published yet. Join the next open prediction.')}</article><article class="panel"><p class="eyebrow">ALL REVEALED ROUNDS</p><h2>This show</h2>${board(d?.audience?.eventStandings)}<details><summary>How points work</summary><p>1 point for the correct winning sample + 1 for each correct judge pick. An exact judge tie awards no judge-pick point. Equal points share a rank.</p></details></article></div><div class="next-play">${button('Play the next round →','data-go="play"',true)}<p>Joining late? You can still play any open round.</p></div>`;
  if (!selected) return scope + `<article class="panel score-empty"><p class="eyebrow">SCOREBOARD</p><div class="empty-score" aria-hidden="true">— : —</div><h2>First result coming up.</h2><p>No scores have been published. Join the next open prediction, or enter your blend in the next judging group.</p><div class="hero-actions">${button('Join & play →','data-go="play"',true)}${button('Enter a blend','data-go="enter"')}</div></article>`;
  const complete = selected.status === 'complete', leaders = selected.results.filter(row => row.rank === 1);
  const winner = complete && leaders.length === 1 ? leaders[0] : null;
  const label = complete ? (winner ? 'FLIGHT WINNER' : 'FINAL SCORES · TIED LEAD') : 'RESULTS COMING IN';
  const choices = batches.length > 1 ? `<label class="field"><span>Judging group</span><select id="score-batch">${batches.map(b => `<option value="${esc(b.id)}" ${b.id === selected.id ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select></label>` : '';
  return scope + `<section class="score-feature"><div><p class="eyebrow">${label}</p><h2>${winner ? esc(winner.teamName) : complete ? 'An even finish.' : 'Every reveal counts.'}</h2><p>${winner ? esc(winner.blendName) : complete ? 'The published rankings below show the tie.' : 'Only revealed scores appear below. The flight is not final.'}</p><p class="score-event">${esc(selected.name)}</p></div><div class="score-number">${winner ? `<strong>${winner.average.toFixed(2)}</strong><span>JUDGES’ SCORE / 100</span>` : `<strong>${selected.results.length}</strong><span>BLENDS REVEALED</span>`}</div></section>
    <article class="panel"><div class="row"><div><p class="eyebrow">${complete ? 'FINAL FLIGHT STANDINGS' : 'PUBLISHED SCORES · NO FINAL RANK YET'}</p><h2>${complete ? 'The final whistle.' : 'The scores so far.'}</h2></div><span class="badge ${complete ? 'good' : ''}">${complete ? 'FINAL' : 'IN PROGRESS'}</span></div>${choices}<div class="table-wrap"><table class="results-table"><caption class="sr-only">${esc(selected.name)}. ${complete ? 'Final ranks' : 'Partial results; ranks are not final'}. Judges’ scores out of 100.</caption><thead><tr><th scope="col">Rank</th><th scope="col">Team / blend</th><th scope="col">Score / 100</th></tr></thead><tbody>${selected.results.map(row => `<tr><td>${row.rank || '—'}</td><td><strong>${esc(row.teamName)}</strong><small>${esc(row.blendName)} · ${esc(row.sample)}</small>${row.qualified ? '<span class="qualifier">CHAMPIONSHIP QUALIFIER</span>' : ''}</td><td><strong>${row.average.toFixed(2)}</strong></td></tr>`).join('')}</tbody></table></div>${selected.resolutionNote ? `<p class="notice">${esc(selected.resolutionNote)}</p>` : ''}<details><summary>How the judges score</summary><p>${esc(d.season.scoring)}</p><p>Scores apply to this judging group only. We do not compare different panels as one flight.</p></details></article><div class="next-play">${button('Play the next round →','data-go="play"',true)}${button('Enter your blend','data-go="enter"')}</div>`;
}
function judgePanel() {
  if (!account().signedIn) return authPanel();
  const tasks = state.judge?.tasks;
  if (!tasks?.length) return '<article class="panel"><p class="eyebrow">BLIND JUDGING</p><h2>No assigned flight yet.</h2><p>The producer must assign your existing account to a judging batch. This desk never shows other judges’ scorecards or team identities.</p></article>';
  const selector = state.preview ? `<article class="panel"><p class="eyebrow">TRY A JUDGE · NO LOGIN REQUIRED</p><label class="field"><span>Demo judge</span><select id="preview-judge">${state.preview.judges.map(j => `<option value="${esc(j.key)}" ${j.key === state.previewJudge ? 'selected' : ''}>${esc(j.name)}</option>`).join('')}</select></label><p class="fine">Each demo judge has their own scorecards. You can switch between them here. Scores still lock normally; reset the shared demo to start over.</p></article>` : '';
  return selector + tasks.map(task => `<article class="panel"><div class="row"><div><p class="eyebrow">${state.preview ? 'DEMO' : 'PRIVATE'} JUDGE DESK · ${esc(task.judgeName)}</p><h2>${esc(task.batchName)}</h2></div><span class="badge">${esc(task.status)}</span></div><p class="fine">${esc(state.judge.scoring)} ${state.preview ? 'Example notes are visible to anyone switching demo judges.' : 'Your notes stay private.'} A locked card cannot be changed.</p>
    ${task.entries.map(entry => {const card = task.cards.find(c => c.entryId === entry.id), locked = card?.lockedAt != null || task.status === 'complete'; return `<form class="scorecard ${locked ? 'locked' : ''}" data-batch="${esc(task.batchId)}" data-entry="${esc(entry.id)}" data-revision="${card?.revision || 0}"><div class="row"><h3>${esc(entry.sample)}</h3><span class="badge ${locked ? 'good' : ''}">${locked ? 'LOCKED' : card ? 'SAVED DRAFT' : 'NOT SCORED'}</span></div><div class="score-grid">${['aroma','palate','balance','finish'].map(key => `<label>${key[0].toUpperCase() + key.slice(1)} / 25<input name="${key}" type="number" min="0" max="25" step="1" inputmode="numeric" value="${card?.[key] ?? ''}" required ${locked ? 'disabled' : ''}></label>`).join('')}</div><label class="sr-only" for="notes-${esc(entry.id)}">Private tasting notes for ${esc(entry.sample)}</label><textarea id="notes-${esc(entry.id)}" name="notes" maxlength="1000" placeholder="Private tasting notes" ${locked ? 'disabled' : ''}>${esc(card?.notes || '')}</textarea>${locked ? `<p class="fine">Your total: ${['aroma','palate','balance','finish'].reduce((n,k) => n + (card?.[k] || 0), 0)} / 100</p>` : `<div class="actions">${button('Save scorecard', 'type="submit" data-lock="false"')}${button('Lock final scorecard', 'type="submit" data-lock="true"', true)}</div>`}</form>`;}).join('')}</article>`).join('');
}
function componentsText(components) {return components.map(c => c.code + ' | ' + c.name).join('\n');}
function stagesInputs(stages) {return `<div class="form-grid">${stages.filter(s => s.key !== 'final').map(s => `<label class="field"><span>${esc(s.label)} · total places</span><input name="slots-${esc(s.key)}" type="number" min="0" max="20" value="${s.slots}" required></label>`).join('')}</div>`;}
function seasonForm(create = false) {
  const season = state.host?.season || {name:'Bourbon Games · Season One', code:'BG2627', components:[{code:'A',name:'Component A — select exact whiskey batch'},{code:'B',name:'Component B — select exact whiskey batch'},{code:'C',name:'Component C — select exact whiskey batch'}], stages:[{key:'round1',label:'Round 1 · late 2026',slots:2},{key:'round2',label:'Round 2 · first half of 2027',slots:2},{key:'last-chance',label:'Last-chance qualification',slots:2},{key:'final',label:'Championship · Q4 2027',slots:0}]};
  return `<form id="season-form" data-create="${create}"><label class="field"><span>Season name</span><input name="name" value="${esc(season.name)}" maxlength="90" required></label>${create ? `<label class="field"><span>Season code</span><input name="code" value="${esc(season.code)}" maxlength="20" required></label>` : ''}<label class="field"><span>Whiskey components · CODE | exact component and batch, one per line</span><textarea name="components" required>${esc(componentsText(season.components))}</textarea></label><p class="fine">Components freeze once the first draft exists. Keep the actual component identifiers consistent for every entrant.</p>${stagesInputs(season.stages)}${button(create ? 'Create season' : 'Save season settings', 'type="submit"', true)}</form>`;
}
function batchForm(batch = null) {
  const stages = state.host.season.stages;
  return `<form class="batch-form" data-id="${esc(batch?.id || '')}" data-revision="${batch?.revision || 0}"><div class="form-grid"><label class="field"><span>Judging batch name</span><input name="name" value="${esc(batch?.name || '')}" placeholder="Next judging flight" maxlength="80" required></label><label class="field"><span>Milestone</span><select name="stage">${stages.map(s => `<option value="${esc(s.key)}" ${s.key === batch?.stage ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}</select></label><label class="field"><span>Recipe deadline · your local time</span><input name="closesAt" type="datetime-local" value="${batch ? localDate(batch.closes_at) : ''}" required></label><label class="field"><span>Championship places for this batch</span><input name="slots" type="number" min="0" max="20" value="${batch?.slots ?? 1}" required></label><label class="field"><span>Judging capacity · overflow moves to the next intake</span><input name="capacity" type="number" min="2" max="100" value="${batch?.capacity ?? 48}" required></label></div><label class="field"><span>Judges · display name | existing account email, one per line</span><textarea name="judges" required placeholder="Judge name | judge@example.com">${esc(batch?.judges.map(j => j.name + ' | ' + j.email).join('\n') || '')}</textarea></label><p class="fine">Use 2–7 different judge accounts. A judge cannot score their own team. Accepted deadlines cannot be shortened.</p>${button(batch ? 'Save batch settings' : 'Add judging batch', 'type="submit"', true)}</form>`;
}
function hostPanel() {
  if (!account().signedIn) return authPanel();
  if (!(state.data?.canManage || state.index?.canManage)) return '<article class="panel"><h2>Producer access required.</h2><p>This account does not have permission to manage competitions.</p></article>';
  if (!state.code || !state.host) return `<article class="panel"><p class="eyebrow">FIRST SEASON SETUP</p><h2>Create the competition.</h2>${seasonForm(true)}</article>`;
  return `<article class="panel"><div class="row"><div><p class="eyebrow">PRODUCER DESK</p><h2>Run the show. Keep entry open.</h2></div>${button('Refresh', 'id="refresh-host"')}</div><p>New viewers use the existing Bourbon Games player. New blends enter the next eligible batch. ${state.preview ? 'This is an open demo: the example sample map is visible to anyone here.' : 'The sample map below is private to administrators.'}</p>${state.preview ? `<div class="hero-actions">${button('Lock demo scorecards','id="preview-lock-scores"',true)}${button('Reset shared demo','data-preview-reset')}</div><p class="fine">Lock demo scorecards uses the current example drafts so you can rehearse the reveal without scoring every sample. It does not change already-locked cards.</p>` : ''}<details><summary>Edit season, components and qualification places</summary>${seasonForm()}</details><details><summary>Add the next judging batch</summary>${batchForm()}</details></article>
    ${state.host.batches.map(batch => {const event = batch.event, phase = event?.phase; const ready = batch.status === 'accepting' && batch.closes_at <= state.data.serverTime && batch.entries.filter(r => r.status === 'submitted').length >= 2; return `<article class="panel host-batch"><div class="row"><div><p class="eyebrow">${esc(batch.stage)} · ${esc(batch.status)}</p><h2>${esc(batch.name)}</h2></div><span class="badge">${batch.slots} PLACES</span></div><p class="fine">Recipe deadline: ${esc(date(batch.closes_at))}</p><div class="stats"><span><strong>${batch.entries.filter(r => r.status === 'submitted').length}</strong>locked blends</span><span><strong>${batch.lockedCards} / ${batch.expectedCards || '—'}</strong>locked scorecards</span>${event ? `<span><strong>${esc(phase)}</strong>show state</span>` : ''}</div>
      ${batch.status === 'accepting' ? `${button('Prepare blind flight', `data-prepare="${esc(batch.id)}" ${ready ? '' : 'disabled'}`, true)}<details><summary>Edit this judging batch</summary>${batchForm(batch)}</details>` : batch.status === 'prepared' ? `<div class="actions">${button('Open next prediction', `data-advance="open" data-batch="${esc(batch.id)}" ${['lobby','results'].includes(phase) && event.outcomes.length < event.matchups.length ? '' : 'disabled'}`, true)}${button('Close picks', `data-advance="close" data-batch="${esc(batch.id)}" ${phase === 'predictions' ? '' : 'disabled'}`)}${button('Reveal actual result', `data-advance="reveal" data-batch="${esc(batch.id)}" ${phase === 'judging' && batch.allScoresLocked ? '' : 'disabled'}`)}${button('Complete & qualify', `data-advance="complete" data-batch="${esc(batch.id)}" ${phase === 'results' && event.outcomes.length === event.matchups.length ? '' : 'disabled'}`)}</div><p class="fine">Prediction windows last 2 minutes here. All scorecards must be locked before a result can be revealed. Exact unresolved ties block publication.</p><a class="button outline" href="/games/${encode(event.code)}" target="_blank" rel="noopener">Open player screen ↗</a>` : `<p class="fine">Flight completed. Scores and awarded places are published; the next intake remains independent.</p>`}
      ${batch.resolution_note ? `<p class="notice">${esc(batch.resolution_note)}</p>` : ''}<details><summary>${state.preview ? 'Demo sample packing map · shared test data' : 'Private sample packing map · never show on stream'}</summary><ol class="packing">${batch.entries.filter(r => r.status === 'submitted').map(row => `<li><strong>${esc(row.sample || 'Not prepared')} — ${esc(row.teamName)} / ${esc(row.blendName)}</strong><br>${row.recipe.map(r => esc(r.code) + ': ' + (r.bps / 100).toFixed(2) + '%').join(' · ')}</li>`).join('') || '<li>No submitted blends yet.</li>'}</ol></details></article>`;}).join('')}
    ${state.host.queued.length ? `<article class="panel"><p class="eyebrow">NEXT-COMPETITION INTAKE QUEUE</p><h2>${state.host.queued.length} saved entries</h2><p>These are not in a locked championship. Publish the next intake and arrange explicit placement; the pilot does not silently assign queued blends to another season.</p>${state.host.queued.map(row => `<div class="saved-entry"><strong>${esc(row.teamName)} · ${esc(row.blendName)}</strong><p>${esc(date(row.submittedAt))}</p></div>`).join('')}</article>` : ''}`;
}
function header() {
  const d = state.data, event = d?.spotlight, target = d?.intake;
  $('#workspace-title').textContent = ({play:'Game day',enter:'Make your blend',results:'The scoreboard',judge:'Score the flight',host:'Run the show',account:'Your account'})[state.view] || 'Game day';
  $('#account-button').textContent = state.preview ? 'Reset demo' : account().signedIn ? 'My account' : 'Sign in';
  $('#host-tab').hidden = !(d?.canManage || state.index?.canManage);
  $('#test-ribbon').hidden = !(state.preview || d?.season.isTest);
  if (state.preview) $('#test-ribbon').textContent = 'OPEN BUILD PREVIEW · Test data. Judge and Producer are open. Resets clear everyone’s demo.';
  $('#season-name').textContent = d?.season.name || 'One competition. Two ways in.';
  $('#season-strip').innerHTML = (d?.season.stages || []).map((stage, i) => `<div class="milestone"><span>${['01 / FIRST QUALIFIERS','02 / KEEP COMPETING','03 / STILL A WAY IN','04 / THE FINAL'][i]}</span><strong>${esc(stage.label)}</strong><small>${stage.key === 'final' ? 'Fresh blends. Scores reset.' : `${stage.slots} championship places reserved`}</small></div>`).join('');
  $('#live-card-content').innerHTML = event ? `<p class="eyebrow">${event.phase === 'predictions' ? 'PREDICTIONS OPEN' : 'JOIN THE ROOM'} <span class="small-tag">${d.season.isTest ? 'TEST FLIGHT' : 'LIVE EVENT'}</span></p><h2>${esc(event.name.replace(' · Test event',''))}</h2><p>${event.phase === 'predictions' ? 'Your next winning call starts here. Picks lock ' + esc(date(event.phaseDeadline)) + '.' : 'The room is open. Join now; play the next unlocked prediction.'}</p><div class="card-line"><div><p class="eyebrow">SCAN. JOIN. PLAY.</p><p>One phone per player.</p></div><img class="qr" src="/blending-qr/${encode(d.season.code)}.svg" alt="QR code to join this Bourbon Games season"></div>` : `<p class="eyebrow">ENTRY IS OPEN <span class="small-tag">AT HOME</span></p><h2>${esc(target?.name || 'The next flight is coming.')}</h2><p>${esc(target?.explanation || 'The producer is preparing the first competition.')}</p><div class="card-line"><div><p class="eyebrow">YOUR NEXT OPPORTUNITY</p><p>${esc(date(target?.closesAt))}</p></div></div>`;
  document.querySelectorAll('.tabs [data-view]').forEach(tab => tab.setAttribute('aria-current', tab.dataset.view === state.view ? 'page' : 'false'));
}
function render() {
  document.body.dataset.view = state.view;
  header();
  if (state.busy) return;
  const views = {play: playPanel, enter: recipePanel, results: resultsPanel, judge: judgePanel, host: hostPanel, account: authPanel};
  $('#workspace').innerHTML = (views[state.view] || playPanel)();
  wire();
}
function parseComponents(value) {return value.split('\n').filter(line => line.trim()).map(line => {const [code,...name] = line.split('|'); return {code: code.trim(), name: name.join('|').trim()};});}
async function resetPreview() {
  if (!confirm('Reset the shared demo for everyone? All preview-only changes and picks will be cleared.')) return;
  await action(async () => {
    await api('/api/open-preview/reset', {});
    state.previewChecked = false; state.host = null; state.judge = null;
    state.code = 'TRYBG'; state.previewJudge = '1';
    history.replaceState(null, '', '/blending/TRYBG?view=' + encode(state.view));
  }, 'Shared demo reset. You can try every button again.');
}
function wire() {
  $('#workspace').querySelectorAll('form').forEach(form => form.addEventListener('input', () => {state.dirty = true;}));
  document.querySelectorAll('[data-score-scope]').forEach(node => node.onclick = () => {
    state.resultScope = node.dataset.scoreScope; render();
    document.querySelector(`[data-score-scope="${state.resultScope}"]`)?.focus({preventScroll:true});
  });
  if ($('#score-batch')) $('#score-batch').onchange = event => {state.resultBatch = event.target.value; render(); $('#score-batch')?.focus({preventScroll:true});};
  document.querySelectorAll('[data-preview-reset]').forEach(node => node.onclick = resetPreview);
  if ($('#preview-judge')) $('#preview-judge').onchange = event => {
    const choice = event.currentTarget.value;
    if (state.dirty && !confirm('Leave this unsaved scorecard?')) {event.currentTarget.value = state.previewJudge; return;}
    action(async () => { state.previewJudge = choice; }, 'Switched demo judge.');
  };
  if ($('#preview-lock-scores')) $('#preview-lock-scores').onclick = () => {
    if (!confirm('Lock the current demo scorecard drafts so the producer can reveal the results?')) return;
    action(() => api('/api/open-preview/lock-scores', {}), 'Demo scorecards locked. Close picks before revealing results.');
  };
  document.querySelectorAll('[data-go]').forEach(node => node.onclick = () => changeView(node.dataset.go));
  if ($('#auth-switch')) $('#auth-switch').onclick = () => {state.authMode = state.authMode === 'login' ? 'register' : 'login'; render();};
  if ($('#logout')) $('#logout').onclick = () => action(async () => {await api('/api/auth/logout', {}); state.host = null; state.judge = null; state.view = 'play';}, 'Signed out. Your saved entries remain in your account.');
  if ($('#auth-form')) $('#auth-form').onsubmit = event => {event.preventDefault(); const input = formData(event.currentTarget); action(() => api('/api/public/game-account/' + state.authMode, input), 'Signed in. Your saved entries have been restored.');};
  if ($('#profile-form')) $('#profile-form').onsubmit = event => {event.preventDefault(); const input = formData(event.currentTarget); action(() => api('/api/public/game-account/profile', input), 'Player profile saved.');};
  if ($('#place-queued')) $('#place-queued').onclick = () => {
    const queued = state.data.myEntries.find(row => row.status === 'queued'), target = state.data.intake;
    if (!confirm('Enter your locked recipe into ' + target.name + ', deadline ' + date(target.closesAt) + '?')) return;
    action(() => api('/api/public/blending/' + encode(state.code) + '/entries/' + encode(queued.id), {action:'place', expectedRevision:queued.revision, expectedTarget:target.key}), 'Your locked recipe has been entered into the confirmed judging batch.');
  };
  const recipeForm = $('#recipe-form');
  if (recipeForm) {
    const inputs = [...recipeForm.querySelectorAll('[data-component]')];
    const updateTotal = () => {
      const total = inputs.reduce((sum, input) => sum + Math.round((Number(input.value) || 0) * 100), 0);
      $('#recipe-total').textContent = (total / 100).toFixed(2) + '%';
      $('#recipe-hint').textContent = total === 10000 ? '100% — ready to submit when you are.' : total > 10000 ? 'Remove ' + ((total - 10000) / 100).toFixed(2) + '% to reach 100%.' : 'Add ' + ((10000 - total) / 100).toFixed(2) + '% more to reach 100%.';
      const size = Number($('#trial-size').value);
      $('#trial-recipe').textContent = total === 10000 ? inputs.map(input => input.dataset.component + ': ' + (Number(input.value) * size / 100).toFixed(2) + ' mL').join(' · ') : 'Finish your 100% recipe to see the trial measurements.';
    };
    $('#trial-size').onchange = updateTotal;
    recipeForm.querySelectorAll('[data-adjust]').forEach(node => node.onclick = () => {
      const input = document.getElementById(node.dataset.for);
      input.value = Math.min(100, Math.max(0, Number(input.value || 0) + Number(node.dataset.adjust))).toFixed(2);
      state.dirty = true; updateTotal();
    });
    inputs.forEach(input => input.oninput = updateTotal); updateTotal();
    recipeForm.onsubmit = event => {
      event.preventDefault(); const input = formData(recipeForm), submit = event.submitter?.dataset.submit === 'final';
      const recipe = inputs.map(field => ({code: field.dataset.component, bps: Math.round(Number(field.value) * 100)}));
      if (submit && !confirm('Submit this exact recipe to ' + state.data.intake.name + '? The recipe will be locked.')) return;
      const path = '/api/public/blending/' + encode(state.code) + '/entries' + (recipeForm.dataset.id ? '/' + encode(recipeForm.dataset.id) : '');
      action(() => api(path, {...input, recipe, age21: input.age21 === 'on', expectedRevision: Number(recipeForm.dataset.revision), submit, expectedTarget: recipeForm.dataset.target, acceptQueue: $('#accept-queue')?.checked === true}), submit ? 'Recipe submitted and locked. Your judging destination is shown under Your entries.' : state.preview ? 'Draft saved in the shared demo.' : 'Draft saved to your account.');
    };
  }
  document.querySelectorAll('.scorecard:not(.locked)').forEach(form => form.onsubmit = event => {
    event.preventDefault(); const input = formData(form), lock = event.submitter?.dataset.lock === 'true';
    if (lock && !confirm('Lock this blind scorecard? It cannot be edited after submission.')) return;
    action(() => api('/api/blending/judging/score', {...input, ...Object.fromEntries(['aroma','palate','balance','finish'].map(k => [k, Number(input[k])])), lock, batchId: form.dataset.batch, entryId: form.dataset.entry, expectedRevision: Number(form.dataset.revision)}), lock ? 'Blind scorecard locked.' : 'Private scorecard draft saved.');
  });
  if ($('#season-form')) $('#season-form').onsubmit = event => {
    event.preventDefault(); const form = event.currentTarget, input = formData(form), create = form.dataset.create === 'true';
    const stages = (state.host?.season.stages || [{key:'round1',label:'Round 1 · late 2026'},{key:'round2',label:'Round 2 · first half of 2027'},{key:'last-chance',label:'Last-chance qualification'},{key:'final',label:'Championship · Q4 2027'}]).map(s => ({...s, slots:s.key === 'final' ? 0 : Number(input['slots-' + s.key])}));
    action(async () => {const result = await api('/api/admin/blending/seasons' + (create ? '' : '/' + encode(state.code) + '/configure'), {...input, components:parseComponents(input.components), stages, expectedRevision:state.host?.season.revision}); if (create) {state.code = result.code; history.replaceState(null,'','/blending/' + encode(state.code) + '?view=host');}}, 'Season settings saved.');
  };
  document.querySelectorAll('.batch-form').forEach(form => form.onsubmit = event => {
    event.preventDefault(); const input = formData(form), judges = input.judges.split('\n').filter(s => s.trim()).map(line => {const [name,...email] = line.split('|'); return {name:name.trim(),email:email.join('|').trim()};});
    action(() => api(form.dataset.id ? '/api/admin/blending/batches/' + encode(form.dataset.id) + '/configure' : '/api/admin/blending/seasons/' + encode(state.code) + '/batches', {...input, judges, slots:Number(input.slots), capacity:Number(input.capacity), closesAt:new Date(input.closesAt).getTime(), expectedRevision:Number(form.dataset.revision)}), 'Judging batch saved.');
  });
  if ($('#refresh-host')) $('#refresh-host').onclick = () => action(async () => {}, 'Producer controls refreshed.');
  document.querySelectorAll('[data-prepare]').forEach(node => node.onclick = () => {
    const batch = state.host.batches.find(b => b.id === node.dataset.prepare);
    action(() => api('/api/admin/blending/batches/' + encode(batch.id) + '/prepare', {expectedRevision:batch.revision}), 'Blind sample codes assigned. Judges can now score their flights.');
  });
  document.querySelectorAll('[data-advance]').forEach(node => node.onclick = () => {
    const batch = state.host.batches.find(b => b.id === node.dataset.batch);
    const actionName = node.dataset.advance;
    if (['reveal','complete'].includes(actionName) && !confirm(actionName === 'reveal' ? 'Publish this actual result to all players and venue screens?' : 'Complete the flight and award the earned qualification places?')) return;
    action(() => api('/api/admin/blending/batches/' + encode(batch.id) + '/advance', {action:actionName, expectedRevision:batch.event.stateRevision, seconds:120}), 'Show state updated.');
  });
}
async function load(poll = false) {
  if (!state.previewChecked) {
    const response = await fetch('/api/open-preview', {credentials:'same-origin', cache:'no-store'});
    state.preview = response.ok ? await response.json() : null;
    state.previewChecked = true;
  }
  if (!poll) state.index = await api('/api/public/blending');
  if (!state.code) state.code = state.index.seasons[0]?.code || '';
  if (state.code) {
    const next = await api('/api/public/blending/' + encode(state.code));
    const changed = JSON.stringify([next.spotlight, next.batches, next.audience]) !== JSON.stringify([state.data?.spotlight, state.data?.batches, state.data?.audience]);
    state.data = next;
    if (poll) {header(); if (changed && ['play','results'].includes(state.view)) render(); return;}
  }
  if (state.view === 'host' && state.code && (state.data?.canManage || state.index?.canManage)) state.host = await api('/api/admin/blending/seasons/' + encode(state.code));
  if (state.view === 'judge' && account().signedIn) state.judge = await api('/api/blending/judging');
  state.online = true; render();
}
$('#join-main').onclick = () => {if (state.data?.spotlight) location.assign('/games/' + encode(state.data.spotlight.code)); else changeView('play');};
$('#enter-main').onclick = () => changeView('enter');
$('#account-button').onclick = () => state.preview ? resetPreview() : changeView('account');
document.querySelectorAll('.tabs [data-view]').forEach(node => node.onclick = () => changeView(node.dataset.view));
load().catch(error => {notice(error.message, true); $('#workspace').innerHTML = '<article class="panel"><h2>The pilot is not available yet.</h2><p>Nothing has been submitted. The producer needs to enable and configure this pilot before people can enter.</p></article>';});
setInterval(() => {if (state.code && !state.busy && document.visibilityState === 'visible') load(true).catch(() => {state.online = false; notice('Connection lost. The last displayed state may be out of date. Reconnect before submitting; the server controls every lock.', true);});}, 4000);

window.addEventListener('beforeunload', event => {if (state.dirty) {event.preventDefault(); event.returnValue = '';}});
