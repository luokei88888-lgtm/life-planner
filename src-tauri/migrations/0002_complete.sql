PRAGMA foreign_keys = OFF;

CREATE TABLE goals_v2 (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('life', 'year', 'quarter', 'month', 'week')),
  parent_id TEXT,
  area_id TEXT NOT NULL REFERENCES areas (id),
  why TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'done', 'paused', 'dropped')),
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  status_reason TEXT,
  done_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (parent_id) REFERENCES goals_v2 (id)
);

INSERT INTO goals_v2 (
  id, title, level, parent_id, area_id, why, period_start, period_end,
  status, progress, status_reason, done_at, created_at, updated_at
)
SELECT id, title, level, parent_id, area_id, why, period_start, period_end,
       status, progress, status_reason, done_at, created_at, updated_at
FROM goals;

DROP TABLE goals;
ALTER TABLE goals_v2 RENAME TO goals;

CREATE INDEX IF NOT EXISTS idx_goals_parent ON goals (parent_id);
CREATE INDEX IF NOT EXISTS idx_goals_area ON goals (area_id);

ALTER TABLE habits ADD COLUMN goal_id TEXT REFERENCES goals (id);

CREATE TABLE IF NOT EXISTS yearly_reviews (
  id TEXT PRIMARY KEY,
  year TEXT NOT NULL UNIQUE,
  summary_snapshot TEXT,
  q_progress TEXT,
  q_insight TEXT,
  q_next_year TEXT,
  status TEXT NOT NULL CHECK (status IN ('draft', 'submitted')),
  submitted_at TEXT
);

PRAGMA foreign_keys = ON;
