# A1：一次准备，同阶段复用

应用决定基准、照片区域、保护关系、分区和目标尺寸；CLI执行明确的原生裁切、模板绑定与机械检查。实际看图和授权由当前Agent完成。

## 阶段读取和发现

在A1一次合批读取当前路线要求的商品证据、布局、通用模板、已确定的品类模板、照片准备、计划合同与示例。把已加载文件和结果路径记入工作记录；A0基准和已有全图检查继续有效。阶段切换复用这些内容，输入、版本、账户、模型或相关合同改变时才读取受影响部分。A2的生成/验收方法在进入A2时加载。

为规划原生尺寸和费用，准确解析并完整加载当前 `sealseek-media` Skill、当前宿主适配和它的本地launcher。用 `stage discover --media-entry ABSOLUTE_LAUNCHER.mjs --output-directory NEW_WORK_DIR --json` 合批查询版本、实时能力和固定的nano-banana-pro模型合同。默认最多4个独立进程；每项返回JSON结果与持久回执。该命令只读服务数据、写本地记录，不提交生图。复用成功的discovery.json，失败项保持明确失败；版本或账户改变后重新发现并按依赖合同加载新Skill。

## 原生照片准备与实际检查

原图定位使用当前宿主已有的图像查看、尺寸和坐标能力。纯照片可直接保留；页面需要Agent选择照片区和必须保留的商品、人物、接触及参照区域。需要总览或坐标辅助时优先复用宿主/独立能力提供的稳定工具。保留原图和原生裁切；参考准备直接提供坐标预览和原图/预览/裁切的检查清单，供宿主批量查看。

一次写完本组已经确定的裁切计划，使用 `reference batch-prepare --plan LIST.json --output-directory NEW_DIR --concurrency 4 --json`。LIST格式见[参考批量示例](../examples/reference-batch.json)，各项plan是原有reference prepare计划。CLI逐项保存reference.json、reference.png、source-preview.png、review-template.json和完整preparation.json；返回每项 `preparation_record`、`review_template_file` 与 `inspection_files`。一项失败不会丢掉其他结果，整体ok=false并返回非零退出码。

Agent实际检查每项原图、坐标预览和原生照片，分别填写独立的observations文件，字段见[观察输入示例](../examples/reference-observations.json)。observations只承载真实视觉判断和证据；source/reference哈希由CLI的模板绑定。

使用 `reference batch-review --plan REVIEWS.json --output-directory NEW_REVIEW_DIR --concurrency 4 --json`，其中 `items:[{id,preparation_record,observations}]` 的路径直接取准备回执。CLI读取并核对原模板、生成独立输入review，再逐项执行reference check。输出review_file及prepared/review血缘；只有ready=true的项进入资产计划。完整机器回执用于后续交接，简短展示摘要另行保存。

单项或旧记录仍可用 `review fill --template TEMPLATE --observations OBSERVATIONS --review NEW_INPUT.json` 和 `reference check`。fill保留模板中的明确哈希，只合入观察字段，不替Agent判断通过。缺字段、错哈希、保护区损失或视觉不确定均停在本节点。

## 计划与失败恢复

将准备/验收回执直接绑定到各格有序references，使用board check-plan聚合所有机械问题。对返回的minimum和比例建议，只明确调整必要目标，再检查修订；已通过的参考与发现结果继续复用。通过后board plan锁定。已有真实范围和预算授权直接记录复用，新增数量或费用边界才向用户确认。

批量命令返回一份JSON及持久报告，逐项保留错误与状态。调用者检查整体ok和各项，不把后续成功命令当成前项成功；消费声明的argv，不通过换行文本转换参数或从混合stdout猜JSON。该阶段不加载后续整板定稿与替换任务知识。完成后返回A1分区和尺寸节点，通过计划再进入A2。
