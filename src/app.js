import { analyzeRepository, parseGitHubRepository, RepositoryAnalysisError } from "./github-analyzer.js?v=0.3.0";
import { FINANCE_CASES, auditFinanceCase, formatProgram } from "./finance-audit.js?v=0.3.0";

const app = document.querySelector("#app");
const state = {
  analysis: null,
  view: "overview",
  paper: null,
  logs: [],
  activeRequest: 0,
  finance: { caseId: FINANCE_CASES[0]?.id || null, candidateId: null },
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]);
}

function safeUrl(value, fallback = "#") {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : fallback;
  } catch {
    return fallback;
  }
}

function formatNumber(value) {
  return new Intl.NumberFormat("zh-CN", { notation: Number(value) >= 10_000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(Number(value || 0));
}

function formatDate(value) {
  if (!value) return "未知";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "未知" : new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function clampScore(value) { return Math.max(0, Math.min(100, Math.round(Number(value || 0)))); }

function brand() {
  return `<span class="brand-mark" aria-hidden="true">R<span>G</span></span><div><strong>ReproGate</strong><span>RESEARCH READINESS</span></div>`;
}

function addLog(label, detail, status = "done") {
  state.logs.push({ at: new Date().toISOString(), label, detail, status });
}

function sampleAnalysis() {
  const repository = {
    owner: "openai", name: "whisper", fullName: "openai/whisper", url: "https://github.com/openai/whisper",
    description: "Robust Speech Recognition via Large-Scale Weak Supervision", defaultBranch: "main", commitSha: "sample01",
    language: "Python", stars: 0, forks: 0, openIssues: 0, license: "MIT", archived: false, updatedAt: "2026-08-08T00:00:00.000Z",
  };
  const proof = (path, detail) => ({ path, detail, source: "frozen sample", url: `${repository.url}/blob/main/${path}` });
  const checks = [
    { id: "dependency-lock", category: "环境", label: "依赖可锁定", status: "warning", summary: "检测到 requirements.txt，但样例快照没有依赖锁文件。", recommendation: "生成带哈希的锁文件并记录 Python、PyTorch 与 CUDA 版本。", evidence: proof("requirements.txt", "manifest present; lockfile missing") },
    { id: "runbook", category: "文档", label: "可执行运行说明", status: "pass", summary: "README 包含安装与命令行运行示例。", recommendation: "补充固定输入与预期输出校验。", evidence: proof("README.md", "install + run commands") },
    { id: "license", category: "治理", label: "许可证明确", status: "pass", summary: "检测到 MIT 许可证。", recommendation: "复现报告保留原仓库署名。", evidence: proof("LICENSE", "MIT") },
    { id: "tests", category: "验证", label: "自动化验证入口", status: "pass", summary: "仓库包含测试目录，可执行基础回归。", recommendation: "增加针对模型资产下载失败的 smoke test。", evidence: proof("tests/", "test path detected") },
    { id: "environment", category: "环境", label: "运行环境可描述", status: "warning", summary: "样例快照未检测到容器或 Conda 环境描述。", recommendation: "提供最小容器并锁定系统级音频依赖。", evidence: proof("README.md", "system dependencies documented only") },
    { id: "assets", category: "资产", label: "数据与模型线索", status: "warning", summary: "模型权重在运行时从外部地址获取，静态扫描无法证明其内容未变化。", recommendation: "记录资产 URL、版本、许可证与 SHA-256。", evidence: proof("whisper/__init__.py", "external model registry") },
    { id: "snapshot", category: "溯源", label: "不可变代码快照", status: "pass", summary: "样例报告锁定到演示快照。", recommendation: "真实扫描会记录完整 commit SHA。", evidence: proof("README.md", "sample snapshot") },
  ];
  const risks = checks.filter(item => item.status !== "pass").map((item, index) => ({
    code: item.id.replace(/-/g, "_").toUpperCase(), severity: index === 0 ? "high" : "medium", score: index === 0 ? 7.2 : 5.4,
    title: item.label, description: item.summary, recommendation: item.recommendation, evidence: item.evidence,
  }));
  return {
    schema: "reprogate/repository-audit/v0.2", mode: "sample", analyzedAt: "2026-08-08T10:00:00.000Z",
    methodology: "Frozen demonstration data; no live request was made", repository, files: { total: 84, treeTruncated: false, readmePath: "README.md", inspectedManifests: ["requirements.txt"] },
    checks, risks, readiness: 74, statusLabel: "有条件进入验证", metrics: { passed: 4, warnings: 3, blockers: 0, total: 7, evidenceCoverage: 86 },
    nextAction: { title: "先锁定依赖与模型资产", description: "生成依赖锁文件，并为外部模型权重记录版本和 SHA-256。", checklist: ["生成带哈希的 Python 锁文件", "记录模型权重 URL 与 SHA-256", "在全新环境运行固定音频 smoke test"] },
  };
}

function normalizeAnalysis(raw) {
  const checks = Array.isArray(raw.checks) ? raw.checks.map((item, index) => ({
    id: item.id || `check-${index + 1}`,
    category: item.category || "其他",
    label: item.label || item.title || `检查 ${index + 1}`,
    status: ["pass", "warning", "fail"].includes(item.status) ? item.status : "warning",
    summary: item.summary || item.description || "暂无说明",
    recommendation: item.recommendation || "建议人工复核。",
    evidence: typeof item.evidence === "object" && item.evidence ? item.evidence : { path: item.path || "repository metadata", detail: String(item.evidence || "") },
  })) : [];
  const passed = checks.filter(item => item.status === "pass").length;
  const warnings = checks.filter(item => item.status === "warning").length;
  const blockers = checks.filter(item => item.status === "fail").length;
  const risks = Array.isArray(raw.risks) ? raw.risks : checks.filter(item => item.status !== "pass").map(item => ({ title: item.label, description: item.summary, recommendation: item.recommendation, evidence: item.evidence, severity: item.status === "fail" ? "critical" : "medium" }));
  return {
    ...raw,
    mode: raw.mode === "sample" ? "sample" : "live",
    analyzedAt: raw.analyzedAt || new Date().toISOString(),
    repository: raw.repository || {},
    files: raw.files || {},
    checks,
    risks,
    readiness: clampScore(raw.readiness),
    metrics: { passed, warnings, blockers, total: checks.length, evidenceCoverage: raw.metrics?.evidenceCoverage ?? 0, ...raw.metrics },
    statusLabel: raw.statusLabel || (blockers ? "存在前置阻塞" : "有条件进入验证"),
    nextAction: raw.nextAction || { title: "人工复核关键证据", description: "静态扫描之后仍需在隔离环境运行最小验证。", checklist: [] },
  };
}

function setupElements() {
  return {
    paper: document.querySelector("#paper-input"), repo: document.querySelector("#repo-input"), start: document.querySelector("#start-button"),
    sample: document.querySelector("#sample-button"), validation: document.querySelector("#repo-validation"), error: document.querySelector("#form-error"),
    progress: document.querySelector("#analysis-progress"), progressBar: document.querySelector("#progress-bar"), progressTitle: document.querySelector("#progress-title"), progressDetail: document.querySelector("#progress-detail"),
  };
}

function validateRepositoryInput(elements, { announce = true } = {}) {
  const value = elements.repo.value.trim();
  if (!value) {
    elements.start.disabled = true;
    if (announce) elements.validation.textContent = "";
    return null;
  }
  try {
    const parsed = parseGitHubRepository(value);
    elements.start.disabled = false;
    elements.repo.closest(".repo-field").classList.remove("invalid");
    if (announce) {
      elements.validation.textContent = `✓ 将扫描 ${parsed.fullName}`;
      elements.validation.className = "valid";
    }
    return parsed;
  } catch (error) {
    elements.start.disabled = true;
    elements.repo.closest(".repo-field").classList.add("invalid");
    if (announce) {
      elements.validation.textContent = error.message;
      elements.validation.className = "invalid";
    }
    return null;
  }
}

function updateProgress(elements, percent, title, detail) {
  elements.progress.hidden = false;
  elements.progressBar.style.width = `${percent}%`;
  elements.progressTitle.textContent = title;
  elements.progressDetail.textContent = detail;
}

async function fingerprintPaper(file) {
  if (!file) return null;
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  const sha256 = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
  return { name: file.name, size: file.size, type: file.type, sha256, processing: "local fingerprint only; file content was not uploaded or parsed" };
}

function friendlyError(error) {
  if (!(error instanceof RepositoryAnalysisError)) return { title: "扫描没有完成", detail: "发生了未预期的问题。请检查网络并重试，也可以先查看样例报告。" };
  if (error.code === "RATE_LIMIT") {
    const reset = error.details?.resetAt ? `预计恢复时间：${formatDate(error.details.resetAt)}。` : "";
    return { title: "GitHub 匿名额度暂时用完", detail: `${reset}稍后重试，或先查看样例报告。` };
  }
  if (error.code === "NOT_FOUND") return { title: "找不到公开仓库", detail: "请确认仓库存在且为公开状态，并粘贴仓库首页地址。" };
  if (error.code === "NETWORK") return { title: "无法连接 GitHub", detail: "请检查网络、代理或浏览器扩展后重试；本页不会自动改用演示数据。" };
  return { title: error.message, detail: "请修正输入后重试；本页不会把失败伪装成成功结果。" };
}

function bindSetup() {
  const elements = setupElements();
  const params = new URLSearchParams(window.location.search);
  const queryRepo = params.get("repo");
  const queryCase = params.get("case");
  const queryCandidate = params.get("candidate");
  const financeButtons = [document.querySelector("#finance-lab-button"), document.querySelector("#nav-finance-button")].filter(Boolean);

  if (queryRepo && queryCase) {
    elements.error.innerHTML = "<strong>分享链接参数冲突</strong><span>repo 与 case 不能同时使用。请保留一个审计对象后重试。</span>";
    elements.error.hidden = false;
  } else if (queryCase) {
    try {
      openFinanceLab(queryCase, queryCandidate, { updateUrl: false });
      return;
    } catch (error) {
      elements.error.innerHTML = `<strong>找不到金融案例</strong><span>${escapeHtml(error.message)}</span>`;
      elements.error.hidden = false;
    }
  }

  if (queryRepo) elements.repo.value = queryRepo;
  validateRepositoryInput(elements, { announce: Boolean(queryRepo && !queryCase) });
  financeButtons.forEach(button => button.addEventListener("click", () => openFinanceLab(undefined, undefined, { updateUrl: true })));

  elements.repo.addEventListener("input", () => {
    elements.error.hidden = true;
    validateRepositoryInput(elements);
  });
  elements.paper.addEventListener("change", () => {
    const file = elements.paper.files[0];
    const drop = document.querySelector("#file-drop");
    if (!file) return;
    if (file.type !== "application/pdf" || file.size > 25 * 1024 * 1024) {
      elements.paper.value = "";
      elements.error.innerHTML = "<strong>PDF 无法附加</strong><span>请选择 25MB 以内的 PDF 文件。</span>";
      elements.error.hidden = false;
      return;
    }
    document.querySelector("#file-name").textContent = file.name;
    document.querySelector("#file-hint").textContent = `${(file.size / 1024 / 1024).toFixed(1)}MB · 扫描时仅计算 SHA-256`;
    document.querySelector("#file-status").textContent = "✓";
    drop.classList.add("has-file");
  });
  elements.sample.addEventListener("click", () => {
    state.activeRequest += 1;
    state.logs = [];
    addLog("打开演示快照", "没有发起 GitHub 网络请求；所有数据均标记为 SAMPLE。", "sample");
    state.analysis = normalizeAnalysis(sampleAnalysis());
    renderReport();
  });
  elements.start.addEventListener("click", async () => {
    const parsed = validateRepositoryInput(elements);
    if (!parsed) return;
    const requestId = ++state.activeRequest;
    elements.start.disabled = true;
    elements.error.hidden = true;
    elements.repo.disabled = true;
    elements.paper.disabled = true;
    state.logs = [];
    try {
      updateProgress(elements, 12, "准备本地输入", "不会上传或解析 PDF 内容");
      const paperPromise = fingerprintPaper(elements.paper.files[0]);
      addLog("输入已验证", `目标公开仓库：${parsed.fullName}`);
      const progressMap = {
        metadata: [28, "读取公开元数据", "确认默认分支、许可证与维护状态"],
        snapshot: [44, "锁定代码快照", "使用 commit SHA 避免分支继续变化"],
        tree: [63, "扫描仓库证据", "检查依赖、文档、测试、环境与资产线索"],
        rules: [84, "运行确定性规则", "每个结论都关联到文件或仓库元数据"],
      };
      const result = await analyzeRepository(parsed.url, {
        fetchImpl: window.fetch.bind(window),
        onProgress(step) {
          const [percent, title, detail] = progressMap[step] || [50, "正在扫描", "读取公开仓库证据"];
          updateProgress(elements, percent, title, detail);
          addLog(title, detail);
        },
      });
      if (requestId !== state.activeRequest) return;
      state.paper = await paperPromise;
      if (requestId !== state.activeRequest) return;
      updateProgress(elements, 100, "生成审计报告", "整理风险、证据与最低成本下一步");
      addLog("静态审计完成", `生成 ${result.checks?.length || 0} 项检查；未执行仓库代码。`);
      state.analysis = normalizeAnalysis({ ...result, paper: state.paper });
      window.setTimeout(renderReport, 260);
    } catch (error) {
      if (requestId !== state.activeRequest) return;
      const message = friendlyError(error);
      elements.error.innerHTML = `<strong>${escapeHtml(message.title)}</strong><span>${escapeHtml(message.detail)}</span>`;
      elements.error.hidden = false;
      elements.progress.hidden = true;
      elements.start.disabled = false;
      elements.repo.disabled = false;
      elements.paper.disabled = false;
      elements.start.querySelector(".button-label").textContent = "重新扫描";
      addLog("扫描失败", `${error.code || "UNKNOWN"}: ${error.message}`, "error");
    }
  });
}

function statusText(status) { return status === "pass" ? "已验证" : status === "fail" ? "阻塞" : "需确认"; }
function severityText(severity) { return ({ critical: "关键", high: "高", medium: "中", low: "低" })[severity] || "中"; }

function sourceLink(proof, label = "查看来源 ↗") {
  const url = safeUrl(proof?.url);
  return url === "#" ? `<span class="source-unavailable">${escapeHtml(proof?.path || "仓库元数据")}</span>` : `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`;
}

function reportRail(analysis) {
  const repo = analysis.repository;
  return `<aside class="report-rail">
    <button class="report-brand" data-reset>${brand()}</button>
    <div class="rail-source"><small>SOURCE SNAPSHOT</small><strong>${escapeHtml(repo.fullName)}</strong><span>${escapeHtml(repo.defaultBranch || "main")} · ${escapeHtml((repo.commitSha || "unknown").slice(0, 7))}</span><a href="${escapeHtml(safeUrl(repo.url))}" target="_blank" rel="noreferrer">打开仓库 ↗</a></div>
    <nav class="report-nav" aria-label="报告视图">
      <button data-view="overview" class="${state.view === "overview" ? "active" : ""}"><span>01</span>决策总览</button>
      <button data-view="evidence" class="${state.view === "evidence" ? "active" : ""}"><span>02</span>证据清单 <b>${analysis.checks.length}</b></button>
      <button data-view="log" class="${state.view === "log" ? "active" : ""}"><span>03</span>分析记录</button>
      <button data-finance><span>04</span>金融推理实验 <b>NEW</b></button>
    </nav>
    <div class="rail-boundary"><small>THIS AUDIT DID</small><p>读取公开元数据与文件树<br>运行确定性静态规则</p><small>DID NOT</small><p>不执行仓库代码<br>不解析论文正文<br>不验证外部资产可用性</p></div>
  </aside>`;
}

function checkCards(analysis) {
  return analysis.checks.map(item => `<article class="audit-check ${item.status}">
    <div class="check-status"><i></i><span>${escapeHtml(item.category)}</span><b>${statusText(item.status)}</b></div>
    <h3>${escapeHtml(item.label)}</h3><p>${escapeHtml(item.summary)}</p>
    <div class="check-proof"><code>${escapeHtml(item.evidence?.path || "repository metadata")}</code><span>${escapeHtml(item.evidence?.detail || "")}</span></div>
    <div class="check-footer">${sourceLink(item.evidence)}<button data-copy="${escapeHtml(item.recommendation)}">复制建议</button></div>
  </article>`).join("");
}

function riskCards(analysis) {
  if (!analysis.risks.length) return `<div class="empty-state"><span>✓</span><h3>没有静态阻塞项</h3><p>这不等于已经复现成功；下一步仍需隔离环境中的最小运行验证。</p></div>`;
  return analysis.risks.map((risk, index) => `<article class="report-risk severity-${escapeHtml(risk.severity || "medium")}">
    <div><span>${String(index + 1).padStart(2, "0")} · ${escapeHtml(risk.code || "REVIEW_REQUIRED")}</span><b>${severityText(risk.severity)}风险${risk.score ? ` · ${escapeHtml(risk.score)}` : ""}</b></div>
    <h3>${escapeHtml(risk.title)}</h3><p>${escapeHtml(risk.description)}</p>
    <div class="risk-evidence"><span>EVIDENCE</span><code>${escapeHtml(risk.evidence?.path || "repository metadata")}</code>${sourceLink(risk.evidence, "打开 ↗")}</div>
    <small>建议：${escapeHtml(risk.recommendation || "人工复核该项。")}</small>
  </article>`).join("");
}

function scoreExplanation(analysis) {
  const { passed, warnings, blockers, total } = analysis.metrics;
  return `${total} 项静态检查中，${passed} 项通过、${warnings} 项待确认、${blockers} 项阻塞。分数只表示仓库静态准备度，不代表论文结果已复现。`;
}

function overviewView(analysis) {
  return `<div class="report-dashboard">
    <section class="decision-brief">
      <div class="brief-label"><span>NEXT BEST ACTION</span><b>01 / DECIDE</b></div>
      <div><h2>${escapeHtml(analysis.nextAction.title)}</h2><p>${escapeHtml(analysis.nextAction.description)}</p></div>
      <button data-checklist>导出验证任务单 <span>→</span></button>
    </section>
    <div class="metric-row">
      <article><small>检查通过</small><strong>${analysis.metrics.passed}</strong><span>/${analysis.metrics.total} 项</span></article>
      <article><small>待人工确认</small><strong>${analysis.metrics.warnings}</strong><span>静态证据不足</span></article>
      <article><small>前置阻塞</small><strong>${analysis.metrics.blockers}</strong><span>建议先处理</span></article>
      <article><small>扫描文件</small><strong>${formatNumber(analysis.files.total)}</strong><span>${analysis.files.treeTruncated ? "树被 GitHub 截断" : "完整树响应"}</span></article>
    </div>
    <section class="report-section checks-section"><div class="report-section-title"><div><span>02</span><div><h2>静态检查矩阵</h2><p>规则输出，不由语言模型生成；每项都附证据位置。</p></div></div><button data-view="evidence">查看证据表 →</button></div><div class="audit-check-grid">${checkCards(analysis)}</div></section>
    <section class="report-section risks-section"><div class="report-section-title"><div><span>03</span><div><h2>风险队列</h2><p>按复现失败影响排序，不把“未知”包装成“通过”。</p></div></div><b>${analysis.risks.length} ITEMS</b></div><div class="report-risk-list">${riskCards(analysis)}</div></section>
  </div>`;
}

function evidenceView(analysis) {
  const rows = analysis.checks.map(item => `<tr><td><span class="table-status ${item.status}"><i></i>${statusText(item.status)}</span></td><td><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(item.category)}</small></td><td><code>${escapeHtml(item.evidence?.path || "repository metadata")}</code><small>${escapeHtml(item.evidence?.detail || "")}</small></td><td>${sourceLink(item.evidence, "打开 ↗")}</td></tr>`).join("");
  return `<section class="single-report-view"><div class="view-intro"><span>02 / EVIDENCE LEDGER</span><h2>证据清单</h2><p>本页记录“结论来自哪里”，方便面试展示、人工复核和后续差异扫描。</p></div>
    <div class="snapshot-strip"><div><small>COMMIT SHA</small><code>${escapeHtml(analysis.repository.commitSha || "unknown")}</code></div><div><small>DEFAULT BRANCH</small><strong>${escapeHtml(analysis.repository.defaultBranch)}</strong></div><div><small>TREE FILES</small><strong>${formatNumber(analysis.files.total)}</strong></div><div><small>MANIFESTS READ</small><strong>${analysis.files.inspectedManifests?.length || 0}</strong></div></div>
    <div class="evidence-table-wrap"><table class="evidence-table"><thead><tr><th>状态</th><th>检查</th><th>证据位置</th><th>来源</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="method-note"><strong>证据边界</strong><p>文件存在性来自 commit 固定的递归树；README 与少量 manifest 内容由浏览器只读获取。外链可用性、代码可执行性与论文结论均未在这一阶段验证。</p></div>
  </section>`;
}

function logView(analysis) {
  const logs = state.logs.length ? state.logs : [{ at: analysis.analyzedAt, label: "载入演示快照", detail: "没有发起实时网络请求。", status: "sample" }];
  const items = logs.map(item => `<li class="${escapeHtml(item.status)}"><i>${item.status === "error" ? "!" : item.status === "sample" ? "S" : "✓"}</i><div><span><strong>${escapeHtml(item.label)}</strong><time>${escapeHtml(formatDate(item.at))}</time></span><p>${escapeHtml(item.detail)}</p></div></li>`).join("");
  return `<section class="single-report-view"><div class="view-intro"><span>03 / AUDIT LOG</span><h2>分析记录</h2><p>只展示本次浏览器会话真实发生的动作，不伪造后台任务或代码执行。</p></div><ol class="actual-log">${items}</ol>
    <div class="method-grid"><article><small>数据来源</small><h3>GitHub Public REST API</h3><p>元数据、默认分支、commit 与递归文件树。</p></article><article><small>判定方法</small><h3>Deterministic Rules</h3><p>固定路径与文本信号规则，可在导出的 JSON 中复核。</p></article><article><small>隐私</small><h3>Browser-side Only</h3><p>${analysis.paper ? "PDF 只计算本地 SHA-256，正文未上传。" : "本次没有附加 PDF。"}</p></article></div>
  </section>`;
}

function reportHeader(analysis) {
  const repo = analysis.repository;
  const mode = analysis.mode === "sample" ? "SAMPLE · 冻结样例" : "LIVE · 实时公开数据";
  const licenseCheck = analysis.checks.find(item => item.id === "license");
  const licenseLabel = repo.license || (licenseCheck?.status === "pass" ? licenseCheck.evidence?.path || "License file" : "未识别许可证");
  return `<header class="report-topbar"><div class="report-breadcrumb"><span>REPOSITORY AUDIT</span><b>/</b><strong>${escapeHtml(repo.fullName)}</strong></div><div class="report-actions"><button data-share>复制重扫链接</button><button class="export-button" data-export>导出 ReproSpec JSON</button></div></header>
  <section class="report-hero"><div class="report-kicker"><span class="mode-badge ${analysis.mode}">${mode}</span><time>分析于 ${escapeHtml(formatDate(analysis.analyzedAt))}</time></div><div class="report-hero-main"><div><h1>${escapeHtml(repo.fullName)}</h1><p>${escapeHtml(repo.description || "暂无仓库描述")}</p><div class="repo-facts"><span>${escapeHtml(repo.language || "Unknown")}</span><span>★ ${formatNumber(repo.stars)}</span><span>⑂ ${formatNumber(repo.forks)}</span><span>${escapeHtml(licenseLabel)}</span><span>${escapeHtml(repo.defaultBranch || "main")}@${escapeHtml((repo.commitSha || "unknown").slice(0, 7))}</span>${analysis.paper ? `<span>PDF SHA ${escapeHtml(analysis.paper.sha256.slice(0, 8))}…（仅指纹）</span>` : ""}</div></div><div class="readiness-card"><div class="report-score" style="--score:${analysis.readiness}"><strong>${analysis.readiness}</strong><span>/100</span></div><div><b>${escapeHtml(analysis.statusLabel)}</b><small>仓库静态准备度</small></div></div></div><p class="score-explainer">${escapeHtml(scoreExplanation(analysis))}</p></section>`;
}

function renderReport() {
  const analysis = state.analysis;
  if (!analysis) return;
  app.innerHTML = `<main class="report-shell">${reportRail(analysis)}<section class="report-workspace">${reportHeader(analysis)}<div id="report-view">${state.view === "overview" ? overviewView(analysis) : state.view === "evidence" ? evidenceView(analysis) : logView(analysis)}</div></section></main>`;
  document.body.classList.add("report-open");
  app.onclick = handleReportClick;
  window.scrollTo({ top: 0, behavior: "instant" });
}

async function copyText(value, message = "已复制") {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const input = document.createElement("textarea"); input.value = value; input.style.position = "fixed"; input.style.opacity = "0"; document.body.append(input); input.select(); document.execCommand("copy"); input.remove();
  }
  showToast(message);
}

function reportPayload() {
  return {
    schema: "reprogate/reprospec/v0.2",
    generatedAt: new Date().toISOString(),
    capability: { repositoryStaticAudit: true, paperContentParsed: false, codeExecuted: false, externalAssetsVerified: false },
    ...state.analysis,
  };
}

function downloadFile(filename, body, type) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function downloadSpec() {
  const name = (state.analysis.repository.fullName || "repository").replace("/", "-");
  downloadFile(`${name}-reprospec.json`, JSON.stringify(reportPayload(), null, 2), "application/json");
  showToast("ReproSpec JSON 已导出");
}

function downloadChecklist() {
  const analysis = state.analysis;
  const repo = analysis.repository;
  const list = analysis.nextAction.checklist?.length ? analysis.nextAction.checklist : [analysis.nextAction.description];
  const risks = analysis.risks.map(item => `- [ ] ${item.title}：${item.recommendation || item.description}`).join("\n") || "- [ ] 在隔离环境运行最小 smoke test";
  const markdown = `# ${repo.fullName} · 最小复现验证任务单\n\n> 由 ReproGate v0.3 的仓库静态审计生成。它不是论文复现结论。\n\n- Commit: \`${repo.commitSha}\`\n- 静态准备度: ${analysis.readiness}/100\n- 生成时间: ${new Date().toISOString()}\n\n## 下一步\n\n${list.map(item => `- [ ] ${item}`).join("\n")}\n\n## 风险处理\n\n${risks}\n\n## 运行记录\n\n- [ ] 记录 OS / Python / CUDA / GPU\n- [ ] 保存完整安装命令与日志\n- [ ] 使用固定小输入并记录预期输出\n- [ ] 禁止在未审查前执行高权限脚本\n`;
  downloadFile(`${repo.name || "repository"}-verification-checklist.md`, markdown, "text/markdown");
  showToast("验证任务单已导出");
}

function financeCandidateOptions(caseData) {
  const baseline = (caseData.candidates || []).map((item, index) => ({
    ...item,
    label: index === 0 ? "冻结基线输出" : item.label || `候选 ${index + 1}`,
    variant: "baseline",
  }));
  const repaired = {
    ...caseData.expected,
    id: `${caseData.id}-repaired`,
    label: "按证据口径最小修复",
    variant: "repaired",
  };
  return [...baseline, repaired];
}

function resolveFinanceCase(caseId) {
  const id = caseId || FINANCE_CASES[0]?.id;
  const match = FINANCE_CASES.find(item => item.id === id);
  if (!match) throw new Error(`未知案例：${id}`);
  return match;
}

function resolveFinanceCandidate(caseData, candidateId) {
  const candidates = financeCandidateOptions(caseData);
  if (!candidateId) return candidates[0];
  const match = candidates.find(item => item.id === candidateId);
  if (!match) throw new Error(`案例 ${caseData.id} 中不存在候选输出：${candidateId}`);
  return match;
}

function financeFactLabel(key) {
  const labels = {
    operating_income: "营业利润",
    revenue: "收入",
    research_expense: "研发费用",
    revenue_2025: "2025 年收入",
    revenue_2024: "2024 年收入",
    outstanding_debt: "期末未偿债务",
    cash_flow_2025: "2025 年经营现金流",
    cash_flow_2024: "2024 年经营现金流",
  };
  return labels[key] || key.replaceAll("_", " ");
}

function formatFinanceValue(value, unit = "") {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value === null || value === undefined || value === "") return "不可计算";
  const number = Number(value);
  if (!Number.isFinite(number)) return "不可计算";
  const formatted = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 4 }).format(number);
  const normalizedUnit = String(unit || "").toLowerCase();
  if (["percent", "percentage", "%"].includes(normalizedUnit)) return `${formatted}%`;
  return `${formatted}${unit ? ` ${unit}` : ""}`;
}

