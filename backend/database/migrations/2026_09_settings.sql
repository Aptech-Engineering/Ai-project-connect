-- Admin settings (September 2026)
-- Adds the settings table used by Engineering Panel -> Settings (payment credentials, bank details, notification drivers).
-- Run after 2026_09_wallet.sql. New installs get this from schema.sql.
-- After importing, open the admin panel and enter your Paystack keys and bank details; the
-- payments fee/bank fields are no longer part of the website content document.

SET NAMES utf8mb4;

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
