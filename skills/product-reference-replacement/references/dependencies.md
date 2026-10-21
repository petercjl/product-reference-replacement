# 嵌套依赖合同

## 长详情语义切片

逻辑Skill名 `semantic-image-slicer`，执行面 `longslice`。仅A1遇长图时需要；普通商品照片无此硬依赖。运行 `longslice skill source` 取得source，完整读取其中当前SKILL.md，其相对资源从返回目录解析。要求analyze/preview/cut、完整坐标清单、保留原件；按callee完整主线分析、实际检查切线预览、切图和检查输出。返回A1逐片理解，不在此调用生成。

若CLI或Skill缺失，使用其公开安装方法修复并验证；不能动态解析规范来源时返回CAPABILITY_UNAVAILABLE，不复制或猜替代流程。

## 单张图片生成

逻辑Skill名 `sealseek-media`，由 `@petercjl/sealseek-media-cli` 分发。所有生成式图片操作执行前需要；本地A1规划不要求登录。固定使用该包和nano-banana-pro，不调用系统自带生图工具，不在依赖失败时切换供应商或直接API。运行 `sealseek-media skill source --json`，完整读取source/SKILL.md，按当前宿主adapter及callee要求检查version、doctor、live capabilities、认证和 `models show nano-banana-pro --live --json`。要求应用提供的有序参考、单张、2K及需要的画幅、dry-run/submit、同task恢复和原件下载。

交接：A2由panel prepare提供本格原始商品参考和完整提示词；B2由round prepare提供原场景在前、共享资产在后的两张参考。两者均使用nano-banana-pro、num=1、ratio/resolution和本轮输出目录。按当前Skill先dry-run，再在用户范围内submit一次，立即通过对应panel attach或round attach保存task_id，跟踪或恢复同一任务到终态，下载到本轮目录后attach最新summary，再返回调用方A2或B2实际看图和review。

匹配请求被去重时按依赖合同处理；--new仅能代表已获授权的真实新一轮，不能恢复不明任务。用户未指定额外画布规则时遵循媒体合同。失败、登录、未知提交、下载和归档恢复均由该能力拥有。缺失特性报告CAPABILITY_UNAVAILABLE/FEATURE_UNSUPPORTED，保留指定模型和参考角色，不直接读凭据或临时直连API补洞。

依赖能力兼容以当前CLI实际可发现合同为准，不以固定版本列表替代探测；不兼容时停止相应分支并报告。
