# Architecture

## v0.4：双审计对象与浏览器本地快照闭环

```text
Browser UI
  ├── Repository Audit
  │    ├── 可选 PDF → Web Crypto SHA-256（不上传）
  │    ├── GitHub URL validation
  │    └── github-analyzer.js
       ├── GitHub repository metadata
       ├── default branch → immutable commit SHA
       ├── recursive Git tree
       ├── README + selected manifests
       └── deterministic checks
              ↓
        Evidence-bound report
        ├── readiness score
        ├── risks and recommendations
        ├── ReproSpec JSON
        └── verification checklist
  └── Finance Reasoning Audit
       ├── immutable synthetic fixtures
       ├── evidence registry → facts + page + quote
       ├── finance-audit.js
       │    ├── whitelisted formula AST
       │    ├── deterministic execution trace
       │    ├── evidence/unit/denominator/numeric checks
       │    └── baseline/reference comparison delta
       ├── finance-experiment.js
       │    ├── privacy-bounded comparison snapshot
       │    ├── versioned localStorage snapshots (max 20)
       │    └── JSON / Markdown serialization
       └── case report
            ├── primary diagnosis
            ├── baseline vs reference answer
            ├── filter + versioned deep link
            └── finance audit JSON + Markdown card
```

页面可以部署在 GitHub Pages；静态站点不上传论文、仓库内容或分析结果。只有用户主动点击“保存快照”时，页面才在当前浏览器配置的 localStorage 中保存案例/候选元数据、候选与参考数值、单位、格式化公式、分数和审计摘要；不保存分母引用、证据 ID、完整证据原文、PDF 或用户文件。匿名 GitHub REST API 的限额由客户端直接承担，界面会显示限流恢复信息。

金融案例不需要网络请求或运行时 API Key。`FINANCE_CASES` 为模块内深度冻结的原创合成 fixture；页面只执行结构化数据表达的六种白名单二元运算，不使用 `eval`、`Function` 或动态代码。

## 规则边界

确定性检查器只判断可观察信号：文件/路径是否存在、README 是否包含安装与运行命令、是否有锁文件、测试、环境描述、许可证与资产获取线索。它不声称证明代码可运行、外链可访问或论文结论成立。

金融审计器只判断当前冻结证据与候选结构之间的关系：引用是否覆盖、公式输入是否被证据支持、单位与量级是否一致、分母口径是否漂移、候选答案是否等于公式执行值。单案例得分不能外推为整个 benchmark 准确率。

## 安全执行模型

```text
JSON-like AST / ordered program
        ↓
node/depth/arity validation
        ↓
reference lookup in evidence registry
        ↓
add | subtract | multiply | divide | exp | greater
        ↓
finite-number check + deterministic trace
```

零分母、未知运算、缺失事实、非有限数值、过深或过大的表达式都会显式失败。结构化轨迹是程序执行记录，不是模型 chain-of-thought。

## 生产演进

```text
Web → API → PostgreSQL
       ├── GitHub App / token-aware fetch proxy
       ├── Queue → Static Analysis Worker
       ├── Object Storage → encrypted, expiring paper input
       └── Human Approval → Isolated Smoke-test Worker
```

代码执行 Worker 必须与分析 API 物理隔离。LLM 只适合论文 Claim 提取、语义映射与解释生成；commit 锁定、依赖解析、外链状态、资源限制和执行审计继续使用确定性代码。

## ReproSpec

`reprogate/reprospec/v0.2` 继续记录仓库快照、证据、检查、风险、下一步和可选 PDF 指纹。`reprogate/finance-reasoning-audit/v0.4` 增加基线/参考答案比较结果；`reprogate/finance-comparison-snapshot/v0.4` 是不含完整证据原文的浏览器本地对比快照。所有导出都不依赖聊天记录。
