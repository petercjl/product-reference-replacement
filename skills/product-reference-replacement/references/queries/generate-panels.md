# 执行独立单格生成

触发：A1已完成board plan并有plan-lock。先读[原生生成与统一锁定流程](../topics/native-generation.md)、[单图提示词](../topics/panel-generation.md)，按项目generation分支执行。native分支加载当前宿主图像Skill，用已保存execution逐张调用并attach-native；sealseek分支再读[分组执行](../topics/batch-generation.md)与[媒体依赖](../dependencies.md)。每组最多4个count=1请求，生成依赖先完成，未知结果恢复原调用。实际逐格看图并填五项模板；局部职责变化追加intent记录。全部当前格通过后返回A3的board compose与整板真实验收，满意后freeze。B模式资料延迟到B节点读取。
