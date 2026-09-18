<?php

declare(strict_types=1);

namespace App\Setup;

use App\Core\Database;
use App\Core\Settings;

/** Installs the schema, the course catalogue and (optionally) demo data matching the frontend mock. */
final class Seeder
{
    /** Resume token of the demo draft application (demo data only). */
    public const DEMO_DRAFT_TOKEN = 'demo0draft0resume0token0hallbook0000000000000000000000000000000001';

    public static function installSchema(): void
    {
        $sql = (string) file_get_contents(APC_ROOT . '/database/schema.sql');
        $sql = (string) preg_replace('/^\s*--.*$/m', '', $sql);
        foreach (array_filter(array_map('trim', explode(";\n", str_replace("\r\n", "\n", $sql)))) as $statement) {
            Database::pdo()->exec($statement);
        }
    }

    public static function createAdmin(string $name, string $email, string $password): int
    {
        $email = strtolower(trim($email));
        $existing = Database::value('SELECT id FROM users WHERE email = ?', [$email]);
        if ($existing) {
            Database::update('users', ['role' => 'admin', 'status' => 'active', 'password_hash' => password_hash($password, PASSWORD_DEFAULT)], ['id' => (int) $existing]);
            return (int) $existing;
        }
        return Database::insert('users', [
            'name' => $name,
            'email' => $email,
            'role' => 'admin',
            'job_title' => 'Administrator',
            'password_hash' => password_hash($password, PASSWORD_DEFAULT),
        ]);
    }

    public static function seedCatalog(): void
    {
        if ((int) Database::value('SELECT COUNT(*) FROM courses') > 0) {
            return;
        }
        $courses = [
            ['react', 'Front-End Web Development with React', 'Build modern, responsive websites and web apps with React, from components to deployment.', '12 weeks', 'Hybrid · Weekends', 21, 185000],
            ['next', 'Full-Stack Apps with Next.js', 'Go full-stack: pages, APIs, authentication and SEO with Next.js.', '10 weeks', 'Online · Live classes', 28, 210000],
            ['node', 'Back-End APIs with Node.js & Express', 'Design and build secure REST APIs that power web and mobile apps.', '10 weeks', 'In-centre · Weekdays', 14, 175000],
            ['nest', 'Scalable APIs with NestJS', null, '8 weeks', 'Online · Evenings', 35, 195000],
            ['postgres', 'Databases & SQL with PostgreSQL', null, '6 weeks', 'Hybrid · Evenings', 10, 120000],
            ['flutter', 'Mobile App Development with Flutter', 'Ship Android and iPhone apps from a single codebase with Flutter.', '14 weeks', 'In-centre · Weekends', 24, 220000],
            ['rn', 'Cross-Platform Apps with React Native', null, '12 weeks', 'Online · Live classes', 31, 205000],
            ['figma', 'UI/UX Design with Figma', 'Design beautiful, usable screens and prototypes that engineers love to build.', '8 weeks', 'Hybrid · Weekends', 7, 140000],
            ['cloud', 'Cloud Deployment & DevOps Essentials', null, '8 weeks', 'Online · Evenings', 42, 190000],
            ['firebase', 'Serverless Apps with Firebase', null, '6 weeks', 'Online · Self-paced + mentor', 12, 110000],
        ];
        foreach ($courses as $i => [$id, $title, $description, $duration, $format, $startsIn, $price]) {
            Database::insert('courses', [
                'id' => $id, 'title' => $title, 'description' => $description, 'duration' => $duration, 'format' => $format,
                'next_start' => self::day($startsIn), 'price' => $price, 'currency' => 'NGN', 'discount_percent' => 10,
                'discount_code' => 'APC10', 'published' => 1, 'sort_order' => $i + 1,
            ]);
        }

        $technologies = [
            ['react', 'React', 'Front-end', 'Re', '#61DAFB', 'react', 'Builds the screens your customers see and click on in their web browser.'],
            ['next', 'Next.js', 'Front-end', 'N', '#FFFFFF', 'next', 'Makes your website fast and easy for Google to find.'],
            ['node', 'Node.js', 'Back-end', 'Nd', '#8CC84B', 'node', 'The engine behind the scenes that handles logins, orders and payments.'],
            ['nest', 'NestJS', 'Back-end', 'Ns', '#E0234E', 'nest', 'Keeps the behind-the-scenes code organised as your app grows.'],
            ['postgres', 'PostgreSQL', 'Database', 'Pg', '#6FA8DC', 'postgres', 'Where your app safely stores its data — users, products and orders.'],
            ['flutter', 'Flutter', 'Mobile', 'Fl', '#54C5F8', 'flutter', 'Builds your Android (and later iPhone) app from one set of code.'],
            ['rn', 'React Native', 'Mobile', 'RN', '#61DAFB', 'rn', 'Lets one team build your app for both Android and iPhone.'],
            ['figma', 'Figma', 'Design', 'Fg', '#F24E1E', 'figma', 'Where your screens are drawn and approved before any code is written.'],
            ['aws', 'AWS Cloud', 'Hosting', 'Aw', '#FF9900', 'cloud', 'The rented computers that keep your app online day and night.'],
            ['firebase', 'Firebase', 'Back-end', 'Fb', '#FFCA28', 'firebase', 'Sends instant notifications and keeps data in sync across phones.'],
        ];
        foreach ($technologies as $i => [$id, $name, $category, $mark, $color, $course, $plain]) {
            Database::insert('technologies', [
                'id' => $id, 'name' => $name, 'category' => $category, 'mark' => $mark, 'color' => $color,
                'course_id' => $course, 'plain_description' => $plain, 'sort_order' => $i + 1,
            ]);
        }
    }

