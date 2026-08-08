# Architecture

## 当前 Demo

当前版本使用零第三方运行时依赖的 Web 架构，便于在任意服务器、容器或静态平台展示：

```text
Browser
  ├── index.html
  ├── src/styles.css
  └── src/app.js
          ↓
Node HTTP Server
  ├── GET /api/health
  └── POST /api/demo-analysis
```

`scripts/build.mjs` 生成不可变的 `dist/`。`scripts/serve.mjs` 同时提供静态资源、健康检查和示例分析接口。

## 生产目标架构

```text
Web → API → PostgreSQL
       ├── Redis → Analysis Worker → Model Adapter
       ├── Object Storage
       └── Queue → Isolated Sandbox Worker
```

生产版本将保持分析 Worker 和代码执行 Worker 的物理隔离。模型仅负责 Claim 提取、语义映射和实验规划；链接检查、依赖解析、资源限制及命令执行优先使用确定性代码。

## ReproSpec

ReproSpec 是项目的核心开放格式，包含证据快照、目标 Claim、依赖、阻塞项、最小验证命令、预计成本和人工决策。它让分析结果可以被人类、CI 或其他 Agent 继续执行，而不是停留在聊天记录中。
