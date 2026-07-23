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
  endpoint: "/api/chat",  // Vercel serverless proxy — clé API dans les env vars
  model: "google/gemini-2.5-flash"
};

// Mode Sombre / Mode Clair
function initTheme() {
  const savedTheme = localStorage.getItem('ludokids-theme') || 
    (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  setTheme(savedTheme);
}

function toggleTheme() {
  playSound('click');
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  setTheme(newTheme);
}

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('ludokids-theme', theme);
  const icon = document.querySelector('.theme-icon');
  if (icon) {
    icon.textContent = theme === 'dark' ? '🌙' : '☀️';
  }
}
let englishChatHistory = [];
let tutorChatHistory = [];

// Synthétiseur Audio
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
    osc.start(now);
    osc.stop(now + 0.35);
  } else if (type === 'win') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.3);
    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
    osc.start(now);
    osc.stop(now + 0.5);
  } else if (type === 'click') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, now);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
    osc.start(now);
    osc.stop(now + 0.05);
  }
}

// État initial de l'application
let currentData = {
  activeChild: 'Abigaïl',
  activeClass: 'CI',
  stars: {
    'Abigaïl': 0,
    'Bignon': 0,
    'Nathan': 0
  },
  sessionsDone: {
    'Abigaïl': 0,
    'Bignon': 0,
    'Nathan': 0
  },
  quizzesDone: 0,
  studyMinutes: 0,
  sportsUnlocked: false,
  studySecondsLeft: 1800,
  timerRunning: false,
  timerInterval: null
};

// Curriculums Scolaires Béninois
const curriculums = {
  'CI': [
    { id: 'maths-ci', title: 'Calculs Abigaïl (1-20)', icon: '🔢', bg: 'math-bg', desc: 'Additions simples, comptage et logique pour le CI.' },
    { id: 'reading-ci', title: 'Lecture Abigaïl & Syllabes', icon: '🔤', bg: 'quiz-bg', desc: 'Reconnaissance des lettres, voyelles et sons fondamentaux.' },
    { id: 'nature-ci', title: 'Éveil & Découverte', icon: '🌱', bg: 'sports-bg', desc: 'Découverte de la nature, du corps et du vocabulaire.' }
  ],
  '3ème': [
    { id: 'maths-3eme', title: 'Maths Bignon (Théorèmes BEPC)', icon: '📐', bg: 'math-bg', desc: 'Théorème de Pythagore, Thalès, développements et équations.' },
    { id: 'pc-3eme', title: 'Physique-Chimie (Électricité & Matière)', icon: '⚡', bg: 'quiz-bg', desc: 'Loi d’Ohm, poids, masse et réactions chimiques.' },
    { id: 'svt-3eme', title: 'SVT & Biologie', icon: '🧬', bg: 'sports-bg', desc: 'Système immunitaire, circulation sanguine et santé.' }
  ],
  '1ère D': [
    { id: 'maths-1erd', title: 'Maths Nathan (2nd Degré & Fonctions)', icon: '📊', bg: 'math-bg', desc: 'Discriminant Δ, polynômes, limites et fonctions.' },
    { id: 'pc-1erd', title: 'Physique-Chimie (Cinématique & Solutions)', icon: '🧪', bg: 'quiz-bg', desc: 'Mouvement, accélération, équations de réactions et pH.' },
    { id: 'svt-1erd', title: 'SVT (Génétique & Mitose)', icon: '🔬', bg: 'sports-bg', desc: 'ADN, mitose, méiose et hérédité biologique.' }
  ]
};

// Navigation par Onglets
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    playSound('click');
    switchTab(btn.getAttribute('data-tab'));
  });
});

function switchTab(tabId) {
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

  const activeBtn = document.querySelector(`.nav-btn[data-tab="${tabId}"]`);
  const activeContent = document.getElementById(tabId);

  if (activeBtn) {
    activeBtn.classList.add('active');
    activeBtn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }
  if (activeContent) activeContent.classList.add('active');

  if (tabId === 'home-tab') triggerConfetti();
}

