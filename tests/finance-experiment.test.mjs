import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FINANCE_CASES,
  FINANCE_CASESET_VERSION,
  auditFinanceCase,
  compareFinanceCandidates,
  createReferenceCandidate,
} from "../src/finance-audit.js";
import {
  FINANCE_COMPARISON_SNAPSHOT_SCHEMA,
  FINANCE_EXPERIMENT_SCHEMA,
  FINANCE_EXPERIMENT_STORAGE_KEY,
  appendFinanceExperiment,
  createFinanceExperimentRecord,
  parseFinanceExperimentStore,
  removeFinanceExperiment,
  serializeFinanceExperiment,
} from "../src/finance-experiment.js";

function makeRecord(caseData, suffix = "1", view = "compare", activeCandidateId = null) {
  const baseline = { ...caseData.candidates[0], variant: "baseline", origin: "frozen-fixture" };
  const reference = createReferenceCandidate(caseData);
  const comparison = compareFinanceCandidates(caseData, baseline, reference);
  return createFinanceExperimentRecord({
    id: `${caseData.id}-${suffix}`,
    createdAt: `2026-08-09T0${suffix}:00:00.000Z`,
    caseData,
    baselineCandidate: baseline,
    referenceCandidate: reference,
    comparison,
    view,
    activeCandidateId: activeCandidateId || reference.id,
  });
}

function booleanCase() {
  const formula = { op: "greater", args: [{ ref: "profit" }, 0] };
  return {
    id: "finqa-profit-positive",
    title: "利润是否为正",
    question: "利润是否大于零？",
    evidence: [{
      id: "ev-profit",
      document: "Synthetic Statement",
      page: 1,
      quote: "Profit was positive.",
      facts: { profit: { value: 1, unit: "count" } },
    }],
    candidates: [{ id: "profit-baseline", label: "冻结基线", answer: true, unit: "count", evidenceIds: ["ev-profit"], formula }],
    expected: { answer: true, unit: "count", evidenceIds: ["ev-profit"], formula },
    provenance: { benchmarkStyle: "FinQA", synthetic: true },
  };
}

test("uses browser-local comparison snapshot and reference-answer replay semantics", () => {
  const caseData = FINANCE_CASES[0];
  const record = makeRecord(caseData);
  assert.equal(FINANCE_EXPERIMENT_SCHEMA, FINANCE_COMPARISON_SNAPSHOT_SCHEMA);
  assert.match(FINANCE_EXPERIMENT_SCHEMA, /comparison-snapshot/);
  assert.match(FINANCE_EXPERIMENT_STORAGE_KEY, /Snapshots/);
  assert.equal(record.fixtureVersion, FINANCE_CASESET_VERSION);
  assert.ok(record.reference);
  assert.equal(Object.hasOwn(record, "repaired"), false);
  assert.equal(record.reference.origin, "reference-derived");
  assert.equal(record.reference.status, "pass");
  assert.equal(record.capability.deterministicCurrentFixtureReplay, true);
  assert.equal(Object.hasOwn(record.capability, "deterministicReplay"), false);
  assert.ok(Object.isFrozen(record));
});

test("preserves boolean scalars through creation, parsing and JSON export", () => {
  const caseData = booleanCase();
  const record = makeRecord(caseData);
  for (const run of [record.baseline, record.reference]) {
    assert.equal(run.answer, true);
    assert.equal(run.calculatedValue, true);
    assert.equal(run.reportedValue, true);
    assert.equal(run.expectedValue, true);
  }
  const parsed = parseFinanceExperimentStore(JSON.stringify([record]));
  assert.equal(parsed[0].baseline.reportedValue, true);
  const json = JSON.parse(serializeFinanceExperiment(record, "json"));
  assert.equal(json.reference.calculatedValue, true);
});

test("records a missing formula as an error instead of throwing", () => {
  const source = FINANCE_CASES[0];
  const caseData = {
    ...source,
    id: "missing-formula",
    candidates: [{ ...source.candidates[0], id: "missing-formula-baseline", formula: undefined }],
  };
  const baseline = caseData.candidates[0];
  const reference = createReferenceCandidate(caseData);
  const comparison = compareFinanceCandidates(caseData, baseline, reference);
  assert.ok(auditFinanceCase(caseData, baseline).issues.some(issue => issue.code === "FORMULA_MISSING"));
  const record = createFinanceExperimentRecord({
    id: "missing-formula-1",
    createdAt: "2026-08-09T01:00:00Z",
    caseData,
    baselineCandidate: baseline,
    referenceCandidate: reference,
    comparison,
  });
  assert.equal(record.baseline.formula, "");
  assert.equal(record.baseline.formulaError, "FORMULA_MISSING");
  assert.match(serializeFinanceExperiment(record, "markdown"), /FORMULA_MISSING/);
});

