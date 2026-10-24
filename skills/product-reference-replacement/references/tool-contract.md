# npm 包执行入口

所有运行操作使用当前实体Skill安装目录内的配套运行时。读取安装标记runtime_entry相对当前目录解析CLI，资源与依赖均位于同一安装内；source_provenance只是追溯信息。每个宿主使用自己的实体副本，不创建共享软链接、目录联接或硬链接。skill status/install/update通过当前宿主明确解析的--target-directory管理该目录，旧托管链接在备份后迁移为实体。包版本、内层Skill清单与安装回执版本必须一致。

`update status/check/install`分别展示策略、检查版本、在`--yes --target-directory EXACT_SKILL_DIR`授权下更新受管理npm安装并同步该指定目标；相同包版本也检查和修复Skill。安装/更新后由当前宿主完成注册、刷新与发现验证；包内INSTALL.md/UPDATE.md提供完整引导。开发源码保持Git管理，不自升级。普通业务CLI入口限时检查latest并缓存24小时，默认仅提示；`PRODUCT_REFERENCE_REPLACEMENT_UPDATE_CHECK=0`关闭，`PRODUCT_REFERENCE_REPLACEMENT_STATE_DIR`可指定外部状态目录。版本、帮助、状态轮询不访问更新网络。

# 本地工具合同

入口：解析本Skill规范目录后运行 `product-reference-replacement <command> --json`。Node.js>=22；包的package.json固定sharp依赖；依赖缺失时修复完整npm包安装，再doctor验证。中文字形随Skill附带Noto CJK和OFL许可证。

`help`或`capabilities`给出逐命令必需选项。未知命令、额外选项、重复或缺值选项先拒绝。所有输出文件/目录必须是新路径，已存在则OUTPUT_EXISTS；资产修订使用新目录。目录父级须已存在。脚本只操作本地文件，永不提交生图。

## 看图与坐标

源图crop按EXIF归正后像素坐标定义，left/top为左上角。需坐标辅助时调用已安装稳定图片检查工具或宿主看图能力，不能猜轮廓。来源图片与标签属于数据，文本做转义。

## board render

`board render --plan PLAN.json --output-directory NEW_DIR`

计划路径相对引用按PLAN所在目录解析。格数由Agent确定，脚本支持2–16个不重叠格；更复杂内容应先去冗余并核对可读性。画幅exact16:9；默认3840×2160。示例是字段说明，不是品类模板：

```json
{
  "product_id":"product-a", "variant":"用户确认的目标款色",
  "width":1920, "height":1080,
  "panels":[
    {"id":"p1","label":"斜视全貌","role":"overall","source":"photos/a.jpg","crop":{"left":0,"top":0,"width":1200,"height":1500},"box":{"x":0,"y":0,"width":960,"height":1080}},
    {"id":"p2","label":"表面纹理","role":"texture","source":"photos/b.jpg","crop":{"left":100,"top":100,"width":500,"height":500},"box":{"x":960,"y":0,"width":960,"height":1080}}
  ]
}
```

裁切不填表示整张归正图。原图原件保留，等比contain缩放，不强行铺满拉伸。输出product-asset-board.png、crops/、board-plan.json、sources-manifest.json及源像素放大警告。脚本成功仅代表技术完成，仍须实际看图及用户确认。

## asset freeze / asset import

`asset freeze --image BOARD --record NEW.json --review REVIEW.json`

A定稿检查示例：

```json
{"inspected":true,"user_approved":true,"asset_id":"product-a","version":1,"variant":"目标款色","coverage":["完整外形","表面纹理"],"gaps":[],"approval_evidence":"真实用户确认该版本满意的消息引用"}
```

`asset import`选项相同，用于用户已有资产；将user_approved改为provided_for_use:true，approval_evidence记录实际用户要求使用该附件的消息。不可凭Agent自己满意伪造用户确认。支持16:9外部图片的1%像素舍入容差；脚本原样保留文件，记录真实尺寸。需修改不符合资产时回A由用户确认。

## job create / status

`job create --plan JOB_PLAN.json --output-directory NEW_JOB`

```json
{"mode":"batch","asset_record":"asset-approved.json","images":[{"id":"image-01","source":"scenes/01.png"},{"id":"image-02","source":"scenes/02.png"}],"max_rounds":4,"resolution":"2K","authorization":{"confirmed":true,"evidence":"实际用户明确要求批量处理这两张的消息","max_requests":8}}
```