function triggerConfetti() {
  playSound('win');
  if (typeof confetti === 'function') {
    confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
  }
}

// Changement dynamique de profil avec mise à jour globale
function selectChildProfile(name, grade) {
  playSound('click');
  currentData.activeChild = name;
  currentData.activeClass = grade;

  // Réinitialiser l'historique du coach scolaire au changement de profil
  tutorChatHistory = [];

  // Mettre à jour tous les boutons d'onglets de profil
  document.querySelectorAll('.chip-btn').forEach(btn => {
    btn.classList.toggle('active', btn.textContent.includes(name));
  });

  // Mettre à jour les indicateurs de profil
  const activeClassDisplay = document.getElementById('active-class-display');
  if (activeClassDisplay) {
    activeClassDisplay.textContent = `Profil : ${name} • Classe : ${grade} (${grade === 'CI' ? 'Primaire' : grade === '3ème' ? 'Collège' : 'Lycée D'})`;
  }

  const tutorCurrentClass = document.getElementById('tutor-current-class');
  if (tutorCurrentClass) {
    tutorCurrentClass.textContent = `${name} (${grade})`;
  }

  const tutorWelcomeMsg = document.getElementById('tutor-welcome-msg');
  if (tutorWelcomeMsg) {
    tutorWelcomeMsg.textContent = `Bonjour ! Je suis l'assistant scolaire d'apprentissage pour ${name} (${grade}). Quelle question ou leçon souhaitez-vous étudier ?`;
  }

  // Suggestions dynamiques selon le profil
  renderSuggestedQuestions(name, grade);

  renderSubjectsForClass();
  updateUI();
}

function renderSuggestedQuestions(name, grade) {
  const container = document.getElementById('suggested-questions-box');
  if (!container) return;

  if (grade === 'CI') {
    container.innerHTML = `
      <span>Recherches rapides pour ${name} :</span>
      <button class="btn btn-sm btn-secondary" onclick="askSuggested('Comment lire les sons MA, PA, BA en CI ?')">Lecture (Syllabes)</button>
      <button class="btn btn-sm btn-secondary" onclick="askSuggested('Additions simples faciles de 1 à 20')">Maths (Calculs)</button>
      <button class="btn btn-sm btn-secondary" onclick="askSuggested('Colors and animals in English')">Anglais (Vocabulaire)</button>
    `;
  } else if (grade === '3ème') {
    container.innerHTML = `
      <span>Recherches rapides pour ${name} :</span>
      <button class="btn btn-sm btn-secondary" onclick="askSuggested('Explique le théorème de Pythagore en 3ème')">Maths (Pythagore)</button>
      <button class="btn btn-sm btn-secondary" onclick="askSuggested('Explication de la loi d\'Ohm en Physique')">Physique (Loi d'Ohm)</button>
      <button class="btn btn-sm btn-secondary" onclick="askSuggested('Irregular verbs list in English')">Anglais (Verbes)</button>
    `;
  } else {
    // 1ère D
    container.innerHTML = `
      <span>Recherches rapides pour ${name} :</span>
      <button class="btn btn-sm btn-secondary" onclick="askSuggested('Calculer le discriminant Δ d\'un polynôme du 2nd degré')">Maths 1ère D (Discriminant)</button>
      <button class="btn btn-sm btn-secondary" onclick="askSuggested('Étapes de la mitose et de la méiose en SVT')">SVT (Génétique)</button>
      <button class="btn btn-sm btn-secondary" onclick="askSuggested('Advanced grammar and essay writing in English')">Anglais (Bac D)</button>
    `;
  }
}

