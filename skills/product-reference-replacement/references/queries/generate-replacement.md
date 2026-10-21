# 蓝图就绪后怎样生成并迭代？

触发：B2准备第一轮或下一轮。问题：本轮哪些关系需要文字明确，以及产品与场景是否共同满足？

读取[提示词编译](../topics/replacement-prompt.md)与[共同验收](../topics/replacement-qa.md)，按当前节点需要加载[工具合同](../tool-contract.md)及[媒体依赖](../dependencies.md)。编译本轮完整提示词，准备请求并跟踪同一任务，实际看图后返回B2验收循环。蓝图有误回B1修订；资产缺证据才回A。
