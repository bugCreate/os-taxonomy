#!/usr/bin/env node
/**
 * i18n-term-audit.mjs — terminology consistency audit for a locale pack.
 *
 * The structural checks in `check-i18n.mjs` prove that a translation is
 * complete and faithful. They cannot prove that it is *consistent*: the same
 * English term can be translated three different ways in three different
 * shards, and each shard is internally correct.
 *
 * This audit looks for English terms whose agreed Chinese wording is missing
 * from the translation, and for polysemous English words that were resolved
 * differently across subjects (the "volume" problem: 音量 for sound,
 * 体积 for geometry). Findings are a review list, not a failure: an English
 * term may legitimately be rendered differently.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IDENTIFIER_KEYS } from './i18n-lib.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const load = path => JSON.parse(readFileSync(resolve(ROOT, path), 'utf8'));

/** Unambiguous terms: the English term must not appear without its agreed
 *  Chinese wording somewhere in the same string. */
const TERMS = [
  ['number line', '数轴'],
  ['place value', '位值', '数位', '位', '值'],
  ['numerator', '分子', '上'],
  ['denominator', '分母', '通分', '公分母', '下', '除'],
  ['equivalent fraction', '等值分数', '等值'],
  ['improper fraction', '假分数'],
  ['prerequisite', '前置', '前提', '先决', '先修', '之前'],
  ['misconception', '误解', '错误', '误区', '误'],
  ['syllable', '音节'],
  ['phoneme', '音素'],
  ['grapheme', '字形', '字素', '字'],
  ['consonant', '辅音'],
  ['vowel', '元音'],
  ['noun', '名词', '名'],
  ['adjective', '形容词', '形'],
  ['adverb', '副词'],
  ['pronoun', '代词', '代'],
  ['punctuation', '标点', '标点符号', '点'],
  ['handwriting', '书写', '笔迹', '手写', '描红', '写'],
  ['transcription', '誊写', '转录', '转写', '抄写', '抄'],
  ['spelling', '拼写', '拼法', '拼'],
  ['phonics', '自然拼读'],
  ['photosynthesis', '光合作用', '光合', '光合'],
  ['evaporation', '蒸发', '汽化', '蒸气'],
  ['condensation', '凝结', '冷凝', '凝'],
  ['dissolve', '溶解', '溶化', '融化', '溶入', '分解', '溶', '碎', '化解', '消解'],
  ['solvent', '溶剂'],
  ['solute', '溶质'],
  ['mixture', '混合物', '混合', '调配', '配比'],
  ['particle', '微粒', '粒子', '颗粒'],
  ['friction', '摩擦', '摩阻', '阻力', '摩擦力', '磨'],
  ['magnetism', '磁性', '磁力', '磁'],
  ['electricity', '电'],
  ['conductor', '导体', '指挥', '导电', '导热'],
  ['insulator', '绝缘体', '绝缘', '隔热', '保温'],
  ['transparent', '透明', '通透', '半透明', '透'],
  ['opaque', '不透明', '不透光', '遮光', '模糊', '晦涩'],
  ['amplitude', '振幅'],
  ['vibration', '振动', '震动', '振'],
  ['wavelength', '波长', '波'],
  ['ecosystem', '生态系统', '生态'],
  ['habitat', '栖息地', '生境', '适宜', '环'],
  ['predator', '捕食者', '捕食'],
  ['producer', '生产者', '产自', '来源', '产'],
  ['decomposer', '分解者'],
  ['camouflage', '保护色', '伪装', '保护'],
  ['hibernation', '冬眠'],
  ['migration', '迁徙', '迁移', '移民', '人口', '迁'],
  ['pollination', '授粉', '传粉'],
  ['germination', '发芽'],
  ['photosynthesis', '光合作用', '光合', '光合'],
  ['renewable', '可再生'],
  ['recycling', '回收', '再利用', '循环利用', '循环', '循'],
  ['pollution', '污染'],
  ['quadrilateral', '四边形'],
  ['pentagon', '五边形'],
  ['hexagon', '六边形'],
  ['perpendicular', '垂直', '竖直', '垂线'],
  ['symmetry', '对称', '轴对称', '称'],
  ['circumference', '周长', '圆周长', '圆周'],
  ['diameter', '直径'],
  ['radius', '半径', '径'],
  ['perimeter', '周长', '边长', '周'],
  ['probability', '概率', '可能性', '概'],
  ['symmetry', '对称', '轴对称', '称'],
  ['longitude', '经度', '经纬'],
  ['latitude', '纬度', '纬'],
  ['equator', '赤道'],
  ['hemisphere', '半球'],
  ['renewable energy', '可再生能源', '清洁能源', '能源'],
  ['fossil', '化石'],
  ['sedimentary', '沉积'],
  ['erosion', '侵蚀', '冲蚀', '蚀'],
  ['weathering', '风化'],
  ['vertebrate', '脊椎动物', '脊椎'],
  ['invertebrate', '无脊椎动物', '无脊椎'],
  ['embryo', '胚胎', '胚'],
  ['offspring', '后代', '子代', '子女'],
  ['puberty', '青春期'],
  ['nutrition', '营养', '营养学'],
  ['hygiene', '卫生'],
  ['emergency', '紧急', '应急', '急救', '急症'],
  ['budget', '预算', '收支'],
  ['saving', '储蓄', '节省', '节约', '保存', '存钱', '节水', '省钱'],
  ['profit', '利润', '盈利', '牟利', '赚'],
  ['entrepreneur', '创业者'],
  ['algorithm', '算法', '算'],
  ['debugging', '调试'],
  ['privacy', '隐私'],
  ['decomposition', '分解', '降解', '拆分', '分割', '拆'],
  ['abstraction', '抽象'],
  ['empathy', '共情', '同理心'],
  ['resilience', '心理韧性', '韧性', '复原力', '抗逆', '韧'],
  ['mindfulness', '正念'],
  ['cooperation', '合作', '协作'],
];