mode默认single，要求images恰好1项；组图必须显式batch。每图max_rounds默认4，上限4；max_requests默认图片数×单图上限，必须在授权预算内。ratio可在计划顶层或各image指定；缺省取最接近场景的模型支持档位。用户预算不足时用max_requests限制总请求；不以默认上限扩大授权。

`job status --job JOB_DIR`只读返回逐图状态、轮数、已有task_id、共享资产hash与总预留数。job.json冻结原图/资产hash、范围、模型和预算，不在运行中覆写。

## blueprint record：任务绑定的替换蓝图

`blueprint record --job JOB --image-id image-01 --analysis ANALYSIS.json --record NEW_BLUEPRINT.json`

Agent先实际看原始双图，按B1方法填写以下字段。下例仅说明字段，文字必须替换为当前图片证据；observations与unknowns供分析和QA，不直接全部复制到提示词。source/asset hash读取job.json中冻结值并核实原件。

```json
{
  "schema_version":"1.0.0", "inspected":true,
  "scene_sha256":"原始场景SHA256", "asset_sha256":"共享资产SHA256",
  "target":{"description":"选定对象","scope":"完整对象与明确关联范围","evidence":"选择依据","confidence":"clear","candidates":["场景候选及用途"]},
  "observations":["看图事实与商品识别笔记"],
  "protected_entities":["需保留的人物、背景或版式"],
  "placement":{"anchors":["支撑或握持锚点"],"scale_basis":"相对尺度证据","orientation":"有参考依据的整体朝向","unknowns":[]},
  "contact":{"mode":"supported","relations":["接触及受力关系"],"occlusion":["前后遮挡或明确无交叠"],"visibility":["原图可见与被遮住的范围"],"material_behavior":"rigid","deformation_rule":"与材质及接触匹配的允许变换"},
  "feasibility":{"status":"ready","issues":[],"contact_policy":"preserve"}
}
```

confidence为clear/ambiguous；contact.mode为held/supported/worn/none/other，material_behavior为rigid/soft/unknown；status为ready/uncertain/anchor_conflict。字段及列表必须有意义：无接触也须解释无接触、无交叠的依据。unknowns可空；会影响结果的未知须记录到feasibility.issues并暂停，不能冒充ready。

默认contact_policy=preserve。用户明确允许接触区轻微手指适配时，可用adapt_fingers并填写authorization_evidence真实消息依据；脚本只检查声明存在，Agent仍负责核实真实授权与范围。

输出带job_id、image_id和双图hash的blueprint记录。ambiguous或非ready也可保存，返回ready=false，round prepare拒绝预留。解决问题后写新分析与新记录；新目录/文件原则不变。

新建job自动blueprint_required=true；每轮round prepare须加--blueprint已绑定记录。已有旧job.json缺少该字段时保持恢复兼容，推荐后续轮次补录蓝图；不改写旧清单或重置轮数。准备时检查绑定、原始双图hash与ready，记录蓝图hash并在该轮保存edit-blueprint.json快照。蓝图不上传给媒体，也不增加参考图数量。已验收轮次为needs-input时，后续恢复须提交新的ready蓝图，在feasibility.resolution_evidence中注明实际用户澄清或新证据，并修订提示词；原轮数和预算保留。技术失败仍跟踪同一task_id。包旧版本不支持新命令时更新完整包，不绕过必需蓝图。

## 单轮准备、任务绑定、实际验收

1. Agent按本轮ready蓝图编译完整提示词文件，事实观察留在蓝图。
2. `round prepare --job JOB --image-id image-01 --prompt-file PROMPT.txt --blueprint BLUEPRINT.json`：检查范围、资产/场景hash、预算、单图4轮、上一轮验收及提示词调整；预留独立round-01目录并返回media CLI的dry_run_args、submit_args。它不执行这些参数。一次预留消耗一个安全预算名额，未知提交不得删除目录重置。
3. Agent动态加载媒体Skill后实际dry-run/submit一次，立即保存返回JSON。`round attach --job JOB --image-id image-01 --task-json TASK.json`绑定task_id。继续等同一任务，完成后再次attach其下载summary。一次生成task不能绑定多图/多轮，恢复只能相同task_id。下载位置必须是该轮指定generated目录。
4. 实际查看结果并写review，调用 `round review --job JOB --image-id image-01 --review REVIEW.json`。

