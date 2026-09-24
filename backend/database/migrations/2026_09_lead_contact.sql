-- Course leads: keep the email and the phone number apart, and record every
-- follow-up a counsellor sends, so the lead screen shows how to reach someone
-- and what has already been said.
--
-- Run once on an existing install (phpMyAdmin → SQL, or the mysql client).
-- A fresh install gets all of this from schema.sql.

ALTER TABLE leads
  ADD COLUMN email VARCHAR(190) NULL AFTER contact,
  ADD COLUMN phone VARCHAR(40) NULL AFTER email;

-- Split what the single `contact` column held: "ada@x.test · 0803…", an email, or a phone.
UPDATE leads
SET email = NULLIF(TRIM(CASE WHEN contact LIKE '%@%' THEN SUBSTRING_INDEX(contact, '·', 1) ELSE '' END), ''),
    phone = NULLIF(TRIM(CASE
              WHEN contact LIKE '%·%' THEN SUBSTRING_INDEX(contact, '·', -1)
              WHEN contact NOT LIKE '%@%' THEN contact
              ELSE '' END), '')
WHERE contact IS NOT NULL AND contact <> '';

CREATE TABLE IF NOT EXISTS lead_messages (
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

-- Follow-ups go to someone who is not a client yet, so the outbox can say so.
ALTER TABLE notifications
  MODIFY audience ENUM('client','staff','counsellor','lead') NOT NULL;