function renderSubjectsForClass() {
  const container = document.getElementById('subjects-grid');
  const subjects = curriculums[currentData.activeClass] || curriculums['CI'];

  let html = subjects.map(sub => `
    <div class="game-card glass-card">
      <div class="game-icon-badge ${sub.bg}">${sub.icon}</div>
      <h3>${sub.title}</h3>
      <p>${sub.desc}</p>
      <div class="game-meta">
        <span>📚 Programme Officiel</span>
        <span>🏆 +25 étoiles</span>
      </div>
      <button class="btn btn-primary btn-block" onclick="startSubjectGame('${sub.id}')">Démarrer la Révision</button>
    </div>
  `).join('');

  if (currentData.sportsUnlocked) {
    html += `
      <div class="game-card glass-card" style="border: 2px solid var(--accent);">
        <div class="game-icon-badge sports-bg">⚽🏀</div>
        <h3>PAUSE SPORT DÉBLOQUÉE !</h3>
        <p>Bravo ${currentData.activeChild} ! Choisis ton jeu de détente : Foot Tir au but ou Basket-ball !</p>
        <div class="game-meta">
          <span>🎉 Récompense d'Étude</span>
          <span>🏆 Pause Sport</span>
        </div>
        <button class="btn btn-success btn-block" onclick="startFootballGame()">⚽ Tir au But (Foot)</button>
        <button class="btn btn-primary btn-block" style="margin-top: 0.4rem;" onclick="startBasketballGame()">🏀 Panier de Basket</button>
      </div>
    `;
  } else {
    html += `
      <div class="game-card glass-card" style="opacity: 0.7;">
        <div class="game-icon-badge sports-bg">🔒</div>
        <h3>Pause Sport (${currentData.activeChild})</h3>
        <p>Accomplis une révision ou étudie 30 min pour débloquer le jeu de Foot ⚽ et Basket 🏀 !</p>
        <div class="game-meta">
          <span>⏱ Requis : Travail scolaire</span>
        </div>
      </div>
    `;
  }

  container.innerHTML = html;
}

function toggleStudySession() {
  const btn = document.getElementById('start-study-btn');
  if (currentData.timerRunning) {
    clearInterval(currentData.timerInterval);
    currentData.timerRunning = false;
    btn.textContent = '▶ Démarrer l\'Étude';
    btn.className = 'btn btn-success';
  } else {
    currentData.timerRunning = true;
    btn.textContent = '⏸ Pause';
    btn.className = 'btn btn-secondary';

    currentData.timerInterval = setInterval(() => {
      if (currentData.studySecondsLeft > 0) {
        currentData.studySecondsLeft--;
        updateTimerDisplay();
      } else {
        clearInterval(currentData.timerInterval);
        currentData.sportsUnlocked = true;
        currentData.sessionsDone[currentData.activeChild] += 1;
        currentData.studyMinutes += 30;
        renderSubjectsForClass();
        updateUI();
        triggerConfetti();
        alert(`🎉 Bravo ${currentData.activeChild} ! Session d'étude terminée ! La Pause Sport (Foot ⚽ / Basket 🏀) est débloquée !`);
      }
    }, 1000);
  }
}

