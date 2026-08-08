const claims = [
  { id: "c1", label: "C-01", title: "Uni-MoE 在 ActivityNet-QA 上达到 52.7% 准确率", source: "Table 2 · Page 8", metric: "Accuracy 52.7%", confidence: 96, risks: 2 },
  { id: "c2", label: "C-02", title: "Token Router 将推理延迟降低 31%", source: "Figure 4 · Page 10", metric: "Latency −31%", confidence: 88, risks: 1 },
  { id: "c3", label: "C-03", title: "单张 24GB GPU 可完成完整推理", source: "Section 4.1 · Page 7", metric: "VRAM ≤ 24GB", confidence: 72, risks: 3 },
];

const plans = {
  smoke: { name: "Smoke Test", subtitle: "确认仓库与模型能够启动", time: "3 分钟", cost: "¥0.08", confidence: "低", command: "python tools/smoke_test.py --config configs/demo.yaml" },
  minimal: { name: "Minimal Verification", subtitle: "用 5% 数据验证核心 Claim", time: "18 分钟", cost: "¥2.40", confidence: "中高", command: "python evaluate.py --config configs/activitynet_5pct.yaml" },
  full: { name: "Full Reproduction", subtitle: "运行论文报告的完整评测", time: "11.5 小时", cost: "¥86.00", confidence: "高", command: "bash scripts/reproduce_activitynet.sh" },
};

const state = { activeClaim: "c1", view: "overview", selectedPlan: "minimal", approved: false };
const app = document.querySelector("#app");
const paperInput = document.querySelector("#paper-input");
const repoInput = document.querySelector("#repo-input");
const startButton = document.querySelector("#start-button");

function updateStartState() { startButton.disabled = !(paperInput.files.length || repoInput.value.trim()); }

paperInput.addEventListener("change", () => {
  const name = paperInput.files[0]?.name;
  if (name) {
    document.querySelector("#file-name").textContent = name;
    document.querySelector("#file-hint").textContent = "文件已就绪";
    document.querySelector("#file-status").textContent = "✓";
    document.querySelector("#file-drop").classList.add("has-file");
  }
  updateStartState();
});
repoInput.addEventListener("input", updateStartState);
document.querySelector("#sample-button").addEventListener("click", () => {
  repoInput.value = "https://github.com/reprogate-lab/uni-moe";
  document.querySelector("#file-name").textContent = "uni-moe-paper.pdf";
  document.querySelector("#file-hint").textContent = "示例文件已就绪";
  document.querySelector("#file-status").textContent = "✓";
  document.querySelector("#file-drop").classList.add("has-file");
  startAnalysis();
});
startButton.addEventListener("click", startAnalysis);

async function startAnalysis() {
  const label = startButton.querySelector(".button-label");
  startButton.disabled = true;
  label.textContent = "正在建立证据快照…";
  try {
    await fetch("/api/demo-analysis", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ repository: repoInput.value || "demo", paper: document.querySelector("#file-name").textContent }) });
  } catch { /* Static hosting fallback: the demo data remains available. */ }
  window.setTimeout(renderDashboard, 700);
}

function brand() { return `<span class="brand-mark" aria-hidden="true">R<span>G</span></span><div><strong>ReproGate</strong><span>RESEARCH READINESS</span></div>`; }

function graph(expanded = false) {
  return `<div class="evidence-graph ${expanded ? "expanded" : ""}">
    <div class="graph-legend"><span><i class="dot green"></i>已验证</span><span><i class="dot amber"></i>需确认</span><span><i class="dot red"></i>阻塞</span></div>
    <div class="graph-canvas"><div class="graph-node root-node"><small>CLAIM C-01</small><strong>Accuracy 52.7%</strong><span>论文核心结论</span></div><div class="branch-line vertical"></div><div class="branch-line horizontal"></div>
      <div class="graph-children"><div class="graph-node status-green"><small>METRIC</small><strong>Accuracy</strong><span>evaluation.py ✓</span></div><div class="graph-node status-amber"><small>DATASET</small><strong>ActivityNet-QA</strong><span>预处理未确认</span></div><div class="graph-node status-red"><small>CHECKPOINT</small><strong>Uni-MoE-7B</strong><span>下载链接失效</span></div><div class="graph-node status-green"><small>CONFIG</small><strong>activitynet.yaml</strong><span>commit a81d9c ✓</span></div></div>
    </div></div>`;
}