function financeCaseList(activeId) {
  return FINANCE_CASES.map((item, index) => {
    const audit = auditFinanceCase(item);
    const status = audit.status === "pass" ? "PASS" : `${audit.metrics.issueCount} ISSUE${audit.metrics.issueCount === 1 ? "" : "S"}`;
    return `<button class="finance-case-button ${item.id === activeId ? "active" : ""}" data-finance-case="${escapeHtml(item.id)}" aria-pressed="${item.id === activeId}">
      <span>${String(index + 1).padStart(2, "0")}</span><div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.provenance.benchmarkStyle)} · ${escapeHtml(status)}</small></div>
    </button>`;
  }).join("");
}

function financeEvidence(caseData, audit) {
  return caseData.evidence.map((item, index) => {
    const selected = audit.evidence.selectedIds.includes(item.id);
    const required = audit.evidence.requiredIds.includes(item.id);
    const statusClass = selected ? "used" : required ? "missing" : "";
    const facts = Object.entries(item.facts || {}).map(([key, fact]) => {
      const normalized = fact && typeof fact === "object" ? fact : { value: fact };
      return `<div class="finance-evidence-value"><span>${escapeHtml(financeFactLabel(key))}</span><strong>${escapeHtml(formatFinanceValue(normalized.value, normalized.unit))}</strong></div>`;
    }).join("");
    return `<article class="finance-evidence-item ${statusClass}">
      <header><span>E-${String(index + 1).padStart(2, "0")} · ${selected ? "CITED" : required ? "REQUIRED / NOT CITED" : "AVAILABLE"}</span><b>${escapeHtml(item.document)} · p.${escapeHtml(item.page)}</b></header>
      <p>${escapeHtml(item.quote)}</p>${facts}
    </article>`;
  }).join("");
}

