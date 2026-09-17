PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS areas (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  score INTEGER,
  scored_at TEXT,
  is_archived INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT areas_name_unique UNIQUE (name),
  CONSTRAINT areas_score_range CHECK (score IS NULL OR (score >= 1 AND score <= 10))
);

CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('year', 'quarter', 'month', 'week')),
  parent_id TEXT REFERENCES goals (id),
  area_id TEXT NOT NULL REFERENCES areas (id),
  why TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'done', 'paused', 'dropped')),
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  status_reason TEXT,
  done_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS goal_status_history (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL REFERENCES goals (id),
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  reason TEXT,
  changed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  goal_id TEXT REFERENCES goals (id),
  week_start TEXT NOT NULL,
  planned_date TEXT,
  is_focus INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('todo', 'done')),
  done_at TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  carried_over_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS habits (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  area_id TEXT NOT NULL REFERENCES areas (id),
  frequency_type TEXT NOT NULL CHECK (frequency_type IN ('daily', 'weekly')),
  frequency_target INTEGER NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS habit_logs (
  habit_id TEXT NOT NULL REFERENCES habits (id),
  date TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (habit_id, date)
);

CREATE TABLE IF NOT EXISTS weekly_reviews (
  id TEXT PRIMARY KEY,
  week_start TEXT NOT NULL UNIQUE,
  summary_snapshot TEXT,
  q_went_well TEXT,
  q_not_well TEXT,
  q_reason TEXT,
  q_next_week TEXT,
  satisfaction INTEGER,
  status TEXT NOT NULL CHECK (status IN ('draft', 'submitted', 'skipped')),
  submitted_at TEXT
);

CREATE TABLE IF NOT EXISTS monthly_reviews (
  id TEXT PRIMARY KEY,
  month TEXT NOT NULL UNIQUE,
  summary_snapshot TEXT,
  q_progress TEXT,
  q_insight TEXT,
  q_next_month TEXT,
  status TEXT NOT NULL CHECK (status IN ('draft', 'submitted')),
  submitted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_goals_parent ON goals (parent_id);
CREATE INDEX IF NOT EXISTS idx_goals_area ON goals (area_id);
CREATE INDEX IF NOT EXISTS idx_tasks_week ON tasks (week_start);
CREATE INDEX IF NOT EXISTS idx_habit_logs_date ON habit_logs (date);
