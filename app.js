const qs = s => document.querySelector(s);
function on(selector, event, handler){ const els = document.querySelectorAll(selector); if(!els) return; if(els.length===0) return; if(els.length===1) els[0].addEventListener(event, handler); else els.forEach(e=>e.addEventListener(event, handler)); }
const screens = {
  home: qs('#home'), q36: qs('#q36'), tod: qs('#tod'), 'tod-select': qs('#tod-select'), players: qs('#players'),
  spinner: qs('#spinner'), turn: qs('#turn'), result: qs('#result')
};

function show(name){ clearTimer(); Object.values(screens).forEach(s=>{ if(s && s.classList) s.classList.remove('active'); }); const scr = screens[name]; if(scr && scr.classList) scr.classList.add('active');
  // when showing TOD, ensure visual matches selected level
  if(name === 'tod'){ try{ const levelEl = qs('#tod-level'); const level = levelEl ? levelEl.value : 'regular'; applyTodLevelVisual(level); }catch(e){} }
  // when showing spinner, auto-run the spin after a short delay
  if(name === 'spinner'){
    try{ renderPlayerList(); isSpinning = true; setTimeout(()=>{ autoSpinAndPick(); }, 420); }catch(e){}
  }
  // Show player-strip only on spinner and turn screens
  try{
    const ps = qs('#player-strip'); if(ps){ if(name === 'spinner' || name === 'turn') ps.classList.remove('hidden'); else ps.classList.add('hidden'); }
  }catch(e){}
  // remove theme backgrounds when navigating home
  try{ if(name === 'home'){ document.body.classList.remove('theme-cutie','theme-zoetje','theme-zoetje-pinkgreen'); } }catch(e){}
}
function applyTodLevelVisual(level){ try{ const todSection = qs('#tod'); if(!todSection) return; ['mild','regular','hot','very_hot'].forEach(l=> todSection.classList.remove('tod-'+l)); todSection.classList.add('tod-'+level); }catch(e){} }

// Navigation
on('#open-36','click',()=>{show('q36')});
on('#open-tod','click',()=>{show('tod-select')});
on('.back','click',()=>show('home'));

// Data
let q36 = []; // expected: [{title:'Set 1', questions:[...]}, ...]
let q36Set = 0;
let q36Index = 0;

let todPrompts = {mild:{truth:[],dare:[]},regular:{truth:[],dare:[]},hot:{truth:[],dare:[]},very_hot:{truth:[],dare:[]}};
let usedTod = {mild:{truth:new Set(),dare:new Set()},regular:{truth:new Set(),dare:new Set()},hot:{truth:new Set(),dare:new Set()},very_hot:{truth:new Set(),dare:new Set()}};

// Players & spinner state (fixed couple)
let players = ['Cutie','Zoetje'];
let spinnerIndex = 0;
let isSpinning = false;
// tokens
let tokens = [0,0];
let maxTokens = 3;

async function load36(){
  try{
    const r = await fetch('data/36questions.json'); if(!r.ok) throw 0; q36 = await r.json();
  }catch(e){
    q36 = [ {title:'Set 1',questions:['Placeholder question 1','Placeholder question 2']} ];
  }
  render36();
}

function render36(){
  const el = qs('#q36-text');
  const titleEl = qs('#q36-set-title');
  if(!q36 || q36.length===0) el.textContent = 'No questions available.';
  else{
    const set = q36[q36Set];
    if(!set) { el.textContent = 'Questions misconfigured.'; return }
    if(titleEl) titleEl.textContent = set.title;
    el.textContent = `${q36Index+1}. ${set.questions[q36Index]}`;
  }
}