function updateTimerDisplay() {
  const mins = Math.floor(currentData.studySecondsLeft / 60);
  const secs = currentData.studySecondsLeft % 60;
  document.getElementById('study-timer').textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function startSubjectGame(subId) {
  playSound('click');
  const arena = document.getElementById('game-arena');
  arena.classList.remove('hidden');

  let questionText = "";
  let options = [];
  let correctIdx = 0;

  if (currentData.activeClass === 'CI') {
    questionText = "Pour Abigaïl : Combien font 5 + 3 ?";
    options = ["7", "8", "9", "10"];
    correctIdx = 1;
  } else if (currentData.activeClass === '3ème') {
    questionText = "Pour Bignon : Dans un triangle rectangle de côtés 3 cm et 4 cm, quelle est l'hypoténuse ?";
    options = ["5 cm", "6 cm", "7 cm", "8 cm"];
    correctIdx = 0;
  } else {
    questionText = "Pour Nathan : Pour l'équation 2x² - 4x + 2 = 0, quelle est la valeur du discriminant Δ ?";
    options = ["Δ = 0", "Δ = 16", "Δ = 4", "Δ = -8"];
    correctIdx = 0;
  }

  document.getElementById('game-content').innerHTML = `
    <div class="math-quiz-box">
      <h3>📚 Révision ${currentData.activeClass} (${currentData.activeChild})</h3>
      <div class="math-question" style="font-size: 1.4rem;">${questionText}</div>
      <div class="math-options-grid">
        ${options.map((opt, idx) => `
          <button class="option-btn" style="font-size: 1.1rem;" onclick="checkSubjectAnswer(${idx === correctIdx})">${opt}</button>
        `).join('')}
      </div>
    </div>
  `;
}

function checkSubjectAnswer(isCorrect) {
  if (isCorrect) {
    playSound('correct');
    triggerConfetti();
    currentData.stars[currentData.activeChild] += 25;
    currentData.quizzesDone += 1;
    currentData.studyMinutes += 15;
    currentData.sportsUnlocked = true;
    updateUI();
    renderSubjectsForClass();
    alert(`✨ Excellent travail ${currentData.activeChild} ! +25 Étoiles ⭐ gagnées et la Pause Sport est Débloquée !`);
    closeGameArena();
  } else {
    playSound('click');
    alert("❌ Ce n'est pas tout à fait ça. Revois la méthode et réessaie !");
  }
}

// Module Anglais
function startEnglishVocabGame() {
  playSound('click');
  const arena = document.getElementById('english-arena');
  arena.classList.remove('hidden');

  let questionText = "";
  let options = [];
  let correctIdx = 0;

  if (currentData.activeClass === 'CI') {
    questionText = "Pour Abigaïl : Comment dit-on 'Le Chat' en Anglais ?";
    options = ["The Cat 🐱", "The Dog 🐶", "The Bird 🐦", "The Fish 🐟"];
    correctIdx = 0;
  } else if (currentData.activeClass === '3ème') {
    questionText = "Pour Bignon : Choose the correct past tense: 'Yesterday, she ______ to school.'";
    options = ["went", "go", "gone", "going"];
    correctIdx = 0;
  } else {
    questionText = "Pour Nathan : Select the synonym of 'Significant':";
    options = ["Important", "Small", "Useless", "Random"];
    correctIdx = 0;
  }

  document.getElementById('english-content').innerHTML = `
    <div class="math-quiz-box">
      <h3>🇬🇧 Practice English (${currentData.activeChild} - ${currentData.activeClass})</h3>
      <p style="color: #34d399; font-weight: 700; margin-bottom: 1rem;">Supervisé par Maman, Professeure d'Anglais 👩‍🏫</p>
      <div class="math-question" style="font-size: 1.4rem;">${questionText}</div>
      <div class="math-options-grid">
        ${options.map((opt, idx) => `
          <button class="option-btn" style="font-size: 1.1rem;" onclick="checkEnglishAnswer(${idx === correctIdx})">${opt}</button>
        `).join('')}
      </div>
    </div>
  `;
}

function checkEnglishAnswer(isCorrect) {
  if (isCorrect) {
    playSound('correct');
    triggerConfetti();
    currentData.stars[currentData.activeChild] += 25;
    updateUI();
    alert(`🌟 Perfect ${currentData.activeChild}! Great job! +25 Stars ⭐`);
    document.getElementById('english-arena').classList.add('hidden');
  } else {
    playSound('click');
    alert("❌ Not quite. Try again!");
  }
}

function startEnglishConversation() {
  playSound('click');
  const arena = document.getElementById('english-arena');
  arena.classList.remove('hidden');

  const childName = currentData.activeChild;
  const childGrade = currentData.activeClass;

  let levelDesc = '';
  if (childGrade === 'CI') {
    levelDesc = 'a very young beginner (Cours Initiatoire, primary school). Use extremely simple English words and sentences, like colors, animals, greetings.';
  } else if (childGrade === '3ème') {
    levelDesc = 'a middle school student preparing for the BEPC exam. Use intermediate English with correct grammar explanations.';
  } else {
    levelDesc = 'a high school student in 1ère D preparing for the Baccalauréat. Use advanced English vocabulary, idioms and essay structures.';
  }

  // Fresh history for every new conversation
  englishChatHistory = [
    {
      role: "system",
      content: `You are a warm, encouraging English conversation teacher chatting with ${childName}, who is ${levelDesc} Your role is to converse naturally in English, gently correct grammar mistakes, and keep the student engaged. If the person says they are "Mum" or the teacher, switch to a professional peer tone. Do NOT introduce yourself as an AI. Keep replies short (2-4 sentences max) and conversational.`
    }
  ];

  let greeting = '';
  if (childGrade === 'CI') {
    greeting = `Hello ${childName}! 😊 How are you today?`;
  } else if (childGrade === '3ème') {
    greeting = `Hello ${childName}! Ready to practice your English today? What would you like to talk about?`;
  } else {
    greeting = `Hello ${childName}! Let's sharpen your English skills. What's on your mind today?`;
  }

  document.getElementById('english-content').innerHTML = `
    <div class="math-quiz-box">
      <h3>🗣️ English Conversation — ${childName} (${childGrade})</h3>
      <p style="color: #34d399; font-weight: 700;">Supervised by Mum, English Teacher 👩‍🏫</p>
      <p style="color: #94a3b8; font-size: 0.9rem; margin-bottom: 1rem;">Chat freely in English. The AI will gently correct your mistakes!</p>

      <div class="chat-messages" id="english-chat-box" style="max-height: 280px; overflow-y: auto; text-align: left; background: rgba(15,23,42,0.8); padding: 1rem; border-radius: 12px; margin: 1rem 0;">
        <div class="message ai-msg">
          <div class="msg-bubble">${greeting}</div>
        </div>
      </div>
      <div style="display: flex; gap: 0.5rem;">
        <input type="text" id="english-user-input" placeholder="Type your message in English..." class="input-field" onkeypress="if(event.key==='Enter') sendEnglishChatMessage()">
        <button class="btn btn-primary" onclick="sendEnglishChatMessage()">Send 🚀</button>
      </div>
    </div>
  `;
}

async function sendEnglishChatMessage() {
  const input = document.getElementById('english-user-input');
  const query = input.value.trim();
  if (!query) return;

  playSound('click');
  const chatBox = document.getElementById('english-chat-box');
  chatBox.innerHTML += `<div class="message user-msg"><div class="msg-bubble">${query}</div></div>`;
  input.value = '';
  chatBox.scrollTop = chatBox.scrollHeight;

  chatBox.innerHTML += `<div class="message ai-msg" id="english-loading"><div class="msg-bubble">💬 <em>Replying...</em></div></div>`;
  chatBox.scrollTop = chatBox.scrollHeight;

  englishChatHistory.push({ role: "user", content: query });
  const aiReply = await fetchOpenRouterAPI(englishChatHistory);
  englishChatHistory.push({ role: "assistant", content: aiReply });

  const loading = document.getElementById('english-loading');
  if (loading) loading.remove();

  playSound('correct');
  chatBox.innerHTML += `<div class="message ai-msg"><div class="msg-bubble">${aiReply.replace(/\n/g, '<br>')}</div></div>`;
  chatBox.scrollTop = chatBox.scrollHeight;
}

// Module Entraînement Cognitif
function startCognitiveMemory() {
  playSound('click');
  const arena = document.getElementById('cognitive-arena');
  arena.classList.remove('hidden');

  const symbols = ['🧠', '🧠', '⚡', '⚡', '🎯', '🎯', '🚀', '🚀'];
  let shuffled = [...symbols].sort(() => Math.random() - 0.5);

  document.getElementById('cognitive-content').innerHTML = `
    <div class="math-quiz-box">
      <h3>🧠 Test de Mémoire Visuelle (${currentData.activeChild})</h3>
      <p style="margin-bottom: 1rem; color: #94a3b8;">Retrouve les 4 paires pour entraîner ta mémoire de travail !</p>
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.8rem; max-width: 380px; margin: 0 auto;">
        ${shuffled.map((s, i) => `
          <button class="option-btn cog-card" data-sym="${s}" onclick="flipCogCard(this, '${s}')">❓</button>
        `).join('')}
      </div>
    </div>
  `;
}

let cogFlipped = [];
let cogMatched = 0;

function flipCogCard(btn, sym) {
  if (btn.textContent !== '❓' || cogFlipped.length >= 2) return;
  playSound('click');
  btn.textContent = sym;
  cogFlipped.push(btn);

  if (cogFlipped.length === 2) {
    if (cogFlipped[0].getAttribute('data-sym') === cogFlipped[1].getAttribute('data-sym')) {
      playSound('correct');
      cogMatched++;
      cogFlipped = [];
      if (cogMatched === 4) {
        setTimeout(() => {
          playSound('win');
          triggerConfetti();
          currentData.stars[currentData.activeChild] += 30;
          updateUI();
          alert(`🎉 Bravo ${currentData.activeChild} ! Mémoire Impeccable ! +30 Étoiles ⭐ gagnées !`);
          closeCognitiveArena();
        }, 400);
      }
    } else {
      setTimeout(() => {
        cogFlipped[0].textContent = '❓';
        cogFlipped[1].textContent = '❓';
        cogFlipped = [];
      }, 700);
    }
  }
}

function startCognitiveCalculus() {
  playSound('click');
  const arena = document.getElementById('cognitive-arena');
  arena.classList.remove('hidden');

  let n1 = Math.floor(Math.random() * 15) + 5;
  let n2 = Math.floor(Math.random() * 15) + 5;
  let ans = n1 + n2;

  document.getElementById('cognitive-content').innerHTML = `
    <div class="math-quiz-box">
      <h3>⚡ Agilité Mentale (${currentData.activeChild})</h3>
      <p style="margin-bottom: 1rem; color: #94a3b8;">Réponds le plus vite possible :</p>
      <div class="math-question">${n1} + ${n2} = ?</div>
      <div style="display: flex; justify-content: center; gap: 1rem;">
        <input type="number" id="cog-ans-input" class="input-field" style="max-width: 150px; font-size: 1.5rem; text-align: center;">
        <button class="btn btn-primary" onclick="checkCogAns(${ans})">Valider 🚀</button>
      </div>
    </div>
  `;
}

function checkCogAns(target) {
  const val = parseInt(document.getElementById('cog-ans-input').value);
  if (val === target) {
    playSound('correct');
    triggerConfetti();
    currentData.stars[currentData.activeChild] += 20;
    updateUI();
    alert(`⚡ Rapidité mentale excellente ${currentData.activeChild} ! +20 Étoiles ⭐`);
    closeCognitiveArena();
  } else {
    playSound('click');
    alert("❌ Oups ! Réessaie !");
  }
}

function startCognitiveSimon() {
  playSound('click');
  alert(`🎯 Exercice d'attention sélective Simon : Mémorise la séquence de couleurs pour développer la concentration !`);
}

function closeCognitiveArena() {
  playSound('click');
  document.getElementById('cognitive-arena').classList.add('hidden');
}

// Fonction d'appel via le proxy Vercel (clé API sécurisée côté serveur)
async function fetchOpenRouterAPI(messagesArray) {
  try {
    const response = await fetch(OPENROUTER_CONFIG.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: OPENROUTER_CONFIG.model,
        messages: messagesArray
      })
    });

    const data = await response.json();
    if (data && data.choices && data.choices[0] && data.choices[0].message) {
      return data.choices[0].message.content;
    }
    console.warn("Proxy API response unexpected:", JSON.stringify(data));
    if (data && data.error) {
      return `⚠️ Erreur API : ${data.error.message || 'Vérife la configuration Vercel.'}`;
    }
  } catch (err) {
    console.log("Exception réseau API:", err);
    return "⚠️ Connexion impossible. Vérifie ta connexion internet et réessaie.";
  }

  return "⚠️ Réponse inattendue de l'IA. Réessaie dans quelques secondes.";
}

