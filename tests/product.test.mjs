import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const component = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const styles = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
const product = `${html}\n${component}`;

test("first-version product flow is present", () => {
  for (const label of ["创建复现任务", "Claim—Artifact", "阻塞项与风险", "最小验证", "ReproSpec"]) {
    assert.match(product, new RegExp(label));
  }
});

test("core safety and evidence language is present", () => {
  assert.match(product, /不自动执行陌生代码/);
  assert.match(product, /只读 · 无网络/);
  assert.match(product, /证据快照已锁定/);
});

test("responsive product styles are included", () => {
  assert.match(styles, /@media \(max-width: 640px\)/);
  assert.match(styles, /prefers-reduced-motion/);
});