on('#q36-next','click',()=>{
  const set = q36[q36Set];
  if(!set) return;
  q36Index++;
  if(q36Index>=set.questions.length){
    // show transition
    qs('#q36-area').classList.add('hidden');
    const trans = qs('#q36-transition'); if(trans){ trans.classList.remove('hidden'); trans.classList.add('split-transition'); }
    qs('#q36-level').textContent = `Completed ${set.title}`;
    qs('#q36-transition-text').textContent = `You've finished ${set.title}. Next level is ${q36Set+2<=q36.length? q36[q36Set+1].title:'Complete'}.`;
    show('q36');
    return;
  }
  render36();
});

on('#q36-prev','click',()=>{
  if(q36Index>0) q36Index--; else if(q36Set>0){ q36Set--; q36Index = Math.max(0, (q36[q36Set].questions.length||0)-1); }
  render36();
});

// shuffle removed — keep deterministic progression through questions

on('#q36-continue','click',()=>{
  // move to next set
  const trans = qs('#q36-transition'); if(trans){ trans.classList.add('hidden'); trans.classList.remove('split-transition'); }
  qs('#q36-area').classList.remove('hidden');
  if(q36Set < q36.length-1){ q36Set++; q36Index = 0; }
  render36();
});

// Load TOD prompts
async function loadTod(){
  try{ const r = await fetch('data/tod_prompts.json'); if(!r.ok) throw 0; todPrompts = await r.json(); }
  catch(e){ console.warn('Failed to load TOD prompts, using fallback.'); }
}

// Timer utilities
let timerInterval = null;
function clearTimer(){ if(timerInterval){ clearInterval(timerInterval); timerInterval = null; } }
function parseSecondsFromText(text){ if(!text) return 0; const m = text.match(/(\d{1,2})\s*(?:-?\s*(?:second|sec|seconds)\b)/i); if(m) return parseInt(m[1],10); return 0; }
function formatMMSS(s){ const mm = Math.floor(s/60).toString().padStart(2,'0'); const ss = (s%60).toString().padStart(2,'0'); return `${mm}:${ss}`; }
function playBeep(){ try{ const C = window.AudioContext || window.webkitAudioContext; const ctx = new C(); const o = ctx.createOscillator(); const g = ctx.createGain(); o.type='sine'; o.frequency.value = 900; o.connect(g); g.connect(ctx.destination); g.gain.setValueAtTime(0.0001, ctx.currentTime); o.start(); g.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35); o.stop(ctx.currentTime + 0.4); }catch(e){ try{ new Audio().play(); }catch(e){} } }
function playBeep(){ try{ const C = window.AudioContext || window.webkitAudioContext; const ctx = new C(); const o = ctx.createOscillator(); const g = ctx.createGain(); o.type='sine'; o.frequency.value = 900; o.connect(g); g.connect(ctx.destination); g.gain.setValueAtTime(0.0001, ctx.currentTime); o.start(); g.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35); o.stop(ctx.currentTime + 0.4); }catch(e){ try{ new Audio().play(); }catch(e){} } finally { try{ document.body.classList.add('flash'); setTimeout(()=>document.body.classList.remove('flash'),450); }catch(e){} } }
function startCountdown(seconds, displayEl, onFinish, startBtn, nextBtn){ clearTimer(); let remaining = seconds; if(displayEl) displayEl.textContent = formatMMSS(remaining); if(nextBtn) nextBtn.disabled = true; if(startBtn) startBtn.disabled = true; timerInterval = setInterval(()=>{ remaining--; if(displayEl) displayEl.textContent = formatMMSS(remaining); if(remaining<=0){ clearTimer(); playBeep(); if(nextBtn) nextBtn.disabled = false; if(startBtn) startBtn.disabled = false; if(onFinish) onFinish(); } },1000); }

