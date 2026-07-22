// Service Worker PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('PWA Service Worker actif !', reg.scope))
      .catch(err => console.log('Erreur SW :', err));
  });
}

// Configuration API — Proxy sécurisé via Vercel (clé stockée côté serveur)
const OPENROUTER_CONFIG = {
  endpoint: "/api/chat",
  model: "google/gemini-2.5-flash"
};

let englishChatHistory = [];
let tutorChatHistory = [];

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSound(type) {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  const now = audioCtx.currentTime;
  if (type === 'correct' || type === 'goal') {
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(523.25, now);
    osc.frequency.exponentialRampToValueAtTime(783.99, now + 0.15);
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);
    osc.start(now); osc.stop(now + 0.35);
  } else if (type === 'win') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.3);
    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
    osc.start(now); osc.stop(now + 0.5);
  } else {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, now);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
    osc.start(now); osc.stop(now + 0.05);
  }
}

let currentData = {
  activeChild: 'Abigaïl',
  activeClass: 'CI',
  stars: { 'Abigaïl': 0, 'Bignon': 0, 'Nathan': 0 },
  sessionsDone: { 'Abigaïl': 0, 'Bignon': 0, 'Nathan': 0 },
  quizzesDone: 0,
  studyMinutes: 0,
  sportsUnlocked: false,
  studySecondsLeft: 1800,
  timerRunning: false,
  timerInterval: null
};

const curriculums = {
  'CI': [
    { id: 'maths-ci', title: 'Calculs Abigaïl (1-20)', icon: '🔢', bg: 'math-bg', desc: 'Additions simples, comptage et logique pour le CI.' },
    { id: 'reading-ci', title: 'Lecture & Syllabes', icon: '🔤', bg: 'quiz-bg', desc: 'Reconnaissance des lettres, voyelles et sons fondamentaux.' },
    { id: 'nature-ci', title: 'Éveil & Découverte', icon: '🌱', bg: 'sports-bg', desc: 'Découverte de la nature, du corps et du vocabulaire.' }
  ],
  '3ème': [
    { id: 'maths-3eme', title: 'Maths Bignon (Théorèmes BEPC)', icon: '📐', bg: 'math-bg', desc: 'Théorème de Pythagore, Thalès, développements et équations.' },
    { id: 'pc-3eme', title: 'Physique-Chimie (Électricité & Matière)', icon: '⚡', bg: 'quiz-bg', desc: "Loi d'Ohm, poids, masse et réactions chimiques." },
    { id: 'svt-3eme', title: 'SVT & Biologie', icon: '🧬', bg: 'sports-bg', desc: 'Système immunitaire, circulation sanguine et santé.' }
  ],
  '1ère D': [
    { id: 'maths-1erd', title: 'Maths Nathan (2nd Degré & Fonctions)', icon: '📊', bg: 'math-bg', desc: 'Discriminant Δ, polynômes, limites et fonctions.' },
    { id: 'pc-1erd', title: 'Physique-Chimie (Cinématique & Solutions)', icon: '🧪', bg: 'quiz-bg', desc: 'Mouvement, accélération, équations de réactions et pH.' },
    { id: 'svt-1erd', title: 'SVT (Génétique & Mitose)', icon: '🔬', bg: 'sports-bg', desc: 'ADN, mitose, méiose et hérédité biologique.' }
  ]
};

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => { playSound('click'); switchTab(btn.getAttribute('data-tab')); });
});

function switchTab(tabId) {
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  const activeBtn = document.querySelector(`.nav-btn[data-tab="${tabId}"]`);
  const activeContent = document.getElementById(tabId);
  if (activeBtn) activeBtn.classList.add('active');
  if (activeContent) activeContent.classList.add('active');
  if (tabId === 'home-tab') triggerConfetti();
}

function triggerConfetti() {
  playSound('win');
  if (typeof confetti === 'function') confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
}

function selectChildProfile(name, grade) {
  playSound('click');
  currentData.activeChild = name;
  currentData.activeClass = grade;
  tutorChatHistory = [];
  document.querySelectorAll('.chip-btn').forEach(btn => {
    btn.classList.toggle('active', btn.textContent.includes(name));
  });
  const d1 = document.getElementById('active-class-display');
  if (d1) d1.textContent = `Profil : ${name} • Classe : ${grade} (${grade === 'CI' ? 'Primaire' : grade === '3ème' ? 'Collège' : 'Lycée D'})`;
  const d2 = document.getElementById('tutor-current-class');
  if (d2) d2.textContent = `${name} (${grade})`;
  const d3 = document.getElementById('tutor-welcome-msg');
  if (d3) d3.textContent = `Bonjour ! Je suis l'assistant scolaire de ${name} (${grade}). Quelle question ou leçon souhaitez-vous étudier ?`;
  renderSuggestedQuestions(name, grade);
  renderSubjectsForClass();
  updateUI();
}

