# npm 包执行入口

所有运行操作优先通过 `product-reference-replacement` 包CLI执行，保证使用包中的规范源码及依赖。`skill source --json`返回source，完整读取其SKILL.md；`skill status/install/update --agent AGENT`管理Codex/SealSeek。其他合法Agent名须加 `--target-directory EXACT_SKILL_DIR`，由调用宿主解析自己的目录；显式目录优先，用户所有的非托管目录会被保护。复制安装和符号链接都保持规范内容一致，复制安装不需要在副本内运行npm。

`update status/check/install`分别展示策略、检查版本、在`--yes`授权下更新全局包并同步已识别的Codex/SealSeek托管目标。自定义目标在包更新后用相同参数执行skill update。开发源码保持Git管理，不自升级。普通业务CLI入口限时检查latest并缓存24小时，默认仅提示；`PRODUCT_REFERENCE_REPLACEMENT_UPDATE_CHECK=0`关闭，`PRODUCT_REFERENCE_REPLACEMENT_STATE_DIR`可指定外部状态目录。版本、帮助、状态轮询不访问更新网络。

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

## 单轮准备、任务绑定、实际验收

1. Agent写本轮完整提示词文件。
2. `round prepare --job JOB --image-id image-01 --prompt-file PROMPT.txt`：检查范围、资产/场景hash、预算、单图4轮、上一轮验收及提示词调整；预留独立round-01目录并返回media CLI的dry_run_args、submit_args。它不执行这些参数。一次预留消耗一个安全预算名额，未知提交不得删除目录重置。
3. Agent动态加载媒体Skill后实际dry-run/submit一次，立即保存返回JSON。`round attach --job JOB --image-id image-01 --task-json TASK.json`绑定task_id。继续等同一任务，完成后再次attach其下载summary。一次生成task不能绑定多图/多轮，恢复只能相同task_id。下载位置必须是该轮指定generated目录。
4. 实际查看结果并写review，调用 `round review --job JOB --image-id image-01 --review REVIEW.json`。

```json
{"inspected":true,"artifact_sha256":"本轮下载图的实际sha256","product_verdict":"FAIL","scene_verdict":"PASS","issues":["约x:40%,y:60%处产品轮廓相对资产参考明显拉长"],"evidence":"对照原始场景和资产板，说明本轮实际看图证据"}
```

两项判定各为PASS/FAIL/UNCERTAIN/ANCHOR_CONFLICT。两项PASS且issues空才accepted；非PASS需具体issues。声明inspected必须来自真实检查，不可由脚本测试或任务成功代填。FAIL后新一轮须修订完整提示词；原始两图始终固定。

文件以新task-01.json、task-02.json追加保存，不覆盖旧快照。review每轮只写一次。未绑定/未验收不能开启下一轮；accepted、四轮耗尽、证据不确定和技术失败不会自动新建生成。并发操作有排他锁；LOCKED需先检查活动进程，不擅自删锁。

## job collect

`job collect --job JOB --output-directory NEW_DELIVERY`

先验证所有实际原件hash，再排他创建交付目录。共享产品资产图保存一份；各image保留轮次原件及记录，多轮附2×2编号对比。只有accepted项有“已验收结果”，其他项在处理清单中如实列为pending/reserved/running/ready/exhausted/failed/needs-input/needs-recovery/awaiting-review。支持部分交付，不能把部分交付叫全批通过。

清单含已知费用和未知轮次，只有同一费用单位才合计。时间戳记录准备、attach与review；媒体原始任务的服务耗时如有应单独保留，不把本地文件时间伪称模型计算时间。
