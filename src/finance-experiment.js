import { FINANCE_CASESET_VERSION, formatProgram } from "./finance-audit.js?v=0.4.0";

export const FINANCE_COMPARISON_SNAPSHOT_SCHEMA = "reprogate/finance-comparison-snapshot/v0.4";
export const FINANCE_EXPERIMENT_SCHEMA = FINANCE_COMPARISON_SNAPSHOT_SCHEMA;
export const FINANCE_EXPERIMENT_STORAGE_KEY = "reprogate.financeSnapshots.v1";
export const FINANCE_SNAPSHOT_STORAGE_KEY = FINANCE_EXPERIMENT_STORAGE_KEY;
export const FINANCE_EXPERIMENT_HISTORY_LIMIT = 20;

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function boundedText(value, fallback = "", maxLength = 180) {
  const text = typeof value === "string" ? value.trim() : "";
  return (text || fallback).slice(0, maxLength);
}

function requiredText(value, maxLength) {
  const text = boundedText(value, "", maxLength);
  return text || null;
}

function scalarOrNull(value) {
  if (typeof value === "boolean") return value;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function finiteInRangeOrNull(value, minimum, maximum) {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum ? value : null;
}

function stringList(value, limit = 24) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(item => boundedText(item, "", 100)).filter(Boolean))].slice(0, limit);
}

function normalizeLimit(value, fallback = FINANCE_EXPERIMENT_HISTORY_LIMIT) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return Math.max(1, Math.min(50, Math.trunc(fallback)));
  return Math.max(1, Math.min(50, Math.trunc(numeric)));
}

function compactFormula(formula) {
  if (!formula) return { formula: "", formulaError: "FORMULA_MISSING" };
  try {
    const formatted = formatProgram(formula);
    return {
      formula: formatted.slice(0, 1000),
      formulaError: formatted.length > 1000 ? "FORMULA_TRUNCATED" : null,
    };
  } catch (error) {
    return {
      formula: "",
      formulaError: boundedText(error?.code || error?.name || "INVALID_FORMULA", "INVALID_FORMULA", 100),
    };
  }
}

function compactRun(candidate, audit) {
  const formula = compactFormula(candidate?.formula);
  return {
    candidateId: boundedText(candidate?.id, "unknown", 140),
    label: boundedText(candidate?.label, "未命名候选", 100),
    variant: boundedText(candidate?.variant, "baseline", 30),
    origin: boundedText(candidate?.origin, "frozen-fixture", 50),
    answer: scalarOrNull(candidate?.answer),
    unit: boundedText(candidate?.unit, "", 50),
    formula: formula.formula,
    formulaError: formula.formulaError,
    score: finiteInRangeOrNull(audit?.score, 0, 100),
    status: boundedText(audit?.status, "unknown", 20),
    decision: boundedText(audit?.decision, "unknown", 20),
    issueCodes: stringList(audit?.issues?.map(item => item.code)),
    evidenceCoveragePercent: finiteInRangeOrNull(audit?.metrics?.evidenceCoveragePercent, 0, 100),
    calculatedValue: scalarOrNull(audit?.calculatedValue),
    reportedValue: scalarOrNull(audit?.reportedValue),
    expectedValue: scalarOrNull(audit?.expectedValue),
  };
}

function compactStoredRun(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidateId = requiredText(value.candidateId, 140);
  const score = finiteInRangeOrNull(value.score, 0, 100);
  const evidenceCoveragePercent = finiteInRangeOrNull(value.evidenceCoveragePercent, 0, 100);
  if (!candidateId || score === null || evidenceCoveragePercent === null) return null;
  return {
    candidateId,
    label: boundedText(value.label, "未命名候选", 100),
    variant: boundedText(value.variant, "baseline", 30),
    origin: boundedText(value.origin, "frozen-fixture", 50),
    answer: scalarOrNull(value.answer),
    unit: boundedText(value.unit, "", 50),
    formula: boundedText(value.formula, "", 1000),
    formulaError: requiredText(value.formulaError, 100),
    score,
    status: boundedText(value.status, "unknown", 20),
    decision: boundedText(value.decision, "unknown", 20),
    issueCodes: stringList(value.issueCodes),
    evidenceCoveragePercent,
    calculatedValue: scalarOrNull(value.calculatedValue),
    reportedValue: scalarOrNull(value.reportedValue),
    expectedValue: scalarOrNull(value.expectedValue),
  };
}

