# 翻译速查表 · zh-Hans

> 每个译者开工前读这一页就够；完整术语表见 [glossary.zh-Hans.md](glossary.zh-Hans.md)。

## 交付物

* 输出文件：`work/i18n/out/<分片 id>.json`，UTF-8 合法 JSON 数组。
* 行数、顺序、键名与输入分片**完全一致**。
* **只用一次 write 调用写出完整文件。** 不要反复重写同一个文件（每次重写都要重新输出一遍全文，代价很高）。如果内容过长一次写不完，就分写成 `part1.json`、`part2.json` 等不同文件，最后用
  `node -e "const fs=require('fs');const a=['part1.json','part2.json'].map(f=>JSON.parse(fs.readFileSync('work/i18n/out/'+f,'utf8'))).flat();fs.writeFileSync('work/i18n/out/<分片 id>.json',JSON.stringify(a,null,2)+'\n')"`
  合并成最终文件。
* 交付前必须跑通：`node scripts/i18n-verify-shard.mjs <分片 id>`，直到输出 `✓`。

## 必须逐字保留（不翻译）

* 知识点 id `mt_…`、先修知识点 id、课程代码（`4-PS4-1`、`AC9TDE2P04`、`ON-MATH-2020-G1-C3.1` 等）。
* 枚举值：`two_tier`、`performance_task`、`interpret_translate`、`use_in_context`、`open_epistemic_probe`；`misconception`、`myth`、`developmental`、`interference`、`performance`；`hard`、`soft`；`high`、`medium`、`low`。
* `{{name}}` 占位符（数量不变）。
* 学科 / 领域英文键名、URL、出版物名、作者名、产品名（Scratch、NGSS、DfE、NCERT…）。
* 被省略课标原文的标记：`[curriculum wording omitted; reference X]`。

## 翻译要求

* 每个字符串都必须有中文，不能留整段英文；英文专有名词可以保留。
* 引用用中文全角引号 `“……”`；嵌套用 `「……」`。代码示例里的半角引号保持不动。
* 数字、公式、单位、年龄区间原样保留。
* 年级体系带语境：英国 `Year 4` → `四年级（英国）`；`Grade 3` → `三年级（安大略）`；`Class III` → `三年级（CBSE）`；`Foundation Stage` → `基础阶段`。
* 面向小学教师/家长：具体、可执行、不夸大；不要把"研究"改写成"研究表明"这类超出原文的断言。
* 保留 Markdown 强调（`**粗体**`）、列表符号和箭头（`→`）。

## 高频术语

| English | 中文 | English | 中文 |
|---|---|---|---|
| prerequisite | 前置知识 | hard / soft dependency | 硬前置 / 软前置 |
| misconception | 误解 | mastery | 掌握 |
| number line | 数轴 | place value | 位值 |
| numerator / denominator | 分子 / 分母 | equivalent fraction | 等值分数 |
| fraction | 分数 | ratio / proportion | 比 / 比例 |
| probability | 概率 | mean / median / mode | 平均数 / 中位数 / 众数 |
| perimeter / area / volume | 周长 / 面积 / 体积 | capacity | 容量 |
| fraction of a shape | 图形的三分之一 | quarter turn | 旋转四分之一圈 |
| symmetry | 对称 | perpendicular / parallel | 垂直 / 平行 |
| photosynthesis | 光合作用 | evaporation / condensation | 蒸发 / 凝结 |
| ecosystem / habitat | 生态系统 / 栖息地 | producer / decomposer | 生产者 / 分解者 |
| particle | 微粒 | friction | 摩擦力 |
| amplitude | 振幅 | pitch / loudness | 音高 / 响度（音量） |
| phonics | 自然拼读 | syllable / phoneme | 音节 / 音素 |
| punctuation | 标点 | handwriting | 书写 |
| empathy | 共情 | resilience | 心理韧性 |
| algorithm | 算法 | debugging | 调试 |
| privacy | 隐私 | decomposition | 分解 |
| predict–do–measure | 预测—操作—测量 | fair test | 公平实验（只改变一个变量） |
| Tier A / B / C | A 级 / B 级 / C 级 | misconception kind: developmental | 发展阶段所致 |

## 多义词陷阱（务必按语境）

| English | 正确译法 |
|---|---|
| volume（声音） | 音量（响度） |
| volume（几何） | 体积 |
| work（物理 / 数学） | 做功 / 运算 |
| key（地图 / 要点 / 键盘） | 图例 / 要点 / 键盘 |
| mean / mode | 平均数 / 众数 |
| scale（刻度 / 比例尺） | 刻度 / 比例尺 |
| force / light / plant | 力 / 光 / 植物 |
| pitch | 音高 |
| order（次序） | 顺序 |
| subject（语法） | 主语 |

## 交付前自检

1. 行数 = 源分片行数，键名与顺序一致，数组长度逐条一致。
2. `{{name}}` 数量未变；id 与课程代码逐字未变。
3. 每个字符串含中文，无整段英文残留。
4. 术语与术语表一致；多义词按上表处理。
5. `node scripts/i18n-verify-shard.mjs <分片 id>` 通过。
6. 只改了输出文件，没有动其它任何文件。
