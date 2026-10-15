-- Schéma initial

CREATE TABLE users (
  id              SERIAL PRIMARY KEY,
  pseudo          TEXT NOT NULL,
  pin_hash        TEXT NOT NULL,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_pseudo_lower ON users (lower(pseudo));

CREATE TABLE sessions (
  token_hash  TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL
);
CREATE INDEX sessions_user ON sessions (user_id);

CREATE TABLE games (
  id             SERIAL PRIMARY KEY,
  name           TEXT NOT NULL,
  creator_id     INTEGER NOT NULL REFERENCES users(id),
  status         TEXT NOT NULL DEFAULT 'lobby' CHECK (status IN ('lobby', 'active', 'finished')),
  phase_minutes  INTEGER NOT NULL DEFAULT 0 CHECK (phase_minutes >= 0),
  press          TEXT NOT NULL DEFAULT 'full' CHECK (press IN ('full', 'public', 'none')),
  result         TEXT,            -- code puissance gagnante, 'DRAW' ou NULL
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at     TIMESTAMPTZ,
  finished_at    TIMESTAMPTZ
);

CREATE TABLE players (
  game_id     INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  power       TEXT,               -- choisie dans le salon ou attribuée au lancement
  draw_vote   BOOLEAN NOT NULL DEFAULT false,
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (game_id, user_id)
);
CREATE UNIQUE INDEX players_game_power ON players (game_id, power) WHERE power IS NOT NULL;

CREATE TABLE phases (
  id           SERIAL PRIMARY KEY,
  game_id      INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  idx          INTEGER NOT NULL,
  name         TEXT NOT NULL,
  state        JSONB NOT NULL,
  report       JSONB,
  deadline     TIMESTAMPTZ,
  resolved_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (game_id, idx)
);
CREATE INDEX phases_pending_deadline ON phases (deadline) WHERE resolved_at IS NULL;

CREATE TABLE orders (
  phase_id    INTEGER NOT NULL REFERENCES phases(id) ON DELETE CASCADE,
  power       TEXT NOT NULL,
  orders      JSONB NOT NULL DEFAULT '[]',
  ready       BOOLEAN NOT NULL DEFAULT false,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (phase_id, power)
);

CREATE TABLE messages (
  id           SERIAL PRIMARY KEY,
  game_id      INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  phase_name   TEXT,
  from_power   TEXT,
  to_power     TEXT,              -- NULL = message public
  body         TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX messages_game ON messages (game_id, id);
