/* ================= 基础工具 ================= */
const $ = sel => document.querySelector(sel);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const parseISO = s => new Date(s + 'T00:00:00');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (s, n) => { const d = parseISO(s); d.setDate(d.getDate() + n); return iso(d); };
const weekStartOf = s => { const d = parseISO(s); const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow); return iso(d); };
const monthOf = s => s.slice(0, 7);
const DOW = ['日', '一', '二', '三', '四', '五', '六'];
const fmtMD = s => { const d = parseISO(s); return `${d.getMonth() + 1}月${d.getDate()}日`; };
const fmtFull = s => { const d = parseISO(s); return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 周${DOW[d.getDay()]}`; };
const fmtMonth = m => { const [y, mm] = m.split('-'); return `${y}年${Number(mm)}月`; };
const weekNo = s => { const d = parseISO(s); d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7)); const w1 = new Date(d.getFullYear(), 0, 4); return 1 + Math.round(((d - w1) / 86400000 - 3 + ((w1.getDay() + 6) % 7)) / 7); };
const weekLabel = ws => `${fmtMD(ws)} – ${fmtMD(addDays(ws, 6))}`;
const uid = p => p + Math.random().toString(36).slice(2, 7);
const pct = (a, b) => b ? Math.min(100, Math.round(a / b * 100)) : 0;
const daysInMonth = m => { const [y, mm] = m.split('-').map(Number); return new Date(y, mm, 0).getDate(); };

const TODAY = DEMO_TODAY;
const THIS_WEEK = weekStartOf(TODAY);
const THIS_MONTH = monthOf(TODAY);

/* ================= 查询 ================= */
const areaById = id => DATA.areas.find(a => a.id === id);
const goalById = id => DATA.goals.find(g => g.id === id);
const childrenOf = id => DATA.goals.filter(g => g.parentId === id);
const tasksOfGoal = id => DATA.tasks.filter(t => t.goalId === id);
const tasksOfWeek = ws => DATA.tasks.filter(t => t.weekStart === ws);
const weekGoalsOf = ws => DATA.goals.filter(g => g.level === 'week' && g.start === ws);
const monthGoalsOf = m => DATA.goals.filter(g => g.level === 'month' && monthOf(g.start) === m);
const habitDone = (hid, day) => !!DATA.habitLogs[hid + '|' + day];
const weeklyReviewOf = ws => DATA.weeklyReviews.find(r => r.weekStart === ws);
const monthlyReviewOf = m => DATA.monthlyReviews.find(r => r.month === m);
const isWeekLocked = ws => weeklyReviewOf(ws)?.status === 'submitted';
const activeHabits = () => DATA.habits.filter(h => h.active);
const descendants = id => childrenOf(id).flatMap(c => [c, ...descendants(c.id)]);

function habitWeekCount(h, ws) { let n = 0; for (let i = 0; i < 7; i++) if (habitDone(h.id, addDays(ws, i))) n++; return n; }
function habitWeekRate(h, ws) { return pct(habitWeekCount(h, ws), h.target); }
function habitStreak(h) {
  if (h.freqType === 'daily') {
    let d = habitDone(h.id, TODAY) ? TODAY : addDays(TODAY, -1), n = 0;
    while (habitDone(h.id, d)) { n++; d = addDays(d, -1); }
    return { n, unit: '天' };
  }
  let ws = habitWeekCount(h, THIS_WEEK) >= h.target ? THIS_WEEK : addDays(THIS_WEEK, -7), n = 0;
  while (habitWeekCount(h, ws) >= h.target) { n++; ws = addDays(ws, -7); }
  return { n, unit: '周' };
}
function habitMonthRate(h, m) {
  const end = m === THIS_MONTH ? Number(TODAY.slice(8)) : daysInMonth(m);
  let done = 0;
  for (let d = 1; d <= end; d++) if (habitDone(h.id, `${m}-${pad(d)}`)) done++;
  const expected = h.freqType === 'daily' ? end : Math.max(1, Math.round(end / 7 * h.target));
  return pct(done, expected);
}
function weekSnapshot(ws) {
  const tasks = tasksOfWeek(ws);
  const todo = tasks.filter(t => t.status === 'todo').sort((a, b) => b.carried - a.carried);
  return {
    taskTotal: tasks.length,
    taskDone: tasks.filter(t => t.status === 'done').length,
    mostCarried: todo[0] && todo[0].carried > 0 ? todo[0] : null,
    unlinked: tasks.filter(t => !t.goalId).length,
    habits: activeHabits().map(h => [h.title, habitWeekRate(h, ws)]),
    goals: weekGoalsOf(ws).map(g => ({ title: g.title, status: g.status, progress: g.progress, color: areaById(g.areaId).color })),
  };
}
function pendingReviews() {
  const list = [];
  for (let i = 1; i <= 4; i++) {
    const ws = addDays(THIS_WEEK, -7 * i);
    const r = weeklyReviewOf(ws);
    if (!r || r.status === 'draft') list.push({ type: 'weekly', key: ws, draft: r?.status === 'draft' });
  }
  const [y, m] = THIS_MONTH.split('-').map(Number);
  const prevMonth = `${m === 1 ? y - 1 : y}-${pad(m === 1 ? 12 : m - 1)}`;
  const mr = monthlyReviewOf(prevMonth);
  if (!mr || mr.status === 'draft') list.push({ type: 'monthly', key: prevMonth, draft: mr?.status === 'draft' });
  return list;
}

/* ================= 状态 ================= */
const state = {
  goalYear: 2026,
  goalArea: '',
  goalStatuses: new Set(['active', 'paused']),
  expanded: new Set(DATA.goals.map(g => g.id)),
  selectedGoal: null,
  weekOffset: 0,
  reviewTab: 'pending',
  reviewStep: 1,
  onboard: { step: 0, data: {} },
};

/* ================= 通用组件 ================= */
function toast(msg) {
  const el = document.createElement('div'); el.className = 'toast'; el.textContent = msg;
  $('#toast-root').appendChild(el);
  setTimeout(() => el.classList.add('leaving'), 2000);
  setTimeout(() => el.remove(), 2400);
}
function openModal(html) { $('#modal-root').innerHTML = `<div class="modal-mask" data-action="modal-mask"><div class="modal">${html}</div></div>`; }
function closeModal() { $('#modal-root').innerHTML = ''; }
function confirmModal(title, body, okLabel, onOk, danger) {
  pendingConfirm = onOk;
  openModal(`<h3>${esc(title)}</h3><div class="muted">${body}</div>
    <div class="modal-foot"><button class="btn" data-action="modal-close">取消</button>
    <button class="btn ${danger ? 'danger' : 'primary'}" data-action="confirm-ok">${esc(okLabel)}</button></div>`);
}
let pendingConfirm = null;

const statusTag = s => `<span class="tag ${s}">${STATUS_LABEL[s]}</span>`;
const levelTag = l => `<span class="tag level">${LEVEL_LABEL[l]}</span>`;
const progressBar = (p, thin) => `<div class="progress ${thin ? 'thin' : ''}"><div style="width:${p}%"></div></div>`;
const checkbox = (on, action, data, disabled) => `<span class="checkbox ${on ? 'on' : ''} ${disabled ? 'disabled' : ''}" ${disabled ? '' : `data-action="${action}" ${data}`}></span>`;
const areaSelect = (id, selected, allowEmpty) => `<select id="${id}">${allowEmpty ? '<option value="">全部维度</option>' : ''}${DATA.areas.map(a => `<option value="${a.id}" ${a.id === selected ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select>`;

function radarSVG(areas, size) {
  const cx = size / 2, cy = size / 2, r = size / 2 - 40, n = areas.length;
  const pt = (i, v) => { const a = -Math.PI / 2 + i * 2 * Math.PI / n; return [cx + Math.cos(a) * r * v / 10, cy + Math.sin(a) * r * v / 10]; };
  const poly = v => areas.map((_, i) => pt(i, v).join(',')).join(' ');
  const rings = [2, 4, 6, 8, 10].map(v => `<polygon class="ring" points="${poly(v)}"/>`).join('');
  const axes = areas.map((_, i) => { const [x, y] = pt(i, 10); return `<line class="axis" x1="${cx}" y1="${cy}" x2="${x}" y2="${y}"/>`; }).join('');
  const labels = areas.map((a, i) => { const [x, y] = pt(i, 12.6); return `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle">${esc(a.name)} ${a.score ?? '-'}</text>`; }).join('');
  const data = `<polygon class="data" points="${areas.map((a, i) => pt(i, a.score ?? 0).join(',')).join(' ')}"/>`;
  const pts = areas.map((a, i) => { const [x, y] = pt(i, a.score ?? 0); return `<circle class="pt" cx="${x}" cy="${y}" r="3"/>`; }).join('');
  return `<svg class="radar" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${rings}${axes}${data}${pts}${labels}</svg>`;
}
function lineSVG(points, w, h) {
  if (!points.length) return '';
  const padL = 28, padB = 22, padT = 10, padR = 30;
  const iw = w - padL - padR, ih = h - padT - padB;
  const x = i => padL + (points.length === 1 ? iw / 2 : i * iw / (points.length - 1));
  const y = v => padT + ih - (v - 1) / 9 * ih;
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.v)}`).join(' ');
  return `<svg class="line" width="${w}" height="${h}">
    <line class="axis" x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + ih}"/>
    <line class="axis" x1="${padL}" y1="${padT + ih}" x2="${w - padR}" y2="${padT + ih}"/>
    <text x="${padL - 6}" y="${y(10)}" text-anchor="end" dominant-baseline="middle">10</text>
    <text x="${padL - 6}" y="${y(1)}" text-anchor="end" dominant-baseline="middle">1</text>
    <path class="path" d="${path}"/>
    ${points.map((p, i) => `<circle class="pt" cx="${x(i)}" cy="${y(p.v)}" r="3"/><text x="${x(i)}" y="${h - 6}" text-anchor="middle">${esc(p.label)}</text>`).join('')}
  </svg>`;
}

/* ================= 路由 ================= */
function route() { const parts = (location.hash || '#/home').slice(2).split('/'); return { name: parts[0] || 'home', args: parts.slice(1) }; }
function go(hash) { location.hash = hash; }

let lastRenderedHash = null;
let pulseSelector = null;
let enterTimer = null;

function render() {
  const r = route();
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('active', a.dataset.route === r.name));
  $('#demo-date').textContent = fmtFull(TODAY);
  const pages = { home: pageHome, areas: pageAreas, goals: pageGoals, week: pageWeek, habits: pageHabits, reviews: pageReviews, settings: pageSettings, onboarding: pageOnboarding };
  const view = $('#view');
  view.innerHTML = (pages[r.name] || pageHome)(r.args);
  const isNav = location.hash !== lastRenderedHash;
  lastRenderedHash = location.hash;
  if (isNav) animateEnter(view);
  if (pulseSelector) { document.querySelectorAll(pulseSelector).forEach(el => el.classList.add('pulse')); pulseSelector = null; }
  renderDrawer();
}

/* 进场动效：只在切换页面时播放，局部刷新（勾任务、打卡）不重播 */
function animateEnter(view) {
  view.classList.remove('enter');
  void view.offsetWidth;
  view.classList.add('enter');
  const blocks = [...view.querySelectorAll('.card, .banner, .area-card, .steps, .onboard')].filter(el => !el.parentElement.closest('.card'));
  blocks.forEach((el, i) => { el.style.setProperty('--d', `${Math.min(i, 9) * 50}ms`); el.classList.add('block'); });
  view.querySelectorAll('.heat .cell').forEach((el, i) => el.style.setProperty('--d', `${i * 10}ms`));
  clearTimeout(enterTimer);
  enterTimer = setTimeout(() => view.classList.remove('enter'), 1400);
}
function pulse(selector) { pulseSelector = selector; }

/* ================= 页面：首页 ================= */
function pageHome() {
  const focus = DATA.tasks.filter(t => t.weekStart === THIS_WEEK && t.focus && t.date === TODAY);
  const weekTasks = tasksOfWeek(THIS_WEEK);
  const weekGoals = weekGoalsOf(THIS_WEEK).filter(g => g.status !== 'dropped');
  const pending = pendingReviews();
  const habits = activeHabits();
  const habitsDoneToday = habits.filter(h => habitDone(h.id, TODAY)).length;

  return `
  <div class="page-head">
    <div><h1 class="page-title">${fmtFull(TODAY)}</h1><div class="page-sub">第 ${weekNo(TODAY)} 周 · 本周 ${weekLabel(THIS_WEEK)} · 任务 ${weekTasks.filter(t => t.status === 'done').length}/${weekTasks.length} · 今日习惯 ${habitsDoneToday}/${habits.length}</div></div>
    <div class="head-actions"><button class="btn" data-action="quick-task">新建任务</button><a class="btn primary" href="#/week">进入本周计划</a></div>
  </div>
  ${pending.length ? `<div class="banner warn mb-16"><div>你有 ${pending.length} 项复盘待处理：${pending.map(p => p.type === 'weekly' ? `${weekLabel(p.key)} 周复盘${p.draft ? '（草稿）' : ''}` : `${fmtMonth(p.key)} 月复盘`).join('、')}</div><a class="btn sm" href="#/reviews">去复盘</a></div>` : ''}

  <div class="home-today">
    <div class="card">
      <div class="card-title">今日焦点 <span class="count"><b>${focus.filter(t => t.status === 'done').length}</b>/${focus.length}</span></div>
      ${focus.length ? focus.map(t => taskRow(t, false, true)).join('') : `<div class="empty">今天还没有焦点任务。到「本周计划」里给任务点亮星标。</div>`}
      ${focus.length < 3 ? `<a class="add-line" href="#/week">+ 还可以再选 ${3 - focus.length} 个焦点</a>` : ''}
    </div>
    <div class="card">
      <div class="card-title">今日习惯 <span class="count"><b>${habitsDoneToday}</b>/${habits.length}</span></div>
      ${habits.map(h => {
        const on = habitDone(h.id, TODAY), a = areaById(h.areaId);
        const cnt = habitWeekCount(h, THIS_WEEK);
        return `<div class="task-row ${on ? 'done' : ''}">${checkbox(on, 'toggle-habit', `data-id="${h.id}" data-date="${TODAY}"`)}<span class="dot" style="background:${a.color}"></span><span class="task-title">${esc(h.title)}</span><span class="muted small">${h.freqType === 'daily' ? `连续 ${habitStreak(h).n} 天` : `本周 ${cnt}/${h.target}`}</span></div>`;
      }).join('')}
      <a class="add-line" href="#/habits">管理习惯</a>
    </div>
  </div>

  <div class="card home-rhythm">
    <div class="card-title">本周节奏 <a class="muted small" href="#/week">本周计划</a></div>
    <div class="rhythm">
      ${Array.from({ length: 7 }, (_, i) => {
        const d = addDays(THIS_WEEK, i), isToday = d === TODAY, past = d < TODAY;
        const dayTasks = weekTasks.filter(t => t.date === d), done = dayTasks.filter(t => t.status === 'done').length;
        return `<a class="rhythm-day ${isToday ? 'today' : ''} ${past ? 'past' : ''}" href="#/week">
          <span class="rd-dow">周${DOW[parseISO(d).getDay()]}${isToday ? ' · 今天' : ''}</span>
          <span class="rd-date">${parseISO(d).getDate()}</span>
          <span class="rd-tasks">${dayTasks.length ? `${done}<i>/${dayTasks.length} 任务</i>` : '<i>无任务</i>'}</span>
          <span class="rd-habits">${habits.map(h => `<span class="${habitDone(h.id, d) ? 'on' : ''}" title="${esc(h.title)}" style="${habitDone(h.id, d) ? `background:${areaById(h.areaId).color}` : ''}"></span>`).join('')}</span>
        </a>`;
      }).join('')}
    </div>
  </div>

  <div class="home-bottom">
    <div class="card">
      <div class="card-title">本周目标 <span class="count"><b>${weekGoals.filter(g => g.status === 'done').length}</b>/${weekGoals.length}</span></div>
      <div class="goal-grid">
      ${weekGoals.map(g => {
        const ts = tasksOfGoal(g.id), a = areaById(g.areaId);
        return `<div class="goal-card" data-action="open-goal" data-id="${g.id}" style="cursor:pointer"><span class="bar" style="background:${a.color}"></span><div class="body"><div class="row between"><span class="title">${esc(g.title)}</span>${g.status !== 'active' ? statusTag(g.status) : ''}</div><div class="row mt-8"><div style="flex:1">${progressBar(g.progress, true)}</div><span class="muted small">${g.progress}% · 任务 ${ts.filter(t => t.status === 'done').length}/${ts.length}</span></div></div></div>`;
      }).join('')}
      </div>
      <a class="add-line" href="#/goals">全部目标</a>
    </div>
    <div class="card wheel-card">
      <div class="card-title">人生之轮 <a class="muted small" href="#/areas">维度详情</a></div>
      <div class="wheel-body">
        ${radarSVG(DATA.areas, 200)}
        <div class="wheel-list">
          ${[...DATA.areas].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).map(a => `<div class="wheel-row"><span class="dot" style="background:${a.color}"></span><span class="name">${esc(a.name)}</span><div class="progress thin"><div style="width:${(a.score ?? 0) * 10}%;background:${a.color}"></div></div><span class="score">${a.score ?? '-'}</span></div>`).join('')}
        </div>
      </div>
      <a class="add-line" href="#/areas">最近打分 ${DATA.areasScoredAt}</a>
    </div>
  </div>`;
}

function taskRow(t, locked, compact) {
  const g = t.goalId ? goalById(t.goalId) : null;
  const a = g ? areaById(g.areaId) : null;
  return `<div class="task-row ${t.status}">
    ${checkbox(t.status === 'done', 'toggle-task', `data-id="${t.id}"`, locked)}
    ${a ? `<span class="dot" style="background:${a.color}"></span>` : `<span class="dot" style="background:transparent;border:1px dashed var(--muted)"></span>`}
    <span class="task-title">${esc(t.title)}${compact && g ? `<span class="task-goal">${esc(g.title)}</span>` : ''}</span>
    <div class="task-meta">
      ${!t.goalId ? '<span class="tag unlinked">未关联</span>' : ''}
      ${!compact && t.carried ? `<span class="tag">已拖 ${t.carried} 周</span>` : ''}
      ${compact ? '' : t.date ? `<span class="muted small">${fmtMD(t.date)} 周${DOW[parseISO(t.date).getDay()]}</span>` : '<span class="muted small">未定日期</span>'}
      ${locked ? '' : `<button class="star ${t.focus ? 'on' : ''}" title="今日焦点" data-action="toggle-focus" data-id="${t.id}">★</button>`}
      ${locked ? '' : `<button class="btn sm ghost" data-action="task-menu" data-id="${t.id}">···</button>`}
    </div>
  </div>`;
}

/* ================= 页面：维度 ================= */
function pageAreas() {
  return `
  <div class="page-head">
    <div><h1 class="page-title">维度与人生之轮</h1><div class="page-sub">给每个维度的现状满意度打分（1-10），看清哪里失衡。最近打分：${DATA.areasScoredAt}</div></div>
    <div class="head-actions"><button class="btn" data-action="add-area">新建维度</button><button class="btn primary" data-action="open-score">重新打分</button></div>
  </div>
  <div class="cols-side">
    <div class="card" style="display:flex;align-items:center;justify-content:center">${radarSVG(DATA.areas, 300)}</div>
    <div class="grid grid-2">
      ${DATA.areas.map(a => {
        const gs = DATA.goals.filter(g => g.areaId === a.id && g.status === 'active');
        const hs = DATA.habits.filter(h => h.areaId === a.id && h.active);
        return `<div class="area-card"><span class="bar" style="background:${a.color}"></span>
          <div style="flex:1"><div class="row between"><span class="strong">${esc(a.name)}</span><span class="score">${a.score ?? '-'}<span class="score-scale">/10</span></span></div>
          <div class="muted small mt-8">进行中目标 ${gs.length} · 习惯 ${hs.length}</div>
          <div class="row mt-8"><button class="btn sm" data-action="edit-area" data-id="${a.id}">编辑</button><a class="btn sm ghost" href="#/goals" data-action="goals-by-area" data-id="${a.id}">查看目标</a></div></div></div>`;
      }).join('')}
    </div>
  </div>`;
}

/* ================= 页面：目标 ================= */
function goalMatches(g) {
  if (state.goalArea && g.areaId !== state.goalArea) return false;
  return state.goalStatuses.has(g.status);
}
function goalNode(g, isRoot) {
  const kids = childrenOf(g.id).filter(goalMatches);
  const allKids = childrenOf(g.id);
  const a = areaById(g.areaId);
  const open = state.expanded.has(g.id);
  const nextLevel = LEVELS[LEVELS.indexOf(g.level) + 1];
  return `<div class="tree-node ${isRoot ? 'root' : ''}">
    <div class="goal-row ${state.selectedGoal === g.id ? 'selected' : ''}" data-action="open-goal" data-id="${g.id}">
      <span class="caret ${allKids.length ? '' : 'empty'}" data-action="toggle-expand" data-id="${g.id}">${open ? '▾' : '▸'}</span>
      <span class="bar" style="background:${a.color}"></span>
      ${levelTag(g.level)}
      <span class="g-title ${g.status !== 'active' ? 'muted-status' : ''}">${esc(g.title)}</span>
      ${statusTag(g.status)}
      <span class="g-progress">${progressBar(g.progress, true)}</span>
      <span class="g-pct">${g.progress}%</span>
      <span class="g-count">${allKids.length ? `${allKids.length} 子目标` : ''}</span>
      ${nextLevel ? `<button class="btn sm ghost" title="新建${LEVEL_LABEL[nextLevel]}目标" data-action="add-child" data-id="${g.id}">+</button>` : '<span style="width:30px"></span>'}
    </div>
    ${open && kids.length ? kids.map(k => goalNode(k, false)).join('') : ''}
  </div>`;
}
function pageGoals() {
  const roots = DATA.goals.filter(g => g.level === 'year' && g.start.startsWith(String(state.goalYear)) && goalMatches(g));
  const warnings = LEVELS.map(l => {
    const n = DATA.goals.filter(g => g.level === l && g.status === 'active' && (l === 'week' ? g.start === THIS_WEEK : l === 'month' ? monthOf(g.start) === THIS_MONTH : true)).length;
    return n > ACTIVE_LIMIT[l] ? `${LEVEL_LABEL[l]}目标进行中 ${n} 个，建议不超过 ${ACTIVE_LIMIT[l]} 个` : null;
  }).filter(Boolean);
  return `
  <div class="page-head">
    <div><h1 class="page-title">目标</h1><div class="page-sub">年度 → 季度 → 月度 → 周，每个目标都要回答「为什么重要」。</div></div>
    <div class="head-actions"><button class="btn primary" data-action="add-child" data-id="">新建年度目标</button></div>
  </div>
  ${warnings.length ? `<div class="banner warn mb-16"><div>${warnings.join('；')}</div></div>` : ''}
  <div class="row wrap mb-16">
    <select id="goal-year" data-change="goal-year" style="width:110px"><option ${state.goalYear === 2026 ? 'selected' : ''}>2026</option><option ${state.goalYear === 2025 ? 'selected' : ''}>2025</option></select>
    <select id="goal-area" data-change="goal-area" style="width:140px"><option value="">全部维度</option>${DATA.areas.map(a => `<option value="${a.id}" ${state.goalArea === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select>
    <span class="muted small" style="margin-left:8px">状态</span>
    ${Object.keys(STATUS_LABEL).map(s => `<span class="chip ${state.goalStatuses.has(s) ? 'on' : ''}" data-action="toggle-status-filter" data-s="${s}">${STATUS_LABEL[s]}</span>`).join('')}
    <span style="flex:1"></span>
    <button class="btn sm ghost" data-action="expand-all">全部展开</button><button class="btn sm ghost" data-action="collapse-all">全部收起</button>
  </div>
  <div class="card">${roots.length ? roots.map(g => goalNode(g, true)).join('') : '<div class="empty">当前筛选下没有目标。</div>'}</div>`;
}

function renderDrawer() {
  const root = $('#drawer-root');
  const g = state.selectedGoal && goalById(state.selectedGoal);
  if (!g) { root.innerHTML = ''; return; }
  const a = areaById(g.areaId), parent = g.parentId && goalById(g.parentId);
  const kids = childrenOf(g.id), tasks = g.level === 'week' ? tasksOfGoal(g.id) : [];
  const history = DATA.goalStatusHistory.filter(h => h.goalId === g.id);
  const terminal = g.status === 'done' || g.status === 'dropped';
  const nextLevel = LEVELS[LEVELS.indexOf(g.level) + 1];
  root.innerHTML = `<div class="drawer-mask" data-action="close-drawer"></div>
  <div class="drawer">
    <div class="drawer-head"><div><div class="row mb-8">${levelTag(g.level)}${statusTag(g.status)}<span class="tag" style="border-color:${a.color};color:${a.color}">${esc(a.name)}</span></div><h3>${esc(g.title)}</h3></div><button class="btn ghost sm" data-action="close-drawer">✕</button></div>
    <div class="kv">
      <span class="k">为什么重要</span><span>${esc(g.why)}</span>
      <span class="k">周期</span><span>${g.start} 至 ${g.end}</span>
      <span class="k">上级目标</span><span>${parent ? `<a href="#/goals" data-action="open-goal" data-id="${parent.id}" style="color:var(--accent)">${esc(parent.title)}</a>` : '无（年度目标）'}</span>
      ${g.statusReason ? `<span class="k">${STATUS_LABEL[g.status]}原因</span><span>${esc(g.statusReason)}</span>` : ''}
      ${g.doneAt ? `<span class="k">完成时间</span><span>${g.doneAt}</span>` : ''}
    </div>
    <div class="mt-16"><div class="row between"><span class="strong">进度 ${g.progress}%</span>${terminal ? '' : '<span class="muted small">拖动调整</span>'}</div>
      <input type="range" min="0" max="100" value="${g.progress}" ${terminal ? 'disabled' : ''} data-input="goal-progress" data-id="${g.id}"></div>
    <div class="row wrap mt-16">
      ${g.status === 'active' ? `<button class="btn" data-action="goal-status" data-id="${g.id}" data-s="done">标记完成</button><button class="btn" data-action="goal-status" data-id="${g.id}" data-s="paused">搁置</button><button class="btn danger" data-action="goal-status" data-id="${g.id}" data-s="dropped">放弃</button>` : ''}
      ${g.status === 'paused' ? `<button class="btn primary" data-action="goal-status" data-id="${g.id}" data-s="active">恢复进行</button><button class="btn danger" data-action="goal-status" data-id="${g.id}" data-s="dropped">放弃</button>` : ''}
      ${terminal ? `<button class="btn" data-action="goal-status" data-id="${g.id}" data-s="active">重新打开</button>` : ''}
      <span style="flex:1"></span>
      <button class="btn sm" data-action="edit-goal" data-id="${g.id}">编辑</button>
      ${!kids.length && !tasks.length ? `<button class="btn sm danger" data-action="delete-goal" data-id="${g.id}">删除</button>` : ''}
    </div>
    ${nextLevel ? `<div class="mt-24"><div class="row between mb-8"><span class="strong">${LEVEL_LABEL[nextLevel]}目标（${kids.length}）</span><button class="btn sm" data-action="add-child" data-id="${g.id}">+ 新建</button></div>
      ${kids.length ? kids.map(k => `<div class="task-row" data-action="open-goal" data-id="${k.id}" style="cursor:pointer"><span class="dot" style="background:${areaById(k.areaId).color}"></span><span class="task-title">${esc(k.title)}</span>${statusTag(k.status)}<span class="muted small">${k.progress}%</span></div>`).join('') : '<div class="empty">还没有子目标。</div>'}</div>` : ''}
    ${g.level === 'week' ? `<div class="mt-24"><div class="row between mb-8"><span class="strong">任务（${tasks.filter(t => t.status === 'done').length}/${tasks.length}）</span><a class="btn sm" href="#/week">去本周计划</a></div>${tasks.length ? tasks.map(t => taskRow(t, isWeekLocked(t.weekStart))).join('') : '<div class="empty">还没有任务。</div>'}</div>` : ''}
    ${history.length ? `<div class="mt-24"><div class="strong mb-8">状态变更记录</div>${history.map(h => `<div class="small muted">${h.at} · ${STATUS_LABEL[h.from]} → ${STATUS_LABEL[h.to]}${h.reason ? `：${esc(h.reason)}` : ''}</div>`).join('')}</div>` : ''}
  </div>`;
}

/* ================= 页面：本周计划 ================= */
function pageWeek() {
  const ws = addDays(THIS_WEEK, 7 * state.weekOffset);
  const prev = addDays(ws, -7);
  const locked = isWeekLocked(ws);
  const goals = weekGoalsOf(ws).filter(g => g.status !== 'dropped');
  const tasks = tasksOfWeek(ws);
  const prevUnfinished = tasksOfWeek(prev).filter(t => t.status === 'todo');
  const showCarry = ws >= THIS_WEEK && prevUnfinished.length > 0;
  const groups = goals.map(g => ({ g, ts: tasks.filter(t => t.goalId === g.id) }));
  const unlinked = tasks.filter(t => !t.goalId);
  const strayGroups = tasks.filter(t => t.goalId && !goals.find(g => g.id === t.goalId));
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  return `
  <div class="page-head">
    <div><h1 class="page-title">${state.weekOffset === 0 ? '本周计划' : state.weekOffset === -1 ? '上周' : state.weekOffset === 1 ? '下周计划' : '周计划'} ${locked ? '<span class="tag lock">已复盘，只读</span>' : ''}</h1><div class="page-sub">${weekLabel(ws)} · 第 ${weekNo(ws)} 周 · 任务 ${tasks.filter(t => t.status === 'done').length}/${tasks.length}</div></div>
    <div class="head-actions btn-group"><button class="btn" data-action="week-nav" data-n="-1">上一周</button><button class="btn" data-action="week-nav" data-n="0">本周</button><button class="btn" data-action="week-nav" data-n="1">下一周</button></div>
  </div>
  ${showCarry ? `<div class="banner mb-16"><div>${weekLabel(prev)} 有 <b>${prevUnfinished.length}</b> 个任务未完成：${prevUnfinished.map(t => esc(t.title)).join('、')}</div><button class="btn sm primary" data-action="carry-all" data-from="${prev}">批量移到本周</button></div>` : ''}
  <div class="cols-side">
    <div class="stack">
      <div class="card">
        <div class="card-title">本周目标 <a class="muted small" href="#/goals">管理</a></div>
        ${goals.length ? goals.map(g => `<div class="goal-card mb-8" data-action="open-goal" data-id="${g.id}" style="cursor:pointer"><span class="bar" style="background:${areaById(g.areaId).color}"></span><div class="body"><div class="title">${esc(g.title)}</div><div class="row mt-8"><div style="flex:1">${progressBar(g.progress, true)}</div><span class="muted small">${g.progress}%</span></div></div></div>`).join('') : '<div class="empty">这一周还没有周目标。到目标页从月度目标下拆一个出来。</div>'}
      </div>
      <div class="card">
        <div class="card-title">按天分布</div>
        ${days.map(d => { const n = tasks.filter(t => t.date === d).length; return `<div class="row between small" style="padding:3px 0"><span class="${d === TODAY ? 'strong' : 'muted'}">${fmtMD(d)} 周${DOW[parseISO(d).getDay()]}${d === TODAY ? ' · 今天' : ''}</span><span class="muted">${n ? n + ' 个' : ''}</span></div>`; }).join('')}
      </div>
    </div>
    <div class="card">
      ${locked ? '' : `<div class="inline-form mb-16">
        <input type="text" id="nt-title" placeholder="新任务标题，回车添加" data-enter="add-task" />
        <select id="nt-goal"><option value="">不关联目标</option>${goals.filter(g => g.status === 'active').map(g => `<option value="${g.id}">${esc(g.title)}</option>`).join('')}</select>
        <select id="nt-date" style="width:130px"><option value="">不定日期</option>${days.map(d => `<option value="${d}" ${d === TODAY ? 'selected' : ''}>${fmtMD(d)} 周${DOW[parseISO(d).getDay()]}</option>`).join('')}</select>
        <button class="btn primary" data-action="add-task">添加</button>
      </div>`}
      ${groups.map(({ g, ts }) => `<div class="task-group-title"><span class="dot" style="background:${areaById(g.areaId).color}"></span>${esc(g.title)}<span class="muted small">${ts.filter(t => t.status === 'done').length}/${ts.length}</span></div>${ts.length ? ts.map(t => taskRow(t, locked)).join('') : '<div class="empty">这个目标下还没有任务。</div>'}`).join('')}
      ${strayGroups.length ? `<div class="task-group-title">其他目标</div>${strayGroups.map(t => taskRow(t, locked)).join('')}` : ''}
      <div class="task-group-title"><span class="tag unlinked">未关联</span>没有挂在目标下的任务<span class="muted small">${unlinked.length}</span></div>
      ${unlinked.length ? unlinked.map(t => taskRow(t, locked)).join('') : '<div class="empty">很好，本周所有任务都服务于某个目标。</div>'}
    </div>
  </div>`;
}

/* ================= 页面：习惯 ================= */
function pageHabits(args) {
  if (args[0]) return pageHabitDetail(args[0]);
  const habits = DATA.habits;
  return `
  <div class="page-head">
    <div><h1 class="page-title">习惯</h1><div class="page-sub">每天或每周固定频率的小事。习惯挂在维度下，不挂目标。</div></div>
    <div class="head-actions"><button class="btn primary" data-action="add-habit">新建习惯</button></div>
  </div>
  <div class="card">
    ${habits.map(h => {
      const a = areaById(h.areaId), s = habitStreak(h), cnt = habitWeekCount(h, THIS_WEEK);
      return `<div class="habit-row ${h.active ? '' : 'muted'}" data-action="nav" data-to="#/habits/${h.id}">
        <span class="dot" style="background:${a.color}"></span>
        <div class="h-title"><div class="strong">${esc(h.title)} ${h.active ? '' : '<span class="tag">已停用</span>'}</div><div class="muted small">${esc(a.name)} · ${h.freqType === 'daily' ? '每天' : `每周 ${h.target} 次`}</div></div>
        <div class="habit-week">${Array.from({ length: 7 }, (_, i) => { const d = addDays(THIS_WEEK, i); return `<span class="${habitDone(h.id, d) ? 'on' : ''}" title="${d}"></span>`; }).join('')}</div>
        <span class="muted small" style="width:80px;text-align:right">本周 ${cnt}/${h.target}</span>
        <span class="muted small" style="width:90px;text-align:right">连续 ${s.n} ${s.unit}</span>
        ${checkbox(habitDone(h.id, TODAY), 'toggle-habit', `data-id="${h.id}" data-date="${TODAY}"`, !h.active)}
      </div>`;
    }).join('')}
  </div>`;
}
function pageHabitDetail(id) {
  const h = DATA.habits.find(x => x.id === id);
  if (!h) return '<div class="empty">习惯不存在。</div>';
  const a = areaById(h.areaId), s = habitStreak(h);
  const [y, m] = THIS_MONTH.split('-').map(Number);
  const first = parseISO(`${THIS_MONTH}-01`), offset = (first.getDay() + 6) % 7, dim = daysInMonth(THIS_MONTH);
  const backfillFrom = addDays(TODAY, -6);
  const cells = [];
  for (let i = 0; i < offset; i++) cells.push('<div class="cell empty"></div>');
  for (let d = 1; d <= dim; d++) {
    const day = `${THIS_MONTH}-${pad(d)}`;
    const on = habitDone(h.id, day), future = day > TODAY, clickable = !future && day >= backfillFrom && h.active;
    cells.push(`<div class="cell ${on ? 'on' : ''} ${day === TODAY ? 'today' : ''} ${future ? 'future' : ''} ${clickable ? 'clickable' : ''}" ${clickable ? `data-action="toggle-habit" data-id="${h.id}" data-date="${day}"` : ''} title="${day}${clickable ? '（可补卡）' : ''}">${d}</div>`);
  }
  const last7 = Array.from({ length: 7 }, (_, i) => addDays(backfillFrom, i));
  return `
  <div class="page-head">
    <div><div class="row mb-8"><a class="muted small" href="#/habits">← 返回习惯列表</a></div><h1 class="page-title"><span class="dot" style="background:${a.color};width:12px;height:12px;margin-right:6px"></span>${esc(h.title)}</h1><div class="page-sub">${esc(a.name)} · ${h.freqType === 'daily' ? '每天' : `每周 ${h.target} 次`}${h.active ? '' : ' · 已停用'}</div></div>
    <div class="head-actions"><button class="btn" data-action="edit-habit" data-id="${h.id}">编辑</button><button class="btn ${h.active ? 'danger' : 'primary'}" data-action="toggle-habit-active" data-id="${h.id}">${h.active ? '停用' : '启用'}</button></div>
  </div>
  <div class="grid grid-4 mb-16">
    <div class="card"><div class="stat"><span class="v">${s.n} <span class="small muted">${s.unit}</span></span><span class="k">当前连续</span></div></div>
    <div class="card"><div class="stat"><span class="v">${habitWeekCount(h, THIS_WEEK)}/${h.target}</span><span class="k">本周完成</span></div></div>
    <div class="card"><div class="stat"><span class="v">${habitMonthRate(h, THIS_MONTH)}%</span><span class="k">${m} 月完成率（截至今天）</span></div></div>
    <div class="card"><div class="stat"><span class="v">${habitMonthRate(h, `${y}-${pad(m - 1)}`)}%</span><span class="k">${m - 1} 月完成率</span></div></div>
  </div>
  <div class="cols-side">
    <div class="card">
      <div class="card-title">最近 7 天 <span class="muted small">可补卡</span></div>
      ${last7.map(d => `<div class="task-row ${habitDone(h.id, d) ? 'done' : ''}">${checkbox(habitDone(h.id, d), 'toggle-habit', `data-id="${h.id}" data-date="${d}"`, !h.active)}<span class="task-title">${fmtMD(d)} 周${DOW[parseISO(d).getDay()]}${d === TODAY ? ' · 今天' : ''}</span></div>`).join('')}
      <div class="muted small mt-8">超过 7 天的记录不可补卡。</div>
    </div>
    <div class="card">
      <div class="card-title">${fmtMonth(THIS_MONTH)} 打卡热力图</div>
      <div class="heat">${['一', '二', '三', '四', '五', '六', '日'].map(d => `<div class="hd">${d}</div>`).join('')}${cells.join('')}</div>
    </div>
  </div>`;
}

/* ================= 页面：复盘 ================= */
function pageReviews(args) {
  if (args[0] === 'weekly' && args[1]) return pageWeeklyReview(args[1]);
  if (args[0] === 'monthly' && args[1]) return pageMonthlyReview(args[1]);
  const pending = pendingReviews();
  const hist = [
    ...DATA.weeklyReviews.filter(r => r.status !== 'draft').map(r => ({ type: 'weekly', key: r.weekStart, r, sort: r.weekStart })),
    ...DATA.monthlyReviews.filter(r => r.status !== 'draft').map(r => ({ type: 'monthly', key: r.month, r, sort: r.month + '-99' })),
  ].sort((a, b) => b.sort.localeCompare(a.sort));
  const dow = parseISO(TODAY).getDay();
  return `
  <div class="page-head">
    <div><h1 class="page-title">复盘</h1><div class="page-sub">周复盘每周日开放，月复盘每月 1 日开放。大部分内容自动汇总，你只需回答几个问题。</div></div>
  </div>
  <div class="row mb-16"><span class="chip ${state.reviewTab === 'pending' ? 'on' : ''}" data-action="review-tab" data-t="pending">待处理 ${pending.length ? `(${pending.length})` : ''}</span><span class="chip ${state.reviewTab === 'history' ? 'on' : ''}" data-action="review-tab" data-t="history">历史记录</span></div>
  ${state.reviewTab === 'pending' ? `<div class="card">
    ${pending.map(p => `<div class="review-item"><span class="tag ${p.type === 'weekly' ? '' : 'level'}">${p.type === 'weekly' ? '周复盘' : '月复盘'}</span><div class="r-title"><div class="strong">${p.type === 'weekly' ? weekLabel(p.key) + ` · 第 ${weekNo(p.key)} 周` : fmtMonth(p.key)}</div><div class="muted small">${p.draft ? '草稿已保存，继续完成' : '尚未开始'}</div></div><a class="btn primary sm" href="#/reviews/${p.type}/${p.key}">${p.draft ? '继续' : '开始'}</a></div>`).join('')}
    <div class="review-item"><span class="tag">周复盘</span><div class="r-title"><div class="strong">${weekLabel(THIS_WEEK)} · 本周</div><div class="muted small">${dow === 0 ? '今天是周日，可以开始了' : `周日开放（原型允许提前体验）`}</div></div><a class="btn sm" href="#/reviews/weekly/${THIS_WEEK}">提前体验</a></div>
    <div class="review-item"><span class="tag level">月复盘</span><div class="r-title"><div class="strong">${fmtMonth(THIS_MONTH)}</div><div class="muted small">10 月 1 日开放（原型允许提前体验）</div></div><a class="btn sm" href="#/reviews/monthly/${THIS_MONTH}">提前体验</a></div>
  </div>` : `<div class="card">
    ${hist.map(x => `<div class="review-item"><span class="tag ${x.type === 'weekly' ? '' : 'level'}">${x.type === 'weekly' ? '周复盘' : '月复盘'}</span><div class="r-title"><div class="strong">${x.type === 'weekly' ? weekLabel(x.key) : fmtMonth(x.key)}</div><div class="muted small">${x.r.status === 'skipped' ? '已跳过' : `提交于 ${x.r.submittedAt}`}</div></div>${x.r.status === 'submitted' ? `<span class="muted small">满意度 <b>${x.type === 'weekly' ? x.r.satisfaction : x.r.snapshot.satisfactionAvg}</b>/10</span>` : ''}<a class="btn sm" href="#/reviews/${x.type}/${x.key}">查看</a></div>`).join('')}
  </div>`}`;
}

function weeklySummaryHTML(snap) {
  return `<div class="summary-kv">
    <div class="card"><div class="stat"><span class="v">${snap.taskDone}/${snap.taskTotal}</span><span class="k">任务完成 · ${pct(snap.taskDone, snap.taskTotal)}%</span></div></div>
    <div class="card"><div class="stat"><span class="v">${snap.unlinked}</span><span class="k">未关联目标的任务</span></div></div>
    <div class="card"><div class="stat"><span class="v" style="font-size:15px">${snap.mostCarried ? esc(snap.mostCarried.title) : '无'}</span><span class="k">${snap.mostCarried ? `拖延最久 · 已拖 ${snap.mostCarried.carried} 周` : '没有反复拖延的任务'}</span></div></div>
  </div>
  <div class="grid grid-2 mt-16">
    <div class="card"><div class="card-title">习惯完成率</div>${snap.habits.map(([t, r]) => `<div class="row mb-8"><span style="width:120px">${esc(t)}</span><div style="flex:1">${progressBar(r, true)}</div><span class="muted small" style="width:40px;text-align:right">${r}%</span></div>`).join('')}</div>
    <div class="card"><div class="card-title">本周目标状态</div>${snap.goals.length ? snap.goals.map(g => `<div class="row mb-8"><span class="dot" style="background:${g.color}"></span><span style="flex:1">${esc(g.title)}</span>${statusTag(g.status)}<span class="muted small">${g.progress}%</span></div>`).join('') : '<div class="empty">本周没有周目标。</div>'}</div>
  </div>`;
}
function pageWeeklyReview(ws) {
  let r = weeklyReviewOf(ws);
  const readonly = r && r.status !== 'draft';
  const snap = readonly && r.snapshot ? { unlinked: 0, mostCarried: null, goals: [], ...r.snapshot } : weekSnapshot(ws);
  if (readonly) {
    return `<div class="page-head"><div><a class="muted small" href="#/reviews">← 返回复盘</a><h1 class="page-title">周复盘 · ${weekLabel(ws)}</h1><div class="page-sub">${r.status === 'skipped' ? '本周复盘已跳过' : `提交于 ${r.submittedAt} · 满意度 ${r.satisfaction}/10`}</div></div></div>
    ${r.status === 'skipped' ? '<div class="card"><div class="empty">这一周你选择了跳过复盘，没有留下记录。</div></div>' : `${weeklySummaryHTML(snap)}
    <div class="card mt-16 stack"><div><div class="strong">本周做得好的</div><div class="muted">${esc(r.wentWell)}</div></div><div><div class="strong">没做好的</div><div class="muted">${esc(r.notWell)}</div></div><div><div class="strong">主要原因</div><div class="muted">${esc(r.reason)}</div></div><div><div class="strong">下周调整什么</div><div class="muted">${esc(r.nextWeek)}</div></div></div>`}`;
  }
  if (!r) { r = { weekStart: ws, status: 'draft', satisfaction: 7, wentWell: '', notWell: '', reason: '', nextWeek: '' }; DATA.weeklyReviews.push(r); }
  const step = state.reviewStep;
  return `
  <div class="page-head"><div><a class="muted small" href="#/reviews">← 返回复盘</a><h1 class="page-title">周复盘 · ${weekLabel(ws)}</h1><div class="page-sub">第 ${weekNo(ws)} 周 · 提交后本周任务将锁定为只读</div></div>
    <div class="head-actions"><button class="btn ghost" data-action="wr-skip" data-ws="${ws}">跳过本周复盘</button></div></div>
  <div class="steps"><div class="step ${step === 1 ? 'on' : ''}"><span class="n">1</span>本周回顾（自动汇总）</div><div class="sep"></div><div class="step ${step === 2 ? 'on' : ''}"><span class="n">2</span>四个问题</div></div>
  ${step === 1 ? `${weeklySummaryHTML(snap)}<div class="row mt-16" style="justify-content:flex-end"><button class="btn primary" data-action="wr-step" data-n="2">下一步：回答问题</button></div>`
  : `<div class="card stack qa">
      <div><label>1. 本周做得好的是什么？</label><textarea id="wr-wentWell" placeholder="哪怕很小的事也算">${esc(r.wentWell)}</textarea></div>
      <div><label>2. 没做好的是什么？</label><textarea id="wr-notWell">${esc(r.notWell)}</textarea></div>
      <div><label>3. 主要原因是什么？</label><textarea id="wr-reason" placeholder="尽量找到可控的原因，而不是归因于运气或别人">${esc(r.reason)}</textarea></div>
      <div><label>4. 下周要调整什么？</label><textarea id="wr-nextWeek" placeholder="一条就够，能落到下周计划里">${esc(r.nextWeek)}</textarea></div>
      <div><label>本周整体满意度：<span id="wr-sat-v">${r.satisfaction}</span>/10</label><input type="range" min="1" max="10" id="wr-sat" value="${r.satisfaction}" data-input="wr-sat"></div>
    </div>
    <div class="row mt-16 between"><button class="btn" data-action="wr-step" data-n="1">上一步</button><div class="btn-group"><button class="btn" data-action="wr-save" data-ws="${ws}">保存草稿</button><button class="btn primary" data-action="wr-submit" data-ws="${ws}">提交复盘</button></div></div>`}`;
}

function pageMonthlyReview(m) {
  let r = monthlyReviewOf(m);
  const readonly = r && r.status !== 'draft';
  const weeks = [];
  for (let ws = weekStartOf(`${m}-01`); monthOf(ws) <= m; ws = addDays(ws, 7)) if (monthOf(addDays(ws, 6)) >= m) weeks.push(ws);
  const wrs = weeks.map(ws => ({ ws, r: weeklyReviewOf(ws) }));
  const submitted = wrs.filter(x => x.r?.status === 'submitted');
  const skipped = wrs.filter(x => x.r?.status === 'skipped').length;
  const avg = submitted.length ? (submitted.reduce((s, x) => s + x.r.satisfaction, 0) / submitted.length).toFixed(1) : (r?.snapshot?.satisfactionAvg ?? '-');
  const goals = monthGoalsOf(m);
  const habitRates = activeHabits().map(h => [h.title, habitMonthRate(h, m)]);
  const summary = `
    <div class="grid grid-3">
      <div class="card"><div class="stat"><span class="v">${avg}</span><span class="k">周复盘满意度均值（${submitted.length} 周）${skipped ? ` · 跳过 ${skipped} 次` : ''}</span></div></div>
      <div class="card"><div class="stat"><span class="v">${goals.filter(g => g.status === 'done').length}/${goals.length}</span><span class="k">月度目标完成</span></div></div>
      <div class="card"><div class="stat"><span class="v">${habitRates.length ? Math.round(habitRates.reduce((s, x) => s + x[1], 0) / habitRates.length) : 0}%</span><span class="k">习惯平均完成率</span></div></div>
    </div>
    <div class="grid grid-2 mt-16">
      <div class="card"><div class="card-title">每周满意度</div>${submitted.length ? lineSVG(submitted.map(x => ({ v: x.r.satisfaction, label: fmtMD(x.ws) })), 340, 160) : '<div class="empty">本月还没有已提交的周复盘。</div>'}</div>
      <div class="card"><div class="card-title">习惯月完成率</div>${habitRates.map(([t, v]) => `<div class="row mb-8"><span style="width:120px">${esc(t)}</span><div style="flex:1">${progressBar(v, true)}</div><span class="muted small" style="width:40px;text-align:right">${v}%</span></div>`).join('')}</div>
    </div>`;
  if (readonly) {
    return `<div class="page-head"><div><a class="muted small" href="#/reviews">← 返回复盘</a><h1 class="page-title">月复盘 · ${fmtMonth(m)}</h1><div class="page-sub">提交于 ${r.submittedAt}</div></div></div>
    ${summary}
    <div class="card mt-16 stack"><div><div class="strong">本月目标推进情况</div><div class="muted">${esc(r.progress)}</div></div><div><div class="strong">最大的收获或发现</div><div class="muted">${esc(r.insight)}</div></div><div><div class="strong">下月要改变什么</div><div class="muted">${esc(r.nextMonth)}</div></div></div>`;
  }
  if (!r) { r = { month: m, status: 'draft', progress: '', insight: '', nextMonth: '' }; DATA.monthlyReviews.push(r); }
  const step = state.reviewStep;
  return `
  <div class="page-head"><div><a class="muted small" href="#/reviews">← 返回复盘</a><h1 class="page-title">月复盘 · ${fmtMonth(m)}</h1><div class="page-sub">对照月度目标逐条检查，再回答三个问题</div></div></div>
  ${!submitted.length && !skipped ? `<div class="banner warn mb-16"><div>本月还没有任何周复盘记录。建议先补周复盘，月复盘才有依据。</div><a class="btn sm" href="#/reviews">去看周复盘</a></div>` : ''}
  <div class="steps"><div class="step ${step === 1 ? 'on' : ''}"><span class="n">1</span>本月回顾</div><div class="sep"></div><div class="step ${step === 2 ? 'on' : ''}"><span class="n">2</span>更新月度目标</div><div class="sep"></div><div class="step ${step === 3 ? 'on' : ''}"><span class="n">3</span>三个问题</div></div>
  ${step === 1 ? `${summary}<div class="row mt-16" style="justify-content:flex-end"><button class="btn primary" data-action="mr-step" data-n="2">下一步：更新目标</button></div>` : ''}
  ${step === 2 ? `<div class="card">${goals.length ? goals.map(g => `<div class="task-row" style="align-items:flex-start;padding:12px 6px"><span class="bar" style="background:${areaById(g.areaId).color}"></span><div style="flex:1"><div class="row between"><span class="strong">${esc(g.title)}</span><select style="width:110px" data-change="mr-goal-status" data-id="${g.id}">${Object.keys(STATUS_LABEL).map(s => `<option value="${s}" ${g.status === s ? 'selected' : ''}>${STATUS_LABEL[s]}</option>`).join('')}</select></div><div class="row mt-8"><input type="range" min="0" max="100" value="${g.progress}" data-input="goal-progress" data-id="${g.id}" ${g.status === 'done' || g.status === 'dropped' ? 'disabled' : ''}><span class="muted small pct-out" style="width:40px;text-align:right">${g.progress}%</span></div></div></div>`).join('') : '<div class="empty">本月没有月度目标。</div>'}</div>
    <div class="row mt-16 between"><button class="btn" data-action="mr-step" data-n="1">上一步</button><button class="btn primary" data-action="mr-step" data-n="3">下一步：回答问题</button></div>` : ''}
  ${step === 3 ? `<div class="card stack qa">
      <div><label>1. 本月目标推进情况如何？</label><textarea id="mr-progress">${esc(r.progress)}</textarea></div>
      <div><label>2. 最大的收获或发现是什么？</label><textarea id="mr-insight" placeholder="关于自己、关于方法、关于方向">${esc(r.insight)}</textarea></div>
      <div><label>3. 下个月要改变什么？</label><textarea id="mr-nextMonth">${esc(r.nextMonth)}</textarea></div>
    </div>
    <div class="row mt-16 between"><button class="btn" data-action="mr-step" data-n="2">上一步</button><div class="btn-group"><button class="btn" data-action="mr-save" data-m="${m}">保存草稿</button><button class="btn primary" data-action="mr-submit" data-m="${m}">提交复盘</button></div></div>` : ''}`;
}

/* ================= 页面：设置 ================= */
function pageSettings() {
  const s = DATA.settings;
  return `
  <div class="page-head"><div><h1 class="page-title">设置</h1><div class="page-sub">数据只存在你的电脑上。</div></div></div>
  <div class="grid grid-2">
    <div class="card">
      <div class="card-title">外观与偏好</div>
      <div class="setting-row"><div><div>主题</div><div class="desc">${THEMES.find(t => t.id === s.theme)?.desc ?? ''}</div></div><select style="width:150px" data-change="theme">${THEMES.map(t => `<option value="${t.id}" ${s.theme === t.id ? 'selected' : ''}>${t.name}</option>`).join('')}</select></div>
      <div class="setting-row"><div><div>每周起始日</div><div class="desc">影响周计划和周复盘的划分</div></div><select style="width:120px" data-change="week-start"><option value="1" ${s.weekStartsOn === 1 ? 'selected' : ''}>周一</option><option value="0" ${s.weekStartsOn === 0 ? 'selected' : ''}>周日</option></select></div>
      <div class="setting-row"><div><div>新手引导</div><div class="desc">重新体验 5 分钟建立闭环的流程</div></div><a class="btn sm" href="#/onboarding" data-action="start-onboarding">重新运行</a></div>
    </div>
    <div class="card">
      <div class="card-title">数据与备份</div>
      <div class="setting-row"><div><div>自动备份</div><div class="desc">每天首次启动时备份一次，上次：${s.lastBackupAt}</div></div><span class="chip ${s.autoBackup ? 'on' : ''}" data-action="toggle-auto-backup">${s.autoBackup ? '已开启' : '已关闭'}</span></div>
      <div class="setting-row"><div><div>保留备份份数</div><div class="desc">超过后自动删除最旧的</div></div><select style="width:100px" data-change="keep-backups">${[3, 7, 14, 30].map(n => `<option ${s.keepBackups === n ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      <div class="setting-row"><div><div>立即备份</div><div class="desc">在备份目录生成一份快照</div></div><button class="btn sm" data-action="backup-now">备份</button></div>
      <div class="setting-row"><div><div>导出全部数据</div><div class="desc">JSON 格式，可读、可迁移</div></div><button class="btn sm" data-action="export-json">导出 JSON</button></div>
      <div class="setting-row"><div><div>从备份导入</div><div class="desc">导入前会强制先备份当前数据</div></div><button class="btn sm" data-action="import-json">导入</button></div>
    </div>
  </div>
  <div class="card mt-16"><div class="card-title">关于</div><div class="muted small">人生规划 MVP 原型 · 版本 0.1.0 · 所有数据为演示用假数据，刷新页面后恢复初始状态。</div></div>`;
}

/* ================= 页面：新手引导 ================= */
function pageOnboarding() {
  const st = state.onboard, d = st.data;
  const lowest = [...DATA.areas].sort((a, b) => (a.score ?? 0) - (b.score ?? 0))[0];
  const steps = ['开始', '维度打分', '年度目标', '拆解到本周', '第一个任务', '第一个习惯', '完成'];
  const head = `<div class="steps" style="flex-wrap:wrap">${steps.map((s, i) => `<div class="step ${i === st.step ? 'on' : ''}"><span class="n">${i + 1}</span>${s}</div>${i < steps.length - 1 ? '<div class="sep"></div>' : ''}`).join('')}</div>`;
  const nav = (backable, nextLabel) => `<div class="row between mt-24">${backable ? '<button class="btn" data-action="ob-step" data-n="-1">上一步</button>' : '<button class="btn ghost" data-action="ob-skip">跳过引导</button>'}<button class="btn primary" data-action="ob-step" data-n="1">${nextLabel || '下一步'}</button></div>`;
  let body = '';
  switch (st.step) {
    case 0: body = `<h2 style="margin:0 0 8px">花 5 分钟，建立你的第一个闭环</h2><p class="muted">人生规划不是列一堆愿望，而是一条能转起来的链：<b>看清现状 → 定一个年度目标 → 拆到本周 → 每天做 → 周末复盘</b>。接下来 5 步带你把这条链搭起来，随时可以跳过。</p>${nav(false, '开始')}`; break;
    case 1: body = `<h2 style="margin:0 0 8px">给 8 个维度打分</h2><p class="muted">1 分很不满意，10 分非常满意。凭直觉，不用想太久。</p>
      ${DATA.areas.map(a => `<div class="slider-row"><span>${esc(a.name)}</span><input type="range" min="1" max="10" value="${d.scores?.[a.id] ?? a.score ?? 5}" data-input="ob-score" data-id="${a.id}"><span class="val" id="ob-score-${a.id}">${d.scores?.[a.id] ?? a.score ?? 5}</span></div>`).join('')}${nav(true)}`; break;
    case 2: body = `<h2 style="margin:0 0 8px">定一个年度目标</h2><p class="muted">建议从分数最低、或者你最想改善的维度开始。只定一个。</p>
      <div class="field"><label>维度</label>${areaSelect('ob-area', d.areaId || lowest.id)}</div>
      <div class="field"><label>目标</label><input type="text" id="ob-title" value="${esc(d.title ?? '')}" placeholder="例如：把体重降到 72kg"><div class="example">示例：每个月至少陪父母吃一次饭 / 今年存下 3 万元 / 恢复每周运动 3 次</div></div>
      <div class="field"><label>为什么这对你重要</label><textarea id="ob-why" placeholder="写给一年后的自己看">${esc(d.why ?? '')}</textarea><div class="hint">这一栏是必填的。说不清为什么重要的目标，通常坚持不了。</div></div>${nav(true)}`; break;
    case 3: body = `<h2 style="margin:0 0 8px">把它拆到本周</h2><p class="muted">年度目标「${esc(d.title || '…')}」在这个季度、这个月、这一周分别要推进什么？</p>
      <div class="field"><label>本季度（Q3）</label><input type="text" id="ob-q" value="${esc(d.q ?? '')}" placeholder="例如：建立每周运动 3 次的习惯"></div>
      <div class="field"><label>本月（9 月）</label><input type="text" id="ob-m" value="${esc(d.m ?? '')}" placeholder="例如：9 月累计运动 12 次"></div>
      <div class="field"><label>本周</label><input type="text" id="ob-w" value="${esc(d.w ?? '')}" placeholder="例如：本周运动 3 次"></div>${nav(true)}`; break;
    case 4: body = `<h2 style="margin:0 0 8px">给本周目标加一个任务</h2><p class="muted">周目标「${esc(d.w || '…')}」下，今天或明天能做的一件具体的事。</p>
      <div class="field"><label>任务</label><input type="text" id="ob-task" value="${esc(d.task ?? '')}" placeholder="例如：明早 7 点去小区跑 3 公里"></div>${nav(true)}`; break;
    case 5: body = `<h2 style="margin:0 0 8px">建一个习惯</h2><p class="muted">一个每天或每周固定做的小事，越小越好。</p>
      <div class="field"><label>习惯</label><input type="text" id="ob-habit" value="${esc(d.habit ?? '')}" placeholder="例如：睡前阅读 15 分钟"></div>
      <div class="field"><label>频率</label><select id="ob-freq"><option value="daily" ${d.freq === 'daily' ? 'selected' : ''}>每天</option><option value="weekly" ${d.freq === 'weekly' ? 'selected' : ''}>每周 3 次</option></select></div>
      <div class="field"><label>维度</label>${areaSelect('ob-habit-area', d.habitArea || d.areaId || lowest.id)}</div>${nav(true, '完成')}`; break;
    default: body = `<h2 style="margin:0 0 8px">闭环搭好了</h2><p class="muted">接下来每天打开首页看今日焦点和习惯，周日花 10 分钟做周复盘。剩下的交给时间。</p>
      <div class="card" style="background:var(--surface-2)"><div class="kv"><span class="k">年度目标</span><span>${esc(d.title || '（未填写）')}</span><span class="k">本周目标</span><span>${esc(d.w || '（未填写）')}</span><span class="k">第一个任务</span><span>${esc(d.task || '（未填写）')}</span><span class="k">第一个习惯</span><span>${esc(d.habit || '（未填写）')}</span></div></div>
      <div class="row mt-24" style="justify-content:flex-end"><button class="btn primary" data-action="ob-finish">进入首页</button></div>`;
  }
  return `<div class="onboard">${head}<div class="card">${body}</div></div>`;
}

/* ================= 模态框 ================= */
function goalFormModal(goal, parent, level) {
  const isEdit = !!goal;
  const areaDefault = goal?.areaId || parent?.areaId || DATA.areas[0].id;
  const period = isEdit ? `${goal.start} 至 ${goal.end}` : defaultPeriod(level, parent);
  return `<h3>${isEdit ? '编辑目标' : `新建${LEVEL_LABEL[level]}目标`}</h3>
    ${parent ? `<div class="muted small mb-16">上级：${LEVEL_LABEL[parent.level]} · ${esc(parent.title)}</div>` : ''}
    <div class="field"><label>标题</label><input type="text" id="gf-title" maxlength="60" value="${esc(goal?.title ?? '')}" placeholder="一句话说清要达成什么"></div>
    <div class="field"><label>维度</label>${areaSelect('gf-area', areaDefault)}</div>
    <div class="field"><label>为什么重要（必填）</label><textarea id="gf-why" maxlength="300" placeholder="写给未来的自己看，说不清就先别立这个目标">${esc(goal?.why ?? '')}</textarea></div>
    <div class="field"><label>周期</label><input type="text" value="${period}" disabled><div class="hint">MVP 按自然${LEVEL_LABEL[level].replace('度', '')}划分，落在上级周期内。</div></div>
    <div class="modal-foot"><button class="btn" data-action="modal-close">取消</button><button class="btn primary" data-action="gf-save" data-id="${goal?.id ?? ''}" data-parent="${parent?.id ?? ''}" data-level="${level}">保存</button></div>`;
}
function defaultPeriod(level, parent) {
  if (level === 'year') return `${state.goalYear}-01-01 至 ${state.goalYear}-12-31`;
  if (level === 'quarter') { const q = Math.floor((Number(TODAY.slice(5, 7)) - 1) / 3); const y = TODAY.slice(0, 4); const sm = q * 3 + 1; return `${y}-${pad(sm)}-01 至 ${y}-${pad(sm + 2)}-${daysInMonth(`${y}-${pad(sm + 2)}`)}`; }
  if (level === 'month') return `${THIS_MONTH}-01 至 ${THIS_MONTH}-${daysInMonth(THIS_MONTH)}`;
  return `${THIS_WEEK} 至 ${addDays(THIS_WEEK, 6)}`;
}
function periodFor(level) {
  const [s, e] = defaultPeriod(level).split(' 至 ');
  return { start: s, end: e };
}

/* ================= 事件处理 ================= */
const actions = {
  nav: d => go(d.to),
  'modal-mask': (d, el, e) => { if (e.target === el) closeModal(); },
  'modal-close': () => closeModal(),
  'confirm-ok': () => { const fn = pendingConfirm; pendingConfirm = null; closeModal(); fn && fn(); },

  /* 任务 */
  'toggle-task': d => { const t = DATA.tasks.find(x => x.id === d.id); if (isWeekLocked(t.weekStart)) return; t.status = t.status === 'done' ? 'todo' : 'done'; t.doneAt = t.status === 'done' ? TODAY : null; if (t.status === 'done') pulse(`.checkbox.on[data-action="toggle-task"][data-id="${t.id}"]`); render(); },
  'toggle-focus': d => {
    const t = DATA.tasks.find(x => x.id === d.id);
    if (t.focus) { t.focus = false; render(); return; }
    const date = t.date || TODAY;
    if (DATA.tasks.filter(x => x.focus && x.date === date).length >= 3) { toast(`${fmtMD(date)} 已有 3 个焦点任务，先取消一个`); return; }
    t.date = date; t.focus = true; pulse(`.star.on[data-id="${t.id}"]`); render(); toast(t.date === TODAY ? '已设为今日焦点' : `已设为 ${fmtMD(date)} 的焦点`);
  },
  'task-menu': d => {
    const t = DATA.tasks.find(x => x.id === d.id);
    const week = t.weekStart; const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
    const weekGoals = weekGoalsOf(week).filter(g => g.status === 'active');
    openModal(`<h3>任务</h3>
      <div class="field"><label>标题</label><input type="text" id="tm-title" maxlength="100" value="${esc(t.title)}"></div>
      <div class="field"><label>关联目标</label><select id="tm-goal"><option value="">不关联</option>${weekGoals.map(g => `<option value="${g.id}" ${g.id === t.goalId ? 'selected' : ''}>${esc(g.title)}</option>`).join('')}</select><div class="hint">任务只能挂在周目标下；想挂到月度目标，请先拆一个周目标。</div></div>
      <div class="field"><label>计划日期</label><select id="tm-date"><option value="">不定日期</option>${days.map(x => `<option value="${x}" ${x === t.date ? 'selected' : ''}>${fmtMD(x)} 周${DOW[parseISO(x).getDay()]}</option>`).join('')}</select></div>
      <div class="modal-foot" style="justify-content:space-between"><div class="btn-group"><button class="btn danger" data-action="task-delete" data-id="${t.id}">删除</button><button class="btn" data-action="task-move-next" data-id="${t.id}">移到下周</button></div><div class="btn-group"><button class="btn" data-action="modal-close">取消</button><button class="btn primary" data-action="task-save" data-id="${t.id}">保存</button></div></div>`);
  },
  'task-save': d => {
    const t = DATA.tasks.find(x => x.id === d.id);
    const title = $('#tm-title').value.trim(); if (!title) { toast('标题不能为空'); return; }
    t.title = title; t.goalId = $('#tm-goal').value || null; t.date = $('#tm-date').value || null; if (!t.date) t.focus = false;
    closeModal(); render();
  },
  'task-delete': d => { DATA.tasks = DATA.tasks.filter(x => x.id !== d.id); closeModal(); render(); toast('任务已删除'); },
  'task-move-next': d => { carryTask(DATA.tasks.find(x => x.id === d.id)); closeModal(); render(); toast('已移到下周'); },
  'carry-all': d => { tasksOfWeek(d.from).filter(t => t.status === 'todo').forEach(carryTask); render(); toast('未完成任务已移到本周'); },
  'add-task': () => {
    const title = $('#nt-title').value.trim(); if (!title) { toast('先写一个任务标题'); $('#nt-title').focus(); return; }
    const ws = addDays(THIS_WEEK, 7 * state.weekOffset);
    DATA.tasks.push({ id: uid('t'), title, goalId: $('#nt-goal').value || null, weekStart: ws, date: $('#nt-date').value || null, focus: false, status: 'todo', carried: 0 });
    render(); $('#nt-title')?.focus();
  },
  'quick-task': () => { state.weekOffset = 0; go('#/week'); setTimeout(() => $('#nt-title')?.focus(), 50); },
  'week-nav': d => { const n = Number(d.n); state.weekOffset = n === 0 ? 0 : state.weekOffset + n; render(); },

  /* 习惯 */
  'toggle-habit': d => {
    if (d.date > TODAY || d.date < addDays(TODAY, -6)) { toast('只能补最近 7 天的卡'); return; }
    const k = d.id + '|' + d.date;
    if (DATA.habitLogs[k]) delete DATA.habitLogs[k];
    else { DATA.habitLogs[k] = true; pulse(`[data-action="toggle-habit"][data-id="${d.id}"][data-date="${d.date}"]`); }
    render();
  },
  'add-habit': () => openModal(habitFormModal()),
  'edit-habit': d => openModal(habitFormModal(DATA.habits.find(h => h.id === d.id))),
  'hf-save': d => {
    const title = $('#hf-title').value.trim(); if (!title) { toast('标题不能为空'); return; }
    const freqType = $('#hf-freq').value, target = freqType === 'daily' ? 7 : Number($('#hf-target').value);
    if (d.id) { Object.assign(DATA.habits.find(h => h.id === d.id), { title, areaId: $('#hf-area').value, freqType, target }); }
    else DATA.habits.push({ id: uid('h'), title, areaId: $('#hf-area').value, freqType, target, active: true });
    closeModal(); render(); toast(d.id ? '已保存' : '习惯已创建');
  },
  'toggle-habit-active': d => { const h = DATA.habits.find(x => x.id === d.id); h.active = !h.active; render(); toast(h.active ? '已启用' : '已停用，历史记录保留'); },

  /* 维度 */
  'open-score': () => openModal(`<h3>重新打分</h3><div class="muted small mb-16">给每个维度的现状满意度打分（1-10），一次性提交。</div>
    ${DATA.areas.map(a => `<div class="slider-row"><span>${esc(a.name)}</span><input type="range" min="1" max="10" value="${a.score ?? 5}" data-input="score" data-id="${a.id}"><span class="val" id="score-${a.id}">${a.score ?? 5}</span></div>`).join('')}
    <div class="modal-foot"><button class="btn" data-action="modal-close">取消</button><button class="btn primary" data-action="save-scores">提交</button></div>`),
  'save-scores': () => { document.querySelectorAll('[data-input="score"]').forEach(el => { areaById(el.dataset.id).score = Number(el.value); }); DATA.areasScoredAt = TODAY; closeModal(); render(); toast('已更新人生之轮'); },
  'add-area': () => openModal(areaFormModal()),
  'edit-area': d => openModal(areaFormModal(areaById(d.id))),
  'af-save': d => {
    const name = $('#af-name').value.trim(); if (!name) { toast('名称不能为空'); return; }
    if (DATA.areas.some(a => a.name === name && a.id !== d.id)) { toast('已有同名维度'); return; }
    if (d.id) { const a = areaById(d.id); a.name = name; a.color = $('#af-color').value; }
    else DATA.areas.push({ id: uid('a'), name, color: $('#af-color').value, score: null, sort: DATA.areas.length + 1 });
    closeModal(); render();
  },
  'af-archive': d => {
    const used = DATA.goals.some(g => g.areaId === d.id) || DATA.habits.some(h => h.areaId === d.id);
    if (used) { toast('该维度下还有目标或习惯，MVP 中只能归档，不能删除（原型未实现归档视图）'); return; }
    DATA.areas = DATA.areas.filter(a => a.id !== d.id); closeModal(); render(); toast('维度已删除');
  },
  'goals-by-area': d => { state.goalArea = d.id; },

  /* 目标 */
  'toggle-expand': d => { state.expanded.has(d.id) ? state.expanded.delete(d.id) : state.expanded.add(d.id); render(); },
  'expand-all': () => { DATA.goals.forEach(g => state.expanded.add(g.id)); render(); },
  'collapse-all': () => { state.expanded.clear(); render(); },
  'toggle-status-filter': d => { state.goalStatuses.has(d.s) ? state.goalStatuses.delete(d.s) : state.goalStatuses.add(d.s); render(); },
  'open-goal': d => { state.selectedGoal = d.id; renderDrawer(); document.querySelectorAll('.goal-row').forEach(r => r.classList.toggle('selected', r.dataset.id === d.id)); },
  'close-drawer': () => { state.selectedGoal = null; renderDrawer(); document.querySelectorAll('.goal-row.selected').forEach(r => r.classList.remove('selected')); },
  'add-child': d => {
    const parent = d.id ? goalById(d.id) : null;
    const level = parent ? LEVELS[LEVELS.indexOf(parent.level) + 1] : 'year';
    if (parent && parent.status !== 'active') { toast('上级目标不是进行中状态，先恢复它'); return; }
    openModal(goalFormModal(null, parent, level));
  },
  'edit-goal': d => { const g = goalById(d.id); openModal(goalFormModal(g, g.parentId && goalById(g.parentId), g.level)); },
  'gf-save': d => {
    const title = $('#gf-title').value.trim(), why = $('#gf-why').value.trim();
    if (!title) { toast('标题不能为空'); return; }
    if (!why) { toast('「为什么重要」是必填的'); $('#gf-why').focus(); return; }
    if (d.id) { Object.assign(goalById(d.id), { title, why, areaId: $('#gf-area').value }); }
    else {
      const { start, end } = periodFor(d.level);
      const g = { id: uid('g'), level: d.level, parentId: d.parent || null, areaId: $('#gf-area').value, title, why, start, end, status: 'active', progress: 0 };
      DATA.goals.push(g); state.expanded.add(g.id); if (d.parent) state.expanded.add(d.parent);
      const n = DATA.goals.filter(x => x.level === d.level && x.status === 'active' && (d.level === 'week' ? x.start === THIS_WEEK : d.level === 'month' ? monthOf(x.start) === THIS_MONTH : true)).length;
      if (n > ACTIVE_LIMIT[d.level]) toast(`${LEVEL_LABEL[d.level]}目标进行中已有 ${n} 个，超过建议的 ${ACTIVE_LIMIT[d.level]} 个。少即是多。`);
      state.selectedGoal = g.id;
    }
    closeModal(); render();
  },
  'delete-goal': d => confirmModal('删除目标', `确定删除「${esc(goalById(d.id).title)}」？没有子目标和任务的目标可以直接删除。`, '删除', () => { DATA.goals = DATA.goals.filter(g => g.id !== d.id); state.selectedGoal = null; render(); toast('已删除'); }, true),
  'goal-status': d => {
    const g = goalById(d.id), to = d.s;
    if (to === 'done') { confirmModal('标记完成', `「${esc(g.title)}」将标记为已完成，进度置为 100%。${childrenOf(g.id).some(c => c.status === 'active') ? '<br><br>它还有进行中的子目标，不会被自动完成。' : ''}`, '完成', () => setGoalStatus(g, 'done', '')); return; }
    if (to === 'active') { if (g.status === 'paused') { setGoalStatus(g, 'active', ''); return; } confirmModal('重新打开', `「${esc(g.title)}」将回到进行中状态。`, '重新打开', () => setGoalStatus(g, 'active', '')); return; }
    const activeKids = descendants(g.id).filter(c => c.status === 'active');
    openModal(`<h3>${STATUS_LABEL[to]}目标</h3><div class="muted small mb-16">「${esc(g.title)}」</div>
      <div class="field"><label>原因（必填）</label><textarea id="gs-reason" maxlength="300" placeholder="${to === 'dropped' ? '放弃不是失败。写下原因，年度复盘时它会很有价值。' : '暂停多久？什么条件下恢复？'}"></textarea></div>
      ${to === 'dropped' && activeKids.length ? `<div class="banner warn mb-16"><label class="row"><input type="checkbox" id="gs-cascade" checked>同时放弃 ${activeKids.length} 个进行中的下级目标</label></div>` : ''}
      <div class="modal-foot"><button class="btn" data-action="modal-close">取消</button><button class="btn ${to === 'dropped' ? 'danger' : 'primary'}" data-action="gs-confirm" data-id="${g.id}" data-s="${to}">确认${STATUS_LABEL[to]}</button></div>`);
  },
  'gs-confirm': d => {
    const reason = $('#gs-reason').value.trim(); if (!reason) { toast('请写下原因'); return; }
    const g = goalById(d.id);
    if (d.s === 'dropped' && $('#gs-cascade')?.checked) descendants(g.id).filter(c => c.status === 'active').forEach(c => setGoalStatus(c, 'dropped', '随上级目标一并放弃', true));
    setGoalStatus(g, d.s, reason); closeModal();
  },

  /* 复盘 */
  'review-tab': d => { state.reviewTab = d.t; render(); },
  'wr-step': d => { saveWeeklyDraftFromForm(); state.reviewStep = Number(d.n); render(); },
  'wr-save': () => { saveWeeklyDraftFromForm(); toast('草稿已保存'); },
  'wr-submit': d => {
    saveWeeklyDraftFromForm();
    const r = weeklyReviewOf(d.ws);
    if (!r.wentWell || !r.notWell || !r.reason || !r.nextWeek) { toast('四个问题都要回答，哪怕只写一句'); return; }
    r.status = 'submitted'; r.submittedAt = TODAY; r.snapshot = weekSnapshot(d.ws);
    const next = addDays(d.ws, 7);
    state.weekOffset = Math.round((parseISO(next) - parseISO(THIS_WEEK)) / 86400000 / 7);
    state.reviewStep = 1;
    confirmModal('复盘已提交', `${weekLabel(d.ws)} 的任务已锁定为只读。<br><br>现在进入 ${weekLabel(next)} 的计划，把未完成的任务带过去？`, '进入下周计划', () => go('#/week'));
    render();
  },
  'wr-skip': d => confirmModal('跳过本周复盘', '跳过会被记录下来（不会无痕消失），月复盘时会显示你跳过了几次。', '确认跳过', () => { const r = weeklyReviewOf(d.ws) || (DATA.weeklyReviews.push({ weekStart: d.ws }), weeklyReviewOf(d.ws)); r.status = 'skipped'; state.reviewStep = 1; go('#/reviews'); toast('已记录为跳过'); }, true),
  'mr-step': d => { saveMonthlyDraftFromForm(); state.reviewStep = Number(d.n); render(); },
  'mr-save': () => { saveMonthlyDraftFromForm(); toast('草稿已保存'); },
  'mr-submit': d => {
    saveMonthlyDraftFromForm();
    const r = monthlyReviewOf(d.m);
    if (!r.progress || !r.insight || !r.nextMonth) { toast('三个问题都要回答'); return; }
    const weeks = DATA.weeklyReviews.filter(x => monthOf(x.weekStart) === d.m && x.status === 'submitted');
    r.status = 'submitted'; r.submittedAt = TODAY;
    r.snapshot = { satisfactionAvg: weeks.length ? Number((weeks.reduce((s, x) => s + x.satisfaction, 0) / weeks.length).toFixed(1)) : 0, habitRate: Math.round(activeHabits().reduce((s, h) => s + habitMonthRate(h, d.m), 0) / Math.max(1, activeHabits().length)) };
    state.reviewStep = 1; go('#/reviews'); toast('月复盘已提交');
  },

  /* 设置 */
  'toggle-auto-backup': () => { DATA.settings.autoBackup = !DATA.settings.autoBackup; render(); },
  'backup-now': () => { DATA.settings.lastBackupAt = `${TODAY} ${pad(new Date().getHours())}:${pad(new Date().getMinutes())}`; render(); toast('已生成备份快照 life-planner-2026-09-16.bak'); },
  'export-json': () => {
    const blob = new Blob([JSON.stringify(DATA, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `life-planner-export-${TODAY}.json`; a.click(); URL.revokeObjectURL(a.href);
    toast('已导出 JSON');
  },
  'import-json': () => confirmModal('从备份导入', '导入会覆盖当前全部数据。系统会先自动备份当前数据，再执行导入。', '选择文件并导入', () => toast('（原型）已备份当前数据并完成导入')),
  'start-onboarding': () => { state.onboard = { step: 0, data: {} }; },

  /* 新手引导 */
  'ob-step': d => { collectOnboardStep(); state.onboard.step = Math.max(0, state.onboard.step + Number(d.n)); render(); },
  'ob-skip': () => { go('#/home'); toast('可以随时在设置里重新运行引导'); },
  'ob-finish': () => {
    const d = state.onboard.data;
    if (d.scores) { Object.entries(d.scores).forEach(([id, v]) => { areaById(id).score = v; }); DATA.areasScoredAt = TODAY; }
    if (d.title && d.why) {
      const mk = (level, title, parentId) => { const { start, end } = periodFor(level); const g = { id: uid('g'), level, parentId, areaId: d.areaId, title, why: d.why, start, end, status: 'active', progress: 0 }; DATA.goals.push(g); state.expanded.add(g.id); return g; };
      const y = mk('year', d.title, null);
      const q = d.q ? mk('quarter', d.q, y.id) : null;
      const m = q && d.m ? mk('month', d.m, q.id) : null;
      const w = m && d.w ? mk('week', d.w, m.id) : null;
      if (d.task) DATA.tasks.push({ id: uid('t'), title: d.task, goalId: w?.id ?? null, weekStart: THIS_WEEK, date: TODAY, focus: DATA.tasks.filter(t => t.focus && t.date === TODAY).length < 3, status: 'todo', carried: 0 });
    }
    if (d.habit) DATA.habits.push({ id: uid('h'), title: d.habit, areaId: d.habitArea || d.areaId || DATA.areas[0].id, freqType: d.freq || 'daily', target: d.freq === 'weekly' ? 3 : 7, active: true });
    DATA.settings.onboarded = true; state.onboard = { step: 0, data: {} };
    go('#/home'); toast('闭环已建立，从今天开始');
  },
};

function carryTask(t) { t.weekStart = addDays(t.weekStart, 7); t.date = null; t.focus = false; t.carried += 1; }
function setGoalStatus(g, to, reason, silent) {
  DATA.goalStatusHistory.push({ goalId: g.id, from: g.status, to, reason, at: TODAY });
  g.status = to; g.statusReason = reason || undefined;
  if (to === 'done') { g.progress = 100; g.doneAt = TODAY; } else g.doneAt = undefined;
  if (!silent) { render(); toast(`已${STATUS_LABEL[to]}`); }
}
function saveWeeklyDraftFromForm() {
  const ws = route().args[1]; const r = weeklyReviewOf(ws); if (!r || !$('#wr-wentWell')) return;
  r.wentWell = $('#wr-wentWell').value.trim(); r.notWell = $('#wr-notWell').value.trim(); r.reason = $('#wr-reason').value.trim(); r.nextWeek = $('#wr-nextWeek').value.trim(); r.satisfaction = Number($('#wr-sat').value);
}
function saveMonthlyDraftFromForm() {
  const m = route().args[1]; const r = monthlyReviewOf(m); if (!r || !$('#mr-progress')) return;
  r.progress = $('#mr-progress').value.trim(); r.insight = $('#mr-insight').value.trim(); r.nextMonth = $('#mr-nextMonth').value.trim();
}
function collectOnboardStep() {
  const d = state.onboard.data;
  switch (state.onboard.step) {
    case 1: d.scores = {}; document.querySelectorAll('[data-input="ob-score"]').forEach(el => d.scores[el.dataset.id] = Number(el.value)); break;
    case 2: d.areaId = $('#ob-area').value; d.title = $('#ob-title').value.trim(); d.why = $('#ob-why').value.trim(); break;
    case 3: d.q = $('#ob-q').value.trim(); d.m = $('#ob-m').value.trim(); d.w = $('#ob-w').value.trim(); break;
    case 4: d.task = $('#ob-task').value.trim(); break;
    case 5: d.habit = $('#ob-habit').value.trim(); d.freq = $('#ob-freq').value; d.habitArea = $('#ob-habit-area').value; break;
  }
}
function habitFormModal(h) {
  return `<h3>${h ? '编辑习惯' : '新建习惯'}</h3>
    <div class="field"><label>名称</label><input type="text" id="hf-title" maxlength="40" value="${esc(h?.title ?? '')}" placeholder="越具体越好，例如：23:30 前上床"></div>
    <div class="field"><label>维度</label>${areaSelect('hf-area', h?.areaId || DATA.areas[0].id)}</div>
    <div class="field"><label>频率</label><div class="row"><select id="hf-freq" style="width:140px" data-change="hf-freq"><option value="daily" ${!h || h.freqType === 'daily' ? 'selected' : ''}>每天</option><option value="weekly" ${h?.freqType === 'weekly' ? 'selected' : ''}>每周 N 次</option></select><select id="hf-target" style="width:100px" class="${h?.freqType === 'weekly' ? '' : 'hidden'}">${[1, 2, 3, 4, 5, 6].map(n => `<option ${h?.target === n ? 'selected' : ''}>${n}</option>`).join('')}</select></div></div>
    <div class="modal-foot"><button class="btn" data-action="modal-close">取消</button><button class="btn primary" data-action="hf-save" data-id="${h?.id ?? ''}">保存</button></div>`;
}
function areaFormModal(a) {
  const palette = ['#2f9e77', '#3b6fd6', '#c9a227', '#d9654b', '#b45fbf', '#2a9db5', '#e08a2e', '#7a8699', '#4b5563', '#0f766e'];
  return `<h3>${a ? '编辑维度' : '新建维度'}</h3>
    <div class="field"><label>名称</label><input type="text" id="af-name" maxlength="20" value="${esc(a?.name ?? '')}"></div>
    <div class="field"><label>颜色</label><select id="af-color">${palette.map(c => `<option value="${c}" ${a?.color === c ? 'selected' : ''} style="color:${c}">${c}</option>`).join('')}</select></div>
    <div class="modal-foot" style="justify-content:space-between">${a ? `<button class="btn danger" data-action="af-archive" data-id="${a.id}">删除 / 归档</button>` : '<span></span>'}<div class="btn-group"><button class="btn" data-action="modal-close">取消</button><button class="btn primary" data-action="af-save" data-id="${a?.id ?? ''}">保存</button></div></div>`;
}

const changes = {
  'goal-year': el => { state.goalYear = Number(el.value); render(); },
  'goal-area': el => { state.goalArea = el.value; render(); },
  'theme': el => applyTheme(el.value),
  'week-start': el => { DATA.settings.weekStartsOn = Number(el.value); toast('（原型）周起始日已保存，重算周划分'); },
  'keep-backups': el => { DATA.settings.keepBackups = Number(el.value); },
  'hf-freq': el => { $('#hf-target').classList.toggle('hidden', el.value !== 'weekly'); },
  'mr-goal-status': el => {
    const g = goalById(el.dataset.id), to = el.value;
    if (to === g.status) return;
    if (to === 'paused' || to === 'dropped') { el.value = g.status; actions['goal-status']({ id: g.id, s: to }); return; }
    setGoalStatus(g, to, '');
  },
};
const inputs = {
  'goal-progress': el => { const g = goalById(el.dataset.id); g.progress = Number(el.value); const out = el.parentElement?.querySelector('.pct-out'); if (out) out.textContent = g.progress + '%'; const head = el.previousElementSibling?.querySelector('.strong'); if (head) head.textContent = `进度 ${g.progress}%`; },
  'score': el => { $('#score-' + el.dataset.id).textContent = el.value; },
  'ob-score': el => { $('#ob-score-' + el.dataset.id).textContent = el.value; },
  'wr-sat': el => { $('#wr-sat-v').textContent = el.value; },
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]'); if (!el) return;
  const fn = actions[el.dataset.action]; if (!fn) return;
  if (el.tagName !== 'A') e.preventDefault();
  fn(el.dataset, el, e);
});
document.addEventListener('change', e => { const el = e.target.closest('[data-change]'); if (el) changes[el.dataset.change]?.(el); });
document.addEventListener('input', e => { const el = e.target.closest('[data-input]'); if (el) inputs[el.dataset.input]?.(el); });
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.dataset?.enter) actions[e.target.dataset.enter]?.({}); if (e.key === 'Escape') { closeModal(); if (state.selectedGoal) actions['close-drawer'](); } });
document.addEventListener('mouseup', e => { if (e.target.dataset?.input === 'goal-progress') setTimeout(render, 0); });

window.addEventListener('hashchange', () => { state.reviewStep = 1; state.selectedGoal = route().name === 'goals' ? state.selectedGoal : null; render(); });
const THEMES = [
  { id: 'dark', name: '墨夜 · 星钟', desc: '深色墨底、黄铜点缀、衬线刻字。' },
  { id: 'ink', name: '宣纸 · 朱砂', desc: '宣纸底、朱砂一点、宋体直角。' },
];
function applyTheme(id) {
  if (!THEMES.some(t => t.id === id)) id = 'dark';
  DATA.settings.theme = id;
  document.documentElement.dataset.theme = id;
  const picker = $('#theme-picker'); if (picker && picker.value !== id) picker.value = id;
  if (route().name === 'settings') render();
}
(function mountThemePicker() {
  const foot = $('.sidebar-foot');
  const wrap = document.createElement('div');
  wrap.className = 'theme-picker';
  wrap.innerHTML = `<div class="muted small">主题</div><select id="theme-picker" data-change="theme">${THEMES.map(t => `<option value="${t.id}">${t.name}</option>`).join('')}</select>`;
  foot.prepend(wrap);
})();
applyTheme(DATA.settings.theme);
render();
