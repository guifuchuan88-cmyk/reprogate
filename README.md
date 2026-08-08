# ReproGate

> 在烧掉 GPU 小时之前，先知道论文复现会在哪里失败。

ReproGate 是一个面向研究人员的论文复现前置审计与最小验证产品。它不会尝试“一键复现整篇论文”，而是把目标 Claim 映射到论文证据、代码、数据、权重和环境，暴露阻塞项，再生成成本最低的验证实验。

- 在线 Demo：https://guifuchuan88-cmyk.github.io/reprogate/
- GitHub 仓库：https://github.com/guifuchuan88-cmyk/reprogate

## 第一版包含什么

- 论文 PDF 与 GitHub 仓库任务入口
- 三条可切换的论文 Claim
- Claim—Artifact 证据依赖图
- 两个带证据的关键阻塞项
- Smoke、Minimal、Full 三档验证方案
- 成本、时间与可信度对比
- 人工审批与运行审计记录
- 可下载的 `ReproSpec v0.1` JSON
- 响应式桌面与移动端界面
- 健康检查与 Demo 分析 API

当前版本是完整可交互的产品 Demo，分析结果来自经过设计的示例案例，不会执行用户上传的陌生代码。

## 本地启动

需要 Node.js 22 或更高版本，不需要安装第三方依赖。

最快的查看方式：直接双击项目根目录的 `index.html`。页面不依赖本地服务器，也能完成全部示例交互。

macOS 也可以双击 `打开ReproGate.command`，它会启动本地服务并自动打开浏览器。

命令行启动：

```bash
npm run dev
```

浏览器打开 `http://localhost:4173`，点击“使用示例案例”即可走完整流程。

## 构建与部署

```bash
npm test
npm run start
```

`npm test` 会创建 `dist/` 并执行产品完整性测试。生产服务默认运行在 `http://localhost:8080`。

当前仓库也可直接通过 GitHub Pages 部署：选择 `main` 分支和仓库根目录 `/ (root)` 即可，无需购买云服务器。

使用 Docker：

```bash
docker compose up --build -d
```

健康检查：

```bash
curl http://localhost:8080/api/health
```

## 产品流程

```text
PDF + GitHub
    ↓
证据快照
    ↓
Claim 提取与选择
    ↓
Claim—Artifact 依赖图
    ↓
风险与阻塞项审计
    ↓
最小验证方案
    ↓
人工审批
    ↓
ReproSpec 与结果归因
```

## 项目结构

```text
reprogate/
├── index.html             # 产品入口
├── src/
│   ├── app.js             # 交互与 Demo 数据
│   └── styles.css         # 完整视觉系统
├── scripts/
│   ├── build.mjs          # 零依赖构建
│   └── serve.mjs          # 静态服务与 Demo API
├── examples/
│   └── uni-moe-reprospec.json
├── tests/
│   └── product.test.mjs
├── docs/
│   ├── PRD.md
│   ├── ARCHITECTURE.md
│   └── SECURITY.md
├── Dockerfile
└── compose.yaml
```

## 为什么不是普通论文助手

| 普通论文助手 | ReproGate |
|---|---|
| 输出自然语言答案 | 输出可执行、可审计的 ReproSpec |
| 隐藏模型不确定性 | 显式标记未知依赖与证据置信度 |
| 默认追求全部自动化 | 高风险动作必须人工审批 |
| 关注生成内容 | 关注复现决策、失败归因和算力成本 |
| 依赖某个模型 | 模型可替换，流程和证据才是产品资产 |

## 下一阶段

- PDF 结构化解析与真实 Claim 提取
- GitHub 仓库 AST 和依赖分析
- 确定性检查器 SDK
- PostgreSQL 任务持久化
- 隔离的只读 Smoke Test Worker
- 真实论文评测集与通用模型 Baseline

## License

Apache-2.0
