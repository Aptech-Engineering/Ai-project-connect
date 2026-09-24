<?php

declare(strict_types=1);

use App\Controllers\AdminController as Admin;
use App\Controllers\AnalyticsController as Analytics;
use App\Controllers\AnalyticsViewsController as AnalyticsViews;
use App\Controllers\TrackController as Track;
use App\Controllers\ApplicationsController as Apply;
use App\Controllers\PaymentsController as Payments;
use App\Controllers\SettingsController as SettingsCtrl;
use App\Controllers\ChangeRequestsController as Changes;
use App\Controllers\HandoverController as Handover;
use App\Controllers\QuotesController as Quotes;
use App\Controllers\ReportsController as Reports;
use App\Controllers\ClientController as Client;
use App\Controllers\IdeasController as Ideas;
use App\Controllers\LeadsController as Leads;
use App\Controllers\PublicController as Pub;
use App\Controllers\StaffAuthController as StaffAuth;
use App\Controllers\StaffController as Staff;
use App\Core\Router;

return static function (Router $r): void {
    /* ---------- public ---------- */
    $r->get('/api/health', [Pub::class, 'health']);
    $r->get('/api/content', [Pub::class, 'content']);
    $r->get('/api/courses', [Pub::class, 'courses']);
    $r->get('/api/technologies', [Pub::class, 'technologies']);
    $r->get('/api/files/{id}', [Pub::class, 'file']);
    $r->post('/api/ideas', [Apply::class, 'createComplete']);
    $r->get('/api/ideas/{ref}', [Pub::class, 'ideaStatus']);
    $r->post('/api/course-enquiries', [Pub::class, 'courseEnquiry']);
    $r->post('/api/course-events', [Reports::class, 'trackCourseEvent']);
    $r->get('/api/quotes/{ref}', [Quotes::class, 'show']);
    $r->get('/api/quotes/{ref}/proposal', [Quotes::class, 'proposal']);
    $r->post('/api/quotes/{ref}/accept', [Quotes::class, 'accept']);
    $r->post('/api/quotes/{ref}/decline', [Quotes::class, 'decline']);

    /* ---------- idea applications: drafts + commitment fee (resume token, no sign-in) ---------- */
    $r->post('/api/applications', [Apply::class, 'create']);
    $r->get('/api/applications/draft', [Apply::class, 'show']);
    $r->post('/api/applications/draft', [Apply::class, 'save']);
    $r->post('/api/applications/resume-links', [Apply::class, 'resumeLinks']);
    $r->post('/api/applications/pay/paystack', [Apply::class, 'payWithPaystack']);
    $r->post('/api/applications/pay/manual', [Apply::class, 'claimTransfer']);
    $r->post('/api/applications/refund-account', [Apply::class, 'refundAccount']);
    $r->post('/api/applications/submit', [Apply::class, 'submit']);
    $r->get('/api/payments/paystack/callback', [Payments::class, 'paystackCallback']);
    $r->post('/api/payments/paystack/webhook', [Payments::class, 'paystackWebhook']);

    /* ---------- client portal ---------- */
    $r->post('/api/client/auth/request-code', [Client::class, 'requestCode']);
    $r->post('/api/client/auth/verify', [Client::class, 'verifyCode']);
    $r->post('/api/client/auth/logout', [Client::class, 'logout']);
    $r->get('/api/client/me', [Client::class, 'me']);
    $r->get('/api/client/projects/{code}', [Client::class, 'show']);
    $r->post('/api/client/projects/{code}/messages', [Client::class, 'message']);
    $r->post('/api/client/projects/{code}/milestones/{id}/approve', [Client::class, 'approveMilestone']);
    $r->post('/api/client/projects/{code}/course-requests', [Client::class, 'requestCourse']);
    $r->patch('/api/client/projects/{code}/preferences', [Client::class, 'preferences']);
    $r->post('/api/client/projects/{code}/rating', [Client::class, 'rate']);
    $r->get('/api/client/projects/{code}/files/{id}', [Client::class, 'file']);
    $r->post('/api/client/projects/{code}/files', [Client::class, 'uploadFile']);
    $r->post('/api/client/projects/{code}/course-invites', [Client::class, 'inviteToCourse']);
    $r->post('/api/client/projects/{code}/change-requests', [Changes::class, 'clientCreate']);
    $r->post('/api/client/change-requests/{id}/{decision}', [Changes::class, 'clientRespond']);
    $r->post('/api/client/projects/{code}/handover/sign', [Handover::class, 'clientSign']);

    /* ---------- staff auth ---------- */
    $r->post('/api/staff/auth/login', [StaffAuth::class, 'login']);
    $r->post('/api/staff/auth/logout', [StaffAuth::class, 'logout']);
    $r->get('/api/staff/me', [StaffAuth::class, 'me']);
    $r->post('/api/staff/me/password', [StaffAuth::class, 'changePassword']);
    $r->post('/api/staff/auth/forgot-password', [StaffAuth::class, 'forgotPassword']);
    $r->post('/api/staff/auth/reset-password', [StaffAuth::class, 'resetPassword']);

    /* ---------- engineering panel ---------- */
    $r->get('/api/staff/dashboard', [Staff::class, 'dashboard']);
    $r->get('/api/staff/users', [Staff::class, 'users']);
    $r->get('/api/staff/clients', [Staff::class, 'clients']);
    $r->get('/api/staff/projects', [Staff::class, 'projects']);
    $r->get('/api/staff/projects/{code}', [Staff::class, 'show']);
    $r->patch('/api/staff/projects/{code}', [Staff::class, 'updateDetails']);
    $r->post('/api/staff/projects/{code}/updates', [Staff::class, 'postUpdate']);
    $r->put('/api/staff/projects/{code}/stage', [Staff::class, 'changeStage']);
    $r->post('/api/staff/projects/{code}/technologies', [Staff::class, 'addTechnology']);
    $r->delete('/api/staff/projects/{code}/technologies/{techId}', [Staff::class, 'removeTechnology']);
    $r->post('/api/staff/projects/{code}/milestones', [Staff::class, 'addMilestone']);
    $r->post('/api/staff/projects/{code}/members', [Staff::class, 'addMember']);
    $r->delete('/api/staff/projects/{code}/members/{userId}', [Staff::class, 'removeMember']);
    $r->put('/api/staff/projects/{code}/lead', [Staff::class, 'changeLead']);
    $r->post('/api/staff/projects/{code}/files', [Staff::class, 'uploadFile']);
    $r->post('/api/staff/projects/{code}/regenerate-code', [Staff::class, 'regenerateCode']);
    $r->post('/api/staff/projects/{code}/messages', [Staff::class, 'reply']);
    $r->post('/api/staff/projects/{code}/change-requests', [Changes::class, 'staffCreate']);
    $r->post('/api/staff/projects/{code}/handover/items', [Handover::class, 'addItems']);
    $r->post('/api/staff/projects/{code}/handover/request', [Handover::class, 'requestSignOff']);
    $r->get('/api/staff/projects/{code}/digest-preview', [Reports::class, 'digestPreview']);
    $r->get('/api/staff/change-requests', [Changes::class, 'staffIndex']);
    $r->patch('/api/staff/change-requests/{id}', [Changes::class, 'staffUpdate']);
    $r->patch('/api/staff/handover-items/{id}', [Handover::class, 'updateItem']);
    $r->delete('/api/staff/handover-items/{id}', [Handover::class, 'deleteItem']);

    $r->post('/api/staff/updates/{id}/approve', [Staff::class, 'approveUpdate']);
    $r->delete('/api/staff/updates/{id}', [Staff::class, 'deleteUpdate']);
    $r->patch('/api/staff/milestones/{id}', [Staff::class, 'updateMilestone']);
    $r->delete('/api/staff/milestones/{id}', [Staff::class, 'deleteMilestone']);
    $r->delete('/api/staff/project-files/{id}', [Staff::class, 'deleteFile']);
    $r->get('/api/staff/files/{id}', [Staff::class, 'downloadFile']);

    $r->get('/api/staff/approvals', [Staff::class, 'approvals']);
    $r->get('/api/staff/messages', [Staff::class, 'messageThreads']);
    $r->get('/api/staff/notifications', [Staff::class, 'notifications']);

    $r->get('/api/staff/ideas', [Ideas::class, 'index']);
    $r->get('/api/staff/ideas/{id}', [Ideas::class, 'show']);
    $r->patch('/api/staff/ideas/{id}', [Ideas::class, 'update']);
    $r->post('/api/staff/ideas/{id}/convert', [Ideas::class, 'convert']);
    $r->post('/api/staff/ideas/{id}/quote', [Quotes::class, 'send']);
    $r->post('/api/staff/quotes/{id}/withdraw', [Quotes::class, 'withdraw']);
    $r->post('/api/staff/ideas/{id}/payments/centre', [Payments::class, 'recordAtCentre']);
    $r->post('/api/staff/walk-ins', [Payments::class, 'startWalkIn']);
    $r->post('/api/staff/ideas/{id}/resume-link', [Payments::class, 'resendResumeLink']);

    $r->get('/api/staff/payments', [Payments::class, 'index']);
    $r->post('/api/staff/payments/{id}/confirm', [Payments::class, 'confirm']);
    $r->post('/api/staff/payments/{id}/reject', [Payments::class, 'reject']);
    $r->post('/api/staff/payments/{id}/refund', [Payments::class, 'refund']);
    $r->post('/api/staff/payments/{id}/refund/complete', [Payments::class, 'completeRefund']);

    $r->get('/api/staff/leads', [Leads::class, 'index']);
    $r->patch('/api/staff/leads/{id}', [Leads::class, 'update']);
    $r->post('/api/staff/leads/{id}/messages', [Leads::class, 'sendMessage']);
    $r->delete('/api/staff/leads/{id}', [Leads::class, 'destroy']);

    /* ---------- analytics (spec section 9) ---------- */
    $r->post('/api/track', [Track::class, 'ingest']);
    $r->get('/api/analytics/me', [Analytics::class, 'me']);
    foreach (['overview', 'traffic', 'engagement', 'revenue', 'projects', 'pipeline', 'clients', 'courses', 'team', 'operations', 'realtime'] as $screen) {
        $r->get('/api/analytics/' . $screen, [Analytics::class, 'screen']);
    }
    $r->get('/api/analytics/traffic/timeseries', [Analytics::class, 'trafficTimeseries']);
    $r->get('/api/analytics/traffic/breakdown', [Analytics::class, 'trafficBreakdown']);
    $r->get('/api/analytics/funnels/{id}', [Analytics::class, 'screen']);
    $r->get('/api/analytics/export', [Analytics::class, 'export']);
    $r->get('/api/analytics/views', [AnalyticsViews::class, 'views']);
    $r->post('/api/analytics/views', [AnalyticsViews::class, 'createView']);
    $r->patch('/api/analytics/views/{id}', [AnalyticsViews::class, 'updateView']);
    $r->delete('/api/analytics/views/{id}', [AnalyticsViews::class, 'deleteView']);
    $r->get('/api/analytics/schedules', [AnalyticsViews::class, 'schedules']);
    $r->post('/api/analytics/schedules', [AnalyticsViews::class, 'createSchedule']);
    $r->patch('/api/analytics/schedules/{id}', [AnalyticsViews::class, 'updateSchedule']);
    $r->delete('/api/analytics/schedules/{id}', [AnalyticsViews::class, 'deleteSchedule']);

    /* ---------- admin ---------- */
    $r->get('/api/admin/reports', [Reports::class, 'reports']);
    $r->get('/api/admin/activity', [Reports::class, 'activity']);
    $r->get('/api/admin/activity.csv', [Reports::class, 'activityCsv']);
    $r->post('/api/admin/digests/send', [Reports::class, 'sendDigests']);
    $r->get('/api/admin/settings', [SettingsCtrl::class, 'index']);
    $r->put('/api/admin/settings', [SettingsCtrl::class, 'update']);
    $r->post('/api/admin/settings/paystack/test', [SettingsCtrl::class, 'testPaystack']);
    $r->put('/api/admin/content', [Admin::class, 'saveContent']);
    $r->post('/api/admin/content/reset', [Admin::class, 'resetContent']);
    $r->post('/api/admin/images', [Admin::class, 'uploadImage']);
    $r->get('/api/admin/courses', [Admin::class, 'courses']);
    $r->post('/api/admin/courses', [Admin::class, 'createCourse']);
    $r->patch('/api/admin/courses/{id}', [Admin::class, 'updateCourse']);
    $r->delete('/api/admin/courses/{id}', [Admin::class, 'deleteCourse']);
    $r->post('/api/admin/technologies', [Admin::class, 'createTechnology']);
    $r->patch('/api/admin/technologies/{id}', [Admin::class, 'updateTechnology']);
    $r->delete('/api/admin/technologies/{id}', [Admin::class, 'deleteTechnology']);
    $r->delete('/api/admin/projects/{code}', [Admin::class, 'deleteProject']);
    $r->get('/api/admin/users', [Admin::class, 'users']);
    $r->post('/api/admin/users', [Admin::class, 'createUser']);
    $r->patch('/api/admin/users/{id}', [Admin::class, 'updateUser']);
};
