# 生成前怎样一次检查计划并取得放置尺寸要求？

触发：A1已有逐格素材与内容规划，尚未创建项目。输入是完整模式A计划，输出是全部可独立检查的问题、自动/手动格位与逐格尺寸要求；修订通过后返回A1的board plan，随后进入A2。

## 完整计划与本地草案

从[完整草案示例](../examples/panel-plan.json)读取字段结构，替换为本次商品、素材和职责。示例预留4格和4次请求，仅是可编辑的结构示例；格数、画幅和预算由本次任务决定。参考路径相对计划文件解析；实际查看原图后填写evidence并更新inspected。示例中的false不代表已看图。

顶层authorization始终显式填写confirmed、evidence、max_requests。尚未获得付费授权时用confirmed=false，在evidence说明待确认事项，max_requests为拟议总请求上限且至少覆盖初始n张。它允许本地检查和创建草案，不授权panel prepare或媒体submit。获得真实授权后，保存带真实证据的新正式计划并创建新项目；已有活动项目及预留请求按现有恢复/预算合同保留，不用新草案重置已发生的计数。

## 三种尺寸各自的职责

- panels[].width/height：独立生成原件的最低验收目标，也作为本地布局的参考比例；它们不是服务精确输出参数或“尺寸上限”。
- box：该格在整板上的放置区域。保持已有严格规则：原件目标宽≥box.width−2×padding，原件目标高≥box.height−label_height−3×padding。该规则按内容框计算，实际contain照片可能略小。
- ratio/resolution：发送给媒体能力的真实生成参数。档位对应哪些原生输出尺寸，由当前所选模型实时能力决定。规划目标、服务原生输出和整板放置必须同时相容。

## 先只读检查，再锁定

运行 `board check-plan --plan PLAN.json --json`。它读取计划及其引用资源，执行同一套board plan检验，不建项目、不预留请求、不上传、不调用生成或更新网络。失败返回ok=false、valid=false及issues数组，CLI退出码1；成功为0。每项有原错误code、字段path、panel_id（适用时）、current与required。预算缺项可与可计算的布局尺寸问题同时返回；依赖数据缺失时，尚不可计算的布局为null，不猜阈值。

layout.layout_search.attempts逐候选返回issues和requirements：每格实际box、现有目标、内容框required宽高、sufficient，以及保持原ratio的suggested_minimum_target。建议是恢复信息，不自动写回计划或改变档位。全部满足的首个候选才成为selected_candidate；手动box保持原位。候选中的具体字段路径对应主计划或明确的layout_candidates索引。

先处理全部issues。尺寸不足时核对建议目标与当前模型的原生输出能力；如果当前ratio/resolution支持，可显式修订目标后重检。若不支持，由应用/用户决定调整格位、比例、整板画幅或档位，并明确必要的费用变化。CLI不静默降低画幅、切换比例/档位、放大像素或扩大预算。补充layout_candidates仍代表调用者明确给出的构图备选。

检查通过后运行board plan创建新项目；它复用同一分析器。若失败，error.code保留首项旧错误码，error.details.issues含全部问题，details.layout与layout_search保留可计算恢复信息。缺失授权仍为INVALID_BUDGET，尺寸不足仍为INSUFFICIENT_RESOLUTION。已有有效计划、项目格式及panel生成/验收流程保持兼容。技术预检不能代替实际看图或用户付费授权。