function renderSuggestedQuestions(name, grade) {
  const container = document.getElementById('suggested-questions-box');
  if (!container) return;
  if (grade === 'CI') {
    container.innerHTML = `<span>Recherches rapides pour ${name} :</span>
      <button class="btn btn-sm btn-secondary" onclick="askSuggested('Comment lire les sons MA, PA, BA en CI ?')">Lecture (Syllabes)</button>
      <button class="btn btn-sm btn-secondary" onclick="askSuggested('Additions simples de 1 à 20')">Maths (Calculs)</button>
      <button class="btn btn-sm btn-secondary" onclick="askSuggested('Colors and animals in English')">Anglais</button>`;
  } else if (grade === '3ème') {
    container.innerHTML = `<span>Recherches rapides pour ${name} :</span>
      <button class="btn btn-sm btn-secondary" onclick="askSuggested('Explique le théorème de Pythagore en 3ème')">Maths (Pythagore)</button>
      <button class="btn btn-sm btn-secondary" onclick="askSuggested('Explication de la loi d\'Ohm en Physique')">Physique</button>
      <button class="btn btn-sm btn-secondary" onclick="askSuggested('Irregular verbs list in English')">Anglais</button>`;
  } else {
    container.innerHTML = `<span>Recherches rapides pour ${name} :</span>
      <button class="btn btn-sm btn-secondary" onclick="askSuggested('Calculer le discriminant Δ d\'un polynôme du 2nd degré')">Maths (Discriminant)</button>
      <button class="btn btn-sm btn-secondary" onclick="askSuggested('Étapes de la mitose et de la méiose en SVT')">SVT</button>
      <button class="btn btn-sm btn-secondary" onclick="askSuggested('Advanced grammar and essay writing in English')">Anglais (Bac)</button>`;
  }
}

function renderSubjectsForClass() {
  const container = document.getElementById('subjects-grid');
  const subjects = curriculums[currentData.activeClass] || curriculums['CI'];
  let html = subjects.map(sub => `
    <div class="game-card glass-card">
      <div class="game-icon-badge ${sub.bg}">${sub.icon}</div>
      <h3>${sub.title}</h3><p>${sub.desc}</p>
      <button class="btn btn-primary btn-block" onclick="startSubjectGame('${sub.id}')">Démarrer la Révision</button>
    </div>`).join('');
  if (currentData.sportsUnlocked) {
    html += `<div class="game-card glass-card" style="border:2px solid var(--accent);">
      <div class="game-icon-badge sports-bg">⚽🏀</div>
      <h3>PAUSE SPORT DÉBLOQUÉE !</h3>
      <p>Bravo ${currentData.activeChild} ! Choisis ton jeu !</p>
      <button class="btn btn-success btn-block" onclick="startFootballGame()">⚽ Tir au But</button>
      <button class="btn btn-primary btn-block" style="margin-top:0.4rem;" onclick="startBasketballGame()">🏀 Panier Basket</button>
    </div>`;
  } else {
    html += `<div class="game-card glass-card" style="opacity:0.7;">
      <div class="game-icon-badge sports-bg">🔒</div>
      <h3>Pause Sport (${currentData.activeChild})</h3>
      <p>Accomplis une révision ou étudie 30 min pour débloquer !</p>
    </div>`;
  }
  container.innerHTML = html;
}

function toggleStudySession() {
  const btn = document.getElementById('start-study-btn');
  if (currentData.timerRunning) {
    clearInterval(currentData.timerInterval);
    currentData.timerRunning = false;
    btn.textContent = "\u25b6 Démarrer l'\u00c9tude";
    btn.className = 'btn btn-success';
  } else {
    currentData.timerRunning = true;
    btn.textContent = '⏸ Pause'; btn.className = 'btn btn-secondary';
    currentData.timerInterval = setInterval(() => {
      if (currentData.studySecondsLeft > 0) {
        currentData.studySecondsLeft--; updateTimerDisplay();
      } else {
        clearInterval(currentData.timerInterval);
        currentData.sportsUnlocked = true;
        currentData.sessionsDone[currentData.activeChild] += 1;
        currentData.studyMinutes += 30;
        renderSubjectsForClass(); updateUI(); triggerConfetti();
        alert(`🎉 Bravo ${currentData.activeChild} ! Pause Sport débloquée !`);
      }
    }, 1000);
  }
}