export function createFinanceExperimentRecord({
  id,
  createdAt,
  caseData,
  baselineCandidate,
  referenceCandidate,
  comparison,
  view = "compare",
  activeCandidateId = baselineCandidate?.id,
}) {
  if (!caseData?.id || !comparison?.baseline || !comparison?.reference || !baselineCandidate || !referenceCandidate) {
    throw new TypeError("本地对比快照缺少案例、候选或比较结果");
  }
  const timestamp = new Date(createdAt);
  if (!Number.isFinite(timestamp.valueOf())) throw new TypeError("本地对比快照生成时间无效");

  return deepFreeze({
    schema: FINANCE_COMPARISON_SNAPSHOT_SCHEMA,
    fixtureVersion: FINANCE_CASESET_VERSION,
    id: boundedText(id, `${caseData.id}-${timestamp.valueOf()}`, 180),
    createdAt: timestamp.toISOString(),
    view: view === "single" ? "single" : "compare",
    activeCandidateId: boundedText(activeCandidateId, baselineCandidate.id || "", 140),
    case: {
      id: boundedText(caseData.id, "unknown", 140),
      title: boundedText(caseData.title, "未命名案例", 160),
      benchmarkStyle: boundedText(caseData.provenance?.benchmarkStyle, "custom", 40),
      synthetic: caseData.provenance?.synthetic === true,
    },
    baseline: compactRun(baselineCandidate, comparison.baseline),
    reference: compactRun(referenceCandidate, comparison.reference),
    delta: {
      decision: boundedText(comparison.decision, "unchanged", 20),
      score: scalarOrNull(comparison.delta?.score),
      evidenceCoveragePoints: scalarOrNull(comparison.delta?.evidenceCoveragePoints),
      resolvedIssueCodes: stringList(comparison.delta?.resolvedIssueCodes),
      remainingIssueCodes: stringList(comparison.delta?.remainingIssueCodes),
      introducedIssueCodes: stringList(comparison.delta?.introducedIssueCodes),
    },
    capability: {
      modelInvoked: false,
      untrustedCodeExecuted: false,
      financialAdvice: false,
      fullEvidenceStored: false,
      deterministicCurrentFixtureReplay: true,
    },
  });
}

function compactStoredRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (value.schema !== FINANCE_COMPARISON_SNAPSHOT_SCHEMA) return null;
  const fixtureVersion = requiredText(value.fixtureVersion, 80);
  const id = requiredText(value.id, 180);
  const caseId = requiredText(value.case?.id, 140);
  if (!fixtureVersion || !id || !caseId) return null;

  const timestamp = new Date(value.createdAt);
  const baseline = compactStoredRun(value.baseline);
  const reference = compactStoredRun(value.reference);
  if (!Number.isFinite(timestamp.valueOf()) || !baseline || !reference) return null;

  return deepFreeze({
    schema: FINANCE_COMPARISON_SNAPSHOT_SCHEMA,
    fixtureVersion,
    id,
    createdAt: timestamp.toISOString(),
    view: value.view === "single" ? "single" : "compare",
    activeCandidateId: boundedText(value.activeCandidateId, baseline.candidateId, 140),
    case: {
      id: caseId,
      title: boundedText(value.case.title, "未命名案例", 160),
      benchmarkStyle: boundedText(value.case.benchmarkStyle, "custom", 40),
      synthetic: value.case.synthetic === true,
    },
    baseline,
    reference,
    delta: {
      decision: boundedText(value.delta?.decision, "unchanged", 20),
      score: scalarOrNull(value.delta?.score),
      evidenceCoveragePoints: scalarOrNull(value.delta?.evidenceCoveragePoints),
      resolvedIssueCodes: stringList(value.delta?.resolvedIssueCodes),
      remainingIssueCodes: stringList(value.delta?.remainingIssueCodes),
      introducedIssueCodes: stringList(value.delta?.introducedIssueCodes),
    },
    capability: {
      modelInvoked: false,
      untrustedCodeExecuted: false,
      financialAdvice: false,
      fullEvidenceStored: false,
      deterministicCurrentFixtureReplay: true,
    },
  });
}

export function parseFinanceExperimentStore(value, { limit = FINANCE_EXPERIMENT_HISTORY_LIMIT } = {}) {
  let parsed = value;
  if (typeof value === "string") {
    try { parsed = JSON.parse(value); } catch { return []; }
  }
  if (!Array.isArray(parsed)) return [];
  const safeLimit = normalizeLimit(limit);
  return deepFreeze(parsed.map(compactStoredRecord).filter(Boolean).slice(0, safeLimit));
}

function snapshotIdentity(record) {
  const active = record.view === "single" ? `|${record.activeCandidateId}` : "";
  return `${record.fixtureVersion}|${record.case.id}|${record.baseline.candidateId}|${record.reference.candidateId}|${record.view}${active}`;
}

