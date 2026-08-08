const API_ROOT = "https://api.github.com";

export class RepositoryAnalysisError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "RepositoryAnalysisError";
    this.code = code;
    this.details = details;
  }
}

export function parseGitHubRepository(input) {
  const value = String(input || "").trim();
  if (!value) throw new RepositoryAnalysisError("INVALID_REPOSITORY", "请输入 GitHub 仓库地址");

  let owner;
  let repo;
  if (/^[^/\s]+\/[^/\s]+$/.test(value)) {
    [owner, repo] = value.split("/");
  } else {
    let url;
    try {
      url = new URL(value.match(/^https?:\/\//i) ? value : `https://${value}`);
    } catch {
      throw new RepositoryAnalysisError("INVALID_REPOSITORY", "仓库地址格式不正确");
    }
    if (!["github.com", "www.github.com"].includes(url.hostname.toLowerCase())) {
      throw new RepositoryAnalysisError("INVALID_REPOSITORY", "目前只支持 github.com 的公开仓库");
    }
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length !== 2) {
      throw new RepositoryAnalysisError("INVALID_REPOSITORY", "请粘贴仓库首页地址，而不是文件或分支地址");
    }
    [owner, repo] = parts;
  }

  repo = repo.replace(/\.git$/i, "");
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(owner) || !/^[A-Za-z0-9._-]+$/.test(repo)) {
    throw new RepositoryAnalysisError("INVALID_REPOSITORY", "GitHub owner 或仓库名称无效");
  }

  return {
    owner,
    repo,
    fullName: `${owner}/${repo}`,
    url: `https://github.com/${owner}/${repo}`,
    apiUrl: `${API_ROOT}/repos/${owner}/${repo}`,
  };
}

function decodeBase64(value = "") {
  const compact = value.replace(/\s/g, "");
  if (typeof globalThis.atob === "function") {
    const binary = globalThis.atob(compact);
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }
  if (typeof globalThis.Buffer !== "undefined") return globalThis.Buffer.from(compact, "base64").toString("utf8");
  return "";
}

