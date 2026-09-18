/**
 * Serves the built site (./out) the way shared hosting does — index.html per folder —
 * so you can test the real production files locally. Run `npm run build` first, then
 * `npm run serve` and open http://127.0.0.1:3000.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.argv[2] ?? "out");
const port = Number(process.argv[3] ?? 3100);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

const send = (res, status, body, type = "text/plain; charset=utf-8") => {
  res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(body);
};

http
  .createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    const clean = decodeURIComponent(url.pathname).replace(/\/+$/, "") || "/index";
    const candidates = [path.join(root, clean), path.join(root, clean + ".html"), path.join(root, clean, "index.html")];
    for (const file of candidates) {
      if (!file.startsWith(root)) break;
      if (fs.existsSync(file) && fs.statSync(file).isFile()) {
        return send(res, 200, fs.readFileSync(file), TYPES[path.extname(file)] ?? "application/octet-stream");
      }
    }
    const notFound = path.join(root, "404.html");
    if (fs.existsSync(notFound)) return send(res, 404, fs.readFileSync(notFound), "text/html; charset=utf-8");
    send(res, 404, "Not found");
  })
  .listen(port, "127.0.0.1", () => console.log(`Serving ${root} on http://127.0.0.1:${port}`));
