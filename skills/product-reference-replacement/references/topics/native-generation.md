# 模式A的锁定计划与生成结果绑定

触发：A1选定内容、格数和模板后，或A2执行原生图片生成/局部职责变更。返回A1的锁定计划或A2逐格验收，再进入A3整板审阅。

## 先锁定完整计划

新任务经board check-plan与board plan创建panel-assets-2项目。layout_id、layout_version、每张图的slot_id、内容/目标尺寸、有序参考和总请求预算必须完整。generation选择`{"route":"native","tool":"imagegen","model":null}`，或`{"route":"sealseek","model":"nano-banana-pro"}`；原生工具不暴露模型时保留null。按本次用户选择/宿主规则确定路线，默认值不覆盖明确选择。

plan-lock.json绑定完整project.json。生成前使用固定格位确定各图构图，之后通过同一项目prepare、attach、review、compose。直接修改已锁定project.json会导致后续操作失败。新任务使用board compose；board render仅以--legacy-board重现已经存在的同一份历史快照。旧项目继续按其原有状态恢复，不迁移活动请求。

## 原生生成

1. panel prepare或panel batch-prepare预留每次1张的独立请求。native-image-execution-1返回prompt、有序references、目标ratio/minimum_size、输出目录、request_identity及持久执行记录。最多4个独立原生工具调用一组，存在生成依赖时先完成上游并验收。
2. 完整加载当前宿主广告的规范图像Skill并调用工具；工具参数与结果归属依宿主当前合同。保持本次参考职责和提示词，不通过应用脚本复制图像API。宿主不能执行所需单图任务时报告能力缺口。
3. 保存独立result输入，含request_sha256、artifact_path、evidence；如工具提供invocation_id/model则保存真实值。运行 `panel attach-native --project PROJECT --panel-id ID --result RESULT.json --json`。CLI验证预先保存的请求，复制原件到该revision的generated目录并绑定原件hash和尺寸，返回验收模板。来源文件与绑定回执均保留。
4. 原生工具未暴露外部调用ID时，CLI使用明确标记的local-record身份；这只表示本地文件归属，不表示存在服务端任务。执行结果未知时按宿主工具核对原调用，不以本地ID假装查询外部服务或重提。

结果输入示例：`{"request_sha256":"从request_identity.sha256读取","artifact_path":"实际工具返回的本地原件路径","evidence":"真实调用与返回结果的对应依据"}`。输入放PROJECT/inputs或工作目录；CLI-owned状态路径保留给CLI。

## 逐格判断与主体有效面积

新项目模板含identity、role、clarity、composition、subject_prominence五项。实际看高清原图并对照商品基准及人物/场景素材：完整轮廓、人物/参照关系、必要细节不被切掉；产品全貌尽量大且完整，细节图紧凑聚焦，尺度图保留足够背景供判断关系。确认主体与背景分配是否适合最终格位，检查1600/1920整板预览。照片矩形覆盖是机械几何指标，不能推断主体面积或以白色像素分割判断。

全貌有过多无信息背景、核心细节缩小后不清楚、尺度参照难辨时，composition或subject_prominence记FAIL/UNCERTAIN并定位原因；调整对应单格构图和提示词。单格五项全PASS、实际原件满足目标尺寸/比例后可选中。整板检查还要求subject_prominence与composition_complete真实通过，用户满意后才freeze。

## 记录职责变更，保留独立分支

默认先修复本格原有任务目标。需要改用另一种尺度素材或证据表达时，保存独立analysis：label、intent、role、references、reason。role仍符合已锁定slot；有序reference按新素材真实职责准备并检查。用户明确要求某人物/动作时，更换此类范围先取得用户指示；已有授权内的普通选材判断可继续。

运行 `panel revise-intent --project PROJECT --panel-id ID --analysis ANALYSIS.json --json`，CLI追加不可变intent记录，保存上个版本并使该格needs-revision。活动/待验收/未知任务先按原合同完成或恢复；不能通过职责变更丢弃未解决调用。下一次prepare读取当前intent、新参考和label，保存完整快照；仍需新提示词及revision reason并占用原预算。其他格的已通过图片与格位保持有效。全貌/尺度等slot角色变化需要新的完整规划，不通过单格变更改写模板。
