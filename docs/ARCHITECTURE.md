# Architecture

## v0.2：浏览器端真实静态审计

```text
Browser UI
  ├── 可选 PDF → Web Crypto SHA-256（不上传）
  ├── GitHub URL validation
  └── github-analyzer.js
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
```

页面可以部署在 GitHub Pages；静态站点不保存论文、仓库内容或分析结果。匿名 GitHub REST API 的限额由客户端直接承担，界面会显示限流恢复信息。

## 规则边界

确定性检查器只判断可观察信号：文件/路径是否存在、README 是否包含安装与运行命令、是否有锁文件、测试、环境描述、许可证与资产获取线索。它不声称证明代码可运行、外链可访问或论文结论成立。

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

`reprogate/reprospec/v0.2` 记录能力声明、仓库快照、证据、检查、风险、下一步和可选 PDF 指纹。下游工具可以据此继续验证，而不必依赖一次聊天记录。
