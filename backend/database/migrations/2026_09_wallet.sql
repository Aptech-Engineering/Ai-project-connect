-- Commitment fee wallet (September 2026)
-- Run once on existing installs (phpMyAdmin → Import, or: mysql -u USER -p DATABASE < 2026_09_wallet.sql).
-- New installs get all of this from schema.sql.

SET NAMES utf8mb4;

-- Drafts: partially filled applications, completed and paid before they are submitted.
ALTER TABLE ideas
  MODIFY name         VARCHAR(120) NULL,
  MODIFY phone        VARCHAR(40)  NULL,
  MODIFY country      VARCHAR(80)  NULL,
  MODIFY state        VARCHAR(80)  NULL,
  MODIFY title        VARCHAR(160) NULL,
  MODIFY category     VARCHAR(80)  NULL,
  MODIFY platforms    VARCHAR(500) NULL,
  MODIFY problem      TEXT NULL,
  MODIFY target_users TEXT NULL,
  MODIFY features     TEXT NULL,
  MODIFY budget       VARCHAR(80) NULL,
  MODIFY timeline     VARCHAR(80) NULL,
  MODIFY status       ENUM('DRAFT','NEW','REVIEWING','QUOTE_SENT','ACCEPTED','DECLINED') NOT NULL DEFAULT 'NEW',
  ADD COLUMN source          ENUM('online','walk_in') NOT NULL DEFAULT 'online' AFTER status,
  ADD COLUMN created_by_user INT UNSIGNED NULL AFTER source,
  ADD COLUMN last_saved_at   DATETIME NULL AFTER project_id,
  ADD COLUMN submitted_at    DATETIME NULL AFTER last_saved_at,
  ADD KEY idx_ideas_email (email, status),
  ADD CONSTRAINT fk_ideas_creator FOREIGN KEY (created_by_user) REFERENCES users(id) ON DELETE SET NULL;

-- Ideas submitted before the wallet existed count as submitted when they were created.
UPDATE ideas SET submitted_at = created_at WHERE submitted_at IS NULL AND status <> 'DRAFT';

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

-- OPTIONAL: ideas already in the inbox have no commitment fee, so sending them a quote or converting them
-- is blocked until a fee is recorded. To exempt them, uncomment and run this (records a ₦0-reference
-- "paid at centre" entry for each open idea):
--
-- INSERT INTO idea_payments (idea_id, method, status, amount_kobo, currency, reference, note, receipt_no, paid_at, confirmed_at)
-- SELECT id, 'manual', 'PAID', 0, 'NGN', CONCAT('LEGACY-', ref), 'Submitted before the commitment fee', CONCAT('RCPT-LEGACY-', id), created_at, NOW()
-- FROM ideas WHERE status IN ('NEW','REVIEWING','QUOTE_SENT');