async function apiRequest(url, fetchImpl, { optional = false } = {}) {
  let response;
  try {
    response = await fetchImpl(url, {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
  } catch (error) {
    throw new RepositoryAnalysisError("NETWORK", "无法连接 GitHub，请检查网络后重试", { cause: error?.message });
  }

  if (optional && response.status === 404) return null;
  if (response.status === 404) {
    throw new RepositoryAnalysisError("NOT_FOUND", "未找到该公开仓库；它可能不存在、已改名或设为私有");
  }
  if (response.status === 403 || response.status === 429) {
    const resetSeconds = Number(response.headers?.get?.("x-ratelimit-reset"));
    throw new RepositoryAnalysisError("RATE_LIMIT", "GitHub 匿名请求额度已用完，请稍后再试", {
      resetAt: Number.isFinite(resetSeconds) ? new Date(resetSeconds * 1000).toISOString() : null,
    });
  }
  if (!response.ok) {
    throw new RepositoryAnalysisError("GITHUB_API", `GitHub 返回了 ${response.status}，暂时无法完成扫描`, { status: response.status });
  }
  try {
    return await response.json();
  } catch {
    throw new RepositoryAnalysisError("INVALID_RESPONSE", "GitHub 返回的数据无法解析");
  }
}

async function rawText(url, fetchImpl) {
  try {
    const response = await fetchImpl(url);
    if (!response.ok) return "";
    return (await response.text()).slice(0, 350_000);
  } catch {
    return "";
  }
}

function fileUrl(baseUrl, sha, path) {
  return `${baseUrl}/blob/${sha}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

function findPath(paths, names) {
  const exact = new Map(paths.map(path => [path.toLowerCase(), path]));
  for (const name of names) {
    const found = exact.get(name.toLowerCase());
    if (found) return found;
  }
  return null;
}

function hasPath(paths, predicate) {
  return paths.some(path => predicate(path.toLowerCase(), path));
}

function evidence(repository, path, detail, source = "repository tree") {
  return {
    path: path || "repository metadata",
    url: path ? fileUrl(repository.url, repository.commitSha, path) : repository.url,
    detail,
    source,
  };
}

function check(id, category, label, status, summary, recommendation, proof, weight) {
  return { id, category, label, status, summary, recommendation, evidence: proof, weight };
}

function assessDependencyPinning(paths, contents, repository) {
  const lockfiles = ["poetry.lock", "uv.lock", "Pipfile.lock", "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lockb", "Cargo.lock", "go.sum", "Gemfile.lock", "composer.lock"];
  const manifests = ["requirements.txt", "pyproject.toml", "environment.yml", "environment.yaml", "setup.py", "setup.cfg", "Pipfile", "package.json", "Cargo.toml", "go.mod", "Gemfile", "composer.json"];
  const lock = findPath(paths, lockfiles);
  const manifest = findPath(paths, manifests);

  if (lock) {
    return check("dependency-lock", "环境", "依赖可锁定", "pass", `检测到 ${lock}，依赖解析具备可重复基础。`, "在发布复现结果时同时记录运行时版本。", evidence(repository, lock, "锁文件存在"), 22);
  }
  if (!manifest) {
    return check("dependency-lock", "环境", "依赖可锁定", "fail", "未找到常见依赖清单或锁文件，无法可靠还原运行环境。", "先补充依赖清单，再生成锁文件并在 CI 中验证。", evidence(repository, null, "未发现常见 manifest/lockfile"), 22);
  }

  const body = contents.get(manifest) || "";
  const requirements = manifest.toLowerCase().endsWith("requirements.txt")
    ? body.split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith("#") && !line.startsWith("-") && /[A-Za-z0-9]/.test(line))
    : [];
  const pinned = requirements.length > 0 && requirements.every(line => /===?\s*[^=<>~!]+/.test(line) || /@\s*(?:https?:|git\+)/.test(line));
  if (pinned) {
    return check("dependency-lock", "环境", "依赖可锁定", "pass", `${manifest} 中的直接依赖均使用精确版本。`, "建议进一步生成解析后的完整锁文件。", evidence(repository, manifest, "检测到精确版本约束"), 22);
  }
  return check("dependency-lock", "环境", "依赖可锁定", "warning", `发现 ${manifest}，但没有对应锁文件，跨时间安装可能得到不同依赖。`, "提交锁文件或包含哈希的固定版本清单。", evidence(repository, manifest, "manifest 存在，lockfile 缺失"), 22);
}

function assessReadme(paths, readme, repository, readmePath) {
  if (!readmePath || !readme.trim()) {
    return check("runbook", "文档", "可执行运行说明", "fail", "未读取到 README，无法确认安装、数据准备和运行入口。", "提供从空环境开始的最小运行路径与预期输出。", evidence(repository, null, "README 缺失或无法读取"), 18);
  }
  const installSignals = /(pip\s+install|conda\s+(?:env|create)|npm\s+(?:install|ci)|pnpm\s+install|yarn\s+install|docker\s+(?:build|compose)|uv\s+sync)/i.test(readme);
  const runSignals = /(python\s+[^\n`]*(?:train|eval|infer|demo|app|main)|bash\s+[^\n`]+|npm\s+run|docker\s+run|torchrun|accelerate\s+launch)/i.test(readme);
  if (installSignals && runSignals) {
    return check("runbook", "文档", "可执行运行说明", "pass", "README 同时包含安装与运行命令线索。", "为关键命令补充预期输出和失败排查会更完整。", evidence(repository, readmePath, "安装命令 + 运行命令"), 18);
  }
  return check("runbook", "文档", "可执行运行说明", "warning", "README 存在，但安装或运行链路不完整。", "补成可复制的 install → prepare → run → evaluate 四步说明。", evidence(repository, readmePath, `${installSignals ? "有安装说明" : "缺安装说明"}；${runSignals ? "有运行入口" : "缺运行入口"}`), 18);
}

function assessRepository({ paths, readme, readmePath, contents, repository, treeTruncated }) {
  const checks = [assessDependencyPinning(paths, contents, repository), assessReadme(paths, readme, repository, readmePath)];

  const licensePath = findPath(paths, ["LICENSE", "LICENSE.md", "LICENSE.txt", "COPYING"]);
  checks.push(licensePath || repository.license
    ? check("license", "治理", "许可证明确", "pass", `许可证为 ${repository.license || licensePath}，使用边界可识别。`, "复现报告中保留许可证与原仓库署名。", evidence(repository, licensePath, repository.license || "license file"), 8)
    : check("license", "治理", "许可证明确", "warning", "没有检测到许可证，代码的使用与再分发边界不清楚。", "添加标准开源许可证或明确仅供研究使用。", evidence(repository, null, "license metadata/file missing"), 8));

  const testPath = paths.find(path => /(^|\/)(tests?|test)(\/|$)/i.test(path)) || paths.find(path => /(^|\/)(?:test_[^/]+|[^/]+\.(?:spec|test)\.[^/]+)$/i.test(path));
  const workflowPath = paths.find(path => path.toLowerCase().startsWith(".github/workflows/"));
  checks.push(testPath
    ? check("tests", "验证", "自动化验证入口", "pass", "仓库包含测试入口，可在修改环境后快速做回归检查。", "在 README 中补充最小测试命令与通过标准。", evidence(repository, testPath, "test path detected"), 14)
    : check("tests", "验证", "自动化验证入口", "warning", workflowPath ? "发现 CI 工作流，但未识别到明确测试目录或测试文件。" : "未识别到自动化测试入口，环境问题与算法问题难以分离。", "加入轻量 smoke test，并固定一份小输入和预期输出。", evidence(repository, workflowPath, workflowPath ? "CI present; explicit tests not found" : "tests not found"), 14));

  const containerPath = findPath(paths, ["Dockerfile", "compose.yaml", "compose.yml", ".devcontainer/devcontainer.json", "environment.yml", "environment.yaml", "flake.nix"]);
  checks.push(containerPath
    ? check("environment", "环境", "运行环境可描述", "pass", `检测到 ${containerPath}，系统级环境具备可移植描述。`, "锁定基础镜像摘要与 CUDA/驱动兼容矩阵。", evidence(repository, containerPath, "environment descriptor detected"), 14)
    : check("environment", "环境", "运行环境可描述", "warning", "未发现容器、Conda 或 Nix 环境描述，系统依赖可能靠人工猜测。", "增加最小容器或 environment.yml，并注明 CUDA/驱动版本。", evidence(repository, null, "portable environment descriptor missing"), 14));

  const assetPath = paths.find(path => /\.(?:safetensors|ckpt|pth|pt|onnx|h5)$/i.test(path));
  const assetReference = /(huggingface\.co|model\s*(?:weights?|checkpoint)|pretrained|download\s+(?:the\s+)?(?:model|data)|dataset|数据集|权重|检查点)/i.test(readme);
  if (assetPath) {
    checks.push(check("assets", "资产", "数据与模型线索", "pass", "仓库快照中包含可识别的模型/资产文件。", "确认许可证、校验和以及大文件存储是否在新环境可用。", evidence(repository, assetPath, "tracked asset detected"), 16));
  } else if (assetReference) {
    checks.push(check("assets", "资产", "数据与模型线索", "warning", "README 提到外部数据或模型，但静态扫描无法证明链接仍可访问或内容未变化。", "为每个外部资产记录稳定 URL、版本、许可证和 SHA-256。", evidence(repository, readmePath, "external asset reference detected"), 16));
  } else {
    checks.push(check("assets", "资产", "数据与模型线索", "warning", "未识别到数据集或模型权重的明确获取线索。", "补充资产清单、下载来源、版本与校验和。", evidence(repository, readmePath, "asset acquisition signal not found"), 16));
  }

  checks.push(check("snapshot", "溯源", "不可变代码快照", "pass", `分析已锁定到 commit ${repository.commitSha.slice(0, 7)}。`, "导出报告时保留完整 SHA，后续复扫可做差异比较。", evidence(repository, null, `commit ${repository.commitSha}`), 4));
  checks.push(repository.archived
    ? check("maintenance", "维护", "仓库维护状态", "fail", "GitHub 将此仓库标记为 archived，依赖修复和问题响应概率较低。", "优先寻找维护中的 fork，或冻结完整运行环境。", evidence(repository, null, "repository archived"), 4)
    : check("maintenance", "维护", "仓库维护状态", "pass", "仓库未被标记为 archived。", "维护状态不代表可复现，仍需执行 smoke test。", evidence(repository, null, "repository active"), 4));

  if (treeTruncated) {
    checks.push(check("tree-coverage", "溯源", "文件树覆盖", "warning", "GitHub 截断了超大仓库的递归文件树，本报告可能漏掉深层文件。", "对关键子目录补做定向扫描。", evidence(repository, null, "GitHub tree response truncated"), 0));
  }
  return checks;
}

function buildRisks(checks) {
  const severityById = { "dependency-lock": "high", runbook: "high", assets: "high", tests: "medium", environment: "medium", license: "medium", maintenance: "high", "tree-coverage": "low" };
  return checks
    .filter(item => item.status !== "pass")
    .map(item => ({
      code: item.id.replace(/-/g, "_").toUpperCase(),
      severity: item.status === "fail" ? (severityById[item.id] === "medium" ? "high" : "critical") : severityById[item.id] || "medium",
      title: item.label,
      description: item.summary,
      evidence: item.evidence,
      recommendation: item.recommendation,
      score: item.status === "fail" ? 9 : severityById[item.id] === "high" ? 7.2 : severityById[item.id] === "medium" ? 5.4 : 3.2,
    }))
    .sort((a, b) => b.score - a.score);
}

function nextActionFor(checks) {
  const first = checks.find(item => item.status === "fail") || checks.find(item => item.status === "warning");
  if (!first) return { title: "运行一个最小 Smoke Test", description: "静态证据已较完整；下一步应在隔离环境中验证安装、启动和一份小输入。", checklist: ["创建全新隔离环境", "执行 README 最短路径", "保存依赖、硬件和输出日志"] };
  return {
    title: `先处理：${first.label}`,
    description: first.recommendation,
    sourceCheckId: first.id,
    checklist: [first.recommendation, "在全新隔离环境运行最小入口", "保存命令、版本、硬件与失败日志"],
  };
}

export async function analyzeRepository(input, options = {}) {
  const parsed = typeof input === "string" ? parseGitHubRepository(input) : parseGitHubRepository(input?.url || input?.fullName || `${input?.owner || ""}/${input?.repo || ""}`);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new RepositoryAnalysisError("UNSUPPORTED", "当前浏览器不支持网络请求");
  const progress = typeof options.onProgress === "function" ? options.onProgress : () => {};

  progress("metadata", "读取仓库元数据与默认分支");
  const metadata = await apiRequest(parsed.apiUrl, fetchImpl);
  const defaultBranch = metadata.default_branch || "main";
  const baseUrl = metadata.html_url || parsed.url;

  progress("snapshot", "锁定不可变 commit 快照");
  const commit = await apiRequest(`${parsed.apiUrl}/commits/${encodeURIComponent(defaultBranch)}`, fetchImpl);
  const commitSha = commit.sha;
  const repository = {
    owner: metadata.owner?.login || parsed.owner,
    name: metadata.name || parsed.repo,
    fullName: metadata.full_name || parsed.fullName,
    url: baseUrl,
    description: metadata.description || "暂无仓库描述",
    defaultBranch,
    commitSha,
    language: metadata.language || "Unknown",
    stars: Number(metadata.stargazers_count || 0),
    forks: Number(metadata.forks_count || 0),
    openIssues: Number(metadata.open_issues_count || 0),
    license: metadata.license?.spdx_id && metadata.license.spdx_id !== "NOASSERTION" ? metadata.license.spdx_id : null,
    archived: Boolean(metadata.archived),
    updatedAt: metadata.updated_at || null,
  };

  progress("tree", "扫描依赖、配置、测试与资产路径");
  const treeResult = await apiRequest(`${parsed.apiUrl}/git/trees/${encodeURIComponent(commitSha)}?recursive=1`, fetchImpl);
  const paths = (treeResult.tree || []).filter(item => item.type === "blob").map(item => item.path);
  const readmeJson = await apiRequest(`${parsed.apiUrl}/readme?ref=${encodeURIComponent(commitSha)}`, fetchImpl, { optional: true });
  const readmePath = readmeJson?.path || findPath(paths, ["README.md", "README.rst", "README.txt", "README"]);
  let readme = readmeJson?.content ? decodeBase64(readmeJson.content) : "";
  if (!readme && readmePath) {
    readme = await rawText(`https://raw.githubusercontent.com/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}/${encodeURIComponent(commitSha)}/${readmePath.split("/").map(encodeURIComponent).join("/")}`, fetchImpl);
  }

  const contentCandidates = ["requirements.txt", "pyproject.toml", "environment.yml", "environment.yaml", "package.json"];
  const contents = new Map();
  for (const name of contentCandidates) {
    const path = findPath(paths, [name]);
    if (!path || contents.size >= 3) continue;
    const url = `https://raw.githubusercontent.com/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}/${encodeURIComponent(commitSha)}/${path.split("/").map(encodeURIComponent).join("/")}`;
    contents.set(path, await rawText(url, fetchImpl));
  }

  progress("rules", "运行确定性证据规则");
  const checks = assessRepository({ paths, readme, readmePath, contents, repository, treeTruncated: Boolean(treeResult.truncated) });
  const weightedTotal = checks.reduce((sum, item) => sum + item.weight, 0) || 1;
  const scoreFactor = { pass: 1, warning: 0.55, fail: 0 };
  const readiness = Math.round(checks.reduce((sum, item) => sum + item.weight * scoreFactor[item.status], 0) / weightedTotal * 100);
  const metrics = {
    passed: checks.filter(item => item.status === "pass").length,
    warnings: checks.filter(item => item.status === "warning").length,
    blockers: checks.filter(item => item.status === "fail").length,
    total: checks.length,
    evidenceCoverage: Math.round(checks.filter(item => item.evidence?.path && item.evidence.path !== "repository metadata").length / checks.length * 100),
  };
  const risks = buildRisks(checks);

  return {
    schema: "reprogate/repository-audit/v0.2",
    mode: "live",
    analyzedAt: new Date().toISOString(),
    methodology: "GitHub public metadata + immutable tree snapshot + deterministic rules",
    repository,
    files: { total: paths.length, treeTruncated: Boolean(treeResult.truncated), readmePath, inspectedManifests: [...contents.keys()] },
    checks,
    risks,
    readiness,
    statusLabel: metrics.blockers ? "存在前置阻塞" : readiness >= 80 ? "静态准备度较高" : readiness >= 60 ? "有条件进入验证" : "建议先补齐材料",
    metrics,
    nextAction: nextActionFor(checks),
  };
}