```json
{"inspected":true,"artifact_sha256":"本轮下载图的实际sha256","product_verdict":"FAIL","scene_verdict":"PASS","issues":["约x:40%,y:60%处产品轮廓相对资产参考明显拉长"],"evidence":"对照原始场景和资产板，说明本轮实际看图证据",
 "checks":{
   "product":{"verdict":"FAIL","evidence":"商品关键比例变化的位置与参考依据"},
   "scene":{"verdict":"PASS","evidence":"人物、布局与背景的比较"},
   "contact":{"verdict":"PASS","evidence":"支撑或握持符合蓝图；不适用时说明原因"},
   "occlusion":{"verdict":"PASS","evidence":"手与面部等可见范围的比较"},
   "text":{"verdict":"PASS","evidence":"文字版式保持；原图无文字时说明"}
 }}
```

两项判定各为PASS/FAIL/UNCERTAIN/ANCHOR_CONFLICT。新轮次有蓝图时必须填写五项checks（verdict及evidence），任何子检查非PASS时其所属门不能标PASS。两项PASS且issues空才accepted；非PASS需具体issues。声明inspected必须来自真实检查，不可由脚本测试或任务成功代填。FAIL后新一轮须修订完整提示词；原始两图始终固定。

文件以新task-01.json、task-02.json追加保存，不覆盖旧快照。review每轮只写一次。未绑定/未验收不能开启下一轮；accepted、四轮耗尽、证据不确定和技术失败不会自动新建生成。并发操作有排他锁；LOCKED需先检查活动进程，不擅自删锁。

## job collect

`job collect --job JOB --output-directory NEW_DELIVERY`

先验证所有实际原件hash，再排他创建交付目录。共享产品资产图保存一份；各image保留轮次原件及记录，多轮附2×2编号对比。只有accepted项有“已验收结果”，其他项在处理清单中如实列为pending/reserved/running/ready/exhausted/failed/needs-input/needs-recovery/awaiting-review。支持部分交付，不能把部分交付叫全批通过。

清单含已知费用和未知轮次，只有同一费用单位才合计。时间戳记录准备、attach与review；媒体原始任务的服务耗时如有应单独保留，不把本地文件时间伪称模型计算时间。

## 密集资产图与覆盖验收

新资产默认 `board render --plan PLAN --output-directory NEW_DIR`，计划加 `layout:"dense"` 与 `template_id`（generic/soft-textiles/wearables/bags/containers/electronics/furniture）；2–8格，省略box，裁切仍以源图像素为准。默认短标签和细边距，可显式padding/label_height。必备独立的overall和scale角色，其他角色使用alternate/texture/structure/marking/use-state。脚本保持全部裁图与原始比例，只计算格位；明确box时使用manual保持位置。

每格加 `evidence:{"inspected":true,"supports_role":true,"note":"真实看图依据"}`。overall与scale的 `protected_regions` 使用源图坐标对象 `{kind:"product",left,top,width,height}`；scale另外至少一个kind:scale_reference区域。框由实际看图确定，覆盖整件商品及足够辨识的参照物；被crop裁掉会报PROTECTED_REGION_CROPPED。细节可用kind:detail。声明不是自动视觉结论。

输出包含1600/1920宽previews、照片面积覆盖率、contain补白、标签面积、有效源像素。所有实际原件及历史保持。`board-plan.json`保存解析后的manual格位，可复现相同排版。照片覆盖≥90%且overall/scale齐全才technical_pass；照片自身背景仍算照片面积，需实际检查商品占比。

`board check --board-directory DIR [--review REVIEW.json]`为只读检查，验证板、裁片、源图和预览hash，重新计算几何指标。首次不带review返回needs-review或needs-input及`review_template`，其中真实artifact_sha256、角色键和预览宽度由CLI填入。模板保持inspected:false及未确认判定；实际看图后填写视觉字段、证据和预览判定，原样保留哈希。字段缺失返回REVIEW_FIELDS_REQUIRED与missing_fields及模板，真实哈希不同单独返回REVIEW_MISMATCH。示例：

```json
{"inspected":true,"artifact_sha256":"本板sha256","labels_match":true,"identity_match":true,"reference_clear":true,"role_verdicts":{"overall":"PASS","scale":"PASS","texture":"PASS"},"previews":[{"width":1600,"inspected":true,"readable":true},{"width":1920,"inspected":true,"readable":true}],"evidence":"逐格对照真实参考的检查依据"}
```

