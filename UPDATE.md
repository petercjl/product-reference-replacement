# 更新指导：由当前 Agent 执行

1. 从当前安装的 skill source --json 解析规范包与版本，先识别当前 Agent 的实际 Skill 目录和注册/刷新机制。更新范围是该明确目标。
2. 调用 update install --target-directory <已解析的绝对目录> --yes --json。目录在替换 npm 包前必须可解析；工具核对托管所有权、保护本地修改、验证备份，然后在暂存环境获取npm包并替换指定Skill内的独立运行时和实体资源。开发源码由 Git 管理，不能自升级。每个目标使用自身运行时，更新当前目标不替换共享全局包或其他Agent的安装。
3. 即使包版本相同，仍修复该目标缺失或陈旧的 Skill。仅处理选定目录，不扫描其他 Agent。已有手工修改先保存或解决冲突；错误回执中的备份用于恢复，未知状态先检查再重试。
4. 核对目标内runtime_entry的 version、skill status --target-directory <同一目录> --json 和内容哈希。按当前宿主机制重新注册/刷新，在技能发现或加载入口确认新内容生效。CLI 的 host-registration-pending 表示仍需宿主验证。

只在运行时、Skill 同步和宿主发现全部通过后报告更新完成。默认自动检查仅提示新版；真正安装需用户授权。离线、所有权冲突或同步失败应报告未完成的阶段和恢复路径。

用户最简入口：
> 请更新 @petercjl/product-reference-replacement 及当前 Agent 中的配套 Skill。

更新同时核对外层包、Skill内层清单、运行时与安装回执版本；即使文件内容相同，陈旧的版本或来源回执也须修复。
