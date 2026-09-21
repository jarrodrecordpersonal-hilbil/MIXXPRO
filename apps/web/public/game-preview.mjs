/** A labeled, local-only walkthrough. Never joins an event or writes a prediction. */
export function gamePreview(){
 return `<section class="game-preview" aria-label="Bourbon Games experience preview">
  <div class="game-preview-story"><div class="eyebrow">THE BOURBON GAMES EXPERIENCE</div><h2>A tasting.<br>A room full of picks.</h2><p>Follow the blind matchup on screen. Pick a winner on your phone. See how your predictions stack up when the result is revealed.</p><ol><li><b>Join from the TV.</b> An open event provides a QR code for guests.</li><li><b>Make your picks.</b> Predict the matchup winner and the judges’ choices.</li><li><b>Follow the reveal.</b> Correct predictions earn points after results are published.</li></ol><p class="game-preview-note">Free predictions. No purchase, cash stakes or prizes.</p></div>
  <div class="game-preview-demo"><div class="game-preview-tag">Preview · fictional matchup</div><div class="game-preview-switch" role="group" aria-label="Preview views"><button type="button" data-preview-view="phone" aria-pressed="true">Phone view</button><button type="button" data-preview-view="tv" aria-pressed="false">TV view</button><button type="button" data-preview-view="score" aria-pressed="false">Scoring</button></div>
   <div data-preview-panel="phone" class="game-preview-phone"><span class="eyebrow">YOUR PICK</span><h3>Who takes this round?</h3><p>Two blind samples. One prediction.</p><div class="game-preview-samples"><button type="button" data-preview-pick="A" aria-pressed="false"><span class="sample-glass" aria-hidden="true"></span><b>Sample A</b></button><button type="button" data-preview-pick="B" aria-pressed="false"><span class="sample-glass" aria-hidden="true"></span><b>Sample B</b></button></div><p data-preview-choice role="status" aria-live="polite">Try a sample pick.</p></div>
   <div data-preview-panel="tv" class="game-preview-tv" hidden><span class="eyebrow">ON THE VENUE SCREEN</span><h3>The next reveal<br>starts with your pick.</h3><div class="game-preview-versus"><span>Sample A</span><small>VS</small><span>Sample B</span></div><div class="game-preview-join">An open event’s join QR appears on the TV.</div></div>
   <div data-preview-panel="score" class="game-preview-score" hidden><span class="eyebrow">EXAMPLE RESULT</span><h3>Sample A wins.</h3><p data-preview-score>Choose a sample in Phone view to see how a prediction is scored.</p><p class="small">One point for a correct matchup winner. Each correct named-judge prediction earns another point. Points appear after the host publishes results.</p></div>
   <p class="game-preview-disclaimer">This preview does not save picks, open an event or change your TVs.</p>
  </div>
 </section>`;
}

export function renderGamePreview(root,view,pick){
 for(const button of root.querySelectorAll('[data-preview-view]'))button.setAttribute('aria-pressed',String(button.dataset.previewView===view));
 for(const panel of root.querySelectorAll('[data-preview-panel]'))panel.hidden=panel.dataset.previewPanel!==view;
 for(const button of root.querySelectorAll('[data-preview-pick]'))button.setAttribute('aria-pressed',String(button.dataset.previewPick===pick));
 const choice=root.querySelector('[data-preview-choice]'),score=root.querySelector('[data-preview-score]');
 if(choice)choice.textContent=pick?`Preview pick: Sample ${pick}. Open Scoring to see the example result.`:'Try a sample pick.';
 if(score)score.textContent=pick?pick==='A'?'Your example pick matches the winner: 1 point.':'Your example pick was Sample B: 0 points for this matchup.':'Choose a sample in Phone view to see how a prediction is scored.';
}