function financeTrace(audit) {
  if (!audit.trace.length) return `<div class="empty-state"><span>!</span><h3>公式没有完成执行</h3><p>请先处理结构或安全错误，再生成数值结论。</p></div>`;
  return `<ol class="finance-trace">${audit.trace.map((step, index) => `<li>
    <span>${String(index + 1).padStart(2, "0")}</span><div><code>${escapeHtml(`${step.operator}(${step.operands.join(", ")})`)}</code><small>${escapeHtml(step.path)} · 白名单运算</small></div><strong>${escapeHtml(formatFinanceValue(step.result))}</strong>
  </li>`).join("")}</ol>`;
}

function financeIssues(audit) {
  if (!audit.issues.length) return `<article class="finance-issue pass"><header><span>ALL_CHECKS_PASS</span><b>PASS</b></header><p>证据、单位、分母、公式执行结果与参考口径一致。</p></article>`;
  const categoryLabel = { evidence: "证据", unit: "单位", denominator: "分母", numeric: "数值" };
  return audit.issues.map(item => `<article class="finance-issue ${["medium", "low"].includes(item.severity) ? "warning" : ""}">
    <header><span>${escapeHtml(item.code)} · ${escapeHtml(categoryLabel[item.category] || item.category)}</span><b>${escapeHtml(item.severity.toUpperCase())}</b></header>
    <p><strong>${escapeHtml(item.title)}</strong>：${escapeHtml(item.detail)} 建议：${escapeHtml(item.recommendation)}</p>
  </article>`).join("");
}

