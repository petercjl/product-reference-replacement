# 安装指导：由当前 Agent 执行

本包分发一个应用 Skill 和它使用的本地 CLI。任意具备文件读写、命令执行和图片查看能力的 Agent 都可使用；生图服务与操作系统依赖由能力合同独立声明。

1. 查阅当前 Agent 自身支持的 Skill 安装、发现和注册机制。确定完整目标目录（包含 product-reference-replacement 这一层）。依据当前宿主提供的配置或文档解析；无法确定时向用户询问，不猜测其他 Agent 的路径。
2. 安装完整 npm 包 @petercjl/product-reference-replacement 到受管理且稳定的环境。即使 npm 禁用了安装脚本，仍完成后续步骤。
3. 运行包 CLI 的 skill source --json，读取返回的规范 source/SKILL.md 以及安装合同。以包根 bin/product-reference-replacement.mjs 为入口，避免误用另一个版本。
4. 使用 skill install --target-directory <已解析的绝对目录> --json 安装全部资源。可按宿主支持能力选择 --mode link 或 --mode copy。任何有效 Agent 名可作标记，但目录始终由当前宿主明确提供。已有非托管目录保留并报告冲突；已有旧版托管安装通过 skill update 迁移。
5. 读取该宿主实际要求的注册/刷新方式并执行；需要重载会话时告知用户。包只负责文件安装，CLI 的 host-registration-pending 回执不等于宿主已经发现 Skill。
6. 核对 CLI version、skill status --target-directory <同一目录> --json 中的 managed/up_to_date、规范内容与真实目标。通过当前宿主的技能列表或加载入口验证能发现并完整加载本 Skill，且相对资源可读取。

只有运行时、Skill 同步、宿主发现三项均通过才报告安装完成。缺少权限、注册接口或必要能力时，说明已完成阶段、剩余阶段和恢复动作。安装本包不代表授权生图或登录服务。

用户最简入口：
> 请安装 @petercjl/product-reference-replacement 及当前 Agent 中的配套 Skill。