function claimList() {
  return claims.map(item => `<button data-claim="${item.id}" class="${state.activeClaim === item.id ? "active" : ""}"><div class="claim-radio"><i></i></div><div class="claim-content"><span><b>${item.label}</b><small>${item.source}</small></span><strong>${item.title}</strong><div><em>${item.metric}</em><span>${item.confidence}% 证据置信度</span></div></div><span class="risk-count">${item.risks}</span></button>`).join("");
}

function overview() {
  const claim = claims.find(item => item.id === state.activeClaim) || claims[0];
  return `<div class="dashboard-grid">
    <section class="claim-panel panel"><div class="panel-heading"><div><span class="section-index">01</span><div><h2>选择目标 Claim</h2><p>只验证真正影响决策的结论</p></div></div><span class="count-pill">3 / 7</span></div><div class="claim-list">${claimList()}</div><button class="show-more">查看其余 4 条次要 Claim <span>↓</span></button></section>
    <section class="graph-panel panel"><div class="panel-heading compact"><div><span class="section-index">02</span><div><h2>Claim—Artifact 证据图</h2><p>${claim.label} · ${claim.metric}</p></div></div><button class="icon-button" data-view="graph">↗</button></div>${graph()}</section>
    <section class="risk-panel panel"><div class="panel-heading compact"><div><span class="section-index">03</span><div><h2>阻塞项与风险</h2><p>按预期影响排序</p></div></div><span class="danger-pill">2 BLOCKERS</span></div>
      <div class="risk-card critical"><div class="risk-card-top"><span>CRITICAL · ARTIFACT_MISSING</span><b>风险 9.2</b></div><h3>预训练 Checkpoint 下载链接已失效</h3><p>README 指向的云盘返回 404，目标 Claim 需要 Uni-MoE-7B 权重才能运行评测。</p><div class="evidence-box"><span>证据</span><code>README.md:184 → drive.google.com/.../weights</code><b>404</b></div><div class="risk-actions"><button>查看来源 ↗</button><button>标记为已解决</button></div></div>
      <div class="risk-card high"><div class="risk-card-top"><span>HIGH · PAPER_CODE_MISMATCH</span><b>风险 7.4</b></div><h3>视频帧采样数量不一致</h3><p>论文写明每段采样 32 帧，仓库默认配置为 16 帧，可能影响表 2 的准确率。</p><div class="comparison-row"><span>论文 <b>32 frames</b></span><i>≠</i><span>代码 <b>16 frames</b></span></div><div class="risk-actions"><button>查看差异 ↗</button><button>接受论文配置</button></div></div>
      <div class="notice-card"><span>i</span><p><b>1 个待确认项</b>随机种子未在论文中披露，预计影响 ±0.6 accuracy。</p></div></section>
    <section class="decision-panel"><div><span class="decision-icon">⌁</span><div><small>NEXT BEST ACTION</small><h2>先运行 5% 数据的最小验证</h2><p>预计可用 18 分钟、¥2.40 排除 78% 的核心失败风险。</p></div></div><button data-open-plan>生成验证方案 <span>→</span></button></section>
  </div>`;
}

function graphView() { return `<div class="single-view panel"><div class="panel-heading"><div><span class="section-index">02</span><div><h2>完整 Claim—Artifact 证据图</h2><p>每个结论、代码与数据关系均可追溯</p></div></div><button class="secondary-button" data-view="overview">返回总览</button></div>${graph(true)}<div class="graph-insights"><div><small>节点</small><strong>18</strong><span>7 已验证</span></div><div><small>证据覆盖率</small><strong>76%</strong><span>较 README +28%</span></div><div><small>未知依赖</small><strong>3</strong><span>2 个影响执行</span></div><div><small>快照</small><strong>a81d9c</strong><span>不可变更</span></div></div></div>`; }

