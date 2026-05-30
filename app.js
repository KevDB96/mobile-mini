const qs = s => document.querySelector(s);
function on(selector, event, handler){ const els = document.querySelectorAll(selector); if(!els) return; if(els.length===0) return; if(els.length===1) els[0].addEventListener(event, handler); else els.forEach(e=>e.addEventListener(event, handler)); }
const screens = {
  home: qs('#home'), q36: qs('#q36'), tod: qs('#tod'), 'tod-select': qs('#tod-select'), players: qs('#players'),
  spinner: qs('#spinner'), turn: qs('#turn'), result: qs('#result')
};

// Embedded data removed to keep the source lean — app now expects JSON in `data/`.

function show(name){
  clearTimer();
  const TRANS_MS = 700; // ms to fade out outgoing text
  const prev = document.querySelector('.screen.active');
  const activate = ()=>{
    Object.values(screens).forEach(s=>{ if(s && s.classList) s.classList.remove('active'); });
    const scr = screens[name]; if(scr && scr.classList) scr.classList.add('active');
    // when showing TOD, ensure visual matches selected level
    if(name === 'tod'){ try{ const levelEl = qs('#tod-level'); const level = levelEl ? levelEl.value : 'regular'; applyTodLevelVisual(level); }catch(e){} }
    // when showing spinner, auto-run the spin after a short delay
    if(name === 'spinner'){
      try{
        renderPlayerList();
        isSpinning = true;
        // if navigating from the spiciness selector, give a slightly longer pause before auto-starting
        const spinDelay = (prev && prev.id === 'tod-select') ? 1200 : (prev && prev.id === 'result') ? 1400 : 800;
        setTimeout(()=>{ autoSpinAndPick(); }, spinDelay);
      }catch(e){}
    }
    // Keep player-strip visible on all screens except the home screen
    // and don't show it before the first spinner completes
    try{
      const ps = qs('#player-strip');
      if(ps){
        if(name === 'home' || !hasSpun) ps.classList.add('hidden'); else ps.classList.remove('hidden');
      }
    }catch(e){}
    // remove theme backgrounds when navigating home
    try{ if(name === 'home'){ document.body.classList.remove('theme-cutie','theme-zoetje-pinkgreen'); } }catch(e){}
  };

  if(prev && prev !== screens[name] && prev.classList){
    try{ prev.classList.add('fade-out'); }catch(e){}
    setTimeout(()=>{ try{ prev.classList.remove('fade-out'); }catch(e){}; activate(); }, TRANS_MS);
  } else {
    activate();
  }
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
// track whether we've completed the first spinner pick
let hasSpun = false;

async function load36(){
  try{
    const r = await fetch('data/36questions.json'); if(!r.ok) throw 0; q36 = await r.json();
  }catch(e){
    console.warn('Failed to load 36questions.json — ensure the app is served over HTTP and that data/36questions.json exists.');
    q36 = [];
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
  catch(e){ console.warn('Failed to load tod_prompts.json — ensure the app is served over HTTP and that data/tod_prompts.json exists.'); todPrompts = {mild:{truth:[],dare:[]},regular:{truth:[],dare:[]},hot:{truth:[],dare:[]},very_hot:{truth:[],dare:[]}}; }
}

// Timer utilities
let timerInterval = null;
function clearTimer(){ if(timerInterval){ clearInterval(timerInterval); timerInterval = null; } }
function parseSecondsFromText(text){ if(!text) return 0; const m = text.match(/(\d{1,2})\s*(?:-?\s*(?:second|sec|seconds)\b)/i); if(m) return parseInt(m[1],10); return 0; }
function formatMMSS(s){ const mm = Math.floor(s/60).toString().padStart(2,'0'); const ss = (s%60).toString().padStart(2,'0'); return `${mm}:${ss}`; }
function playBeep(){
  try{
    const C = window.AudioContext || window.webkitAudioContext;
    const ctx = new C();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = 900;
    o.connect(g);
    g.connect(ctx.destination);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    o.stop(ctx.currentTime + 0.4);
  }catch(e){
    try{ new Audio().play(); }catch(e){}
  } finally {
    try{ document.body.classList.add('flash'); setTimeout(()=>document.body.classList.remove('flash'),450); }catch(e){}
  }
}
function startCountdown(seconds, displayEl, onFinish, startBtn, nextBtn){
  clearTimer();
  let remaining = seconds;
  if(displayEl) displayEl.textContent = formatMMSS(remaining);
  if(nextBtn) nextBtn.disabled = true;
  if(startBtn){ startBtn.disabled = true; startBtn.classList.remove('hidden'); }
  timerInterval = setInterval(()=>{
    remaining--;
    if(displayEl) displayEl.textContent = formatMMSS(remaining);
    if(remaining<=0){
      clearTimer();
      playBeep();
      if(nextBtn) nextBtn.disabled = false;
      // hide the start button so the timer cannot be restarted
      try{ if(startBtn) startBtn.classList.add('hidden'); }catch(e){}
      if(onFinish) onFinish();
    }
  },1000);
}

function setupTimerForResult(text){
  clearTimer();
  const seconds = parseSecondsFromText(text);
  const area = qs('#result-timer-area');
  const display = qs('#result-timer-display');
  const startBtn = qs('#result-timer-start');
  const nextBtn = qs('#result-next');
  const succ = qs('#result-success');
  const fail = qs('#result-fail');
  // ensure confirm/fail buttons are visible when result is shown
  if(succ) succ.classList.remove('hidden');
  if(fail) fail.classList.remove('hidden');
  if(seconds>0){
    area.classList.remove('hidden');
    display.textContent = formatMMSS(seconds);
    if(nextBtn) nextBtn.disabled = true;
    // ensure the start button is visible and enabled for this result
    if(startBtn){ startBtn.classList.remove('hidden'); startBtn.disabled = false; }
    if(succ) succ.disabled = true;
    if(fail) fail.disabled = true;
    startBtn.onclick = ()=> startCountdown(seconds, display, ()=>{ if(succ) succ.disabled = false; if(fail) fail.disabled = false; }, startBtn, nextBtn);
  } else {
    area.classList.add('hidden');
    if(nextBtn) nextBtn.disabled = false;
    if(succ) succ.disabled = false;
    if(fail) fail.disabled = false;
  }
}

// Make prompt language explicit: replace ambiguous words with player names
function makePromptExplicit(text, actor, other){ if(!text) return text; try{ // word boundaries, case-insensitive
  // normalize common contractions first (you'd, you'll, you've, you're)
  text = text.replace(/\byou'd\b/ig, actor + " would");
  text = text.replace(/\byou'll\b/ig, actor + " will");
  text = text.replace(/\byou've\b/ig, actor + " have");
  text = text.replace(/\byou're\b/ig, actor + " is");
  // have/haven't usages
  text = text.replace(/\byou haven'?t\b/ig, actor + " hasn't");
  text = text.replace(/\byou have\b/ig, actor + " has");
  // possessive/your forms
  text = text.replace(/\byours\b/ig, actor + "'s");
  text = text.replace(/\byour\b/ig, actor + "'s");
  // generic you -> actor
  text = text.replace(/\byou\b/ig, actor);
  // handle I / I'm -> actor references (if present)
  text = text.replace(/\bI'm\b/ig, actor + " is");
  text = text.replace(/\bI\b/ig, actor);
  // I have/haven't -> actor has/hasn't
  text = text.replace(/\bI haven'?t\b/ig, actor + " hasn't");
  text = text.replace(/\bI have\b/ig, actor + " has");
  // replace me/my/mine -> other (cover punctuation)
  text = text.replace(/\bme\b/ig, other);
  text = text.replace(/\bmy\b/ig, other + "'s");
  text = text.replace(/\bmine\b/ig, other + "'s");
  // replace vague 'their' with 'the other person's' for clarity
  try{ text = text.replace(/\btheir\b/ig, "the other person's"); }catch(e){}
    // fix verb agreement when an actor name appears followed by 'have/haven't'
    function esc(s){ return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }
    try{
      const a = esc(actor);
      text = text.replace(new RegExp(a + "\\s+haven'?t","ig"), actor + " hasn't");
      text = text.replace(new RegExp(a + "\\s+have","ig"), actor + " has");
    }catch(e){}
    // cleanup spacing and punctuation artifacts
    text = text.replace(/\s+([?.!,;:\)])/g,'$1'); // remove space before punctuation
    text = text.replace(/\s{2,}/g,' ');
    // If the prompt explicitly contains the actor's name at the start (e.g. "Zoetje, ...")
    // or contains the actor's possessive ("Zoetje's ...") and the actor is the current turn player,
    // prefer natural 'You'/'your' phrasing so prompts read naturally to the person whose turn it is.
    function esc(s){ return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }
    try{
      const a = actor || '';
      if(a){
        // leading name like "Zoetje, ..." or "Zoetje ..."
        const leadRe = new RegExp('^'+esc(a)+'(\s*,|\s+)', 'i');
        if(leadRe.test(text)){
          text = text.replace(leadRe, 'You$1');
        }
        // possessive: "Zoetje's" -> "your"
        const possRe = new RegExp(esc(a) + "(?:'s|’s)\\b", 'ig');
        text = text.replace(possRe, 'your');
        // standalone actor references at sentence starts (e.g. "Zoetje when...")
        const startWordRe = new RegExp('^'+esc(a)+'\\b', 'i');
        if(startWordRe.test(text)) text = text.replace(startWordRe, 'You');
      }
    }catch(e){}
    return text.trim();
  }catch(e){ return text; } }

// Lightweight grammar/clarity fixer and finalizer for prompts
function finalizePrompt(rawText, actor, other, directedAtPlayer){
  if(!rawText) return rawText;
  try{
    // First, apply pronoun normalization
    let t = makePromptExplicit(rawText, actor, other) || rawText;
    // If the prompt is directed at the picked player, prefer 'you'/'your' phrasing
    if(directedAtPlayer && actor){
      try{ const esc = (s)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
        const a = esc(actor);
        // possessive -> your
        t = t.replace(new RegExp(a + "(?:'s|’s)\\b","ig"), 'your');
        // leading 'Actor, ...' -> 'You, ...' or start -> 'You'
        t = t.replace(new RegExp('^'+a+'(\s*,|\s+)','i'), 'You$1');
        // remaining standalone actor -> you
        t = t.replace(new RegExp('\\b'+a+'\\b','ig'), 'you');
      }catch(e){}
    }
    // common grammar fixes: replace awkward 'yourself' in contexts like 'has never let yourself' -> 'has never let you'
    t = t.replace(/has never let yourself/ig, 'has never let you');
    t = t.replace(/never let yourself/ig, 'never let you');
    t = t.replace(/let yourself\b/ig, 'let you');
    // collapse doubled words
    t = t.replace(/\b(\w+)\s+\1\b/ig, '$1');
    // trim extra spaces before punctuation
    t = t.replace(/\s+([?.!,;:])/g,'$1');
    // normalize whitespace
    t = t.replace(/\s{2,}/g,' ');
    return t.trim();
  }catch(e){ return rawText; }
}

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
      // render token icons instead of generic dots (show player's icon for each token)
      const iconChar = idx===0 ? '❤' : '🐸';
      for(let k=0;k<maxTokens;k++){ const t = document.createElement('span'); t.className = 'token-icon ' + (k < (tokens[idx]||0) ? 'on' : 'off'); t.textContent = iconChar; tk.appendChild(t); }
      // keep an empty icon element to preserve spacing on the left, but do not render the emoji
      icon.innerHTML = '';
      div.appendChild(icon); div.appendChild(name); div.appendChild(tk);
      // set initial opacity based on tokens
      div.style.opacity = tokens[idx]>0 ? '1' : '0.45'; ps.appendChild(div); }
  }
}

function updateTokenUI(){
  // update persistent player strip (token icons)
  document.querySelectorAll('#player-strip .player').forEach((el)=>{
    const idx = parseInt(el.dataset.idx,10);
    const tk = el.querySelector('.tokens'); if(!tk) return;
    const icons = Array.from(tk.querySelectorAll('.token-icon'));
    if(icons.length>0){
      icons.forEach((d,di)=>{ if(di < (tokens[idx]||0)) { d.classList.add('on'); d.classList.remove('off'); } else { d.classList.remove('on'); d.classList.add('off'); } });
    } else {
      // fallback for older dot-based tokens
      const dots = Array.from(tk.querySelectorAll('.dot'));
      dots.forEach((d,di)=>{ if(di < (tokens[idx]||0)) { d.classList.add('on'); d.classList.remove('off'); } else { d.classList.remove('on'); d.classList.add('off'); } });
    }
    if(tokens[idx]>0) el.classList.add('filled'); else el.classList.remove('filled');
    el.style.opacity = tokens[idx]>0 ? '1' : '0.45';
  });
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
  // Spinner parameters: keep it snappy but visible
  const total = 14 + Math.floor(Math.random()*4); // ~14-17 steps - shorter but still visible
  let current = spinnerIndex || 0;
  let step = 0;
  const baseDelay = 60; // base per-step (ms)
  const fastPeriod = 160; // initial fast burst (ms)
  const maxExtra = 420; // slowdown window size (ms)
  const capDelay = 700; // cap per-step delay (ms)
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
      const extraFinalPause = 800; // ms to linger on final tick
      if(step < total) stepOnce(capped); else { setTimeout(()=>{ spinnerIndex = current; finalizeSpinner(current); }, extraFinalPause); }
    }, delay);
  }
  stepOnce(baseDelay);
        // avoid visual flash on beep to keep background/themes stable
        try{ /* no body flash */ }catch(e){}}

function finalizeSpinner(idx){
  // mark that we've completed at least one spinner run
  hasSpun = true;
  const items = Array.from(qs('#spinner-list').children);
  const chosenEl = items[idx];
  if(chosenEl) chosenEl.classList.add('pop');
  setTimeout(()=>{ if(chosenEl) chosenEl.classList.remove('pop'); }, 700);
  const chosen = chosenEl ? chosenEl.querySelector('.name')?.textContent || chosenEl.textContent : null;
  if(chosen) qs('#turn-player').textContent = chosen;
  // set a slightly randomized diagonal cut and angle for the theme
  let themeClass = null;
  try{
    const cut = (40 + Math.floor(Math.random()*21)) + '%';
    const angle = (110 + Math.floor(Math.random()*61)) + 'deg';
    document.documentElement.style.setProperty('--player-cut', cut);
    document.documentElement.style.setProperty('--player-angle', angle);
  }catch(e){}
  // choose theme class; apply new theme without removing the old one immediately
  // so the CSS background transition can interpolate smoothly without flashes.
  const body = document.body;
  if(chosen === players[0]) themeClass = 'theme-cutie'; else themeClass = 'theme-zoetje-pinkgreen';
  try{
    const prevTheme = body.classList.contains('theme-cutie') ? 'theme-cutie' : (body.classList.contains('theme-zoetje-pinkgreen') ? 'theme-zoetje-pinkgreen' : null);
    if(themeClass && prevTheme !== themeClass){
      // add new theme immediately to trigger the CSS transition
      body.classList.add(themeClass);
      // remove previous theme after a brief overlap so we avoid a blank background state
      if(prevTheme){ setTimeout(()=>{ try{ body.classList.remove(prevTheme); }catch(e){} }, 1000); }
    } else if(themeClass){
      body.classList.add(themeClass);
    }
  }catch(e){}
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
    // compute center of viewport as the clone's landing spot
    const viewportCenter = { x: Math.round(window.innerWidth/2), y: Math.round(window.innerHeight/2) };
    // create a floating clone to animate
    // lock spinner list width to prevent re-centering while we hide the other element
    const spinnerListEl = qs('#spinner-list');
    const _spinnerPrevWidth = spinnerListEl ? spinnerListEl.style.width : '';
    if(spinnerListEl){ spinnerListEl.style.width = spinnerListEl.offsetWidth + 'px'; spinnerListEl.style.boxSizing = 'border-box'; }
    if(srcRect){
    // Prepare clone timings: keep the clone animation short so the Turn UI appears quickly,
    // but rely on the long CSS `body` transition for the background so colors fade slowly.
    const cloneGrowMs = 700; // grow duration (shorter so clone emphasizes then yields)
    const cloneFadeMs = 900; // fade duration (short so Turn UI appears sooner)
    const animTotal = cloneGrowMs + cloneFadeMs; // used for overlay/clone timing

    // create a darkening overlay to smooth out the theme swap and prevent flash
    const overlay = document.createElement('div');
    overlay.className = 'theme-overlay';
    overlay.style.opacity = '0';
    overlay.style.transition = `opacity ${animTotal}ms ease`;
    document.body.appendChild(overlay);

    const clone = chosenNameEl.cloneNode(true);
    // ensure clone text is visible on any background
    clone.style.color = '#ffffff';
    clone.style.fontWeight = '700';
    // preserve inherited styles lost when appending to body (prevents left-drift)
    const srcComputed = window.getComputedStyle(chosenNameEl);
    clone.style.fontSize = srcComputed.fontSize;
    clone.style.textAlign = 'center';
    // hide the original name so only the floating clone is visible during animation
    try{ if(chosenNameEl) chosenNameEl.style.visibility = 'hidden'; }catch(e){}
    // also fade the whole chosen list item (box) to match the name disappearance
    try{
      if(chosenEl){
        chosenEl.style.transition = `opacity 180ms ease, transform 180ms cubic-bezier(.2,.9,.2,1)`;
        chosenEl.style.opacity = '0';
        // keep layout space; hide visibility shortly after fade to avoid reflow
        setTimeout(()=>{ try{ chosenEl.style.visibility = 'hidden'; }catch(e){} }, 220);
      }
    }catch(e){}
    clone.style.position = 'fixed';
    // position clone exactly over the source element and keep horizontal position fixed
    clone.style.left = srcRect.left + 'px';
    clone.style.top = srcRect.top + 'px';
    clone.style.width = srcRect.width + 'px';
    clone.style.height = srcRect.height + 'px';
    clone.style.lineHeight = srcRect.height + 'px';
    clone.style.zIndex = 2000;
    clone.style.transition = `transform ${animTotal}ms cubic-bezier(.2,.9,.2,1), opacity ${animTotal}ms ease`;
    clone.style.transformOrigin = 'center center';
    document.body.appendChild(clone);
      // fade/move the unpicked person's name — we'll animate it inline so timings match the clone
      if(otherEl){
        otherEl.classList.add('unpicked');
        // quick fade and vanish: short transition so the other element disappears immediately
        otherEl.style.transition = `opacity 180ms ease, transform 180ms cubic-bezier(.2,.9,.2,1)`;
      }
      // compute vertical delta to viewport center (we'll only move vertically)
      const srcCenterY = srcRect.top + srcRect.height/2;
      const adjustedDy = viewportCenter.y - srcCenterY;
      // trigger the animation next tick (move clone to the exact target position inside the Turn screen)
      // start the clone animation slightly delayed so the spinner stopping moment is visible
      // increase the pause so the picked name lingers briefly before moving
      const initialDelay = 900;
      // mark chosen element as 'moving' so its selected effect fades immediately
      try{ if(chosenEl) { chosenEl.classList.remove('active'); chosenEl.classList.add('moving'); } }catch(e){}
      requestAnimationFrame(()=>{
        setTimeout(()=>{
          // fade the overlay in (don't snap to black) so the background swap is gradual
          const overlayMs = Math.round(animTotal * 0.9);
          overlay.style.backgroundColor = 'rgba(0,0,0,0.92)';
          overlay.style.transition = `opacity ${overlayMs}ms ease, background-color ${overlayMs}ms ease`;
          overlay.style.opacity = '1';
          // force layout so the change takes effect
          overlay.getBoundingClientRect();
          // apply theme immediately while the overlay darkens so the theme transition completes alongside the clone fade
          if(themeClass) body.classList.add(themeClass);
          // after theme applied, allow the overlay to fade out slowly to reveal the new theme
          overlay.style.transition = `opacity ${overlayMs}ms ease`;
          // animate the cloned name into place and make it much larger for emphasis
          // we'll grow the clone, hold it visible longer, then fade it out before revealing the Turn screen
            // translateY only to avoid any horizontal movement; scale for emphasis
            clone.style.transform = `translateY(${adjustedDy}px) scale(3.0)`;
          clone.style.opacity = '1';
          // animate the unpicked other name down or up depending on its position relative to the chosen one
          if(otherEl){
            try{
              // fade quickly and hide immediately so it appears to vanish
              otherEl.style.opacity = '0';
            }catch(e){ otherEl.style.opacity = '0'; }
            // hide visually but keep layout space to avoid reflow/centering shifts
            setTimeout(()=>{ try{ otherEl.style.visibility = 'hidden'; }catch(ex){} }, 220);
          }
          // begin fading the overlay after a short delay so the name animation and fade overlap
          setTimeout(()=>{ overlay.style.opacity = '0'; }, 240);
          // after the clone has grown, start fading it out, then show the Turn screen
          setTimeout(()=>{
            try{ clone.style.transition = `opacity ${cloneFadeMs}ms ease`; clone.style.opacity = '0'; }catch(e){}
          }, cloneGrowMs);
        }, 40);
      });
      // remove clone after its grow+fade animation and reveal the Turn UI
      const cloneShowDelay = cloneGrowMs + cloneFadeMs + 260;
      setTimeout(()=>{
        try{
          if(otherEl){
            otherEl.classList.remove('unpicked');
            otherEl.style.transition = '';
            otherEl.style.transform = '';
            otherEl.style.opacity = '';
            otherEl.style.visibility = '';
          }
        }catch(e){}
        try{ clone.remove(); }catch(e){}
        // restore spinner list width so layout can respond normally again
        try{ if(spinnerListEl) spinnerListEl.style.width = _spinnerPrevWidth || ''; }catch(e){}
        if(turnScreen) turnScreen.classList.remove('pre-show');
        // now show the Turn UI and emphasize the winner
        show('turn');
        const turnPlayerEl = qs('#turn-player');
        if(turnPlayerEl){ turnPlayerEl.classList.add('winner'); setTimeout(()=>{ try{ turnPlayerEl.classList.remove('winner'); }catch(e){} }, 2400); }
        // restore chosen name visibility shortly after showing Turn to avoid snapping back
        setTimeout(()=>{ try{ if(chosenNameEl){ chosenNameEl.style.visibility = ''; chosenNameEl.classList.remove('moving'); } if(chosenEl){ chosenEl.style.visibility = ''; chosenEl.style.opacity = ''; chosenEl.classList.remove('moving'); } }catch(e){} }, 1400);
        // remove overlay after the clone/background animation finishes
        setTimeout(()=>{ try{ overlay.remove(); }catch(e){} }, animTotal + 320);
      }, cloneShowDelay);
    } else {
      // fallback: just show the Turn screen after a slightly longer linger
      // fallback: apply theme smoothly then show Turn after a short delay
      const fallbackMs = 700;
      if(themeClass) body.classList.add(themeClass);
      setTimeout(()=>{ if(turnScreen) turnScreen.classList.remove('pre-show'); show('turn'); const turnPlayerEl = qs('#turn-player'); if(turnPlayerEl){ turnPlayerEl.classList.add('winner'); setTimeout(()=>{ try{ turnPlayerEl.classList.remove('winner'); }catch(e){} }, 1600); } }, fallbackMs);
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

on('#turn-truth','click',()=>{
  const player = qs('#turn-player').textContent;
  const level = qs('#tod-level').value;
  const promptRaw = pickTodPrompt(level,'truth') || 'No prompt available';
  const other = players.find(p=>p!==player) || players[0];
  const prompt = finalizePrompt(promptRaw, player, other, true);
  qs('#result-player').textContent = player;
  qs('#result-text').textContent = prompt;
  // reveal confirm/fail buttons
  const succ = qs('#result-success'); const fail = qs('#result-fail'); if(succ) succ.classList.remove('hidden'); if(fail) fail.classList.remove('hidden');
  // set button labels for truth
  if(succ) succ.textContent = 'Told the truth!';
  if(fail) fail.textContent = 'Liar, liar, pants on fire';
  setupTimerForResult(prompt);
  show('result');
});
on('#turn-dare','click',()=>{
  const player = qs('#turn-player').textContent;
  const level = qs('#tod-level').value;
  const promptRaw = pickTodPrompt(level,'dare') || 'No prompt available';
  const other = players.find(p=>p!==player) || players[0];
  const prompt = finalizePrompt(promptRaw, player, other, true);
  qs('#result-player').textContent = player;
  qs('#result-text').textContent = prompt;
  const succ = qs('#result-success'); const fail = qs('#result-fail'); if(succ) succ.classList.remove('hidden'); if(fail) fail.classList.remove('hidden');
  // set button labels for dare
  if(succ) succ.textContent = 'Did it!';
  if(fail) fail.textContent = 'Coward!!';
  setupTimerForResult(prompt);
  show('result');
});

on('#result-next','click',()=>{ setTimeout(()=> show('spinner'), 800); });
// hide confirm/fail buttons when navigating away from result
on('#result-next','click', ()=>{ const succ = qs('#result-success'); const fail = qs('#result-fail'); if(succ) succ.classList.add('hidden'); if(fail) fail.classList.add('hidden'); });
on('#result-success','click',()=>{
  // hide confirm/fail immediately
  try{ const s = qs('#result-success'); const f = qs('#result-fail'); if(s) s.classList.add('hidden'); if(f) f.classList.add('hidden'); }catch(e){}
  const playerName = qs('#result-player').textContent;
  const idx = players.indexOf(playerName);
  if(idx<0) return;
  const reached = incToken(idx);
  if(reached){ // other player drinks
    const other = (idx===0?1:0);
    qs('#drink-title').textContent = `${players[other]} Drinks!`;
    // simpler message: don't mention token-cleared text
    qs('#drink-text').textContent = `${players[other]} drinks.`;
    qs('#drink-modal').classList.remove('hidden');
    // clear tokens for idx
    tokens[idx]=0;
    updateTokenUI();
    // DO NOT auto-advance here; wait until the user clicks OK on the modal
    return;
  }
  // proceed to next spinner; keep the current theme colors visible
  setTimeout(()=> show('spinner'), 800);
});
on('#result-fail','click',()=>{
  try{ const s = qs('#result-success'); const f = qs('#result-fail'); if(s) s.classList.add('hidden'); if(f) f.classList.add('hidden'); }catch(e){}
  const playerName = qs('#result-player').textContent;
  const idx = players.indexOf(playerName);
  if(idx<0) return;
  // reset tokens on failure
  resetTokens(idx);
  // proceed to next spinner; keep the current theme colors visible
  setTimeout(()=> show('spinner'), 800);
});

on('#drink-ok','click',()=>{ qs('#drink-modal').classList.add('hidden'); try{ show('spinner'); }catch(e){} });

// Quick TOD buttons on main page (keeps backward compatibility)
on('#tod-truth','click',()=>{
  const level = qs('#tod-level').value;
  const pRaw = pickTodPrompt(level,'truth');
  const actor = players[0] || 'Player 1';
  const other = players[1] || 'Player 2';
  const p = finalizePrompt(pRaw, actor, other, true) || pRaw || 'No prompts';
  qs('#tod-text').textContent = p;
  setupTimerForTod(p);
});
on('#tod-dare','click',()=>{
  const level = qs('#tod-level').value;
  const pRaw = pickTodPrompt(level,'dare');
  const actor = players[0] || 'Player 1';
  const other = players[1] || 'Player 2';
  const p = finalizePrompt(pRaw, actor, other, true) || pRaw || 'No prompts';
  qs('#tod-text').textContent = p;
  setupTimerForTod(p);
});
on('#tod-next','click',()=>{
  const t = Math.random()>0.5?'truth':'dare';
  const level = qs('#tod-level').value;
  const pRaw = pickTodPrompt(level,t);
  const actor = players[0] || 'Player 1';
  const other = players[1] || 'Player 2';
  const p = finalizePrompt(pRaw,actor,other,true) || pRaw || 'No prompts';
  qs('#tod-text').textContent = p;
  setupTimerForTod(p);
});
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
// Decorative heart-sprinkle: create a few randomized hearts on the home CTA
function createHeartSprinkle(opts){
  try{
    // responsive defaults
    const vw = window.innerWidth || document.documentElement.clientWidth;
    const isMobile = vw <= 600;
    // avoid recreating if present
    const existing = qs('.page-heart-sprinkle');
    if(existing) return;
    const container = document.createElement('div'); container.className = 'page-heart-sprinkle';
    // compute avoidance zones (buttons, title, and other UI) in viewport coords
    const avoidEls = Array.from(document.querySelectorAll('#open-tod,#open-36,#game-title,#player-strip,header'));
    const rootRect = { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
    const avoidRects = avoidEls.map(e=>{
      const r = e.getBoundingClientRect();
      return {
        left: Math.max(0, r.left),
        top: Math.max(0, r.top),
        right: Math.min(rootRect.width, r.right),
        bottom: Math.min(rootRect.height, r.bottom)
      };
    }).filter(r=> r.right > r.left && r.bottom > r.top );

    // Determine preferred zones: underneath the home buttons, to the left, right, and a bottom strip
    const hb = document.querySelector('.home-buttons');
    const hbEl = hb ? hb.getBoundingClientRect() : null;
    const zones = [];
    if(hbEl){
      const extraX = isMobile ? Math.round(hbEl.width * 0.7) : Math.round(hbEl.width * 1.0);
      const extraY = isMobile ? Math.round(hbEl.height * 2.2) : Math.round(hbEl.height * 3.0);
      const topGap = isMobile ? 8 : 12;
      // central area underneath the buttons
      const center = {
        left: Math.max(12, hbEl.left - extraX),
        right: Math.min(rootRect.width - 12, hbEl.right + extraX),
        top: Math.max(hbEl.bottom + topGap, hbEl.bottom + 6),
        bottom: Math.min(rootRect.height - 24, hbEl.bottom + extraY),
        center: true
      };
      if(center.bottom <= center.top) center.bottom = Math.min(rootRect.height - 24, center.top + (isMobile ? 140 : 220));
      zones.push(center);
      // left of buttons (mark as a 'side' zone so we can bias placement toward it)
      const left = {
        left: Math.max(12, hbEl.left - extraX - (isMobile ? 80 : 160)),
        right: Math.max(12, hbEl.left - 8),
        top: Math.max(12, hbEl.top - (isMobile ? 20 : 40)),
        bottom: Math.min(rootRect.height - 24, hbEl.bottom + extraY),
        side: 'left'
      };
      if(left.right > left.left) zones.push(left);
      // right of buttons (mark as a 'side' zone so we can bias placement toward it)
      const right = {
        left: Math.min(rootRect.width - 24, hbEl.right + 8),
        right: Math.min(rootRect.width - 12, hbEl.right + extraX + (isMobile ? 80 : 160)),
        top: Math.max(12, hbEl.top - (isMobile ? 20 : 40)),
        bottom: Math.min(rootRect.height - 24, hbEl.bottom + extraY),
        side: 'right'
      };
      if(right.right > right.left) zones.push(right);
      // bottom strip
      const bottomStripHeight = isMobile ? 180 : 260;
      const bottom = {
        left: 12,
        right: rootRect.width - 12,
        top: Math.max(hbEl.bottom + 8, rootRect.height - bottomStripHeight),
        bottom: rootRect.height - 24
      };
      if(bottom.bottom > bottom.top) zones.push(bottom);
    } else {
      // fallback: lower half of viewport
      zones.push({ left: 12, right: rootRect.width - 12, top: Math.round(rootRect.height*0.45), bottom: rootRect.height - 24 });
    }

    const placed = [];
    const padding = isMobile ? 18 : 16; // px padding around avoid zones and between hearts
    // bias count around buttons: more hearts near buttons but still not on top
    const count = (opts && opts.count) || (isMobile ? (5 + Math.floor(Math.random()*4)) : (8 + Math.floor(Math.random()*6)));
    const maxTries = count * 24;
    let tries = 0;
    // build a weighted pick list so 'side' zones get sampled more often
    const pickZones = [];
    zones.forEach(z=>{
      pickZones.push(z);
      // bias side zones and center zone more heavily; stronger bias on mobile
      if(z.side){ const times = isMobile ? 4 : 2; for(let i=0;i<times;i++) pickZones.push(z); }
      if(z.center){ const times = isMobile ? 6 : 3; for(let i=0;i<times;i++) pickZones.push(z); }
    });
    const weighted = pickZones.length ? pickZones : zones;

    while(placed.length < count && tries < maxTries){
      tries++;
      // sample size smaller for mobile
      const size = isMobile ? Math.round(34 + Math.random()*48) : Math.round(44 + Math.random()*84);
      // pick a random zone (weighted toward side zones) and sample within it
      const zone = weighted[Math.floor(Math.random() * weighted.length)];
      const zoneW = Math.max(0, (zone.right - zone.left - size));
      const zoneH = Math.max(0, (zone.bottom - zone.top - size));
      if(zoneW <= 0 || zoneH <= 0) continue;
      const rx = zone.left + Math.round(Math.random() * zoneW);
      const ry = zone.top + Math.round(Math.random() * zoneH);
      const rect = {left: rx, top: ry, right: rx + size, bottom: ry + size, w: size, h: size};
      // keep inside viewport edges
      if(rect.left < padding || rect.top < padding || rect.right > rootRect.width - padding || rect.bottom > rootRect.height - padding) continue;
      // never place on top of home buttons: ensure rect.top >= hbEl.bottom + minGap when hb exists
      if(hbEl && rect.top < (hbEl.bottom + 6)) continue;
      // check avoidance rects in viewport coords
      const hitsAvoid = avoidRects.some(ar=> !(rect.right < (ar.left - padding) || rect.left > (ar.right + padding) || rect.bottom < (ar.top - padding) || rect.top > (ar.bottom + padding)) );
      if(hitsAvoid) continue;
      // check against previously placed hearts (no overlap)
      const overlaps = placed.some(p=> !(rect.right < p.left - padding || rect.left > p.right + padding || rect.bottom < p.top - padding || rect.top > p.bottom + padding));
      if(overlaps) continue;
      // accepted
      placed.push(rect);
      // create SVG heart
      const ns = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(ns, 'svg'); svg.setAttribute('viewBox','0 0 100 100'); svg.classList.add('heart');
      const leftPct = ((rect.left + rect.w/2) / rootRect.width) * 100;
      const topPct = ((rect.top + rect.h/2) / rootRect.height) * 100;
      svg.style.position = 'fixed';
      svg.style.left = leftPct + '%';
      svg.style.top = topPct + '%';
      svg.style.width = (rect.w / rootRect.width * 100) + 'vw';
      svg.style.height = 'auto';
      const rot = Math.round(-35 + Math.random()*70) + 'deg';
      const scale = (0.95 + Math.random()*0.35).toFixed(2);
      svg.style.setProperty('--rot', rot);
      svg.style.setProperty('--scale', scale);
      const path = document.createElementNS(ns, 'path');
      path.setAttribute('d', 'M50 82 L18 50 C6 38 14 20 32 24 C40 26 46 34 50 40 C54 34 60 26 68 24 C86 20 94 38 82 50 Z');
      path.setAttribute('fill','none');
      path.setAttribute('stroke','currentColor');
      path.setAttribute('stroke-linejoin','round');
      path.setAttribute('stroke-linecap','round');
      svg.appendChild(path);
      // Hearts are static now: set their base transform and opacity but do not animate
      svg.style.opacity = (isMobile ? (0.48 + Math.random()*0.4) : (0.52 + Math.random()*0.44)).toFixed(2);
      // position the heart visually according to its randomized rotation/scale variables
      svg.style.transform = `translate(-50%,-50%) rotate(${rot}) scale(${scale})`;
      container.appendChild(svg);
    }
    document.body.appendChild(container);
  }catch(e){console.warn('createHeartSprinkle failed',e);} 
}

// run once so hearts appear on the home screen; users can refresh to reshuffle
createHeartSprinkle();

// Remove and recreate hearts on resize/orientation change with debounce and smooth fade
function removeHeartSprinkle(){
  try{
    const c = qs('.page-heart-sprinkle'); if(!c) return;
    c.style.transition = 'opacity 280ms ease'; c.style.opacity = '0';
    setTimeout(()=>{ try{ c.remove(); }catch(e){} }, 320);
  }catch(e){}
}
let _heartResizeTimeout = null;
function scheduleHeartRecreate(){
  try{ if(_heartResizeTimeout) clearTimeout(_heartResizeTimeout); _heartResizeTimeout = setTimeout(()=>{ try{ removeHeartSprinkle(); setTimeout(()=>createHeartSprinkle(),120); }catch(e){} }, 360); }catch(e){}
}
window.addEventListener('resize', scheduleHeartRecreate);
window.addEventListener('orientationchange', scheduleHeartRecreate);
// hide player-strip by default; visible only on spinner/turn
try{ const ps = qs('#player-strip'); if(ps) ps.classList.add('hidden'); }catch(e){}
