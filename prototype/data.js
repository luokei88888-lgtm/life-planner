/* 假数据。演示日期固定为 2026-09-16（周三），当周周一为 2026-09-14。 */

const DEMO_TODAY = '2026-09-16';

const LEVELS = ['year', 'quarter', 'month', 'week'];
const LEVEL_LABEL = { year: '年度', quarter: '季度', month: '月度', week: '周' };
const STATUS_LABEL = { active: '进行中', done: '已完成', paused: '搁置', dropped: '放弃' };
const ACTIVE_LIMIT = { year: 5, quarter: 5, month: 5, week: 7 };

const DATA = {
  areas: [
    { id: 'a1', name: '健康', color: '#2f9e77', score: 6, sort: 1 },
    { id: 'a2', name: '事业', color: '#3b6fd6', score: 7, sort: 2 },
    { id: 'a3', name: '财务', color: '#c9a227', score: 5, sort: 3 },
    { id: 'a4', name: '家庭', color: '#d9654b', score: 8, sort: 4 },
    { id: 'a5', name: '关系', color: '#b45fbf', score: 6, sort: 5 },
    { id: 'a6', name: '成长', color: '#2a9db5', score: 7, sort: 6 },
    { id: 'a7', name: '兴趣', color: '#e08a2e', score: 4, sort: 7 },
    { id: 'a8', name: '贡献', color: '#7a8699', score: 3, sort: 8 },
  ],
  areasScoredAt: '2026-07-01',

  goals: [
    // 年度
    { id: 'y1', level: 'year', parentId: null, areaId: 'a1', title: '把体重降到 72kg，恢复规律运动', why: '过去两年久坐，体检指标开始亮黄灯。健康是其他一切目标的前提。', start: '2026-01-01', end: '2026-12-31', status: 'active', progress: 45 },
    { id: 'y2', level: 'year', parentId: null, areaId: 'a2', title: '完成从执行者到技术负责人的转变', why: '希望对结果负责而不只是对任务负责，这也是收入提升的必经之路。', start: '2026-01-01', end: '2026-12-31', status: 'active', progress: 55 },
    { id: 'y3', level: 'year', parentId: null, areaId: 'a6', title: '系统学习产品思维，读完 12 本相关书', why: '技术之外需要理解用户与商业，否则永远只能被动接需求。', start: '2026-01-01', end: '2026-12-31', status: 'active', progress: 60 },
    { id: 'y4', level: 'year', parentId: null, areaId: 'a3', title: '建立 6 个月生活费的应急储备', why: '有储备才有拒绝的底气，也能应对突发情况。', start: '2026-01-01', end: '2026-12-31', status: 'paused', progress: 30, statusReason: '上半年家里有大额支出，暂停储蓄计划，Q4 视情况恢复。' },
    // 季度
    { id: 'q1', level: 'quarter', parentId: 'y1', areaId: 'a1', title: '每周至少运动 3 次并坚持 12 周', why: '先建立频率，再谈强度和体重。', start: '2026-07-01', end: '2026-09-30', status: 'active', progress: 60 },
    { id: 'q2', level: 'quarter', parentId: 'y2', areaId: 'a2', title: '主导完成一次跨团队项目交付', why: '技术负责人的核心能力是协调与交付，需要一个实战场景。', start: '2026-07-01', end: '2026-09-30', status: 'active', progress: 70 },
    { id: 'q3', level: 'quarter', parentId: 'y3', areaId: 'a6', title: '读完 3 本书并写读书笔记', why: '不写笔记等于没读。', start: '2026-07-01', end: '2026-09-30', status: 'active', progress: 66 },
    { id: 'q4', level: 'quarter', parentId: 'y1', areaId: 'a1', title: '完成体检并制定饮食计划', why: '先知道现状，才能定策略。', start: '2026-04-01', end: '2026-06-30', status: 'done', progress: 100, doneAt: '2026-06-20' },
    { id: 'q5', level: 'quarter', parentId: 'y2', areaId: 'a2', title: '梳理团队技术债并输出改造方案', why: '接手负责人角色前先摸清家底。', start: '2026-04-01', end: '2026-06-30', status: 'done', progress: 100, doneAt: '2026-06-28' },
    // 月度
    { id: 'm1', level: 'month', parentId: 'q1', areaId: 'a1', title: '9 月跑步累计 60 公里', why: '每周 15 公里，是能坚持的量。', start: '2026-09-01', end: '2026-09-30', status: 'active', progress: 40 },
    { id: 'm2', level: 'month', parentId: 'q2', areaId: 'a2', title: '完成项目二期上线', why: '二期是整个 Q3 交付的关键节点。', start: '2026-09-01', end: '2026-09-30', status: 'active', progress: 50 },
    { id: 'm3', level: 'month', parentId: 'q3', areaId: 'a6', title: '读完《俞军产品方法论》并输出笔记', why: '这本书对理解用户价值最直接。', start: '2026-09-01', end: '2026-09-30', status: 'active', progress: 30 },
    { id: 'm4', level: 'month', parentId: 'q2', areaId: 'a2', title: '完成项目一期需求评审与排期', why: '一期是二期的基础。', start: '2026-08-01', end: '2026-08-31', status: 'done', progress: 100, doneAt: '2026-08-29' },
    { id: 'm5', level: 'month', parentId: 'q1', areaId: 'a1', title: '8 月跑步累计 50 公里', why: '逐步加量。', start: '2026-08-01', end: '2026-08-31', status: 'done', progress: 100, doneAt: '2026-08-31' },
    // 周
    { id: 'w1', level: 'week', parentId: 'm1', areaId: 'a1', title: '本周跑步 3 次，累计 15 公里', why: '保持节奏。', start: '2026-09-14', end: '2026-09-20', status: 'active', progress: 33 },
    { id: 'w2', level: 'week', parentId: 'm2', areaId: 'a2', title: '完成二期核心接口开发', why: '接口是上线前的最后一块。', start: '2026-09-14', end: '2026-09-20', status: 'active', progress: 50 },
    { id: 'w3', level: 'week', parentId: 'm3', areaId: 'a6', title: '读完第 3-5 章并整理笔记', why: '按每周 3 章的节奏。', start: '2026-09-14', end: '2026-09-20', status: 'active', progress: 20 },
    { id: 'w4', level: 'week', parentId: 'm2', areaId: 'a2', title: '组织一次二期进度同步会', why: '让各方对齐上线时间。', start: '2026-09-14', end: '2026-09-20', status: 'active', progress: 0 },
    { id: 'w5', level: 'week', parentId: 'm1', areaId: 'a1', title: '上周跑步 3 次，累计 15 公里', why: '保持节奏。', start: '2026-09-07', end: '2026-09-13', status: 'done', progress: 100, doneAt: '2026-09-13' },
    { id: 'w6', level: 'week', parentId: 'm2', areaId: 'a2', title: '完成二期数据库设计', why: '接口开发前置。', start: '2026-09-07', end: '2026-09-13', status: 'done', progress: 100, doneAt: '2026-09-12' },
    { id: 'w7', level: 'week', parentId: 'm3', areaId: 'a6', title: '读完第 1-2 章', why: '开个头。', start: '2026-09-07', end: '2026-09-13', status: 'done', progress: 100, doneAt: '2026-09-13' },
  ],

  goalStatusHistory: [
    { goalId: 'y4', from: 'active', to: 'paused', reason: '上半年家里有大额支出，暂停储蓄计划，Q4 视情况恢复。', at: '2026-06-05' },
  ],

  tasks: [
    // 本周 2026-09-14
    { id: 't1', title: '周一晨跑 5 公里', goalId: 'w1', weekStart: '2026-09-14', date: '2026-09-14', focus: false, status: 'done', carried: 0 },
    { id: 't2', title: '周三晨跑 5 公里', goalId: 'w1', weekStart: '2026-09-14', date: '2026-09-16', focus: true, status: 'todo', carried: 0 },
    { id: 't3', title: '周六长跑 5 公里', goalId: 'w1', weekStart: '2026-09-14', date: '2026-09-19', focus: false, status: 'todo', carried: 0 },
    { id: 't4', title: '完成订单接口开发', goalId: 'w2', weekStart: '2026-09-14', date: '2026-09-15', focus: false, status: 'done', carried: 0 },
    { id: 't5', title: '完成支付回调接口', goalId: 'w2', weekStart: '2026-09-14', date: '2026-09-16', focus: true, status: 'todo', carried: 0 },
    { id: 't6', title: '补齐接口单元测试', goalId: 'w2', weekStart: '2026-09-14', date: '2026-09-17', focus: false, status: 'todo', carried: 0 },
    { id: 't7', title: '阅读第 3 章并做笔记', goalId: 'w3', weekStart: '2026-09-14', date: '2026-09-16', focus: true, status: 'todo', carried: 0 },
    { id: 't8', title: '发会议邀请并准备议程', goalId: 'w4', weekStart: '2026-09-14', date: '2026-09-17', focus: false, status: 'todo', carried: 0 },
    { id: 't9', title: '给车换保险', goalId: null, weekStart: '2026-09-14', date: '2026-09-18', focus: false, status: 'todo', carried: 0 },
    { id: 't10', title: '预约牙医', goalId: null, weekStart: '2026-09-14', date: null, focus: false, status: 'todo', carried: 2 },
    // 上周 2026-09-07
    { id: 't11', title: '周一晨跑 5 公里', goalId: 'w5', weekStart: '2026-09-07', date: '2026-09-07', focus: false, status: 'done', carried: 0 },
    { id: 't12', title: '周四晨跑 5 公里', goalId: 'w5', weekStart: '2026-09-07', date: '2026-09-10', focus: false, status: 'done', carried: 0 },
    { id: 't13', title: '周日长跑 5 公里', goalId: 'w5', weekStart: '2026-09-07', date: '2026-09-13', focus: false, status: 'done', carried: 0 },
    { id: 't14', title: '完成 ER 图与表结构', goalId: 'w6', weekStart: '2026-09-07', date: '2026-09-09', focus: false, status: 'done', carried: 0 },
    { id: 't15', title: '整理数据库设计文档', goalId: 'w6', weekStart: '2026-09-07', date: '2026-09-12', focus: false, status: 'todo', carried: 0 },
    { id: 't16', title: '读完第 1-2 章', goalId: 'w7', weekStart: '2026-09-07', date: '2026-09-11', focus: false, status: 'done', carried: 0 },
    { id: 't17', title: '整理书架', goalId: null, weekStart: '2026-09-07', date: null, focus: false, status: 'todo', carried: 1 },
  ],

  habits: [
    { id: 'h1', title: '跑步', areaId: 'a1', freqType: 'weekly', target: 3, active: true },
    { id: 'h2', title: '阅读 30 分钟', areaId: 'a6', freqType: 'daily', target: 7, active: true },
    { id: 'h3', title: '23:30 前上床', areaId: 'a1', freqType: 'daily', target: 7, active: true },
    { id: 'h4', title: '给父母打电话', areaId: 'a4', freqType: 'weekly', target: 2, active: true },
  ],

  // habitLogs: { 'h1|2026-09-14': true, ... } 一天一行
  habitLogs: {},

  weeklyReviews: [
    { weekStart: '2026-08-10', status: 'skipped' },
    { weekStart: '2026-08-17', status: 'submitted', satisfaction: 7, submittedAt: '2026-08-23', wentWell: '项目一期评审顺利通过，运动坚持了 3 次。', notWell: '阅读只完成了一半，晚上总是刷手机。', reason: '晚上没有固定的阅读时间，回家先躺着刷手机就停不下来。', nextWeek: '把阅读放到早上通勤，睡前手机放客厅。', snapshot: { taskTotal: 8, taskDone: 6, unlinked: 1, mostCarried: null, habits: [['跑步', 100], ['阅读 30 分钟', 57], ['23:30 前上床', 43], ['给父母打电话', 100]], goals: [{ title: '完成一期需求评审', status: 'done', progress: 100, color: '#3b6fd6' }, { title: '本周跑步 3 次', status: 'done', progress: 100, color: '#2f9e77' }, { title: '读完第 4-6 章', status: 'paused', progress: 40, color: '#2a9db5' }] } },
    { weekStart: '2026-08-24', status: 'submitted', satisfaction: 6, submittedAt: '2026-08-30', wentWell: '排期定下来了，团队对二期目标有共识。', notWell: '周中连续加班两天，运动断了。', reason: '需求变更导致排期压缩。', nextWeek: '和产品约定变更冻结时间点。', snapshot: { taskTotal: 9, taskDone: 6, unlinked: 2, mostCarried: { title: '整理书架', carried: 1 }, habits: [['跑步', 67], ['阅读 30 分钟', 71], ['23:30 前上床', 29], ['给父母打电话', 50]], goals: [{ title: '确定二期排期', status: 'done', progress: 100, color: '#3b6fd6' }, { title: '本周跑步 3 次', status: 'dropped', progress: 67, color: '#2f9e77' }] } },
    { weekStart: '2026-08-31', status: 'submitted', satisfaction: 8, submittedAt: '2026-09-06', wentWell: '8 月跑量目标达成，一期按时交付。', notWell: '和父母通话少了。', reason: '周末都在赶进度。', nextWeek: '周三晚上固定打电话。', snapshot: { taskTotal: 7, taskDone: 7, unlinked: 0, mostCarried: null, habits: [['跑步', 100], ['阅读 30 分钟', 86], ['23:30 前上床', 57], ['给父母打电话', 50]], goals: [{ title: '一期上线', status: 'done', progress: 100, color: '#3b6fd6' }, { title: '本周跑步 3 次', status: 'done', progress: 100, color: '#2f9e77' }] } },
    { weekStart: '2026-09-07', status: 'draft', satisfaction: 7, wentWell: '数据库设计一次过评审，跑了 3 次。', notWell: '', reason: '', nextWeek: '' },
  ],

  monthlyReviews: [
    { month: '2026-07', status: 'submitted', submittedAt: '2026-08-02', progress: '运动频率建立起来了，技术债方案已输出。', insight: '一个月只盯 3 件事，反而每件都推进了。', nextMonth: '8 月开始正式承担二期的协调工作。', snapshot: { satisfactionAvg: 6.8, habitRate: 64 } },
    { month: '2026-08', status: 'submitted', submittedAt: '2026-09-01', progress: '8 月跑量 50 公里达成；一期评审排期完成；阅读进度落后。', insight: '晚上是我最容易失控的时间段，重要习惯尽量放在早上。', nextMonth: '9 月聚焦二期上线，阅读改到通勤时间。', snapshot: { satisfactionAvg: 7.0, habitRate: 69 } },
  ],

  settings: {
    theme: 'dark',
    weekStartsOn: 1,
    autoBackup: true,
    keepBackups: 7,
    lastBackupAt: '2026-09-16 08:12',
    onboarded: true,
  },
};

/* 生成最近 70 天的习惯记录（确定性伪随机，保证每次打开数据一致） */
(function seedHabitLogs() {
  let seed = 20260916;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const probs = { h1: 0.45, h2: 0.7, h3: 0.5, h4: 0.3 };
  const today = new Date(DEMO_TODAY + 'T00:00:00');
  const pad = n => String(n).padStart(2, '0');
  for (let i = 70; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    const iso = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    for (const h of DATA.habits) {
      if (rnd() < probs[h.id]) DATA.habitLogs[h.id + '|' + iso] = true;
    }
  }
  // 固定本周的几条，方便演示
  ['h1|2026-09-07', 'h1|2026-09-10', 'h1|2026-09-13', 'h1|2026-09-14', 'h2|2026-09-14', 'h2|2026-09-15', 'h3|2026-09-14', 'h3|2026-09-15', 'h4|2026-09-15'].forEach(k => DATA.habitLogs[k] = true);
  ['h1|2026-09-15', 'h1|2026-09-16', 'h2|2026-09-16', 'h3|2026-09-16', 'h4|2026-09-14', 'h4|2026-09-16'].forEach(k => delete DATA.habitLogs[k]);
})();