function runsView() { return `<div class="single-view panel runs-view"><div class="panel-heading"><div><span class="section-index">04</span><div><h2>运行与决策记录</h2><p>所有人工批准和系统动作均留痕</p></div></div><button class="secondary-button" data-open-plan>新建验证</button></div><div class="run-timeline"><div class="run-event done"><i>✓</i><div><span><b>证据快照创建</b><time>10:42:18</time></span><p>锁定 PDF SHA-256 与 Git commit a81d9c</p></div></div><div class="run-event done"><i>✓</i><div><span><b>静态检查完成</b><time>10:43:02</time></span><p>12 个检查器通过，发现 2 个阻塞项和 1 个待确认项</p></div></div><div class="run-event current"><i>!</i><div><span><b>等待人工决策</b><time>现在</time></span><p>请选择验证方案并批准网络、算力与命令权限</p></div></div></div></div>`; }

function dashboardTemplate() {
  return `<main class="app-shell"><aside class="sidebar"><button class="sidebar-brand" data-reset>${brand()}</button><nav class="side-nav"><button class="active"><span>⌂</span>工作台</button><button><span>◎</span>复现任务<b>1</b></button><button><span>◇</span>评测集</button><button><span>⌁</span>检查器</button></nav><div class="sidebar-section"><small>当前项目</small><button class="project-link"><i>UM</i><span><strong>Uni-MoE</strong><small>审计进行中</small></span><b>•••</b></button></div><div class="sidebar-bottom"><div class="quota"><span><b>本月分析</b><small>3 / 20</small></span><div><i></i></div></div><button><span>?</span>文档与反馈</button><button class="user-button"><i>李</i><span><b>研究者账户</b><small>Demo workspace</small></span></button></div></aside>
  <section class="workspace"><header class="workspace-topbar"><div class="breadcrumb"><span>复现任务</span><b>/</b><strong>Uni-MoE readiness audit</strong></div><div class="top-actions"><span class="sync-status"><i></i>证据快照已锁定</span><button data-export>导出报告</button><button class="avatar">李</button></div></header>
    <div class="project-header"><div class="project-title-row"><div><div class="status-line"><span class="audit-badge">前置审计</span><span>最后更新于 2 分钟前</span></div><h1>Uni-MoE: Scaling Unified Multimodal Models</h1><p><span>▣ uni-moe-paper.pdf</span><span>⌘ reprogate-lab/uni-moe</span><span>⑂ commit a81d9c</span></p></div><div class="readiness-score"><div class="score-ring"><strong>64</strong><span>/100</span></div><div><b>有条件可复现</b><small>2 个关键阻塞项</small></div></div></div>
      <div class="phase-track"><div class="done"><i>✓</i><span><b>证据快照</b><small>PDF + commit</small></span></div><div class="done"><i>✓</i><span><b>Claim 提取</b><small>发现 7 条</small></span></div><div class="current"><i>3</i><span><b>风险审计</b><small>正在查看</small></span></div><div><i>4</i><span><b>最小验证</b><small>等待审批</small></span></div><div><i>5</i><span><b>结果归因</b><small>尚未执行</small></span></div></div>
      <div class="view-tabs"><button data-view="overview" class="active">审计总览</button><button data-view="graph">完整证据图</button><button data-view="runs">运行记录</button></div></div><div id="view-content">${overview()}</div></section></main>`;
}

function renderDashboard() { app.innerHTML = dashboardTemplate(); bindDashboard(); }

function bindDashboard() {
  app.addEventListener("click", handleDashboardClick, { once: true });
}