function updateTimerDisplay() {
  const m = Math.floor(currentData.studySecondsLeft / 60);
  const s = currentData.studySecondsLeft % 60;
  document.getElementById('study-timer').textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function startSubjectGame(subId) {
  playSound('click');
  document.getElementById('game-arena').classList.remove('hidden');
  let q = '', opts = [], ci = 0;
  if (currentData.activeClass === 'CI') { q = 'Combien font 5 + 3 ?'; opts = ['7','8','9','10']; ci = 1; }
  else if (currentData.activeClass === '3ème') { q = 'Triangle rectangle 3cm et 4cm : quelle est l\'hypoténuse ?'; opts = ['5 cm','6 cm','7 cm','8 cm']; ci = 0; }
  else { q = 'Pour 2x² - 4x + 2 = 0, quelle est la valeur de Δ ?'; opts = ['Δ = 0','Δ = 16','Δ = 4','Δ = -8']; ci = 0; }
  document.getElementById('game-content').innerHTML = `
    <div class="math-quiz-box">
      <h3>📚 Révision ${currentData.activeClass} (${currentData.activeChild})</h3>
      <div class="math-question" style="font-size:1.4rem">${q}</div>
      <div class="math-options-grid">${opts.map((o,i) => `<button class="option-btn" onclick="checkSubjectAnswer(${i===ci})">${o}</button>`).join('')}</div>
    </div>`;
}

function checkSubjectAnswer(ok) {
  if (ok) {
    playSound('correct'); triggerConfetti();
    currentData.stars[currentData.activeChild] += 25;
    currentData.quizzesDone++; currentData.studyMinutes += 15; currentData.sportsUnlocked = true;
    updateUI(); renderSubjectsForClass();
    alert(`✨ Excellent ${currentData.activeChild} ! +25 Étoiles ⭐ & Pause Sport débloquée !`);
    closeGameArena();
  } else { playSound('click'); alert("Ce n'est pas tout à fait ça. Réessaie !"); }
}

function startEnglishVocabGame() {
  playSound('click');
  document.getElementById('english-arena').classList.remove('hidden');
  let q = '', opts = [], ci = 0;
  if (currentData.activeClass === 'CI') { q = "Comment dit-on 'Le Chat' en Anglais ?"; opts = ['The Cat 🐱','The Dog 🐶','The Bird 🐦','The Fish 🐟']; ci = 0; }
  else if (currentData.activeClass === '3ème') { q = "Choose the correct past tense: 'Yesterday, she ______ to school.'"; opts = ['went','go','gone','going']; ci = 0; }
  else { q = "Select the synonym of 'Significant':"; opts = ['Important','Small','Useless','Random']; ci = 0; }
  document.getElementById('english-content').innerHTML = `
    <div class="math-quiz-box">
      <h3>🇬🇧 Practice English (${currentData.activeChild} — ${currentData.activeClass})</h3>
      <p style="color:#34d399;font-weight:700;margin-bottom:1rem">Supervisé par Maman 👩‍🏫</p>
      <div class="math-question" style="font-size:1.3rem">${q}</div>
      <div class="math-options-grid">${opts.map((o,i) => `<button class="option-btn" onclick="checkEnglishAnswer(${i===ci})">${o}</button>`).join('')}</div>
    </div>`;
}

function checkEnglishAnswer(ok) {
  if (ok) { playSound('correct'); triggerConfetti(); currentData.stars[currentData.activeChild] += 25; updateUI(); alert(`🌟 Perfect ${currentData.activeChild}! +25 Stars ⭐`); document.getElementById('english-arena').classList.add('hidden'); }
  else { playSound('click'); alert('Not quite. Try again!'); }
}

function startEnglishConversation() {
  playSound('click');
  document.getElementById('english-arena').classList.remove('hidden');
  const name = currentData.activeChild, grade = currentData.activeClass;
  let lvl = grade === 'CI' ? 'a very young beginner. Use simple English: colors, animals, greetings only.'
    : grade === '3ème' ? 'a middle school student preparing for BEPC. Use intermediate English with grammar tips.'
    : 'a high school student in 1ère D preparing for the Baccalauréat. Use advanced vocabulary and essay structures.';
  englishChatHistory = [{ role: 'system', content: `You are a warm English teacher chatting with ${name}, ${lvl} Gently correct mistakes. Keep replies short (2-4 sentences). If the user says they are Mum or the teacher, switch to a professional peer tone.` }];
  const greeting = grade === 'CI' ? `Hello ${name}! 😊 How are you today?` : grade === '3ème' ? `Hello ${name}! Ready to practice English?` : `Hello ${name}! Let's sharpen your English skills today.`;
  document.getElementById('english-content').innerHTML = `
    <div class="math-quiz-box">
      <h3>🗣️ English Conversation — ${name} (${grade})</h3>
      <p style="color:#34d399;font-weight:700">Supervised by Mum, English Teacher 👩‍🏫</p>
      <div class="chat-messages" id="english-chat-box" style="max-height:280px;overflow-y:auto;text-align:left;background:rgba(15,23,42,0.8);padding:1rem;border-radius:12px;margin:1rem 0">
        <div class="message ai-msg"><div class="msg-bubble">${greeting}</div></div>
      </div>
      <div style="display:flex;gap:0.5rem">
        <input type="text" id="english-user-input" placeholder="Type in English..." class="input-field" onkeypress="if(event.key==='Enter')sendEnglishChatMessage()">
        <button class="btn btn-primary" onclick="sendEnglishChatMessage()">Send 🚀</button>
      </div>
    </div>`;
}

async function sendEnglishChatMessage() {
  const inp = document.getElementById('english-user-input');
  const q = inp.value.trim(); if (!q) return;
  playSound('click');
  const box = document.getElementById('english-chat-box');
  box.innerHTML += `<div class="message user-msg"><div class="msg-bubble">${q}</div></div>`;
  inp.value = ''; box.scrollTop = box.scrollHeight;
  box.innerHTML += `<div class="message ai-msg" id="english-loading"><div class="msg-bubble">💬 <em>Replying...</em></div></div>`;
  box.scrollTop = box.scrollHeight;
  englishChatHistory.push({ role: 'user', content: q });
  const reply = await fetchOpenRouterAPI(englishChatHistory);
  englishChatHistory.push({ role: 'assistant', content: reply });
  const ld = document.getElementById('english-loading');
  if (ld) ld.remove();
  playSound('correct');
  box.innerHTML += `<div class="message ai-msg"><div class="msg-bubble">${reply.replace(/\n/g,'<br>')}</div></div>`;
  box.scrollTop = box.scrollHeight;
}

function startCognitiveMemory() {
  playSound('click');
  document.getElementById('cognitive-arena').classList.remove('hidden');
  const symbols = ['🧠','🧠','⚡','⚡','🎯','🎯','🚀','🚀'];
  const shuffled = [...symbols].sort(() => Math.random() - 0.5);
  cogFlipped = []; cogMatched = 0;
  document.getElementById('cognitive-content').innerHTML = `
    <div class="math-quiz-box">
      <h3>🧠 Test de Mémoire Visuelle (${currentData.activeChild})</h3>
      <p style="margin-bottom:1rem;color:#94a3b8">Retrouve les 4 paires !</p>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:0.8rem;max-width:380px;margin:0 auto">
        ${shuffled.map(s => `<button class="option-btn" data-sym="${s}" onclick="flipCogCard(this,'${s}')">\u2753</button>`).join('')}
      </div>
    </div>`;
}

let cogFlipped = [], cogMatched = 0;

function flipCogCard(btn, sym) {
  if (btn.textContent !== '\u2753' || cogFlipped.length >= 2) return;
  playSound('click'); btn.textContent = sym; cogFlipped.push(btn);
  if (cogFlipped.length === 2) {
    if (cogFlipped[0].getAttribute('data-sym') === cogFlipped[1].getAttribute('data-sym')) {
      playSound('correct'); cogMatched++; cogFlipped = [];
      if (cogMatched === 4) setTimeout(() => { playSound('win'); triggerConfetti(); currentData.stars[currentData.activeChild] += 30; updateUI(); alert(`🎉 Bravo ${currentData.activeChild} ! +30 Étoiles ⭐`); closeCognitiveArena(); }, 400);
    } else { setTimeout(() => { cogFlipped[0].textContent = '\u2753'; cogFlipped[1].textContent = '\u2753'; cogFlipped = []; }, 700); }
  }
}

function startCognitiveCalculus() {
  playSound('click');
  document.getElementById('cognitive-arena').classList.remove('hidden');
  const n1 = Math.floor(Math.random()*15)+5, n2 = Math.floor(Math.random()*15)+5, ans = n1+n2;
  document.getElementById('cognitive-content').innerHTML = `
    <div class="math-quiz-box">
      <h3>⚡ Agilité Mentale (${currentData.activeChild})</h3>
      <p style="margin-bottom:1rem;color:#94a3b8">Réponds vite !</p>
      <div class="math-question">${n1} + ${n2} = ?</div>
      <div style="display:flex;justify-content:center;gap:1rem">
        <input type="number" id="cog-ans" class="input-field" style="max-width:150px;font-size:1.5rem;text-align:center">
        <button class="btn btn-primary" onclick="checkCogAns(${ans})">Valider 🚀</button>
      </div>
    </div>`;
}

function checkCogAns(target) {
  const val = parseInt(document.getElementById('cog-ans').value);
  if (val === target) { playSound('correct'); triggerConfetti(); currentData.stars[currentData.activeChild] += 20; updateUI(); alert(`⚡ Rapidité excellente ${currentData.activeChild} ! +20 Étoiles ⭐`); closeCognitiveArena(); }
  else { playSound('click'); alert('Oups ! Réessaie !'); }
}

function startCognitiveSimon() { playSound('click'); alert('🎯 Simon : Mémorise la séquence de couleurs pour développer ta concentration !'); }
function closeCognitiveArena() { playSound('click'); document.getElementById('cognitive-arena').classList.add('hidden'); }

async function fetchOpenRouterAPI(messagesArray) {
  try {
    const response = await fetch(OPENROUTER_CONFIG.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: OPENROUTER_CONFIG.model, messages: messagesArray })
    });
    const data = await response.json();
    if (data && data.choices && data.choices[0] && data.choices[0].message) return data.choices[0].message.content;
    if (data && data.error) return `⚠️ Erreur API : ${data.error.message}`;
  } catch (err) {
    return '⚠️ Connexion impossible. Vérifie ta connexion internet.';
  }
  return '⚠️ Réponse inattendue. Réessaie dans quelques secondes.';
}

