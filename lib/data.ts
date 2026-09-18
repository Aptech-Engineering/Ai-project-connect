import type { Person, Project, StageInfo, StageKey, Update } from "./types";

/** Mock dates are relative to today so the demo always feels live. */
function day(offset: number): string {
  const d = new Date();
  d.setHours(9, 30, 0, 0);
  d.setDate(d.getDate() + offset);
  return d.toISOString();
}

export const DEMO_OTP = "246810";

export const STALE_DAYS = 5;

export const TIMELINE = ["Review", "Design", "Develop", "Testing", "Deploy", "Delivered"];

export const STAGES: Record<StageKey, StageInfo> = {
  SUBMITTED: { label: "Submitted", tone: "grey", step: 0, typical: "0%", meaning: "We've received your idea and will review it shortly." },
  UNDER_REVIEW: { label: "Under review", tone: "blue", step: 0, typical: "0%", meaning: "Our team is assessing your idea and preparing a proposal." },
  APPROVED: { label: "Approved", tone: "blue", step: 0, typical: "5%", meaning: "Proposal accepted. Your project is registered and a team is assigned." },
  DESIGN: { label: "Design", tone: "orange-soft", step: 1, typical: "10–25%", meaning: "We're planning screens and user flows. You'll be asked to approve them." },
  DEVELOPMENT: { label: "In development", tone: "orange", step: 2, typical: "25–75%", meaning: "Engineers are building the features of your product." },
  TESTING: { label: "Testing", tone: "orange-soft", step: 3, typical: "75–90%", meaning: "We're checking everything works correctly and fixing issues." },
  DEPLOYMENT: { label: "Deployment", tone: "teal-soft", step: 4, typical: "90–99%", meaning: "Your product is being published online / to app stores." },
  DELIVERED: { label: "Delivered", tone: "teal", step: 5, typical: "100%", meaning: "Your product is live and handed over. Congratulations!" },
  ON_HOLD: { label: "On hold", tone: "red", step: 0, typical: "—", meaning: "Paused for now — the reason is shown below." },
};

/** Lowest typical progress for each stage (PRD section 08). */
export const STAGE_MIN_PROGRESS: Partial<Record<StageKey, number>> = { APPROVED: 5, DESIGN: 10, DEVELOPMENT: 25, TESTING: 75, DEPLOYMENT: 90, DELIVERED: 100 };

const tunde: Person = { name: "Tunde Bakare", role: "Project lead" };
const chioma: Person = { name: "Chioma Eze", role: "Front-end engineer" };
const ibrahim: Person = { name: "Ibrahim Sule", role: "Back-end engineer" };
const zainab: Person = { name: "Zainab Musa", role: "UI/UX designer" };
const femi: Person = { name: "Femi Adeyemi", role: "QA engineer" };
const grace: Person = { name: "Grace Okon", role: "Project lead" };
const david: Person = { name: "David Nwosu", role: "Mobile engineer" };

