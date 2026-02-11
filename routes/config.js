import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serveFile } from "./utils.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, "..", "public");
const rootDir = path.resolve(__dirname, "..");
const configPath = process.env.WEBPAGE_MONITOR_CONFIG ?? path.join(rootDir, "config.json");

function readConfig() {
  return JSON.parse(fs.readFileSync(configPath, "utf-8"));
}

function writeConfig(data) {
  fs.writeFileSync(configPath, JSON.stringify(data, null, 2), "utf-8");
}

function handler(req, res) {
  const url = new URL(req.url, "http://localhost");
  if (req.method === "GET" && url.pathname === "/") {
    return serveFile(res, path.join(__dirname, "..", "views", "index.html"), "text/html");
  }
  if (req.method === "GET" && url.pathname === "/styles.css") {
    return serveFile(res, path.join(publicDir, "styles.css"), "text/css");
  }
  if (req.method === "GET" && url.pathname === "/api/config") {
    const cfg = readConfig();
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ intervalMinutes: cfg.intervalMinutes, urls: cfg.urls }));
  }
  if (req.method === "POST" && url.pathname === "/api/config") {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", () => {
      try {
        const parsed = JSON.parse(body);
        const cfg = readConfig();
        cfg.urls = parsed.urls;
        writeConfig(cfg);
        res.writeHead(200);
        res.end();
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/interval") {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", () => {
      try {
        const parsed = JSON.parse(body);
        if (!Number.isFinite(parsed.intervalMinutes) || parsed.intervalMinutes < 1) {
          throw new Error("intervalMinutes must be >= 1");
        }
        const cfg = readConfig();
        cfg.intervalMinutes = parsed.intervalMinutes;
        writeConfig(cfg);
        res.writeHead(200);
        res.end();
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/diffs") {
    const title = url.searchParams.get("title");
    const sanitized = title.replace(/[^a-zA-Z0-9]/g, "_");
    const diffDir = path.join(rootDir, "logs", sanitized);
    if (!fs.existsSync(diffDir)) {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify([]));
    }
    const files = fs.readdirSync(diffDir).filter(f => f.startsWith("diff_"));
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify(files));
  }
  if (req.method === "GET" && url.pathname === "/api/diff-content") {
    const title = url.searchParams.get("title");
    const file = url.searchParams.get("file");
    const sanitized = title.replace(/[^a-zA-Z0-9]/g, "_");
    const filePath = path.join(rootDir, "logs", sanitized, file);
    if (!fs.existsSync(filePath)) {
      res.writeHead(404);
      return res.end();
    }
    const stat = fs.statSync(filePath);
    res.writeHead(200, { "Content-Type": "text/plain", "Content-Length": stat.size });
    fs.createReadStream(filePath).pipe(res);
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/snapshot") {
    const title = url.searchParams.get("title");
    const sanitized = title.replace(/[^a-zA-Z0-9]/g, "_");
    const snapshotDir = path.join(rootDir, "data", sanitized);
    if (!fs.existsSync(snapshotDir)) {
      res.writeHead(404);
      return res.end();
    }
    const files = fs.readdirSync(snapshotDir).filter(f => f.endsWith(".html"));
    if (!files.length) {
      res.writeHead(404);
      return res.end();
    }
    // Pick the latest by timestamp in filename
    const latest = files.sort().pop();
    const filePath = path.join(snapshotDir, latest);
    const stat = fs.statSync(filePath);
    res.writeHead(200, { "Content-Type": "text/html", "Content-Length": stat.size });
    fs.createReadStream(filePath).pipe(res);
    return;
  }
  res.writeHead(404);
  res.end();
}

export default handler;