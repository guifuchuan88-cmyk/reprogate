import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { test } from "node:test";

const component = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
const analyzer = await readFile(new URL("../src/github-analyzer.js", import.meta.url), "utf8");
const finance = await readFile(new URL("../src/finance-audit.js", import.meta.url), "utf8");
const experiment = await readFile(new URL("../src/finance-experiment.js", import.meta.url), "utf8");
const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
const product = `${html}\n${component}\n${analyzer}\n${finance}\n${experiment}`;

test("v0.4 repository and finance audit flows are present", () => {
  for (const label of ["扫描公开仓库", "开始真实扫描", "静态检查矩阵", "证据清单", "分析记录", "ReproSpec"]) {
    assert.match(product, new RegExp(label));
  }
  for (const label of ["可审计金融推理", "财报证据与公式审计台", "证据账本", "程序执行轨迹", "参考答案回放", "冻结基线与参考答案对照", "最近对比快照"]) {
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
  for (const path of ["../dist/index.html", "../dist/src/app.js", "../dist/src/github-analyzer.js", "../dist/src/finance-audit.js", "../dist/src/finance-experiment.js", "../dist/src/styles.css", "../dist/public/og.png"]) {
    await access(new URL(path, import.meta.url));
  }
  const builtHtml = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
  assert.match(builtHtml, /BUILD · v0\.4/);
});

test("finance replay declares data, execution and advice boundaries", () => {
  for (const statement of ["synthetic-frozen-replay", "benchmarkRecordCopied: false", "modelInvoked: false", "untrustedCodeExecuted: false", "financialAdvice: false", "不展示或伪造模型思维链", "非官方 benchmark 样本"]) {
    assert.match(product, new RegExp(statement));
  }
  assert.match(component, /searchParams\.set\("case"/);
  assert.match(component, /searchParams\.set\("view"/);
  assert.match(component, /FINANCE_EXPERIMENT_STORAGE_KEY/);
  assert.match(component, /repo 与 case 不能同时使用/);
});

test("responsive and accessible product states are included", () => {
  assert.match(styles, /@media \(max-width: 480px\)/);
  assert.match(styles, /prefers-reduced-motion/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /role="alert"/);
  assert.match(styles, /\.finance-topbar \{ height: auto;/);
  assert.match(component, /aria-pressed=/);
  assert.match(component, /focusSelector: "#finance-case-question"/);
});

test("v0.4 avoids overclaiming the synthetic comparison", () => {
  for (const forbidden of ["第一次偏离", "最小修复", "可复现分享", "设备本地实验", "参考修复"]) {
    assert.doesNotMatch(product, new RegExp(forbidden));
  }
  for (const statement of ["参考答案回放", "当前 fixture 版本", "浏览器本地对比快照", "评测范式"] ) {
    assert.match(product, new RegExp(statement));
  }
  assert.match(component, /record\.fixtureVersion !== FINANCE_CASESET_VERSION/);
  assert.match(component, /popstate[\s\S]*const fixture = params\.get\("fixture"\)/);
});