export const PROJECTS: Project[] = [
  {
    code: "APC-26-7KQ9X",
    title: "FarmLink Marketplace",
    tagline: "Connecting smallholder farmers directly with city buyers.",
    category: "Marketplace",
    platforms: "Web + Android",
    client: { name: "Ada Okafor", short: "Ada O.", emailMasked: "a•••@farmlink.ng", phoneMasked: "+234 ••• ••• 4821" },
    lead: tunde,
    team: [tunde, chioma, ibrahim, zainab, femi],
    stage: "DEVELOPMENT",
    progress: 62,
    startDate: day(-58),
    targetDate: day(76),
    updates: [
      { id: "p1", date: day(0), kind: "update", author: chioma, pending: true, title: "Buyer order tracking screen ready", body: "Buyers can now see each order move from 'Packed' to 'On the way' to 'Delivered', with the rider's phone number." },
      { id: "n1", date: day(-2), kind: "update", visibility: "internal", author: ibrahim, title: "Paystack webhook retries flaky on staging", body: "Seeing duplicate webhook calls on staging. Adding idempotency keys before the checkout demo." },
      { id: "u1", date: day(-3), kind: "update", author: ibrahim, title: "Payment integration merged", body: "Buyers can now pay by card or bank transfer. Money goes into a safe holding account until the farmer confirms delivery.", demoLink: "https://staging.farmlink.demo", screenshot: "payment" },
      { id: "u2", date: day(-6), kind: "update", author: chioma, title: "Farmer onboarding screens done", body: "Farmers can sign up with a phone number, add their farm location and upload their first produce listing in under 2 minutes.", screenshot: "onboarding" },
      { id: "u3", date: day(-11), kind: "update", author: zainab, title: "Design sign-off received", body: "Thank you for approving the designs! All 24 screens are now locked and handed to the engineers." },
      { id: "u4", date: day(-12), kind: "stage", author: tunde, title: "Stage changed to Development", body: "Your project has moved from Design to Development. Engineers have started building the features." },
      { id: "u5", date: day(-18), kind: "update", author: ibrahim, title: "Database schema approved", body: "We've mapped out how your app stores farmers, buyers, products and orders so it stays fast as you grow." },
      { id: "u6", date: day(-30), kind: "update", author: zainab, title: "First screen designs shared", body: "The home, product and checkout screens are ready for your review in the Files section.", screenshot: "design" },
    ],
    milestones: [
      { id: "m1", title: "Proposal & quote accepted", due: day(-58), completedAt: day(-58) },
      { id: "m2", title: "Design sign-off", due: day(-12), completedAt: day(-11), needsClientApproval: true },
      { id: "m3", title: "Farmer & buyer accounts", due: day(-5), completedAt: day(-6) },
      { id: "m4", title: "Payments & checkout demo", due: day(4), needsClientApproval: true },
      { id: "m5", title: "Android app beta", due: day(38) },
      { id: "m6", title: "Launch & handover", due: day(76), needsClientApproval: true },
    ],
    stack: [
      { techId: "react", usage: "Web front-end" },
      { techId: "node", usage: "API server" },
      { techId: "postgres", usage: "Database" },
      { techId: "flutter", usage: "Android app" },
    ],
    changeRequests: [
      {
        id: "cr1",
        title: "Add pay-on-delivery for buyers",
        description: "Buyers should be able to pay cash when their order arrives.",
        requestedBy: "client",
        requesterName: "Ada Okafor",
        status: "QUOTED",
        impactCost: 350000,
        impactDays: 10,
        currency: "NGN",
        responseNote: "Needs a rider cash-collection flow and a daily reconciliation report.",
        createdAt: day(-1),
      },
    ],
    messages: [
      { id: "q1", at: day(-9), from: "client", author: "Ada Okafor", text: "Will farmers without smartphones be able to use it?" },
      { id: "q2", at: day(-9), from: "team", author: "Tunde Bakare", text: "Yes! Farmers can also list produce by SMS. We'll show you in the next demo." },
      { id: "q3", at: day(-1), from: "client", author: "Ada Okafor", text: "Can buyers pay on delivery too?" },
    ],
    files: [
      { id: "f1", name: "FarmLink-Proposal-and-Quote.pdf", kind: "proposal", size: "1.2 MB", date: day(-60) },
      { id: "f2", name: "FarmLink-UI-Designs-v2.pdf", kind: "design", size: "8.4 MB", date: day(-13) },
      { id: "f3", name: "Payments-Flow-Explained.pdf", kind: "doc", size: "640 KB", date: day(-3) },
    ],
  },
  {
    code: "APC-26-M4TR8",
    title: "ClinicQueue",
    tagline: "Book a doctor's appointment without waiting in line.",
    category: "Health",
    platforms: "Web",
    client: { name: "Dr. Kemi Balogun", short: "Dr. Kemi B.", emailMasked: "k•••@clinicqueue.com", phoneMasked: "+234 ••• ••• 1190" },
    lead: grace,
    team: [grace, chioma, ibrahim, femi],
    stage: "TESTING",
    progress: 84,
    startDate: day(-96),
    targetDate: day(18),
    updates: [
      { id: "u1", date: day(-1), kind: "update", author: femi, title: "Round 2 testing: 14 of 17 issues fixed", body: "We tested booking on 9 different phones. The remaining 3 issues are small layout fixes on older Android devices.", demoLink: "https://staging.clinicqueue.demo" },
      { id: "u2", date: day(-4), kind: "stage", author: grace, title: "Stage changed to Testing", body: "All features are built. We're now checking everything works correctly before launch." },
      { id: "u3", date: day(-7), kind: "update", author: ibrahim, title: "SMS reminders are live", body: "Patients get a text message 24 hours and 1 hour before their appointment.", screenshot: "dashboard" },
      { id: "u4", date: day(-15), kind: "update", author: chioma, title: "Doctor dashboard completed", body: "Doctors can see today's queue, mark patients as seen and pause bookings for breaks." },
    ],
    milestones: [
      { id: "m1", title: "Design sign-off", due: day(-70), completedAt: day(-71), needsClientApproval: true },
      { id: "m2", title: "Booking & queue features", due: day(-20), completedAt: day(-18) },
      { id: "m3", title: "User acceptance testing", due: day(6), needsClientApproval: true },
      { id: "m4", title: "Go live", due: day(18), needsClientApproval: true },
    ],
    stack: [
      { techId: "next", usage: "Website & patient portal" },
      { techId: "nest", usage: "Booking server" },
      { techId: "postgres", usage: "Appointments database" },
      { techId: "aws", usage: "Hosting" },
    ],
    files: [
      { id: "f1", name: "ClinicQueue-Proposal.pdf", kind: "proposal", size: "980 KB", date: day(-98) },
      { id: "f2", name: "Test-Report-Round-2.pdf", kind: "doc", size: "420 KB", date: day(-1) },
    ],
  },
  {
    code: "APC-26-B8WZ2",
    title: "ShopBeta Delivery",
    tagline: "Same-day grocery delivery for Lekki and VI.",
    category: "E-commerce",
    platforms: "Android + iOS",
    client: { name: "Segun Afolabi", short: "Segun A.", emailMasked: "s•••@shopbeta.ng", phoneMasked: "+234 ••• ••• 7732" },
    lead: tunde,
    team: [tunde, david, ibrahim, zainab],
    stage: "DELIVERED",
    progress: 100,
    startDate: day(-160),
    targetDate: day(-10),
    deliveredDate: day(-12),
    updates: [
      { id: "u1", date: day(-12), kind: "stage", author: tunde, title: "Your product is live!", body: "ShopBeta is now on the Google Play Store and Apple App Store. Handover documents are in your Files section." },
      { id: "u2", date: day(-16), kind: "update", author: david, title: "App Store approval received", body: "Apple approved the iPhone app on the first submission." },
      { id: "u3", date: day(-25), kind: "update", author: ibrahim, title: "Live rider tracking launched", body: "Customers can watch their rider on a map from the shop to their door.", screenshot: "dashboard" },
    ],
    milestones: [
      { id: "m1", title: "Design sign-off", due: day(-130), completedAt: day(-131), needsClientApproval: true },
      { id: "m2", title: "Beta with 50 customers", due: day(-40), completedAt: day(-38) },
      { id: "m3", title: "Store launch & handover", due: day(-10), completedAt: day(-12), needsClientApproval: true },
    ],
    stack: [
      { techId: "rn", usage: "Android & iPhone app" },
      { techId: "firebase", usage: "Notifications & live tracking" },
      { techId: "node", usage: "Orders server" },
      { techId: "figma", usage: "App design" },
    ],
    files: [
      { id: "f1", name: "ShopBeta-Handover-Guide.pdf", kind: "doc", size: "2.1 MB", date: day(-12) },
      { id: "f2", name: "ShopBeta-Support-Plan.pdf", kind: "proposal", size: "310 KB", date: day(-12) },
    ],
    handover: {
      requestedAt: day(-13),
      signedAt: day(-12),
      signedName: "Segun Afolabi",
      supportPlan: "basic",
      items: [
        "Source code and repository access handed over",
        "Admin logins and passwords shared securely",
        "Hosting, domain and app store accounts transferred",
        "User guide and documentation delivered",
        "Training session with your team completed",
      ].map((title, i) => ({ id: `h${i + 1}`, title, doneAt: day(-13), doneBy: "Tunde Bakare" })),
    },
  },
  {
    code: "APC-26-H2NP6",
    title: "EduNest Tutors",
    tagline: "Matching secondary school students with vetted tutors.",
    category: "Education",
    platforms: "Web + Android",
    client: { name: "Ngozi Umeh", short: "Ngozi U.", emailMasked: "n•••@edunest.org", phoneMasked: "+234 ••• ••• 3057" },
    lead: grace,
    team: [grace, david, zainab],
    stage: "ON_HOLD",
    pausedAtStep: 2,
    holdReason: "Waiting for your tutor onboarding content (intro videos and verification checklist) so we can finish the tutor sign-up flow.",
    progress: 34,
    startDate: day(-50),
    targetDate: day(64),
    updates: [
      { id: "u1", date: day(-2), kind: "stage", author: grace, title: "Project paused: waiting for content", body: "We've paused development until we receive your tutor onboarding videos and verification checklist. Nothing else is needed from you." },
      { id: "u2", date: day(-8), kind: "update", author: david, title: "Student search & filters built", body: "Students can search tutors by subject, class level, price and location." },
    ],
    milestones: [
      { id: "m1", title: "Design sign-off", due: day(-30), completedAt: day(-31), needsClientApproval: true },
      { id: "m2", title: "Send tutor onboarding content", due: day(2), needsClientApproval: true },
      { id: "m3", title: "Tutor sign-up & verification", due: day(20) },
    ],
    stack: [
      { techId: "react", usage: "Web front-end" },
      { techId: "flutter", usage: "Android app" },
      { techId: "firebase", usage: "Chat & notifications" },
    ],
    files: [{ id: "f1", name: "EduNest-Content-Checklist.pdf", kind: "doc", size: "180 KB", date: day(-2) }],
  },
  {
    code: "APC-26-D5LC3",
    title: "KoboSave",
    tagline: "Group savings (ajo/esusu) made safe and transparent.",
    category: "Fintech",
    platforms: "Android",
    client: { name: "Ada Okafor", short: "Ada O.", emailMasked: "a•••@farmlink.ng", phoneMasked: "+234 ••• ••• 4821" },
    lead: tunde,
    team: [tunde, zainab],
    stage: "DESIGN",
    progress: 18,
    startDate: day(-14),
    targetDate: day(120),
    updates: [
      { id: "u1", date: day(-6), kind: "update", author: zainab, title: "Savings group screens ready for review", body: "Please review how members join a group, see the payout order and get reminders. Approve the design milestone when you're happy.", screenshot: "design" },
      { id: "u2", date: day(-9), kind: "stage", author: tunde, title: "Stage changed to Design", body: "We're planning screens and user flows. You'll be asked to approve them." },
    ],
    milestones: [
      { id: "m1", title: "Proposal & quote accepted", due: day(-14), completedAt: day(-14) },
      { id: "m2", title: "Design sign-off", due: day(5), needsClientApproval: true },
      { id: "m3", title: "Savings groups & wallet", due: day(60) },
    ],
    stack: [
      { techId: "figma", usage: "App design" },
      { techId: "flutter", usage: "Android app" },
      { techId: "nest", usage: "Wallet server" },
      { techId: "postgres", usage: "Transactions database" },
    ],
    files: [{ id: "f1", name: "KoboSave-Proposal.pdf", kind: "proposal", size: "1.0 MB", date: day(-15) }],
  },
];

export const DEMO_IDS =PROJECTS.slice(0, 4).map((p) => ({ code: p.code, title: p.title, stage: p.stage }));

export function isClientVisible(u: Update) {
  return (u.visibility ?? "client") === "client" && !u.pending;
}

export function clientUpdates(project: Project) {
  return project.updates.filter(isClientVisible);
}

export function timelineStep(project: Project): number {
  return project.stage === "ON_HOLD" ? project.pausedAtStep ?? 0 : STAGES[project.stage].step;
}