function setupTimerForResult(text){ clearTimer(); const seconds = parseSecondsFromText(text); const area = qs('#result-timer-area'); const display = qs('#result-timer-display'); const startBtn = qs('#result-timer-start'); const nextBtn = qs('#result-next'); const succ = qs('#result-success'); const fail = qs('#result-fail'); if(seconds>0){ area.classList.remove('hidden'); display.textContent = formatMMSS(seconds); nextBtn.disabled = true; startBtn.disabled = false; if(succ) succ.disabled = true; if(fail) fail.disabled = true; startBtn.onclick = ()=> startCountdown(seconds, display, ()=>{ if(succ) succ.disabled = false; if(fail) fail.disabled = false; }, startBtn, nextBtn); } else { area.classList.add('hidden'); nextBtn.disabled = false; if(succ) succ.disabled = false; if(fail) fail.disabled = false; } }

function setupTimerForTod(text){ clearTimer(); const seconds = parseSecondsFromText(text); const area = qs('#tod-timer-area'); const display = qs('#tod-timer-display'); const startBtn = qs('#tod-timer-start'); const nextBtn = qs('#tod-next'); if(seconds>0){ area.classList.remove('hidden'); display.textContent = formatMMSS(seconds); nextBtn.disabled = true; startBtn.disabled = false; startBtn.onclick = ()=> startCountdown(seconds, display, ()=>{}, startBtn, nextBtn); } else { area.classList.add('hidden'); nextBtn.disabled = false; } }

function pickTodPrompt(level, type){
  const list = (todPrompts[level] && todPrompts[level][type]) || [];
  if(!list.length) return null;
  const used = usedTod[level][type];
  let available = list.map((v,i)=>i).filter(i=>!used.has(i));
  if(available.length===0){
    // attempt to auto-level-up to the next hotter level that has unused prompts
    const levels = ['mild','regular','hot','very_hot'];
    const cur = levels.indexOf(level);
    for(let ni=cur+1; ni<levels.length; ni++){
      const nl = levels[ni];
      const nlist = (todPrompts[nl] && todPrompts[nl][type]) || [];
      if(nlist.length===0) continue;
      const nused = usedTod[nl][type];
      const navail = nlist.map((v,i)=>i).filter(i=>!nused.has(i));
      if(navail.length>0){
        // switch selected level for future picks and notify UI
        if(qs('#tod-level')) qs('#tod-level').value = nl;
        applyTodLevelVisual(nl);
        showUpgradeToast(nl);
        const choiceIndex = navail[Math.floor(Math.random()*navail.length)];
        nused.add(choiceIndex);
        return nlist[choiceIndex];
      }
    }
    // if no higher unused prompts, reset current level and reuse
    used.clear();
    available = list.map((v,i)=>i);
  }
  const idx = available[Math.floor(Math.random()*available.length)];
  used.add(idx);
  return list[idx];
}

// Player management
function renderPlayerList(){
  const ul = qs('#player-list');
  if(ul){ ul.innerHTML=''; players.forEach((p,idx)=>{ const li = document.createElement('li'); li.textContent = p; ul.appendChild(li); }); }
  // spinner list
  const sl = qs('#spinner-list');
  if(sl){ sl.innerHTML=''; players.forEach((p,idx)=>{ const li = document.createElement('li'); li.innerHTML = `<span class="name">${p}</span><span class="tokens" data-idx="${idx}">`+ '◦'.repeat(tokens[idx]) + `</span>`; li.dataset.index = idx; sl.appendChild(li); }); }
  // persistent player strip
  const ps = qs('#player-strip');
  if(sl){ // spinner list: names only (tokens only shown in bottom player-strip)
    sl.innerHTML = '';
    players.forEach((p,idx)=>{
      const li = document.createElement('li');
      const nameSpan = document.createElement('span'); nameSpan.className = 'name'; nameSpan.textContent = p;
      li.appendChild(nameSpan); li.dataset.index = idx; sl.appendChild(li);
    });
  }
  if(ps){ ps.innerHTML = ''; // render bottom-up so the second player appears above the first (Zoetje above Cutie)
    for(let j = players.length-1; j>=0; j--){ const p = players[j]; const idx = j; const div = document.createElement('div'); div.className = 'player' + (tokens[idx]>0 ? ' filled' : ''); div.dataset.idx = idx; const icon = document.createElement('span'); icon.className = 'icon'; icon.innerHTML = idx===0 ? '❤' : '🐸'; const name = document.createElement('span'); name.className='name'; name.textContent = p; const tk = document.createElement('span'); tk.className='tokens'; tk.dataset.idx = idx; // create three dot elements
      for(let k=0;k<3;k++){ const d = document.createElement('span'); d.className = 'dot ' + (k < (tokens[idx]||0) ? 'on' : 'off'); tk.appendChild(d); }
      div.appendChild(icon); div.appendChild(name); div.appendChild(tk);
      // set initial opacity based on tokens
      div.style.opacity = tokens[idx]>0 ? '1' : '0.45'; ps.appendChild(div); }
  }
}