function handleChatKeyPress(e) {
  if (e.key === 'Enter') sendAIQuestion();
}

function askSuggested(text) {
  document.getElementById('ai-question-input').value = text;
  sendAIQuestion();
}

async function sendAIQuestion() {
  const input = document.getElementById('ai-question-input');
  const query = input.value.trim();
  if (!query) return;

  playSound('click');
  const messagesBox = document.getElementById('chat-messages');

  messagesBox.innerHTML += `
    <div class="message user-msg">
      <div class="msg-bubble">${query}</div>
    </div>
  `;

  input.value = '';
  messagesBox.scrollTop = messagesBox.scrollHeight;

  messagesBox.innerHTML += `
    <div class="message ai-msg" id="loading-msg">
      <div class="msg-bubble">🤖 <em>Recherche OpenRouter AI pour ${currentData.activeChild} (${currentData.activeClass})...</em></div>
    </div>
  `;
  messagesBox.scrollTop = messagesBox.scrollHeight;

  // Always rebuild system message with the current active child/class
  const sysMsg = {
    role: "system",
    content: `Tu es le coach scolaire bienveillant de LudoKids Bénin. L'élève qui te pose la question est ${currentData.activeChild}, en classe de ${currentData.activeClass} (programme scolaire béninois). Adapte le niveau de tes explications à cette classe. Sois clair, encourageant et pédagogue. Tu peux aussi aider la maman, professeure d'anglais, si elle pose une question pédagogique.`
  };
  if (tutorChatHistory.length === 0) {
    tutorChatHistory.push(sysMsg);
  } else {
    // Update system message if profile changed
    tutorChatHistory[0] = sysMsg;
  }

  tutorChatHistory.push({ role: "user", content: query });
  const aiReply = await fetchOpenRouterAPI(tutorChatHistory);
  tutorChatHistory.push({ role: "assistant", content: aiReply });

  const loadingElem = document.getElementById('loading-msg');
  if (loadingElem) loadingElem.remove();

  playSound('correct');
  messagesBox.innerHTML += `
    <div class="message ai-msg">
      <div class="msg-bubble">${aiReply.replace(/\n/g, '<br>')}</div>
    </div>
  `;
  messagesBox.scrollTop = messagesBox.scrollHeight;
}

