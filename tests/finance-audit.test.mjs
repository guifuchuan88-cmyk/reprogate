import assert from "node:assert/strict";
import { test } from "node:test";
import {
  auditFinancialCase,
  auditFinancialCases,
  auditFinanceCase,
  executeProgram,
  executeFinancialFormula,
  FINANCE_CASES,
  FINANCE_AUDIT_SAMPLES,
  FinanceAuditError,
  formatProgram,
  summarizeFinancialAudits,
} from "../src/finance-audit.js";

test("ships immutable original FinanceBench/FinQA-style fixtures", () => {
  assert.equal(FINANCE_AUDIT_SAMPLES.length, 5);
  assert.deepEqual([...new Set(FINANCE_AUDIT_SAMPLES.map(item => item.benchmarkStyle))].sort(), ["FinQA", "FinanceBench"]);
  assert.ok(FINANCE_AUDIT_SAMPLES.every(item => item.synthetic === true));
  assert.ok(Object.isFrozen(FINANCE_AUDIT_SAMPLES));
  assert.ok(Object.isFrozen(FINANCE_AUDIT_SAMPLES[0].reference.formula));
});

test("exposes the stable frontend case contract", () => {
  assert.equal(FINANCE_CASES.length, 5);
  for (const item of FINANCE_CASES) {
    for (const key of ["id", "title", "question", "evidence", "candidates", "expected", "provenance"]) {
      assert.ok(Object.hasOwn(item, key), `${item.id} missing ${key}`);
    }
    assert.ok(item.candidates.length >= 1);
    assert.equal(item.provenance.synthetic, true);
  }
});

test("executes only the six whitelisted binary operators with a deterministic trace", () => {
  const cases = [
    [{ op: "add", args: [4, 3] }, 7],
    [{ op: "subtract", args: [4, 3] }, 1],
    [{ op: "multiply", args: [4, 3] }, 12],
    [{ op: "divide", args: [12, 3] }, 4],
    [{ op: "exp", args: [2, 3] }, 8],
    [{ op: "greater", args: [4, 3] }, true],
  ];
  for (const [expression, expected] of cases) {
    assert.equal(executeFinancialFormula(expression).value, expected);
  }

  const expression = {
    op: "multiply",
    args: [{ op: "divide", args: [{ op: "subtract", args: [{ ref: "current" }, { ref: "prior" }] }, { ref: "prior" }] }, 100],
  };
  const first = executeFinancialFormula(expression, { current: { value: 525 }, prior: 500 });
  const second = executeFinancialFormula(expression, { current: { value: 525 }, prior: 500 });
  assert.equal(first.value, 5);
  assert.deepEqual(first, second);
  assert.deepEqual(first.references, ["current", "prior"]);
  assert.deepEqual(first.trace.map(item => item.operator), ["subtract", "divide", "multiply"]);
});

test("executes and formats ordered structured programs", () => {
  const program = [
    { id: "#0", op: "subtract", args: [{ ref: "current" }, { ref: "prior" }] },
    { id: "#1", op: "divide", args: [{ ref: "#0" }, { ref: "prior" }] },
    { id: "#2", op: "multiply", args: [{ ref: "#1" }, 100] },
  ];
  const result = executeProgram(program, { current: 525, prior: 500 });
  assert.equal(result.value, 5);
  assert.equal(result.steps.length, 3);
  assert.equal(result.trace.length, 3);
  assert.equal(
    formatProgram(program),
    "#0 = subtract(current, prior)\n#1 = divide(#0, prior)\n#2 = multiply(#1, 100)",
  );
  assert.equal(formatProgram({ op: "greater", args: [{ ref: "profit" }, 0] }), "greater(profit, 0)");
});

test("rejects strings, arbitrary operators, missing facts and unsafe numeric results", () => {
  const attempts = [
    () => executeFinancialFormula("globalThis.process.exit()"),
    () => executeFinancialFormula({ op: "constructor", args: [1, 2] }),
    () => executeFinancialFormula({ op: "divide", args: [1, 0] }),
    () => executeFinancialFormula({ op: "exp", args: [10, 10_000] }),
    () => executeFinancialFormula({ ref: "secret" }, {}),
    () => executeFinancialFormula({ op: "add", args: [1] }),
  ];
  for (const attempt of attempts) assert.throws(attempt, FinanceAuditError);
  assert.throws(
    () => executeFinancialFormula({ op: "constructor", args: [1, 2] }),
    error => error.code === "UNSUPPORTED_OPERATOR" && error.details.allowed.length === 6,
  );
});

