const OPERATOR_ARITY = Object.freeze({
  add: 2,
  subtract: 2,
  multiply: 2,
  divide: 2,
  exp: 2,
  greater: 2,
});

const SEVERITY_WEIGHT = Object.freeze({ critical: 32, high: 20, medium: 10, low: 4 });
const SEVERITY_RANK = Object.freeze({ critical: 4, high: 3, medium: 2, low: 1 });

export const FINANCE_AUDIT_CATEGORIES = Object.freeze({
  EVIDENCE: "evidence",
  UNIT: "unit",
  DENOMINATOR: "denominator",
  NUMERIC: "numeric",
});

export class FinanceAuditError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "FinanceAuditError";
    this.code = code;
    this.details = details;
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function finiteNumber(value, code, message, details = {}) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new FinanceAuditError(code, message, details);
  }
  return value;
}

function safeResult(value, operator, path) {
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new FinanceAuditError("NON_FINITE_RESULT", `${operator} 产生了非有限数值`, { operator, path });
  }
  return Object.is(value, -0) ? 0 : value;
}

/**
 * Executes a finance formula represented as data, never as source code.
 *
 * Expression grammar:
 *   number
 *   { ref: "fact_name" }
 *   { op: "add|subtract|multiply|divide|exp|greater", args: [expr, expr] }
 */
export function executeFinancialFormula(expression, variables = {}, options = {}) {
  if (!variables || typeof variables !== "object" || Array.isArray(variables)) {
    throw new FinanceAuditError("INVALID_VARIABLES", "公式变量必须是键值对象");
  }

  const maxDepth = options.maxDepth ?? 24;
  const maxNodes = options.maxNodes ?? 128;
  if (!Number.isInteger(maxDepth) || maxDepth < 1 || !Number.isInteger(maxNodes) || maxNodes < 1) {
    throw new FinanceAuditError("INVALID_LIMIT", "公式安全限制必须是正整数");
  }

  const state = { nodes: 0, trace: [], references: new Set() };

  function evaluate(node, path, depth) {
    if (depth > maxDepth) {
      throw new FinanceAuditError("EXPRESSION_TOO_DEEP", `公式嵌套超过 ${maxDepth} 层`, { path, maxDepth });
    }
    state.nodes += 1;
    if (state.nodes > maxNodes) {
      throw new FinanceAuditError("EXPRESSION_TOO_LARGE", `公式节点超过 ${maxNodes} 个`, { path, maxNodes });
    }

    if (typeof node === "number") {
      return finiteNumber(node, "INVALID_NUMBER", "公式包含非有限数值", { path });
    }
    if (!node || typeof node !== "object" || Array.isArray(node)) {
      throw new FinanceAuditError("INVALID_EXPRESSION", "公式只能包含数字、事实引用或白名单运算节点", { path });
    }

    if (hasOwn(node, "ref")) {
      if (typeof node.ref !== "string" || !node.ref.trim()) {
        throw new FinanceAuditError("INVALID_REFERENCE", "事实引用必须是非空字符串", { path });
      }
      const key = node.ref.trim();
      if (!hasOwn(variables, key)) {
        throw new FinanceAuditError("MISSING_VALUE", `缺少公式变量：${key}`, { path, reference: key });
      }
      const raw = variables[key];
      const value = raw && typeof raw === "object" && !Array.isArray(raw) && hasOwn(raw, "value") ? raw.value : raw;
      state.references.add(key);
      return finiteNumber(value, "INVALID_VALUE", `公式变量 ${key} 不是有限数值`, { path, reference: key });
    }

    const operator = node.op;
    if (typeof operator !== "string" || !hasOwn(OPERATOR_ARITY, operator)) {
      throw new FinanceAuditError("UNSUPPORTED_OPERATOR", `不支持的公式运算：${String(operator)}`, {
        path,
        operator,
        allowed: Object.keys(OPERATOR_ARITY),
      });
    }
    if (!Array.isArray(node.args) || node.args.length !== OPERATOR_ARITY[operator]) {
      throw new FinanceAuditError("INVALID_ARITY", `${operator} 必须接收 ${OPERATOR_ARITY[operator]} 个参数`, {
        path,
        operator,
        actual: Array.isArray(node.args) ? node.args.length : null,
      });
    }

    const operands = node.args.map((argument, index) => evaluate(argument, `${path}.args[${index}]`, depth + 1));
    if (operands.some(value => typeof value !== "number" || !Number.isFinite(value))) {
      throw new FinanceAuditError("INVALID_OPERAND", `${operator} 只能接收有限数值`, { path, operator, operands });
    }

    let result;
    switch (operator) {
      case "add": result = operands[0] + operands[1]; break;
      case "subtract": result = operands[0] - operands[1]; break;
      case "multiply": result = operands[0] * operands[1]; break;
      case "divide":
        if (operands[1] === 0) throw new FinanceAuditError("DIVISION_BY_ZERO", "公式分母不能为零", { path, operator, operands });
        result = operands[0] / operands[1];
        break;
      case "exp": result = operands[0] ** operands[1]; break;
      case "greater": result = operands[0] > operands[1]; break;
      default: throw new FinanceAuditError("UNSUPPORTED_OPERATOR", `不支持的公式运算：${operator}`, { path, operator });
    }

    result = safeResult(result, operator, path);
    state.trace.push({ path, operator, operands: [...operands], result });
    return result;
  }

  const value = evaluate(expression, "$", 0);
  return deepFreeze({ value, trace: state.trace, references: [...state.references].sort() });
}

// Short alias for consumers that already call the repository analyzer with concise verbs.
export const executeFormula = executeFinancialFormula;

