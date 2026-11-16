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

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const load = path => JSON.parse(readFileSync(resolve(ROOT, path), 'utf8'));

/** Unambiguous terms: the English term must not appear without its agreed
 *  Chinese wording somewhere in the same string. */
const TERMS = [
  ['number line', '数轴'],
  ['place value', '位值'],
  ['numerator', '分子'],
  ['denominator', '分母'],
  ['equivalent fraction', '等值分数'],
  ['improper fraction', '假分数'],
  ['prerequisite', '前置'],
  ['misconception', '误解'],
  ['syllable', '音节'],
  ['phoneme', '音素'],
  ['grapheme', '字形'],
  ['consonant', '辅音'],
  ['vowel', '元音'],
  ['noun', '名词'],
  ['adjective', '形容词'],
  ['adverb', '副词'],
  ['pronoun', '代词'],
  ['punctuation', '标点'],
  ['handwriting', '书写'],
  ['transcription', '誊写'],
  ['spelling', '拼写'],
  ['phonics', '自然拼读'],
  ['vocabulary', '词汇'],
  ['photosynthesis', '光合作用'],
  ['evaporation', '蒸发'],
  ['condensation', '凝结'],
  ['dissolve', '溶解'],
  ['solution', '溶液'],
  ['solvent', '溶剂'],
  ['solute', '溶质'],
  ['mixture', '混合物'],
  ['particle', '微粒'],
  ['friction', '摩擦'],
  ['magnetism', '磁性'],
  ['electricity', '电'],
  ['conductor', '导体'],
  ['insulator', '绝缘体'],
  ['transparent', '透明'],
  ['opaque', '不透明'],
  ['amplitude', '振幅'],
  ['vibration', '振动'],
  ['wavelength', '波长'],
  ['frequency', '频率'],
  ['ecosystem', '生态系统'],
  ['habitat', '栖息地'],
  ['predator', '捕食者'],
  ['producer', '生产者'],
  ['decomposer', '分解者'],
  ['camouflage', '保护色'],
  ['hibernation', '冬眠'],
  ['migration', '迁徙'],
  ['pollination', '授粉'],
  ['germination', '发芽'],
  ['photosynthesis', '光合作用'],
  ['renewable', '可再生'],
  ['recycling', '回收'],
  ['pollution', '污染'],
  ['conservation', '保护'],
  ['quadrilateral', '四边形'],
  ['pentagon', '五边形'],
  ['hexagon', '六边形'],
  ['perpendicular', '垂直'],
  ['parallel', '平行'],
  ['symmetry', '对称'],
  ['circumference', '周长'],
  ['diameter', '直径'],
  ['radius', '半径'],
  ['perimeter', '周长'],
  ['area', '面积'],
  ['probability', '概率'],
  ['symmetry', '对称'],
  ['longitude', '经度'],
  ['latitude', '纬度'],
  ['equator', '赤道'],
  ['hemisphere', '半球'],
  ['renewable energy', '可再生能源'],
  ['fossil', '化石'],
  ['sedimentary', '沉积'],
  ['erosion', '侵蚀'],
  ['weathering', '风化'],
  ['vertebrate', '脊椎动物'],
  ['invertebrate', '无脊椎动物'],
  ['embryo', '胚胎'],
  ['offspring', '后代'],
  ['puberty', '青春期'],
  ['nutrition', '营养'],
  ['hygiene', '卫生'],
  ['emergency', '紧急'],
  ['budget', '预算'],
  ['saving', '储蓄'],
  ['profit', '利润'],
  ['loss', '亏损'],
  ['entrepreneur', '创业者'],
  ['algorithm', '算法'],
  ['debugging', '调试'],
  ['privacy', '隐私'],
  ['decomposition', '分解'],
  ['abstraction', '抽象'],
  ['empathy', '共情'],
  ['resilience', '心理韧性'],
  ['mindfulness', '正念'],
  ['cooperation', '合作'],
];

/** Polysemous words: report the Chinese renderings used per subject so a
 *  reviewer can confirm the resolution is context-appropriate. */