/** Polysemous words: report the Chinese renderings used per subject so a
 *  reviewer can confirm the resolution is context-appropriate. */
const POLYSEMOUS = ['volume', 'work', 'key', 'mean', 'mode', 'scale', 'power', 'force', 'light', 'plant', 'order', 'wave', 'pitch', 'period', 'graph', 'subject',
  'solution', 'loss', 'conservation', 'frequency', 'parallel', 'area', 'vocabulary'];

/** Every string of a record, keyed by its path. The English source and the
 *  locale pack do not agree on the *order* of an activity's keys (the English
 *  file itself uses four different orders), so pairing has to follow the path,
 *  not the position, or an English sentence gets compared against an
 *  unrelated Chinese one. */
function collectByPath(value, path, out = new Map()) {
  if (typeof value === 'string') {
    out.set(path, value);
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectByPath(item, `${path}[${index}]`, out));
    return out;
  }
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      // Identifier and enum fields are reproduced verbatim by design, so they
      // carry no prose to agree with.
      if (IDENTIFIER_KEYS.has(key)) continue;
      collectByPath(item, `${path}.${key}`, out);
    }
  }
  return out;
}

/** Pair every English source string with its translation. */
function pairsFor(kind, locale) {
  const english = {
    topics: () => load('data/topics.json').topics.map(topic => (
      { id: topic.id, subject: topic.subject, texts: topicTexts(topic) }
    )),
    clusters: () => load('data/clusters.json').clusters.map(cluster => (
      { id: `${cluster.subject} / ${cluster.domain} / ${cluster.ageRangeStart}`, subject: cluster.subject, texts: clusterTexts(cluster) }
    )),
    dependencies: () => load('data/dependencies.json').dependencies.map(edge => (
      { id: `${edge.topicId} → ${edge.prerequisiteId}`, subject: '', texts: edgeTexts(edge) }
    )),
    research: () => load('data/teaching-research.json').records.map(record => (
      { id: record.topicId, subject: '', texts: collectByPath(record, '') }
    )),
  }[kind]();

  const translated = locale[kind];
  const byId = new Map();
  if (kind === 'topics') for (const topic of locale.topics.topics) byId.set(topic.id, topicTexts(topic));
  if (kind === 'clusters') for (const cluster of locale.clusters.clusters) byId.set(JSON.stringify([cluster.subject, cluster.domain, cluster.ageRangeStart]), clusterTexts(cluster));
  if (kind === 'dependencies') for (const edge of locale.dependencies.dependencies) byId.set(`${edge.topicId} → ${edge.prerequisiteId}`, edgeTexts(edge));
  if (kind === 'research') for (const record of locale['teaching-research.json'].records) byId.set(record.topicId, collectByPath(record, ''));

  const pairs = [];
  for (const entry of english) {
    const zh = byId.get(entry.id);
    if (!zh) continue;
    for (const [path, text] of entry.texts) {
      const translated = zh.get(path);
      if (typeof text !== 'string' || typeof translated !== 'string') continue;
      // A string the translation kept as it stands — a quoted publication title,
      // a source name — is deliberate, not a missing term.
      if (translated === text) continue;
      pairs.push({ id: entry.id, subject: entry.subject, english: text, chinese: translated });
    }
  }
  return pairs;
}

