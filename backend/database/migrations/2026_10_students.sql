-- Students and their fees.
--
-- A counsellor keeps the register in the panel: who is enrolled, what their fee is,
-- and every payment as it comes in. Each student opens /student on their phone, signs
-- in once with their Student ID and name, and sees one big word — CLEARED or NOT
-- CLEARED — to show the guard at the gate.
--
-- Run once on an existing install (phpMyAdmin → SQL). A fresh install gets it from
-- schema.sql.

CREATE TABLE IF NOT EXISTS students (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  -- What the student types to sign in, e.g. APC/26/0001.
  student_id    VARCHAR(30) NOT NULL,
  first_name    VARCHAR(80) NOT NULL,
  last_name     VARCHAR(80) NOT NULL,
  phone         VARCHAR(40) NULL,
  email         VARCHAR(190) NULL,
  course        VARCHAR(160) NULL,
  batch         VARCHAR(80) NULL,
  -- The whole fee for the course. Payments are counted against it.
  fee_kobo      BIGINT UNSIGNED NOT NULL DEFAULT 0,
  currency      CHAR(3) NOT NULL DEFAULT 'NGN',
  -- What a counsellor has decided, over and above the arithmetic:
  --   AUTO       the balance decides
  --   DISCUSSION a payment plan is being worked out
  --   BLOCKED    keep them out whatever the balance says
  --   WAIVED     nothing to pay
  standing      ENUM('AUTO','DISCUSSION','BLOCKED','WAIVED') NOT NULL DEFAULT 'AUTO',
  -- Let them through the gate while a plan runs, even though they still owe.
  gate_pass     TINYINT(1) NOT NULL DEFAULT 0,
  -- A line the student and the guard both see, e.g. "Paying ₦20,000 on Friday".
  gate_note     VARCHAR(255) NULL,
  -- Staff only; never leaves the panel.
  note          TEXT NULL,
  started_on    DATE NULL,
  due_on        DATE NULL,
  -- Lets their phone refresh without typing their name again.
  status_token  CHAR(48) NOT NULL,
  last_seen_at  DATETIME NULL,
  active        TINYINT(1) NOT NULL DEFAULT 1,
  created_by    INT UNSIGNED NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_students_student_id (student_id),
  KEY idx_students_name (last_name, first_name),
  CONSTRAINT fk_students_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS student_payments (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_id  INT UNSIGNED NOT NULL,
  amount_kobo BIGINT UNSIGNED NOT NULL,
  method      ENUM('cash','transfer','pos','paystack','other') NOT NULL DEFAULT 'cash',
  reference   VARCHAR(120) NULL,
  paid_on     DATE NOT NULL,
  note        VARCHAR(255) NULL,
  recorded_by INT UNSIGNED NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_student_payments_student (student_id, paid_on),
  CONSTRAINT fk_student_payments_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_student_payments_by FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
