PRAGMA foreign_keys = OFF;

CREATE TABLE areas_v2 (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  score INTEGER,
  scored_at TEXT,
  is_archived INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT areas_name_unique UNIQUE (name),
  CONSTRAINT areas_score_range CHECK (score IS NULL OR (score >= 1 AND score <= 5))
);

INSERT INTO areas_v2 (id, name, color, sort_order, score, scored_at, is_archived)
SELECT id, name, color, sort_order,
  CASE
    WHEN score IS NULL THEN NULL
    ELSE MIN(5, MAX(1, (score + 1) / 2))
  END,
  scored_at,
  is_archived
FROM areas;

DROP TABLE areas;
ALTER TABLE areas_v2 RENAME TO areas;

PRAGMA foreign_keys = ON;