function updateTokenUI(){
  // update persistent player strip
  document.querySelectorAll('#player-strip .player').forEach((el)=>{ const idx = parseInt(el.dataset.idx,10); const tk = el.querySelector('.tokens'); if(!tk) return; const dots = Array.from(tk.querySelectorAll('.dot')); dots.forEach((d,di)=>{ if(di < (tokens[idx]||0)) { d.classList.add('on'); d.classList.remove('off'); } else { d.classList.remove('on'); d.classList.add('off'); } }); if(tokens[idx]>0) el.classList.add('filled'); else el.classList.remove('filled'); el.style.opacity = tokens[idx]>0 ? '1' : '0.45'; });
  // also update result/player headers
  const rp = qs('#result-player'); if(rp) rp.textContent = qs('#turn-player').textContent || '';
}

function incToken(idx){ tokens[idx] = (tokens[idx]||0) + 1; if(tokens[idx] >= maxTokens){ return true; } updateTokenUI(); return false; }
function resetTokens(idx){ tokens[idx]=0; updateTokenUI(); }

// Player list is fixed; no add/remove controls.

// Legacy manual spinner removed — auto-spin only via `autoSpinAndPick()` and `finalizeSpinner()`

// Auto-spin with deceleration: visual highlight loops and slows, then finalizes.
function autoSpinAndPick(){
  const items = Array.from(qs('#spinner-list').children);
  if(!items || items.length===0) { isSpinning = false; return; }
  const total = 18 + Math.floor(Math.random()*14); // ~18-31 steps (longer spin)
  let current = spinnerIndex || 0;
  let step = 0;
  const baseDelay = 25; // fast base per-step
  const fastPeriod = 200; // stay fast for first 0.2s as requested
  const maxExtra = 1200; // slightly reduced slowdown window
  const capDelay = 2000; // cap per-step delay lower to shorten total by ~1s
  const startTime = Date.now();
  function stepOnce(prevDelay){
    const delay = prevDelay || baseDelay;
    setTimeout(()=>{
      items.forEach(i=>{ i.classList.remove('active'); i.classList.remove('spin-step'); });
      current = (current+1) % items.length;
      const el = items[current];
      el.classList.add('active');
      el.classList.add('spin-step');
      setTimeout(()=>{ try{ el.classList.remove('spin-step'); }catch(e){} }, 140);
      step++;
      const t = step/total;
      const elapsed = Date.now() - startTime;
      let nextDelay;
      if(elapsed < fastPeriod){
        // keep it snappy during the initial short burst
        nextDelay = baseDelay;
      } else {
        // very strong easing (quintic) for a drawn-out, suspenseful slowdown
        nextDelay = Math.round(baseDelay + (Math.pow(t,5) * maxExtra));
      }
      const capped = Math.min(nextDelay, capDelay);
      if(step < total) stepOnce(capped); else { spinnerIndex = current; finalizeSpinner(current); }
    }, delay);
  }
  stepOnce(baseDelay);
}