function handleChatKeyPress(e) { if (e.key === 'Enter') sendAIQuestion(); }
function askSuggested(text) { document.getElementById('ai-question-input').value = text; sendAIQuestion(); }

async function sendAIQuestion() {
  const input = document.getElementById('ai-question-input');
  const query = input.value.trim(); if (!query) return;
  playSound('click');
  const box = document.getElementById('chat-messages');
  box.innerHTML += `<div class="message user-msg"><div class="msg-bubble">${query}</div></div>`;
  input.value = ''; box.scrollTop = box.scrollHeight;
  box.innerHTML += `<div class="message ai-msg" id="loading-msg"><div class="msg-bubble">🧠 <em>Coach IA répond pour ${currentData.activeChild}...</em></div></div>`;
  box.scrollTop = box.scrollHeight;
  const sysMsg = { role: 'system', content: `Tu es le coach scolaire bienveillant de LudoKids Bénin. L'élève est ${currentData.activeChild}, en classe ${currentData.activeClass} (programme béninois). Adapte tes explications à ce niveau. Sois clair, encourageant et pédagogue.` };
  if (!tutorChatHistory.length) tutorChatHistory.push(sysMsg); else tutorChatHistory[0] = sysMsg;
  tutorChatHistory.push({ role: 'user', content: query });
  const reply = await fetchOpenRouterAPI(tutorChatHistory);
  tutorChatHistory.push({ role: 'assistant', content: reply });
  const ld = document.getElementById('loading-msg'); if (ld) ld.remove();
  playSound('correct');
  box.innerHTML += `<div class="message ai-msg"><div class="msg-bubble">${reply.replace(/\n/g,'<br>')}</div></div>`;
  box.scrollTop = box.scrollHeight;
}

