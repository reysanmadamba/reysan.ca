// ── STATE ─────────────────────────────────────────────────────────────────────
let queue = [];       // current queue of question indices (into QS)
let skippedSet = new Set();
let results = [];     // {qsIdx, userAns, correct} for each answered question
let wrongCount = 0, correctCount = 0, answeredCount = 0;
let selectedOpt = null, confirmed = false;
const LETTERS = ['A','B','C','D'];
const TOTAL = QS.length;

function startQuiz(){
  queue = QS.map((_,i)=>i); // all 108, shuffled
  for(let i = queue.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [queue[i], queue[j]] = [queue[j], queue[i]];
  }
  skippedSet = new Set();
  results = [];
  wrongCount = 0; correctCount = 0; answeredCount = 0;
  selectedOpt = null; confirmed = false;
  document.getElementById('mainHeader').style.display = 'flex';
  showScreen('screen-quiz');
  renderQ();
  syncHUD();
}

function resetSession(){
  if(!confirm('Reset and restart from question 1 with a new random order?')) return;
  startQuiz();
}

function resetQuiz(){
  document.getElementById('mainHeader').style.display = 'none';
  document.getElementById('progFill').style.width = '0%';
  showScreen('screen-start');
}

// ── RENDER ────────────────────────────────────────────────────────────────────
function renderQ(){
  selectedOpt = null; confirmed = false;
  const qsIdx = queue[0];
  const q = QS[qsIdx];

  document.getElementById('qCard').className = 'q-card' + (skippedSet.has(qsIdx) ? ' state-skipped' : '');
  document.getElementById('skippedNote').classList.toggle('show', skippedSet.has(qsIdx));

  // Position display: how many have been answered + 1
  const pos = answeredCount + 1;
  document.getElementById('qNumDisplay').textContent = `${pos}`;

  document.getElementById('qText').innerHTML = `<strong>Q${answeredCount + 1}.</strong> ${q.q}`;

  // Sign image
  const imgEl = document.getElementById('qSignImg');
  if(Q_IMAGES[q._num]){
    imgEl.src = Q_IMAGES[q._num];
    imgEl.style.display = 'block';
  } else {
    imgEl.src = '';
    imgEl.style.display = 'none';
  }

  // Options
  const wrap = document.getElementById('optionsWrap');
  wrap.innerHTML = '';
  q.opts.forEach((opt,i)=>{
    const btn = document.createElement('button');
    btn.className = 'option';
    btn.innerHTML = `<span class="opt-letter">${LETTERS[i]}</span><span>${opt}</span>`;
    btn.onclick = ()=> selectOpt(i);
    wrap.appendChild(btn);
  });

  // Feedback reset
  const fb = document.getElementById('feedbackBox');
  fb.className = 'feedback';

  document.getElementById('btnConfirm').disabled = true;
  document.getElementById('btnConfirm').style.display = '';
  document.getElementById('btnNext').style.display = 'none';
  document.getElementById('btnSkip').style.display = '';

  window.scrollTo({top:0, behavior:'smooth'});
}

function selectOpt(i){
  if(confirmed) return;
  selectedOpt = i;
  document.querySelectorAll('.option').forEach((b,idx)=> b.classList.toggle('selected', idx===i));
  document.getElementById('btnConfirm').disabled = false;
}

function confirmAnswer(){
  if(selectedOpt === null || confirmed) return;
  confirmed = true;

  const qsIdx = queue[0];
  const q = QS[qsIdx];
  const ok = selectedOpt === q.ans;

  if(ok) correctCount++; else wrongCount++;
  answeredCount++;
  results.push({qsIdx, userAns: selectedOpt, correct: ok});

  // Style options
  document.querySelectorAll('.option').forEach((btn,idx)=>{
    btn.disabled = true;
    if(idx === q.ans){ btn.classList.add('opt-correct'); btn.classList.remove('selected'); }
    else if(idx === selectedOpt && !ok){ btn.classList.add('opt-wrong'); btn.classList.remove('selected'); }
  });

  // Feedback
  const fb = document.getElementById('feedbackBox');
  if(ok){
    fb.className = 'feedback show fb-ok';
    document.getElementById('fbIcon').textContent = '✓';
    document.getElementById('fbText').textContent = 'Correct!';
    document.getElementById('qCard').classList.add('state-correct');
    document.getElementById('qCard').classList.remove('state-skipped');
  } else {
    fb.className = 'feedback show fb-bad';
    document.getElementById('fbIcon').textContent = '✗';
    document.getElementById('fbText').innerHTML = `Incorrect. Correct answer: <strong>${LETTERS[q.ans]}. ${q.opts[q.ans]}</strong>`;
    document.getElementById('qCard').classList.add('state-wrong');
    document.getElementById('qCard').classList.remove('state-skipped');
  }

  document.getElementById('btnConfirm').style.display = 'none';
  document.getElementById('btnSkip').style.display = 'none';
  document.getElementById('btnNext').style.display = '';

  syncHUD();
}

function nextQuestion(){
  queue.shift();
  if(queue.length === 0){ showResult(); return; }
  renderQ();
}