function financeAuditPayload(caseData, candidate, audit) {
  return {
    schema: "reprogate/finance-reasoning-audit/v0.3",
    generatedAt: new Date().toISOString(),
    mode: "synthetic-frozen-replay",
    capability: {
      benchmarkMethodReferenced: true,
      benchmarkRecordCopied: false,
      deterministicVerifierExecuted: true,
      modelInvoked: false,
      untrustedCodeExecuted: false,
      financialAdvice: false,
      documentScope: "curated-synthetic-evidence-only",
    },
    benchmarkStyle: caseData.provenance.benchmarkStyle,
    case: { id: caseData.id, title: caseData.title, question: caseData.question, evidence: caseData.evidence, provenance: caseData.provenance },
    candidate,
    reference: caseData.expected,
    evaluation: audit,
  };
}

function downloadFinanceAudit() {
  const caseData = resolveFinanceCase(state.finance.caseId);
  const candidate = resolveFinanceCandidate(caseData, state.finance.candidateId);
  const audit = auditFinanceCase(caseData, candidate);
  downloadFile(`${caseData.id}-finance-audit.json`, JSON.stringify(financeAuditPayload(caseData, candidate, audit), null, 2), "application/json");
  showToast("金融推理审计 JSON 已导出");
}

function updateFinanceUrl(caseData, candidate, method = "pushState") {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set("case", caseData.id);
  url.searchParams.set("candidate", candidate.id);
  window.history[method]({}, "", url);
}

