PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS chat_settings (
  chat_jid         TEXT PRIMARY KEY,
  chat_type        TEXT NOT NULL CHECK (chat_type IN ('group','private')),
  chat_name        TEXT,
  notify_enabled   INTEGER NOT NULL DEFAULT 0,
  mention_mode     TEXT NOT NULL DEFAULT 'hidden'
                   CHECK (mention_mode IN ('hidden','visible','none')),
  timezone         TEXT NOT NULL DEFAULT 'Asia/Jakarta',
  reminder_offsets TEXT NOT NULL DEFAULT '[1440,180,30]',
  digest_time      TEXT,
  set_by           TEXT,
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS courses (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_jid    TEXT NOT NULL REFERENCES chat_settings(chat_jid) ON DELETE CASCADE,
  seq         INTEGER NOT NULL,
  name        TEXT NOT NULL,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  start_time  TEXT NOT NULL,
  end_time    TEXT,
  room        TEXT,
  lecturer    TEXT,
  active      INTEGER NOT NULL DEFAULT 1,
  created_by  TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  UNIQUE (chat_jid, seq)
);

CREATE TABLE IF NOT EXISTS events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_jid    TEXT NOT NULL REFERENCES chat_settings(chat_jid) ON DELETE CASCADE,
  seq         INTEGER NOT NULL,
  title       TEXT NOT NULL,
  description TEXT,
  location    TEXT,
  start_at    INTEGER NOT NULL,
  end_at      INTEGER,
  created_by  TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  UNIQUE (chat_jid, seq)
);
CREATE INDEX IF NOT EXISTS idx_events_chat_start ON events(chat_jid, start_at);

CREATE TABLE IF NOT EXISTS tasks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_jid    TEXT NOT NULL REFERENCES chat_settings(chat_jid) ON DELETE CASCADE,
  seq         INTEGER NOT NULL,
  course_id   INTEGER REFERENCES courses(id) ON DELETE SET NULL,
  title       TEXT NOT NULL,
  description TEXT,
  due_at      INTEGER NOT NULL,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','done')),
  done_by     TEXT,
  done_at     INTEGER,
  created_by  TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  UNIQUE (chat_jid, seq)
);
CREATE INDEX IF NOT EXISTS idx_tasks_chat_due ON tasks(chat_jid, status, due_at);

CREATE TABLE IF NOT EXISTS reminder_log (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_jid       TEXT NOT NULL,
  source_type    TEXT NOT NULL CHECK (source_type IN ('event','course','task')),
  source_id      INTEGER NOT NULL,
  occurrence_at  INTEGER NOT NULL,
  offset_minutes INTEGER NOT NULL,
  status         TEXT NOT NULL CHECK (status IN ('sent','failed')),
  error          TEXT,
  sent_at        INTEGER NOT NULL,
  UNIQUE (source_type, source_id, occurrence_at, offset_minutes)
);

CREATE TABLE IF NOT EXISTS schema_migrations (
  version    TEXT PRIMARY KEY,
  applied_at INTEGER NOT NULL
);
