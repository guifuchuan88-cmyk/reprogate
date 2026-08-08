# ReproGate MVP PRD

## 用户问题

研究人员通常在下载代码、配置环境和运行实验后，才发现权重失效、数据缺失、论文与配置不一致。失败发生得太晚，且过程很难形成可复用的知识。

## JTBD

当我准备复现一篇论文时，帮助我在投入主要算力之前，判断目标结论是否具备复现条件、还缺什么，以及最便宜的验证方式是什么。

## 目标用户

- 需要选择和复现 Baseline 的硕士生、博士生
- 指导学生进行论文复现的导师
- 论文 Artifact Reviewer

## 北极星指标

每研究人员小时成功验证的 Claim 数量。

## MVP 成功标准

- 用户能在 3 分钟内理解一条 Claim 的主要阻塞项
- 每个风险结论都有可点击证据
- 用户能比较三档验证方案并作出审批决策
- 系统能导出结构化 ReproSpec
- 在线 Demo 不执行陌生用户代码

## 非目标

- 一键生成完整论文代码
- 通用论文问答
- 自动写论文或 Related Work
- 自动运行任意 GitHub 仓库
- 第一版支持全部学科和语言

## 核心实体

`Paper`、`Claim`、`Evidence`、`Artifact`、`Requirement`、`Risk`、`Run`、`HumanDecision`。

## 评测设计

未来将比较三组方案：README-only、PDF+通用模型、ReproGate。核心指标为 Claim 引用准确率、Blocker Precision@5、首次命令运行成功率、Time-to-First-Executable-Plan 和避免的无效 GPU 时间。
