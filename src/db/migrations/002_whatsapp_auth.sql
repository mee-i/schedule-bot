PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS whatsapp_auth (
  session    TEXT NOT NULL,
  id         TEXT NOT NULL,
  value      TEXT,
  PRIMARY KEY (session, id)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_auth_session ON whatsapp_auth(session);
