CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('insight', 'diary', 'vent')),
  body TEXT NOT NULL,
  area_id TEXT REFERENCES areas (id),
  goal_id TEXT REFERENCES goals (id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notes_date ON notes (date DESC, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_notes_area ON notes (area_id);
CREATE INDEX IF NOT EXISTS idx_notes_goal ON notes (goal_id);
