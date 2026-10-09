-- Attendance: a student scans the code at the gate to sign in, and signs out when
-- they leave. A session that nobody closes is closed by the clock.
--
-- Run once on an existing install (phpMyAdmin → SQL). A fresh install gets it from
-- schema.sql.

CREATE TABLE IF NOT EXISTS student_attendance (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  student_id     INT UNSIGNED NOT NULL,
  signed_in_at   DATETIME NOT NULL,
  -- NULL while they are still in the centre.
  signed_out_at  DATETIME NULL,
  -- How the session ended: they pressed it, the clock did it, or staff did.
  ended_by       ENUM('student','clock','staff') NULL,
  -- How it started: the printed code, or a member of staff signing them in.
  source         ENUM('qr','staff') NOT NULL DEFAULT 'qr',
  note           VARCHAR(255) NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_attendance_student (student_id, signed_in_at),
  KEY idx_attendance_open (signed_out_at, signed_in_at),
  CONSTRAINT fk_attendance_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