// Sports Games
function startFootballGame() {
  playSound('click');
  const arena = document.getElementById('game-arena');
  arena.classList.remove('hidden');

  document.getElementById('game-content').innerHTML = `
    <div class="sports-arena-box">
      <h3>⚽ Tir au But de Football (${currentData.activeChild})</h3>
      <p>Clique sur le ballon pour tirer au but et battre le gardien !</p>
      
      <div class="field-container">
        <div class="soccer-goal"></div>
        <div class="goalkeeper" id="goalkeeper" style="left: calc(50% - 20px);">🧤</div>
        <div class="soccer-ball" id="soccer-ball" onclick="shootSoccerBall()">⚽</div>
      </div>
      <div id="football-result" style="font-size: 1.5rem; font-weight: 800; color: #fbbf24;"></div>
    </div>
  `;
}

function shootSoccerBall() {
  const ball = document.getElementById('soccer-ball');
  const keeper = document.getElementById('goalkeeper');
  const result = document.getElementById('football-result');

  const randomKeeperPos = Math.random() < 0.5 ? 20 : 70;
  keeper.style.left = `calc(${randomKeeperPos}% - 20px)`;

  const kickPos = Math.random() < 0.5 ? 25 : 75;
  ball.style.transform = `translateY(-170px) translateX(${kickPos - 50}px) scale(0.6)`;

  setTimeout(() => {
    if (Math.abs(randomKeeperPos - kickPos) > 20) {
      playSound('goal');
      triggerConfetti();
      result.textContent = `⚽ GOOOAAL !! Tir Parfait de ${currentData.activeChild} ! 🎉`;
    } else {
      playSound('click');
      result.textContent = "🧤 Arrêt du Gardien ! Réessaie !";
    }

    setTimeout(() => {
      ball.style.transform = 'none';
    }, 1200);
  }, 500);
}

