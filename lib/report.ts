import { jsPDF } from "jspdf";
import { STAGES, TIMELINE, clientUpdates, timelineStep } from "./data";
import { findCourse, findTechnology } from "./catalog";
import { stageMeaning } from "./content";
import { formatDate } from "./format";
import type { Project, SharedFile, Tone } from "./types";

type RGB = [number, number, number];

const NAVY: RGB = [11, 31, 58];
const NAVY_700: RGB = [26, 53, 97];
const ORANGE: RGB = [242, 107, 34];
const ORANGE_SOFT: RGB = [253, 235, 221];
const TEAL: RGB = [20, 163, 139];
const TEAL_SOFT: RGB = [221, 242, 238];
const RED: RGB = [180, 35, 24];
const RED_SOFT: RGB = [251, 227, 225];
const BLUE_SOFT: RGB = [223, 231, 242];
const MUTED: RGB = [91, 107, 130];
const LINE: RGB = [227, 232, 240];
const MIST: RGB = [243, 245, 249];

const TONE_COLORS: Record<Tone, { bg: RGB; fg: RGB }> = {
  grey: { bg: LINE, fg: MUTED },
  blue: { bg: BLUE_SOFT, fg: NAVY },
  "orange-soft": { bg: ORANGE_SOFT, fg: [185, 71, 10] },
  orange: { bg: ORANGE, fg: [255, 255, 255] },
  "teal-soft": { bg: TEAL_SOFT, fg: [13, 122, 104] },
  teal: { bg: TEAL, fg: [255, 255, 255] },
  red: { bg: RED_SOFT, fg: RED },
};

const PAGE_W = 210;
const PAGE_H = 297;
const M = 16;
const CONTENT_W = PAGE_W - M * 2;

/** Built-in PDF fonts only cover Latin-1, so normalise typographic characters. */
function clean(s: string) {
  return s
    .replace(/[—–]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[•·]/g, "|")
    .replace(/₦/g, "NGN ")
    .replace(/…/g, "...")
    .replace(/[^\x00-\xFF]/g, "");
}

function header(doc: jsPDF, project: Project, subtitle: string) {
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, PAGE_W, 36, "F");
  doc.setFillColor(...NAVY_700);
  doc.triangle(PAGE_W * 0.55, 0, PAGE_W, 0, PAGE_W, 36, "F");
  doc.setFillColor(...ORANGE);
  doc.rect(0, 0, 4, 36, "F");
  doc.triangle(PAGE_W, 12, PAGE_W, 30, PAGE_W - 14, 21, "F");

  doc.roundedRect(M, 11, 14, 14, 3, 3, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("AI", M + 7, 19.8, { align: "center" });
  doc.setFontSize(13);
  doc.text("AI Project Connect", M + 19, 17);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(180, 196, 218);
  doc.text(subtitle, M + 19, 22.5);

  doc.text(`Generated ${formatDate(new Date().toISOString())}`, PAGE_W - M - 16, 17, { align: "right" });
  doc.text(project.code, PAGE_W - M - 16, 22.5, { align: "right" });
}

function footers(doc: jsPDF) {
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.3);
    doc.line(M, PAGE_H - 14, PAGE_W - M, PAGE_H - 14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text("Confidential - prepared for the client by AI Project Connect (Aptech)", M, PAGE_H - 9);
    doc.text(`Page ${i} of ${pages}`, PAGE_W - M, PAGE_H - 9, { align: "right" });
  }
}

