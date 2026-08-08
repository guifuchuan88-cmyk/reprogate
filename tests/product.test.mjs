import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { test } from "node:test";

const component = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
const analyzer = await readFile(new URL("../src/github-analyzer.js", import.meta.url), "utf8");
const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
const product = `${html}\n${component}\n${analyzer}`;

test("v0.2 real repository audit flow is present", () => {
  for (const label of ["扫描公开仓库", "开始真实扫描", "静态检查矩阵", "证据清单", "分析记录", "ReproSpec"]) {
    assert.match(product, new RegExp(label));
  }
  assert.match(html, /script type="module"/);
  assert.doesNotMatch(component, /api\/demo-analysis/);
});

test("capability boundaries are explicit", () => {
  for (const statement of ["不执行仓库代码", "不解析论文正文", "PDF 内容不上传", "paperContentParsed: false", "externalAssetsVerified: false"]) {
    assert.match(product, new RegExp(statement));
  }
  assert.match(component, /本页不会自动改用演示数据/);
  assert.match(component, /SAMPLE · 冻结样例/);
});

test("build contains runtime modules and social preview", async () => {
  for (const path of ["../dist/index.html", "../dist/src/app.js", "../dist/src/github-analyzer.js", "../dist/src/styles.css", "../dist/public/og.png"]) {
    await access(new URL(path, import.meta.url));
  }
  const builtHtml = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
  assert.match(builtHtml, /LIVE · v0\.2 · BUILD/);
});

test("responsive and accessible product states are included", () => {
  assert.match(styles, /@media \(max-width: 480px\)/);
  assert.match(styles, /prefers-reduced-motion/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /role="alert"/);
});