function openFinanceLab(caseId, candidateId, { updateUrl = false } = {}) {
  const caseData = resolveFinanceCase(caseId);
  const candidate = resolveFinanceCandidate(caseData, candidateId);
  state.activeRequest += 1;
  state.analysis = null;
  state.paper = null;
  state.logs = [];
  state.view = "overview";
  state.finance = { caseId: caseData.id, candidateId: candidate.id };
  if (updateUrl) updateFinanceUrl(caseData, candidate);
  renderFinanceLab();
}

function renderFinanceLab() {
  const caseData = resolveFinanceCase(state.finance.caseId);
  const candidate = resolveFinanceCandidate(caseData, state.finance.candidateId);
  const candidates = financeCandidateOptions(caseData);
  const audit = auditFinanceCase(caseData, candidate);
  const verdictTitle = audit.status === "pass" ? "该候选输出可接受" : audit.status === "warning" ? "该候选输出需要人工复核" : "该候选输出应在发布前阻断";
  const verdictDetail = audit.issues[0]?.title || "全部确定性检查通过。";
  const verdictIcon = audit.status === "pass" ? "✓" : audit.status === "warning" ? "!" : "×";
  const program = formatProgram(candidate.formula);
  const benchmarkUrl = safeUrl(caseData.provenance.referenceUrl);
  const outputAligned = audit.metrics.numericAligned && audit.metrics.unitAligned;

  app.innerHTML = `<main class="finance-shell">
    <aside class="finance-rail">
      <button class="report-brand" data-reset>${brand()}</button>
      <div class="finance-lab-stamp"><span>INDUSTRY LAB 01</span><h2>可审计金融推理</h2><p>冻结案例回放 · 证据归因 · 公式复算 · 故障定位</p></div>
      <nav class="finance-case-list" aria-label="金融审计案例"><small>FROZEN CASE QUEUE · ${FINANCE_CASES.length}</small>${financeCaseList(caseData.id)}</nav>
      <div class="finance-rail-boundary"><strong>SAFE REPLAY</strong><p>不调用模型<br>不执行任意代码<br>不构成金融建议</p></div>
    </aside>
    <section class="finance-workspace">
      <header class="finance-topbar"><div class="finance-breadcrumb"><span>FINANCIAL REASONING AUDIT</span><b>/</b><strong>${escapeHtml(caseData.id)}</strong></div><div class="finance-top-actions"><a href="${escapeHtml(benchmarkUrl)}" target="_blank" rel="noreferrer">方法来源 ↗</a><button data-finance-export>导出审计 JSON</button></div></header>
      <section class="finance-hero">
        <div class="finance-hero-kicker"><span class="frozen">SAMPLE · FROZEN REPLAY</span><span class="deterministic">DETERMINISTIC</span><span>SYNTHETIC FIXTURE</span><span>NO API KEY</span></div>
        <h1>财报证据与公式审计台</h1>
        <p>它不负责“生成一个像真的答案”，而是定位答案第一次偏离证据与参考口径的位置：检索、引用、单位、分母，还是最终数值。</p>
        <div class="finance-method-links"><a href="https://github.com/patronus-ai/financebench" target="_blank" rel="noreferrer">FinanceBench 方法仓库 ↗</a><a href="https://github.com/czyssrs/FinQA" target="_blank" rel="noreferrer">FinQA 方法仓库 ↗</a><a href="https://aclanthology.org/2021.emnlp-main.300/" target="_blank" rel="noreferrer">FinQA 论文 ↗</a></div>
      </section>
      <div class="finance-content">
        <section class="finance-question-card">
          <div class="finance-question-meta"><span>${escapeHtml(caseData.provenance.benchmarkStyle)}-STYLE</span><b>${escapeHtml(caseData.id)}</b><b>原创合成证据 · 非官方 benchmark 样本</b></div>
          <h2>${escapeHtml(caseData.question)}</h2><p>${escapeHtml(caseData.title)} · ${escapeHtml(caseData.provenance.note)}</p>
          <div class="candidate-switch"><span>OUTPUT REPLAY</span><div class="candidate-buttons">${candidates.map(item => `<button class="${item.id === candidate.id ? "active" : ""}" data-finance-candidate="${escapeHtml(item.id)}" aria-pressed="${item.id === candidate.id}">${escapeHtml(item.label)}</button>`).join("")}</div></div>
        </section>
        <div class="finance-metrics">
          <article class="${audit.score === 100 ? "metric-pass" : "metric-fail"}"><small>CASE AUDIT SCORE</small><strong>${audit.score}/100</strong><span>单案例审计分，不是 benchmark 准确率</span></article>
          <article class="${audit.metrics.evidenceAligned ? "metric-pass" : "metric-fail"}"><small>EVIDENCE COVERAGE</small><strong>${audit.metrics.evidenceCoveragePercent}%</strong><span>${audit.metrics.evidenceAligned ? "引用覆盖参考证据" : "存在缺失或无效引用"}</span></article>
          <article class="${audit.trace.length ? "metric-pass" : "metric-warning"}"><small>PROGRAM EXECUTION</small><strong>${audit.trace.length} steps</strong><span>结构化白名单运算，不执行代码字符串</span></article>
          <article class="${outputAligned ? "metric-pass" : "metric-fail"}"><small>OUTPUT VERDICT</small><strong>${outputAligned ? "MATCH" : "DRIFT"}</strong><span>候选 ${escapeHtml(formatFinanceValue(candidate.answer, candidate.unit))} · 参考 ${escapeHtml(formatFinanceValue(caseData.expected.answer, caseData.expected.unit))}</span></article>
        </div>
        <div class="finance-grid">
          <section class="finance-panel"><div class="finance-panel-heading"><div><span>01</span><div><h3>证据账本</h3><p>每个公式输入都必须回到文档、页码和结构化事实。</p></div></div><b>${audit.evidence.selectedIds.length}/${audit.evidence.requiredIds.length} CITED</b></div><div class="finance-evidence-list">${financeEvidence(caseData, audit)}</div></section>
          <div>
            <section class="finance-panel"><div class="finance-panel-heading"><div><span>02</span><div><h3>程序执行轨迹</h3><p>显示结构化运算，不展示或伪造模型思维链。</p></div></div><b>${escapeHtml(candidate.variant.toUpperCase())}</b></div><div class="finance-program-body">
              <div class="finance-program-code"><small>WHITELISTED FORMULA AST</small><code>${escapeHtml(program).replaceAll("\n", "<br>")}</code></div>
              <div class="finance-output-strip"><div><small>候选呈现</small><strong>${escapeHtml(formatFinanceValue(candidate.answer, candidate.unit))}</strong></div><div><small>程序执行</small><strong>${escapeHtml(formatFinanceValue(audit.calculatedValue, candidate.unit))}</strong></div><div><small>参考答案</small><strong>${escapeHtml(formatFinanceValue(audit.expectedValue, caseData.expected.unit))}</strong></div></div>
              ${financeTrace(audit)}
            </div></section>
            <section class="finance-verdict ${audit.status}" aria-live="polite"><div class="finance-verdict-summary"><span>${verdictIcon}</span><div><small>${escapeHtml(audit.decision.toUpperCase())} · FIRST DIVERGENCE</small><h3>${escapeHtml(verdictTitle)}</h3><p>${escapeHtml(verdictDetail)}</p></div></div><div class="finance-issue-list">${financeIssues(audit)}</div></section>
          </div>
        </div>
        <section class="finance-boundary"><span>METHOD & USAGE BOUNDARY</span><p>本页使用 ReproGate 原创合成财报片段，只复现 FinanceBench 的证据归因思路与 FinQA 的符号程序评测思路；没有复制官方数据记录。Gold/修复程序回放不等于真实模型推理，也不构成投资建议。</p><a href="${escapeHtml(benchmarkUrl)}" target="_blank" rel="noreferrer">核对方法来源 ↗</a></section>
      </div>
    </section>
  </main>`;
  document.body.classList.add("report-open");
  app.onclick = handleFinanceClick;
  window.scrollTo({ top: 0, behavior: "instant" });
}