function handleDashboardClick(event) {
  const target = event.target.closest("button");
  if (target?.dataset.reset !== undefined) { window.location.reload(); return; }
  if (target?.dataset.claim) { state.activeClaim = target.dataset.claim; state.view = "overview"; updateView(); }
  else if (target?.dataset.view) { state.view = target.dataset.view; updateView(); }
  else if (target?.dataset.openPlan !== undefined) openPlan();
  else if (target?.dataset.export !== undefined) downloadSpec();
  bindDashboard();
}

function updateView() {
  document.querySelectorAll("[data-view]").forEach(button => button.classList.toggle("active", button.dataset.view === state.view));
  const content = document.querySelector("#view-content");
  content.innerHTML = state.view === "overview" ? overview() : state.view === "graph" ? graphView() : runsView();
}

function openPlan() {
  const modal = document.createElement("div"); modal.className = "modal-backdrop"; modal.id = "plan-modal";
  modal.innerHTML = `<section class="plan-modal" role="dialog" aria-modal="true"><div class="modal-header"><div><span class="section-index">04</span><div><small>MINIMUM VERIFICATION</small><h2>选择验证深度</h2></div></div><button data-close>×</button></div><p class="modal-intro">目标不是完整复现整篇论文，而是用最低成本判断核心 Claim 是否值得继续投入。</p><div class="plan-options">${Object.entries(plans).map(([key, item]) => `<button data-plan="${key}" class="${state.selectedPlan === key ? "active" : ""}"><div class="plan-choice"><i></i>${key === "minimal" ? "<span>推荐</span>" : ""}</div><h3>${item.name}</h3><p>${item.subtitle}</p><dl><div><dt>预计时间</dt><dd>${item.time}</dd></div><div><dt>预计成本</dt><dd>${item.cost}</dd></div><div><dt>结论置信度</dt><dd>${item.confidence}</dd></div></dl></button>`).join("")}</div><div class="command-preview"><span>待批准命令</span><code>${plans[state.selectedPlan].command}</code><b>只读 · 无网络</b></div><label class="approval-check"><input id="approval" type="checkbox" ${state.approved ? "checked" : ""}><span>我已确认运行范围、预计成本和只读权限</span></label><div class="modal-actions"><button data-close>暂不执行</button><button data-approve ${state.approved ? "" : "disabled"}>批准并加入队列 <span>→</span></button></div></section>`;
  document.body.append(modal);
  modal.addEventListener("click", event => {
    const button = event.target.closest("button");
    if (event.target === modal || button?.dataset.close !== undefined) modal.remove();
    else if (button?.dataset.plan) { state.selectedPlan = button.dataset.plan; modal.remove(); openPlan(); }
    else if (button?.dataset.approve !== undefined) { modal.remove(); showToast("验证任务已批准并加入队列"); }
  });
  modal.querySelector("#approval").addEventListener("change", event => { state.approved = event.target.checked; modal.querySelector("[data-approve]").disabled = !state.approved; });
}

function downloadSpec() {
  const claim = claims.find(item => item.id === state.activeClaim) || claims[0]; const plan = plans[state.selectedPlan];
  const payload = { schema: "reprospec/v0.1", project: "Uni-MoE: Unified Multimodal Mixture-of-Experts", snapshot: { paper_sha256: "9be7…a82c", git_commit: "a81d9c" }, claim: { id: claim.label, text: claim.title, evidence: claim.source }, readiness: 64, blockers: [{ code: "ARTIFACT_MISSING", item: "Uni-MoE-7B checkpoint", severity: "critical" }, { code: "PAPER_CODE_MISMATCH", item: "frame sampling 32 vs 16", severity: "high" }], minimal_verification: { name: plan.name, command: plan.command, expected_time: plan.time, expected_cost: plan.cost }, human_approval: state.approved };
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "uni-moe-reprospec.json"; anchor.click(); URL.revokeObjectURL(url); showToast("ReproSpec 已下载");
}

function showToast(message) { document.querySelector(".toast")?.remove(); const toast = document.createElement("div"); toast.className = "toast"; toast.innerHTML = `<span>✓</span>${message}`; document.body.append(toast); window.setTimeout(() => toast.remove(), 2600); }
