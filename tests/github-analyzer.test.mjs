import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeRepository, parseGitHubRepository, RepositoryAnalysisError } from "../src/github-analyzer.js";

const metadata = {
  name: "research-repo", full_name: "lab/research-repo", html_url: "https://github.com/lab/research-repo", description: "A research system",
  default_branch: "main", language: "Python", stargazers_count: 42, forks_count: 7, open_issues_count: 3,
  license: { spdx_id: "Apache-2.0" }, archived: false, updated_at: "2026-08-01T00:00:00Z", owner: { login: "lab" },
};

const tree = {
  truncated: false,
  tree: ["README.md", "requirements.txt", "LICENSE", "Dockerfile", "tests/test_smoke.py", ".github/workflows/test.yml"].map(path => ({ path, type: "blob" })),
};

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json", ...(init.headers || {}) }, ...init });
}

function successFetch(url) {
  const value = String(url);
  if (value.endsWith("/repos/lab/research-repo")) return Promise.resolve(jsonResponse(metadata));
  if (value.includes("/commits/main")) return Promise.resolve(jsonResponse({ sha: "abc1234567890" }));
  if (value.includes("/git/trees/abc1234567890")) return Promise.resolve(jsonResponse(tree));
  if (value.includes("/readme?ref=abc1234567890")) {
    const readme = "# Research\n## Install\n```bash\npip install -r requirements.txt\n```\n## Evaluate\n```bash\npython evaluate.py\n```\nDownload pretrained model weights from huggingface.co/example.";
    return Promise.resolve(jsonResponse({ path: "README.md", content: Buffer.from(readme).toString("base64") }));
  }
  if (value.includes("raw.githubusercontent.com") && value.endsWith("requirements.txt")) return Promise.resolve(new Response("torch>=2.0\nnumpy", { status: 200 }));
  throw new Error(`Unexpected request: ${value}`);
}

test("parses canonical GitHub repository inputs", () => {
  assert.deepEqual(parseGitHubRepository("https://github.com/lab/research-repo.git"), {
    owner: "lab", repo: "research-repo", fullName: "lab/research-repo", url: "https://github.com/lab/research-repo", apiUrl: "https://api.github.com/repos/lab/research-repo",
  });
  assert.equal(parseGitHubRepository("lab/research-repo").fullName, "lab/research-repo");
});

test("rejects non-repository and non-GitHub URLs", () => {
  for (const input of ["https://gitlab.com/lab/repo", "https://github.com/lab/repo/tree/main", "not a repo"]) {
    assert.throws(() => parseGitHubRepository(input), RepositoryAnalysisError);
  }
});

test("produces evidence-bound deterministic audit", async () => {
  const steps = [];
  const result = await analyzeRepository("https://github.com/lab/research-repo", { fetchImpl: successFetch, onProgress: step => steps.push(step) });
  assert.equal(result.mode, "live");
  assert.equal(result.repository.commitSha, "abc1234567890");
  assert.equal(result.files.total, 6);
  assert.deepEqual(steps, ["metadata", "snapshot", "tree", "rules"]);
  assert.ok(result.readiness > 0 && result.readiness <= 100);
  assert.equal(result.checks.find(item => item.id === "dependency-lock").status, "warning");
  assert.equal(result.checks.find(item => item.id === "runbook").status, "pass");
  assert.equal(result.checks.find(item => item.id === "tests").status, "pass");
  assert.match(result.checks[0].evidence.url, /blob\/abc1234567890/);
  assert.ok(result.risks.some(item => item.code === "DEPENDENCY_LOCK"));
});

test("maps 404 and rate limits to recoverable domain errors", async () => {
  await assert.rejects(
    analyzeRepository("lab/missing", { fetchImpl: async () => new Response("{}", { status: 404 }) }),
    error => error instanceof RepositoryAnalysisError && error.code === "NOT_FOUND",
  );
  await assert.rejects(
    analyzeRepository("lab/rate-limited", { fetchImpl: async () => new Response("{}", { status: 403, headers: { "x-ratelimit-reset": "1893456000" } }) }),
    error => Boolean(error instanceof RepositoryAnalysisError && error.code === "RATE_LIMIT" && error.details.resetAt),
  );
});

test("maps network failure without silently returning sample data", async () => {
  await assert.rejects(
    analyzeRepository("lab/offline", { fetchImpl: async () => { throw new TypeError("offline"); } }),
    error => error instanceof RepositoryAnalysisError && error.code === "NETWORK",
  );
});