function finalizeSpinner(idx){
  const items = Array.from(qs('#spinner-list').children);
  const chosenEl = items[idx];
  if(chosenEl) chosenEl.classList.add('pop');
  setTimeout(()=>{ if(chosenEl) chosenEl.classList.remove('pop'); }, 700);
  const chosen = chosenEl ? chosenEl.querySelector('.name')?.textContent || chosenEl.textContent : null;
  if(chosen) qs('#turn-player').textContent = chosen;
  // set a slightly randomized diagonal cut and angle for the theme
  try{
    const cut = (40 + Math.floor(Math.random()*21)) + '%';
    const angle = (110 + Math.floor(Math.random()*61)) + 'deg';
    document.documentElement.style.setProperty('--player-cut', cut);
    document.documentElement.style.setProperty('--player-angle', angle);
  }catch(e){}
  // temporarily apply theme while showing winner
  const body = document.body;
  body.classList.remove('theme-cutie','theme-zoetje','theme-zoetje-pinkgreen');
  if(chosen === players[0]){
    body.classList.add('theme-cutie');
  } else {
    // Zoetje: pink + green accent
    body.classList.add('theme-zoetje','theme-zoetje-pinkgreen');
  }
  // set the instruction text above the choice buttons (can be multi-line)
  try{ const prompt = qs('#turn-prompt'); if(prompt) prompt.textContent = 'Make your choice'; }catch(e){}
  // Prepare a smooth name-move animation: layout the Turn screen invisibly to measure target
  try{
    const turnScreen = screens.turn;
    if(turnScreen){ turnScreen.classList.add('pre-show'); }
    const items = Array.from(qs('#spinner-list').children);
    const chosenNameEl = chosenEl ? chosenEl.querySelector('.name') : null;
    const otherEl = items.find((it,i)=>i!==idx);
    // compute source and target rects
    const srcRect = chosenNameEl ? chosenNameEl.getBoundingClientRect() : null;
    const targetEl = qs('#turn-player');
    // set the target text early so measurements match final layout
    if(targetEl && chosen) targetEl.textContent = chosen;
    const tgtRect = targetEl ? targetEl.getBoundingClientRect() : null;
    // create a floating clone to animate
    if(srcRect && tgtRect){
      const clone = chosenNameEl.cloneNode(true);
      clone.style.position = 'fixed';
      clone.style.left = srcRect.left + 'px';
      clone.style.top = srcRect.top + 'px';
      clone.style.width = srcRect.width + 'px';
      clone.style.height = srcRect.height + 'px';
      clone.style.lineHeight = srcRect.height + 'px';
      clone.style.zIndex = 2000;
      clone.style.transition = 'transform 2s cubic-bezier(.2,.9,.2,1), opacity 2s ease';
      clone.style.transformOrigin = 'center center';
      document.body.appendChild(clone);
      // fade/lower the unpicked person's name
      if(otherEl){ otherEl.classList.add('unpicked'); }
      // compute delta to target (center alignment)
      const dx = (tgtRect.left + tgtRect.width/2) - (srcRect.left + srcRect.width/2);
      const dy = (tgtRect.top + tgtRect.height/2) - (srcRect.top + srcRect.height/2);
      // nudge target so clone lands where the Turn screen shows the name on the select screen
      // adjust vertical offset slightly upward so it doesn't sit too low
      const extraY = -6;
      const adjustedDy = dy + extraY;
      // trigger the animation next tick
      requestAnimationFrame(()=>{
        clone.style.transform = `translate(${dx}px, ${adjustedDy}px) scale(1.1)`;
        clone.style.opacity = '1';
      });
      // remove clone after animation and reveal the Turn screen
      // remove clone after the 2s animation completes, then reveal Turn UI
      setTimeout(()=>{
        try{ clone.style.opacity = '0'; }catch(e){}
        try{ if(otherEl) otherEl.classList.remove('unpicked'); }catch(e){}
        try{ clone.remove(); }catch(e){}
        if(turnScreen) turnScreen.classList.remove('pre-show');
        // now show the Turn UI and emphasize the winner
        show('turn');
        const turnPlayerEl = qs('#turn-player');
        if(turnPlayerEl){ turnPlayerEl.classList.add('winner'); setTimeout(()=>{ try{ turnPlayerEl.classList.remove('winner'); }catch(e){} }, 1600); }
          }, 2600);
    } else {
      // fallback: just show the Turn screen after a slightly longer linger
      setTimeout(()=>{ if(turnScreen) turnScreen.classList.remove('pre-show'); show('turn'); const turnPlayerEl = qs('#turn-player'); if(turnPlayerEl){ turnPlayerEl.classList.add('winner'); setTimeout(()=>{ try{ turnPlayerEl.classList.remove('winner'); }catch(e){} }, 1600); } }, 2200);
    }
  }catch(e){}
  // spinner finished — keep theme until the result flow ends (we'll remove it on result-next/result-success/result-fail)
  isSpinning = false;
}