function skipQuestion(){
  if(confirmed) return;
  const qsIdx = queue.shift();
  skippedSet.add(qsIdx);
  queue.push(qsIdx); // rotate to back
  renderQ();
  syncHUD();
}

// ── RESULT ────────────────────────────────────────────────────────────────────
function showResult(){
  showScreen('screen-result');
  const pct = Math.round((correctCount / TOTAL) * 100);
  const pass = pct >= 83; // 25/30 = 83%

  document.getElementById('resultEmoji').textContent = '';
  const t = document.getElementById('resultTitle');
  t.textContent = pass ? 'Excellent Work!' : pct >= 70 ? 'Good Effort!' : 'Keep Studying!';
  t.className = pass ? 'pass' : 'fail';
  document.getElementById('resultSub').textContent =
    `You answered ${correctCount} out of ${TOTAL} questions correctly (${pct}%). ${wrongCount} wrong answer${wrongCount!==1?'s':''}.`;
  document.getElementById('r-correct').textContent = correctCount;
  document.getElementById('r-wrong').textContent = wrongCount;
  document.getElementById('r-pct').textContent = pct + '%';

  

  // Build review list (wrong answers only)
  const wrongResults = results.filter(r => !r.correct);
  const btnReview = document.getElementById('btnReview');
  if(wrongResults.length === 0){
    btnReview.style.display = 'none';
  } else {
    btnReview.textContent = `Review ${wrongResults.length} Wrong Answer${wrongResults.length!==1?'s':''} ↓`;
  }
}

function toggleReview(){
  const wrap = document.getElementById('reviewWrap');
  const btn = document.getElementById('btnReview');
  if(wrap.style.display === 'none'){
    // Build content
    wrap.innerHTML = '';
    const wrongResults = results.filter(r => !r.correct);
    if(wrongResults.length === 0){
      wrap.innerHTML = '<p style="color:var(--correct);text-align:center;padding:20px;">No wrong answers!</p>';
    } else {
      const title = document.createElement('div');
      title.className = 'review-title';
      title.textContent = `Wrong Answers (${wrongResults.length})`;
      wrap.appendChild(title);
      wrongResults.forEach(r => {
        const q = QS[r.qsIdx];
        const div = document.createElement('div');
        div.className = 'review-item ri-wrong';
        div.innerHTML = `
          <div class="ri-qnum">Q${q._num}</div>
          <div class="ri-q">${q.q}</div>
          <div class="ri-yours">✗ Your answer: ${LETTERS[r.userAns]}. ${q.opts[r.userAns]}</div>
          <div class="ri-correct">✓ Correct: ${LETTERS[q.ans]}. ${q.opts[q.ans]}</div>
        `;
        wrap.appendChild(div);
      });
    }
    wrap.style.display = 'block';
    btn.textContent = 'Hide Review ↑';
  } else {
    wrap.style.display = 'none';
    const wc = results.filter(r=>!r.correct).length;
    btn.textContent = `Review ${wc} Wrong Answer${wc!==1?'s':''} ↓`;
  }
}

// ── HUD ───────────────────────────────────────────────────────────────────────
function syncHUD(){
  document.getElementById('hud-q').textContent = `${answeredCount}/${TOTAL}`;
  document.getElementById('hud-ok').textContent = correctCount;
  document.getElementById('hud-bad').textContent = wrongCount;
  document.getElementById('hud-skip').textContent = skippedSet.size;
  document.getElementById('hud-rem').textContent = (TOTAL - answeredCount) + ' left';
  const pct = (answeredCount / TOTAL) * 100;
  document.getElementById('progFill').style.width = pct + '%';
  document.getElementById('miniBar').style.width = pct + '%';
  document.getElementById('miniPct').textContent = Math.round(pct) + '%';
}

function showScreen(id){
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ── CONFETTI ──────────────────────────────────────────────────────────────────
function launchConfetti(){
  const c = document.getElementById('confetti');
  const ctx = c.getContext('2d');
  c.width = window.innerWidth; c.height = window.innerHeight; c.style.display = 'block';
  const cols = ['#f5c518','#3dd68c','#5b8ef0','#e8931a','#fff','#f05454'];
  const pts = Array.from({length:130}, ()=>({
    x:Math.random()*c.width, y:Math.random()*c.height - c.height,
    r:Math.random()*6+3, d:Math.random()*4+2,
    col:cols[Math.floor(Math.random()*cols.length)],
    ta:Math.random()*Math.PI, tai:(Math.random()*.07+.05)*(Math.random()<.5?1:-1),
  }));
  let f = 0;
  function draw(){
    ctx.clearRect(0,0,c.width,c.height);
    pts.forEach(p=>{
      p.ta += p.tai; p.y += p.d;
      if(p.y > c.height+20){ p.y=-10; p.x=Math.random()*c.width; }
      const tilt = Math.sin(p.ta)*12;
      ctx.beginPath(); ctx.lineWidth=p.r; ctx.strokeStyle=p.col;
      ctx.moveTo(p.x+tilt, p.y); ctx.lineTo(p.x+tilt+p.r*2, p.y+tilt+p.r*2); ctx.stroke();
    });
    f++;
    if(f < 230) requestAnimationFrame(draw);
    else { ctx.clearRect(0,0,c.width,c.height); c.style.display='none'; }
  }
  draw();
}