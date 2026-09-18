<?php

// Copy this file to config.php and fill in real values. Never commit config.php.

return [
    'app' => [
        // 'production' on Nairahost; 'local' on your computer
        'env' => 'production',
        'debug' => false,
        // Public URL of the website (used in emails)
        'url' => 'https://yourdomain.com',
        // Long random secret (at least 32 characters). Generate with: php -r "echo bin2hex(random_bytes(32));"
        'key' => 'CHANGE-ME-TO-A-LONG-RANDOM-STRING',
        'timezone' => 'Africa/Lagos',
        // Website address used in resume and payment links (defaults to url)
        'frontend_url' => '',
    ],

    // From cPanel → MySQL Databases
    'db' => [
        'host' => 'localhost',
        'port' => 3306,
        'name' => 'cpaneluser_apc',
        'user' => 'cpaneluser_apc',
        'pass' => 'CHANGE-ME',
        'charset' => 'utf8mb4',
    ],

    // Only needed if the frontend is on a different domain (e.g. local Next.js dev server)
    'cors' => [
        'allowed_origins' => [],
    ],

    'session' => [
        'name' => 'apc_session',
        'secure' => true, // requires HTTPS (keep true in production)
        'lifetime_minutes' => 120,
    ],

    'uploads' => [
        // Keep this OUTSIDE public_html
        'path' => __DIR__ . '/../storage/uploads',
        'max_pdf_mb' => 10,
        'max_image_mb' => 5,
        'max_document_mb' => 20,
        'max_proof_mb' => 5, // proof of bank transfer for the commitment fee
    ],

    'otp' => [
        'ttl_minutes' => 10,
        'max_attempts' => 5,
        'resend_seconds' => 60,
        // Local testing only: returns the code in the API response. Ignored in production.
        'expose_in_response' => false,
    ],

    'mail' => [
        // 'mail' = send with PHP mail() (works on cPanel), 'log' = store in notifications table only
        'driver' => 'mail',
        'from_email' => 'no-reply@yourdomain.com',
        'from_name' => 'AI Project Connect',
        'reply_to' => 'hello@yourdomain.com',
    ],

    'sms' => [
        // 'termii' to send real SMS, 'log' to store only
        'driver' => 'log',
        'termii_api_key' => '',
        'termii_url' => 'https://api.ng.termii.com/api/sms/send',
        'termii_channel' => 'generic',
        'sender_id' => 'APConnect',
        'default_country_code' => '234',
    ],

    // Commitment fee payments.
    // API keys, the test/live mode, bank details and the fee are entered in the Engineering Panel
    // (Settings → Payments) and stored encrypted in the database — not here.
    // The keys below are only a fallback for installs that have not used the settings screen yet.
    'paystack' => [
        'secret_key' => '',
        'public_key' => '',
        // Paystack sends the payer back here after checkout; it verifies and redirects to the website /apply page
        'callback_url' => 'https://yourdomain.com/api/payments/paystack/callback',
        'base_url' => 'https://api.paystack.co',
        // true = never call Paystack (local development and tests): payments verify as successful
        'fake' => false,
    ],

    // Email/SMS credentials are entered in the Engineering Panel (Settings → Notifications).
    // These stay here as a fallback and for the addresses the panel itself writes to.
    'notifications' => [
        // true = send as soon as they're created; false = send with the cron job bin/send-notifications.php
        'send_immediately' => true,
        'admin_email' => 'admin@yourdomain.com',
        'admissions_email' => 'admissions@yourdomain.com',
    ],
];
