-- Partner landing pages hosted on our own domain:
--   aiprojectconnect.com.ng/scholarship/partner/<slug>
--
-- An admin adds a partner in the panel (logo, colour, their wording) and the page
-- exists straight away, so an organisation that does not want to touch its own
-- website can simply link to ours.
--
-- Run once on an existing install (phpMyAdmin → SQL). A fresh install gets it from
-- schema.sql.

CREATE TABLE IF NOT EXISTS scholarship_partners (
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

-- Which partner sent an applicant, when they arrive from a partner page.
ALTER TABLE scholarship_applicants
  ADD COLUMN partner_slug VARCHAR(60) NULL AFTER course;
