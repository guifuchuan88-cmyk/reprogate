# ReproGate

> 在烧掉 GPU 小时之前，先知道哪里会失败。

ReproGate 是一个证据优先的研究代码复现前置审计工具。输入公开 GitHub 仓库后，它会锁定当前 commit，检查依赖、运行说明、测试、许可证、环境描述以及数据/模型资产线索，并输出可追溯的风险、静态准备度与最低成本的下一步。

- 在线 Demo：https://guifuchuan88-cmyk.github.io/reprogate/
- GitHub 仓库：https://github.com/guifuchuan88-cmyk/reprogate

## v0.2 已经真实完成什么

- 读取 GitHub 公开仓库元数据、默认分支与不可变 commit
- 扫描递归文件树、README 和少量常见依赖清单
- 运行 8 组确定性静态检查，不依赖 LLM API Key
- 每条风险链接到具体文件或仓库元数据
- 明确处理地址错误、404/私有仓库、API 限流和断网
- 可选 PDF 只在浏览器本地计算 SHA-256，不上传、不解析正文
- 演示快照与实时结果使用醒目的 `SAMPLE` / `LIVE` 标记
- 导出 `ReproSpec v0.2` JSON 和 Markdown 最小验证任务单
- 支持 GitHub Pages 免费静态部署

## 能力边界

当前分数表示“仓库静态准备度”，不表示论文结果已经复现。v0.2：

- 不克隆或执行用户仓库代码
- 不验证 README 外链和模型权重现在是否可下载
- 不解析论文正文，也不做论文—代码语义一致性判断
- 不持久化任务，刷新页面后本次结果不会保存在服务器

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

## 分析流程

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

## 项目结构

```text
reprogate/
├── index.html
├── src/
│   ├── app.js                 # 输入、状态、报告与导出
│   ├── github-analyzer.js     # GitHub API、规则与错误模型
│   └── styles.css
├── scripts/
│   ├── build.mjs
│   └── serve.mjs
├── tests/
│   ├── github-analyzer.test.mjs
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
| 工程实现 | 零依赖浏览器架构、REST API 编排、错误恢复、静态规则引擎 |
| 评测意识 | 规则可单测，未来可用标注仓库评估 blocker precision 与校准度 |
| 交付能力 | 可部署 Demo、结构化导出、响应式 UI、Docker 与 GitHub Pages |

## 下一阶段

1. 建立 30–50 个研究仓库的人工标注评测集，校准规则权重。
2. 增加可选服务端代理和 GitHub Token，提高限额并支持更深内容扫描。
3. 在隔离容器中实现需人工批准的只读 smoke test。
4. 接入论文结构化解析，先做引用级证据，再做 Claim—Artifact 对齐。
5. 增加两次 commit 扫描的差异报告和可分享持久化任务。

## License

Apache-2.0
