/**
 * Builds a partner's co-branded scholarship landing page.
 *
 *   node make-partner-page.mjs partners/ghessa.json
 *   node make-partner-page.mjs partners/ghessa.json --out ./out/ghessa
 *
 * The result is ONE self-contained index.html: the logos are embedded in the file,
 * so the partner drops it anywhere on their own site — any host, no build step and
 * no server code — at a path such as ghessa.com.ng/aiprojectconnectscholarship.
 *
 * Everything on the page comes from the partner's .json file. Copy
 * partners/_template.json for a new partner, put their logo in assets/, and run this.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const REGISTER_BASE = "https://aiprojectconnect.com.ng/scholarship/";
const API_URL = "https://aiprojectconnect.com.ng/api/scholarship";

const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".svg": "image/svg+xml" };

const esc = (v) =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Embeds an image so the partner only ever handles one file. */
function dataUri(path) {
  const ext = extname(path).toLowerCase();
  const mime = MIME[ext];
  if (!mime) throw new Error(`Unsupported image type: ${ext}. Use png, jpg, webp, gif or svg.`);
  return `data:${mime};base64,${readFileSync(path).toString("base64")}`;
}

function shade(hex, amount) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const mix = (v) => (amount < 0 ? Math.round(v + (255 - v) * -amount) : Math.round(v * (1 - amount)));
  return "#" + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => mix(v).toString(16).padStart(2, "0")).join("");
}

const configPath = process.argv[2];
if (!configPath) {
  console.error("Usage: node make-partner-page.mjs partners/<partner>.json [--out ./out/<partner>]");
  process.exit(1);
}
const cfg = JSON.parse(readFileSync(resolve(configPath), "utf8"));
for (const required of ["name", "logo", "programmeTitle"]) {
  if (!cfg[required]) {
    console.error(`"${required}" is missing from ${configPath}.`);
    process.exit(1);
  }
}

const outFlag = process.argv.indexOf("--out");
const slug = cfg.slug || cfg.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const outDir = resolve(outFlag > -1 ? process.argv[outFlag + 1] : join(here, "out", slug));

const accent = cfg.accent || "#0a7a3c";
const registerUrl = `${REGISTER_BASE}?utm_source=${encodeURIComponent(slug)}&utm_medium=partner&utm_campaign=scholarship`;

const card = (item, i) =>
  `<div class="card"><div class="chip">${String(i + 1).padStart(2, "0")}</div><h3>${esc(item.title)}</h3><p>${esc(item.description)}</p></div>`;

const trackRow = (t) =>
  `<tr><td data-label="Track">${esc(t.track)}</td><td data-label="Focus">${esc(t.focus)}</td><td data-label="Skill target">${esc(t.target)}</td></tr>`;

const stages = (list) =>
  list
    .map((s, i) => `<div class="stage"><b>Stage ${i + 1}</b>${esc(s)}</div>` + (i < list.length - 1 ? '<span class="arrow">&rarr;</span>' : ""))
    .join("\n      ");

const contact =
  [
    cfg.site ? `<a href="${cfg.site.startsWith("http") ? cfg.site : "https://" + cfg.site}" target="_blank" rel="noopener">${esc(cfg.site.replace(/^https?:\/\//, ""))}</a>` : "",
    cfg.email ? `<a href="mailto:${esc(cfg.email)}">${esc(cfg.email)}</a>` : "",
    cfg.phone ? `<a href="tel:${String(cfg.phone).replace(/[^\d+]/g, "")}">${esc(cfg.phone)}</a>` : "",
  ]
    .filter(Boolean)
    .join("<br />") || "&nbsp;";

const values = {
  PARTNER_NAME: esc(cfg.name),
  PARTNER_FULL_NAME: esc(cfg.fullName || cfg.name),
  PARTNER_LOGO: dataUri(resolve(here, cfg.logo)),
  APTECH_LOGO: dataUri(join(here, "assets", "aptech-logo.png")),
  ACCENT: accent,
  ACCENT_DARK: shade(accent, 0.25),
  ACCENT_WASH: shade(accent, -0.86),
  PROGRAMME_TITLE: esc(cfg.programmeTitle),
  TAGLINE: esc(cfg.tagline || ""),
  INTRO: esc(cfg.intro || ""),
  META_DESCRIPTION: esc((cfg.intro || cfg.tagline || "").slice(0, 300)),
  OBJECTIVES: (cfg.objectives || []).map(card).join("\n      "),
  TRACKS: (cfg.tracks || []).map(trackRow).join("\n        "),
  TRACKS_NOTE: esc(cfg.tracksNote || ""),
  PATHWAY_INTRO: esc(cfg.pathwayIntro || ""),
  PATHWAY_STAGES: stages(cfg.pathwaySteps || []),
  PATHWAY_DETAILS: (cfg.pathwayDetails || []).map((d) => `<li><b>${esc(d.title)}:</b> ${esc(d.description)}</li>`).join("\n      "),
  ELIGIBILITY: (cfg.eligibility || []).map(card).join("\n      "),
  PARTNER_WHY: esc(cfg.partnerWhy || ""),
  APTECH_WHY: esc(cfg.aptechWhy || "A premier global IT training institution with over 30 years of excellence in skill-based education across 40+ countries."),
  APC_WHY: esc(cfg.apcWhy || "AI Projects LTD runs the application, payment and exam scheduling for the programme through AI Project Connect."),
  PARTNER_CONTACT: contact,
  REGISTER_URL: registerUrl,
  API_URL,
  YEAR: String(new Date().getFullYear()),
};

let html = readFileSync(join(here, "partner-landing-template.html"), "utf8");
for (const [key, value] of Object.entries(values)) html = html.replaceAll(`{{${key}}}`, value);

const leftover = html.match(/\{\{[A-Z_]+\}\}/g);
if (leftover) {
  console.error("These placeholders were not filled:", [...new Set(leftover)].join(", "));
  process.exit(1);
}

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
const file = join(outDir, "index.html");
writeFileSync(file, html, "utf8");

console.log(`Built ${file}`);
console.log(`  partner   : ${cfg.name}`);
console.log(`  logo      : ${basename(cfg.logo)} (embedded)`);
console.log(`  accent    : ${accent}`);
console.log(`  sections  : ${(cfg.objectives || []).length} objectives, ${(cfg.tracks || []).length} tracks, ${(cfg.pathwaySteps || []).length} pathway stages, ${(cfg.eligibility || []).length} eligibility cards`);
console.log(`  register  : ${registerUrl}`);
console.log(`  size      : ${(Buffer.byteLength(html) / 1024).toFixed(0)} KB — one file, nothing else to upload`);
