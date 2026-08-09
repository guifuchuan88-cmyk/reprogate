# ReproGate

> 在烧掉 GPU 小时之前，先知道哪里会失败。

ReproGate 是一个证据优先的研究复现审计工具。它现在支持两类审计对象：公开 GitHub 研究仓库，以及冻结的金融推理工件。前者判断“仓库是否准备好进入验证”，后者把候选答案拆成证据、公式与输出，并给出最高优先级的可验证诊断。

- 在线 Demo：https://guifuchuan88-cmyk.github.io/reprogate/
- GitHub 仓库：https://github.com/guifuchuan88-cmyk/reprogate

## v0.4 已经真实完成什么

### 公开仓库审计

- 读取 GitHub 公开仓库元数据、默认分支与不可变 commit
- 扫描递归文件树、README 和少量常见依赖清单
- 运行 8 组确定性静态检查，不依赖 LLM API Key
- 每条风险链接到具体文件或仓库元数据
- 明确处理地址错误、404/私有仓库、API 限流和断网
- 可选 PDF 只在浏览器本地计算 SHA-256，不上传、不解析正文
- 演示快照与实时结果使用醒目的 `SAMPLE` / `LIVE` 标记
- 导出 `ReproSpec v0.2` JSON 和 Markdown 最小验证任务单
- 支持 GitHub Pages 免费静态部署

### 金融推理审计台

- 5 个 ReproGate 原创合成案例，分别模拟 FinanceBench 证据归因与 FinQA 符号程序评测
- 默认同屏对照“冻结基线输出”与“参考答案回放”，展示相对分数与问题差异；参考列不是模型生成的修复
- 按 FinanceBench/FinQA 启发的评测范式标签，以及证据、单位、分母、数值故障筛选案例
- `add / subtract / multiply / divide / exp / greater` 白名单公式执行器
- 检测证据缺失、引用不支持、单位量级、分母漂移和数值不一致
- 展示结构化公式轨迹、候选呈现值、程序执行值与参考答案
- 用当前 fixture 版本深链接恢复案例、候选和单项/对比视图；旧版本链接会明确提示并按最新版展示
- 用户显式保存最多 20 条浏览器本地对比快照，包含案例/候选元数据、候选与参考数值、单位、格式化公式和审计摘要；不保存证据原文或 PDF，也不上传
- 导出 `reprogate/finance-reasoning-audit/v0.4` JSON 与 Markdown 合成案例审计对比卡
- 无模型调用、无任意代码执行、无 API Key、可直接部署 GitHub Pages

在线进入金融审计台：在首页点击“可审计金融推理”，或使用：

```text
https://guifuchuan88-cmyk.github.io/reprogate/?case=finqa-denominator-drift&view=compare
```

## 能力边界

仓库报告中的分数表示“仓库静态准备度”，金融审计台中的分数表示“单案例可审计性”。二者都不表示论文结果或整个 benchmark 已经复现。v0.4：

- 不克隆或执行用户仓库代码
- 不验证 README 外链和模型权重现在是否可下载
- 不解析论文正文，也不做论文—代码语义一致性判断
- 不持久化任务，刷新页面后本次结果不会保存在服务器
- 不调用真实金融模型，也不展示或伪造模型隐式思维链
- 金融案例为原创合成 fixture，不是 FinanceBench/FinQA 官方数据记录
- 参考答案程序回放不等于真实模型推理，不构成投资建议

产品把这些未知项显式保留，而不是用演示数据或模型猜测替代真实结果。

## 本地启动

需要 Node.js 22 或更高版本，无第三方运行时依赖。

```bash
npm run dev
```

浏览器打开 `http://localhost:4173`。由于页面使用 ES Module 和 GitHub 网络请求，请不要直接双击 `index.html`。

测试与生产构建：

```bash
npm test
npm run start
```

生产预览默认运行在 `http://localhost:8080`，健康检查为 `GET /api/health`。

## 两条分析流程

```text
公开 GitHub URL
      ↓
读取元数据与默认分支
      ↓
锁定 commit SHA
      ↓
读取递归文件树 + README + manifests
      ↓
确定性检查矩阵
      ↓
证据化风险 + 静态准备度
      ↓
ReproSpec JSON + 最小验证任务单
```

```text
冻结合成金融案例
      ↓
绑定页码、原句与结构化事实
      ↓
安全执行白名单公式 AST
      ↓
比对证据 / 单位 / 分母 / 数值
      ↓
最高优先级诊断 + 基线/参考答案对照
      ↓
浏览器本地对比快照 + JSON / Markdown 导出
```

## 项目结构

```text
reprogate/
├── index.html
├── src/
│   ├── app.js                 # 输入、状态、报告与导出
│   ├── github-analyzer.js     # GitHub API、规则与错误模型
│   ├── finance-audit.js       # 金融公式执行、证据校验与错误分类
│   ├── finance-experiment.js  # 对比快照、浏览器存储契约与双格式导出
│   └── styles.css
├── scripts/
│   ├── build.mjs
│   └── serve.mjs
├── tests/
│   ├── github-analyzer.test.mjs
│   ├── finance-audit.test.mjs
│   ├── finance-experiment.test.mjs
│   └── product.test.mjs
├── public/
│   ├── favicon.svg
│   └── og.png
└── docs/
```

## 为什么它适合作为产品 + 开发作品集

| 维度 | ReproGate 的展示点 |
|---|---|
| 产品判断 | 主动缩小为“投入算力前的 go/no-go 决策”，而非泛化论文聊天 |
| AI 产品可信度 | 区分真实、样例与未知；对每个结论保留来源和能力边界 |
| 工程实现 | 零依赖浏览器架构、REST API 编排、安全公式 AST、错误恢复与规则引擎 |
| 评测意识 | 区分检索、证据、单位、分母与答案错误；规则具备确定性单测 |
| 交付能力 | 可部署 Demo、结构化导出、响应式 UI、Docker 与 GitHub Pages |

## 方法与数据使用边界

- [FinQA](https://github.com/czyssrs/FinQA) 为金融数值推理与符号程序设计提供方法参考。
- [FinanceBench](https://github.com/patronus-ai/financebench) 为财报问题、证据页与引用归因设计提供方法参考。
- 仓库没有重新分发 FinanceBench PDF 或数据集，也没有复制 FinQA/FinanceBench 的具体问题；内置英文财报片段和数值均由 ReproGate 原创合成。
- FinanceBench 官方仓库当前未提供清晰的根许可证文件，因此后续接入官方记录前必须先确认再分发权限。

## 下一阶段

1. 增加 BYOM Audit Run：把 ChatGPT、DeepSeek 或本地模型的结构化回答粘贴回来审计，不由 ReproGate 代调模型。
2. 为金融审计台增加经许可的真实公开案例 manifest，不复制完整财报。
3. 建立 30–50 个研究仓库的人工标注评测集，校准规则权重。
4. 增加可选服务端代理和 GitHub Token，提高限额并支持更深内容扫描。
5. 在隔离容器中实现需人工批准的只读 smoke test。

## License

Apache-2.0
