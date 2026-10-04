(() => {
  let catalog = null;
  let modules = [];
  let translations = { en: {}, hi: {}, mr: {} };
  let quiz = [];
  let suggestions = [];
  let lessonSteps = {};
  let lessonTips = {};
  let quizExplanations = [];
  let quizOutcome = {};
  let recognitionErrors = {};
  let faq = [];
  let speechUnavailableMessages = {};
  let speechLoadingMessages = {};
  const STORAGE = {
    language: 'digital-saathi-language', senior: 'digital-saathi-senior-mode',
    profile: 'digital-saathi-profile', progress: 'digital-saathi-progress', slow: 'digital-saathi-slow'
  };
  const state = {
    language: localStorage.getItem(STORAGE.language) || 'en',
    senior: localStorage.getItem(STORAGE.senior) === 'true',
    profile: JSON.parse(localStorage.getItem(STORAGE.profile) || '{"name":"Asha","audio":true}'),
    progress: JSON.parse(localStorage.getItem(STORAGE.progress) || '[]'),
    step: 0, quizIndex: 0, quizCorrect: null, answer: '', recognition: null, slow: localStorage.getItem(STORAGE.slow) === 'true',
    showAllModules: false, showAllTopics: false, helpOpen: false, showAgain: false,
    remoteAudio: null, remoteAudioUrl: '', speechRequestId: 0,
    authReady: false, authConfigured: false, user: null, role: 'senior', authView: 'login', authMessage: '',
    catalogReady: false, contentKey: '', contentSearch: '', contentBusy: false
  };
  const main = document.querySelector('#main-content');
  const $ = (selector, parent = document) => parent.querySelector(selector);
  const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];
  const t = (key, vars = {}) => {
    const text = translations[state.language]?.[key] || translations.en?.[key] || key;
    return Object.entries(vars).reduce((value, [name, replacement]) => value.replaceAll(`{${name}}`, replacement), text);
  };
  const local = (value) => typeof value === 'string' ? value : value?.[state.language] || value?.en || '';
  const esc = (value = '') => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  const moduleById = (id) => modules.find((item) => item.id === id);
  const lessonById = (id) => modules.flatMap((item) => item.topics.map((topic) => ({ ...topic, module: item }))).find((item) => item.id === id);
  const done = (id) => state.progress.includes(id);
  const progressStorageKey = () => state.user ? `${STORAGE.progress}:${state.user.id}` : STORAGE.progress;
  const totalLessons = () => modules.reduce((sum, item) => sum + item.topics.length, 0);
  const progressPercent = (item) => Math.round(item.topics.filter((lesson) => done(lesson.id)).length / item.topics.length * 100);
  const route = () => location.hash.replace(/^#\/?/, '') || 'home';

  function setCatalog(nextCatalog) {
    catalog = nextCatalog;
    window.SaathiCatalog.set(catalog);
    modules = catalog.modules || [];
    translations = catalog.translations || { en: {}, hi: {}, mr: {} };
    quiz = catalog.quiz || [];
    suggestions = catalog.suggestions || [];
    const assistant = catalog.assistant || {};
    lessonSteps = assistant.lessonSteps || {};
    lessonTips = assistant.lessonTips || {};
    quizExplanations = assistant.quizExplanations || [];
    quizOutcome = assistant.quizOutcome || {};
    recognitionErrors = assistant.recognitionErrors || {};
    faq = assistant.faq || [];
    speechUnavailableMessages = assistant.speechUnavailableMessages || {};
    speechLoadingMessages = assistant.speechLoadingMessages || {};
    state.catalogReady = true;
  }

  function textForStep(lesson, index) {
    const custom = lessonSteps[lesson.id]?.[state.language];
    if (custom) return custom[index];
    if (index === 1 && lessonTips[lesson.id]) return local(lessonTips[lesson.id]);
    const defaults = {
      en: [t('stepOpen'), t('stepFind'), t('stepTry')],
      hi: [t('stepOpen'), t('stepFind'), t('stepTry')],
      mr: [t('stepOpen'), t('stepFind'), t('stepTry')]
    };
    return defaults[state.language][index];
  }

  function speak(message, slow = state.slow) {
    stopSpeaking();
    const languageTag = { en: 'en-IN', hi: 'hi-IN', mr: 'mr-IN' }[state.language];
    const languagePrefix = languageTag.split('-')[0].toLowerCase();
    if ('speechSynthesis' in window && 'SpeechSynthesisUtterance' in window) {
      const voices = speechSynthesis.getVoices();
      const voice = voices.find((item) => item.lang.toLowerCase() === languageTag.toLowerCase())
        || voices.find((item) => item.lang.toLowerCase().startsWith(`${languagePrefix}-`))
        || voices.find((item) => item.lang.toLowerCase() === languagePrefix);
      if (voice) {
        const utterance = new SpeechSynthesisUtterance(message);
        utterance.lang = languageTag;
        utterance.voice = voice;
        utterance.rate = slow ? 0.72 : 0.92;
        utterance.onerror = (event) => {
          if (!['canceled', 'interrupted'].includes(event.error)) speakWithRemote(message, slow);
        };
        speechSynthesis.speak(utterance);
        return;
      }
    }
    speakWithRemote(message, slow);
  }

  function stopSpeaking() {
    state.speechRequestId += 1;
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    if (state.remoteAudio) {
      state.remoteAudio.pause();
      state.remoteAudio.src = '';
      state.remoteAudio = null;
    }
    if (state.remoteAudioUrl) {
      URL.revokeObjectURL(state.remoteAudioUrl);
      state.remoteAudioUrl = '';
    }
  }

  async function speakWithRemote(message, slow) {
    stopSpeaking();
    const requestId = state.speechRequestId;
    toast(speechLoadingMessages[state.language]);
    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: message, language: state.language, slow })
      });
      if (!response.ok) throw new Error('Speech service request failed.');
      const audioUrl = URL.createObjectURL(await response.blob());
      if (requestId !== state.speechRequestId) {
        URL.revokeObjectURL(audioUrl);
        return;
      }
      const audio = new Audio(audioUrl);
      state.remoteAudioUrl = audioUrl;
      state.remoteAudio = audio;
      const clearAudio = () => {
        if (state.remoteAudio !== audio) return;
        state.remoteAudio = null;
        state.remoteAudioUrl = '';
        URL.revokeObjectURL(audioUrl);
      };
      audio.onplaying = () => {
        clearTimeout(toastTimer);
        $('#toast').classList.remove('is-visible');
      };
      audio.onended = clearAudio;
      audio.onerror = () => {
        clearAudio();
        toast(speechUnavailableMessages[state.language]);
      };
      await audio.play();
    } catch (_error) {
      if (requestId === state.speechRequestId) toast(speechUnavailableMessages[state.language]);
    }
  }

  let toastTimer;
  function toast(message) {
    const node = $('#toast');
    node.textContent = message;
    node.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove('is-visible'), 3600);
  }

  function moduleCard(item, compact = false) {
    const percent = progressPercent(item);
    return `<a class="module-card ${item.tone}" href="#module/${item.id}">
      <span class="module-icon" aria-hidden="true">${item.icon}</span><span class="module-copy"><strong>${esc(local(item.title))}</strong><small>${esc(local(item.description))}</small>
      <span class="module-progress"><span class="progress-track"><span style="width:${percent}%"></span></span><span>${percent}%</span></span></span>
      <span class="module-arrow" aria-hidden="true">↗</span>${compact ? '' : `<span class="sr-only">${item.topics.length} ${t('lessons')}</span>`}
    </a>`;
  }

  function lessonCard(lesson, index) {
    return `<a class="lesson-card" href="#lesson/${lesson.module.id}/${lesson.id}">
      <span class="lesson-number">${String(index + 1).padStart(2, '0')}</span><span class="lesson-emoji" aria-hidden="true">${lesson.icon}</span>
      <span class="lesson-title">${esc(local(lesson.title))}</span><span class="lesson-status">${done(lesson.id) ? `✓ ${t('completed')}` : '›'}</span>
    </a>`;
  }

  function renderHome() {
    const featured = modules.find((item) => item.topics.some((lesson) => !done(lesson.id))) || modules[0];
    const name = esc(state.profile.name || 'Asha');
    const visibleModules = state.senior && !state.showAllModules ? modules.slice(0, 4) : modules;
    return `<section class="welcome-band">
      <div class="welcome-copy"><span class="eyebrow">${t('homeGreeting')} · ${t('welcome')}</span><h1>${t('welcomeName', { name })}</h1><p>${t('welcomeText')}</p>
        <div class="welcome-actions"><a class="button button-primary" href="#module/${featured.id}"><span aria-hidden="true">▶</span> ${t('startLearning')}</a><a class="button button-soft" href="#talk"><span aria-hidden="true">🎙️</span> ${t('askSaathi')}</a></div>
      </div><div class="welcome-art" aria-hidden="true"><span class="art-sun">☀</span><div class="art-phone"><span class="phone-speaker"></span><span class="phone-face">🙂</span><span class="phone-greeting">नमस्ते!</span><span class="phone-wave">⌁⌁⌁</span><span class="phone-button">●</span></div><span class="art-spark art-spark-one">✳</span><span class="art-spark art-spark-two">✳</span></div>
    </section>
    <section class="section-block"><div class="section-heading"><div><span class="eyebrow">${t('moduleLabel')}</span><h2>${t('yourLearning')}</h2></div><a class="text-link" href="#learn">${t('seeAll')} <span aria-hidden="true">→</span></a></div><div class="module-grid home-module-grid">${visibleModules.map((item) => moduleCard(item, true)).join('')}</div>${state.senior && !state.showAllModules ? `<button class="button button-soft show-more" type="button" data-action="show-modules">${t('seeAll')} +</button>` : ''}</section>
    <section class="bottom-strip"><div class="strip-icon" aria-hidden="true">🌼</div><div><strong>${t('featured')}</strong><p>${esc(local(featured.title))} · ${esc(local(featured.topics[0].title))}</p></div><a class="strip-link" href="#lesson/${featured.id}/${featured.topics[0].id}" aria-label="${t('openLesson')}">→</a></section>`;
  }

  function renderLearn() {
    return `<section class="page-intro"><span class="eyebrow">${t('moduleLabel')}</span><h1>${t('learn')}</h1><p>${t('topicLabel')}</p></section>
      <div class="module-grid">${modules.map((item) => moduleCard(item)).join('')}</div>
      <section class="quiz-banner"><span class="quiz-banner-icon" aria-hidden="true">🛡️</span><div><span class="eyebrow">${t('practice')}</span><h2>${t('quiz')}</h2><p>${t('quizIntro')}</p></div><a class="button button-dark" href="#quiz">${t('startLearning')} <span aria-hidden="true">→</span></a></section>`;
  }

  function renderModule(moduleId) {
    const item = moduleById(moduleId);
    if (!item) return renderNotFound();
    const visibleTopics = state.senior && !state.showAllTopics ? item.topics.slice(0, 4) : item.topics;
    return `<section class="page-intro module-intro ${item.tone}"><a class="back-link" href="#learn">← ${t('back')}</a><div class="intro-title"><span class="intro-icon" aria-hidden="true">${item.icon}</span><div><span class="eyebrow">${t('moduleLabel')}</span><h1>${esc(local(item.title))}</h1><p>${esc(local(item.description))}</p></div></div></section>
      <div class="topic-heading"><h2>${t('topicLabel')}</h2><span>${item.topics.filter((lesson) => done(lesson.id)).length}/${item.topics.length} ${t('complete')}</span></div>
      <div class="lesson-list">${visibleTopics.map((lesson, index) => lessonCard({ ...lesson, module: item }, index)).join('')}</div>${state.senior && item.topics.length > visibleTopics.length ? `<button class="button button-soft show-more" type="button" data-action="show-topics" data-module="${item.id}">${t('seeAll')} +</button>` : ''}`;
  }

  function renderLesson(moduleId, lessonId) {
    const lesson = lessonById(lessonId);
    if (!lesson || lesson.module.id !== moduleId) return renderNotFound();
    const steps = [0, 1, 2];
    const stepText = textForStep(lesson, state.step);
    const activeIcon = state.step === 0 ? lesson.icon : state.step === 1 ? '👆' : '✓';
    return `<section class="lesson-top"><a class="back-link" href="#module/${moduleId}">← ${t('backToTopics')}</a><span class="lesson-module-label">${lesson.module.icon} ${esc(local(lesson.module.title))}</span></section>
      <section class="lesson-layout"><div class="lesson-main"><span class="eyebrow">${t('category')} · ${t('step')} ${state.step + 1} / 3</span><h1>${esc(local(lesson.title))}</h1><p class="lesson-note">${t('lessonNote')}</p>
        <div class="demo-scene ${state.showAgain ? 'demo-emphasis' : ''}" aria-label="${esc(local(lesson.title))} demonstration"><div class="demo-phone"><div class="demo-status"><span>9:41</span><span>● ◉ ▰</span></div><div class="demo-screen"><span class="demo-icon">${activeIcon}</span><strong>${esc(local(lesson.title))}</strong><span class="demo-highlight">${state.step === 1 ? '◉' : '●'} <span>${esc(state.step === 1 ? t('tapToContinue') : local(lesson.module.title))}</span></span><div class="demo-dots"><i class="${state.step === 0 ? 'active' : ''}"></i><i class="${state.step === 1 ? 'active' : ''}"></i><i class="${state.step === 2 ? 'active' : ''}"></i></div></div><span class="demo-home"></span></div><span class="scene-spark" aria-hidden="true">✳</span></div>
        <div class="step-card"><span class="step-count">${t('step')} ${state.step + 1}</span><p>${esc(stepText)}</p><button class="button button-listen" type="button" data-action="listen-lesson"><span aria-hidden="true">🔊</span> ${t('listen')}</button></div>
        <div class="step-dots" aria-label="${t('step')} ${state.step + 1} of 3">${steps.map((step) => `<span class="step-dot ${step <= state.step ? 'active' : ''}"></span>`).join('')}</div>
        <div class="lesson-actions">${state.step < 2 ? `<button class="button button-primary" type="button" data-action="next-step">${t('next')} <span aria-hidden="true">→</span></button>` : `<button class="button button-primary" type="button" data-action="open-practice" data-module="${moduleId}" data-lesson="${lessonId}">${t('practiceNow')} <span aria-hidden="true">→</span></button>`}<button class="button button-understand" type="button" data-action="understand">❓ ${t('iDontUnderstand')}</button></div>${state.helpOpen ? `<div class="understand-panel"><button type="button" class="text-link" data-action="listen-current">🔊 ${t('listenAgain')}</button><button type="button" class="text-link" data-action="show-current">👀 ${t('showAgain')}</button><button type="button" class="text-link" data-action="slow-current">🐢 ${t('explainSlowly')}</button><a class="text-link" href="#home">🏠 ${t('goHome')}</a></div>` : ''}
      </div><aside class="lesson-aside"><div class="aside-card"><span class="aside-icon" aria-hidden="true">🌱</span><strong>${t('lessonNote')}</strong><button type="button" class="text-link" data-action="listen-all">${t('listen')} <span aria-hidden="true">↗</span></button></div><div class="aside-card safety-aside"><span aria-hidden="true">🔒</span><p>${t('safePractice')}</p></div></aside></section>`;
  }

  function renderPractice(lessonId = '') {
    const lesson = lessonById(lessonId) || lessonById('make-call');
    const moduleId = lesson.module.id;
    let simulation;
    if (lessonId.includes('video') || moduleId === 'video') {
      simulation = `<div class="sim-video"><div class="sim-avatar">🙂</div><span>${esc(t('sampleContactAsha'))}</span><button class="sim-call-button" type="button" data-action="video-start">📹 ${t('videoPractice')}</button></div>`;
    } else if (moduleId === 'payments') {
      simulation = `<div class="sim-payment"><div class="fake-bank-mark">▦</div><p>${t('paymentAmount')}</p><strong>₹ 10.00</strong><p>${t('noSecrets')}</p><button class="button button-primary" type="button" data-action="payment-practice">${t('paymentPractice')}</button></div>`;
    } else if (lessonId.includes('voice') || lessonId.includes('text') || lessonId.includes('photo')) {
      simulation = `<div class="sim-chat"><div class="sim-chat-head">🙂 ${esc(t('sampleContactAsha'))}</div><div class="sim-chat-body"><span class="chat-bubble">${t('practiceHint')}</span></div><div class="sim-chat-input"><input id="practice-message" type="text" maxlength="80" placeholder="${t('messagePlaceholder')}" aria-label="${t('messagePlaceholder')}"><button type="button" data-action="message-practice" aria-label="${t('send')}">➤</button></div></div>`;
    } else {
      simulation = `<div class="sim-phone"><span class="eyebrow">${t('chooseContact')}</span><div class="contact-options">${['sampleContactAsha', 'sampleContactRahul', 'sampleContactNeha'].map((name) => `<button class="contact-choice" type="button" data-action="select-contact" data-name="${t(name)}"><span class="avatar">${t(name).charAt(0)}</span><span>${t(name)}</span><span aria-hidden="true">›</span></button>`).join('')}</div><div id="call-action" class="call-action" hidden><button type="button" class="call-button" data-action="call-practice"><span aria-hidden="true">📞</span>${t('callButton')}</button></div></div>`;
    }
    return `<section class="page-intro"><a class="back-link" href="#lesson/${moduleId}/${lesson.id}">← ${t('back')}</a><span class="eyebrow">${t('practiceTitle')}</span><h1>${t('practiceNow')}</h1><p>${esc(local(lesson.title))}</p></section><section class="practice-layout"><div class="practice-panel">${simulation}<p class="practice-hint"><span aria-hidden="true">ℹ</span> ${t('practiceHint')}</p></div><aside class="practice-side"><span class="practice-shield" aria-hidden="true">🛡️</span><h2>${t('practiceTitle')}</h2><p>${t('noSecrets')}</p><a class="text-link" href="#quiz">${t('quiz')} →</a></aside></section>`;
  }

  function renderQuiz() {
    const item = quiz[state.quizIndex];
    if (!item) return `<section class="quiz-result"><span class="result-icon">🌟</span><span class="eyebrow">${t('quiz')}</span><h1>${t('quizDone')}</h1><p>${t('great')}</p><a href="#learn" class="button button-primary">${t('learn')} →</a></section>`;
    const answered = state.quizCorrect !== null;
    return `<section class="quiz-wrap"><a class="back-link" href="#learn">← ${t('back')}</a><div class="quiz-progress-label">${t('quizCount', { current: state.quizIndex + 1, total: quiz.length })}</div><div class="quiz-progress"><span style="width:${(state.quizIndex + 1) / quiz.length * 100}%"></span></div><div class="quiz-card"><span class="quiz-big-icon" aria-hidden="true">✉️</span><span class="eyebrow">${t('quiz')}</span><h1>${esc(local(item.text))}</h1><p>${t('quizIntro')}</p>
        <div class="quiz-options"><button class="quiz-option option-safe" type="button" data-action="answer-quiz" data-answer="true" ${answered ? 'disabled' : ''}><span aria-hidden="true">✓</span>${t('safe')}</button><button class="quiz-option option-suspicious" type="button" data-action="answer-quiz" data-answer="false" ${answered ? 'disabled' : ''}><span aria-hidden="true">!</span>${t('suspicious')}</button></div>
        ${answered ? `<div class="quiz-feedback ${state.quizCorrect ? 'is-correct' : 'is-wrong'}" role="status"><span aria-hidden="true">${state.quizCorrect ? '✓' : '!'}</span><p>${quizOutcome[state.language][state.quizCorrect ? 'right' : 'wrong']} ${esc(quizExplanations[state.quizIndex][state.language])}</p><button class="text-link" type="button" data-action="listen-quiz">🔊 ${t('listenAnswer')}</button></div><button class="button button-primary" type="button" data-action="next-quiz">${state.quizIndex === quiz.length - 1 ? t('finishQuiz') : t('nextQuestion')} →</button>` : ''}
      </div><p class="quiz-safe-note">🔒 ${t('safePractice')}</p></section>`;
  }

  function renderTalk() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    return `<section class="page-intro"><span class="eyebrow">${t('talk')}</span><h1>${t('talkPrompt')}</h1><p>${t('answerPrompt')}</p></section><section class="talk-layout"><div class="talk-main"><div class="saathi-orb" aria-hidden="true"><span>स</span><i>✳</i></div><p class="talk-status" id="talk-status">${t('suggestions')}</p><button class="mic-button" type="button" data-action="recognize" ${Recognition ? '' : 'aria-describedby="voice-fallback"'}><span aria-hidden="true">🎙️</span><span>${t('startListening')}</span></button><p id="voice-fallback" class="voice-fallback" ${Recognition ? 'hidden' : ''}>${t('voiceUnavailable')}</p><form class="talk-form" id="talk-form"><label class="sr-only" for="talk-input">${t('typeQuestion')}</label><input id="talk-input" type="text" placeholder="${t('typeQuestion')}" autocomplete="off"><button class="button button-primary" type="submit">${t('send')}</button></form>
        ${state.answer ? `<div class="answer-card" role="status"><span class="answer-icon" aria-hidden="true">💡</span><div><span class="eyebrow">${t('answer')}</span><p>${esc(state.answer)}</p><button class="text-link" type="button" data-action="speak-answer">🔊 ${t('listen')}</button></div></div>` : ''}
      </div><aside class="suggestions-panel"><span class="eyebrow">${t('suggestions')}</span><div class="suggestion-list">${suggestions.map((question, index) => `<button class="suggestion" type="button" data-action="ask-suggestion" data-index="${index}"><span aria-hidden="true">${['🎙️', '📹', '🔐', '☀️'][index]}</span>${esc(local(question))}<span aria-hidden="true">→</span></button>`).join('')}</div></aside></section>`;
  }

  function renderProgress() {
    const total = totalLessons();
    const percent = total ? Math.round(state.progress.length / total * 100) : 0;
    return `<section class="page-intro"><span class="eyebrow">${t('myProgress')}</span><h1>${t('progressTitle')}</h1><p>${t('doneOf', { done: state.progress.length, total })}</p></section><section class="progress-overview"><div class="progress-ring" style="--progress:${percent}%"><div><strong>${percent}%</strong><span>${t('complete')}</span></div></div><div class="progress-summary"><span class="eyebrow">${t('completedLessons')}</span><strong>${state.progress.length}</strong><p>${t('progressEmpty')}</p></div></section><div class="progress-list">${modules.map((item) => `<a class="progress-row" href="#module/${item.id}"><span class="progress-row-icon" aria-hidden="true">${item.icon}</span><span class="progress-row-title">${esc(local(item.title))}<small>${item.topics.filter((lesson) => done(lesson.id)).length} / ${item.topics.length} ${t('lessons')}</small></span><span class="progress-track"><span style="width:${progressPercent(item)}%"></span></span><strong>${progressPercent(item)}%</strong></a>`).join('')}</div>`;
  }

  function renderHelp() {
    return `<section class="page-intro"><span class="eyebrow">${t('help')}</span><h1>${t('helpTitle')}</h1><p>${t('helpText')}</p></section><div class="help-grid"><button class="help-card" type="button" data-action="help-speak"><span>🔊</span><strong>${t('helpListen')}</strong><small>${t('listen')}</small></button><a class="help-card" href="#quiz"><span>🛡️</span><strong>${t('helpQuiz')}</strong><small>${t('practice')}</small></a><a class="help-card" href="#talk"><span>🎙️</span><strong>${t('askSaathi')}</strong><small>${t('talk')}</small></a><a class="help-card" href="#home"><span>⌂</span><strong>${t('homeButton')}</strong><small>${t('back')}</small></a></div>`;
  }

  function renderSettings() {
    return `<section class="page-intro"><span class="eyebrow">${t('settings')}</span><h1>${t('settingsTitle')}</h1></section><section class="settings-list"><label class="setting-row"><span class="setting-icon">◉</span><span><strong>${t('seniorMode')}</strong><small>${t('highContrast')}</small></span><input type="checkbox" data-setting="senior" ${state.senior ? 'checked' : ''}></label><label class="setting-row"><span class="setting-icon">🔊</span><span><strong>${t('preferences')}</strong><small>${t('audioPreference')}</small></span><input type="checkbox" data-setting="audio" ${state.profile.audio !== false ? 'checked' : ''}></label><div class="setting-info">🔒 ${t('privacySetting')}</div><button class="button button-soft" type="button" data-action="profile">✎ ${t('profileTitle')}</button></section>`;
  }

  function renderAuth() {
    if (!state.authConfigured) {
      return `<section class="auth-panel"><span class="brand-mark" aria-hidden="true">स</span><span class="eyebrow">Digital Saathi</span><h1>${t('account')}</h1><p role="status">${t('authSetup')}</p><a class="button button-primary" href="#home">${t('homeButton')}</a></section>`;
    }
    if (state.user) {
      return `<section class="auth-panel"><span class="brand-mark" aria-hidden="true">स</span><span class="eyebrow">${t('account')}</span><h1>${esc(state.profile.name || state.user.email)}</h1><p>${t('signedInAs')} ${esc(state.user.email || '')}</p><p class="role-badge">${state.role === 'admin' ? t('admin') : t('roleSenior')}</p><button class="button button-primary" type="button" data-action="sign-out">${t('signOut')}</button></section>`;
    }
    const registering = state.authView === 'register';
    return `<section class="auth-panel"><span class="brand-mark" aria-hidden="true">स</span><span class="eyebrow">Digital Saathi</span><h1>${registering ? t('registerTitle') : t('loginTitle')}</h1><p>${t('authIntro')}</p>${state.authMessage ? `<p class="auth-message" role="status">${esc(state.authMessage)}</p>` : ''}
      <form id="auth-form" class="auth-form">${registering ? `<label>${t('nameLabel')}<input name="name" maxlength="80" autocomplete="name" required></label><label>${t('language')}<select name="language"><option value="en">English</option><option value="hi">हिन्दी</option><option value="mr">मराठी</option></select></label>` : ''}<label>${t('email')}<input name="email" type="email" autocomplete="email" required></label><label>${t('password')}<input name="password" type="password" minlength="8" autocomplete="${registering ? 'new-password' : 'current-password'}" required></label><button class="button button-primary" type="submit">${registering ? t('createAccount') : t('login')}</button></form>
      <button class="text-link auth-switch" type="button" data-action="auth-switch">${registering ? t('switchToLogin') : t('switchToRegister')}</button><p class="auth-role-note">${t('roleSenior')}</p></section>`;
  }

  function renderAdmin() {
    if (state.role !== 'admin') return `<section class="page-intro"><h1>${t('adminOnly')}</h1><a class="button button-primary" href="#home">${t('homeButton')}</a></section>`;
    const rows = window.SaathiCatalog.collectContentStrings(catalog);
    const query = state.contentSearch.toLocaleLowerCase();
    const keys = [...new Set(rows.map((row) => row.key))].filter((key) => {
      if (!query) return true;
      return key.toLocaleLowerCase().includes(query)
        || rows.some((row) => row.key === key && row.value.toLocaleLowerCase().includes(query));
    }).sort();
    if (!keys.includes(state.contentKey)) state.contentKey = keys[0] || '';
    const valueFor = (language) => rows.find((row) => row.key === state.contentKey && row.language === language)?.value || '';
    return `<section class="page-intro"><span class="eyebrow">${t('admin')}</span><h1>${t('contentAdmin')}</h1><p>${t('contentHelp')}</p></section>
      <section class="admin-content"><div class="admin-toolbar"><label>${t('findString')}<input id="content-search" type="search" value="${esc(state.contentSearch)}" placeholder="${t('findString')}"></label></div>
      <form id="content-form" class="content-editor"><label>${t('chooseString')}<select id="content-key" name="key" size="1">${keys.map((key) => `<option value="${esc(key)}" ${key === state.contentKey ? 'selected' : ''}>${esc(key)}</option>`).join('')}</select></label>
      ${keys.length ? `<div class="translation-fields"><label>English<textarea name="en" rows="4">${esc(valueFor('en'))}</textarea></label><label>हिन्दी<textarea name="hi" rows="4">${esc(valueFor('hi'))}</textarea></label><label>मराठी<textarea name="mr" rows="4">${esc(valueFor('mr'))}</textarea></label></div><button class="button button-primary" type="submit" ${state.contentBusy ? 'disabled' : ''}>${state.contentBusy ? t('saving') : t('saveString')}</button>` : `<p>${t('noStrings')}</p>`}</form>
      <p class="admin-count">${rows.length} ${t('contentAdmin')}</p></section>`;
  }

  function renderProfile() {
    return `<div class="modal-backdrop" role="presentation" data-action="close-profile"><section class="profile-dialog" role="dialog" aria-modal="true" aria-labelledby="profile-title"><button class="icon-button modal-close" type="button" data-action="close-profile" aria-label="${t('close')}">×</button><span class="eyebrow">${t('settings')}</span><h2 id="profile-title">${t('profileTitle')}</h2><form id="profile-form"><label>${t('name')}<input name="name" maxlength="80" value="${esc(state.profile.name || '')}" autocomplete="name"></label><label>${t('language')}<select name="language"><option value="en" ${state.language === 'en' ? 'selected' : ''}>English</option><option value="hi" ${state.language === 'hi' ? 'selected' : ''}>हिन्दी</option><option value="mr" ${state.language === 'mr' ? 'selected' : ''}>मराठी</option></select></label><label class="profile-check"><input type="checkbox" name="audio" ${state.profile.audio !== false ? 'checked' : ''}> ${t('audioPreference')}</label><div class="dialog-actions"><button class="button button-soft" type="button" data-action="close-profile">${t('cancel')}</button><button class="button button-primary" type="submit">${t('save')}</button></div></form></section></div>`;
  }

  function renderNotFound() {
    return `<section class="page-intro"><h1>${t('noResults')}</h1><a class="button button-primary" href="#home">${t('homeButton')}</a></section>`;
  }

  function setNav(active, label) {
    $$('.nav-link[data-route]').forEach((link) => link.classList.toggle('is-active', link.dataset.route === active));
    $('#breadcrumb').textContent = label || t(active === 'module' || active === 'lesson' ? 'learn' : active);
  }

  function render() {
    const current = route().split('/');
    const page = current[0];
    document.documentElement.lang = state.language;
    document.body.classList.toggle('senior-mode', state.senior);
    document.body.classList.toggle('auth-required', state.authConfigured && !state.user);
    $('#language-select').value = state.language;
    $('#senior-toggle').setAttribute('aria-pressed', String(state.senior));
    $('#profile-name').textContent = state.profile.name || 'Asha';
    $('#profile-role').textContent = state.role === 'admin' ? t('admin') : t('roleSenior');
    $('#account-nav').href = state.user ? '#auth' : '#auth/login';
    $('#admin-nav').hidden = state.role !== 'admin';
    $('#sign-out-button').hidden = !state.user;
    $$('[data-i18n]').forEach((element) => { element.textContent = t(element.dataset.i18n); });

    if (!state.authReady) {
      main.innerHTML = '<section class="auth-panel" aria-busy="true"></section>';
      return;
    }
    if (!state.catalogReady) {
      main.innerHTML = '<section class="auth-panel"><h1>Supabase catalog unavailable</h1><p>Run supabase/schema.sql and supabase/seed.sql in the Supabase SQL Editor, then restart the app.</p></section>';
      return;
    }
    if (state.authConfigured && !state.user) {
      main.innerHTML = renderAuth();
      $('#breadcrumb').textContent = t('account');
      return;
    }

    let html;
    if (page === 'home') { html = renderHome(); setNav('home', t('home')); }
    else if (page === 'learn') { html = renderLearn(); setNav('learn', t('learn')); }
    else if (page === 'module') { html = renderModule(current[1]); setNav('learn', t('learn')); }
    else if (page === 'lesson') { state.step = Math.min(state.step, 2); html = renderLesson(current[1], current[2]); setNav('learn', t('learn')); }
    else if (page === 'practice') { html = renderPractice(current[1]); setNav('practice', t('practice')); }
    else if (page === 'quiz') { html = renderQuiz(); setNav('practice', t('practice')); }
    else if (page === 'talk') { html = renderTalk(); setNav('talk', t('talk')); }
    else if (page === 'progress') { html = renderProgress(); setNav('progress', t('myProgress')); }
    else if (page === 'help') { html = renderHelp(); setNav('help', t('help')); }
    else if (page === 'settings') { html = renderSettings(); setNav('settings', t('settings')); }
    else if (page === 'auth') { html = renderAuth(); setNav('account', t('account')); }
    else if (page === 'admin') { html = renderAdmin(); setNav('admin', t('admin')); }
    else { html = renderNotFound(); setNav('home', t('home')); }
    main.innerHTML = html + (state.profileDialog ? renderProfile() : '');
    if (state.profileDialog) $('input[name="name"]', main)?.focus();
    if (state.senior && page === 'lesson') {
      const lesson = lessonById(current[2]);
      const speechKey = `${location.hash}:${state.language}`;
      if (lesson && state.lastAutoSpoken !== speechKey) {
        state.lastAutoSpoken = speechKey;
        speak(textForStep(lesson, state.step));
      }
    }
  }

  async function persistProfile() {
    localStorage.setItem(STORAGE.profile, JSON.stringify(state.profile));
    try { await window.SaathiAPI.saveProfile({ ...state.profile, language: state.language, senior_mode: state.senior }); } catch (_error) { /* Local-first: Supabase may not be configured. */ }
  }

  async function completeLesson(lessonId) {
    await persistProfile();
    if (!done(lessonId)) {
      state.progress.push(lessonId);
      localStorage.setItem(progressStorageKey(), JSON.stringify(state.progress));
      try { await window.SaathiAPI.completeLesson(lessonId); } catch (_error) { /* Local-first: Supabase may not be configured. */ }
    }
    toast(t('great'));
  }

  async function completePractice() {
    const lesson = lessonById(route().split('/')[1]);
    if (lesson) await completeLesson(lesson.id);
  }

  function answerQuestion(question) {
    const normalized = question.toLocaleLowerCase().normalize('NFC').replace(/[?!.,।]/g, ' ').replace(/\s+/g, ' ').trim();
    const match = faq.find((entry) => entry.terms.some((term) => normalized.includes(term.toLocaleLowerCase())));
    if (match) {
      state.answer = match[state.language];
      state.answerLesson = match.id;
    } else {
      state.answer = t('answerPrompt');
      state.answerLesson = null;
    }
    render();
    if (state.profile.audio !== false) speak(state.answer);
  }

  function openRecognition() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) return toast(t('voiceUnavailable'));
    const recognition = new Recognition();
    state.recognition = recognition;
    recognition.lang = { en: 'en-IN', hi: 'hi-IN', mr: 'mr-IN' }[state.language];
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    const status = $('#talk-status');
    if (status) status.textContent = t('listening');
    recognition.onresult = (event) => answerQuestion(event.results[0][0].transcript);
    recognition.onerror = (event) => {
      state.recognition = null;
      const message = recognitionErrorMessage(event.error);
      if (status) status.textContent = message;
      toast(message);
      $('#talk-input')?.focus();
    };
    recognition.onend = () => { state.recognition = null; };
    try {
      recognition.start();
    } catch (_error) {
      state.recognition = null;
      if (status) status.textContent = t('noSpeech');
      toast(t('noSpeech'));
    }
  }

  function recognitionErrorMessage(error) {
    return recognitionErrors[error]?.[state.language] || t('noSpeech');
  }

  function authErrorMessage(error) {
    const message = typeof error?.message === 'string' ? error.message.trim() : '';
    return message ? message.slice(0, 240) : t('authError');
  }

  document.addEventListener('click', async (event) => {
    const actionButton = event.target.closest('[data-action]');
    if (!actionButton) return;
    const action = actionButton.dataset.action;
    if (action === 'menu') document.body.classList.toggle('nav-open');
    if (action === 'auth-switch') {
      state.authView = state.authView === 'register' ? 'login' : 'register';
      state.authMessage = '';
      location.hash = state.authView === 'register' ? 'auth/register' : 'auth/login';
      render();
    }
    if (action === 'sign-out') {
      try {
        await window.SaathiAuth.signOut();
        await applyAccount(null, null);
        state.authMessage = '';
        toast(t('logoutSuccess'));
        location.hash = 'home';
      } catch (_error) { toast(t('authError')); }
    }
    if (action === 'show-modules') { state.showAllModules = true; render(); }
    if (action === 'show-topics') { state.showAllTopics = true; render(); }
    if (action === 'settings') location.hash = 'settings';
    if (action === 'profile') { state.profileDialog = true; render(); }
    if (action === 'close-profile') { state.profileDialog = false; render(); }
    if (action === 'listen-lesson' || action === 'listen-all') {
      const current = route().split('/');
      const lesson = lessonById(current[2]);
      if (lesson) speak([0, 1, 2].map((index) => textForStep(lesson, index)).join(' '));
    }
    if (action === 'next-step') { state.step = Math.min(state.step + 1, 2); render(); }
    if (action === 'open-practice') {
      location.hash = `practice/${actionButton.dataset.lesson}`;
    }
    if (action === 'understand') {
      state.helpOpen = !state.helpOpen;
      render();
    }
    if (action === 'listen-current' || action === 'show-current' || action === 'slow-current') {
      const lesson = lessonById(route().split('/')[2]);
      if (lesson) speak(textForStep(lesson, state.step), action === 'slow-current');
      state.showAgain = action === 'show-current';
      state.helpOpen = false;
      render();
    }
    if (action === 'select-contact') { $('#call-action').hidden = false; actionButton.classList.add('selected'); }
    if (action === 'call-practice') { toast(t('calling')); await completePractice(); }
    if (action === 'video-start') { toast(t('videoStarted')); await completePractice(); }
    if (action === 'message-practice') { toast(t('practiceSent')); await completePractice(); }
    if (action === 'payment-practice') { toast(t('paymentDone')); await completePractice(); }
    if (action === 'answer-quiz') {
      const expected = quiz[state.quizIndex].safe;
      state.quizCorrect = (actionButton.dataset.answer === 'true') === expected;
      render();
    }
    if (action === 'next-quiz') { state.quizIndex += 1; state.quizCorrect = null; render(); }
    if (action === 'listen-quiz') speak(`${quizOutcome[state.language][state.quizCorrect ? 'right' : 'wrong']} ${quizExplanations[state.quizIndex][state.language]}`);
    if (action === 'recognize') openRecognition();
    if (action === 'ask-suggestion') answerQuestion(local(suggestions[Number(actionButton.dataset.index)]));
    if (action === 'speak-answer') speak(state.answer);
    if (action === 'help-speak') speak(t('helpText'));
  });

  document.addEventListener('submit', async (event) => {
    if (event.target.id === 'talk-form') {
      event.preventDefault();
      const input = $('#talk-input');
      if (input.value.trim()) answerQuestion(input.value.trim());
    }
    if (event.target.id === 'profile-form') {
      event.preventDefault();
      const form = new FormData(event.target);
      state.profile.name = String(form.get('name') || '').trim().slice(0, 80) || 'Asha';
      state.profile.audio = form.has('audio');
      state.language = String(form.get('language'));
      localStorage.setItem(STORAGE.language, state.language);
      state.profileDialog = false;
      persistProfile();
      render();
    }
    if (event.target.id === 'auth-form') {
      event.preventDefault();
      const form = new FormData(event.target);
      const email = String(form.get('email') || '').trim();
      const password = String(form.get('password') || '');
      state.authMessage = '';
      try {
        if (state.authView === 'register') {
          const result = await window.SaathiAuth.signUp({
            name: String(form.get('name') || '').trim(),
            language: String(form.get('language') || 'en'),
            email,
            password
          });
          if (result.session) await applyAccount(result.user, result.profile);
          else state.authMessage = t('confirmEmail');
        } else {
          const result = await window.SaathiAuth.signIn(email, password);
          await applyAccount(result.user, result.profile);
        }
      } catch (error) { state.authMessage = authErrorMessage(error); }
      render();
    }
    if (event.target.id === 'content-form') {
      event.preventDefault();
      const form = new FormData(event.target);
      const key = String(form.get('key') || '');
      if (!key) return;
      const rows = ['en', 'hi', 'mr'].map((language) => ({ key, language, value: String(form.get(language) || '') }));
      state.contentBusy = true;
      render();
      try {
        const updatedCatalog = structuredClone(catalog);
        window.SaathiCatalog.applyContentStrings(rows, updatedCatalog);
        await window.SaathiAPI.saveCatalog(updatedCatalog);
        setCatalog(updatedCatalog);
        toast(t('stringsSaved'));
      } catch (_error) { toast(t('authError')); }
      state.contentBusy = false;
      render();
    }
  });

  document.addEventListener('change', (event) => {
    if (event.target.id === 'language-select') {
      state.language = event.target.value;
      localStorage.setItem(STORAGE.language, state.language);
      persistProfile();
      render();
    }
    if (event.target.matches('[data-setting="senior"]')) {
      state.senior = event.target.checked;
      localStorage.setItem(STORAGE.senior, String(state.senior));
      persistProfile();
      render();
    }
    if (event.target.matches('[data-setting="audio"]')) {
      state.profile.audio = event.target.checked;
      persistProfile();
    }
    if (event.target.id === 'content-key') {
      state.contentKey = event.target.value;
      render();
    }
  });

  document.addEventListener('input', (event) => {
    if (event.target.id === 'content-search') {
      state.contentSearch = event.target.value;
      state.contentKey = '';
      render();
      $('#content-search')?.focus();
    }
  });

  $('#senior-toggle').addEventListener('click', () => {
    state.senior = !state.senior;
    localStorage.setItem(STORAGE.senior, String(state.senior));
    persistProfile();
    render();
  });
  window.addEventListener('hashchange', () => {
    state.step = 0;
    state.answer = '';
    state.helpOpen = false;
    state.showAllTopics = false;
    document.body.classList.remove('nav-open');
    const [page, view] = route().split('/');
    if (page === 'auth' && !state.user) {
      state.authView = view === 'register' ? 'register' : 'login';
      state.authMessage = '';
    }
    render();
  });

  async function applyAccount(user, profile) {
    state.user = user;
    state.role = profile?.role || 'senior';
    if (profile) {
      state.profile = { ...state.profile, name: profile.name || state.profile.name, audio: state.profile.audio !== false };
      state.language = profile.language || state.language;
      state.senior = Boolean(profile.senior_mode);
      localStorage.setItem(STORAGE.profile, JSON.stringify(state.profile));
      localStorage.setItem(STORAGE.language, state.language);
      localStorage.setItem(STORAGE.senior, String(state.senior));
    }
    try {
      if (user) {
        const { progress } = await window.SaathiAPI.getProgress();
        state.progress = progress.map((item) => item.lesson_id).filter((id) => lessonById(id));
        localStorage.setItem(progressStorageKey(), JSON.stringify(state.progress));
      } else {
        state.progress = JSON.parse(localStorage.getItem(progressStorageKey()) || '[]').filter((id) => lessonById(id));
      }
    } catch (_error) {
      toast(t('authError'));
    }
    state.authReady = true;
    state.authConfigured = Boolean(window.SaathiAuth.configured);
    render();
  }

  async function initializeApplication() {
    const result = await window.SaathiAuth.initialize();
    state.authConfigured = result.configured;
    if (!result.configured) {
      state.authReady = true;
      state.catalogReady = false;
      render();
      return;
    }

    try {
      setCatalog(await window.SaathiAPI.getCatalog());
    } catch (_error) {
      state.authReady = true;
      state.catalogReady = false;
      render();
      return;
    }

    state.authReady = true;
    state.user = result.user;
    state.role = result.profile?.role || 'senior';
    if (result.profile) {
      state.profile = { ...state.profile, name: result.profile.name || state.profile.name };
      state.language = result.profile.language || state.language;
      state.senior = Boolean(result.profile.senior_mode);
    }
    if (result.user && result.profile) {
      await applyAccount(result.user, result.profile);
    } else {
      state.progress = JSON.parse(localStorage.getItem(progressStorageKey()) || '[]').filter((id) => lessonById(id));
      render();
    }
    window.SaathiAuth.onChange(({ user, profile }) => { applyAccount(user, profile); });
  }

  if (!location.hash) location.hash = 'home';
  render();
  initializeApplication().catch(() => {
    state.authReady = true;
    state.authConfigured = false;
    render();
  });
})();