function startFootballGame() {
  playSound('click');
  document.getElementById('game-arena').classList.remove('hidden');
  document.getElementById('game-content').innerHTML = `
    <div class="sports-arena-box">
      <h3>⚽ Tir au But (${currentData.activeChild})</h3>
      <p>Clique sur le ballon pour tirer !</p>
      <div class="field-container">
        <div class="soccer-goal"></div>
        <div class="goalkeeper" id="goalkeeper" style="left:calc(50% - 20px)">🧤</div>
        <div class="soccer-ball" id="soccer-ball" onclick="shootSoccerBall()">⚽</div>
      </div>
      <div id="football-result" style="font-size:1.5rem;font-weight:800;color:#fbbf24"></div>
    </div>`;
}

function shootSoccerBall() {
  const ball = document.getElementById('soccer-ball');
  const keeper = document.getElementById('goalkeeper');
  const result = document.getElementById('football-result');
  const kp = Math.random() < 0.5 ? 20 : 70;
  keeper.style.left = `calc(${kp}% - 20px)`;
  const sp = Math.random() < 0.5 ? 25 : 75;
  ball.style.transform = `translateY(-170px) translateX(${sp-50}px) scale(0.6)`;
  setTimeout(() => {
    if (Math.abs(kp - sp) > 20) { playSound('goal'); triggerConfetti(); result.textContent = `⚽ GOOOAAL !! Tir Parfait de ${currentData.activeChild} ! 🎉`; }
    else { playSound('click'); result.textContent = '🧤 Arrêt du Gardien ! Réessaie !'; }
    setTimeout(() => { ball.style.transform = 'none'; }, 1200);
  }, 500);
}