test("requires fixtureVersion and keeps different fixture versions during deduplication", () => {
  const record = makeRecord(FINANCE_CASES[0]);
  const missing = structuredClone(record);
  delete missing.fixtureVersion;
  const blank = structuredClone(record);
  blank.fixtureVersion = "   ";
  assert.deepEqual(parseFinanceExperimentStore([missing, blank]), []);

  const previous = structuredClone(record);
  previous.id = "previous-version";
  previous.fixtureVersion = "synthetic-fixtures-0";
  const records = appendFinanceExperiment([previous], record);
  assert.equal(records.length, 2);
  assert.deepEqual(new Set(records.map(item => item.fixtureVersion)), new Set([FINANCE_CASESET_VERSION, "synthetic-fixtures-0"]));
});

test("single-view deduplication includes activeCandidateId while compare view does not", () => {
  const caseData = FINANCE_CASES[0];
  const baselineId = caseData.candidates[0].id;
  const referenceId = createReferenceCandidate(caseData).id;
  const first = makeRecord(caseData, "1", "single", baselineId);
  const second = makeRecord(caseData, "2", "single", referenceId);
  const singles = appendFinanceExperiment([first], second);
  assert.equal(singles.length, 2);

  const compareFirst = makeRecord(caseData, "3", "compare", baselineId);
  const compareSecond = makeRecord(caseData, "4", "compare", referenceId);
  const compares = appendFinanceExperiment([compareFirst], compareSecond);
  assert.equal(compares.length, 1);
  assert.equal(compares[0].id, compareSecond.id);
});

test("normalizes invalid limits and removal does not truncate valid history to twenty", () => {
  const record = makeRecord(FINANCE_CASES[0]);
  assert.equal(appendFinanceExperiment([], record, { limit: Number.NaN }).length, 1);

  const many = Array.from({ length: 25 }, (_, index) => {
    const clone = structuredClone(record);
    clone.id = `snapshot-${index}`;
    clone.case.id = `case-${index}`;
    clone.baseline.candidateId = `baseline-${index}`;
    clone.reference.candidateId = `reference-${index}`;
    return clone;
  });
  assert.equal(parseFinanceExperimentStore(many, { limit: 50 }).length, 25);
  assert.equal(removeFinanceExperiment(many, "not-present").length, 25);
  assert.equal(removeFinanceExperiment(many, "snapshot-8").length, 24);
  assert.equal(parseFinanceExperimentStore(many, { limit: Number.NaN }).length, 20);
});

test("creates privacy-minimized JSON and injection-safe complete Markdown", () => {
  const caseData = FINANCE_CASES.find(item => item.id === "financebench-evidence-gap");
  const record = makeRecord(caseData);
  const injected = structuredClone(record);
  injected.case.title = "Title | row\n# injected";
  injected.case.benchmarkStyle = "Fin`QA";
  injected.baseline.formula = "add(x, 0)\n```\n# escaped heading";
  injected.delta.decision = "regressed";
  injected.delta.resolvedIssueCodes = ["EVIDENCE_MISSING"];
  injected.delta.remainingIssueCodes = ["FORMULA_MISSING"];
  injected.delta.introducedIssueCodes = ["UNIT_MISMATCH"];

  const json = serializeFinanceExperiment(injected, "json");
  const markdown = serializeFinanceExperiment(injected, "markdown");
  assert.doesNotMatch(json, new RegExp(caseData.evidence[0].quote));
  assert.equal(JSON.parse(json).capability.fullEvidenceStored, false);
  assert.match(markdown, /^# ReproGate 合成案例审计对比卡/m);
  assert.match(markdown, /生成时间/);
  assert.match(markdown, /范式标签/);
  assert.match(markdown, /参考答案回放/);
  assert.match(markdown, /Decision：regressed/);
  assert.match(markdown, /已解决问题：EVIDENCE_MISSING/);
  assert.match(markdown, /仍存在问题：FORMULA_MISSING/);
  assert.match(markdown, /新引入问题：UNIT_MISMATCH/);
  assert.doesNotMatch(markdown, /```/);
  assert.doesNotMatch(markdown, /\n# injected/);
  assert.match(markdown, /    # escaped heading/);
});

test("rejects malformed snapshots and unsupported export formats", () => {
  assert.deepEqual(parseFinanceExperimentStore("not-json"), []);
  assert.deepEqual(parseFinanceExperimentStore(JSON.stringify([{ schema: "wrong" }])), []);
  assert.throws(() => serializeFinanceExperiment({}, "json"), /无效/);
  assert.throws(() => serializeFinanceExperiment(makeRecord(FINANCE_CASES[0]), "csv"), /不支持/);
});