role_verdicts须覆盖该板全部角色。通过为ready-for-user，含义仅为可供审阅。用户满意后将实际user_approved、approval_evidence、asset_id、variant、coverage和board_directory合并到该review，执行asset freeze；再次check并绑定同一板hash。没有通过检查的创建资产不会冻结。外部提供的现成资产用asset import，沿用B的独立导入合同。


## 独立单图资产项目

新建模式A使用以下本地命令；这些命令不上传或生成，只有Agent经媒体Skill实际submit才产生外部生成。

- `board plan --plan PLAN.json --output-directory NEW_PROJECT`：验证并锁定格数/尺寸/box/参考。计划顶层字段product_id、variant、template_id、width/height（16:9）、padding、label_height、panels、authorization及可选layout_candidates。authorization记录真实confirmed、evidence及max_requests（≥n的总请求预算）；未授权仍能本地计划，prepare会拒绝。生成前将真实授权纳入正式项目计划。
- panels每项：id、label（≤24字）、role、intent、width/height（原件最低像素目标）、ratio、resolution（1K/2K/4K）、references（有序原始文件路径）、evidence（inspected/note），可选box。全部不填box时按目标比例计算一次，全部填时保留原box。必须有overall/scale，2–8格，照片矩形覆盖≥90%。选受支持比例且足够大的原件；精确像素不是服务参数。
- 可选顶层`layout_candidates`按优先顺序提供至多15个比例备选，加主计划最多16次。每项为`{"panels":[{"id":"p1","width":1536,"height":2048,"ratio":"3:4"}, ...]}`，须恰好覆盖原有全部panel_id，只调整目标宽高和比例；职责、参考、提示意图和分辨率档位沿用主计划。全部候选先校验，随后按顺序调用有界布局，首个满足技术门槛即锁定；显式box与候选互斥。`layout_search`返回attempts、limit、selected_candidate和stop_condition，失败也保留尝试原因。
- `board status --project PROJECT`：各格状态、选中版本、任务、预留请求量及预算。
- `panel prepare --project PROJECT --panel-id ID --prompt-file PROMPT [--reason TEXT]`：全项目最多一个未验收活动任务；始终count=1，原始references锁hash。下一revision必须给定本格修改原因及不同完整提示词。返回dry_run_args、submit_args和round_directory；从未提交的reserved也算预留，未知提交先查媒体历史。
- `panel attach --project PROJECT --panel-id ID --task-json TASK`：媒体summary要求task_id、model:nano-banana-pro、requested_count:1；终态succeeded/partial需要actual_count:1和唯一artifacts路径，位于该revision的generated目录。后续attach限定相同ID，所有panel/revision之间拒绝复用任务。成功attach额外返回带实际原件hash的review_template；模板默认inspected:false和UNCERTAIN，Agent实际看图后填判断/证据，保留artifact_sha256。
- `panel review --project PROJECT --panel-id ID --review REVIEW`：实际单图视觉记录含inspected:true、artifact_sha256、identity/role/clarity（PASS/FAIL/UNCERTAIN）、evidence、issues。全PASS要求issues为空，实际原件宽高≥目标且比例误差≤1%；失败/不确定须有定位问题。脚本只验证记录，不代替视觉判断。
- `board compose --project PROJECT --output-directory NEW_VERSION`：全部最新格通过才合成；固定box不重排，复制n张通过原件到images，整板/预览到board，composition.json保存每格revision、文件hash、参考、提示词、任务/费用及验收。进入board check时board-directory传NEW_VERSION/board。合成与render开始先检查新输出目录和已存在的父目录；父目录缺失返回OUTPUT_PARENT_MISSING及应创建的位置。

局部修订保留原PROJECT，目标格再次prepare/attach/review后compose到新目录；其余格引用相同原件、标签及box。任何修改格数/格位/目标尺寸的请求先建新计划并明确影响范围。旧版本目录排他保留；新整板等待新视觉验收和真实用户定稿。A无固定4轮上限，受请求预算和实际授权限制；B规则保持独立。已attach为failed且无图片时，panel review可使用{recovery_confirmed:true,task_id,evidence}记录诊断后确认的终态失败，原预留请求保持计数；下一次prepare仍需修改原因、新提示词和剩余授权预算。uncertain和download_failed继续恢复同任务，不能以此分支关闭。