function handleFinanceClick(event) {
  const target = event.target.closest("button");
  if (!target) return;
  if (target.dataset.reset !== undefined) { window.location.href = window.location.pathname; return; }
  if (target.dataset.financeCase) { openFinanceLab(target.dataset.financeCase, undefined, { updateUrl: true }); return; }
  if (target.dataset.financeCandidate) {
    const caseData = resolveFinanceCase(state.finance.caseId);
    const candidate = resolveFinanceCandidate(caseData, target.dataset.financeCandidate);
    state.finance.candidateId = candidate.id;
    updateFinanceUrl(caseData, candidate, "replaceState");
    renderFinanceLab();
    return;
  }
  if (target.dataset.financeExport !== undefined) downloadFinanceAudit();
}

function handleReportClick(event) {
  const target = event.target.closest("button");
  if (!target) return;
  if (target.dataset.reset !== undefined) { window.location.href = window.location.pathname; return; }
  if (target.dataset.finance !== undefined) { openFinanceLab(undefined, undefined, { updateUrl: true }); return; }
  if (target.dataset.view) { state.view = target.dataset.view; renderReport(); return; }
  if (target.dataset.export !== undefined) { downloadSpec(); return; }
  if (target.dataset.checklist !== undefined) { downloadChecklist(); return; }
  if (target.dataset.copy !== undefined) { copyText(target.dataset.copy, "建议已复制"); return; }
  if (target.dataset.share !== undefined) {
    const url = new URL(window.location.href); url.search = ""; url.hash = ""; url.searchParams.set("repo", state.analysis.repository.fullName);
    copyText(url.href, "重扫链接已复制");
  }
}

function showToast(message) {
  document.querySelector(".toast")?.remove();
  const toast = document.createElement("div"); toast.className = "toast"; toast.innerHTML = `<span>✓</span>${escapeHtml(message)}`; document.body.append(toast);
  window.setTimeout(() => toast.remove(), 2600);
}

window.addEventListener("popstate", () => window.location.reload());
bindSetup();