    /**
     * Payment and notification defaults for a new install. No API keys: admins enter those in
     * Engineering Panel → Settings, where they are encrypted at rest.
     */
    public static function seedSettings(): void
    {
        if ((int) Database::value('SELECT COUNT(*) FROM settings') > 0) {
            return;
        }
        Settings::save([
            'payments.commitmentFee' => 2000,
            'payments.currency' => 'NGN',
            'payments.paystackEnabled' => true,
            'payments.manualEnabled' => true,
            'payments.bankName' => 'Access Bank',
            'payments.accountName' => 'Aptech Computer Education',
            'payments.accountNumber' => '0000000000',
            'paystack.mode' => 'test',
        ], null);
    }

    /** Demo staff, clients, projects, ideas and leads (same stories as the frontend mock). */
    public static function seedDemo(string $staffPassword): void
    {
        $hash = password_hash($staffPassword, PASSWORD_DEFAULT);
        $staff = [];
        foreach ([
            ['tunde', 'Tunde Bakare', 'tunde@aptech.test', 'lead', 'Project lead'],
            ['grace', 'Grace Okon', 'grace@aptech.test', 'lead', 'Project lead'],
            ['chioma', 'Chioma Eze', 'chioma@aptech.test', 'engineer', 'Front-end engineer'],
            ['ibrahim', 'Ibrahim Sule', 'ibrahim@aptech.test', 'engineer', 'Back-end engineer'],
            ['zainab', 'Zainab Musa', 'zainab@aptech.test', 'engineer', 'UI/UX designer'],
            ['femi', 'Femi Adeyemi', 'femi@aptech.test', 'engineer', 'QA engineer'],
            ['david', 'David Nwosu', 'david@aptech.test', 'engineer', 'Mobile engineer'],
            ['aisha', 'Aisha Bello', 'aisha@aptech.test', 'counsellor', 'Course counsellor'],
        ] as [$key, $name, $email, $role, $title]) {
            $staff[$key] = Database::value('SELECT id FROM users WHERE email = ?', [$email])
                ?: Database::insert('users', ['name' => $name, 'email' => $email, 'role' => $role, 'job_title' => $title, 'password_hash' => $hash]);
        }
        $names = array_column(Database::all('SELECT id, name, job_title FROM users'), null, 'id');

        $clients = [
            'ada' => Database::insert('clients', ['name' => 'Ada Okafor', 'email' => 'ada@farmlink.test', 'phone' => '08031234821', 'organisation' => 'FarmLink', 'country' => 'Nigeria', 'state' => 'Lagos']),
            'kemi' => Database::insert('clients', ['name' => 'Dr. Kemi Balogun', 'email' => 'kemi@clinicqueue.test', 'phone' => '08051231190', 'organisation' => 'ClinicQueue', 'country' => 'Nigeria', 'state' => 'Oyo']),
            'segun' => Database::insert('clients', ['name' => 'Segun Afolabi', 'email' => 'segun@shopbeta.test', 'phone' => '08091237732', 'country' => 'Nigeria', 'state' => 'Lagos']),
            'ngozi' => Database::insert('clients', ['name' => 'Ngozi Umeh', 'email' => 'ngozi@edunest.test', 'phone' => '08071233057', 'organisation' => 'EduNest', 'country' => 'Nigeria', 'state' => 'Enugu']),
        ];

        $project = static function (array $p) use ($staff, $names): int {
            $id = Database::insert('projects', [
                'code' => $p['code'], 'client_id' => $p['client'], 'title' => $p['title'], 'tagline' => $p['tagline'],
                'category' => $p['category'], 'platforms' => $p['platforms'], 'stage' => $p['stage'], 'progress' => $p['progress'],
                'hold_reason' => $p['hold'] ?? null, 'paused_at_step' => $p['paused'] ?? null, 'lead_id' => $staff[$p['lead']],
                'start_date' => self::day($p['start']), 'target_date' => self::day($p['target']),
                'delivered_at' => isset($p['delivered']) ? self::day($p['delivered']) . ' 10:00:00' : null,
            ]);
            foreach ($p['team'] as $member) {
                Database::insert('project_members', ['project_id' => $id, 'user_id' => $staff[$member]]);
            }
            foreach ($p['updates'] as $u) {
                $author = $names[$staff[$u[1]]];
                $at = self::day($u[0]) . ' 09:30:00';
                $status = $u[5] ?? 'published';
                Database::insert('updates', [
                    'project_id' => $id, 'author_id' => $author['id'], 'author_name' => $author['name'], 'author_role' => $author['job_title'],
                    'kind' => $u[2], 'visibility' => $u[6] ?? 'client', 'status' => $status, 'title' => $u[3], 'body' => $u[4],
                    'created_at' => $at, 'published_at' => $status === 'published' ? $at : null,
                ]);
            }
            foreach ($p['milestones'] as $m) {
                Database::insert('milestones', [
                    'project_id' => $id, 'title' => $m[0], 'due_date' => self::day($m[1]),
                    'completed_at' => $m[2] !== null ? self::day($m[2]) . ' 12:00:00' : null,
                    'needs_client_approval' => $m[3] ? 1 : 0,
                    'client_approved_at' => $m[3] && $m[2] !== null ? self::day($m[2]) . ' 12:00:00' : null,
                ]);
            }
            foreach ($p['stack'] as [$tech, $usage]) {
                Database::insert('project_technologies', ['project_id' => $id, 'technology_id' => $tech, 'usage_note' => $usage]);
            }
            foreach ($p['messages'] ?? [] as [$day, $sender, $author, $body]) {
                Database::insert('messages', ['project_id' => $id, 'sender' => $sender, 'author_name' => $author, 'body' => $body, 'created_at' => self::day($day) . ' 11:00:00']);
            }
            return $id;
        };

        $farmlink = $project([
            'code' => 'APC-26-7KQ9X', 'client' => $clients['ada'], 'title' => 'FarmLink Marketplace', 'tagline' => 'Connecting smallholder farmers directly with city buyers.',
            'category' => 'Marketplace', 'platforms' => 'Web + Android', 'stage' => 'DEVELOPMENT', 'progress' => 62, 'lead' => 'tunde',
            'team' => ['tunde', 'chioma', 'ibrahim', 'zainab', 'femi'], 'start' => -58, 'target' => 76,
            'updates' => [
                [0, 'chioma', 'update', 'Buyer order tracking screen ready', "Buyers can now see each order move from 'Packed' to 'On the way' to 'Delivered'.", 'pending'],
                [-2, 'ibrahim', 'update', 'Paystack webhook retries flaky on staging', 'Seeing duplicate webhook calls on staging. Adding idempotency keys before the checkout demo.', 'published', 'internal'],
                [-3, 'ibrahim', 'update', 'Payment integration merged', 'Buyers can now pay by card or bank transfer. Money goes into a safe holding account until the farmer confirms delivery.'],
                [-6, 'chioma', 'update', 'Farmer onboarding screens done', 'Farmers can sign up with a phone number, add their farm location and upload their first produce listing in under 2 minutes.'],
                [-11, 'zainab', 'update', 'Design sign-off received', 'Thank you for approving the designs! All 24 screens are now locked and handed to the engineers.'],
                [-12, 'tunde', 'stage', 'Stage changed to In development', 'Engineers are building the features of your product.'],
                [-18, 'ibrahim', 'update', 'Database schema approved', "We've mapped out how your app stores farmers, buyers, products and orders so it stays fast as you grow."],
            ],
            'milestones' => [
                ['Proposal & quote accepted', -58, -58, false], ['Design sign-off', -12, -11, true], ['Farmer & buyer accounts', -5, -6, false],
                ['Payments & checkout demo', 4, null, true], ['Android app beta', 38, null, false], ['Launch & handover', 76, null, true],
            ],
            'stack' => [['react', 'Web front-end'], ['node', 'API server'], ['postgres', 'Database'], ['flutter', 'Android app']],
            'messages' => [
                [-9, 'client', 'Ada Okafor', 'Will farmers without smartphones be able to use it?'],
                [-9, 'team', 'Tunde Bakare', "Yes! Farmers can also list produce by SMS. We'll show you in the next demo."],
                [-1, 'client', 'Ada Okafor', 'Can buyers pay on delivery too?'],
            ],
        ]);

        $project([
            'code' => 'APC-26-M4TR8', 'client' => $clients['kemi'], 'title' => 'ClinicQueue', 'tagline' => "Book a doctor's appointment without waiting in line.",
            'category' => 'Health', 'platforms' => 'Web', 'stage' => 'TESTING', 'progress' => 84, 'lead' => 'grace',
            'team' => ['grace', 'chioma', 'ibrahim', 'femi'], 'start' => -96, 'target' => 18,
            'updates' => [
                [-1, 'femi', 'update', 'Round 2 testing: 14 of 17 issues fixed', 'We tested booking on 9 different phones. The remaining 3 issues are small layout fixes on older Android devices.'],
                [-4, 'grace', 'stage', 'Stage changed to Testing', "We're checking everything works correctly and fixing issues."],
                [-7, 'ibrahim', 'update', 'SMS reminders are live', 'Patients get a text message 24 hours and 1 hour before their appointment.'],
            ],
            'milestones' => [['Design sign-off', -70, -71, true], ['Booking & queue features', -20, -18, false], ['User acceptance testing', 6, null, true], ['Go live', 18, null, true]],
            'stack' => [['next', 'Website & patient portal'], ['nest', 'Booking server'], ['postgres', 'Appointments database'], ['aws', 'Hosting']],
        ]);

        $project([
            'code' => 'APC-26-B8WZ2', 'client' => $clients['segun'], 'title' => 'ShopBeta Delivery', 'tagline' => 'Same-day grocery delivery for Lekki and VI.',
            'category' => 'E-commerce', 'platforms' => 'Android + iOS', 'stage' => 'DELIVERED', 'progress' => 100, 'lead' => 'tunde', 'delivered' => -12,
            'team' => ['tunde', 'david', 'ibrahim', 'zainab'], 'start' => -160, 'target' => -10,
            'updates' => [
                [-12, 'tunde', 'stage', 'Your product is live!', 'ShopBeta is now on the Google Play Store and Apple App Store. Handover documents are in your Files section.'],
                [-16, 'david', 'update', 'App Store approval received', 'Apple approved the iPhone app on the first submission.'],
            ],
            'milestones' => [['Design sign-off', -130, -131, true], ['Beta with 50 customers', -40, -38, false], ['Store launch & handover', -10, -12, true]],
            'stack' => [['rn', 'Android & iPhone app'], ['firebase', 'Notifications & live tracking'], ['node', 'Orders server'], ['figma', 'App design']],
        ]);

        $project([
            'code' => 'APC-26-H2NP6', 'client' => $clients['ngozi'], 'title' => 'EduNest Tutors', 'tagline' => 'Matching secondary school students with vetted tutors.',
            'category' => 'Education', 'platforms' => 'Web + Android', 'stage' => 'ON_HOLD', 'progress' => 34, 'lead' => 'grace', 'paused' => 2,
            'hold' => 'Waiting for your tutor onboarding content (intro videos and verification checklist) so we can finish the tutor sign-up flow.',
            'team' => ['grace', 'david', 'zainab'], 'start' => -50, 'target' => 64,
            'updates' => [
                [-2, 'grace', 'stage', 'Project paused: waiting for content', "We've paused development until we receive your tutor onboarding videos and verification checklist."],
                [-8, 'david', 'update', 'Student search & filters built', 'Students can search tutors by subject, class level, price and location.'],
            ],
            'milestones' => [['Design sign-off', -30, -31, true], ['Send tutor onboarding content', 2, null, true], ['Tutor sign-up & verification', 20, null, false]],
            'stack' => [['react', 'Web front-end'], ['flutter', 'Android app'], ['firebase', 'Chat & notifications']],
        ]);

        $project([
            'code' => 'APC-26-D5LC3', 'client' => $clients['ada'], 'title' => 'KoboSave', 'tagline' => 'Group savings (ajo/esusu) made safe and transparent.',
            'category' => 'Fintech', 'platforms' => 'Android', 'stage' => 'DESIGN', 'progress' => 18, 'lead' => 'tunde',
            'team' => ['tunde', 'zainab'], 'start' => -14, 'target' => 120,
            'updates' => [
                [-6, 'zainab', 'update', 'Savings group screens ready for review', "Please review how members join a group, see the payout order and get reminders. Approve the design milestone when you're happy."],
                [-9, 'tunde', 'stage', 'Stage changed to Design', "We're planning screens and user flows. You'll be asked to approve them."],
            ],
            'milestones' => [['Proposal & quote accepted', -14, -14, false], ['Design sign-off', 5, null, true], ['Savings groups & wallet', 60, null, false]],
            'stack' => [['figma', 'App design'], ['flutter', 'Android app'], ['nest', 'Wallet server'], ['postgres', 'Transactions database']],
        ]);

        foreach ([
            ['IDEA-4QX7M', 'Bola Ogunleye', 'bola@mechanicnow.test', '08035550192', 'MechanicNow', 'Oyo', 'MechanicNow', 'Logistics', ['Android app', 'Admin dashboard'], 'When your car breaks down, finding a trusted mechanic nearby is hard and prices are unclear.', 'Car owners in Ibadan and Lagos, and independent mechanics.', 'Request a mechanic to your location, see price estimates upfront, rate mechanics, pay in the app.', '₦3M – ₦7M', '3 – 6 months', 'NEW', null, 0],
            ['IDEA-8JD2P', 'Amaka Nwachukwu', 'amaka@stylehub.test', '08162224471', 'StyleHub', 'Enugu', 'StyleHub Tailors', 'E-commerce', ['Website', 'Android app'], "Customers can't easily order custom clothes online and tailors lose track of measurements.", 'Young professionals ordering native wear, and tailors managing orders.', 'Save body measurements, pick styles, track sewing progress, WhatsApp reminders.', '₦1M – ₦3M', '1 – 3 months', 'REVIEWING', 'Good fit for Flutter + Firebase. Book a call to confirm scope.', -2],
            ['IDEA-2VN9K', 'Yusuf Danjuma', 'yusuf@agrocold.test', '09027771180', null, 'Kano', 'AgroCold Storage Booking', 'Agriculture', ['Website'], "Farmers lose produce because they can't find or book cold storage space in time.", 'Tomato and pepper farmers, cold room owners.', 'See available cold rooms, book and pay per crate, SMS alerts before storage expires.', '₦3M – ₦7M', 'Flexible', 'QUOTE_SENT', 'Proposal sent: React + Node.js + PostgreSQL, 14 weeks.', -6],
            ['IDEA-5TRNF', 'Chinedu Obi', 'chinedu@busstop.test', '08064448120', null, 'Anambra', 'BusStop Tickets', 'Logistics', ['Android app'], 'Travellers queue for hours at Onitsha parks to buy interstate bus tickets with no idea of seat availability.', 'Interstate travellers and bus park operators.', 'Book and pay for seats, see departure times, get an SMS e-ticket, operators manage manifests.', '₦1M – ₦3M', '1 – 3 months', 'NEW', null, -1],
            ['IDEA-9DCLN', 'Halima Yusuf', 'halima@crypto-ajo.test', '08097773321', null, 'Kaduna', 'Crypto Ajo', 'dApps (Web3)', ['dApp (Web3)'], 'Savings groups want to save in stablecoins but members do not trust a single treasurer with the wallet.', 'Informal savings groups of 10 to 30 members.', 'Multi-signature group wallet, contribution schedule, automatic payouts, member voting.', 'Under ₦1M', 'As soon as possible', 'DECLINED', 'Out of scope: regulated custody. Refund the fee.', -9],
        ] as [$ref, $name, $email, $phone, $org, $state, $title, $category, $platforms, $problem, $users, $features, $budget, $timeline, $status, $notes, $day]) {
            $at = self::day($day) . ' 10:15:00';
            $ideaId = Database::insert('ideas', [
                'ref' => $ref, 'name' => $name, 'email' => $email, 'phone' => $phone, 'organisation' => $org, 'country' => 'Nigeria', 'state' => $state,
                'title' => $title, 'category' => $category, 'platforms' => json_encode($platforms, JSON_UNESCAPED_UNICODE), 'problem' => $problem,
                'target_users' => $users, 'features' => $features, 'budget' => $budget, 'timeline' => $timeline, 'status' => $status, 'notes' => $notes,
                'created_at' => $at, 'last_saved_at' => $at, 'submitted_at' => $at,
            ]);

            // Commitment fees: paid online for the older ideas, a bank transfer waiting for the admin, a refund to send.
            $paidAt = self::day($day) . ' 10:05:00';
            $fee = [
                'idea_id' => $ideaId, 'amount_kobo' => 200000, 'currency' => 'NGN', 'reference' => 'FEE-' . $ref . '-DEMO01', 'created_at' => $paidAt,
            ];
            if ($ref === 'IDEA-5TRNF') {
                Database::insert('idea_payments', $fee + [
                    'method' => 'manual', 'status' => 'AWAITING_CONFIRMATION', 'sender_name' => 'Chinedu Obi', 'sender_bank' => 'GTBank',
                    'claimed_amount_kobo' => 200000, 'transfer_date' => self::day($day),
                    'refund_account_name' => 'Chinedu Obi', 'refund_account_number' => '0123456789', 'refund_bank' => 'GTBank',
                ]);
                continue;
            }
            Database::insert('idea_payments', $fee + [
                'method' => 'paystack', 'status' => 'PAID', 'paystack_access_code' => 'demo_' . strtolower(substr($ref, 5)),
                'paystack_transaction_id' => 4_000_000 + $ideaId, 'channel' => 'card',
                'receipt_no' => 'RCPT-' . date('ym', strtotime($paidAt)) . '-' . substr($ref, 5), 'paid_at' => $paidAt, 'confirmed_at' => $paidAt,
            ] + ($status === 'DECLINED' ? [
                'refund_status' => 'PENDING', 'refund_note' => 'The idea was declined.', 'refund_queued_at' => self::day($day + 2) . ' 15:00:00',
            ] : []));
        }

        // An unfinished application (draft, fee not paid). Resume link: /apply?resume=<DEMO_DRAFT_TOKEN>
        $draftAt = self::day(0) . ' 08:40:00';
        $draftId = Database::insert('ideas', [
            'ref' => 'IDEA-7DRFT', 'name' => 'Funke Adeyemi', 'email' => 'funke@eventhall.test', 'phone' => '08023339911', 'country' => 'Nigeria', 'state' => 'Lagos',
            'title' => 'HallBook', 'category' => 'Marketplace', 'platforms' => json_encode(['Website'], JSON_UNESCAPED_UNICODE),
            'problem' => 'Event planners call dozens of halls to check dates and prices.', 'status' => 'DRAFT',
            'created_at' => $draftAt, 'last_saved_at' => $draftAt,
        ]);
        Database::insert('idea_resume_tokens', ['idea_id' => $draftId, 'token_hash' => hash('sha256', self::DEMO_DRAFT_TOKEN)]);

        // A change request waiting for the client's decision
        Database::insert('change_requests', [
            'project_id' => $farmlink, 'title' => 'Add pay-on-delivery for buyers', 'description' => 'Buyers should be able to pay cash when their order arrives.',
            'requested_by' => 'client', 'requester_name' => 'Ada Okafor', 'status' => 'QUOTED', 'impact_cost' => 350000, 'impact_days' => 10,
            'response_note' => 'Needs a rider cash-collection flow and daily reconciliation report.', 'created_at' => self::day(-1) . ' 12:30:00',
        ]);

        // Delivered project with a signed handover
        $shopbeta = (int) Database::value("SELECT id FROM projects WHERE code = 'APC-26-B8WZ2'");
        foreach (\App\Controllers\HandoverController::DEFAULT_ITEMS as $i => $title) {
            Database::insert('handover_items', ['project_id' => $shopbeta, 'title' => $title, 'done_at' => self::day(-13) . ' 16:00:00', 'done_by' => 'Tunde Bakare', 'sort_order' => $i + 1]);
        }
        Database::update('projects', ['handover_requested_at' => self::day(-13) . ' 17:00:00', 'handover_signed_at' => self::day(-12) . ' 10:00:00', 'handover_signed_name' => 'Segun Afolabi', 'support_plan' => 'basic'], ['id' => $shopbeta]);

        // Some course funnel activity for the reports
        foreach (['react' => [42, 12], 'flutter' => [30, 9], 'node' => [18, 5], 'figma' => [25, 7]] as $course => [$views, $clicks]) {
            for ($i = 0; $i < $views; $i++) {
                Database::insert('course_events', ['course_id' => $course, 'event' => 'view', 'created_at' => self::day(-random_int(0, 40)) . ' 10:00:00']);
            }
            for ($i = 0; $i < $clicks; $i++) {
                Database::insert('course_events', ['course_id' => $course, 'technology_id' => $course === 'figma' ? 'figma' : $course, 'event' => 'click', 'created_at' => self::day(-random_int(0, 40)) . ' 11:00:00']);
            }
        }

        Database::insert('leads', ['project_id' => $farmlink, 'client_name' => 'Ada Okafor', 'contact' => 'ada@farmlink.test', 'technology_id' => 'react', 'course_id' => 'react', 'type' => 'info', 'source' => 'portal', 'status' => 'CONTACTED', 'notes' => 'Interested for her operations manager.', 'created_at' => self::day(-4) . ' 15:00:00']);
        Database::insert('leads', ['client_name' => 'Tolu Bello', 'contact' => 'tolu@example.test', 'course_id' => 'next', 'type' => 'enrol', 'source' => 'website', 'created_at' => self::day(-1) . ' 12:00:00']);
    }

    private static function day(int $offset): string
    {
        return date('Y-m-d', strtotime(($offset >= 0 ? '+' : '') . $offset . ' days'));
    }
}
