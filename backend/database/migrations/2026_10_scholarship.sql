-- Nigeria Independence Month Scholarship Programme (/scholarship).
--
-- One editable programme, its exam batches, and the people who applied and paid
-- the form fee. Applicants are not clients and not leads: they pay a form fee,
-- get a downloadable form, and sit an exam on a batch date.
--
-- Run once on an existing install (phpMyAdmin → SQL). A fresh install gets it
-- from schema.sql.

CREATE TABLE IF NOT EXISTS scholarship_programme (
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

CREATE TABLE IF NOT EXISTS scholarship_batches (
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

CREATE TABLE IF NOT EXISTS scholarship_applicants (
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
       'Nigeria Independence Month Scholarship Programme',
       'Learn · Grow · Build your future',
       'This Independence Month, invest in your future. APTECH Computer Education, in partnership with AI Projects LTD, is offering a special scholarship opportunity for everyone. Pay the form fee, sit the entrance exam, and study completely free of tuition.',
       2700000, 500, '2026-10-12',
       '{"courses":[{"title":"CyberSecurity","description":"Protect networks, learn threat analysis, and digital defence essentials."},{"title":"Data Analysis","description":"Master Excel, SQL and data visualisation tools for data-driven decisions."},{"title":"Programming with Python","description":"Build foundational programming logic and automation scripts."},{"title":"AI Prompt Engineering","description":"Harness cutting-edge generative AI models for maximum productivity."},{"title":"Office Automation","description":"Practical proficiency in MS Word, Excel, PowerPoint and office tools."},{"title":"Digital Marketing & Design","description":"Explore web development, graphic design (Photoshop/CorelDRAW) and SEO."}],"benefits":[{"title":"Expert instructors","description":"Learn directly from certified and highly experienced tech professionals."},{"title":"Practical training","description":"Hands-on, practical-focused curriculum designed for real-world application."},{"title":"Career support","description":"Boost your professional resume and open doors to competitive tech careers."},{"title":"100% tuition free","description":"Pass the scholarship entrance exam and study completely free of tuition costs."}],"steps":[{"title":"Get the form","description":"Register and pay the scholarship form fee."},{"title":"Take the exam","description":"Sit the entrance assessment exam at the centre."},{"title":"Study free","description":"Pass and secure your 100% tuition scholarship."}],"contact":{"address":"Disney Chicken Plaza, Plot 35 Aliyu Makama by Barnawa Complex, Opposite A A Rano Filling Station, Kaduna State.","organisers":"APTECH Computer Education | AI Projects LTD","phones":["0903 848 3923 (call & WhatsApp)","0704 988 9785 (WhatsApp)","0703 384 7560","0704 982 8278"]}}',
       1
WHERE NOT EXISTS (SELECT 1 FROM scholarship_programme WHERE id = 1);
