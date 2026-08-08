import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

const args = Object.fromEntries(process.argv.slice(2).reduce((items, value, index, list) => value.startsWith("--") ? [...items, [value.slice(2), list[index + 1]]] : items, []));
const root = resolve(args.dir || "."); const port = Number(args.port || process.env.PORT || 8080); const host = args.host || process.env.HOST || "127.0.0.1";
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".json": "application/json" };

const server = createServer((request, response) => {
  if (request.url === "/api/health") { response.writeHead(200, { "content-type": "application/json" }); response.end(JSON.stringify({ status: "ok", version: "0.1.0" })); return; }
  if (request.url === "/api/demo-analysis" && request.method === "POST") { let body = ""; request.on("data", chunk => body += chunk); request.on("end", () => { response.writeHead(200, { "content-type": "application/json" }); response.end(JSON.stringify({ task_id: "demo-uni-moe", status: "complete", readiness: 64, blockers: 2 })); }); return; }
  const clean = normalize(decodeURIComponent((request.url || "/").split("?")[0])).replace(/^(\.\.(\/|\\|$))+/, "");
  let file = join(root, clean === "/" ? "index.html" : clean);
  if (!file.startsWith(root) || !existsSync(file)) file = join(root, "index.html");
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
  response.writeHead(200, { "content-type": mime[extname(file)] || "application/octet-stream", "cache-control": "no-store" }); createReadStream(file).pipe(response);
});
server.listen(port, host, () => console.log(`Local: http://${host === "0.0.0.0" ? "localhost" : host}:${port}`));
