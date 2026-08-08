import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, "dist");
await rm(dist, { recursive: true, force: true });
await mkdir(join(dist, "src"), { recursive: true });
await mkdir(join(dist, "public"), { recursive: true });
await cp(join(root, "index.html"), join(dist, "index.html"));
await cp(join(root, "src", "app.js"), join(dist, "src", "app.js"));
await cp(join(root, "src", "github-analyzer.js"), join(dist, "src", "github-analyzer.js"));
await cp(join(root, "src", "styles.css"), join(dist, "src", "styles.css"));
await cp(join(root, "public", "favicon.svg"), join(dist, "public", "favicon.svg"));
await cp(join(root, "public", "og.png"), join(dist, "public", "og.png"));

const html = await readFile(join(dist, "index.html"), "utf8");
await writeFile(join(dist, "index.html"), html.replace("LIVE · v0.2", "LIVE · v0.2 · BUILD"));
console.log("ReproGate build created in dist/");
