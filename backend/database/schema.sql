-- AI Project Connect — MySQL schema
-- Compatible with MySQL 5.7+/8.x and MariaDB 10.3+ (typical cPanel hosting).
-- Import with phpMyAdmin or: mysql -u USER -p DATABASE < schema.sql

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS analytics_schedules, analytics_saved_views, api_request_log, project_stage_history,
  analytics_daily, analytics_visitors, analytics_sessions, analytics_events, settings, idea_payments, idea_resume_tokens, handover_items, change_requests, course_events, password_resets, quotes,
  rate_limits, otp_codes, site_content, activity_log, notifications, leads,
  ideas, messages, project_files, files, courses, project_technologies, technologies, milestones,
  updates, project_members, project_revoked_codes, projects, clients, users;

SET FOREIGN_KEY_CHECKS = 1;

-- Staff accounts: admin, project lead, engineer, course counsellor
CREATE TABLE users (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(120) NOT NULL,
  email         VARCHAR(190) NOT NULL,
  phone         VARCHAR(40)  NULL,
  role          ENUM('admin','lead','engineer','counsellor') NOT NULL DEFAULT 'engineer',
  job_title     VARCHAR(120) NULL,
  password_hash VARCHAR(255) NOT NULL,
  status        ENUM('active','disabled') NOT NULL DEFAULT 'active',
  -- Set when an admin creates the account or resets the password
  must_change_password TINYINT(1) NOT NULL DEFAULT 0,
  -- Analytics dashboard access for non-admins (admins always have it)
  can_view_analytics TINYINT(1) NOT NULL DEFAULT 0,
  last_login_at DATETIME NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Idea owners (clients). They sign in with a Project ID + one-time code, so no password.
CREATE TABLE clients (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(120) NOT NULL,
  email        VARCHAR(190) NOT NULL,
  phone        VARCHAR(40)  NULL,
  organisation VARCHAR(160) NULL,
  country      VARCHAR(80)  NULL,
  state        VARCHAR(80)  NULL,
  -- Bumped when a Project ID is regenerated so existing client sessions are signed out.
  session_version INT UNSIGNED NOT NULL DEFAULT 1,
  -- Weekly progress email (NT-04)
  digest_opt_out  TINYINT(1) NOT NULL DEFAULT 0,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_clients_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Uploaded files (PDF briefs, fliers, shared documents). Stored outside the web root.
CREATE TABLE files (
  id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  public_id          CHAR(32) NOT NULL,
  original_name      VARCHAR(255) NOT NULL,
  stored_name        VARCHAR(80) NOT NULL,
  mime_type          VARCHAR(100) NOT NULL,
  size_bytes         INT UNSIGNED NOT NULL,
  visibility         ENUM('public','private') NOT NULL DEFAULT 'private',
  uploaded_by_user   INT UNSIGNED NULL,
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_files_public_id (public_id),
  CONSTRAINT fk_files_user FOREIGN KEY (uploaded_by_user) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE projects (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code             VARCHAR(20) NOT NULL,
  client_id        INT UNSIGNED NOT NULL,
  title            VARCHAR(160) NOT NULL,
  tagline          VARCHAR(255) NULL,
  category         VARCHAR(80)  NULL,
  platforms        VARCHAR(160) NULL,
  budget           VARCHAR(80)  NULL,
  stage            ENUM('SUBMITTED','UNDER_REVIEW','APPROVED','DESIGN','DEVELOPMENT','TESTING','DEPLOYMENT','DELIVERED','ON_HOLD') NOT NULL DEFAULT 'APPROVED',
  progress         TINYINT UNSIGNED NOT NULL DEFAULT 0,
  hold_reason      VARCHAR(500) NULL,
  paused_at_step   TINYINT UNSIGNED NULL,
  lead_id          INT UNSIGNED NULL,
  start_date       DATE NULL,
  target_date      DATE NULL,
  delivered_at     DATETIME NULL,
  promos_opt_out   TINYINT(1) NOT NULL DEFAULT 0,
  -- Delivery handover (build journey step 7)
  handover_requested_at DATETIME NULL,
  handover_signed_at    DATETIME NULL,
  handover_signed_name  VARCHAR(120) NULL,
  support_plan          VARCHAR(80) NULL,
  rating_stars     TINYINT UNSIGNED NULL,
  rating_text      TEXT NULL,
  rated_at         DATETIME NULL,
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_projects_code (code),
  KEY idx_projects_client (client_id),
  KEY idx_projects_stage (stage),
  CONSTRAINT fk_projects_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE RESTRICT,
  CONSTRAINT fk_projects_lead FOREIGN KEY (lead_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Old Project IDs that were regenerated (AD-08). They never grant access again.
CREATE TABLE project_revoked_codes (
  code        VARCHAR(20) NOT NULL PRIMARY KEY,
  project_id  INT UNSIGNED NOT NULL,
  revoked_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_revoked_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE project_members (
  project_id INT UNSIGNED NOT NULL,
  user_id    INT UNSIGNED NOT NULL,
  added_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (project_id, user_id),
  CONSTRAINT fk_members_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_members_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE updates (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id    INT UNSIGNED NOT NULL,
  author_id     INT UNSIGNED NULL,
  author_name   VARCHAR(120) NOT NULL,
  author_role   VARCHAR(80)  NOT NULL,
  kind          ENUM('update','stage') NOT NULL DEFAULT 'update',
  visibility    ENUM('client','internal') NOT NULL DEFAULT 'client',
  status        ENUM('published','pending') NOT NULL DEFAULT 'published',
  title         VARCHAR(160) NOT NULL,
  body          TEXT NOT NULL,
  demo_link     VARCHAR(500) NULL,
  screenshot    VARCHAR(40)  NULL,
  approved_by   INT UNSIGNED NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  published_at  DATETIME NULL,
  KEY idx_updates_project (project_id, created_at),
  CONSTRAINT fk_updates_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_updates_author FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_updates_approver FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE milestones (
  id                    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id            INT UNSIGNED NOT NULL,
  title                 VARCHAR(160) NOT NULL,
  due_date              DATE NOT NULL,
  needs_client_approval TINYINT(1) NOT NULL DEFAULT 0,
  completed_at          DATETIME NULL,
  client_approved_at    DATETIME NULL,
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_milestones_project (project_id, due_date),
  CONSTRAINT fk_milestones_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE courses (
  id               VARCHAR(60) NOT NULL PRIMARY KEY,
  title            VARCHAR(160) NOT NULL,
  description      TEXT NULL,
  duration         VARCHAR(60) NOT NULL,
  format           VARCHAR(80) NOT NULL,
  next_start       DATE NULL,
  price            DECIMAL(12,2) NOT NULL DEFAULT 0,
  currency         CHAR(3) NOT NULL DEFAULT 'NGN',
  discount_percent TINYINT UNSIGNED NULL,
  discount_code    VARCHAR(40) NULL,
  flier_file_id    INT UNSIGNED NULL,
  enrol_url        VARCHAR(500) NULL,
  published        TINYINT(1) NOT NULL DEFAULT 0,
  sort_order       INT NOT NULL DEFAULT 0,
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_courses_flier FOREIGN KEY (flier_file_id) REFERENCES files(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE technologies (
  id                VARCHAR(60) NOT NULL PRIMARY KEY,
  name              VARCHAR(80) NOT NULL,
  category          VARCHAR(60) NOT NULL,
  plain_description VARCHAR(500) NOT NULL,
  mark              VARCHAR(3) NOT NULL,
  color             CHAR(7) NOT NULL DEFAULT '#61DAFB',
  course_id         VARCHAR(60) NULL,
  sort_order        INT NOT NULL DEFAULT 0,
  CONSTRAINT fk_technologies_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE project_technologies (
  project_id    INT UNSIGNED NOT NULL,
  technology_id VARCHAR(60) NOT NULL,
  usage_note    VARCHAR(120) NOT NULL,
  added_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (project_id, technology_id),
  CONSTRAINT fk_pt_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_pt_technology FOREIGN KEY (technology_id) REFERENCES technologies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE project_files (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id  INT UNSIGNED NOT NULL,
  file_id     INT UNSIGNED NOT NULL,
  kind        ENUM('proposal','design','doc') NOT NULL DEFAULT 'doc',
  source      ENUM('team','client') NOT NULL DEFAULT 'team',
  note        VARCHAR(500) NULL,
  shared_by   VARCHAR(120) NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_project_files_project (project_id),
  CONSTRAINT fk_pf_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_pf_file FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Client ↔ team conversation (CL-07)
CREATE TABLE messages (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id  INT UNSIGNED NOT NULL,
  sender      ENUM('client','team') NOT NULL,
  user_id     INT UNSIGNED NULL,
  author_name VARCHAR(120) NOT NULL,
  body        TEXT NOT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_messages_project (project_id, created_at),
  CONSTRAINT fk_messages_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_messages_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Idea applications (step 1 of the build journey).
-- DRAFT rows are partially filled; completeness is validated when the applicant submits.
CREATE TABLE ideas (
  id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ref                VARCHAR(20) NOT NULL,
  name               VARCHAR(120) NULL,
  email              VARCHAR(190) NOT NULL,
  phone              VARCHAR(40)  NULL,
  organisation       VARCHAR(160) NULL,
  country            VARCHAR(80)  NULL,
  state              VARCHAR(80)  NULL,
  title              VARCHAR(160) NULL,
  category           VARCHAR(80)  NULL,
  platforms          VARCHAR(500) NULL,
  problem            TEXT NULL,
  target_users       TEXT NULL,
  features           TEXT NULL,
  budget             VARCHAR(80) NULL,
  timeline           VARCHAR(80) NULL,
  nda                TINYINT(1) NOT NULL DEFAULT 1,
  attachment_file_id INT UNSIGNED NULL,
  status             ENUM('DRAFT','NEW','REVIEWING','QUOTE_SENT','ACCEPTED','DECLINED') NOT NULL DEFAULT 'NEW',
  source             ENUM('online','walk_in') NOT NULL DEFAULT 'online',
  created_by_user    INT UNSIGNED NULL,
  notes              TEXT NULL,
  project_id         INT UNSIGNED NULL,
  last_saved_at      DATETIME NULL,
  submitted_at       DATETIME NULL,
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ideas_ref (ref),
  KEY idx_ideas_status (status),
  KEY idx_ideas_email (email, status),
  CONSTRAINT fk_ideas_file FOREIGN KEY (attachment_file_id) REFERENCES files(id) ON DELETE SET NULL,
  CONSTRAINT fk_ideas_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
  CONSTRAINT fk_ideas_creator FOREIGN KEY (created_by_user) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Resume links for idea applications ("Continue your application"). Only sha256 hashes are stored.
-- One idea can have several live links (created, emailed again, walk-in), so they live in their own table.
CREATE TABLE idea_resume_tokens (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  idea_id       INT UNSIGNED NOT NULL,
  token_hash    CHAR(64) NOT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at  DATETIME NULL,
  UNIQUE KEY uq_resume_token (token_hash),
  KEY idx_resume_idea (idea_id),
  CONSTRAINT fk_resume_idea FOREIGN KEY (idea_id) REFERENCES ideas(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Commitment fee payments (wallet). History is kept; the current payment is chosen by Wallet::current().
CREATE TABLE idea_payments (
  id                         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  idea_id                    INT UNSIGNED NOT NULL,
  method                     ENUM('paystack','manual') NOT NULL,
  status                     ENUM('PENDING','AWAITING_CONFIRMATION','PAID','FAILED') NOT NULL DEFAULT 'PENDING',
  amount_kobo                INT UNSIGNED NOT NULL,
  currency                   CHAR(3) NOT NULL DEFAULT 'NGN',
  reference                  VARCHAR(64) NOT NULL,
  -- Paystack
  paystack_access_code       VARCHAR(100) NULL,
  paystack_authorization_url VARCHAR(500) NULL,
  paystack_transaction_id    BIGINT UNSIGNED NULL,
  channel                    VARCHAR(40) NULL,
  -- Manual bank transfer / paid at the centre
  sender_name                VARCHAR(120) NULL,
  sender_bank                VARCHAR(120) NULL,
  claimed_amount_kobo        INT UNSIGNED NULL,
  transfer_date              DATE NULL,
  proof_file_id              INT UNSIGNED NULL,
  note                       VARCHAR(500) NULL,
  -- Where to send a refund (manual payments)
  refund_account_name        VARCHAR(120) NULL,
  refund_account_number      VARCHAR(20) NULL,
  refund_bank                VARCHAR(120) NULL,
  receipt_no                 VARCHAR(20) NULL,
  confirmed_by               INT UNSIGNED NULL,
  confirmed_at               DATETIME NULL,
  failure_reason             VARCHAR(500) NULL,
  paid_at                    DATETIME NULL,
  refund_status              ENUM('NONE','PENDING','PROCESSING','REFUNDED') NOT NULL DEFAULT 'NONE',
  refund_reference           VARCHAR(100) NULL,
  refund_note                VARCHAR(500) NULL,
  refund_queued_at           DATETIME NULL,
  refunded_by                INT UNSIGNED NULL,
  refunded_at                DATETIME NULL,
  created_by_user            INT UNSIGNED NULL,
  created_at                 DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                 DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_payments_reference (reference),
  UNIQUE KEY uq_payments_receipt (receipt_no),
  KEY idx_payments_idea (idea_id, status),
  KEY idx_payments_status (status, created_at),
  KEY idx_payments_refund (refund_status),
  CONSTRAINT fk_payments_idea FOREIGN KEY (idea_id) REFERENCES ideas(id) ON DELETE CASCADE,
  CONSTRAINT fk_payments_proof FOREIGN KEY (proof_file_id) REFERENCES files(id) ON DELETE SET NULL,
  CONSTRAINT fk_payments_confirmed_by FOREIGN KEY (confirmed_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_payments_refunded_by FOREIGN KEY (refunded_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_payments_created_by FOREIGN KEY (created_by_user) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Course leads for counsellors (LS-03, LS-04)
CREATE TABLE leads (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id     INT UNSIGNED NULL,
  client_name    VARCHAR(120) NOT NULL,
  contact        VARCHAR(190) NULL,
  email          VARCHAR(190) NULL,
  phone          VARCHAR(40) NULL,
  technology_id  VARCHAR(60) NULL,
  course_id      VARCHAR(60) NULL,
  type           ENUM('info','enrol') NOT NULL,
  source         ENUM('portal','website','invite') NOT NULL DEFAULT 'portal',
  invited_by     VARCHAR(120) NULL,
  status         ENUM('NEW','CONTACTED','ENROLLED','NOT_INTERESTED') NOT NULL DEFAULT 'NEW',
  notes          TEXT NULL,
  counsellor_id  INT UNSIGNED NULL,
  contacted_at   DATETIME NULL,
  enrolled_at    DATETIME NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_leads_status (status),
  CONSTRAINT fk_leads_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
  CONSTRAINT fk_leads_technology FOREIGN KEY (technology_id) REFERENCES technologies(id) ON DELETE SET NULL,
  CONSTRAINT fk_leads_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE SET NULL,
  CONSTRAINT fk_leads_counsellor FOREIGN KEY (counsellor_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Email/SMS outbox. Rows are sent by bin/send-notifications.php (cron) or immediately.
CREATE TABLE lead_messages (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  lead_id         INT UNSIGNED NOT NULL,
  staff_id        INT UNSIGNED NULL,
  staff_name      VARCHAR(120) NOT NULL,
  channel         ENUM('email') NOT NULL DEFAULT 'email',
  recipient       VARCHAR(190) NOT NULL,
  subject         VARCHAR(255) NOT NULL,
  body            TEXT NOT NULL,
  notification_id INT UNSIGNED NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_lead_messages_lead (lead_id, created_at),
  CONSTRAINT fk_lead_messages_lead FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
  CONSTRAINT fk_lead_messages_staff FOREIGN KEY (staff_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE notifications (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  audience    ENUM('client','staff','counsellor','lead') NOT NULL,
  channel     ENUM('email','sms') NOT NULL,
  recipient   VARCHAR(190) NOT NULL,
  subject     VARCHAR(255) NOT NULL,
  body        TEXT NOT NULL,
  html_body   MEDIUMTEXT NULL,
  attachments JSON NULL,
  project_id  INT UNSIGNED NULL,
  status      ENUM('queued','sent','failed','logged') NOT NULL DEFAULT 'queued',
  attempts    TINYINT UNSIGNED NOT NULL DEFAULT 0,
  error       VARCHAR(500) NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at     DATETIME NULL,
  KEY idx_notifications_status (status, created_at),
  CONSTRAINT fk_notifications_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Audit trail: stage changes, publishing, permission changes (NFR Auditability)
CREATE TABLE activity_log (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id  INT UNSIGNED NULL,
  actor_type  ENUM('staff','client','system') NOT NULL,
  actor_id    INT UNSIGNED NULL,
  actor_name  VARCHAR(160) NOT NULL,
  action      VARCHAR(500) NOT NULL,
  ip_address  VARCHAR(45) NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_activity_project (project_id, created_at),
  CONSTRAINT fk_activity_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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

-- Admin settings (payment credentials, bank details, notification drivers).
-- Secrets are encrypted with AES-256-GCM using a key derived from config app.key; they are never returned by the API.
CREATE TABLE settings (
  setting_key VARCHAR(80) NOT NULL PRIMARY KEY,
  value       TEXT NULL,
  is_secret   TINYINT(1) NOT NULL DEFAULT 0,
  updated_by  INT UNSIGNED NULL,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_settings_user FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Website content managed by admins (single JSON document)
CREATE TABLE site_content (
  id          TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  content     LONGTEXT NOT NULL,
  updated_by  INT UNSIGNED NULL,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_content_user FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One-time sign-in codes for clients (hashed, short-lived, attempt-limited)
CREATE TABLE otp_codes (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id  INT UNSIGNED NOT NULL,
  code_hash   CHAR(64) NOT NULL,
  expires_at  DATETIME NOT NULL,
  attempts    TINYINT UNSIGNED NOT NULL DEFAULT 0,
  consumed_at DATETIME NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_otp_project (project_id, created_at),
  CONSTRAINT fk_otp_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sliding-window rate limiting for sign-in and public forms
CREATE TABLE rate_limits (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  bucket      VARCHAR(190) NOT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_rate_bucket (bucket, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Quotes sent to idea owners; accepting online registers the project automatically
CREATE TABLE quotes (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  idea_id          INT UNSIGNED NOT NULL,
  amount           DECIMAL(14,2) NOT NULL,
  currency         CHAR(3) NOT NULL DEFAULT 'NGN',
  summary          TEXT NOT NULL,
  timeline_weeks   SMALLINT UNSIGNED NULL,
  valid_until      DATE NOT NULL,
  proposal_file_id INT UNSIGNED NULL,
  lead_id          INT UNSIGNED NULL,
  target_date      DATE NULL,
  token_hash       CHAR(64) NOT NULL,
  status           ENUM('sent','accepted','declined','withdrawn') NOT NULL DEFAULT 'sent',
  client_note      VARCHAR(1000) NULL,
  accepted_name    VARCHAR(120) NULL,
  sent_by          INT UNSIGNED NULL,
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  responded_at     DATETIME NULL,
  KEY idx_quotes_idea (idea_id, status),
  CONSTRAINT fk_quotes_idea FOREIGN KEY (idea_id) REFERENCES ideas(id) ON DELETE CASCADE,
  CONSTRAINT fk_quotes_file FOREIGN KEY (proposal_file_id) REFERENCES files(id) ON DELETE SET NULL,
  CONSTRAINT fk_quotes_lead FOREIGN KEY (lead_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_quotes_sender FOREIGN KEY (sent_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Staff "forgot password" links (single use, 1 hour)
CREATE TABLE password_resets (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     INT UNSIGNED NOT NULL,
  token_hash  CHAR(64) NOT NULL,
  expires_at  DATETIME NOT NULL,
  used_at     DATETIME NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_password_resets_token (token_hash),
  CONSTRAINT fk_resets_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Course funnel tracking: views, clicks, requests, enrolments, invites (LS-05)
CREATE TABLE course_events (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  course_id      VARCHAR(60) NULL,
  technology_id  VARCHAR(60) NULL,
  project_id     INT UNSIGNED NULL,
  event          ENUM('view','click','request','enrol','invite') NOT NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_course_events (course_id, event, created_at),
  CONSTRAINT fk_ce_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE SET NULL,
  CONSTRAINT fk_ce_technology FOREIGN KEY (technology_id) REFERENCES technologies(id) ON DELETE SET NULL,
  CONSTRAINT fk_ce_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Scope changes requested by the client or the team
CREATE TABLE change_requests (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id     INT UNSIGNED NOT NULL,
  title          VARCHAR(160) NOT NULL,
  description    TEXT NOT NULL,
  requested_by   ENUM('client','team') NOT NULL,
  requester_name VARCHAR(120) NOT NULL,
  status         ENUM('SUBMITTED','REVIEWING','QUOTED','APPROVED','DECLINED','COMPLETED') NOT NULL DEFAULT 'SUBMITTED',
  impact_cost    DECIMAL(14,2) NULL,
  impact_days    SMALLINT NULL,
  currency       CHAR(3) NOT NULL DEFAULT 'NGN',
  response_note  TEXT NULL,
  decided_at     DATETIME NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_change_requests_project (project_id, status),
  CONSTRAINT fk_cr_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Delivery handover checklist
CREATE TABLE handover_items (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  project_id   INT UNSIGNED NOT NULL,
  title        VARCHAR(160) NOT NULL,
  done_at      DATETIME NULL,
  done_by      VARCHAR(120) NULL,
  sort_order   INT NOT NULL DEFAULT 0,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_handover_project (project_id, sort_order),
  CONSTRAINT fk_handover_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------- Scholarship programme (/scholarship) ----------------

CREATE TABLE scholarship_programme (
  id              TINYINT UNSIGNED NOT NULL PRIMARY KEY DEFAULT 1,
  title           VARCHAR(160) NOT NULL,
  tagline         VARCHAR(255) NULL,
  intro           TEXT NULL,
  fee_kobo        INT UNSIGNED NOT NULL DEFAULT 2700000,
  currency        CHAR(3) NOT NULL DEFAULT 'NGN',
  seats           SMALLINT UNSIGNED NULL,
  deadline        DATE NULL,
  -- Courses, benefits, steps and contact details: the parts of the page an admin edits.
  content         LONGTEXT NULL,
  -- The application form applicants download once their fee is confirmed.
  form_file_id    INT UNSIGNED NULL,
  form_label      VARCHAR(160) NOT NULL DEFAULT 'Scholarship application form',
  -- Off hides /scholarship and refuses new applications.
  active          TINYINT(1) NOT NULL DEFAULT 1,
  closed_message  VARCHAR(255) NULL,
  updated_by      INT UNSIGNED NULL,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_scholarship_form FOREIGN KEY (form_file_id) REFERENCES files(id) ON DELETE SET NULL,
  CONSTRAINT fk_scholarship_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE scholarship_batches (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(80) NOT NULL,
  exam_date   DATE NULL,
  exam_time   VARCHAR(40) NULL,
  venue       VARCHAR(255) NULL,
  capacity    SMALLINT UNSIGNED NULL,
  notes       VARCHAR(500) NULL,
  active      TINYINT(1) NOT NULL DEFAULT 1,
  sort_order  SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE scholarship_partners (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  slug             VARCHAR(60) NOT NULL,
  name             VARCHAR(120) NOT NULL,
  full_name        VARCHAR(200) NULL,
  logo_file_id     INT UNSIGNED NULL,
  accent           CHAR(7) NOT NULL DEFAULT '#0a7a3c',
  website          VARCHAR(190) NULL,
  email            VARCHAR(190) NULL,
  phone            VARCHAR(60) NULL,
  -- The page's own wording; anything left empty falls back to the programme's.
  programme_title  VARCHAR(200) NULL,
  tagline          VARCHAR(255) NULL,
  intro            TEXT NULL,
  -- objectives, tracks, pathway, eligibility and the "who is behind this" paragraphs
  content          LONGTEXT NULL,
  active           TINYINT(1) NOT NULL DEFAULT 1,
  sort_order       SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  views            INT UNSIGNED NOT NULL DEFAULT 0,
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_scholarship_partner_slug (slug),
  CONSTRAINT fk_scholarship_partner_logo FOREIGN KEY (logo_file_id) REFERENCES files(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE scholarship_applicants (
  id                         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ref                        VARCHAR(20) NOT NULL,
  -- Lets someone return to their status page from the link we email them.
  token                      CHAR(48) NOT NULL,
  full_name                  VARCHAR(120) NOT NULL,
  email                      VARCHAR(190) NOT NULL,
  phone                      VARCHAR(40) NOT NULL,
  address                    VARCHAR(255) NOT NULL,
  state                      VARCHAR(80) NOT NULL,
  nationality                VARCHAR(80) NOT NULL,
  course                     VARCHAR(120) NULL,
  partner_slug               VARCHAR(60) NULL,
  batch_id                   INT UNSIGNED NULL,
  -- Payment of the form fee, mirroring idea_payments so staff see the same words.
  method                     ENUM('paystack','manual') NULL,
  status                     ENUM('PENDING','AWAITING_CONFIRMATION','PAID','FAILED') NOT NULL DEFAULT 'PENDING',
  amount_kobo                INT UNSIGNED NOT NULL,
  currency                   CHAR(3) NOT NULL DEFAULT 'NGN',
  reference                  VARCHAR(64) NULL,
  paystack_access_code       VARCHAR(100) NULL,
  paystack_authorization_url VARCHAR(500) NULL,
  paystack_transaction_id    BIGINT UNSIGNED NULL,
  channel                    VARCHAR(40) NULL,
  sender_name                VARCHAR(120) NULL,
  sender_bank                VARCHAR(120) NULL,
  transfer_date              DATE NULL,
  proof_file_id              INT UNSIGNED NULL,
  failure_reason             VARCHAR(255) NULL,
  paid_at                    DATETIME NULL,
  confirmed_by               INT UNSIGNED NULL,
  staff_note                 VARCHAR(500) NULL,
  created_at                 DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                 DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_scholarship_ref (ref),
  UNIQUE KEY uq_scholarship_token (token),
  KEY idx_scholarship_status (status, created_at),
  KEY idx_scholarship_reference (reference),
  CONSTRAINT fk_scholarship_batch FOREIGN KEY (batch_id) REFERENCES scholarship_batches(id) ON DELETE SET NULL,
  CONSTRAINT fk_scholarship_proof FOREIGN KEY (proof_file_id) REFERENCES files(id) ON DELETE SET NULL,
  CONSTRAINT fk_scholarship_confirmed_by FOREIGN KEY (confirmed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The programme as it stands on the flier; an admin edits all of it in the panel.
INSERT INTO scholarship_programme (id, title, tagline, intro, fee_kobo, seats, deadline, content, active)
SELECT 1,
       'Nigeria Independence Day Scholarship Programme',
       'Learn · Grow · Build your future',
       'This Independence Day, invest in your future. APTECH Computer Education, in partnership with AI Projects LTD, is offering a special scholarship opportunity for everyone. Pay the form fee, sit the entrance exam, and study completely free of tuition.',
       2700000, 500, '2026-10-12',
       '{"courses":[{"title":"CyberSecurity","description":"Protect networks, learn threat analysis, and digital defence essentials."},{"title":"Data Analysis","description":"Master Excel, SQL and data visualisation tools for data-driven decisions."},{"title":"Programming with Python","description":"Build foundational programming logic and automation scripts."},{"title":"AI Prompt Engineering","description":"Harness cutting-edge generative AI models for maximum productivity."},{"title":"Office Automation","description":"Practical proficiency in MS Word, Excel, PowerPoint and office tools."},{"title":"Digital Marketing & Design","description":"Explore web development, graphic design (Photoshop/CorelDRAW) and SEO."}],"benefits":[{"title":"Expert instructors","description":"Learn directly from certified and highly experienced tech professionals."},{"title":"Practical training","description":"Hands-on, practical-focused curriculum designed for real-world application."},{"title":"Career support","description":"Boost your professional resume and open doors to competitive tech careers."},{"title":"100% tuition free","description":"Pass the scholarship entrance exam and study completely free of tuition costs."}],"steps":[{"title":"Get the form","description":"Register and pay the scholarship form fee."},{"title":"Take the exam","description":"Sit the entrance assessment exam at the centre."},{"title":"Study free","description":"Pass and secure your 100% tuition scholarship."}],"contact":{"address":"Disney Chicken Plaza, Plot 35 Aliyu Makama by Barnawa Complex, Opposite A A Rano Filling Station, Kaduna State.","organisers":"APTECH Computer Education | AI Projects LTD","phones":["0903 848 3923 (call & WhatsApp)","0704 988 9785 (WhatsApp)","0703 384 7560","0704 982 8278"]}}',
       1
WHERE NOT EXISTS (SELECT 1 FROM scholarship_programme WHERE id = 1);