on('#start-wheel','click',()=>{ renderPlayerList(); show('spinner'); });
// manual spin controls removed; spinner auto-starts when the spinner screen becomes active

// Settings menu interactions
const settingsBtn = qs('#settings-btn');
const settingsMenu = qs('#settings-menu');
if(settingsBtn){
  settingsBtn.addEventListener('click',(e)=>{ e.stopPropagation(); settingsMenu.classList.toggle('hidden'); });
}
document.addEventListener('click',(e)=>{ if(settingsMenu && !settingsMenu.contains(e.target) && e.target !== settingsBtn) settingsMenu.classList.add('hidden'); });

// Prevent interaction with spinner list while auto-spinning
document.addEventListener('click', (e)=>{
  if(isSpinning){ const li = e.target.closest ? e.target.closest('#spinner-list') : null; if(li){ e.stopPropagation(); e.preventDefault(); } }
}, true);

on('#settings-nicknames','click',()=>{
  if(settingsMenu) settingsMenu.classList.add('hidden');
  const modal = qs('#settings-modal');
  qs('#nickname-0').value = players[0] || 'Cutie';
  qs('#nickname-1').value = players[1] || 'Zoetje';
  modal.classList.remove('hidden');
});

on('#cancel-nicknames','click',()=>{ qs('#settings-modal').classList.add('hidden'); });
on('#save-nicknames','click',()=>{
  const n0 = qs('#nickname-0').value.trim() || 'Cutie';
  const n1 = qs('#nickname-1').value.trim() || 'Zoetje';
  const mx = parseInt(qs('#max-tokens').value,10) || 3;
  players[0] = n0; players[1] = n1; maxTokens = mx; renderPlayerList(); updateTokenUI(); qs('#settings-modal').classList.add('hidden');
  try{ localStorage.setItem('mf_settings', JSON.stringify({ players: players.slice(0,2), maxTokens })); }catch(e){}
});

on('#turn-truth','click',()=>{ const player = qs('#turn-player').textContent; const level = qs('#tod-level').value; const prompt = pickTodPrompt(level,'truth') || 'No prompt available'; qs('#result-player').textContent = player; qs('#result-text').textContent = prompt; setupTimerForResult(prompt); show('result'); });
on('#turn-dare','click',()=>{ const player = qs('#turn-player').textContent; const level = qs('#tod-level').value; const prompt = pickTodPrompt(level,'dare') || 'No prompt available'; qs('#result-player').textContent = player; qs('#result-text').textContent = prompt; setupTimerForResult(prompt); show('result'); });