function startBasketballGame() {
  playSound('click');
  const arena = document.getElementById('game-arena');
  arena.classList.remove('hidden');

  document.getElementById('game-content').innerHTML = `
    <div class="sports-arena-box">
      <h3>🏀 Panier de Basket-ball (${currentData.activeChild})</h3>
      <p>Ajuste ton tir et clique sur le ballon pour marquer un panier !</p>
      
      <div class="field-container" style="background: linear-gradient(to bottom, #7c2d12, #9a3412);">
        <div class="basket-hoop">🗑️</div>
        <div class="basketball" id="basketball" onclick="shootBasketball()">🏀</div>
      </div>
      <div id="basket-result" style="font-size: 1.5rem; font-weight: 800; color: #fbbf24;"></div>
    </div>
  `;
}

function shootBasketball() {
  const ball = document.getElementById('basketball');
  const result = document.getElementById('basket-result');

  ball.style.transform = 'translateY(-160px) translateX(120px) scale(0.7)';

  setTimeout(() => {
    playSound('goal');
    triggerConfetti();
    result.textContent = `🏀 SWISH ! Panier Réussi de ${currentData.activeChild} ! 🌟`;
    setTimeout(() => {
      ball.style.transform = 'none';
    }, 1200);
  }, 600);
}

function closeGameArena() {
  playSound('click');
  document.getElementById('game-arena').classList.add('hidden');
}