function variablesFromEvidenceInput(evidence) {
  if (Array.isArray(evidence)) return collectEvidence({ id: "ad-hoc-program", evidence }).variables;
  if (evidence && typeof evidence === "object" && Array.isArray(evidence.evidence)) {
    return collectEvidence({ id: "ad-hoc-program", evidence: evidence.evidence }).variables;
  }
  if (!evidence || typeof evidence !== "object") {
    throw new FinanceAuditError("INVALID_EVIDENCE", "evidence 必须是事实对象或证据数组");
  }
  return evidence;
}

/**
 * Executes either one AST expression or an ordered FinQA-style structured program.
 * A step program uses [{ id: "#0", op: "subtract", args: [...] }, ...].
 */
export function executeProgram(program, evidence = {}) {
  const initialVariables = variablesFromEvidenceInput(evidence);
  if (!Array.isArray(program)) return executeFinancialFormula(program, initialVariables);
  if (!program.length) throw new FinanceAuditError("EMPTY_PROGRAM", "公式程序至少需要一个步骤");

  const variables = Object.assign(Object.create(null), initialVariables);
  const steps = [];
  const trace = [];
  const references = new Set();

  for (let index = 0; index < program.length; index += 1) {
    const step = program[index];
    if (!step || typeof step !== "object" || Array.isArray(step)) {
      throw new FinanceAuditError("INVALID_STEP", `公式第 ${index + 1} 步必须是对象`, { index });
    }
    const id = step.id || `#${index}`;
    if (typeof id !== "string" || !/^(?:#[0-9]+|[A-Za-z][A-Za-z0-9_.-]*)$/.test(id)) {
      throw new FinanceAuditError("INVALID_STEP_ID", `无效的公式步骤 id：${String(id)}`, { index, id });
    }
    if (hasOwn(variables, id)) {
      throw new FinanceAuditError("DUPLICATE_STEP_ID", `公式步骤 id 重复：${id}`, { index, id });
    }
    const expression = { op: step.op, args: step.args };
    const result = executeFinancialFormula(expression, variables);
    variables[id] = { value: result.value };
    for (const reference of result.references) references.add(reference);
    const stepTrace = result.trace.map(item => ({ ...item, stepId: id }));
    trace.push(...stepTrace);
    steps.push({ id, expression, value: result.value, trace: stepTrace });
  }

  return deepFreeze({
    value: steps.at(-1).value,
    steps,
    trace,
    references: [...references].sort(),
  });
}

/** Formats structured formula data without evaluating or interpolating source code. */
export function formatProgram(program) {
  let nodes = 0;
  function formatNode(node, depth = 0) {
    nodes += 1;
    if (nodes > 128 || depth > 24) throw new FinanceAuditError("EXPRESSION_TOO_LARGE", "公式过大，无法格式化");
    if (typeof node === "number" && Number.isFinite(node)) return String(Object.is(node, -0) ? 0 : node);
    if (!node || typeof node !== "object" || Array.isArray(node)) {
      throw new FinanceAuditError("INVALID_EXPRESSION", "无法格式化非结构化公式");
    }
    if (hasOwn(node, "ref")) {
      if (typeof node.ref !== "string" || !node.ref.trim()) throw new FinanceAuditError("INVALID_REFERENCE", "无效的公式引用");
      return node.ref.trim();
    }
    if (typeof node.op !== "string" || !hasOwn(OPERATOR_ARITY, node.op)) {
      throw new FinanceAuditError("UNSUPPORTED_OPERATOR", `不支持的公式运算：${String(node.op)}`);
    }
    if (!Array.isArray(node.args) || node.args.length !== OPERATOR_ARITY[node.op]) {
      throw new FinanceAuditError("INVALID_ARITY", `${node.op} 必须接收 ${OPERATOR_ARITY[node.op]} 个参数`);
    }
    return `${node.op}(${node.args.map(argument => formatNode(argument, depth + 1)).join(", ")})`;
  }

  if (!Array.isArray(program)) return formatNode(program);
  if (!program.length) throw new FinanceAuditError("EMPTY_PROGRAM", "公式程序至少需要一个步骤");
  return program.map((step, index) => {
    if (!step || typeof step !== "object" || Array.isArray(step)) throw new FinanceAuditError("INVALID_STEP", `公式第 ${index + 1} 步必须是对象`);
    const id = step.id || `#${index}`;
    if (typeof id !== "string" || !/^(?:#[0-9]+|[A-Za-z][A-Za-z0-9_.-]*)$/.test(id)) {
      throw new FinanceAuditError("INVALID_STEP_ID", `无效的公式步骤 id：${String(id)}`);
    }
    return `${id} = ${formatNode({ op: step.op, args: step.args })}`;
  }).join("\n");
}

function collectFormulaMetadata(expression) {
  const references = new Set();
  const denominatorRefs = [];
  const stack = [{ node: expression, depth: 0 }];
  let nodes = 0;

  while (stack.length) {
    const { node, depth } = stack.pop();
    nodes += 1;
    if (nodes > 128 || depth > 24) break;
    if (!node || typeof node !== "object" || Array.isArray(node)) continue;
    if (typeof node.ref === "string") references.add(node.ref.trim());
    if (!Array.isArray(node.args)) continue;
    if (node.op === "divide" && node.args[1] && typeof node.args[1] === "object" && typeof node.args[1].ref === "string") {
      denominatorRefs.push(node.args[1].ref.trim());
    }
    for (let index = node.args.length - 1; index >= 0; index -= 1) {
      stack.push({ node: node.args[index], depth: depth + 1 });
    }
  }
  return { references: [...references].filter(Boolean).sort(), denominatorRefs };
}

function normalizeUnit(unit) {
  const raw = String(unit || "").trim();
  const compact = raw.toLowerCase().replace(/[,_]/g, " ").replace(/\s+/g, " ");
  if (["%", "percent", "percentage", "percentage point", "百分点"].includes(compact)) {
    return { raw, key: compact === "percentage point" || compact === "百分点" ? "percentage-point" : "percent", family: "ratio", scale: 0.01 };
  }
  if (["ratio", "decimal", "倍数"].includes(compact)) return { raw, key: "ratio", family: "ratio", scale: 1 };

  let currency = null;
  if (/(^|\s)(usd|us\$|\$)(\s|$)/.test(compact)) currency = "USD";
  else if (/(^|\s)(cny|rmb|cn¥|¥)(\s|$)/.test(compact) || compact.includes("人民币")) currency = "CNY";
  else if (/(^|\s)(eur|€)(\s|$)/.test(compact)) currency = "EUR";

  if (currency) {
    let scale = 1;
    if (/\b(thousand|thousands|k)\b/.test(compact) || compact.includes("千")) scale = 1e3;
    if (/\b(million|millions|mn|m)\b/.test(compact) || compact.includes("百万")) scale = 1e6;
    if (/\b(billion|billions|bn|b)\b/.test(compact) || compact.includes("十亿")) scale = 1e9;
    return { raw, key: `${currency}:${scale}`, family: `currency:${currency}`, scale };
  }

  if (["count", "number", "items", "shares", "股", "个"].includes(compact)) {
    return { raw, key: compact || "count", family: "count", scale: 1 };
  }
  const key = compact || "unspecified";
  return { raw, key, family: `literal:${key}`, scale: 1 };
}

function toleranceFor(reference) {
  const tolerance = reference?.tolerance || {};
  const absolute = typeof tolerance.absolute === "number" && tolerance.absolute >= 0 ? tolerance.absolute : 1e-6;
  const relative = typeof tolerance.relative === "number" && tolerance.relative >= 0 ? tolerance.relative : 1e-6;
  return { absolute, relative };
}

function approximatelyEqual(actual, expected, tolerance) {
  if (typeof actual === "boolean" || typeof expected === "boolean") return actual === expected;
  if (typeof actual !== "number" || typeof expected !== "number" || !Number.isFinite(actual) || !Number.isFinite(expected)) return false;
  const allowed = Math.max(tolerance.absolute, tolerance.relative * Math.abs(expected));
  return Math.abs(actual - expected) <= allowed;
}

function canonicalValue(value, unit) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value * unit.scale;
}

function finding(code, category, severity, title, detail, recommendation, context = {}) {
  return { code, category, severity, title, detail, recommendation, context };
}

function collectEvidence(caseInput) {
  if (!Array.isArray(caseInput.evidence)) {
    throw new FinanceAuditError("INVALID_CASE", "案例 evidence 必须是数组", { caseId: caseInput.id });
  }
  const evidenceById = new Map();
  const variables = Object.create(null);
  const factSources = new Map();

  for (const item of caseInput.evidence) {
    if (!item || typeof item.id !== "string" || !item.id.trim()) {
      throw new FinanceAuditError("INVALID_CASE", "每条证据必须有非空 id", { caseId: caseInput.id });
    }
    if (evidenceById.has(item.id)) {
      throw new FinanceAuditError("INVALID_CASE", `证据 id 重复：${item.id}`, { caseId: caseInput.id });
    }
    evidenceById.set(item.id, item);
    const facts = item.facts || {};
    if (!facts || typeof facts !== "object" || Array.isArray(facts)) {
      throw new FinanceAuditError("INVALID_CASE", `证据 ${item.id} 的 facts 必须是对象`, { caseId: caseInput.id });
    }
    for (const [key, fact] of Object.entries(facts)) {
      const value = fact && typeof fact === "object" && !Array.isArray(fact) && hasOwn(fact, "value") ? fact.value : fact;
      finiteNumber(value, "INVALID_CASE", `事实 ${key} 不是有限数值`, { caseId: caseInput.id, evidenceId: item.id });
      if (hasOwn(variables, key) && variables[key].value !== value) {
        throw new FinanceAuditError("AMBIGUOUS_FACT", `事实 ${key} 在不同证据中数值冲突`, { caseId: caseInput.id, evidenceId: item.id });
      }
      variables[key] = fact && typeof fact === "object" && !Array.isArray(fact) ? { ...fact, value } : { value };
      if (!factSources.has(key)) factSources.set(key, new Set());
      factSources.get(key).add(item.id);
    }
  }
  return { evidenceById, variables, factSources };
}

function validateCaseShell(caseInput) {
  if (!caseInput || typeof caseInput !== "object" || Array.isArray(caseInput)) {
    throw new FinanceAuditError("INVALID_CASE", "金融审计案例必须是对象");
  }
  if (typeof caseInput.id !== "string" || !caseInput.id.trim()) {
    throw new FinanceAuditError("INVALID_CASE", "金融审计案例必须有非空 id");
  }
  if (!caseInput.reference || typeof caseInput.reference !== "object") {
    throw new FinanceAuditError("INVALID_CASE", "案例必须包含 reference", { caseId: caseInput.id });
  }
  if (!caseInput.candidate || typeof caseInput.candidate !== "object") {
    throw new FinanceAuditError("INVALID_CASE", "案例必须包含 candidate", { caseId: caseInput.id });
  }
  if (!hasOwn(caseInput.reference, "answer")) {
    throw new FinanceAuditError("INVALID_CASE", "reference 必须包含 answer", { caseId: caseInput.id });
  }
}

/** Audits one FinanceBench/FinQA-style case against its reference. */
export function auditFinancialCase(caseInput, candidateOverride = null) {
  validateCaseShell(caseInput);
  if (candidateOverride !== null && (!candidateOverride || typeof candidateOverride !== "object" || Array.isArray(candidateOverride))) {
    throw new FinanceAuditError("INVALID_CANDIDATE", "candidate override 必须是对象", { caseId: caseInput.id });
  }

  const candidate = candidateOverride ? { ...caseInput.candidate, ...candidateOverride } : { ...caseInput.candidate };
  const reference = caseInput.reference;
  const { evidenceById, variables, factSources } = collectEvidence(caseInput);
  const findings = [];
  const tolerance = toleranceFor(reference);

  let referenceExecution;
  try {
    referenceExecution = executeFinancialFormula(reference.formula, variables);
  } catch (error) {
    throw new FinanceAuditError("INVALID_REFERENCE", "参考公式无法执行", { caseId: caseInput.id, cause: error.code || error.message });
  }
  if (!approximatelyEqual(referenceExecution.value, reference.answer, tolerance)) {
    throw new FinanceAuditError("INVALID_REFERENCE", "参考答案与参考公式执行结果不一致", {
      caseId: caseInput.id,
      answer: reference.answer,
      formulaValue: referenceExecution.value,
    });
  }

  const selectedEvidenceIds = Array.isArray(candidate.evidenceIds)
    ? [...new Set(candidate.evidenceIds.filter(id => typeof id === "string" && id.trim()).map(id => id.trim()))].sort()
    : [];
  const requiredEvidenceIds = Array.isArray(reference.evidenceIds)
    ? [...new Set(reference.evidenceIds.filter(id => typeof id === "string" && id.trim()).map(id => id.trim()))].sort()
    : [];
  const validSelected = selectedEvidenceIds.filter(id => evidenceById.has(id));
  const unknownEvidenceIds = selectedEvidenceIds.filter(id => !evidenceById.has(id));

  if (!selectedEvidenceIds.length) {
    findings.push(finding(
      "EVIDENCE_MISSING",
      FINANCE_AUDIT_CATEGORIES.EVIDENCE,
      "high",
      "答案没有绑定证据",
      "候选答案未声明任何 evidenceIds，无法追溯到财报页或原句。",
      "至少绑定一条包含文档、页码、原句和结构化事实的证据。",
    ));
  }
  if (unknownEvidenceIds.length) {
    findings.push(finding(
      "EVIDENCE_NOT_FOUND",
      FINANCE_AUDIT_CATEGORIES.EVIDENCE,
      "high",
      "引用了不存在的证据",
      `以下 evidenceIds 不在案例证据集中：${unknownEvidenceIds.join(", ")}`,
      "只允许引用当前快照中真实存在的证据 id。",
      { evidenceIds: unknownEvidenceIds },
    ));
  }
  const omittedEvidenceIds = requiredEvidenceIds.filter(id => !validSelected.includes(id));
  if (selectedEvidenceIds.length && omittedEvidenceIds.length) {
    findings.push(finding(
      "EVIDENCE_INCOMPLETE",
      FINANCE_AUDIT_CATEGORIES.EVIDENCE,
      "high",
      "关键证据不完整",
      `缺少参考答案要求的证据：${omittedEvidenceIds.join(", ")}`,
      "补齐支持数值、时间范围和计算口径的关键页码。",
      { evidenceIds: omittedEvidenceIds },
    ));
  }

  const candidateMetadata = collectFormulaMetadata(candidate.formula);
  if (validSelected.length) {
    const unsupportedRefs = candidateMetadata.references.filter(ref => {
      const sources = factSources.get(ref);
      return !sources || !validSelected.some(id => sources.has(id));
    });
    if (unsupportedRefs.length) {
      findings.push(finding(
        "EVIDENCE_UNSUPPORTED_VALUE",
        FINANCE_AUDIT_CATEGORIES.EVIDENCE,
        "high",
        "公式使用了未被所选证据支持的数值",
        `未获得所选证据支持的事实：${unsupportedRefs.join(", ")}`,
        "将每个公式输入绑定到包含该事实的证据记录。",
        { references: unsupportedRefs },
      ));
    }
    const weakEvidenceIds = validSelected.filter(id => {
      const item = evidenceById.get(id);
      return !String(item.quote || "").trim() || !Number.isInteger(item.page) || item.page < 0;
    });
    if (weakEvidenceIds.length) {
      findings.push(finding(
        "EVIDENCE_LOCATION_INCOMPLETE",
        FINANCE_AUDIT_CATEGORIES.EVIDENCE,
        "medium",
        "证据缺少原句或页码",
        `以下证据无法精确定位：${weakEvidenceIds.join(", ")}`,
        "补充非负页码和原文摘录，避免只有文档级引用。",
        { evidenceIds: weakEvidenceIds },
      ));
    }
  }

  const referenceUnit = normalizeUnit(reference.unit);
  const candidateUnit = normalizeUnit(candidate.unit);
  if (referenceUnit.key !== candidateUnit.key) {
    if (referenceUnit.family === candidateUnit.family && referenceUnit.scale !== candidateUnit.scale) {
      findings.push(finding(
        "UNIT_SCALE_MISMATCH",
        FINANCE_AUDIT_CATEGORIES.UNIT,
        "high",
        "数值量级单位不一致",
        `参考单位为 ${reference.unit || "未声明"}，候选单位为 ${candidate.unit || "未声明"}。`,
        "统一原币、千、百万、十亿等缩放口径后再比较数值。",
        { expectedUnit: reference.unit, actualUnit: candidate.unit },
      ));
    } else if (referenceUnit.family === candidateUnit.family) {
      findings.push(finding(
        "UNIT_REPRESENTATION_MISMATCH",
        FINANCE_AUDIT_CATEGORIES.UNIT,
        "medium",
        "比率表示方式不一致",
        `参考单位为 ${reference.unit || "未声明"}，候选单位为 ${candidate.unit || "未声明"}。`,
        "明确百分数、百分比变化和小数比率的展示约定。",
        { expectedUnit: reference.unit, actualUnit: candidate.unit },
      ));
    } else {
      findings.push(finding(
        "UNIT_MISMATCH",
        FINANCE_AUDIT_CATEGORIES.UNIT,
        "high",
        "答案单位不兼容",
        `参考单位为 ${reference.unit || "未声明"}，候选单位为 ${candidate.unit || "未声明"}。`,
        "从原始证据继承单位，并在公式每一步保留单位信息。",
        { expectedUnit: reference.unit, actualUnit: candidate.unit },
      ));
    }
  }

  const referenceMetadata = collectFormulaMetadata(reference.formula);
  const expectedDenominator = reference.denominatorRef || referenceMetadata.denominatorRefs[0] || null;
  const formulaDenominator = candidateMetadata.denominatorRefs[0] || null;
  const declaredDenominator = candidate.denominatorRef || null;
  const actualDenominator = formulaDenominator || declaredDenominator;

  if (declaredDenominator && formulaDenominator && declaredDenominator !== formulaDenominator) {
    findings.push(finding(
      "DENOMINATOR_DECLARATION_MISMATCH",
      FINANCE_AUDIT_CATEGORIES.DENOMINATOR,
      "high",
      "声明分母与实际公式不一致",
      `candidate.denominatorRef 声明 ${declaredDenominator}，但 divide 实际使用 ${formulaDenominator}。`,
      "从公式 AST 自动生成分母说明，避免文案与执行逻辑漂移。",
      { declaredDenominator, formulaDenominator },
    ));
  }
  if (expectedDenominator && !actualDenominator) {
    findings.push(finding(
      "DENOMINATOR_MISSING",
      FINANCE_AUDIT_CATEGORIES.DENOMINATOR,
      "high",
      "缺少分母口径",
      `参考计算要求以 ${expectedDenominator} 为分母，但候选公式没有可验证的直接分母。`,
      "显式使用 divide 节点并声明 denominatorRef。",
      { expectedDenominator },
    ));
  } else if (expectedDenominator && actualDenominator !== expectedDenominator) {
    findings.push(finding(
      "DENOMINATOR_MISMATCH",
      FINANCE_AUDIT_CATEGORIES.DENOMINATOR,
      "high",
      "增长率或比率分母错误",
      `参考分母为 ${expectedDenominator}，候选公式使用 ${actualDenominator}。`,
      "按问题口径选择基期、平均值或期末值，并把分母绑定到证据。",
      { expectedDenominator, actualDenominator },
    ));
  }
  if (actualDenominator && hasOwn(variables, actualDenominator) && variables[actualDenominator].value === 0) {
    findings.push(finding(
      "DENOMINATOR_ZERO",
      FINANCE_AUDIT_CATEGORIES.DENOMINATOR,
      "critical",
      "分母为零",
      `${actualDenominator} 的证据值为 0，当前比率没有有限数值。`,
      "返回不可计算状态，不要用 0、无穷大或模型猜测代替。",
      { denominator: actualDenominator },
    ));
  }

  let candidateExecution = null;
  let formulaError = null;
  if (!candidate.formula) {
    findings.push(finding(
      "FORMULA_MISSING",
      FINANCE_AUDIT_CATEGORIES.NUMERIC,
      "medium",
      "缺少可执行公式",
      "候选答案只有最终数值，无法复核中间步骤。",
      "使用白名单公式 AST 表达计算过程。",
    ));
  } else {
    try {
      candidateExecution = executeFinancialFormula(candidate.formula, variables);
    } catch (error) {
      formulaError = error;
      findings.push(finding(
        "FORMULA_EXECUTION_FAILED",
        FINANCE_AUDIT_CATEGORIES.NUMERIC,
        "critical",
        "候选公式无法安全执行",
        `${error.code || error.name}: ${error.message}`,
        "只使用白名单运算、有限数值和当前证据中的事实引用。",
        { errorCode: error.code || error.name },
      ));
    }
  }

  const candidateHasAnswer = hasOwn(candidate, "answer");
  if (!candidateHasAnswer || (typeof candidate.answer !== "number" && typeof candidate.answer !== "boolean") || (typeof candidate.answer === "number" && !Number.isFinite(candidate.answer))) {
    findings.push(finding(
      "ANSWER_INVALID",
      FINANCE_AUDIT_CATEGORIES.NUMERIC,
      "high",
      "候选答案不是有效数值或布尔值",
      "candidate.answer 缺失或不是有限数值/布尔值。",
      "输出结构化 answer，并将不可计算情况单独建模。",
    ));
  } else if (candidateExecution && !approximatelyEqual(candidate.answer, candidateExecution.value, tolerance)) {
    findings.push(finding(
      "ANSWER_FORMULA_MISMATCH",
      FINANCE_AUDIT_CATEGORIES.NUMERIC,
      "high",
      "展示答案与公式执行结果不一致",
      `候选答案为 ${candidate.answer}，同一候选公式执行得到 ${candidateExecution.value}。`,
      "最终答案必须直接取自已记录的公式执行结果。",
      { answer: candidate.answer, formulaValue: candidateExecution.value },
    ));
  }

  if (candidateExecution) {
    const unitsCompatible = referenceUnit.family === candidateUnit.family;
    const referenceComparable = unitsCompatible ? canonicalValue(referenceExecution.value, referenceUnit) : null;
    const candidateComparable = unitsCompatible ? canonicalValue(candidateExecution.value, candidateUnit) : null;
    const canonicalTolerance = {
      absolute: tolerance.absolute * referenceUnit.scale,
      relative: tolerance.relative,
    };
    if (referenceComparable !== null && candidateComparable !== null && !approximatelyEqual(candidateComparable, referenceComparable, canonicalTolerance)) {
      findings.push(finding(
        "FORMULA_RESULT_MISMATCH",
        FINANCE_AUDIT_CATEGORIES.NUMERIC,
        "high",
        "公式结果与参考计算不一致",
        `统一单位后，候选公式结果为 ${candidateComparable}，参考结果为 ${referenceComparable}。`,
        "逐步比较公式 trace，定位错误运算或错误事实输入。",
        { expected: referenceComparable, actual: candidateComparable, canonicalUnit: referenceUnit.family },
      ));
    }
  } else if (!formulaError && candidateHasAnswer && typeof candidate.answer === typeof reference.answer) {
    const unitsCompatible = referenceUnit.family === candidateUnit.family;
    const referenceComparable = unitsCompatible && typeof reference.answer === "number" ? canonicalValue(reference.answer, referenceUnit) : reference.answer;
    const candidateComparable = unitsCompatible && typeof candidate.answer === "number" ? canonicalValue(candidate.answer, candidateUnit) : candidate.answer;
    const canonicalTolerance = { absolute: tolerance.absolute * referenceUnit.scale, relative: tolerance.relative };
    if (!approximatelyEqual(candidateComparable, referenceComparable, canonicalTolerance)) {
      findings.push(finding(
        "ANSWER_NUMERIC_MISMATCH",
        FINANCE_AUDIT_CATEGORIES.NUMERIC,
        "high",
        "候选数值与参考答案不一致",
        `候选答案为 ${candidate.answer}，参考答案为 ${reference.answer}。`,
        "补充公式并核对来源数值、单位和四舍五入规则。",
        { expected: reference.answer, actual: candidate.answer },
      ));
    }
  }

  findings.sort((a, b) => {
    const severity = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
    return severity || a.category.localeCompare(b.category) || a.code.localeCompare(b.code);
  });
  const score = Math.max(0, 100 - findings.reduce((total, item) => total + SEVERITY_WEIGHT[item.severity], 0));
  const status = findings.some(item => ["critical", "high"].includes(item.severity))
    ? "fail"
    : findings.length ? "warning" : "pass";
  const evidenceCoverage = requiredEvidenceIds.length
    ? requiredEvidenceIds.filter(id => validSelected.includes(id)).length / requiredEvidenceIds.length
    : validSelected.length ? 1 : 0;

  return deepFreeze({
    caseId: caseInput.id,
    title: caseInput.title || caseInput.question || caseInput.id,
    benchmarkStyle: caseInput.benchmarkStyle || "custom",
    synthetic: Boolean(caseInput.synthetic),
    status,
    score,
    findings,
    evidence: {
      selectedIds: selectedEvidenceIds,
      validIds: validSelected,
      requiredIds: requiredEvidenceIds,
      coverage: evidenceCoverage,
    },
    units: {
      expected: reference.unit || null,
      actual: candidate.unit || null,
      compatible: referenceUnit.family === candidateUnit.family,
    },
    denominator: { expected: expectedDenominator, actual: actualDenominator },
    calculation: {
      expected: referenceExecution.value,
      actual: candidateExecution?.value ?? null,
      reported: candidateHasAnswer ? candidate.answer : null,
      trace: candidateExecution?.trace || [],
      errorCode: formulaError?.code || null,
    },
    metrics: {
      totalFindings: findings.length,
      evidenceCoverage,
      criticalFindings: findings.filter(item => item.severity === "critical").length,
      highFindings: findings.filter(item => item.severity === "high").length,
    },
  });
}

export function summarizeFinancialAudits(audits) {
  if (!Array.isArray(audits)) throw new FinanceAuditError("INVALID_AUDITS", "audits 必须是数组");
  const byStatus = { pass: 0, warning: 0, fail: 0 };
  const byCategory = { evidence: 0, unit: 0, denominator: 0, numeric: 0 };
  const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
  const issueMap = new Map();
  let scoreTotal = 0;
  let coverageTotal = 0;

  for (const audit of audits) {
    if (!audit || !hasOwn(byStatus, audit.status) || !Array.isArray(audit.findings)) {
      throw new FinanceAuditError("INVALID_AUDIT", "汇总输入包含无效审计结果");
    }
    byStatus[audit.status] += 1;
    scoreTotal += Number(audit.score) || 0;
    coverageTotal += Number(audit.evidence?.coverage) || 0;
    for (const item of audit.findings) {
      if (hasOwn(byCategory, item.category)) byCategory[item.category] += 1;
      if (hasOwn(bySeverity, item.severity)) bySeverity[item.severity] += 1;
      const aggregate = issueMap.get(item.code) || {
        code: item.code,
        category: item.category,
        severity: item.severity,
        title: item.title,
        count: 0,
        caseIds: [],
      };
      aggregate.count += 1;
      aggregate.caseIds.push(audit.caseId);
      if (SEVERITY_RANK[item.severity] > SEVERITY_RANK[aggregate.severity]) aggregate.severity = item.severity;
      issueMap.set(item.code, aggregate);
    }
  }

  const topIssues = [...issueMap.values()]
    .map(item => ({ ...item, caseIds: [...new Set(item.caseIds)].sort() }))
    .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.count - a.count || a.code.localeCompare(b.code))
    .slice(0, 8);
  const totalFindings = Object.values(bySeverity).reduce((sum, count) => sum + count, 0);
  const total = audits.length;

  return deepFreeze({
    total,
    passed: byStatus.pass,
    warnings: byStatus.warning,
    failed: byStatus.fail,
    readinessScore: total ? Math.round(scoreTotal / total) : 0,
    evidenceCoverage: total ? Math.round((coverageTotal / total) * 100) : 0,
    totalFindings,
    byStatus,
    byCategory,
    bySeverity,
    topIssues,
  });
}

