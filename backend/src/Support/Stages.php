<?php

declare(strict_types=1);

namespace App\Support;

/** Project status model (PRD section 08). */
final class Stages
{
    public const ALL = [
        'SUBMITTED' => ['label' => 'Submitted', 'step' => 0, 'min' => 0, 'meaning' => "We've received your idea and will review it shortly."],
        'UNDER_REVIEW' => ['label' => 'Under review', 'step' => 0, 'min' => 0, 'meaning' => 'Our team is assessing your idea and preparing a proposal.'],
        'APPROVED' => ['label' => 'Approved', 'step' => 0, 'min' => 5, 'meaning' => 'Proposal accepted. Your project is registered and a team is assigned.'],
        'DESIGN' => ['label' => 'Design', 'step' => 1, 'min' => 10, 'meaning' => "We're planning screens and user flows. You'll be asked to approve them."],
        'DEVELOPMENT' => ['label' => 'In development', 'step' => 2, 'min' => 25, 'meaning' => 'Engineers are building the features of your product.'],
        'TESTING' => ['label' => 'Testing', 'step' => 3, 'min' => 75, 'meaning' => "We're checking everything works correctly and fixing issues."],
        'DEPLOYMENT' => ['label' => 'Deployment', 'step' => 4, 'min' => 90, 'meaning' => 'Your product is being published online / to app stores.'],
        'DELIVERED' => ['label' => 'Delivered', 'step' => 5, 'min' => 100, 'meaning' => 'Your product is live and handed over. Congratulations!'],
        'ON_HOLD' => ['label' => 'On hold', 'step' => 0, 'min' => 0, 'meaning' => 'Paused for now — the reason is shown below.'],
    ];

    public const STALE_DAYS = 5;

    public static function keys(): string
    {
        return implode(',', array_keys(self::ALL));
    }

    public static function label(string $stage): string
    {
        return self::ALL[$stage]['label'] ?? $stage;
    }

    /** Admin-edited plain-language meaning, falling back to the default. */
    public static function meaning(string $stage): string
    {
        $content = SiteContent::get();
        $edited = $content['portal']['stageMeanings'][$stage] ?? null;
        return is_string($edited) && $edited !== '' ? $edited : (self::ALL[$stage]['meaning'] ?? '');
    }
}
