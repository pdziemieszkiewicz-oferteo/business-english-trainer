(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const els = {
    lessonFile: $('lessonFile'), lessonName: $('lessonName'), lessonMeta: $('lessonMeta'),
    counter: $('counter'), phaseLabel: $('phaseLabel'), progressBar: $('progressBar'),
    sentenceText: $('sentenceText'), timer: $('timer'), timerHint: $('timerHint'),
    prevBtn: $('prevBtn'), playBtn: $('playBtn'), repeatBtn: $('repeatBtn'), nextBtn: $('nextBtn'),
    easyBtn: $('easyBtn'), hardBtn: $('hardBtn'),
    voiceSelect: $('voiceSelect'), testVoiceBtn: $('testVoiceBtn'), voiceInfo: $('voiceInfo'),
    speechRate: $('speechRate'), speechRateValue: $('speechRateValue'),
    repetitionCount: $('repetitionCount'), pauseSeconds: $('pauseSeconds'), beepEnabled: $('beepEnabled'),
    shuffleEnabled: $('shuffleEnabled'), hardOnly: $('hardOnly'), wakeLockEnabled: $('wakeLockEnabled'),
    exportProgressBtn: $('exportProgressBtn'), progressFile: $('progressFile'), resetProgressBtn: $('resetProgressBtn'),
    stats: $('stats'), installBtn: $('installBtn')
  };

  const STORE_KEY = 'ceoEnglishRideTrainerV2';
  let state = loadState();
  let lesson = null;
  let queue = [];
  let queuePos = 0;
  let running = false;
  let paused = false;
  let currentAbort = 0;
  let countdownTimer = null;
  let wakeLock = null;
  let deferredInstallPrompt = null;
  let audioCtx = null;
  let voices = [];

  function defaultState() {
    return {
      settings: { repetitions: 2, pauseSeconds: 7, beep: true, shuffle: false, hardOnly: false, wakeLock: true, speechRate: 0.9, voiceURI: '' },
      lessons: {},
      lastLessonId: null,
      lessonTexts: {}
    };
  }

  function loadState() {
    try { return { ...defaultState(), ...JSON.parse(localStorage.getItem(STORE_KEY) || '{}') }; }
    catch { return defaultState(); }
  }
  function saveState() { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }

  function normalizeText(text) { return text.trim().replace(/\s+/g, ' ').toLowerCase(); }
  function hashText(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return ('00000000' + (h >>> 0).toString(16)).slice(-8);
  }
  function sentenceId(text) { return `s-${hashText(normalizeText(text))}`; }
  function lessonIdFromFilename(name) { return (name || 'lesson').replace(/\.txt$/i, '').trim() || 'lesson'; }

  function parseLesson(text, filename) {
    const sentences = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean).map((text, i) => ({ id: sentenceId(text), index: i + 1, text }));
    return { id: lessonIdFromFilename(filename), filename, sentences, importedAt: new Date().toISOString() };
  }

  function emptySentenceProgress(sentence) {
    return { id: sentence.id, text: sentence.text, played: 0, easy: 0, hard: 0, score: null, lastPracticedAt: null, lastRating: null };
  }

  function reconcileProgress(currentLesson) {
    const old = state.lessons[currentLesson.id] || { lessonId: currentLesson.id, sessions: 0, totalPlays: 0, createdAt: new Date().toISOString(), sentences: {} };
    const nextSentences = {};
    for (const s of currentLesson.sentences) {
      nextSentences[s.id] = old.sentences?.[s.id] ? { ...old.sentences[s.id], text: s.text } : emptySentenceProgress(s);
    }
    state.lessons[currentLesson.id] = { ...old, lessonId: currentLesson.id, inputFile: currentLesson.filename, sentenceCount: currentLesson.sentences.length, sentences: nextSentences, updatedAt: new Date().toISOString() };
    state.lastLessonId = currentLesson.id;
    state.lessonTexts[currentLesson.id] = { filename: currentLesson.filename, text: currentLesson.sentences.map(s => s.text).join('\n') };
    saveState();
  }

  function getProgress() { return lesson ? state.lessons[lesson.id] : null; }
  function isHard(s) {
    const p = getProgress()?.sentences?.[s.id];
    return p ? (p.hard > p.easy || p.lastRating === 'hard') : false;
  }

  function buildQueue() {
    if (!lesson) { queue = []; queuePos = 0; return; }
    queue = lesson.sentences.filter(s => !state.settings.hardOnly || isHard(s));
    if (state.settings.shuffle) {
      for (let i = queue.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [queue[i], queue[j]] = [queue[j], queue[i]]; }
    }
    queuePos = Math.min(queuePos, Math.max(0, queue.length - 1));
    updateUI();
  }

  function currentSentence() { return queue[queuePos] || null; }

  function updateUI() {
    if (!lesson) {
      els.lessonName.textContent = 'No lesson loaded'; els.lessonMeta.textContent = '';
      els.counter.textContent = '—'; els.progressBar.style.width = '0%'; els.stats.innerHTML = '';
      return;
    }
    els.lessonName.textContent = lesson.id;
    els.lessonMeta.textContent = `${lesson.sentences.length} sentences`;
    const s = currentSentence();
    if (s) {
      els.counter.textContent = `${queuePos + 1} / ${queue.length}`;
      els.sentenceText.textContent = s.text;
      els.progressBar.style.width = `${((queuePos + 1) / Math.max(1, queue.length)) * 100}%`;
    } else {
      els.counter.textContent = `0 / 0`; els.sentenceText.textContent = state.settings.hardOnly ? 'No sentences are currently marked difficult.' : 'No sentences in lesson.';
      els.progressBar.style.width = '0%';
    }
    updateStats();
  }

  function updateStats() {
    const p = getProgress(); if (!p) return;
    const items = Object.values(p.sentences || {});
    const played = items.reduce((a, x) => a + (x.played || 0), 0);
    const hard = items.filter(x => (x.hard || 0) > (x.easy || 0) || x.lastRating === 'hard').length;
    const practiced = items.filter(x => x.played > 0).length;
    els.stats.innerHTML = `
      <div class="stat"><strong>${practiced}/${items.length}</strong><span>practised sentences</span></div>
      <div class="stat"><strong>${played}</strong><span>total plays</span></div>
      <div class="stat"><strong>${hard}</strong><span>currently difficult</span></div>
      <div class="stat"><strong>${p.sessions || 0}</strong><span>sessions started</span></div>`;
  }

  function setPhase(label, hint = '') { els.phaseLabel.textContent = label; els.timerHint.textContent = hint; }
  function setPlayIcon() { els.playBtn.textContent = running && !paused ? '⏸' : '▶'; }

  function loadVoices() {
    voices = window.speechSynthesis?.getVoices?.() || [];
    const english = voices.filter(v => /^en(-|_)/i.test(v.lang));
    const list = english.length ? english : voices;
    const previous = state.settings.voiceURI;
    els.voiceSelect.innerHTML = '';
    for (const v of list) {
      const option = document.createElement('option');
      option.value = v.voiceURI;
      option.textContent = `${v.name} — ${v.lang}${v.localService ? ' (local)' : ''}`;
      els.voiceSelect.appendChild(option);
    }
    if (previous && list.some(v => v.voiceURI === previous)) els.voiceSelect.value = previous;
    else {
      const us = list.find(v => /^en-US$/i.test(v.lang) && v.localService) || list.find(v => /^en-US$/i.test(v.lang)) || list[0];
      if (us) { els.voiceSelect.value = us.voiceURI; state.settings.voiceURI = us.voiceURI; saveState(); }
    }
    showVoiceInfo();
  }

  function selectedVoice() { return voices.find(v => v.voiceURI === els.voiceSelect.value) || null; }
  function showVoiceInfo() {
    const v = selectedVoice();
    if (!v) els.voiceInfo.textContent = 'No English voice exposed by this browser.';
    else els.voiceInfo.textContent = `${v.lang} · ${v.localService ? 'installed/local' : 'network voice'}`;
  }

  function speak(text) {
    return new Promise((resolve, reject) => {
      if (!('speechSynthesis' in window)) { reject(new Error('Speech synthesis is not supported by this browser.')); return; }
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const v = selectedVoice(); if (v) u.voice = v;
      u.lang = v?.lang || 'en-US';
      u.rate = Number(state.settings.speechRate || 0.9);
      u.pitch = 1;
      u.onend = () => resolve();
      u.onerror = (e) => reject(e.error || e);
      window.speechSynthesis.speak(u);
    });
  }

  function sleep(ms, token) {
    return new Promise(resolve => {
      let remaining = ms;
      let lastTick = Date.now();
      function tick() {
        if (token !== currentAbort || !running) return resolve('aborted');
        const now = Date.now();
        if (!paused) remaining -= (now - lastTick);
        lastTick = now;
        const left = Math.max(0, remaining);
        els.timer.textContent = Math.ceil(left / 1000);
        if (left <= 0) { els.timer.textContent = '—'; resolve('done'); }
        else countdownTimer = setTimeout(tick, 180);
      }
      tick();
    });
  }

  function beep() {
    if (!state.settings.beep) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.frequency.value = 880; g.gain.value = 0.055; o.connect(g); g.connect(audioCtx.destination);
      o.start(); o.stop(audioCtx.currentTime + 0.11);
    } catch {}
  }

  function markPlayed(s) {
    const p = getProgress(); if (!p || !s) return;
    const sp = p.sentences[s.id]; sp.played = (sp.played || 0) + 1; sp.lastPracticedAt = new Date().toISOString();
    p.totalPlays = (p.totalPlays || 0) + 1; p.lastPracticedAt = new Date().toISOString(); saveState(); updateStats();
  }

  async function runCurrentSentence() {
    const s = currentSentence(); if (!s) { stopTraining('No sentences to practise'); return; }
    const token = ++currentAbort;
    setPhase('Listening', 'Listen carefully'); els.timer.textContent = '♪';
    try { await speak(s.text); } catch (err) { setPhase('TTS error', String(err)); stopTraining(); return; }
    if (token !== currentAbort || !running) return;
    markPlayed(s);
    const reps = Number(state.settings.repetitions), pause = Number(state.settings.pauseSeconds) * 1000;
    for (let rep = 1; rep <= reps; rep++) {
      setPhase(`Repeat ${rep}/${reps}`, 'Say the sentence aloud');
      const status = await sleep(pause, token); if (status === 'aborted') return;
      if (rep < reps) beep();
    }
    if (token !== currentAbort || !running) return;
    if (queuePos < queue.length - 1) { queuePos++; updateUI(); await runCurrentSentence(); }
    else { stopTraining('Lesson complete'); setPhase('Complete', 'Lesson finished'); els.timer.textContent = '✓'; }
  }

  async function startTraining() {
    if (!lesson || !queue.length) return;
    if (!running) {
      running = true; paused = false; getProgress().sessions = (getProgress().sessions || 0) + 1; saveState();
      if (state.settings.wakeLock) await requestWakeLock();
      setPlayIcon(); runCurrentSentence();
    } else if (paused) {
      paused = false; if (window.speechSynthesis.paused) window.speechSynthesis.resume(); setPhase('Resumed'); setPlayIcon();
    } else {
      paused = true; if (window.speechSynthesis.speaking) window.speechSynthesis.pause(); setPhase('Paused', 'Press Play to continue'); setPlayIcon();
    }
  }

  function stopTraining(hint = '') {
    running = false; paused = false; ++currentAbort; clearTimeout(countdownTimer); window.speechSynthesis?.cancel(); releaseWakeLock(); setPlayIcon();
    if (hint) els.timerHint.textContent = hint;
  }

  async function repeatCurrent() {
    if (!lesson) return;
    stopTraining(); running = true; paused = false;
    if (state.settings.wakeLock) await requestWakeLock();
    setPlayIcon(); runCurrentSentence();
  }
  async function nextSentence() {
    if (!queue.length) return;
    const continuePlaying = running && !paused;
    stopTraining(); queuePos = Math.min(queue.length - 1, queuePos + 1); updateUI();
    if (continuePlaying) { running = true; if (state.settings.wakeLock) await requestWakeLock(); setPlayIcon(); runCurrentSentence(); }
  }
  async function prevSentence() {
    if (!queue.length) return;
    const continuePlaying = running && !paused;
    stopTraining(); queuePos = Math.max(0, queuePos - 1); updateUI();
    if (continuePlaying) { running = true; if (state.settings.wakeLock) await requestWakeLock(); setPlayIcon(); runCurrentSentence(); }
  }

  function rateCurrent(kind) {
    const s = currentSentence(), p = getProgress(); if (!s || !p) return;
    const sp = p.sentences[s.id]; sp[kind] = (sp[kind] || 0) + 1; sp.lastRating = kind; sp.lastPracticedAt = new Date().toISOString();
    sp.score = (sp.easy + sp.hard) ? Number((sp.easy / (sp.easy + sp.hard)).toFixed(3)) : null; saveState();
    if (state.settings.hardOnly) buildQueue(); else updateStats();
  }

  async function requestWakeLock() {
    if (!('wakeLock' in navigator)) return;
    try { wakeLock = await navigator.wakeLock.request('screen'); }
    catch {}
  }
  async function releaseWakeLock() { try { await wakeLock?.release(); } catch {} wakeLock = null; }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && running && state.settings.wakeLock) requestWakeLock(); });

  function exportProgress() {
    if (!lesson) return;
    const p = getProgress();
    const payload = {
      schemaVersion: 2,
      lessonId: lesson.id,
      inputFile: lesson.filename,
      sentenceCount: lesson.sentences.length,
      exportedAt: new Date().toISOString(),
      settings: { ...state.settings },
      summary: { sessions: p.sessions || 0, totalPlays: p.totalPlays || 0, lastPracticedAt: p.lastPracticedAt || null },
      sentences: lesson.sentences.map(s => ({ index: s.index, ...p.sentences[s.id] }))
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `${lesson.id}.progress.json`);
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function importProgressFile(file) {
    const data = JSON.parse(await file.text());
    if (!data.lessonId) throw new Error('Missing lessonId in progress file.');
    const sentenceMap = {};
    for (const item of data.sentences || []) if (item.id) sentenceMap[item.id] = item;
    const existing = state.lessons[data.lessonId] || { lessonId: data.lessonId, sentences: {} };
    state.lessons[data.lessonId] = { ...existing, ...data, sentences: { ...existing.sentences, ...sentenceMap } };
    if (data.settings) state.settings = { ...state.settings, ...data.settings };
    saveState(); applySettingsToUI(); if (lesson?.id === data.lessonId) { reconcileProgress(lesson); buildQueue(); }
  }

  function resetProgress() {
    if (!lesson) return;
    if (!confirm(`Reset all progress for ${lesson.id}?`)) return;
    const old = state.lessons[lesson.id];
    state.lessons[lesson.id] = { lessonId: lesson.id, inputFile: lesson.filename, sentenceCount: lesson.sentences.length, sessions: 0, totalPlays: 0, createdAt: old?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString(), sentences: {} };
    reconcileProgress(lesson); buildQueue();
  }

  async function importLessonFile(file) { const text = await file.text(); loadLesson(parseLesson(text, file.name)); }
  function loadLesson(parsed) { stopTraining(); lesson = parsed; reconcileProgress(lesson); queuePos = 0; buildQueue(); }

  async function loadBundledOrSavedLesson() {
    if (state.lastLessonId && state.lessonTexts?.[state.lastLessonId]) {
      const saved = state.lessonTexts[state.lastLessonId]; loadLesson(parseLesson(saved.text, saved.filename || `${state.lastLessonId}.txt`)); return;
    }
    try {
      const r = await fetch('lesson1.txt', { cache: 'no-cache' });
      if (r.ok) { const text = await r.text(); loadLesson(parseLesson(text, 'lesson1.txt')); }
    } catch {}
  }

  function applySettingsToUI() {
    els.repetitionCount.value = state.settings.repetitions;
    els.pauseSeconds.value = state.settings.pauseSeconds;
    els.beepEnabled.checked = state.settings.beep;
    els.shuffleEnabled.checked = state.settings.shuffle;
    els.hardOnly.checked = state.settings.hardOnly;
    els.wakeLockEnabled.checked = state.settings.wakeLock;
    els.speechRate.value = state.settings.speechRate;
    els.speechRateValue.value = `${Number(state.settings.speechRate).toFixed(2)}×`;
    loadVoices();
  }

  function bindSetting(el, key, transform = x => x) {
    el.addEventListener('change', () => { state.settings[key] = transform(el.type === 'checkbox' ? el.checked : el.value); saveState(); if (['shuffle', 'hardOnly'].includes(key)) buildQueue(); });
  }

  els.lessonFile.addEventListener('change', async () => { const f = els.lessonFile.files?.[0]; if (f) await importLessonFile(f); els.lessonFile.value = ''; });
  els.progressFile.addEventListener('change', async () => { const f = els.progressFile.files?.[0]; if (f) { try { await importProgressFile(f); alert('Progress imported.'); } catch(e) { alert(`Could not import progress: ${e.message}`); } } els.progressFile.value = ''; });
  els.playBtn.addEventListener('click', startTraining); els.repeatBtn.addEventListener('click', repeatCurrent); els.nextBtn.addEventListener('click', nextSentence); els.prevBtn.addEventListener('click', prevSentence);
  els.easyBtn.addEventListener('click', () => rateCurrent('easy')); els.hardBtn.addEventListener('click', () => rateCurrent('hard'));
  els.exportProgressBtn.addEventListener('click', exportProgress); els.resetProgressBtn.addEventListener('click', resetProgress);
  els.testVoiceBtn.addEventListener('click', () => speak('Before we set a target, we need to establish a baseline.').catch(() => {}));
  els.voiceSelect.addEventListener('change', () => { state.settings.voiceURI = els.voiceSelect.value; saveState(); showVoiceInfo(); });
  els.speechRate.addEventListener('input', () => { state.settings.speechRate = Number(els.speechRate.value); els.speechRateValue.value = `${state.settings.speechRate.toFixed(2)}×`; saveState(); });
  bindSetting(els.repetitionCount, 'repetitions', Number); bindSetting(els.pauseSeconds, 'pauseSeconds', Number); bindSetting(els.beepEnabled, 'beep', Boolean); bindSetting(els.shuffleEnabled, 'shuffle', Boolean); bindSetting(els.hardOnly, 'hardOnly', Boolean); bindSetting(els.wakeLockEnabled, 'wakeLock', Boolean);

  if ('speechSynthesis' in window) { window.speechSynthesis.onvoiceschanged = loadVoices; setTimeout(loadVoices, 250); setTimeout(loadVoices, 1200); }

  if ('mediaSession' in navigator) {
    try {
      navigator.mediaSession.setActionHandler('play', () => { if (!running || paused) startTraining(); });
      navigator.mediaSession.setActionHandler('pause', () => { if (running && !paused) startTraining(); });
      navigator.mediaSession.setActionHandler('previoustrack', prevSentence);
      navigator.mediaSession.setActionHandler('nexttrack', nextSentence);
    } catch {}
  }

  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstallPrompt = e; els.installBtn.hidden = false; });
  els.installBtn.addEventListener('click', async () => { if (!deferredInstallPrompt) return; deferredInstallPrompt.prompt(); await deferredInstallPrompt.userChoice; deferredInstallPrompt = null; els.installBtn.hidden = true; });

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));

  applySettingsToUI(); loadBundledOrSavedLesson(); updateUI(); setPlayIcon();
})();