export function appendFinanceExperiment(records, record, { limit = FINANCE_EXPERIMENT_HISTORY_LIMIT } = {}) {
  const normalized = compactStoredRecord(record);
  if (!normalized) throw new TypeError("无法保存无效的本地对比快照");
  const safeLimit = normalizeLimit(limit);
  const existing = parseFinanceExperimentStore(records, { limit: safeLimit });
  const key = snapshotIdentity(normalized);
  const deduplicated = existing.filter(item => snapshotIdentity(item) !== key);
  return deepFreeze([normalized, ...deduplicated].slice(0, safeLimit));
}

export function removeFinanceExperiment(records, id, { limit = 50 } = {}) {
  const safeLimit = normalizeLimit(limit, 50);
  return deepFreeze(parseFinanceExperimentStore(records, { limit: safeLimit }).filter(item => item.id !== id));
}

function markdownInline(value) {
  return String(value ?? "").replace(/[\r\n\0]+/g, " ").replace(/([\\`*_{}\[\]()#+\-.!|>])/g, "\\$1");
}

function markdownScalar(value) {
  if (typeof value === "boolean") return value ? "true" : "false";
  return value === null || value === undefined ? "N/A" : markdownInline(value);
}

function markdownIssueList(values) {
  return values.length ? values.map(value => markdownInline(value).replace(/\\_/g, "_")).join("、") : "无";
}

function markdownCodeBlock(value, error) {
  const content = value || (error ? `[${error}]` : "[无公式]");
  return String(content)
    .replace(/\0/g, "")
    .replace(/`/g, "\\`")
    .split(/\r?\n/)
    .map(line => `    ${line}`)
    .join("\n");
}

export function serializeFinanceExperiment(record, format = "json") {
  const normalized = compactStoredRecord(record);
  if (!normalized) throw new TypeError("无法导出无效的本地对比快照");
  if (format === "json") return JSON.stringify(normalized, null, 2);
  if (format !== "markdown") throw new TypeError(`不支持的快照导出格式：${format}`);

  const scoreDelta = normalized.delta.score > 0 ? `+${normalized.delta.score}` : String(normalized.delta.score ?? 0);
  const baselineFormula = markdownCodeBlock(normalized.baseline.formula, normalized.baseline.formulaError);
  const referenceFormula = markdownCodeBlock(normalized.reference.formula, normalized.reference.formulaError);

  return `# ReproGate 合成案例审计对比卡

- 案例：${markdownInline(normalized.case.title)}（${markdownInline(normalized.case.id)}）
- 范式标签：${markdownInline(normalized.case.benchmarkStyle)}\-style
- 案例版本：${markdownInline(normalized.fixtureVersion)}
- 生成时间：${markdownInline(normalized.createdAt)}
- 快照语义：浏览器本地对比快照；参考侧为参考答案回放，不是模型自动修复

## 对比结论

- Decision：${markdownInline(normalized.delta.decision)}
- 分数变化：${markdownInline(scoreDelta)}
- 已解决问题：${markdownIssueList(normalized.delta.resolvedIssueCodes)}
- 仍存在问题：${markdownIssueList(normalized.delta.remainingIssueCodes)}
- 新引入问题：${markdownIssueList(normalized.delta.introducedIssueCodes)}

## 冻结基线

- 审计分：${markdownScalar(normalized.baseline.score)}/100
- 证据覆盖：${markdownScalar(normalized.baseline.evidenceCoveragePercent)}%
- 审计状态：${markdownInline(normalized.baseline.status)}
- 呈现答案：${markdownScalar(normalized.baseline.reportedValue)} ${markdownInline(normalized.baseline.unit)}
- 公式记录错误：${markdownInline(normalized.baseline.formulaError || "无")}

程序：

${baselineFormula}

## 参考答案回放

- 审计分：${markdownScalar(normalized.reference.score)}/100
- 证据覆盖：${markdownScalar(normalized.reference.evidenceCoveragePercent)}%
- 审计状态：${markdownInline(normalized.reference.status)}
- 呈现答案：${markdownScalar(normalized.reference.reportedValue)} ${markdownInline(normalized.reference.unit)}
- 公式记录错误：${markdownInline(normalized.reference.formulaError || "无")}

程序：

${referenceFormula}

## 能力边界

- 未调用模型；结果是当前内置 fixture 下的确定性参考答案回放。
- 未执行任意代码，也没有保存完整证据原文。
- 单案例审计分不等于 benchmark 准确率，不构成金融建议。
`;
}