// Gestion des Récompenses Maman
function claimReward(rewardTitle) {
  playSound('win');
  triggerConfetti();
  alert(`🎉 Récompense "${rewardTitle}" validée par Maman ! Bravo pour les efforts accomplis !`);
}

function addReward() {
  const titleInput = document.getElementById('new-reward-title');
  const costInput = document.getElementById('new-reward-cost');

  if (!titleInput.value) {
    alert("Veuillez entrer un titre de récompense !");
    return;
  }

  const title = titleInput.value;
  const cost = costInput.value || 100;

  const rewardsList = document.getElementById('rewards-list');
  const newCard = document.createElement('div');
  newCard.className = 'reward-card';
  newCard.innerHTML = `
    <div class="reward-details">
      <h4>🎁 ${title}</h4>
      <p>Nécessite ${cost} Étoiles ⭐</p>
    </div>
    <button class="btn btn-success btn-sm" onclick="claimReward('${title}')">Valider la Récompense</button>
  `;
  rewardsList.appendChild(newCard);

  titleInput.value = '';
  costInput.value = '';
  playSound('correct');
}

function updateUI() {
  const starsAbigail = currentData.stars['Abigaïl'] || 0;
  const starsBignon = currentData.stars['Bignon'] || 0;
  const starsNathan = currentData.stars['Nathan'] || 0;

  document.getElementById('stars-abigail').textContent = starsAbigail;
  document.getElementById('stars-bignon').textContent = starsBignon;
  document.getElementById('stars-nathan').textContent = starsNathan;

  document.getElementById('sessions-abigail').textContent = currentData.sessionsDone['Abigaïl'];
  document.getElementById('sessions-bignon').textContent = currentData.sessionsDone['Bignon'];
  document.getElementById('sessions-nathan').textContent = currentData.sessionsDone['Nathan'];

  const currentStars = currentData.stars[currentData.activeChild] || 0;
  document.getElementById('current-player-stars').textContent = currentStars;

  const totalStarsCount = starsAbigail + starsBignon + starsNathan;
  document.getElementById('total-stars').textContent = totalStarsCount;

  document.getElementById('total-quizzes-done').textContent = currentData.quizzesDone;

  const hours = Math.floor(currentData.studyMinutes / 60);
  const mins = currentData.studyMinutes % 60;
  document.getElementById('total-study-time').textContent = `${hours}h ${mins}min`;
}

window.addEventListener('load', () => {
  initTheme();
  selectChildProfile('Abigaïl', 'CI');
});
