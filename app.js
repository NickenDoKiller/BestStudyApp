/* =========================================================
   QuizPro — Engine v3.2 (Edit UI + Shuffle + Cheatsheet)
   ========================================================= */
'use strict';

const K = {
  exams:   'quizpro.exams.v1',
  history: 'quizpro.history.v1',
  streak:  'quizpro.streak.v1',
  theme:   'quizpro.theme.v1'
};
const CHEATSHEET_KEY = 'cheatsheet.data.v1';
const DAY_MS = 24 * 60 * 60 * 1000;

const store = {
  get(k, d) {
    try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); }
    catch { return d; }
  },
  set(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); }
    catch (e) { toast('Không lưu được dữ liệu', 'err'); }
  }
};

let exams   = store.get(K.exams, []);
let history = store.get(K.history, []);
let streak  = store.get(K.streak, { count: 0, best: 0, last: 0 });
let theme   = store.get(K.theme, 'dark');
let session = null;
let editingExam = null;
let gameCleanup = null;

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = () => 'ex_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function toast(msg, type = '') {
  const t = $('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'on ' + type;
  clearTimeout(t._tid);
  t._tid = setTimeout(() => { t.className = type; }, 2400);
}

function fmtTime(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return String(h).padStart(2, '0') + ':' +
           String(m).padStart(2, '0') + ':' +
           String(sec).padStart(2, '0');
  }
  return String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
}