export function auditFinancialCases(cases = FINANCE_AUDIT_SAMPLES, options = {}) {
  if (!Array.isArray(cases)) throw new FinanceAuditError("INVALID_CASES", "cases 必须是数组");
  const candidates = options.candidates && typeof options.candidates === "object" ? options.candidates : {};
  const audits = cases.map(caseInput => auditFinancialCase(caseInput, candidates[caseInput.id] || null));
  return deepFreeze({ audits, summary: summarizeFinancialAudits(audits) });
}

function resolveFrontendCandidate(caseData, candidate) {
  const candidates = Array.isArray(caseData.candidates) ? caseData.candidates : [];
  if (typeof candidate === "string") {
    const found = candidates.find(item => item.id === candidate);
    if (!found) throw new FinanceAuditError("CANDIDATE_NOT_FOUND", `未找到候选答案：${candidate}`, { caseId: caseData.id });
    return found;
  }
  if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) return candidate;
  if (candidates.length) return candidates[0];
  if (caseData.candidate && typeof caseData.candidate === "object") return caseData.candidate;
  throw new FinanceAuditError("CANDIDATE_NOT_FOUND", "案例没有可审计的候选答案", { caseId: caseData.id });
}

/** Stable, render-ready facade used by the ReproGate finance UI. */
export function auditFinanceCase(caseData, candidate = null) {
  if (!caseData || typeof caseData !== "object" || Array.isArray(caseData)) {
    throw new FinanceAuditError("INVALID_CASE", "金融审计案例必须是对象");
  }
  const resolvedCandidate = resolveFrontendCandidate(caseData, candidate);
  const normalized = {
    ...caseData,
    benchmarkStyle: caseData.benchmarkStyle || caseData.provenance?.benchmarkStyle || "custom",
    reference: caseData.expected || caseData.reference,
    candidate: resolvedCandidate,
  };
  const audit = auditFinancialCase(normalized);
  const decision = audit.status === "pass" ? "accept" : audit.status === "warning" ? "review" : "reject";
  const issueCategories = new Set(audit.findings.map(item => item.category));

  return deepFreeze({
    caseId: audit.caseId,
    candidateId: resolvedCandidate.id || null,
    status: audit.status,
    decision,
    decisionLabel: decision === "accept" ? "可接受" : decision === "review" ? "需复核" : "应阻断",
    score: audit.score,
    metrics: {
      ...audit.metrics,
      evidenceCoverage: audit.evidence.coverage,
      evidenceCoveragePercent: Math.round(audit.evidence.coverage * 100),
      issueCount: audit.findings.length,
      evidenceAligned: !issueCategories.has(FINANCE_AUDIT_CATEGORIES.EVIDENCE),
      unitAligned: !issueCategories.has(FINANCE_AUDIT_CATEGORIES.UNIT),
      denominatorAligned: !issueCategories.has(FINANCE_AUDIT_CATEGORIES.DENOMINATOR),
      numericAligned: !issueCategories.has(FINANCE_AUDIT_CATEGORIES.NUMERIC),
    },
    issues: audit.findings,
    trace: audit.calculation.trace,
    calculatedValue: audit.calculation.actual,
    expectedValue: audit.calculation.expected,
    reportedValue: audit.calculation.reported,
    evidence: audit.evidence,
    units: audit.units,
    denominator: audit.denominator,
  });
}

