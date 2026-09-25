(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const els = {
    lessonSelect: $('lessonSelect'), lessonMeta: $('lessonMeta'), lessonFile: $('lessonFile'),
    modeButtons: [...document.querySelectorAll('.mode-btn')], modeName: $('modeName'),
    counter: $('counter'), phaseLabel: $('phaseLabel'), progressBar: $('progressBar'),
    sentenceText: $('sentenceText'), translationText: $('translationText'), timer: $('timer'), timerHint: $('timerHint'),
    prevBtn: $('prevBtn'), playBtn: $('playBtn'), repeatBtn: $('repeatBtn'), nextBtn: $('nextBtn'),
    easyBtn: $('easyBtn'), hardBtn: $('hardBtn'), rideScreenBtn: $('rideScreenBtn'),
    voiceSelect: $('voiceSelect'), testVoiceBtn: $('testVoiceBtn'), voiceInfo: $('voiceInfo'),
    speechRate: $('speechRate'), speechRateValue: $('speechRateValue'),
    repetitionCount: $('repetitionCount'), pauseSeconds: $('pauseSeconds'), recallSeconds: $('recallSeconds'), businessSeconds: $('businessSeconds'), endWarningSeconds: $('endWarningSeconds'),
    beepEnabled: $('beepEnabled'), shuffleEnabled: $('shuffleEnabled'), hardOnly: $('hardOnly'), wakeLockEnabled: $('wakeLockEnabled'), mediaControlsEnabled: $('mediaControlsEnabled'),
    refreshLessonsBtn: $('refreshLessonsBtn'), syncKeyInput: $('syncKeyInput'), generateSyncKeyBtn: $('generateSyncKeyBtn'),
    saveSyncKeyBtn: $('saveSyncKeyBtn'), copySyncKeyBtn: $('copySyncKeyBtn'), syncInfo: $('syncInfo'), syncBadge: $('syncBadge'),
    exportProgressBtn: $('exportProgressBtn'), progressFile: $('progressFile'), resetProgressBtn: $('resetProgressBtn'), stats: $('stats'),
    installBtn: $('installBtn'), rideOverlay: $('rideOverlay'), rideOverlayStatus: $('rideOverlayStatus')
  };

  const STORE_KEY = 'ceoEnglishRideTrainerV6';
  const LEGACY_STORE_KEY = 'ceoEnglishRideTrainerV5';
  const APP_VERSION = '6.0';
  const MANUAL_REPLAY_BONUS_SECONDS = 2;
  const MODE_NAMES = { R: 'Repeat', A: 'Active Recall', B: 'Business Response' };

  let state = loadState();
  let serverConfig = { supabaseUrl: '', supabaseAnonKey: '' };
  let manifest = { lessons: [] };
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
  let controlAudio = null;
  let controlAudioUrl = null;
  let voices = [];
  let syncTimer = null;
  let syncBusy = false;

  function defaultState() {
    return {
      settings: {
        mode: 'R', repetitions: 2, pauseSeconds: 7, recallSeconds: 7, businessSeconds: 15, endWarningSeconds: 2,
        beep: true, shuffle: false, hardOnly: false, wakeLock: true, mediaControls: true, speechRate: 0.9, voiceURI: ''
      },
      lessons: {},
      lastLessonId: null,
      localLessons: {},
      syncKey: ''
    };
  }

  function deepMergeState(raw) {
    const d = defaultState();
    return {
      ...d,
      ...raw,
      settings: { ...d.settings, ...(raw?.settings || {}) },
      lessons: raw?.lessons || {},
      localLessons: raw?.localLessons || {}
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORE_KEY) || localStorage.getItem(LEGACY_STORE_KEY) || '{}';
      return deepMergeState(JSON.parse(raw));
    } catch { return defaultState(); }
  }
  function saveState() { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }

  function normalizeText(text) { return String(text || '').trim().replace(/\s+/g, ' '); }
  function hashText(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return ('00000000' + (h >>> 0).toString(16)).slice(-8);
  }
  function exerciseId(mode, promptEn, answerEn) {
    return `e-${hashText(`${mode}|${normalizeText(promptEn).toLowerCase()}|${normalizeText(answerEn).toLowerCase()}`)}`;
  }
  function lessonIdFromFilename(name) { return (name || 'lesson').replace(/\.txt$/i, '').trim() || 'lesson'; }

  function parseLesson(text, filename, explicitId = null, title = null) {
    const exercises = [];
    let lineNo = 0;
    for (const raw of String(text || '').split(/\r?\n/)) {
      lineNo += 1;
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const parts = line.split('|').map(x => x.trim());
      const type = (parts[0] || '').toUpperCase();
      if (type === 'R' && parts.length >= 3) {
        const [_, en, pl] = parts;
        exercises.push({ id: exerciseId('R', en, en), mode: 'R', index: exercises.length + 1, sourceLine: lineNo, promptEn: en, promptPl: pl, answerEn: en, answerPl: pl });
      } else if ((type === 'A' || type === 'B') && parts.length >= 5) {
        const [_, promptEn, promptPl, answerEn, answerPl] = parts;
        exercises.push({ id: exerciseId(type, promptEn, answerEn), mode: type, index: exercises.length + 1, sourceLine: lineNo, promptEn, promptPl, answerEn, answerPl });
      } else if (parts.length === 1 && line) {
        // Backward-compatible old lesson format: one English sentence per line.
        exercises.push({ id: exerciseId('R', line, line), mode: 'R', index: exercises.length + 1, sourceLine: lineNo, promptEn: line, promptPl: '', answerEn: line, answerPl: '' });
      }
    }
    const id = explicitId || lessonIdFromFilename(filename);
    return { id, title: title || id, filename, exercises, loadedAt: new Date().toISOString() };
  }

  function emptyExerciseProgress(ex) {
    return { id: ex.id, mode: ex.mode, played: 0, easy: 0, hard: 0, score: null, lastPracticedAt: null, lastRating: null };
  }

  function reconcileProgress(currentLesson) {
    const old = state.lessons[currentLesson.id] || {
      lessonId: currentLesson.id, sessions: 0, totalPlays: 0,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), exercises: {}
    };
    const next = {};
    for (const ex of currentLesson.exercises) next[ex.id] = old.exercises?.[ex.id] ? { ...old.exercises[ex.id], mode: ex.mode } : emptyExerciseProgress(ex);
    state.lessons[currentLesson.id] = {
      ...old, lessonId: currentLesson.id, inputFile: currentLesson.filename,
      exerciseCount: currentLesson.exercises.length, exercises: next,
      rounds: old.rounds || {},
      updatedAt: old.updatedAt || new Date().toISOString()
    };
    state.lastLessonId = currentLesson.id;
    saveState();
  }

  function touchProgress() {
    const p = getProgress();
    if (p) p.updatedAt = new Date().toISOString();
  }

  function getProgress() { return lesson ? state.lessons[lesson.id] : null; }
  function progressFor(ex) { return getProgress()?.exercises?.[ex.id] || null; }
  function isHard(ex) {
    const p = progressFor(ex);
    return p ? ((p.hard || 0) > (p.easy || 0) || p.lastRating === 'hard') : false;
  }

  function compareExercises(a, b) {
    const pa = progressFor(a) || { played: 0, lastPracticedAt: null };
    const pb = progressFor(b) || { played: 0, lastPracticedAt: null };
    if ((pa.played || 0) !== (pb.played || 0)) return (pa.played || 0) - (pb.played || 0);
    const ta = pa.lastPracticedAt ? Date.parse(pa.lastPracticedAt) : 0;
    const tb = pb.lastPracticedAt ? Date.parse(pb.lastPracticedAt) : 0;
    if (ta !== tb) return ta - tb;
    if (state.settings.shuffle) return Math.random() - 0.5;
    return a.index - b.index;
  }

  function modeExercises(mode = state.settings.mode) {
    return lesson ? lesson.exercises.filter(ex => ex.mode === mode) : [];
  }

  function deriveRoundState(mode) {
    const list = modeExercises(mode);
    const p = getProgress();
    if (!list.length || !p) return { round: 1, queueIds: [], position: 0, completedIds: [], updatedAt: new Date().toISOString() };

    // Migration from V4: infer the current round from the lowest repetition count.
    const reps = list.map(ex => p.exercises?.[ex.id]?.played || 0);
    const minReps = Math.min(...reps);
    const completed = list.filter(ex => (p.exercises?.[ex.id]?.played || 0) > minReps);
    const pending = list.filter(ex => (p.exercises?.[ex.id]?.played || 0) === minReps).sort(compareExercises);
    const completedSorted = [...completed].sort((a, b) => {
      const ta = Date.parse(p.exercises?.[a.id]?.lastPracticedAt || 0) || 0;
      const tb = Date.parse(p.exercises?.[b.id]?.lastPracticedAt || 0) || 0;
      return ta - tb || a.index - b.index;
    });
    const queueIds = [...completedSorted, ...pending].map(ex => ex.id);
    return {
      round: minReps + 1,
      queueIds,
      position: Math.min(completedSorted.length, Math.max(0, queueIds.length - 1)),
      completedIds: completedSorted.map(ex => ex.id),
      updatedAt: new Date().toISOString()
    };
  }

  function roundState(mode = state.settings.mode) {
    const p = getProgress();
    if (!p) return null;
    p.rounds = p.rounds || {};
    const currentIds = modeExercises(mode).map(ex => ex.id);
    const saved = p.rounds[mode];
    const savedIds = saved?.queueIds || [];
    const sameSet = savedIds.length === currentIds.length && savedIds.every(id => currentIds.includes(id));
    if (!saved || !sameSet) {
      p.rounds[mode] = deriveRoundState(mode);
      touchProgress();
      saveState();
      scheduleServerPush();
    }
    return p.rounds[mode];
  }

  function createNextRound(mode = state.settings.mode) {
    const p = getProgress();
    if (!p) return null;
    const old = roundState(mode) || { round: 0 };
    const list = modeExercises(mode).sort(compareExercises);
    p.rounds[mode] = {
      round: (old.round || 0) + 1,
      queueIds: list.map(ex => ex.id),
      position: 0,
      completedIds: [],
      updatedAt: new Date().toISOString()
    };
    touchProgress();
    saveState();
    scheduleServerPush();
    return p.rounds[mode];
  }

  function saveRoundPosition() {
    if (!lesson || state.settings.hardOnly) return;
    const rs = roundState();
    if (!rs) return;
    rs.position = Math.max(0, Math.min(queuePos, Math.max(0, queue.length - 1)));
    rs.updatedAt = new Date().toISOString();
    touchProgress();
    saveState();
    scheduleServerPush();
  }

  function buildQueue({ resetPosition = false } = {}) {
    if (!lesson) { queue = []; queuePos = 0; updateUI(); return; }

    if (state.settings.hardOnly) {
      queue = modeExercises().filter(isHard).sort(compareExercises);
      queuePos = resetPosition ? 0 : Math.min(queuePos, Math.max(0, queue.length - 1));
      updateUI();
      return;
    }

    const rs = roundState();
    const byId = new Map(modeExercises().map(ex => [ex.id, ex]));
    queue = (rs?.queueIds || []).map(id => byId.get(id)).filter(Boolean);
    queuePos = resetPosition ? 0 : Math.max(0, Math.min(Number(rs?.position || 0), Math.max(0, queue.length - 1)));
    if (resetPosition && rs) { rs.position = 0; rs.updatedAt = new Date().toISOString(); touchProgress(); saveState(); scheduleServerPush(); }
    updateUI();
  }

  function currentExercise() { return queue[queuePos] || null; }

  function displayExercisePart(ex, part = 'prompt') {
    if (!ex) return;
    const useAnswer = part === 'answer';
    els.sentenceText.textContent = useAnswer ? ex.answerEn : ex.promptEn;
    els.translationText.textContent = useAnswer ? ex.answerPl : ex.promptPl;
  }

  function updateUI() {
    els.modeButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.mode === state.settings.mode));
    els.modeName.textContent = MODE_NAMES[state.settings.mode] || state.settings.mode;
    if (!lesson) {
      els.lessonMeta.textContent = '';
      els.counter.textContent = '—'; els.progressBar.style.width = '0%'; els.stats.innerHTML = '';
      els.sentenceText.textContent = 'No lesson loaded.'; els.translationText.textContent = '';
      return;
    }
    const allForMode = lesson.exercises.filter(x => x.mode === state.settings.mode);
    els.lessonMeta.textContent = `${allForMode.length} exercises in ${MODE_NAMES[state.settings.mode]}`;
    const ex = currentExercise();
    if (ex) {
      const rs = roundState();
      const roundNo = rs?.round || 1;
      els.counter.textContent = `${queuePos + 1} / ${queue.length} · Round ${roundNo}`;
      els.progressBar.style.width = `${((queuePos + 1) / Math.max(1, queue.length)) * 100}%`;
      displayExercisePart(ex, 'prompt');
    } else {
      els.counter.textContent = '0 / 0';
      els.progressBar.style.width = '0%';
      els.sentenceText.textContent = state.settings.hardOnly ? 'No difficult exercises in this mode.' : 'No exercises in this mode.';
      els.translationText.textContent = '';
    }
    updateStats();
    updateMediaMetadata();
  }

  function updateStats() {
    const p = getProgress(); if (!p || !lesson) return;
    const modeExercises = lesson.exercises.filter(x => x.mode === state.settings.mode);
    const items = modeExercises.map(x => p.exercises[x.id]).filter(Boolean);
    const played = items.reduce((a, x) => a + (x.played || 0), 0);
    const hard = items.filter(x => (x.hard || 0) > (x.easy || 0) || x.lastRating === 'hard').length;
    const practiced = items.filter(x => (x.played || 0) > 0).length;
    const minReps = items.length ? Math.min(...items.map(x => x.played || 0)) : 0;
    els.stats.innerHTML = `
      <div class="stat"><strong>${practiced}/${items.length}</strong><span>practised in this mode</span></div>
      <div class="stat"><strong>${played}</strong><span>total completed practices</span></div>
      <div class="stat"><strong>${minReps}</strong><span>lowest repetition count</span></div>
      <div class="stat"><strong>${hard}</strong><span>currently difficult</span></div>`;
  }

  function setPhase(label, hint = '') {
    els.phaseLabel.textContent = label;
    els.timerHint.textContent = hint;
  }
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
    els.voiceInfo.textContent = v ? `${v.lang} · ${v.localService ? 'installed/local' : 'network voice'}` : 'No English voice exposed by this browser.';
  }

  function speak(text) {
    return new Promise((resolve, reject) => {
      if (!('speechSynthesis' in window)) return reject(new Error('Speech synthesis is not supported by this browser.'));
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const v = selectedVoice(); if (v) u.voice = v;
      u.lang = v?.lang || 'en-US';
      u.rate = Number(state.settings.speechRate || 0.9); u.pitch = 1;
      u.onend = () => resolve();
      u.onerror = e => reject(e.error || e);
      window.speechSynthesis.speak(u);
    });
  }

  function sleep(ms, token, hint = '', warningBeforeMs = 0) {
    return new Promise(resolve => {
      let remaining = ms;
      let lastTick = Date.now();
      let warningPlayed = false;
      els.timerHint.textContent = hint || '';
      function tick() {
        if (token !== currentAbort || !running) return resolve('aborted');
        const now = Date.now();
        if (!paused) remaining -= (now - lastTick);
        lastTick = now;
        const left = Math.max(0, remaining);
        els.timer.textContent = Math.ceil(left / 1000);
        if (!paused && !warningPlayed && warningBeforeMs > 0 && left > 0 && left <= warningBeforeMs) {
          warningPlayed = true;
          warningBeep();
        }
        if (left <= 0) { els.timer.textContent = '—'; resolve('done'); }
        else countdownTimer = setTimeout(tick, 120);
      }
      tick();
    });
  }

  function warningBeep() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.frequency.value = 620; g.gain.value = 0.018; o.connect(g); g.connect(audioCtx.destination);
      o.start(); o.stop(audioCtx.currentTime + 0.075);
    } catch {}
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

  function markPlayed(ex) {
    const p = getProgress(); if (!p || !ex) return;
    const ep = p.exercises[ex.id];
    ep.played = (ep.played || 0) + 1;
    ep.lastPracticedAt = new Date().toISOString();
    p.totalPlays = (p.totalPlays || 0) + 1;
    p.lastPracticedAt = new Date().toISOString();

    if (!state.settings.hardOnly) {
      const rs = roundState(ex.mode);
      if (rs && !rs.completedIds.includes(ex.id)) rs.completedIds.push(ex.id);
      if (rs) rs.updatedAt = new Date().toISOString();
    }

    touchProgress(); saveState(); updateStats(); scheduleServerPush();
  }

  async function waitPausedIfNeeded(token) {
    while (paused && running && token === currentAbort) await new Promise(r => setTimeout(r, 120));
    return token === currentAbort && running;
  }

  async function speakSafely(text, token) {
    if (!(await waitPausedIfNeeded(token))) return false;
    try { await speak(text); } catch {}
    return token === currentAbort && running;
  }

  async function repetitionWindows(token, bonus) {
    const reps = Number(state.settings.repetitions || 2);
    const seconds = Number(state.settings.pauseSeconds || 7) + bonus;
    for (let i = 1; i <= reps; i++) {
      setPhase(`Repeat ${i}/${reps}`, 'Repeat the English answer aloud');
      const warningSeconds = i === reps ? Number(state.settings.endWarningSeconds || 0) : 0;
      const warningMs = Math.max(0, Math.min(warningSeconds * 1000, Math.max(0, seconds * 1000 - 500)));
      const result = await sleep(seconds * 1000, token, 'Repeat the English answer aloud', warningMs);
      if (result === 'aborted') return false;
      if (i < reps) beep();
    }
    return true;
  }

  async function runCurrentExercise(options = {}) {
    const ex = currentExercise();
    if (!ex) { stopTraining('No exercise available.'); return; }
    const token = ++currentAbort;
    const bonus = Number(options.pauseBonusSeconds || 0);
    els.timer.textContent = '—';

    if (ex.mode === 'R') {
      displayExercisePart(ex, 'answer');
      setPhase('Listen', 'Listen to the model sentence');
      if (!(await speakSafely(ex.answerEn, token))) return;
      beep();
      if (!(await repetitionWindows(token, bonus))) return;
    } else if (ex.mode === 'A') {
      displayExercisePart(ex, 'prompt');
      setPhase('Cue', 'Listen to the cue');
      if (!(await speakSafely(ex.promptEn, token))) return;
      beep();
      setPhase('Recall', 'Say the target sentence from memory');
      if ((await sleep((Number(state.settings.recallSeconds || 7) + bonus) * 1000, token, 'Say the target sentence from memory')) === 'aborted') return;
      displayExercisePart(ex, 'answer');
      setPhase('Model answer', 'Listen and compare');
      if (!(await speakSafely(ex.answerEn, token))) return;
      beep();
      if (!(await repetitionWindows(token, bonus))) return;
    } else {
      displayExercisePart(ex, 'prompt');
      setPhase('Business question', 'Listen, then answer freely');
      if (!(await speakSafely(ex.promptEn, token))) return;
      beep();
      setPhase('Your answer', 'Answer in your own words');
      if ((await sleep((Number(state.settings.businessSeconds || 15) + bonus) * 1000, token, 'Answer in your own words')) === 'aborted') return;
      displayExercisePart(ex, 'answer');
      setPhase('Model answer', 'Listen to one strong answer');
      if (!(await speakSafely(ex.answerEn, token))) return;
      beep();
      if (!(await repetitionWindows(token, bonus))) return;
    }

    if (token !== currentAbort || !running) return;
    markPlayed(ex);
    advanceAfterCompletion();
  }

  function advanceAfterCompletion() {
    if (!queue.length) return;

    if (state.settings.hardOnly) {
      queuePos = queuePos < queue.length - 1 ? queuePos + 1 : 0;
      updateUI();
      setTimeout(() => { if (running && !paused) runCurrentExercise(); }, 280);
      return;
    }

    const rs = roundState();
    if (!rs) return;
    const completed = new Set(rs.completedIds || []);

    if (completed.size >= queue.length) {
      createNextRound();
      buildQueue({ resetPosition: false });
    } else {
      let next = queuePos;
      for (let step = 1; step <= queue.length; step++) {
        const candidate = (queuePos + step) % queue.length;
        if (!completed.has(queue[candidate].id)) { next = candidate; break; }
      }
      queuePos = next;
      saveRoundPosition();
      updateUI();
    }

    setTimeout(() => { if (running && !paused) runCurrentExercise(); }, 280);
  }

  function makeSilentWavUrl(seconds = 8, sampleRate = 8000) {
    const samples = Math.max(1, Math.floor(seconds * sampleRate));
    const bytes = 44 + samples * 2;
    const buffer = new ArrayBuffer(bytes);
    const view = new DataView(buffer);
    const write = (offset, text) => { for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i)); };
    write(0, 'RIFF'); view.setUint32(4, 36 + samples * 2, true); write(8, 'WAVE');
    write(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    write(36, 'data'); view.setUint32(40, samples * 2, true);
    return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
  }

  function ensureControlAudio() {
    if (controlAudio) return controlAudio;
    controlAudioUrl = makeSilentWavUrl(8);
    controlAudio = new Audio(controlAudioUrl);
    controlAudio.loop = true;
    controlAudio.preload = 'auto';
    controlAudio.volume = 0.01;
    return controlAudio;
  }

  async function startMediaCarrier() {
    if (!state.settings.mediaControls) return;
    const a = ensureControlAudio();
    try { await a.play(); } catch {}
    updateMediaMetadata();
    try { if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'; } catch {}
  }

  function pauseMediaCarrier() {
    try { controlAudio?.pause(); } catch {}
    try { if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'; } catch {}
  }

  function stopMediaCarrier() {
    try { if (controlAudio) { controlAudio.pause(); controlAudio.currentTime = 0; } } catch {}
    try { if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none'; } catch {}
  }

  function updateMediaMetadata() {
    if (!('mediaSession' in navigator) || !lesson) return;
    try {
      const rs = state.settings.hardOnly ? null : roundState();
      navigator.mediaSession.metadata = new MediaMetadata({
        title: `${lesson.title || lesson.id} · ${MODE_NAMES[state.settings.mode] || state.settings.mode}`,
        artist: 'CEO English Ride Trainer v6.2',
        album: state.settings.hardOnly ? `${queuePos + 1}/${queue.length} · Difficult only` : `${queuePos + 1}/${queue.length} · Round ${rs?.round || 1}`
      });
    } catch {}
  }

  async function startTraining() {
    if (!lesson || !queue.length) return;
    if (!running) {
      running = true; paused = false;
      startMediaCarrier();
      const p = getProgress(); p.sessions = (p.sessions || 0) + 1; touchProgress(); saveState(); scheduleServerPush();
      if (state.settings.wakeLock) await requestWakeLock();
      setPlayIcon(); runCurrentExercise();
    } else if (paused) {
      paused = false; startMediaCarrier(); if (window.speechSynthesis?.paused) window.speechSynthesis.resume(); setPhase('Resumed'); setPlayIcon();
    } else {
      paused = true; pauseMediaCarrier(); if (window.speechSynthesis?.speaking) window.speechSynthesis.pause(); setPhase('Paused', 'Press Play to continue'); setPlayIcon();
    }
  }

  function stopTraining(hint = '') {
    running = false; paused = false; ++currentAbort; clearTimeout(countdownTimer); window.speechSynthesis?.cancel(); stopMediaCarrier(); releaseWakeLock(); setPlayIcon();
    els.timerHint.textContent = hint || '';
  }

  async function startManualPlaybackAtCurrent() {
    stopTraining(); running = true; paused = false; startMediaCarrier();
    if (state.settings.wakeLock) await requestWakeLock();
    setPlayIcon(); runCurrentExercise({ pauseBonusSeconds: MANUAL_REPLAY_BONUS_SECONDS });
  }
  async function repeatCurrent() { if (lesson && queue.length) await startManualPlaybackAtCurrent(); }
  async function nextExercise() {
    if (!queue.length) return;
    stopTraining();
    queuePos = Math.min(queue.length - 1, queuePos + 1);
    saveRoundPosition();
    updateUI();
    running = true; paused = false; startMediaCarrier(); if (state.settings.wakeLock) await requestWakeLock(); setPlayIcon(); runCurrentExercise({ pauseBonusSeconds: MANUAL_REPLAY_BONUS_SECONDS });
  }
  async function prevExercise() {
    if (!queue.length) return;
    stopTraining();
    queuePos = Math.max(0, queuePos - 1);
    saveRoundPosition();
    updateUI();
    running = true; paused = false; startMediaCarrier(); if (state.settings.wakeLock) await requestWakeLock(); setPlayIcon(); runCurrentExercise({ pauseBonusSeconds: MANUAL_REPLAY_BONUS_SECONDS });
  }

  function rateCurrent(kind) {
    const ex = currentExercise(), p = getProgress(); if (!ex || !p) return;
    const ep = p.exercises[ex.id]; ep[kind] = (ep[kind] || 0) + 1; ep.lastRating = kind; ep.lastPracticedAt = new Date().toISOString();
    ep.score = (ep.easy + ep.hard) ? Number((ep.easy / (ep.easy + ep.hard)).toFixed(3)) : null;
    touchProgress(); saveState(); scheduleServerPush();
    if (state.settings.hardOnly) buildQueue({ resetPosition: true }); else updateStats();
  }

  async function requestWakeLock() {
    if (!('wakeLock' in navigator)) return;
    try { wakeLock = await navigator.wakeLock.request('screen'); } catch {}
  }
  async function releaseWakeLock() { try { await wakeLock?.release(); } catch {} wakeLock = null; }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && running && state.settings.wakeLock) requestWakeLock(); });

  async function enterRideScreen() {
    if (!els.rideOverlay) return;
    els.rideOverlay.hidden = false;
    els.rideOverlayStatus.textContent = running ? 'Training is running · tap to exit' : 'Ride screen · tap to exit';
    if (state.settings.wakeLock) await requestWakeLock();
    try { if (document.documentElement.requestFullscreen && !document.fullscreenElement) await document.documentElement.requestFullscreen(); } catch {}
  }
  async function exitRideScreen() {
    if (!els.rideOverlay) return; els.rideOverlay.hidden = true;
    try { if (document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen(); } catch {}
  }

  // ---------- Server lessons ----------
  async function loadServerConfig() {
    try {
      const r = await fetch('server-config.json', { cache: 'no-store' });
      if (r.ok) serverConfig = { ...serverConfig, ...(await r.json()) };
    } catch {}
    updateSyncStatus();
  }

  async function loadManifest() {
    try {
      const r = await fetch('lessons/index.json', { cache: 'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      manifest = await r.json();
      populateLessonSelect();
      return true;
    } catch (e) {
      // Fall back to locally imported/cached lessons.
      const locals = Object.values(state.localLessons || {}).map(x => ({ id: x.id, title: x.title || x.id, local: true }));
      manifest = { lessons: locals };
      populateLessonSelect();
      return false;
    }
  }

  function populateLessonSelect() {
    els.lessonSelect.innerHTML = '';
    for (const item of manifest.lessons || []) {
      const opt = document.createElement('option'); opt.value = item.id; opt.textContent = item.title || item.id; els.lessonSelect.appendChild(opt);
    }
    const preferred = state.lastLessonId;
    if (preferred && [...els.lessonSelect.options].some(o => o.value === preferred)) els.lessonSelect.value = preferred;
  }

  async function loadLessonById(id) {
    stopTraining();
    const item = (manifest.lessons || []).find(x => x.id === id);
    if (!item) return;
    let text = '';
    let filename = `${id}.txt`;
    if (item.local && state.localLessons[id]) {
      text = state.localLessons[id].text; filename = state.localLessons[id].filename || filename;
    } else {
      try {
        const r = await fetch(item.file, { cache: 'no-store' });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        text = await r.text();
        filename = item.file.split('/').pop() || filename;
        state.localLessons[id] = { id, title: item.title || id, filename, text, cachedAt: new Date().toISOString(), serverFile: item.file };
        saveState();
      } catch {
        const cached = state.localLessons[id];
        if (!cached) throw new Error('Lesson could not be loaded from the server and no offline copy is available.');
        text = cached.text; filename = cached.filename || filename;
      }
    }
    lesson = parseLesson(text, filename, item.id, item.title || item.id);
    reconcileProgress(lesson);
    state.lastLessonId = lesson.id; saveState();
    await syncCurrentLessonOnOpen();
    buildQueue({ resetPosition: false });
    els.lessonSelect.value = lesson.id;
  }

  async function importLessonFile(file) {
    const text = await file.text();
    const id = lessonIdFromFilename(file.name);
    state.localLessons[id] = { id, title: id, filename: file.name, text, cachedAt: new Date().toISOString(), local: true };
    const existing = (manifest.lessons || []).find(x => x.id === id);
    if (!existing) manifest.lessons.push({ id, title: id, local: true });
    populateLessonSelect();
    await loadLessonById(id);
  }

  // ---------- Server progress sync ----------
  function serverConfigured() { return Boolean(serverConfig.supabaseUrl && serverConfig.supabaseAnonKey); }
  function syncConfigured() { return serverConfigured() && Boolean(state.syncKey); }

  async function sha256Hex(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function baseApiHeaders() {
    return {
      'apikey': serverConfig.supabaseAnonKey,
      'Authorization': `Bearer ${serverConfig.supabaseAnonKey}`,
      'Content-Type': 'application/json'
    };
  }

  function setSyncBadge(label, cls = '') {
    els.syncBadge.textContent = label;
    els.syncBadge.className = `sync-badge ${cls}`.trim();
  }

  function updateSyncStatus(message = '') {
    els.syncKeyInput.value = state.syncKey || '';
    if (!serverConfigured()) {
      setSyncBadge('Progress: local');
      els.syncInfo.textContent = message || 'Server progress sync is not configured. Lessons can still load from GitHub Pages.';
    } else if (!state.syncKey) {
      setSyncBadge('Key needed', 'error');
      els.syncInfo.textContent = message || 'Server is configured. Enter the same sync key on each device.';
    } else {
      setSyncBadge('Server', 'ok');
      els.syncInfo.textContent = message || 'Server sync is configured for this device.';
    }
  }

  async function fetchRemoteProgress(lessonId) {
    if (!syncConfigured()) return null;
    const base = serverConfig.supabaseUrl.replace(/\/$/, '');
    const url = `${base}/rest/v1/rpc/get_lesson_progress`;
    const r = await fetch(url, {
      method: 'POST', headers: baseApiHeaders(), cache: 'no-store',
      body: JSON.stringify({ p_sync_key: state.syncKey, p_lesson_id: lessonId })
    });
    if (!r.ok) throw new Error(`Sync read failed: ${r.status}`);
    return await r.json();
  }

  async function pushRemoteProgress(lessonId) {
    if (!syncConfigured() || !state.lessons[lessonId] || syncBusy) return;
    syncBusy = true; setSyncBadge('Syncing', 'busy');
    try {
      const base = serverConfig.supabaseUrl.replace(/\/$/, '');
      const url = `${base}/rest/v1/rpc/set_lesson_progress`;
      const data = state.lessons[lessonId];
      const r = await fetch(url, {
        method: 'POST', headers: baseApiHeaders(),
        body: JSON.stringify({ p_sync_key: state.syncKey, p_lesson_id: lessonId, p_data: data }),
        keepalive: true
      });
      if (!r.ok) throw new Error(`Sync write failed: ${r.status}`);
      setSyncBadge('Synced', 'ok'); els.syncInfo.textContent = `Progress synced at ${new Date().toLocaleTimeString()}.`;
    } catch (e) {
      setSyncBadge('Sync error', 'error'); els.syncInfo.textContent = `${e.message}. Local progress is still saved on this device.`;
    } finally { syncBusy = false; }
  }

  function scheduleServerPush() {
    if (!lesson || !syncConfigured()) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => pushRemoteProgress(lesson.id), 650);
  }

  function mergeRemoteIntoCurrent(remote) {
    if (!lesson || !remote) return false;
    const local = state.lessons[lesson.id];
    const remoteTime = Date.parse(remote.updatedAt || 0) || 0;
    const localTime = Date.parse(local?.updatedAt || 0) || 0;
    if (remoteTime > localTime) {
      state.lessons[lesson.id] = { ...remote };
      reconcileProgress(lesson);
      saveState();
      return true;
    }
    return false;
  }

  async function syncCurrentLessonOnOpen() {
    if (!lesson) return;
    if (!syncConfigured()) { updateSyncStatus(); return; }
    setSyncBadge('Syncing', 'busy');
    try {
      const remote = await fetchRemoteProgress(lesson.id);
      if (remote) {
        const usedRemote = mergeRemoteIntoCurrent(remote);
        if (!usedRemote) await pushRemoteProgress(lesson.id);
      } else {
        await pushRemoteProgress(lesson.id);
      }
      setSyncBadge('Synced', 'ok');
      els.syncInfo.textContent = 'Server progress loaded. Your saved round and position will resume.';
    } catch (e) {
      setSyncBadge('Sync error', 'error');
      els.syncInfo.textContent = `${e.message}. Using local progress.`;
    }
  }

  function generateSyncKey() {
    const arr = new Uint8Array(18); crypto.getRandomValues(arr);
    return [...arr].map(x => x.toString(16).padStart(2, '0')).join('');
  }

  // ---------- Progress import/export ----------
  function exportProgress() {
    if (!lesson) return;
    const p = getProgress();
    const payload = { schemaVersion: 5, lessonId: lesson.id, exportedAt: new Date().toISOString(), progress: p };
    downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), `${lesson.id}.progress.json`);
  }
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function importProgressFile(file) {
    const data = JSON.parse(await file.text());
    const lessonId = data.lessonId || data.progress?.lessonId;
    const progress = data.progress || data;
    if (!lessonId) throw new Error('Missing lessonId.');
    state.lessons[lessonId] = progress; saveState();
    if (lesson?.id === lessonId) { reconcileProgress(lesson); buildQueue({ resetPosition: false }); scheduleServerPush(); }
  }
  function resetProgress() {
    if (!lesson || !confirm(`Reset all progress for ${lesson.id}?`)) return;
    state.lessons[lesson.id] = { lessonId: lesson.id, sessions: 0, totalPlays: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), exercises: {}, rounds: {} };
    reconcileProgress(lesson); buildQueue({ resetPosition: false }); scheduleServerPush();
  }

  // ---------- Settings / events ----------
  function applySettingsToUI() {
    els.repetitionCount.value = state.settings.repetitions;
    els.pauseSeconds.value = state.settings.pauseSeconds;
    els.recallSeconds.value = state.settings.recallSeconds;
    els.businessSeconds.value = state.settings.businessSeconds;
    els.endWarningSeconds.value = state.settings.endWarningSeconds;
    els.beepEnabled.checked = state.settings.beep;
    els.shuffleEnabled.checked = state.settings.shuffle;
    els.hardOnly.checked = state.settings.hardOnly;
    els.wakeLockEnabled.checked = state.settings.wakeLock;
    els.mediaControlsEnabled.checked = state.settings.mediaControls;
    els.speechRate.value = state.settings.speechRate;
    els.speechRateValue.value = `${Number(state.settings.speechRate).toFixed(2)}×`;
    els.syncKeyInput.value = state.syncKey || '';
    loadVoices(); updateUI();
  }

  function bindSetting(el, key, transform = x => x) {
    el.addEventListener('change', () => {
      state.settings[key] = transform(el.type === 'checkbox' ? el.checked : el.value); saveState();
      if (key === 'hardOnly') buildQueue({ resetPosition: state.settings.hardOnly });
    });
  }

  els.modeButtons.forEach(btn => btn.addEventListener('click', () => {
    if (state.settings.mode === btn.dataset.mode) return;
    stopTraining(); state.settings.mode = btn.dataset.mode; saveState(); buildQueue({ resetPosition: false });
  }));
  els.lessonSelect.addEventListener('change', () => loadLessonById(els.lessonSelect.value).catch(e => alert(e.message)));
  els.refreshLessonsBtn.addEventListener('click', async () => {
    const ok = await loadManifest();
    const id = state.lastLessonId && (manifest.lessons || []).some(x => x.id === state.lastLessonId) ? state.lastLessonId : manifest.lessons?.[0]?.id;
    if (id) await loadLessonById(id);
    els.syncInfo.textContent = ok ? 'Lessons refreshed from the server.' : 'Server lesson list unavailable. Using cached/local lessons.';
  });
  els.lessonFile.addEventListener('change', async () => { const f = els.lessonFile.files?.[0]; if (f) await importLessonFile(f); els.lessonFile.value = ''; });
  els.progressFile.addEventListener('change', async () => {
    const f = els.progressFile.files?.[0]; if (f) { try { await importProgressFile(f); alert('Progress imported.'); } catch(e) { alert(`Could not import progress: ${e.message}`); } }
    els.progressFile.value = '';
  });

  els.playBtn.addEventListener('click', startTraining); els.repeatBtn.addEventListener('click', repeatCurrent); els.nextBtn.addEventListener('click', nextExercise); els.prevBtn.addEventListener('click', prevExercise);
  els.rideScreenBtn.addEventListener('click', enterRideScreen); els.rideOverlay.addEventListener('click', exitRideScreen);
  els.easyBtn.addEventListener('click', () => rateCurrent('easy')); els.hardBtn.addEventListener('click', () => rateCurrent('hard'));
  els.exportProgressBtn.addEventListener('click', exportProgress); els.resetProgressBtn.addEventListener('click', resetProgress);
  els.testVoiceBtn.addEventListener('click', () => speak('Before we set a target, we need to establish a baseline.').catch(() => {}));
  els.voiceSelect.addEventListener('change', () => { state.settings.voiceURI = els.voiceSelect.value; saveState(); showVoiceInfo(); });
  els.speechRate.addEventListener('input', () => { state.settings.speechRate = Number(els.speechRate.value); els.speechRateValue.value = `${state.settings.speechRate.toFixed(2)}×`; saveState(); });

  bindSetting(els.repetitionCount, 'repetitions', Number);
  bindSetting(els.pauseSeconds, 'pauseSeconds', Number);
  bindSetting(els.recallSeconds, 'recallSeconds', Number);
  bindSetting(els.businessSeconds, 'businessSeconds', Number);
  bindSetting(els.endWarningSeconds, 'endWarningSeconds', Number);
  bindSetting(els.beepEnabled, 'beep', Boolean);
  bindSetting(els.shuffleEnabled, 'shuffle', Boolean);
  bindSetting(els.hardOnly, 'hardOnly', Boolean);
  bindSetting(els.wakeLockEnabled, 'wakeLock', Boolean);
  bindSetting(els.mediaControlsEnabled, 'mediaControls', Boolean);

  els.generateSyncKeyBtn.addEventListener('click', () => { els.syncKeyInput.type = 'text'; els.syncKeyInput.value = generateSyncKey(); });
  els.copySyncKeyBtn.addEventListener('click', async () => { const value = els.syncKeyInput.value.trim() || state.syncKey; if (value) await navigator.clipboard?.writeText(value); });
  els.saveSyncKeyBtn.addEventListener('click', async () => {
    state.syncKey = els.syncKeyInput.value.trim(); saveState(); els.syncKeyInput.type = 'password'; updateSyncStatus();
    if (lesson) { await syncCurrentLessonOnOpen(); buildQueue({ resetPosition: false }); }
  });

  if ('speechSynthesis' in window) { window.speechSynthesis.onvoiceschanged = loadVoices; setTimeout(loadVoices, 250); setTimeout(loadVoices, 1200); }
  if ('mediaSession' in navigator) {
    try {
      navigator.mediaSession.setActionHandler('play', () => { if (!running || paused) startTraining(); });
      navigator.mediaSession.setActionHandler('pause', () => { if (running && !paused) startTraining(); });
      navigator.mediaSession.setActionHandler('stop', () => stopTraining('Stopped from headset/media controls'));
      navigator.mediaSession.setActionHandler('previoustrack', prevExercise);
      navigator.mediaSession.setActionHandler('nexttrack', nextExercise);
      try { navigator.mediaSession.setActionHandler('seekbackward', prevExercise); } catch {}
      try { navigator.mediaSession.setActionHandler('seekforward', nextExercise); } catch {}
    } catch {}
  }

  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstallPrompt = e; els.installBtn.hidden = false; });
  els.installBtn.addEventListener('click', async () => { if (!deferredInstallPrompt) return; deferredInstallPrompt.prompt(); await deferredInstallPrompt.userChoice; deferredInstallPrompt = null; els.installBtn.hidden = true; });
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });
      await registration.update();
    } catch (_) {}
  });
}
  window.addEventListener('pagehide', () => { if (lesson && syncConfigured()) pushRemoteProgress(lesson.id); });

  async function init() {
    applySettingsToUI();
    await loadServerConfig();
    await loadManifest();
    updateSyncStatus();
    const id = state.lastLessonId && (manifest.lessons || []).some(x => x.id === state.lastLessonId) ? state.lastLessonId : manifest.lessons?.[0]?.id;
    if (id) {
      try { await loadLessonById(id); } catch (e) { els.sentenceText.textContent = e.message; }
    } else {
      els.sentenceText.textContent = 'No lesson is available. Upload lessons/index.json and a lesson file, or import a local lesson.';
    }
    setPlayIcon();
  }

  init();
})();
