# A2：每组4个独立单图任务

本路线处理产品资产格。应用拥有分组、提示词、参考职责、总预算和视觉验收；`sealseek-media`拥有服务验证、单次生成、任务跟踪、认证和恢复。每次媒体请求count=1，每格具有独立task ID、原件及revision。模式B的单图迭代合同独立保留。

## 分组与预算

按锁定计划顺序将独立格子分为4个一组，尾组按实际剩余数量。局部修改只选择需要调整的格子。已经确定的原始产品基准可供同组复用；如果某格明确使用另一格的生成结果，该依赖必须先通过，才能准备后续组。不会在组内消费尚未完成的生成结果。

准备一份[分组示例](../examples/panel-batch.json)，用 `panel batch-prepare --project PROJECT --plan GROUP_PLAN --output-directory NEW_GROUP_DIR --json`。每项含id、panel_id、prompt_file，可补充reason与depends_on。CLI在项目锁内校验整组、一次核对剩余预算，再为每格保存独立request.json和execution.json，返回不可变batch_record及每项回执身份。下一组在上一组各格实际验收或诊断恢复后准备。失败预留仍保留计数，未知提交不得重置目录或预算。

## 准确执行和同任务恢复

使用A1已解析的当前媒体launcher和发现结果。宿主负责Node执行入口与环境绑定，应用按JSON数组传递参数；宿主无法提供所需执行能力时返回能力缺口。

1. `panel batch-run --batch BATCH.json --mode dry-run --media-entry ABSOLUTE_LAUNCHER.mjs --json`：最多4个独立dry-run，逐项保存进程回执；所有项成功后才可提交。
2. 在真实授权与总预算内执行同一命令的 `--mode submit`。它直接消费每格已保存的submit_args，按4个单图进程并发，分别持久记录提交意图、退出码、stdout/stderr、JSON结果和task ID，再有序attach。对提示词换行、引号、路径和参考顺序使用原始argv数组。
3. `--mode follow` 对已有ID并发执行每次最多45秒的task wait，并attach当前下载结果和对应验收模板。需要更多等待时继续follow；已验收项复用状态。服务诊断、恢复和下载仍执行当前媒体Skill的同ID合同。

每项进程结果独立保存，非零退出码、ok=false、超时或非法JSON都保持失败。部分成功的task ID、原件和模板照常保留。整体错误不会被末尾成功覆盖。

提交意图先于进程执行保存。重复submit复用已有ID/结果，不创建新请求；只有意图但没有结果时标记needs-reconciliation。由调用者按媒体Skill核对历史、恢复原ID，并用panel attach绑定完整任务回执；然后follow。已有ID的失败或下载问题进入同任务恢复，不进入自动重提。新一轮只来自真实反馈、调整后的完整提示词、reason和剩余授权预算。

遇到LOCKED时，用 `operation status --directory LOCK_DIRECTORY --json`读取所有者回执。只有同机、身份可验证且进程已退出的锁，才用 `operation unlock --directory LOCK_DIRECTORY --lock-id EXACT_ID --json`恢复；CLI先备份并核对锁。存活、未知、旧格式或异机所有者保留原锁，等待明确诊断。解锁只恢复本地操作入口；继续核对既有提交意图、结果和原task ID，遵循同任务恢复流程。

## 模板验收与状态所有权

实际查看每格高清原件及必要局部，对照A0基准、原始人物/场景及该格职责。填写[单图观察示例](../examples/panel-observations.json)，用 `panel batch-review --project PROJECT --plan REVIEWS.json --output-directory NEW_REVIEW_DIR --json`。REVIEWS格式为 `items:[{id,panel_id,observations}]`。CLI从当前任务回执取review_template_file，保留artifact_sha256，生成外部review输入并逐项提交。状态写入短事务按序执行；每项结果及失败保持独立。

输入review、observations及自有分析放在工作目录或PROJECT/inputs/reviews。`panels/ID/revision-NNNN`中的request、execution、task和review.json由CLI管理；review.json是正式状态输出。传入该保留路径时返回REVIEW_INPUT_PATH_COLLISION及建议输入位置。遇到手写输入占用该位置，先保留并移出该输入，再提交外部路径；沿用已保存的生成任务。非法内部记录返回带具体路径的INVALID_PANEL_REVIEW_STATE，不以文件存在推断已验收。

每格identity/role/clarity和尺寸全部通过才选中；FAIL/UNCERTAIN保留证据并准备有针对性的后续revision。用户只要求改单格时，其余通过原件和固定格位保持。整组最新格全部通过后回A3合成、整板验收和用户定稿。

## 兼容边界

旧panel prepare入口保留单活动任务合同，旧project/revision和现有execution记录继续可读。新分组通过单独的batch_record显式进入；不会迁移正在运行的任务、替换已安装Skill或重置已有预留。新参数不向旧运行时隐式传递。升级及付费测试分别按实际授权执行。