const percentChange = (current, prior) => ({
  op: "multiply",
  args: [
    { op: "divide", args: [{ op: "subtract", args: [{ ref: current }, { ref: prior }] }, { ref: prior }] },
    100,
  ],
});

/**
 * Original synthetic fixtures inspired by FinanceBench and FinQA schemas.
 * They contain no copied benchmark question or filing text.
 */
export const FINANCE_AUDIT_SAMPLES = deepFreeze([
  {
    id: "finqa-operating-margin-pass",
    title: "营业利润率计算（正确样例）",
    benchmarkStyle: "FinQA",
    synthetic: true,
    question: "若营业利润为 96、收入为 800，营业利润率是多少？",
    evidence: [{
      id: "ev-margin-table",
      document: "Synthetic Annual Report 2025",
      page: 18,
      quote: "Revenue was USD 800 million and operating income was USD 96 million.",
      facts: {
        operating_income: { value: 96, unit: "USD million" },
        revenue: { value: 800, unit: "USD million" },
      },
    }],
    reference: {
      answer: 12,
      unit: "percent",
      denominatorRef: "revenue",
      evidenceIds: ["ev-margin-table"],
      tolerance: { absolute: 0.01, relative: 0.0001 },
      formula: { op: "multiply", args: [{ op: "divide", args: [{ ref: "operating_income" }, { ref: "revenue" }] }, 100] },
    },
    candidate: {
      answer: 12,
      unit: "percent",
      denominatorRef: "revenue",
      evidenceIds: ["ev-margin-table"],
      formula: { op: "multiply", args: [{ op: "divide", args: [{ ref: "operating_income" }, { ref: "revenue" }] }, 100] },
    },
  },
  {
    id: "financebench-evidence-gap",
    title: "研发费用回答缺少引用",
    benchmarkStyle: "FinanceBench",
    synthetic: true,
    question: "公司 2025 年确认的研发费用是多少？",
    evidence: [{
      id: "ev-rnd-note",
      document: "Synthetic 10-K 2025",
      page: 42,
      quote: "Research and development expense was USD 42 million in 2025.",
      facts: { research_expense: { value: 42, unit: "USD million" } },
    }],
    reference: {
      answer: 42,
      unit: "USD million",
      evidenceIds: ["ev-rnd-note"],
      formula: { op: "add", args: [{ ref: "research_expense" }, 0] },
    },
    candidate: {
      answer: 42,
      unit: "USD million",
      evidenceIds: [],
      formula: { op: "add", args: [{ ref: "research_expense" }, 0] },
    },
  },
  {
    id: "finqa-denominator-drift",
    title: "增长率误用当期值作分母",
    benchmarkStyle: "FinQA",
    synthetic: true,
    question: "收入由 500 增至 525，增长率是多少？",
    evidence: [{
      id: "ev-revenue-years",
      document: "Synthetic Annual Report 2025",
      page: 27,
      quote: "Revenue increased from USD 500 million in 2024 to USD 525 million in 2025.",
      facts: {
        revenue_2025: { value: 525, unit: "USD million" },
        revenue_2024: { value: 500, unit: "USD million" },
      },
    }],
    reference: {
      answer: 5,
      unit: "percent",
      denominatorRef: "revenue_2024",
      evidenceIds: ["ev-revenue-years"],
      tolerance: { absolute: 0.01, relative: 0.0001 },
      formula: percentChange("revenue_2025", "revenue_2024"),
    },
    candidate: {
      answer: 4.76,
      unit: "percent",
      denominatorRef: "revenue_2025",
      evidenceIds: ["ev-revenue-years"],
      formula: {
        op: "multiply",
        args: [
          { op: "divide", args: [{ op: "subtract", args: [{ ref: "revenue_2025" }, { ref: "revenue_2024" }] }, { ref: "revenue_2025" }] },
          100,
        ],
      },
    },
  },
  {
    id: "financebench-unit-scale",
    title: "十亿与百万量级混淆",
    benchmarkStyle: "FinanceBench",
    synthetic: true,
    question: "期末未偿债务是多少？",
    evidence: [{
      id: "ev-debt-note",
      document: "Synthetic 10-K 2025",
      page: 61,
      quote: "Outstanding debt at year-end was USD 1.2 billion.",
      facts: { outstanding_debt: { value: 1.2, unit: "USD billion" } },
    }],
    reference: {
      answer: 1.2,
      unit: "USD billion",
      evidenceIds: ["ev-debt-note"],
      formula: { op: "add", args: [{ ref: "outstanding_debt" }, 0] },
    },
    candidate: {
      answer: 1.2,
      unit: "USD million",
      evidenceIds: ["ev-debt-note"],
      formula: { op: "add", args: [{ ref: "outstanding_debt" }, 0] },
    },
  },
  {
    id: "finqa-arithmetic-slip",
    title: "展示答案与公式结果不一致",
    benchmarkStyle: "FinQA",
    synthetic: true,
    question: "经营现金流由 180 增至 210，绝对增量是多少？",
    evidence: [{
      id: "ev-cash-flow",
      document: "Synthetic Cash Flow Statement 2025",
      page: 33,
      quote: "Operating cash flow was USD 210 million, compared with USD 180 million one year earlier.",
      facts: {
        cash_flow_2025: { value: 210, unit: "USD million" },
        cash_flow_2024: { value: 180, unit: "USD million" },
      },
    }],
    reference: {
      answer: 30,
      unit: "USD million",
      evidenceIds: ["ev-cash-flow"],
      formula: { op: "subtract", args: [{ ref: "cash_flow_2025" }, { ref: "cash_flow_2024" }] },
    },
    candidate: {
      answer: 35,
      unit: "USD million",
      evidenceIds: ["ev-cash-flow"],
      formula: { op: "subtract", args: [{ ref: "cash_flow_2025" }, { ref: "cash_flow_2024" }] },
    },
  },
]);

// More explicit alias for callers that treat these as immutable fixture cases.
export const FINANCIAL_AUDIT_CASES = FINANCE_AUDIT_SAMPLES;

export const FINANCE_CASES = deepFreeze(FINANCE_AUDIT_SAMPLES.map(item => ({
  id: item.id,
  title: item.title,
  question: item.question,
  evidence: item.evidence,
  candidates: [{
    id: `${item.id}-baseline`,
    label: "Baseline candidate",
    ...item.candidate,
  }],
  expected: item.reference,
  provenance: {
    benchmarkStyle: item.benchmarkStyle,
    synthetic: true,
    source: "ReproGate original synthetic fixture",
    note: "Schema-inspired only; no benchmark question or filing text was copied.",
    referenceUrl: item.benchmarkStyle === "FinQA"
      ? "https://github.com/czyssrs/FinQA"
      : "https://github.com/patronus-ai/financebench",
  },
})));