on('#result-next','click',()=>{ const body=document.body; body.classList.remove('theme-cutie','theme-zoetje','theme-zoetje-pinkgreen'); setTimeout(()=> show('spinner'), 320); });
on('#result-success','click',()=>{
  const playerName = qs('#result-player').textContent;
  const idx = players.indexOf(playerName);
  if(idx<0) return;
  const reached = incToken(idx);
  if(reached){ // other player drinks
    const other = (idx===0?1:0);
    qs('#drink-title').textContent = `${players[other]} Drink!`;
    qs('#drink-text').textContent = `${players[other]} take a drink — ${players[idx]}'s tokens cleared.`;
    qs('#drink-modal').classList.remove('hidden');
    // clear tokens for idx
    tokens[idx]=0;
    updateTokenUI();
  }
  // fade back to normal before next spin
  const body = document.body; body.classList.remove('theme-cutie','theme-zoetje','theme-zoetje-pinkgreen');
  setTimeout(()=> show('spinner'), 320);
});
on('#result-fail','click',()=>{
  const playerName = qs('#result-player').textContent;
  const idx = players.indexOf(playerName);
  if(idx<0) return;
  // reset tokens on failure
  resetTokens(idx);
  const body = document.body; body.classList.remove('theme-cutie','theme-zoetje','theme-zoetje-pinkgreen');
  setTimeout(()=> show('spinner'), 320);
});

on('#drink-ok','click',()=>{ qs('#drink-modal').classList.add('hidden'); });

// Quick TOD buttons on main page (keeps backward compatibility)
on('#tod-truth','click',()=>{ const level = qs('#tod-level').value; const p = pickTodPrompt(level,'truth'); qs('#tod-text').textContent = p || 'No prompts'; setupTimerForTod(p); });
on('#tod-dare','click',()=>{ const level = qs('#tod-level').value; const p = pickTodPrompt(level,'dare'); qs('#tod-text').textContent = p || 'No prompts'; setupTimerForTod(p); });
on('#tod-next','click',()=>{ const t = Math.random()>0.5?'truth':'dare'; const level = qs('#tod-level').value; const p = pickTodPrompt(level,t); qs('#tod-text').textContent = p || 'No prompts'; setupTimerForTod(p); });
on('#tod-copy','click',()=>{ const txt = qs('#tod-text').textContent; if(!txt) return; navigator.clipboard.writeText(txt).then(()=>alert('Copied!')).catch(()=>{}); });

// update visuals when level changes
on('#tod-level','change',()=>{ const lv = qs('#tod-level').value; applyTodLevelVisual(lv); });

// Quick change spice button removed — dropdown lives in footer now

// Delegated spiciness selector handler — uses event delegation to ensure clicks are handled
document.addEventListener('click', (e)=>{
  const btn = e.target.closest ? e.target.closest('.tod-choice') : null;
  if(!btn) return;
  // consume the initiating click so it doesn't bubble to other handlers (e.g., .back)
  try{ e.stopPropagation(); e.preventDefault(); }catch(ex){}
  const level = btn.dataset.level;
  if(level){ const sel = qs('#tod-level'); if(sel) sel.value = level; applyTodLevelVisual(level); }
  btn.classList.add('selected'); setTimeout(()=> btn.classList.remove('selected'), 380);
  try{ renderPlayerList(); }catch(e){}
  show('spinner');
});

function showUpgradeToast(level){ try{ const t = qs('#tod-upgrade'); const l = qs('#tod-upgrade-level'); if(!t) return; if(l) l.textContent = level; t.classList.remove('hidden'); t.classList.add('show'); setTimeout(()=>{ t.classList.remove('show'); t.classList.add('hidden'); }, 2200); }catch(e){}

}


// Load saved settings if any
try{
  const s = JSON.parse(localStorage.getItem('mf_settings')||'null');
  if(s){ if(Array.isArray(s.players) && s.players.length>=2) players = [s.players[0], s.players[1]]; if(s.maxTokens) maxTokens = parseInt(s.maxTokens,10) || maxTokens; }
}catch(e){}
// ensure tokens array matches players
tokens = players.map(()=>0);

// Init
load36(); loadTod(); renderPlayerList(); updateTokenUI();
// hide player-strip by default; visible only on spinner/turn
try{ const ps = qs('#player-strip'); if(ps) ps.classList.add('hidden'); }catch(e){}