test("returns the exact render-ready finance audit contract", () => {
  const passing = FINANCE_CASES.find(item => item.id === "finqa-operating-margin-pass");
  const result = auditFinanceCase(passing, passing.candidates[0].id);
  for (const key of ["status", "decision", "score", "metrics", "issues", "trace", "calculatedValue", "expectedValue"]) {
    assert.ok(Object.hasOwn(result, key), `result missing ${key}`);
  }
  assert.equal(result.status, "pass");
  assert.equal(result.decision, "accept");
  assert.equal(result.calculatedValue, 12);
  assert.equal(result.expectedValue, 12);
  assert.equal(result.metrics.issueCount, 0);
  assert.equal(result.metrics.evidenceCoveragePercent, 100);
});

test("returns a clean pass for a fully evidenced and correctly calculated case", () => {
  const audit = auditFinancialCase(FINANCE_AUDIT_SAMPLES.find(item => item.id === "finqa-operating-margin-pass"));
  assert.equal(audit.status, "pass");
  assert.equal(audit.score, 100);
  assert.equal(audit.findings.length, 0);
  assert.equal(audit.evidence.coverage, 1);
  assert.equal(audit.denominator.actual, "revenue");
  assert.equal(audit.calculation.actual, 12);
});

test("classifies evidence, unit, denominator and numeric failures independently", () => {
  const result = auditFinancialCases();
  const byId = new Map(result.audits.map(item => [item.caseId, item]));

  assert.ok(byId.get("financebench-evidence-gap").findings.some(item => item.category === "evidence" && item.code === "EVIDENCE_MISSING"));
  assert.ok(byId.get("financebench-unit-scale").findings.some(item => item.category === "unit" && item.code === "UNIT_SCALE_MISMATCH"));
  assert.ok(byId.get("financebench-unit-scale").findings.some(item => item.category === "numeric" && item.code === "FORMULA_RESULT_MISMATCH"));
  assert.ok(byId.get("finqa-denominator-drift").findings.some(item => item.category === "denominator" && item.code === "DENOMINATOR_MISMATCH"));
  assert.ok(byId.get("finqa-arithmetic-slip").findings.some(item => item.category === "numeric" && item.code === "ANSWER_FORMULA_MISMATCH"));
  assert.equal(result.summary.total, 5);
  assert.equal(result.summary.passed, 1);
  assert.ok(result.summary.failed >= 4);
  assert.ok(result.summary.byCategory.evidence >= 1);
  assert.ok(result.summary.byCategory.unit >= 1);
  assert.ok(result.summary.byCategory.denominator >= 1);
  assert.ok(result.summary.byCategory.numeric >= 1);
});

test("supports non-mutating candidate overrides and stable case summaries", () => {
  const source = FINANCE_AUDIT_SAMPLES.find(item => item.id === "financebench-evidence-gap");
  const repaired = auditFinancialCase(source, { evidenceIds: ["ev-rnd-note"] });
  assert.equal(repaired.status, "pass");
  assert.deepEqual(source.candidate.evidenceIds, []);

  const first = auditFinancialCases();
  const second = auditFinancialCases();
  assert.deepEqual(first, second);
  assert.deepEqual(summarizeFinancialAudits(first.audits), first.summary);
  assert.ok(first.summary.readinessScore >= 0 && first.summary.readinessScore <= 100);
  assert.ok(first.summary.evidenceCoverage >= 0 && first.summary.evidenceCoverage <= 100);
  assert.ok(Object.isFrozen(first.summary));
});

test("rejects corrupted reference fixtures instead of hiding benchmark errors", () => {
  const source = FINANCE_AUDIT_SAMPLES[0];
  const corrupted = {
    ...source,
    id: "corrupted-reference",
    reference: { ...source.reference, answer: 99 },
  };
  assert.throws(
    () => auditFinancialCase(corrupted),
    error => error instanceof FinanceAuditError && error.code === "INVALID_REFERENCE",
  );
});