function startBasketballGame() {
  playSound('click');
  document.getElementById('game-arena').classList.remove('hidden');
  document.getElementById('game-content').innerHTML = `
    <div class="sports-arena-box">
      <h3>🏀 Panier de Basket (${currentData.activeChild})</h3>
      <p>Clique sur le ballon pour marquer !</p>
      <div class="field-container" style="background:linear-gradient(to bottom,#7c2d12,#9a3412)">
        <div class="basket-hoop">🗑️</div>
        <div class="basketball" id="basketball" onclick="shootBasketball()">🏀</div>
      </div>
      <div id="basket-result" style="font-size:1.5rem;font-weight:800;color:#fbbf24"></div>
    </div>`;
}

function shootBasketball() {
  const ball = document.getElementById('basketball'), result = document.getElementById('basket-result');
  ball.style.transform = 'translateY(-160px) translateX(120px) scale(0.7)';
  setTimeout(() => { playSound('goal'); triggerConfetti(); result.textContent = `🏀 SWISH ! Panier Réussi de ${currentData.activeChild} ! 🌟`; setTimeout(() => { ball.style.transform = 'none'; }, 1200); }, 600);
}

function closeGameArena() { playSound('click'); document.getElementById('game-arena').classList.add('hidden'); }

function claimReward(t) { playSound('win'); triggerConfetti(); alert(`🎉 Récompense "${t}" validée ! Bravo !`); }

function addReward() {
  const ti = document.getElementById('new-reward-title'), ci = document.getElementById('new-reward-cost');
  if (!ti.value) { alert('Veuillez entrer un titre !'); return; }
  const t = ti.value, c = ci.value || 100;
  const list = document.getElementById('rewards-list');
  const card = document.createElement('div'); card.className = 'reward-card';
  card.innerHTML = `<div class="reward-details"><h4>🎁 ${t}</h4><p>Nécessite ${c} Étoiles ⭐</p></div><button class="btn btn-success btn-sm" onclick="claimReward('${t}')">Valider</button>`;
  list.appendChild(card); ti.value = ''; ci.value = ''; playSound('correct');
}

function updateUI() {
  const sa = currentData.stars['Abigaïl'] || 0, sb = currentData.stars['Bignon'] || 0, sn = currentData.stars['Nathan'] || 0;
  document.getElementById('stars-abigail').textContent = sa;
  document.getElementById('stars-bignon').textContent = sb;
  document.getElementById('stars-nathan').textContent = sn;
  document.getElementById('sessions-abigail').textContent = currentData.sessionsDone['Abigaïl'];
  document.getElementById('sessions-bignon').textContent = currentData.sessionsDone['Bignon'];
  document.getElementById('sessions-nathan').textContent = currentData.sessionsDone['Nathan'];
  document.getElementById('current-player-stars').textContent = currentData.stars[currentData.activeChild] || 0;
  document.getElementById('total-stars').textContent = sa + sb + sn;
  document.getElementById('total-quizzes-done').textContent = currentData.quizzesDone;
  const h = Math.floor(currentData.studyMinutes/60), m = currentData.studyMinutes%60;
  document.getElementById('total-study-time').textContent = `${h}h ${m}min`;
}

window.addEventListener('load', () => { selectChildProfile('Abigaïl', 'CI'); });