export async function downloadProjectReport(project: Project) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const stage = STAGES[project.stage];
  let y = 0;

  const ensure = (h: number) => {
    if (y + h > PAGE_H - 22) {
      doc.addPage();
      header(doc, project, "Project status report (continued)");
      y = 50;
    }
  };

  const sectionTitle = (title: string) => {
    ensure(18);
    doc.setFillColor(...ORANGE);
    doc.rect(M, y - 4.2, 1.4, 5.5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...NAVY);
    doc.text(title, M + 4, y);
    y += 8;
  };

  header(doc, project, "Project status report");
  y = 52;

  // Title + badge
  const tone = TONE_COLORS[stage.tone];
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  const badge = stage.label.toUpperCase();
  const badgeW = doc.getTextWidth(badge) + 10;
  doc.setFillColor(...tone.bg);
  doc.roundedRect(PAGE_W - M - badgeW, y - 6.5, badgeW, 9, 4.5, 4.5, "F");
  doc.setTextColor(...tone.fg);
  doc.text(badge, PAGE_W - M - badgeW / 2, y - 0.6, { align: "center" });

  doc.setTextColor(...NAVY);
  doc.setFontSize(22);
  doc.text(clean(project.title), M, y);
  y += 7;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...MUTED);
  doc.text(clean(project.tagline), M, y);
  y += 6;
  doc.text(clean(`Client: ${project.client.name}  |  ${project.platforms}  |  ${project.category}`), M, y);
  y += 12;

  // Progress
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...NAVY);
  doc.text("Overall progress", M, y);
  doc.setFontSize(18);
  doc.text(`${project.progress}%`, PAGE_W - M, y + 1, { align: "right" });
  y += 4;
  doc.setFillColor(...LINE);
  doc.roundedRect(M, y, CONTENT_W, 4, 2, 2, "F");
  const barColor = project.stage === "ON_HOLD" ? RED : project.stage === "DELIVERED" ? TEAL : ORANGE;
  doc.setFillColor(...barColor);
  if (project.progress > 0) doc.roundedRect(M, y, Math.max(4, (CONTENT_W * project.progress) / 100), 4, 2, 2, "F");
  y += 16;

  // Timeline
  const current = timelineStep(project);
  const delivered = project.stage === "DELIVERED";
  const gap = CONTENT_W / TIMELINE.length;
  const firstX = M + gap / 2;
  const lastX = M + CONTENT_W - gap / 2;
  doc.setDrawColor(...LINE);
  doc.setLineWidth(1.2);
  doc.line(firstX, y, lastX, y);
  doc.setDrawColor(...TEAL);
  const fillTo = delivered ? lastX : firstX + (lastX - firstX) * (current / (TIMELINE.length - 1));
  if (fillTo > firstX) doc.line(firstX, y, fillTo, y);
  TIMELINE.forEach((label, i) => {
    const x = firstX + gap * i;
    const complete = delivered || i < current;
    const isCurrent = !delivered && i === current;
    const color = complete ? TEAL : isCurrent ? (project.stage === "ON_HOLD" ? RED : ORANGE) : LINE;
    doc.setFillColor(255, 255, 255);
    doc.circle(x, y, 3.6, "F");
    doc.setFillColor(...color);
    doc.circle(x, y, 2.8, "F");
    doc.setFont("helvetica", complete || isCurrent ? "bold" : "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...(complete || isCurrent ? NAVY : MUTED));
    doc.text(label, x, y + 8, { align: "center" });
  });
  y += 18;

  // Meaning / hold reason
  const note = project.stage === "ON_HOLD" && project.holdReason ? `Paused: ${project.holdReason}` : stageMeaning(project.stage);
  const noteLines = doc.splitTextToSize(clean(note), CONTENT_W - 12);
  const noteH = noteLines.length * 4.6 + 8;
  const noteBg = project.stage === "ON_HOLD" ? RED_SOFT : project.stage === "DELIVERED" ? TEAL_SOFT : ORANGE_SOFT;
  doc.setFillColor(...noteBg);
  doc.roundedRect(M, y, CONTENT_W, noteH, 2.5, 2.5, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...NAVY);
  doc.text(noteLines, M + 6, y + 6.5);
  y += noteH + 8;

  // Key facts grid
  const facts: [string, string][] = [
    [project.deliveredDate ? "Delivered on" : "Target delivery", formatDate(project.deliveredDate ?? project.targetDate)],
    ["Started", formatDate(project.startDate)],
    ["Project lead", project.lead.name],
    ["Team size", `${project.team.length} people`],
  ];
  const cellW = (CONTENT_W - 3 * 4) / 4;
  facts.forEach(([label, value], i) => {
    const x = M + i * (cellW + 4);
    doc.setFillColor(...MIST);
    doc.roundedRect(x, y, cellW, 17, 2.5, 2.5, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(label.toUpperCase(), x + 4, y + 6);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...NAVY);
    doc.text(clean(value), x + 4, y + 12.5);
  });
  y += 27;

  // Updates
  sectionTitle("Latest updates");
  const updates = clientUpdates(project);
  updates.forEach((u) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    const body = doc.splitTextToSize(clean(u.body), CONTENT_W - 30);
    const h = 6 + body.length * 4.3 + 7;
    ensure(h);
    doc.setFillColor(...(u === updates[0] ? ORANGE : TEAL));
    doc.circle(M + 1.5, y - 1.2, 1.3, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    doc.text(formatDate(u.date, { day: "2-digit", month: "short" }), M + 5, y);
    doc.setFontSize(10.5);
    doc.setTextColor(...NAVY);
    doc.text(clean(u.title), M + 26, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(60, 74, 96);
    doc.text(body, M + 26, y + 5);
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(clean(`${u.author.name}, ${u.author.role}${u.kind === "stage" ? "  |  Stage change" : ""}`), M + 26, y + 5 + body.length * 4.3 + 0.5);
    y += h;
  });
  y += 4;

  // Milestones
  sectionTitle("Milestones");
  project.milestones.forEach((m) => {
    ensure(9);
    const done = Boolean(m.completedAt);
    if (done) {
      doc.setFillColor(...TEAL);
      doc.circle(M + 2, y - 1.3, 2.2, "F");
      doc.setDrawColor(255, 255, 255);
      doc.setLineWidth(0.5);
      doc.line(M + 1, y - 1.3, M + 1.8, y - 0.5);
      doc.line(M + 1.8, y - 0.5, M + 3.1, y - 2.2);
    } else {
      doc.setDrawColor(...LINE);
      doc.setLineWidth(0.6);
      doc.circle(M + 2, y - 1.3, 2.2, "S");
    }
    doc.setFont("helvetica", done ? "bold" : "normal");
    doc.setFontSize(10);
    doc.setTextColor(...NAVY);
    doc.text(clean(m.title), M + 7, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...MUTED);
    const status = done ? `Completed ${formatDate(m.completedAt!)}` : `Due ${formatDate(m.due)}`;
    doc.text(status + (m.needsClientApproval ? "  |  Client approval" : ""), PAGE_W - M, y, { align: "right" });
    y += 8;
  });
  y += 6;

  // Stack
  sectionTitle("What your app is built with");
  project.stack.forEach(({ techId, usage }) => {
    const t = findTechnology(techId);
    if (!t) return;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    const lines = doc.splitTextToSize(clean(t.plain), CONTENT_W - 50);
    const h = Math.max(14, lines.length * 4.3 + 9);
    ensure(h + 3);
    doc.setFillColor(...NAVY);
    doc.roundedRect(M, y - 4, CONTENT_W, h, 2.5, 2.5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(255, 255, 255);
    doc.text(clean(t.name), M + 5, y + 2);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(180, 196, 218);
    doc.text(clean(usage), M + 5, y + 7);
    doc.setFontSize(9.5);
    doc.setTextColor(230, 236, 245);
    doc.text(lines, M + 46, y + 2);
    y += h + 3;
  });

  const courseIds = [...new Set(project.stack.map((s) => findTechnology(s.techId)?.courseId).filter((id): id is string => Boolean(id && findCourse(id)?.published)))];
  y += 3;
  ensure(12 + courseIds.length * 5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...ORANGE);
  doc.text("Curious how it works? Learn this stack at Aptech:", M, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...NAVY);
  courseIds.forEach((id) => {
    const c = findCourse(id)!;
    doc.text(clean(`- ${c.title} (${c.duration}, starts ${formatDate(c.nextStart)})`), M, y);
    y += 5;
  });

  footers(doc);
  doc.save(`${project.code}-status-report.pdf`);
}

/** Mock shared files are generated on the fly so downloads work without a backend. */
export async function downloadMockFile(project: Project, file: SharedFile) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  header(doc, project, clean(project.title));
  let y = 58;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...NAVY);
  doc.text(clean(file.name.replace(/\.pdf$/, "").replace(/-/g, " ")), M, y);
  y += 8;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...MUTED);
  doc.text(`Shared ${formatDate(file.date)}  |  ${project.code}`, M, y);
  y += 14;
  doc.setFillColor(...ORANGE_SOFT);
  doc.roundedRect(M, y, CONTENT_W, 22, 3, 3, "F");
  doc.setTextColor(...NAVY);
  doc.setFontSize(10.5);
  doc.text(
    doc.splitTextToSize(
      "This is a sample document generated for the AI Project Connect demo. In the live product, this file is uploaded by your engineering team and stored securely.",
      CONTENT_W - 12,
    ),
    M + 6,
    y + 8,
  );
  y += 34;
  for (let i = 0; i < 9; i++) {
    doc.setFillColor(...(i % 4 === 0 ? LINE : MIST));
    doc.roundedRect(M, y, i % 4 === 0 ? CONTENT_W * 0.45 : CONTENT_W * (0.7 + ((i * 13) % 30) / 100), i % 4 === 0 ? 5 : 3.5, 1.5, 1.5, "F");
    y += i % 4 === 3 ? 12 : 7;
  }
  footers(doc);
  doc.save(file.name);
}

/** Downloads a shared file: the real upload if one was stored, otherwise a generated sample. */
export async function downloadSharedFile(project: Project, file: SharedFile) {
  if (file.blobId) {
    const { openStoredFile } = await import("./files");
    if (await openStoredFile(file.blobId, file.name, "download")) return;
  }
  await downloadMockFile(project, file);
}