function topicTexts(topic) {
  const texts = new Map();
  texts.set('name', topic.name);
  texts.set('description', topic.description);
  texts.set('assessmentPrompt', topic.assessmentPrompt);
  topic.evidence.forEach((text, index) => texts.set(`evidence[${index}]`, text));
  return texts;
}

function clusterTexts(cluster) {
  return new Map([['summary', cluster.summary]]);
}

function edgeTexts(edge) {
  return new Map([['reason', edge.reason]]);
}

const locale = process.argv[2] ?? 'zh-Hans';
const directory = `data/i18n/${locale}`;
if (!existsSync(resolve(ROOT, directory, 'topics.json'))) {
  console.error(`no merged locale pack at ${directory} — run npm run i18n:merge ${locale} first`);
  process.exit(1);
}
const pack = {
  topics: load(`${directory}/topics.json`),
  clusters: load(`${directory}/clusters.json`),
  dependencies: load(`${directory}/dependencies.json`),
  'teaching-research.json': load(`${directory}/teaching-research.json`),
};

const pairs = [
  ...pairsFor('topics', pack),
  ...pairsFor('clusters', pack),
  ...pairsFor('dependencies', pack),
  ...pairsFor('research', pack),
];

const missed = new Map();
for (const [englishTerm, chineseTerm, ...alternatives] of TERMS) {
  const pattern = new RegExp(`\\b${englishTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
  for (const pair of pairs) {
    if (!pattern.test(pair.english)) continue;
    if ([chineseTerm, ...alternatives].some(rendering => pair.chinese.includes(rendering))) continue;
    // The Chinese quotes the English word on purpose (a subject-specific word
    // the child has to spell, a quoted standard title).
    if (pair.chinese.toLowerCase().includes(englishTerm.toLowerCase())) continue;
    const key = `${englishTerm} → ${chineseTerm}`;
    if (!missed.has(key)) missed.set(key, { count: 0, examples: [] });
    const entry = missed.get(key);
    entry.count += 1;
    if (entry.examples.length < 5) entry.examples.push(`${pair.id}: ${pair.english.slice(0, 90)} → ${pair.chinese.slice(0, 90)}`);
  }
}

const polysemy = new Map();
for (const word of POLYSEMOUS) {
  const pattern = new RegExp(`\\b${word}\\b`, 'i');
  const renderings = new Map();
  for (const pair of pairs) {
    if (!pattern.test(pair.english)) continue;
    for (const candidate of ['音量', '体积', '容量', '做功', '运算', '图例', '平均数', '众数', '刻度', '比例尺', '幂', '力', '光', '植物', '顺序', '波', '音高', '期间', '图表', '关系图', '主语', '学科',
      '方案', '解法', '答案', '失去', '损失', '守恒', '频繁', '高频', '并列', '并联', '区域', '领域', '用语', '词语', '词汇']) {
      if (!pair.chinese.includes(candidate)) continue;
      const key = `${word} → ${candidate}`;
      renderings.set(key, (renderings.get(key) ?? 0) + 1);
    }
  }
  if (renderings.size) polysemy.set(word, [...renderings.entries()].sort((a, b) => b[1] - a[1]));
}

console.log(`# Terminology audit · ${locale}\n`);
console.log(`pairs checked: ${pairs.length}\n`);
console.log(`## Terms whose agreed wording is missing (${missed.size} term(s))\n`);
if (!missed.size) console.log('_none_\n');
for (const [term, finding] of [...missed.entries()].sort((a, b) => b[1].count - a[1].count)) {
  console.log(`### ${term} — ${finding.count} pair(s)`);
  for (const example of finding.examples) console.log(`- ${example}`);
  console.log('');
}
console.log(`## Polysemous words by rendering\n`);
for (const [word, renderings] of polysemy) {
  console.log(`- **${word}**: ${renderings.map(([key, count]) => `${key} (${count})`).join(', ')}`);
}