function normShort(str) {
  return String(str ?? '').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[.,;:!?"'`()\[\]{}]/g, '')
    .replace(/\s+/g, ' ');
}

/* =========================================================
   ÂM THANH
   ========================================================= */
const bgm = document.getElementById('bgMusic');
const clickSfx = document.getElementById('clickSfx');
if (bgm) bgm.volume = 0.4;
if (clickSfx) clickSfx.volume = 0.6;

function playClick() {
  if (!clickSfx) return;
  try { clickSfx.currentTime = 0; clickSfx.play().catch(() => {}); }
  catch (e) {}
}

function startMusic() {
  if (!bgm) return;
  bgm.play().then(() => {
    document.removeEventListener('click', startMusic);
    document.removeEventListener('touchstart', startMusic);
    document.removeEventListener('keydown', startMusic);
  }).catch(() => {});
}

if (bgm) {
  bgm.play().catch(() => {
    document.addEventListener('click', startMusic);
    document.addEventListener('touchstart', startMusic);
    document.addEventListener('keydown', startMusic);
  });
}

/* =========================================================
   RICH TEXT
   ========================================================= */
function rich(text) {
  if (text === null || text === undefined) return '';
  const s = String(text);
  if (typeof marked !== 'undefined' && marked.parse) {
    try { return marked.parse(s, { breaks: true, gfm: true }); }
    catch (e) { console.warn('marked error:', e); }
  }
  return esc(s).replace(/\n/g, '<br>');
}
function richInline(text) {
  if (text === null || text === undefined) return '';
  const s = String(text);
  if (typeof marked !== 'undefined' && marked.parseInline) {
    try { return marked.parseInline(s, { breaks: true, gfm: true }); }
    catch (e) {}
  }
  return esc(s);
}
function applyMath(el) {
  if (!el || !window.renderMathInElement) return;
  try {
    renderMathInElement(el, {
      delimiters: [
        {left: '$$', right: '$$', display: true},
        {left: '$', right: '$', display: false},
        {left: '\\(', right: '\\)', display: false},
        {left: '\\[', right: '\\]', display: true}
      ],
      throwOnError: false,
      errorColor: '#ff4d5e'
    });
  } catch (e) { console.warn('KaTeX render error:', e); }
}

/* =========================================================
   MODAL
   ========================================================= */
function openModal(id) { const el = document.getElementById(id); if (el) el.classList.add('show'); }
function closeModal(id) { const el = document.getElementById(id); if (el) el.classList.remove('show'); }

function showConfirm(o) {
  const back = document.getElementById('confirmModal');
  if (!back) return;

  document.getElementById('cmIcon').textContent = o.icon || '⚠️';
  document.getElementById('cmIcon').className = 'modal-icon ' + (o.iconClass || 'warn');
  document.getElementById('cmTitle').textContent = o.title || '';
  document.getElementById('cmDesc').innerHTML = o.desc || '';

  document.getElementById('cmActions').innerHTML = `
    <button class="btn ghost" id="cmCancel">${o.cancelText || 'Huỷ'}</button>
    <button class="btn ${o.okClass || 'primary'}" id="cmOk">${o.okText || 'OK'}</button>
  `;

  document.getElementById('cmCancel').onclick = () => closeModal('confirmModal');
  document.getElementById('cmOk').onclick = () => {
    closeModal('confirmModal');
    if (typeof o.onOk === 'function') o.onOk();
  };

  openModal('confirmModal');
}

/* =========================================================
   THEME
   ========================================================= */
const THEMES = [
  { id: 'dark',   cls: 'sw-dark',   name: 'Tối' },
  { id: 'light',  cls: 'sw-light',  name: 'Sáng' },
  { id: 'ocean',  cls: 'sw-ocean',  name: 'Biển' },
  { id: 'forest', cls: 'sw-forest', name: 'Rừng' },
  { id: 'sunset', cls: 'sw-sunset', name: 'Hoàng hôn' },
  { id: 'neon',   cls: 'sw-neon',   name: 'Neon' }
];
function initThemes() {
  const box = $('themes');
  if (!box) return;
  box.innerHTML = THEMES.map(t =>
    `<button class="swatch ${t.cls} ${t.id === theme ? 'on' : ''}" data-theme="${t.id}" title="${t.name}"></button>`
  ).join('');
  box.addEventListener('click', e => {
    const b = e.target.closest('[data-theme]');
    if (!b) return;
    playClick();
    theme = b.dataset.theme;
    store.set(K.theme, theme);
    applyTheme();
    box.querySelectorAll('.swatch').forEach(s => s.classList.toggle('on', s.dataset.theme === theme));
  });
}
function applyTheme() { document.body.dataset.theme = theme; }

/* =========================================================
   STREAK
   ========================================================= */
function touchStreak() {
  const now = Date.now();
  const last = streak.last || 0;
  if (!last) {
    streak.count = 1;
  } else {
    const diff = now - last;
    if (diff > DAY_MS) {
      streak.count = 1;
    } else {
      const d1 = new Date(last), d2 = new Date(now);
      const sameDay = d1.getFullYear() === d2.getFullYear()
                   && d1.getMonth() === d2.getMonth()
                   && d1.getDate() === d2.getDate();
      if (!sameDay) streak.count += 1;
    }
  }
  streak.last = now;
  streak.best = Math.max(streak.best || 0, streak.count);
  store.set(K.streak, streak);
}
function renderStreak() {
  const now = Date.now();
  const last = streak.last || 0;
  const alive = last && (now - last) <= DAY_MS;
  if (!alive && last) {
    $('fire').classList.add('cold');
    $('streakNum').textContent = '0';
    $('streakSub').textContent = 'Chuỗi đã tắt vì quá 24h. Làm 1 bài để thắp lại! 🔥';
  } else {
    $('fire').classList.remove('cold');
    $('streakNum').textContent = streak.count || 0;
    if (!streak.count) {
      $('streakSub').textContent = 'Hãy làm 1 bài để bắt đầu chuỗi!';
    } else {
      const left = DAY_MS - (now - last);
      $('streakSub').innerHTML = `Còn <b>${fmtTime(left)}</b> để giữ chuỗi — đừng để lửa tắt!`;
    }
  }
  $('fire').style.setProperty('--s', Math.min(0.75 + (streak.count || 0) * 0.07, 1.7));
  $('streakBest').textContent = `🏆 Kỷ lục: ${streak.best || 0} ngày`;
}

/* =========================================================
   HOME RENDER
   ========================================================= */
function renderHome() {
  renderStreak();
  $('stTotal').textContent = history.length;
  $('stQ').textContent = history.reduce((a, h) => a + (h.total || 0), 0);
  const avg = history.length
    ? Math.round(history.reduce((a, h) => a + (h.correct / Math.max(1, h.total)) * 100, 0) / history.length)
    : null;
  $('stAvg').textContent = avg === null ? '–' : avg + '%';
  $('examCount').textContent = exams.length ? `(${exams.length})` : '';

  const list = $('examList');
    if (!exams.length) {
    list.innerHTML = `
      <div class="empty">
        <div class="big">🗂️</div>
        <h3>Chưa có đề nào</h3>
        <p>Bạn có thể tạo đề trực tiếp bằng giao diện, hoặc dán JSON do AI tạo.</p>
        <div style="display:flex; gap:10px; justify-content:center; margin-top:16px; flex-wrap:wrap;">
          <button class="btn primary" id="emptyCreate">✨ Tạo bằng giao diện</button>
          <button class="btn ghost" id="emptyImport">📋 Import JSON</button>
        </div>
      </div>`;
    $('emptyCreate').onclick = () => { playClick(); createNewExam(); };
    $('emptyImport').onclick = () => { playClick(); openImport(); };
  } else {
    list.innerHTML = exams.map(ex => {
      const tries = history.filter(h => h.examId === ex.id);
      const best = tries.length ? Math.max(...tries.map(t => Math.round(t.correct / Math.max(1, t.total) * 100))) : null;
      const shuffled = ex.shuffleQuestions || ex.shuffleOptions;
      return `
        <div class="exam-item" data-id="${ex.id}">
          <div class="exam-main">
            <div class="exam-title">${esc(ex.title)}</div>
            <div class="exam-meta">
              ${ex.subject ? `<span class="tag">${esc(ex.subject)}</span>` : ''}
              ${shuffled ? `<span class="tag">🔀</span>` : ''}
              <span>${ex.questions.length} câu</span>
              ${ex.duration ? `<span>· ${ex.duration} phút</span>` : '<span>· không giới hạn</span>'}
              ${tries.length ? `<span>· đã làm ${tries.length} lần</span>` : ''}
              ${best !== null ? `<span class="tag score">Tốt nhất ${best}%</span>` : ''}
            </div>
          </div>
          <div class="exam-actions">
            <button class="btn sm primary" data-act="start">Bắt đầu</button>
            <button class="btn sm" data-act="edit">✏️ Sửa</button>
            <button class="btn sm danger" data-act="del">Xoá</button>
          </div>
        </div>`;
    }).join('');
  }

  const hl = $('historyList');
  const recent = history.slice(-8).reverse();
  if (!recent.length) {
    hl.innerHTML = `<div style="color:var(--muted);font-size:13.5px;padding:8px 2px">Chưa có lần làm bài nào.</div>`;
  } else {
    hl.innerHTML = recent.map(h => {
      const pct = Math.round(h.correct / Math.max(1, h.total) * 100);
      const col = pct >= 80 ? 'var(--good)' : pct >= 50 ? 'var(--accent2)' : 'var(--bad)';
      const d = new Date(h.at);
      const date = `${d.getDate()}/${d.getMonth() + 1} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
      return `
        <div class="exam-item" style="padding:12px 16px">
          <div class="exam-main">
            <div class="exam-title" style="font-size:14px">${esc(h.title)}</div>
            <div class="exam-meta"><span>${date}</span><span>· ${fmtTime(h.timeSpent)}</span></div>
          </div>
          <div style="font-weight:900;font-size:17px;color:${col}">${pct}%</div>
        </div>`;
    }).join('');
  }
}

/* =========================================================
   IMPORT / EXPORT
   ========================================================= */
function openImport() { openModal('modalImport'); $('importArea').focus(); }
function closeImport() { closeModal('modalImport'); }

function bindImportEvents() {
  const bNew = $('btnCreateNew');
  if (bNew) bNew.onclick = () => { playClick(); createNewExam(); };
  
  const bImport = $('btnImportOpen');
  if (bImport) bImport.onclick = openImport;

  $('btnImportCancel').onclick = closeImport;
  $('modalImport').addEventListener('click', e => {
    if (e.target.id === 'modalImport') closeImport();
  });
}

function bindImportActions() {
  $('btnLoadDemo').onclick = () => {
    $('importArea').value = JSON.stringify({
      title: "Đề mẫu v3.2 — Shuffle + TF đa phát biểu",
      subject: "Tổng hợp",
      duration: 5,
      shuffle: true,
      questions: [
        { type: "mcq",
          question: "Công thức tính **động năng** là $E_k = \\frac{1}{2}mv^2$. Đại lượng **m** là gì?",
          options: ["Khối lượng", "Vận tốc", "Gia tốc", "Quãng đường"],
          answer: 0,
          explain: "Trong $E_k = \\frac{1}{2}mv^2$: **m** = khối lượng (kg), **v** = vận tốc (m/s)."
        },
        { type: "mcq",
          question: "**Thủ đô** của Việt Nam là gì?",
          options: ["Hà Nội", "TP. Hồ Chí Minh", "Đà Nẵng", "Huế"],
          answer: 0,
          explain: "Hà Nội là thủ đô từ năm 1010 (thời Lý Thái Tổ dời đô)."
        },
        { type: "truefalse",
          question: "Xét các phát biểu sau về **nội năng** và quá trình biến đổi khí:",
          statements: [
            { text: "Nén khí nhanh làm nhiệt độ khí tăng là do khí nhận công.", answer: true },
            { text: "Khi khí dãn nở tự do không thực hiện công thì nội năng luôn tăng.", answer: false },
            { text: "Nội năng của khí lý tưởng chỉ phụ thuộc vào nhiệt độ.", answer: true },
            { text: "Đơn vị của nội năng là Joule (J).", answer: true }
          ],
          explain: "a) Đúng — nén nhanh sinh công lên khí. b) Sai — dãn nở tự do, nội năng khí lý tưởng không đổi. c) Đúng. d) Đúng."
        },
        { type: "truefalse",
          question: "Cho phương trình $x^2 - 3x + 2 = 0$. Xét các khẳng định (đề này **allOrNothing**):",
          allOrNothing: true,
          statements: [
            { text: "Phương trình có 2 nghiệm phân biệt.", answer: true },
            { text: "Tổng hai nghiệm bằng $3$.", answer: true },
            { text: "Tích hai nghiệm bằng $2$.", answer: true },
            { text: "Cả hai nghiệm đều dương.", answer: true }
          ],
          explain: "$x^2 - 3x + 2 = (x-1)(x-2) = 0 \\Rightarrow x \\in \\{1, 2\\}$. Cả 4 ý đều đúng."
        },
        { type: "short",
          question: "Nghiệm của phương trình $x^2 - 5x + 6 = 0$ (nhập số lớn hơn)?",
          answers: ["3"],
          explain: "$x^2 - 5x + 6 = (x-2)(x-3) = 0 \\Rightarrow x \\in \\{2, 3\\}$."
        }
      ]
    }, null, 2);
  };

  $('btnImportOk').onclick = () => {
    const raw = $('importArea').value.trim();
    if (!raw) { toast('Chưa có dữ liệu', 'err'); return; }
    let data;
    try { data = JSON.parse(raw); }
    catch (err) { toast('JSON không hợp lệ: ' + err.message, 'err'); return; }

    const arr = Array.isArray(data) ? data : [data];
    const added = [];
    for (const rawExam of arr) {
      const ex = normalizeExam(rawExam);
      if (!ex) continue;
      ex.id = ex.id || uid();
      while (exams.some(x => x.id === ex.id)) ex.id = uid();
      exams.push(ex);
      added.push(ex.title);
    }
    if (!added.length) { toast('Không đọc được đề nào (thiếu "questions"? hoặc sai format)', 'err'); return; }
    store.set(K.exams, exams);
    closeImport();
    $('importArea').value = '';
    renderHome();
    toast(`Đã thêm ${added.length} đề ✓`, 'ok');
  };

  $('btnExport').onclick = () => {
    const blob = new Blob([JSON.stringify({ exams, history, streak }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'quizpro-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Đã xuất file sao lưu', 'ok');
  };
}

/* =========================================================
   NORMALIZE
   ========================================================= */
function normalizeExam(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (!Array.isArray(raw.questions) || !raw.questions.length) return null;

  const questions = raw.questions.map(q => {
    if (!q || typeof q !== 'object') return null;
    const type = String(q.type || '').toLowerCase();
    const base = {
      question: String(q.question || q.q || '').trim(),
      explain: q.explain || q.explanation || ''
    };

    if (type === 'mcq' || type === 'tracnghiem' || type === 'multiple-choice') {
      const options = Array.isArray(q.options) ? q.options.map(String) : [];
      if (options.length < 2) return null;
      let answer = q.answer;
      if (typeof answer === 'string') {
        const idx = 'ABCD'.indexOf(answer.trim().toUpperCase());
        answer = idx >= 0 ? idx : options.findIndex(o => o === q.answer);
      }
      answer = Number(answer);
      if (!Number.isInteger(answer) || answer < 0 || answer >= options.length) return null;
      return { ...base, type: 'mcq', options, answer };
    }

    if (type === 'truefalse' || type === 'true-false' || type === 'dungsai' || type === 'tf') {
      if (Array.isArray(q.statements) && q.statements.length > 0) {
        const statements = q.statements.map(s => {
          if (!s || typeof s !== 'object') return null;
          let a = s.answer;
          if (typeof a === 'string') a = /^(true|đúng|dung|t|1|yes)$/i.test(a.trim());
          if (typeof a !== 'boolean') return null;
          return {
            text: String(s.text || s.statement || s.content || '').trim(),
            answer: a
          };
        }).filter(s => s && s.text);
        if (!statements.length) return null;
        return { ...base, type: 'truefalse', statements, allOrNothing: !!q.allOrNothing };
      }
      let a = q.answer;
      if (typeof a === 'string') a = /^(true|đúng|dung|t|1|yes)$/i.test(a.trim());
      if (typeof a !== 'boolean') return null;
      return { ...base, type: 'truefalse', answer: a };
    }

    if (type === 'short' || type === 'traloinngan' || type === 'fill' || type === 'text') {
      let answers = q.answers || q.accepted || (q.answer !== undefined ? [q.answer] : []);
      if (!Array.isArray(answers)) answers = [answers];
      answers = answers.map(String).map(s => s.trim()).filter(Boolean);
      if (!answers.length) return null;
      return { ...base, type: 'short', answers, strict: !!q.strict };
    }
    return null;
  }).filter(Boolean);
  if (!questions.length) return null;

  let shuffleQ = false, shuffleO = false;
  if (raw.shuffle === true || raw.shuffle === 'all') { shuffleQ = true; shuffleO = true; }
  else if (raw.shuffle === 'questions') { shuffleQ = true; }
  else if (raw.shuffle === 'options') { shuffleO = true; }
  if (raw.shuffleQuestions) shuffleQ = true;
  if (raw.shuffleOptions) shuffleO = true;

  return {
    id: raw.id || null,
    title: String(raw.title || raw.name || 'Đề không tên').trim(),
    subject: raw.subject ? String(raw.subject).trim() : '',
    duration: Number(raw.duration) > 0 ? Number(raw.duration) : 0,
    shuffleQuestions: shuffleQ,
    shuffleOptions: shuffleO,
    questions
  };
}

/* =========================================================
   EXAM SESSION
   ========================================================= */
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = $(id);
  if (el) el.classList.add('active');
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function startExam(examId) {
  const exam = exams.find(e => e.id === examId);
  if (!exam) return;

  const questionOrder = exam.questions.map((_, i) => i);
  if (exam.shuffleQuestions) shuffleArray(questionOrder);

  const optionOrders = {};
  exam.questions.forEach((q, i) => {
    if (q.type === 'mcq') {
      const arr = q.options.map((_, j) => j);
      if (exam.shuffleOptions) shuffleArray(arr);
      optionOrders[i] = arr;
    }
  });

  session = {
    exam,
    answers: new Array(exam.questions.length).fill(null),
    index: 0,
    questionOrder,
    optionOrders,
    startedAt: Date.now(),
    endsAt: 0,
    timerId: null
  };
  exam.questions.forEach((q, i) => {
    if (q.type === 'short') session.answers[i] = '';
    else if (q.type === 'truefalse' && Array.isArray(q.statements)) {
      session.answers[i] = new Array(q.statements.length).fill(null);
    }
  });
  $('examName').textContent = exam.title;
  showScreen('screen-exam');
  startTimer();
  renderQuestion();
}

function startTimer() {
  const el = $('timer');
  clearInterval(session.timerId);
  if (!session.exam.duration) {
    el.textContent = '∞';
    el.classList.remove('warn');
    return;
  }
  session.endsAt = Date.now() + session.exam.duration * 60000;
  const tick = () => {
    if (!session) return;
    const left = Math.max(0, session.endsAt - Date.now());
    const s = Math.ceil(left / 1000);
    el.textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
    el.classList.toggle('warn', left <= 60000);
    if (left <= 0) {
      clearInterval(session.timerId);
      toast('Hết giờ! Bài đã được nộp tự động.', 'err');
      submitExam(true);
    }
  };
  tick();
  session.timerId = setInterval(tick, 250);
}

function renderQuestion() {
  const { exam, index, answers } = session;
  const questionOrder = session.questionOrder || exam.questions.map((_, i) => i);
  const realIdx = questionOrder[index];
  const q = exam.questions[realIdx];
  const a = answers[realIdx];

  let body = '';
  if (q.type === 'mcq') {
    const optOrder = session.optionOrders[realIdx] || q.options.map((_, i) => i);
    body = `<div class="opts">` + optOrder.map((origIdx, visualPos) => {
      const opt = q.options[origIdx];
      const clean = String(opt).replace(/^\s*[A-Za-z]\s*[.)\-:]\s*/, '');
      return `<button class="opt ${a === origIdx ? 'selected' : ''}" data-opt="${origIdx}">
        <span class="opt-key">${String.fromCharCode(65 + visualPos)}</span>
        <span class="opt-text">${richInline(clean)}</span>
      </button>`;
    }).join('') + `</div>`;
  } else if (q.type === 'truefalse') {
    if (Array.isArray(q.statements) && q.statements.length > 0) {
      const arr = Array.isArray(a) ? a : new Array(q.statements.length).fill(null);
      body = `<div class="tf-stmts">` + q.statements.map((s, i) => {
        const cur = arr[i];
        return `<div class="tf-stmt">
          <div class="tf-stmt-head">
            <span class="tf-stmt-label">${String.fromCharCode(97 + i)})</span>
            <div class="tf-stmt-text rich">${rich(s.text)}</div>
          </div>
          <div class="tf-stmt-btns">
            <button class="tf-btn ok ${cur === true ? 'on' : ''}" data-stmt="${i}" data-val="1">Đúng</button>
            <button class="tf-btn no ${cur === false ? 'on' : ''}" data-stmt="${i}" data-val="0">Sai</button>
          </div>
        </div>`;
      }).join('') + `</div>`;
    } else {
      body = `<div class="opts">
        <button class="opt ${a === true ? 'selected' : ''}" data-tf="true">
          <span class="opt-key">✓</span><span class="opt-text">Đúng</span></button>
        <button class="opt ${a === false ? 'selected' : ''}" data-tf="false">
          <span class="opt-key">✕</span><span class="opt-text">Sai</span></button>
      </div>`;
    }
  } else {
    body = `<input class="short-input" id="shortInput" type="text"
      placeholder="Nhập câu trả lời của bạn..." value="${esc(a || '')}" autocomplete="off" />`;
  }
  const allOrNothingTag = q.allOrNothing 
    ? `<span class="q-tag-danger" title="Sai 1 ý là mất điểm cả câu">🎯 Tất cả hoặc không</span>` 
    : '';

  const TYPE_LABEL = { mcq: 'Trắc nghiệm', truefalse: 'Đúng / Sai', short: 'Trả lời ngắn' };
  $('qContainer').innerHTML = `
    <div class="q-card">
      <div class="q-head">
        <span class="q-num">Câu ${index + 1}</span>
        <span class="q-type">${TYPE_LABEL[q.type] || ''}</span>
        ${allOrNothingTag}
      </div>
      <div class="q-text rich">${rich(q.question)}</div>
      ${body}
    </div>`;

  applyMath($('qContainer'));

  $('qContainer').querySelectorAll('[data-opt]').forEach(b => {
    b.onclick = () => {
      playClick();
      session.answers[realIdx] = Number(b.dataset.opt);
      renderQuestion();
    };
  });

  $('qContainer').querySelectorAll('[data-tf]').forEach(b => {
    b.onclick = () => {
      playClick();
      session.answers[realIdx] = b.dataset.tf === 'true';
      renderQuestion();
    };
  });

  $('qContainer').querySelectorAll('[data-stmt]').forEach(b => {
    b.onclick = () => {
      playClick();
      const sIdx = Number(b.dataset.stmt);
      const sVal = b.dataset.val === '1';
      let curArr = session.answers[realIdx];
      if (!Array.isArray(curArr) || curArr.length !== q.statements.length) {
        curArr = new Array(q.statements.length).fill(null);
      }
      curArr[sIdx] = sVal;
      session.answers[realIdx] = curArr;
      renderQuestion();
    };
  });

  const si = $('shortInput');
  if (si) {
    si.oninput = () => { session.answers[realIdx] = si.value; renderPalette(); };
    if (si.value) si.setSelectionRange(si.value.length, si.value.length);
  }

  $('btnPrev').disabled = index === 0;
  $('btnNext').disabled = index === exam.questions.length - 1;
  $('progBar').style.width = ((index + 1) / exam.questions.length * 100) + '%';
  renderPalette();
}

function renderPalette() {
  const { exam, answers, index } = session;
  const questionOrder = session.questionOrder || exam.questions.map((_, i) => i);
  $('palette').innerHTML = questionOrder.map((realIdx, displayIdx) => {
    const q = exam.questions[realIdx];
    const a = answers[realIdx];
    let done;
    if (q.type === 'truefalse' && Array.isArray(q.statements)) {
      done = Array.isArray(a) && a.length === q.statements.length
             && a.every(x => x === true || x === false);
    } else if (q.type === 'short') {
      done = String(a || '').trim() !== '';
    } else {
      done = a !== null && a !== undefined;
    }
    const cls = displayIdx === index ? 'cur' : (done ? 'done' : '');
    return `<button class="pal ${cls}" data-go="${displayIdx}">${displayIdx + 1}</button>`;
  }).join('');
  $('palette').querySelectorAll('[data-go]').forEach(b => {
    b.onclick = () => {
      playClick();
      session.index = Number(b.dataset.go);
      renderQuestion();
    };
  });
}

/* =========================================================
   GRADING
   ========================================================= */
function grade(exam, answers) {
  let correct = 0;
  const details = exam.questions.map((q, i) => {
    const given = answers[i];
    let ok = false;

    if (q.type === 'mcq') {
      ok = given === q.answer;
      if (ok) correct++;

    } else if (q.type === 'truefalse') {
      if (Array.isArray(q.statements) && q.statements.length > 0) {
        const n = q.statements.length;
        if (Array.isArray(given) && given.length === n) {
          const matched = q.statements.filter((s, j) => given[j] === s.answer).length;
          if (q.allOrNothing) {
            ok = matched === n;
            if (ok) correct++;
          } else {
            ok = matched === n;
            correct += matched / n;
          }
        }
      } else {
        ok = given === q.answer;
        if (ok) correct++;
      }

    } else if (q.type === 'short') {
      const g = String(given ?? '').trim();
      if (!g) ok = false;
      else if (q.strict) ok = q.answers.some(a => a === g);
      else { const ng = normShort(g); ok = ng !== '' && q.answers.some(a => normShort(a) === ng); }
      if (ok) correct++;
    }

    return { ok, given };
  });
  return { correct, total: exam.questions.length, details };
}

function submitExam(auto) {
  if (!session) return;
  clearInterval(session.timerId);
  const { exam, answers, startedAt } = session;
  const timeSpent = Date.now() - startedAt;
  const result = grade(exam, answers);
  const before = streak.count || 0;
  touchStreak();
  const gained = (streak.count || 0) > before;
  
  // Đẩy explain sang Cheatsheet
  const addedToCheat = syncToCheatsheet(exam, result.details);

  history.push({
    examId: exam.id, title: exam.title, correct: result.correct,
    total: result.total, timeSpent, at: Date.now(), answers,
    shuffle: {
      questionOrder: session.questionOrder,
      optionOrders: session.optionOrders
    }
  });
  if (history.length > 300) history = history.slice(-300);
  store.set(K.history, history);

  renderResult(exam, result, timeSpent, gained, auto, addedToCheat);
  session = null;
}

/* =========================================================
   SYNC TO CHEATSHEET
   ========================================================= */
function syncToCheatsheet(exam, details) {
  let cheatsheet = { title: "Cheatsheet của tôi", subtitle: "Tự động lưu từ StudyPro", sections: [] };
  try {
    const raw = localStorage.getItem(CHEATSHEET_KEY);
    if (raw) cheatsheet = JSON.parse(raw);
  } catch (e) { console.error("Lỗi đọc cheatsheet", e); }

  const secTitle = exam.subject || exam.title || "Chung";
  let section = cheatsheet.sections.find(s => s.title === secTitle);
  
  if (!section) {
    section = {
      title: secTitle,
      icon: "📚",
      // Random màu pastel cho đẹp
      color: "#" + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0'),
      items: []
    };
    cheatsheet.sections.push(section);
  }

  let added = 0;
  details.forEach((d, i) => {
    const q = exam.questions[i];
    if (!q.explain) return; // Chỉ lưu câu có giải thích

    // Check trùng lặp dựa vào nội dung câu hỏi
    const isDup = section.items.some(item => item.term === q.question);
    if (isDup) return;

    section.items.push({
      term: q.question,
      desc: q.explain,
      code: "",
      tags: [exam.title]
    });
    added++;
  });

  if (added > 0) {
    localStorage.setItem(CHEATSHEET_KEY, JSON.stringify(cheatsheet));
  }
  return added;
}

/* =========================================================
   RESULT
   ========================================================= */
function renderResult(exam, result, timeSpent, gained, auto, addedToCheat) {
  const optOrders = (session && session.optionOrders) || {};
  const pct = Math.round(result.correct / Math.max(1, result.total) * 100);
  const C = 2 * Math.PI * 52;
  showScreen('screen-result');

  const arc = $('scoreArc');
  arc.style.strokeDasharray = C;
  arc.style.strokeDashoffset = C;
  requestAnimationFrame(() => setTimeout(() => { arc.style.strokeDashoffset = C * (1 - pct / 100); }, 60));

  const corrDisp = Number.isInteger(result.correct)
    ? result.correct
    : (Math.round(result.correct * 100) / 100);
  const wrongDisp = Math.round((result.total - result.correct) * 100) / 100;

  $('scorePct').textContent = pct + '%';
  $('scoreFrac').textContent = `${corrDisp}/${result.total}`;
  $('rsCorrect').textContent = corrDisp;
  $('rsWrong').textContent = wrongDisp;
  $('rsTime').textContent = fmtTime(timeSpent);
  $('rsStreak').textContent = streak.count || 0;

  let title, sub;
  if (pct === 100)      { title = '🏆 Hoàn hảo!'; sub = 'Bạn đã trả lời đúng tất cả. Quá đỉnh!'; }
  else if (pct >= 80)   { title = '🎉 Xuất sắc!'; sub = 'Kiến thức rất vững, tiếp tục phát huy nhé!'; }
  else if (pct >= 50)   { title = '💪 Khá tốt!'; sub = 'Cố gắng thêm một chút nữa là ổn rồi.'; }
  else                  { title = '📖 Cần ôn thêm'; sub = 'Xem lại phần giải thích bên dưới nhé.'; }
  if (auto) sub = '⏰ Hết giờ — ' + sub;
  $('resultTitle').textContent = title;
  $('resultSub').textContent = sub;

  $('reviewList').innerHTML = exam.questions.map((q, i) => {
    const d = result.details[i];
    const isMultiTF = q.type === 'truefalse' && Array.isArray(q.statements) && q.statements.length > 0;

    if (isMultiTF) {
      const userArr = Array.isArray(d.given) ? d.given : [];
      const n = q.statements.length;
      const matched = q.statements.filter((s, j) => userArr[j] === s.answer).length;

      const rows = q.statements.map((s, j) => {
        const ua = userArr[j];
        const isC = ua === s.answer;
        const uTxt = ua === true ? 'Đúng' : ua === false ? 'Sai' : '—';
        const cTxt = s.answer ? 'Đúng' : 'Sai';
        return `<div class="rv-stmt ${isC ? 'ok' : 'no'}">
          <span class="rv-stmt-label">${String.fromCharCode(97 + j)})</span>
          <span class="rv-stmt-text">${richInline(s.text)}</span>
          <div class="rv-stmt-ans">
            ${isC
              ? `<span class="rv-ok">✓ ${uTxt}</span>`
              : `<span class="rv-no">✕ Bạn: ${uTxt}</span> <span class="rv-correct">Đáp án: <b>${cTxt}</b></span>`}
          </div>
        </div>`;
      }).join('');

      return `
        <div class="review-item ${d.ok ? 'ok' : 'no'}">
          <div class="rv-head">
            <span class="rv-icon ${d.ok ? 'ok' : 'no'}">${d.ok ? '✓' : '✕'}</span>
            <div class="rv-q"><b>Câu ${i + 1}.</b> <span class="rich">${rich(q.question)}</span></div>
          </div>
          <div class="rv-score-line">Đúng <b>${matched}/${n}</b> ý${q.allOrNothing ? ' (tất cả hoặc không)' : ''}</div>
          <div class="rv-stmts">${rows}</div>
          ${q.explain ? `<div class="rv-explain rich">💡 ${rich(q.explain)}</div>` : ''}
        </div>`;
    }

    let givenTxt = '—';
    if (q.type === 'mcq') {
      if (d.given === null || d.given === undefined) {
        givenTxt = '<i>Chưa trả lời</i>';
      } else {
        const optOrder = optOrders[i];
        const visPos = optOrder ? optOrder.indexOf(d.given) : d.given;
        givenTxt = String.fromCharCode(65 + visPos) + '. ' +
          richInline(String(q.options[d.given]).replace(/^\s*[A-Za-z]\s*[.)\-:]\s*/, ''));
      }
    } else if (q.type === 'truefalse') {
      givenTxt = d.given === null || d.given === undefined ? '<i>Chưa trả lời</i>' : (d.given ? 'Đúng' : 'Sai');
    } else {
      givenTxt = String(d.given ?? '').trim() ? richInline(d.given) : '<i>Chưa trả lời</i>';
    }

    let correctTxt = '';
    if (q.type === 'mcq') {
      const optOrder = optOrders[i];
      const visPos = optOrder ? optOrder.indexOf(q.answer) : q.answer;
      correctTxt = String.fromCharCode(65 + visPos) + '. ' +
        richInline(String(q.options[q.answer]).replace(/^\s*[A-Za-z]\s*[.)\-:]\s*/, ''));
    } else if (q.type === 'truefalse') {
      correctTxt = q.answer ? 'Đúng' : 'Sai';
    } else {
      correctTxt = richInline(q.answers[0]);
    }

    return `
      <div class="review-item ${d.ok ? 'ok' : 'no'}">
        <div class="rv-head">
          <span class="rv-icon ${d.ok ? 'ok' : 'no'}">${d.ok ? '✓' : '✕'}</span>
          <div class="rv-q"><b>Câu ${i + 1}.</b> <span class="rich">${rich(q.question)}</span></div>
        </div>
        <div class="rv-line ${d.ok ? '' : 'bad'}">Bạn trả lời: <span class="ans-given">${givenTxt}</span></div>
        ${d.ok ? '' : `<div class="rv-line good">Đáp án: <b>${correctTxt}</b></div>`}
        ${q.explain ? `<div class="rv-explain rich">💡 ${rich(q.explain)}</div>` : ''}
      </div>`;
  }).join('');

  applyMath($('reviewList'));
  
  // Logic bật nút Mở Cheatsheet
  const btnOpenCheat = $('btnOpenCheatsheet');
  if (btnOpenCheat) {
    btnOpenCheat.style.display = addedToCheat > 0 ? '' : 'none';
    btnOpenCheat.onclick = () => {
      playClick();
      window.open('cheatsheet.html', '_blank');
    };
  }

  if (addedToCheat > 0) {
    setTimeout(() => toast(`Đã lưu ${addedToCheat} câu vào Cheatsheet! 📘`, 'ok'), 1200);
  }

  const examSnapshot = exam;
  $('btnRedo').onclick = () => { playClick(); startExam(examSnapshot.id); };
  $('btnHome').onclick = () => { playClick(); showScreen('screen-home'); renderHome(); };
  $('btnRedo').style.display = exams.some(e => e.id === examSnapshot.id) ? '' : 'none';
  if (gained) setTimeout(() => toast(`🔥 Chuỗi tăng lên ${streak.count} ngày!`, 'ok'), 700);
}

/* =========================================================
   MINI GAMES
   ========================================================= */
function openGames() {
  showScreen('screen-games');
  renderGamesHub();
}
function renderGamesHub() {
  if (gameCleanup) { try { gameCleanup(); } catch(e){} gameCleanup = null; }
  $('gamesGrid').style.display = '';
  $('gameStage').innerHTML = '';
  $('gamesGrid').innerHTML = `
    <div class="game-card" data-game="memory">
      <div class="gc-emoji">🧠</div>
      <div class="gc-title">Trí nhớ</div>
      <div class="gc-desc">Lật thẻ tìm cặp giống nhau</div>
    </div>
    <div class="game-card" data-game="math">
      <div class="gc-emoji">⚡</div>
      <div class="gc-title">Toán nhanh</div>
      <div class="gc-desc">60 giây — giải toán tốc độ</div>
    </div>
    <div class="game-card" data-game="reaction">
      <div class="gc-emoji">🎯</div>
      <div class="gc-title">Phản xạ</div>
      <div class="gc-desc">Bấm khi đèn xanh bật</div>
    </div>
  `;
  $('gamesGrid').querySelectorAll('[data-game]').forEach(c => {
    c.onclick = () => { playClick(); launchGame(c.dataset.game); };
  });
}
function launchGame(name) {
  $('gamesGrid').style.display = 'none';
  if (name === 'memory') startMemory();
  else if (name === 'math') startMathSprint();
  else if (name === 'reaction') startReaction();
}

function startMemory() {
  const emojis = ['🍎','🍊','🍋','🍇','🍓','🍒','🍑','🥝'];
  const deck = [...emojis, ...emojis]
    .map(v => ({ v }))
    .sort(() => Math.random() - 0.5);

  let flipped = [];
  let matched = 0;
  let moves = 0;
  let lock = false;
  const startTime = Date.now();

  $('gameStage').innerHTML = `
    <div class="game-header">
      <div class="game-hud">
        <div><span class="gh-k">Lượt</span><span class="gh-v" id="memMoves">0</span></div>
        <div><span class="gh-k">Cặp</span><span class="gh-v" id="memMatched">0/8</span></div>
        <div><span class="gh-k">Thời gian</span><span class="gh-v" id="memTime">0:00</span></div>
      </div>
      <button class="btn sm" id="memReset">🔄 Chơi lại</button>
    </div>
    <div class="memory-grid" id="memGrid">
      ${deck.map((c, i) => `
        <button class="mem-card" data-i="${i}">
          <span class="mem-back">?</span>
          <span class="mem-front">${c.v}</span>
        </button>
      `).join('')}
    </div>
    <div id="memWin"></div>
  `;

  const grid = $('memGrid');
  const timerId = setInterval(() => {
    $('memTime').textContent = fmtTime(Date.now() - startTime);
  }, 500);

  grid.onclick = e => {
    const card = e.target.closest('.mem-card');
    if (!card || lock) return;
    const i = +card.dataset.i;
    if (card.classList.contains('done') || card.classList.contains('flipped')) return;

    playClick();
    card.classList.add('flipped');
    flipped.push({ card, i });

    if (flipped.length === 2) {
      moves++;
      $('memMoves').textContent = moves;
      const [a, b] = flipped;
      if (deck[a.i].v === deck[b.i].v) {
        a.card.classList.add('done');
        b.card.classList.add('done');
        matched++;
        $('memMatched').textContent = matched + '/8';
        flipped = [];
        if (matched === 8) {
          clearInterval(timerId);
          $('memWin').innerHTML = `<div class="win-msg">🎉 Hoàn thành! ${moves} lượt — ${fmtTime(Date.now() - startTime)}</div>`;
        }
      } else {
        lock = true;
        setTimeout(() => {
          a.card.classList.remove('flipped');
          b.card.classList.remove('flipped');
          flipped = [];
          lock = false;
        }, 700);
      }
    }
  };

  $('memReset').onclick = () => { clearInterval(timerId); startMemory(); };
  gameCleanup = () => clearInterval(timerId);
}

function startMathSprint() {
  let score = 0;
  let timeLeft = 60;
  let currStreak = 0;
  let running = false;
  let timerId = null;

  $('gameStage').innerHTML = `
    <div class="game-header">
      <div class="game-hud">
        <div><span class="gh-k">Điểm</span><span class="gh-v" id="msScore">0</span></div>
        <div><span class="gh-k">Còn lại</span><span class="gh-v" id="msTime">60</span></div>
        <div><span class="gh-k">Chuỗi đúng</span><span class="gh-v" id="msStreak">0</span></div>
      </div>
      <button class="btn sm" id="msBack">← Chọn game</button>
    </div>
    <div class="math-stage">
      <div class="math-q" id="msQ">Bấm Bắt đầu</div>
      <div class="math-opts" id="msOpts"></div>
    </div>
    <div style="text-align:center;margin-top:18px">
      <button class="btn primary" id="msStart">Bắt đầu</button>
    </div>
  `;

  $('msBack').onclick = () => { if (timerId) clearInterval(timerId); renderGamesHub(); };

  function newQuestion() {
    const ops = ['+', '-', '×'];
    const op = ops[Math.floor(Math.random() * ops.length)];
    let a, b, ans;
    if (op === '+') { a = rnd(1, 30); b = rnd(1, 30); ans = a + b; }
    else if (op === '-') { a = rnd(5, 30); b = rnd(1, a); ans = a - b; }
    else { a = rnd(2, 12); b = rnd(2, 12); ans = a * b; }

    const choices = new Set([ans]);
    let guard = 0;
    while (choices.size < 4 && guard++ < 50) {
      const fake = ans + rnd(-4, 4);
      if (fake !== ans && fake >= 0) choices.add(fake);
    }
    while (choices.size < 4) choices.add(ans + choices.size + 1);
    const arr = [...choices].sort(() => Math.random() - 0.5);

    $('msQ').textContent = `${a} ${op} ${b} = ?`;
    $('msOpts').innerHTML = arr.map(v => `<button class="math-opt" data-v="${v}">${v}</button>`).join('');
    $('msOpts').querySelectorAll('[data-v]').forEach(b => {
      b.onclick = () => {
        if (!running) return;
        playClick();
        if (+b.dataset.v === ans) {
          score++; currStreak++;
          $('msScore').textContent = score;
          $('msStreak').textContent = currStreak;
          newQuestion();
        } else {
          currStreak = 0;
          $('msStreak').textContent = 0;
          b.classList.add('wrong');
          setTimeout(() => b.classList.remove('wrong'), 400);
        }
      };
    });
  }

  $('msStart').onclick = () => {
    if (running) return;
    playClick();
    score = 0; timeLeft = 60; currStreak = 0; running = true;
    $('msScore').textContent = 0;
    $('msStreak').textContent = 0;
    $('msTime').textContent = 60;
    $('msStart').textContent = 'Đang chơi...';
    $('msStart').disabled = true;
    newQuestion();
    timerId = setInterval(() => {
      timeLeft--;
      $('msTime').textContent = timeLeft;
      if (timeLeft <= 0) {
        clearInterval(timerId); timerId = null;
        running = false;
        $('msQ').textContent = `⏱ Hết giờ! Điểm: ${score}`;
        $('msOpts').innerHTML = '';
        $('msStart').textContent = 'Chơi lại';
        $('msStart').disabled = false;
      }
    }, 1000);
  };

  gameCleanup = () => { if (timerId) clearInterval(timerId); };
}

function startReaction() {
  let state = 'idle';
  let timeoutId = null;
  let startAt = 0;
  const results = [];

  $('gameStage').innerHTML = `
    <div class="game-header">
      <div class="game-hud">
        <div><span class="gh-k">Lần thử</span><span class="gh-v" id="rtTry">0</span></div>
        <div><span class="gh-k">Nhanh nhất</span><span class="gh-v" id="rtBest">—</span></div>
        <div><span class="gh-k">Trung bình</span><span class="gh-v" id="rtAvg">—</span></div>
      </div>
      <button class="btn sm" id="rtBack">← Chọn game</button>
    </div>
    <div class="react-box" id="rtBox">
      <div class="react-inner" id="rtInner">
        <div class="react-icon">🎯</div>
        <div class="react-text">Bấm để bắt đầu</div>
      </div>
    </div>
  `;

  $('rtBack').onclick = () => { if (timeoutId) clearTimeout(timeoutId); renderGamesHub(); };

  const box = $('rtBox');
  const inner = $('rtInner');

  function setState(s, html, color) {
    state = s;
    inner.innerHTML = html;
    box.className = 'react-box ' + (color || '');
  }

  box.onclick = () => {
    if (state === 'idle' || state === 'done') {
      setState('waiting', '<div class="react-icon">⏳</div><div class="react-text">Chờ đèn xanh...</div>', 'waiting');
      const delay = rnd(1500, 4500);
      timeoutId = setTimeout(() => {
        startAt = performance.now();
        setState('ready', '<div class="react-icon">⚡</div><div class="react-text">BẤM NGAY!</div>', 'ready');
      }, delay);
    } else if (state === 'waiting') {
      clearTimeout(timeoutId);
      setState('done', '<div class="react-icon">😅</div><div class="react-text">Bấm sớm quá! Bấm để thử lại</div>', 'early');
    } else if (state === 'ready') {
      const ms = Math.round(performance.now() - startAt);
      results.push(ms);
      const best = Math.min(...results);
      const avg = Math.round(results.reduce((a, b) => a + b, 0) / results.length);
      $('rtTry').textContent = results.length;
      $('rtBest').textContent = best + 'ms';
      $('rtAvg').textContent = avg + 'ms';
      const rank = ms < 200 ? '🚀 Siêu nhanh!' : ms < 300 ? '🔥 Rất tốt!' : ms < 450 ? '👍 Khá ổn' : '🐢 Cần luyện thêm';
      setState('done',
        `<div class="react-icon">⚡</div><div class="react-text">${ms}ms</div><div class="react-rank">${rank}</div>`,
        'done');
    }
  };

  gameCleanup = () => { if (timeoutId) clearTimeout(timeoutId); };
}

/* =========================================================
   EVENT BINDING
   ========================================================= */
function bindMainEvents() {
  $('examList').addEventListener('click', e => {
    const item = e.target.closest('.exam-item');
    if (!item) return;
    const act = e.target.closest('[data-act]');
    if (!act) return;
    const id = item.dataset.id;

    if (act.dataset.act === 'start') {
      playClick();
      startExam(id);
      return;
    }
    if (act.dataset.act === 'edit') {
      playClick();
      openEdit(id);
      return;
    }
    if (act.dataset.act === 'del') {
      playClick();
      showConfirm({
        icon: '🗑️',
        iconClass: 'warn',
        title: 'Xoá đề thi?',
        desc: 'Hành động này <b>không thể hoàn tác</b>.<br>Bạn có chắc muốn xoá không?',
        cancelText: 'Giữ lại',
        okText: 'Xoá',
        okClass: 'danger-solid',
        onOk: () => {
          exams = exams.filter(x => x.id !== id);
          store.set(K.exams, exams);
          renderHome();
          toast('Đã xoá đề', 'ok');
        }
      });
    }
  });

  $('btnQuit').onclick = () => {
    playClick();
    showConfirm({
      icon: '⚠️',
      iconClass: 'warn',
      title: 'Thoát bài thi?',
      desc: 'Tiến độ hiện tại <b>sẽ không được lưu</b>.<br>Bạn có chắc muốn thoát không?',
      cancelText: 'Ở lại',
      okText: 'Thoát',
      okClass: 'danger-solid',
      onOk: () => {
        clearInterval(session.timerId);
        session = null;
        showScreen('screen-home');
        renderHome();
      }
    });
  };

  $('btnSubmit').onclick = () => {
    playClick();
    const total = session.exam.questions.length;
    const unanswered = session.answers.filter((a, i) => {
      const q = session.exam.questions[i];
      if (q.type === 'truefalse' && Array.isArray(q.statements)) {
        return !Array.isArray(a) || a.length !== q.statements.length
               || a.some(x => x === null || x === undefined);
      }
      return a === null || a === undefined ||
             (q.type === 'short' && String(a).trim() === '');
    }).length;
    const done = total - unanswered;

    if (unanswered > 0) {
      showConfirm({
        icon: '⚠️',
        iconClass: 'warn',
        title: 'Còn câu chưa trả lời',
        desc: `Bạn còn <b>${unanswered}/${total}</b> câu chưa trả lời.<br>Vẫn muốn nộp bài?`,
        cancelText: 'Kiểm tra lại',
        okText: 'Vẫn nộp',
        okClass: 'danger-solid',
        onOk: () => submitExam(false)
      });
    } else {
      showConfirm({
        icon: '✓',
        iconClass: 'ok',
        title: 'Nộp bài?',
        desc: `Bạn đã hoàn thành <b>${done}/${total}</b> câu.<br>Nộp bài và xem kết quả?`,
        cancelText: 'Xem lại',
        okText: 'Nộp bài',
        okClass: 'primary',
        onOk: () => submitExam(false)
      });
    }
  };

  $('btnPrev').onclick = () => {
    if (session.index > 0) { playClick(); session.index--; renderQuestion(); }
  };
  $('btnNext').onclick = () => {
    if (session.index < session.exam.questions.length - 1) { playClick(); session.index++; renderQuestion(); }
  };

  $('confirmModal').addEventListener('click', e => {
    if (e.target.id === 'confirmModal') closeModal('confirmModal');
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeModal('confirmModal');
      closeModal('modalImport');
    }
  });

  $('btnGames').onclick = () => { playClick(); openGames(); };
  $('btnBackHome').onclick = () => {
    playClick();
    if (gameCleanup) { try { gameCleanup(); } catch(e){} gameCleanup = null; }
    showScreen('screen-home');
    renderHome();
  };

  window.addEventListener('beforeunload', e => {
    if (session) { e.preventDefault(); e.returnValue = ''; }
  });
}

/* =========================================================
   DANGER ZONE
   ========================================================= */
function threeStepConfirm(title, steps, onFinal) {
  function step(i) {
    if (i >= steps.length) { onFinal(); return; }
    const s = steps[i];
    showConfirm({
      icon: i === 0 ? '⚠️' : i === 1 ? '🚨' : '💀',
      iconClass: 'warn',
      title: `Cảnh báo ${i + 1}/3: ${title}`,
      desc: s.desc,
      cancelText: i === 0 ? 'Huỷ' : 'Dừng lại',
      okText: s.okText,
      okClass: 'danger-solid',
      onOk: () => step(i + 1)
    });
  }
  step(0);
}

function bindDangerZone() {
  const bHist = $('btnResetHistory');
  if (bHist) bHist.onclick = () => {
    playClick();
    if (!history.length) { toast('Lịch sử đang trống', ''); return; }
    
    threeStepConfirm('Xoá Lịch sử làm bài', [
      { desc: 'Bạn sắp xoá <b>toàn bộ lịch sử làm bài</b>. Điểm trung bình và số câu đã luyện sẽ reset về 0. Bạn chắc chứ?', okText: 'Tiếp tục' },
      { desc: 'Dữ liệu lịch sử <b>không thể khôi phục</b>. Nếu chưa xuất file sao lưu, hãy dừng lại và làm việc đó trước.', okText: 'Tôi vẫn muốn xoá' },
      { desc: 'Đây là cảnh báo cuối cùng. Bấm <b>Xoá vĩnh viễn</b> để xác nhận xoá sạch lịch sử.', okText: 'Xoá vĩnh viễn' }
    ], () => {
      history = [];
      store.set(K.history, history);
      renderHome();
      toast('Đã xoá toàn bộ lịch sử', 'ok');
    });
  };

  const bAll = $('btnResetAll');
  if (bAll) bAll.onclick = () => {
    playClick();
    threeStepConfirm('Xoá TOÀN BỘ Dữ liệu', [
      { desc: 'Bạn sắp xoá <b>tất cả mọi thứ</b>: đề thi, lịch sử, chuỗi streak, chủ đề. Ứng dụng sẽ về trạng thái như mới cài. Bạn chắc chứ?', okText: 'Tiếp tục' },
      { desc: 'Hành động này <b>không thể khôi phục</b>. Hãy chắc chắn bạn đã bấm <b>Xuất dữ liệu</b> để sao lưu nếu cần.', okText: 'Tôi hiểu rõ hậu quả' },
      { desc: 'CẢNH BÁO CUỐI CÙNG: Toàn bộ dữ liệu sẽ bị xoá sạch khỏi trình duyệt. Bấm <b>Xoá vĩnh viễn</b> để đồng ý.', okText: 'Xoá vĩnh viễn' }
    ], () => {
      exams = [];
      history = [];
      streak = { count: 0, best: 0, last: 0 };
      theme = 'dark';
      
      store.set(K.exams, exams);
      store.set(K.history, history);
      store.set(K.streak, streak);
      store.set(K.theme, theme);
      
      applyTheme();
      const box = $('themes');
      if (box) box.querySelectorAll('.swatch').forEach(s => s.classList.toggle('on', s.dataset.theme === theme));
      
      renderHome();
      toast('Đã xoá toàn bộ dữ liệu. Ứng dụng đã reset.', 'ok');
    });
  };
}

/* =========================================================
   EDIT EXAM
   ========================================================= */
function openEdit(examId) {
  const ex = exams.find(e => e.id === examId);
  if (!ex) return;

  if (!$('editTitle') || !$('editQuestions')) {
    toast('Thiếu HTML màn hình Sửa đề (screen-edit)', 'err');
    console.error('[QuizPro] Không tìm thấy #editTitle hoặc #editQuestions. Hãy thêm HTML screen-edit vào index.html.');
    return;
  }

  editingExam = JSON.parse(JSON.stringify(ex));

  $('editTitle').value = editingExam.title || '';
  $('editSubject').value = editingExam.subject || '';
  $('editDuration').value = editingExam.duration || 0;
  $('editShuffleQ').checked = !!editingExam.shuffleQuestions;
  $('editShuffleO').checked = !!editingExam.shuffleOptions;

  showScreen('screen-edit');
  renderEditQuestions();
}
function createNewExam() {
  editingExam = {
    id: uid(),
    title: "Đề thi mới",
    subject: "",
    duration: 0,
    shuffleQuestions: false,
    shuffleOptions: false,
    questions: []
  };

  $('editTitle').value = editingExam.title;
  $('editSubject').value = '';
  $('editDuration').value = 0;
  $('editShuffleQ').checked = false;
  $('editShuffleO').checked = false;

  showScreen('screen-edit');
  renderEditQuestions();

  setTimeout(() => {
    const btnAdd = document.querySelector('.edit-add-bar [data-add="mcq"]');
    if (btnAdd) btnAdd.click();
    
    const titleInput = $('editTitle');
    if (titleInput) {
      titleInput.focus();
      titleInput.select();
    }
  }, 80);
}

function renderEditQuestions() {
  const box = $('editQuestions');
  if (!editingExam || !editingExam.questions.length) {
    box.innerHTML = `<div style="padding:24px;text-align:center;color:var(--muted)">
      Chưa có câu hỏi. Bấm nút ＋ bên dưới để thêm câu đầu tiên.
    </div>`;
    return;
  }
  box.innerHTML = editingExam.questions.map((q, qi) => renderEditQ(q, qi)).join('');
}

function renderEditQ(q, qi) {
  const TYPE_LABEL = { mcq: 'Trắc nghiệm', truefalse: 'Đúng / Sai', short: 'Trả lời ngắn' };
  let body = '';

  if (q.type === 'mcq') {
    body = `
      <div class="edit-opts">
        ${q.options.map((opt, oi) => `
          <div class="edit-opt">
            <input type="radio" name="ans_${qi}" ${q.answer === oi ? 'checked' : ''} data-ans="${oi}" title="Đáp án đúng">
            <input type="text" value="${esc(opt)}" data-opt="${oi}" placeholder="Đáp án ${String.fromCharCode(65 + oi)}">
            <button class="btn sm danger btn-del" data-del-opt="${oi}" ${q.options.length <= 2 ? 'disabled' : ''}>✕</button>
          </div>
        `).join('')}
        <button class="btn sm" data-add-opt>＋ Thêm đáp án</button>
      </div>`;
  } else if (q.type === 'truefalse' && Array.isArray(q.statements)) {
    body = `
      <div class="edit-stmts">
        ${q.statements.map((s, si) => `
          <div class="edit-stmt">
            <input type="text" value="${esc(s.text)}" data-stmt="${si}" placeholder="Ý ${String.fromCharCode(97 + si)})">
            <div class="tf-toggle">
              <button class="${s.answer === true ? 'on ok' : ''}" data-stmt-ans="${si}" data-val="1">Đ</button>
              <button class="${s.answer === false ? 'on no' : ''}" data-stmt-ans="${si}" data-val="0">S</button>
            </div>
            <button class="btn sm danger btn-del" data-del-stmt="${si}" ${q.statements.length <= 1 ? 'disabled' : ''}>✕</button>
          </div>
        `).join('')}
        <button class="btn sm" data-add-stmt>＋ Thêm ý</button>
        <label class="check" style="margin-top:6px;font-size:12.5px;display:flex;align-items:center;gap:8px">
          <input type="checkbox" data-allornothing ${q.allOrNothing ? 'checked' : ''}>
          Tất cả hoặc không (sai 1 ý = 0 điểm cả câu)
        </label>
      </div>`;
  } else if (q.type === 'truefalse') {
    body = `
      <div class="edit-legacy-tf">
        ⚠️ Câu Đ/S dạng cũ (1 đáp án cho cả câu).
        <div style="margin-top:8px;display:flex;gap:8px;align-items:center">
          <button class="btn sm ${q.answer === true ? 'primary' : ''}" data-legacy-ans="1">Đúng</button>
          <button class="btn sm ${q.answer === false ? 'primary' : ''}" data-legacy-ans="0">Sai</button>
          <button class="btn sm" data-convert-tf>🔁 Chuyển thành đa phát biểu</button>
        </div>
      </div>`;
  } else if (q.type === 'short') {
    body = `
      <div style="margin-top:10px">
        <label style="font-size:12px;color:var(--muted);display:block;margin-bottom:5px">
          Đáp án được chấp nhận (mỗi dòng 1)
        </label>
        <textarea class="q-input" data-answers spellcheck="false" placeholder="3&#10;ba">${esc((q.answers || []).join('\n'))}</textarea>
        <label class="check" style="margin-top:8px;font-size:12.5px;display:flex;align-items:center;gap:8px">
          <input type="checkbox" data-strict ${q.strict ? 'checked' : ''}>
          So khớp chính xác (phân biệt hoa/thường)
        </label>
      </div>`;
  }

  return `
    <div class="edit-q" data-q="${qi}">
      <div class="edit-q-head">
        <span class="eq-num">Câu ${qi + 1}</span>
        <span class="eq-type">${TYPE_LABEL[q.type] || q.type}</span>
        <div class="eq-actions">
          <button class="btn sm" data-move-up="${qi}" ${qi === 0 ? 'disabled' : ''} title="Lên">↑</button>
          <button class="btn sm" data-move-down="${qi}" ${qi === editingExam.questions.length - 1 ? 'disabled' : ''} title="Xuống">↓</button>
          <button class="btn sm danger" data-del-q="${qi}">Xoá</button>
        </div>
      </div>
      <textarea class="q-input" data-qtext spellcheck="false" placeholder="Câu hỏi (Markdown + LaTeX)">${esc(q.question)}</textarea>
      ${body}
      <div class="edit-explain">
        <label>Giải thích (tuỳ chọn)</label>
        <textarea class="q-input" data-explain spellcheck="false" placeholder="Giải thích đáp án...">${esc(q.explain || '')}</textarea>
      </div>
    </div>`;
}

function bindEditEvents() {
  if (!$('editSave') || !$('editQuestions')) {
    console.warn('[QuizPro] Không tìm thấy #editSave / #editQuestions — bỏ qua bind sửa đề.');
    return;
  }

  $('editCancel').onclick = () => {
    showConfirm({
      icon: '⚠️', iconClass: 'warn',
      title: 'Huỷ chỉnh sửa?',
      desc: 'Các thay đổi chưa lưu sẽ <b>mất</b>.',
      cancelText: 'Ở lại',
      okText: 'Huỷ bỏ',
      okClass: 'danger-solid',
      onOk: () => {
        editingExam = null;
        showScreen('screen-home');
        renderHome();
      }
    });
  };

  $('editSave').onclick = saveEdit;

  $('editTitle').oninput    = e => { if (editingExam) editingExam.title = e.target.value; };
  $('editSubject').oninput  = e => { if (editingExam) editingExam.subject = e.target.value; };
  $('editDuration').oninput = e => { if (editingExam) editingExam.duration = Math.max(0, Number(e.target.value) || 0); };
  $('editShuffleQ').onchange = e => { if (editingExam) editingExam.shuffleQuestions = e.target.checked; };
  $('editShuffleO').onchange = e => { if (editingExam) editingExam.shuffleOptions = e.target.checked; };

  const box = $('editQuestions');

  box.addEventListener('input', e => {
    const qEl = e.target.closest('[data-q]');
    if (!qEl || !editingExam) return;
    const qi = +qEl.dataset.q;
    const q = editingExam.questions[qi];
    if (!q) return;

    if (e.target.matches('[data-qtext]'))      q.question = e.target.value;
    else if (e.target.matches('[data-explain]')) q.explain = e.target.value;
    else if (e.target.matches('[data-opt]'))   q.options[+e.target.dataset.opt] = e.target.value;
    else if (e.target.matches('[data-stmt]'))  q.statements[+e.target.dataset.stmt].text = e.target.value;
    else if (e.target.matches('[data-answers]')) {
      q.answers = e.target.value.split('\n').map(s => s.trim()).filter(Boolean);
    }
  });

  box.addEventListener('change', e => {
    const qEl = e.target.closest('[data-q]');
    if (!qEl || !editingExam) return;
    const qi = +qEl.dataset.q;
    const q = editingExam.questions[qi];
    if (!q) return;

    if (e.target.matches('[data-ans]'))            q.answer = +e.target.dataset.ans;
    else if (e.target.matches('[data-strict]'))    q.strict = e.target.checked;
    else if (e.target.matches('[data-allornothing]')) q.allOrNothing = e.target.checked;
  });

  box.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn || !editingExam) return;
    const qEl = btn.closest('[data-q]');
    const qi = qEl ? +qEl.dataset.q : -1;
    const q = qi >= 0 ? editingExam.questions[qi] : null;

    if (btn.matches('[data-del-q]')) {
      showConfirm({
        icon: '🗑️', iconClass: 'warn',
        title: `Xoá câu ${qi + 1}?`,
        desc: 'Không thể hoàn tác.',
        okText: 'Xoá', okClass: 'danger-solid',
        onOk: () => { editingExam.questions.splice(qi, 1); renderEditQuestions(); }
      });
      return;
    }
    if (btn.matches('[data-move-up]') && qi > 0) {
      [editingExam.questions[qi - 1], editingExam.questions[qi]] = [editingExam.questions[qi], editingExam.questions[qi - 1]];
      renderEditQuestions();
      return;
    }
    if (btn.matches('[data-move-down]') && qi < editingExam.questions.length - 1) {
      [editingExam.questions[qi], editingExam.questions[qi + 1]] = [editingExam.questions[qi + 1], editingExam.questions[qi]];
      renderEditQuestions();
      return;
    }
    if (btn.matches('[data-add-opt]') && q) {
      q.options.push('');
      renderEditQuestions();
      return;
    }
    if (btn.matches('[data-del-opt]') && q) {
      if (btn.disabled || q.options.length <= 2) return;
      const oi = +btn.dataset.delOpt;
      q.options.splice(oi, 1);
      if (q.answer === oi) q.answer = 0;
      else if (q.answer > oi) q.answer--;
      if (q.answer >= q.options.length) q.answer = q.options.length - 1;
      renderEditQuestions();
      return;
    }
    if (btn.matches('[data-add-stmt]') && q) {
      q.statements.push({ text: '', answer: true });
      renderEditQuestions();
      return;
    }
    if (btn.matches('[data-del-stmt]') && q) {
      if (btn.disabled || q.statements.length <= 1) return;
      q.statements.splice(+btn.dataset.delStmt, 1);
      renderEditQuestions();
      return;
    }
    if (btn.matches('[data-stmt-ans]') && q) {
      q.statements[+btn.dataset.stmtAns].answer = btn.dataset.val === '1';
      renderEditQuestions();
      return;
    }
    if (btn.matches('[data-legacy-ans]') && q) {
      q.answer = btn.dataset.legacyAns === '1';
      renderEditQuestions();
      return;
    }
    if (btn.matches('[data-convert-tf]') && q) {
      editingExam.questions[qi] = {
        type: 'truefalse',
        question: q.question,
        explain: q.explain || '',
        allOrNothing: false,
        statements: [
          { text: q.question, answer: q.answer === true }
        ]
      };
      renderEditQuestions();
      toast('Đã chuyển — nhớ sửa lại các ý', 'ok');
      return;
    }
  });

  document.querySelectorAll('.edit-add-bar [data-add]').forEach(b => {
    b.onclick = () => {
      if (!editingExam) return;
      playClick();
      const type = b.dataset.add;
      if (type === 'mcq') {
        editingExam.questions.push({
          type: 'mcq', question: '', explain: '',
          options: ['', '', '', ''], answer: 0
        });
      } else if (type === 'truefalse') {
        editingExam.questions.push({
          type: 'truefalse', question: '', explain: '', allOrNothing: false,
          statements: [{ text: '', answer: true }, { text: '', answer: false }]
        });
      } else if (type === 'short') {
        editingExam.questions.push({
          type: 'short', question: '', explain: '', strict: false,
          answers: ['']
        });
      }
      renderEditQuestions();
      setTimeout(() => {
        const last = $('editQuestions').lastElementChild;
        if (last) last.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const ta = last?.querySelector('[data-qtext]');
        if (ta) ta.focus();
      }, 60);
    };
  });
}

function saveEdit() {
  if (!editingExam) return;

  if (!String(editingExam.title || '').trim()) {
    toast('Chưa nhập tiêu đề', 'err'); return;
  }
  if (!editingExam.questions.length) {
    toast('Cần ít nhất 1 câu hỏi', 'err'); return;
  }

  const cleanQs = [];
  for (let i = 0; i < editingExam.questions.length; i++) {
    const q = editingExam.questions[i];
    const qText = String(q.question || '').trim();
    if (!qText) { toast(`Câu ${i + 1}: chưa nhập câu hỏi`, 'err'); return; }

    if (q.type === 'mcq') {
      const opts = q.options.map(s => String(s).trim());
      if (opts.length < 2) { toast(`Câu ${i + 1}: cần ≥ 2 đáp án`, 'err'); return; }
      if (opts.some(o => !o)) { toast(`Câu ${i + 1}: có đáp án trống`, 'err'); return; }
      if (q.answer < 0 || q.answer >= opts.length) {
        toast(`Câu ${i + 1}: chưa chọn đáp án đúng`, 'err'); return;
      }
      cleanQs.push({
        type: 'mcq', question: qText, options: opts,
        answer: q.answer, explain: q.explain || ''
      });
    } else if (q.type === 'truefalse' && Array.isArray(q.statements)) {
      const stmts = q.statements
        .map(s => ({ text: String(s.text || '').trim(), answer: !!s.answer }))
        .filter(s => s.text);
      if (!stmts.length) { toast(`Câu ${i + 1}: cần ít nhất 1 ý có nội dung`, 'err'); return; }
      cleanQs.push({
        type: 'truefalse', question: qText, statements: stmts,
        allOrNothing: !!q.allOrNothing, explain: q.explain || ''
      });
    } else if (q.type === 'truefalse') {
      cleanQs.push({
        type: 'truefalse', question: qText,
        answer: !!q.answer, explain: q.explain || ''
      });
    } else if (q.type === 'short') {
      const answers = (q.answers || []).map(s => String(s).trim()).filter(Boolean);
      if (!answers.length) { toast(`Câu ${i + 1}: cần ít nhất 1 đáp án`, 'err'); return; }
      cleanQs.push({
        type: 'short', question: qText, answers,
        strict: !!q.strict, explain: q.explain || ''
      });
    }
  }

  editingExam.questions = cleanQs;
  editingExam.title = editingExam.title.trim();
  editingExam.subject = (editingExam.subject || '').trim();

  const idx = exams.findIndex(e => e.id === editingExam.id);
  if (idx >= 0) exams[idx] = editingExam;
  else exams.push(editingExam);

  store.set(K.exams, exams);
  toast('Đã lưu đề ✓', 'ok');
  editingExam = null;
  showScreen('screen-home');
  renderHome();
}

/* =========================================================
   INIT
   ========================================================= */
function init() {
  applyTheme();
  initThemes();
  renderHome();
  bindMainEvents();
  bindImportEvents();
  bindImportActions();
  bindEditEvents();
  bindDangerZone();  

  registerServiceWorker();

  setInterval(() => {
    if ($('screen-home').classList.contains('active')) renderStreak();
  }, 1000);

  if (typeof marked === 'undefined') console.warn('[QuizPro] marked chưa load — Markdown sẽ không hiển thị đúng.');
  if (!window.renderMathInElement) console.warn('[QuizPro] KaTeX auto-render chưa load — LaTeX sẽ không hiển thị.');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

/* =========================================================
   PWA — Service Worker
   ========================================================= */
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    console.warn('[PWA] Trình duyệt không hỗ trợ Service Worker');
    return;
  }

  navigator.serviceWorker.register('./sw.js', { scope: './' })
    .then(reg => {
      console.log('[PWA] Đã đăng ký Service Worker:', reg.scope);

      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            showConfirm({
              icon: '🎉',
              iconClass: 'info',
              title: 'Có bản cập nhật!',
              desc: 'Ứng dụng đã có phiên bản mới. Tải lại để cập nhật?',
              cancelText: 'Để sau',
              okText: 'Tải lại',
              okClass: 'primary',
              onOk: () => {
                newWorker.postMessage('SKIP_WAITING');
                setTimeout(() => location.reload(), 300);
              }
            });
          }
        });
      });
    })
    .catch(err => console.warn('[PWA] Đăng ký thất bại:', err));

  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    location.reload();
  });
}