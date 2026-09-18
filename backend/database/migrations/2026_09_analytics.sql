-- Analytics dashboard (September 2026) — spec section 8
-- Run after 2026_09_wallet.sql and 2026_09_settings.sql. New installs get all of this from schema.sql.
-- Safe to run once on an existing database; it only adds tables and columns and back-fills stage history.

SET NAMES utf8mb4;

ALTER TABLE users ADD COLUMN can_view_analytics TINYINT(1) NOT NULL DEFAULT 0 AFTER must_change_password;

ALTER TABLE leads
  ADD COLUMN contacted_at DATETIME NULL AFTER counsellor_id,
  ADD COLUMN enrolled_at  DATETIME NULL AFTER contacted_at;

-- Best available history for existing leads: their last change time.
UPDATE leads SET contacted_at = updated_at WHERE status <> 'NEW' AND contacted_at IS NULL;
UPDATE leads SET enrolled_at = updated_at WHERE status = 'ENROLLED' AND enrolled_at IS NULL;

ALTER TABLE notifications
  ADD COLUMN html_body MEDIUMTEXT NULL AFTER body,
  ADD COLUMN attachments JSON NULL AFTER html_body;

-- ============================== Analytics (spec section 8.2) ==============================

-- One row per tracked browser event (raw, 13-month retention). Never stores IP addresses.
CREATE TABLE analytics_events (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  occurred_at   DATETIME(3)  NOT NULL,
  received_at   DATETIME(3)  NOT NULL,
  visitor_id    CHAR(36)     NOT NULL,
  session_id    CHAR(36)     NOT NULL,
  event         VARCHAR(40)  NOT NULL,
  name          VARCHAR(80)  NULL,
  path          VARCHAR(255) NULL,
  props         JSON         NULL,
  source        VARCHAR(80)  NULL,
  medium        VARCHAR(40)  NULL,
  campaign      VARCHAR(120) NULL,
  referrer_host VARCHAR(120) NULL,
  device        ENUM('desktop','mobile','tablet') NULL,
  browser       VARCHAR(40)  NULL,
  os            VARCHAR(40)  NULL,
  country       CHAR(2)      NULL,
  state         VARCHAR(80)  NULL,
  internal      TINYINT(1)   NOT NULL DEFAULT 0,
  KEY idx_ae_occurred (occurred_at),
  KEY idx_ae_event (event, occurred_at),
  KEY idx_ae_session (session_id),
  KEY idx_ae_visitor (visitor_id, occurred_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One row per session, maintained as events arrive. client_session_id is the id the browser sent;
-- session_id differs from it only when the server had to split a session (30 min idle or Lagos midnight).
CREATE TABLE analytics_sessions (
  session_id        CHAR(36)     NOT NULL PRIMARY KEY,
  client_session_id CHAR(36)     NOT NULL,
  visitor_id        CHAR(36)     NOT NULL,
  started_at        DATETIME(3)  NOT NULL,
  ended_at          DATETIME(3)  NOT NULL,
  page_views        INT UNSIGNED NOT NULL DEFAULT 0,
  events            INT UNSIGNED NOT NULL DEFAULT 0,
  landing_path      VARCHAR(255) NULL,
  exit_path         VARCHAR(255) NULL,
  source            VARCHAR(80)  NULL,
  medium            VARCHAR(40)  NULL,
  campaign          VARCHAR(120) NULL,
  referrer_host     VARCHAR(120) NULL,
  device            ENUM('desktop','mobile','tablet') NULL,
  browser           VARCHAR(40)  NULL,
  os                VARCHAR(40)  NULL,
  country           CHAR(2)      NULL,
  state             VARCHAR(80)  NULL,
  is_bounce         TINYINT(1)   NOT NULL DEFAULT 1,
  internal          TINYINT(1)   NOT NULL DEFAULT 0,
  signed_in_as      ENUM('none','client','staff') NOT NULL DEFAULT 'none',
  KEY idx_as_started (started_at),
  KEY idx_as_visitor (visitor_id, started_at),
  KEY idx_as_client (client_session_id, started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- First-seen date per visitor (new vs returning)
CREATE TABLE analytics_visitors (
  visitor_id CHAR(36) NOT NULL PRIMARY KEY,
  first_seen DATETIME NOT NULL,
  last_seen  DATETIME NOT NULL,
  KEY idx_av_first (first_seen)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Daily rollups of event-level counts so long ranges stay fast (kept forever)
CREATE TABLE analytics_daily (
  day        DATE         NOT NULL,
  metric     VARCHAR(40)  NOT NULL,
  dimension  VARCHAR(40)  NOT NULL,
  value_key  VARCHAR(160) NOT NULL,
  value      BIGINT       NOT NULL,
  PRIMARY KEY (day, metric, dimension, value_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Stage history, for time-in-stage (back-filled from existing stage updates)
CREATE TABLE project_stage_history (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id  INT UNSIGNED NOT NULL,
  from_stage  VARCHAR(20)  NULL,
  to_stage    VARCHAR(20)  NOT NULL,
  changed_at  DATETIME     NOT NULL,
  changed_by  INT UNSIGNED NULL,
  KEY idx_psh_project (project_id, changed_at),
  CONSTRAINT fk_psh_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_psh_user FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Lightweight request log for the Operations screen (30-day retention). Route pattern, never the raw path.
CREATE TABLE api_request_log (
  id        BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  at        DATETIME(3)  NOT NULL,
  method    VARCHAR(8)   NOT NULL,
  route     VARCHAR(160) NOT NULL,
  status    SMALLINT UNSIGNED NOT NULL,
  ms        INT UNSIGNED NOT NULL,
  internal  TINYINT(1)   NOT NULL DEFAULT 0,
  KEY idx_arl_at (at),
  KEY idx_arl_route (route, at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE analytics_saved_views (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     INT UNSIGNED NOT NULL,
  name        VARCHAR(120) NOT NULL,
  query       JSON         NOT NULL,
  shared      TINYINT(1)   NOT NULL DEFAULT 0,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_asv_user (user_id),
  CONSTRAINT fk_asv_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE analytics_schedules (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id       INT UNSIGNED NOT NULL,
  name          VARCHAR(120) NOT NULL,
  view          VARCHAR(20)  NOT NULL,
  query         JSON         NOT NULL,
  frequency     ENUM('daily','weekly','monthly') NOT NULL DEFAULT 'weekly',
  recipients    JSON         NOT NULL,
  format        ENUM('pdf','csv','xlsx') NOT NULL DEFAULT 'pdf',
  last_sent_at  DATETIME     NULL,
  active        TINYINT(1)   NOT NULL DEFAULT 1,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_asch_active (active),
  CONSTRAINT fk_asch_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Back-fill stage history from the stage updates projects already have.
INSERT INTO project_stage_history (project_id, from_stage, to_stage, changed_at, changed_by)
SELECT u.project_id, NULL,
       CASE
         WHEN u.title = 'Welcome! Your project is registered' THEN 'APPROVED'
         WHEN u.title = 'Stage changed to Approved' THEN 'APPROVED'
         WHEN u.title = 'Stage changed to Design' THEN 'DESIGN'
         WHEN u.title = 'Stage changed to In development' THEN 'DEVELOPMENT'
         WHEN u.title = 'Stage changed to Testing' THEN 'TESTING'
         WHEN u.title = 'Stage changed to Deployment' THEN 'DEPLOYMENT'
         WHEN u.title = 'Stage changed to Delivered' OR u.title LIKE 'Your product is%' THEN 'DELIVERED'
         WHEN u.title LIKE 'Project paused%' THEN 'ON_HOLD'
       END,
       COALESCE(u.published_at, u.created_at), u.author_id
FROM updates u
WHERE u.kind = 'stage'
  AND (u.title IN ('Welcome! Your project is registered', 'Stage changed to Approved', 'Stage changed to Design',
                   'Stage changed to In development', 'Stage changed to Testing', 'Stage changed to Deployment',
                   'Stage changed to Delivered')
       OR u.title LIKE 'Your product is%' OR u.title LIKE 'Project paused%');

-- Projects registered before any recorded stage change entered Approved on their start date.
INSERT INTO project_stage_history (project_id, from_stage, to_stage, changed_at, changed_by)
SELECT p.id, NULL, 'APPROVED', CONCAT(COALESCE(p.start_date, DATE(p.created_at)), ' 09:00:00'), NULL
FROM projects p
WHERE NOT EXISTS (SELECT 1 FROM project_stage_history h WHERE h.project_id = p.id AND h.to_stage = 'APPROVED')
  AND COALESCE(p.start_date, DATE(p.created_at)) <= COALESCE(
        (SELECT DATE(MIN(h2.changed_at)) FROM project_stage_history h2 WHERE h2.project_id = p.id), '9999-12-31');