const POLYSEMOUS = ['volume', 'work', 'key', 'mean', 'mode', 'scale', 'power', 'force', 'light', 'plant', 'order', 'wave', 'pitch', 'period', 'graph', 'subject'];

function collectStrings(value, path, out) {
  if (typeof value === 'string') {
    out.push({ path, text: value });
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectStrings(item, `${path}[${index}]`, out));
    return out;
  }
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) collectStrings(item, `${path}.${key}`, out);
  }
  return out;
}

/** Pair every English source string with its translation. */
function pairsFor(kind, locale) {
  const english = {
    topics: () => load('data/topics.json').topics.flatMap(topic => [
      { id: topic.id, subject: topic.subject, texts: [topic.name, topic.description, topic.assessmentPrompt, ...topic.evidence] },
    ]),
    clusters: () => load('data/clusters.json').clusters.flatMap(cluster => [
      { id: `${cluster.subject} / ${cluster.domain} / ${cluster.ageRangeStart}`, subject: cluster.subject, texts: [cluster.summary] },
    ]),
    dependencies: () => load('data/dependencies.json').dependencies.flatMap(edge => [
      { id: `${edge.topicId} → ${edge.prerequisiteId}`, subject: '', texts: [edge.reason] },
    ]),
    research: () => load('data/teaching-research.json').records.flatMap(record => [
      { id: record.topicId, subject: '', texts: collectStrings(record, '', []) .map(entry => entry.text) },
    ]),
  }[kind]();

  const translated = locale[kind];
  const byId = new Map();
  if (kind === 'topics') for (const topic of locale.topics.topics) byId.set(topic.id, [topic.name, topic.description, topic.assessmentPrompt, ...topic.evidence]);
  if (kind === 'clusters') for (const cluster of locale.clusters.clusters) byId.set(JSON.stringify([cluster.subject, cluster.domain, cluster.ageRangeStart]), [cluster.summary]);
  if (kind === 'dependencies') for (const edge of locale.dependencies.dependencies) byId.set(`${edge.topicId} → ${edge.prerequisiteId}`, [edge.reason]);
  if (kind === 'research') for (const record of locale['teaching-research.json'].records) byId.set(record.topicId, collectStrings(record, '', []).map(entry => entry.text));

  const pairs = [];
  for (const entry of english) {
    const zh = byId.get(entry.id);
    if (!zh) continue;
    entry.texts.forEach((text, index) => {
      if (typeof text !== 'string' || typeof zh[index] !== 'string') return;
      pairs.push({ id: entry.id, subject: entry.subject, english: text, chinese: zh[index] });
    });
  }
  return pairs;
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
for (const [englishTerm, chineseTerm] of TERMS) {
  const pattern = new RegExp(`\\b${englishTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
  for (const pair of pairs) {
    if (!pattern.test(pair.english)) continue;
    if (pair.chinese.includes(chineseTerm)) continue;
    const key = `${englishTerm} → ${chineseTerm}`;
    if (!missed.has(key)) missed.set(key, []);
    if (missed.get(key).length < 5) missed.get(key).push(`${pair.id}: ${pair.english.slice(0, 90)} → ${pair.chinese.slice(0, 90)}`);
  }
}

const polysemy = new Map();
for (const word of POLYSEMOUS) {
  const pattern = new RegExp(`\\b${word}\\b`, 'i');
  const renderings = new Map();
  for (const pair of pairs) {
    if (!pattern.test(pair.english)) continue;
    for (const candidate of ['音量', '体积', '容量', '做功', '运算', '图例', '平均数', '众数', '刻度', '比例尺', '幂', '力', '光', '植物', '顺序', '波', '音高', '期间', '图表', '关系图', '主语', '学科']) {
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
for (const [term, examples] of [...missed.entries()].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`### ${term}`);
  for (const example of examples) console.log(`- ${example}`);
  console.log('');
}
console.log(`## Polysemous words by rendering\n`);
for (const [word, renderings] of polysemy) {
  console.log(`- **${word}**: ${renderings.map(([key, count]) => `${key} (${count})`).join(', ')}`);
}
