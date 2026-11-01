# 嵌套依赖合同

## 长详情语义切片

逻辑Skill名 `semantic-image-slicer`，执行面 `longslice`。仅A1遇长图时需要；普通商品照片无此硬依赖。运行 `longslice skill source` 取得source，完整读取其中当前SKILL.md，其相对资源从返回目录解析。要求analyze/preview/cut、完整坐标清单、保留原件；按callee完整主线分析、实际检查切线预览、切图和检查输出。返回A1逐片理解，不在此调用生成。

若CLI或Skill缺失，使用其公开安装方法修复并验证；不能动态解析规范来源时返回CAPABILITY_UNAVAILABLE，不复制或猜替代流程。

## 单张图片生成

逻辑Skill名 `sealseek-media`，由 `@petercjl/sealseek-media-cli` 分发。仅模式A选择sealseek路线及模式B执行前需要；本地规划与模式A原生imagegen路线无此硬依赖。此分支使用该包和nano-banana-pro，依赖失败按该服务合同恢复，不自行切换供应商或直接API。运行 `sealseek-media skill source --json`，完整读取source/SKILL.md，按当前宿主adapter及callee要求检查version、doctor、live capabilities、认证和 `models show nano-banana-pro --live --json`。要求应用提供的有序参考、单张、2K及需要的画幅、dry-run/submit、同task恢复和原件下载。

按callee当前要求从本宿主实体安装解析其自有launcher/runtime，并核对实际入口版本；若宿主安装缺少所需资源，按能力包安装合同修复并验证，不把其他全局版本视为当前宿主已完整安装。

交接：两个prepare均返回execution_record，其execution.json持久保存command、dry_run_args和submit_args，按当前所需模式原样消费完整数组。基础request.args不含模式或JSON标志。A2由panel prepare提供本格原始商品参考和完整提示词；B2由round prepare提供原场景在前、共享资产在后的两张参考。两者均使用nano-banana-pro、num=1、ratio/resolution和本轮输出目录。按当前Skill先dry-run，再在用户范围内submit一次，立即通过对应panel attach或round attach保存task_id，跟踪或恢复同一任务到终态，下载到本轮目录后attach最新summary，再返回调用方A2或B2实际看图和review。

匹配请求被去重时按依赖合同处理；--new仅能代表已获授权的真实新一轮，不能恢复不明任务。用户未指定额外画布规则时遵循媒体合同。失败、登录、未知提交、下载和归档恢复均由该能力拥有。缺失特性报告CAPABILITY_UNAVAILABLE/FEATURE_UNSUPPORTED，保留指定模型和参考角色，不直接读凭据或临时直连API补洞。

依赖能力兼容以当前CLI实际可发现合同为准，不以固定版本列表替代探测；不兼容时停止相应分支并报告。

A1为规划读取媒体合同后，可用stage discover按声明合批只读版本、能力、所选模型；结果在同一阶段及A2复用，变化时重新加载。A2分组执行通过当前媒体Skill明确解析的本地.mjs launcher，使用当前兼容Node执行环境和原始argv，不绑定某个宿主或猜环境路径。宿主入口/环境由宿主能力提供；缺失时报告能力错误。分组调度只委派CLI，不复制认证、API、上传、下载或服务重试实现。

模式A选择native路线时按[原生生成合同](topics/native-generation.md)加载当前宿主的规范图像Skill/工具；应用只消费原件和真实执行依据，统一绑定计划、格位与验收。
