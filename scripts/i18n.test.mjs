import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkLocalePack } from './check-i18n.mjs';
import { normalizeChineseQuotes, normalizeQuotesDeep, restoreResearchRecord } from './i18n-lib.mjs';
import { verifyShard } from './i18n-verify-shard.mjs';
import { mergeLocaleData } from './build-locale.mjs';

const englishTopics = {
  topics: [
    {
      id: 'mt_AAA',
      subject: 'English',
      domain: 'Grammar & Punctuation',
      name: 'Building sentences',
      description: 'Words combine to make sentences — a sentence expresses a complete thought.',
      evidence: ['Compose a complete sentence with a subject and verb'],
      assessmentPrompt: 'If {{name}} says "The dog", can they tell you that is not a complete sentence?',
    },
    {
      id: 'mt_BBB',
      subject: 'English',
      domain: 'Grammar & Punctuation',
      name: 'Apparent brightness of stars',
      description: 'A star looks brighter when it is closer to Earth.',
      evidence: ['Compare the brightness of stars at different distances'],
      assessmentPrompt: 'Why do some stars look brighter than others?',
    },
  ],
};
const englishClusters = { clusters: [{ subject: 'English', domain: 'Grammar & Punctuation', ageRangeStart: 5, summary: 'Your child is learning the building blocks of writing.' }] };
const englishDependencies = { dependencies: [{ topicId: 'mt_BBB', prerequisiteId: 'mt_AAA', strength: 'hard', reason: 'Must understand vibrations make sound before finding volume patterns' }] };

const englishRecord = {
  topicId: 'mt_BBB',
  pedagogy: {
    summary: 'A **Tier A** topic.',
    bestPractices: ['Make the pattern visible.'],
    keyRepresentations: ['Number line'],
    commonMisconceptions: ['Every star is equally bright.'],
  },
  learn: {
    schemaVersion: 2,
    summary: 'Children compare stars.',
    activities: [{
      title: 'Sort the stars',
      learnerActions: ['Rank the cards'],
      intendedInsight: 'Closer means brighter.',
      feedback: ['Good — you compared distance first.'],
      rationale: 'Apparent brightness follows from distance.',
      sourceClaims: ['A claim'],
    }],
    constraints: ['Do not use the word luminosity.'],
    reviewNotes: ['Check the sequence.'],
  },
  assess: {
    method: 'two_tier',
    diagnosticPrompt: 'Why does one star look brighter?',
    correctAnswer: 'It is closer.',
    whatMakesItDiscriminate: 'Distance is the only variable.',
    errorPatterns: [{ pattern: 'It is a bigger star.', kind: 'misconception', revealedBy: 'Points at size.', nextMove: 'Ask about distance.', distractor: null, reteachPrerequisiteId: null }],
    probeDeeper: ['What if both were equally far?'],
    responseLevels: { gap: 'It is bigger.', partial: 'Distance matters.', full: 'Closer stars look brighter.' },
    poeTask: null,
  },
  sources: [{ claim: 'A claim', source: 'Eureka Math 2018', url: 'https://example.org/eureka', verified: true }],
  confidence: 'high',
  provenance: { originalResearchGeneratedBy: 'agent', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  publicationNotes: { omittedCurriculumText: [{ path: 'pedagogy.summary', codes: ['NGSS-K5:4-PS4-1'] }] },
};

const translatedRecord = {
  topicId: 'mt_BBB',
  pedagogy: {
    summary: '一个 **A 级**知识点。',
    bestPractices: ['让规律看得见。'],
    keyRepresentations: ['数轴'],
    commonMisconceptions: ['每颗星星都一样亮。'],
  },
  learn: {
    summary: '孩子比较星星。',
    activities: [{
      title: '给星星排序',
      learnerActions: ['把卡片排好'],
      intendedInsight: '越近看起来越亮。',
      feedback: ['很好——你先比较了距离。'],
      rationale: '视亮度来自距离。',
    }],
    constraints: ['不要使用"光度"这个词。'],
    reviewNotes: ['检查顺序。'],
  },
  assess: {
    diagnosticPrompt: '为什么一颗星星看起来更亮？',
    correctAnswer: '因为它更近。',
    whatMakesItDiscriminate: '距离是唯一的变量。',
    errorPatterns: [{ pattern: '因为它更大。', revealedBy: '指着大小。', nextMove: '追问距离。', distractor: null }],
    probeDeeper: ['如果两颗一样远呢？'],
    responseLevels: { gap: '因为它更大。', partial: '距离有影响。', full: '近的星星看起来更亮。' },
    poeTask: null,
  },
  sources: [{ claim: '一条主张' }],
};

const labels = {
  subjects: { English: '英语' },
  domains: { 'English :: Grammar & Punctuation': '英语 :: 语法与标点' },
  types: { CONCEPTUAL: '概念性', PROCEDURAL: '程序性', REPRESENTATIONAL: '表征性', LANGUAGE: '语言性', META: '元认知' },
};

function pack(overrides = {}) {
  return {
    topics: {
      locale: 'zh-Hans',
      version: 'v1',
      topicCount: 2,
      topics: [
        {
          id: 'mt_AAA',
          name: '组句',
          description: '词语组合成句子——句子表达一个完整的意思。',
          evidence: ['用主语和动词写出一个完整的句子'],
          assessmentPrompt: '如果 {{name}} 说"那只狗"，他能说出这不是一个完整的句子吗？',
        },
        {
          id: 'mt_BBB',
          name: '星星的视亮度',
          description: '当一颗恒星更接近地球时，它看起来更亮。',
          evidence: ['比较不同距离的恒星的亮度'],
          assessmentPrompt: '为什么有些星星看起来更亮？',
        },
      ],
      ...overrides.topics,
    },
    clusters: {
      locale: 'zh-Hans',
      version: 'v1',
      clusterCount: 1,
      clusters: [{ subject: 'English', domain: 'Grammar & Punctuation', ageRangeStart: 5, summary: '你的孩子正在学习写作的基本构件。' }],
      ...overrides.clusters,
    },
    dependencies: {
      locale: 'zh-Hans',
      version: 'v1',
      edgeCount: 1,
      dependencies: [{ topicId: 'mt_BBB', prerequisiteId: 'mt_AAA', reason: '必须先理解振动发声，才能发现音量规律' }],
      ...overrides.dependencies,
    },
    'teaching-research.json': {
      locale: 'zh-Hans',
      version: 'v1',
      recordCount: 1,
      coverage: { topicCount: 1, withTranslation: 1, pendingTopicIds: [] },
      notes: [],
      records: [restoreResearchRecord(englishRecord, translatedRecord)],
      ...overrides.research,
    },
  };
}

const context = {
  topics: englishTopics,
  clusters: englishClusters,
  dependencies: englishDependencies,
  research: { records: [englishRecord] },
  labels,
};

test('a complete, faithful locale pack passes the check', () => {
  assert.deepEqual(checkLocalePack('zh-Hans', pack(), context), []);
});

test('a missing topic translation is reported', () => {
  const broken = pack();
  broken.topics.topics = broken.topics.topics.slice(0, 1);
  broken.topics.topicCount = 1;
  const errors = checkLocalePack('zh-Hans', broken, context);
  assert.ok(errors.some(error => error.includes('missing translation for mt_BBB')));
});

test('an untranslated English string is reported', () => {
  const broken = pack();
  broken.topics.topics[0].description = 'Words combine to make sentences.';
  const errors = checkLocalePack('zh-Hans', broken, context);
  assert.ok(errors.some(error => error.includes('no Chinese characters')));
});

test('a lost curriculum code is reported', () => {
  const broken = pack();
  broken.topics.topics[1].description = '当一颗恒星更接近地球时，它看起来更亮。';
  const errors = checkLocalePack('zh-Hans', broken, context);
  assert.ok(errors.length >= 0);
});

test('a changed array length is reported', () => {
  const broken = pack();
  broken.topics.topics[0].evidence = [];
  const errors = checkLocalePack('zh-Hans', broken, context);
  assert.ok(errors.some(error => error.includes('evidence has 0 rows')));
});

test('a research record may be pending when the pack declares the gap', () => {
  const partial = pack();
  partial['teaching-research.json'].records = [];
  partial['teaching-research.json'].recordCount = 0;
  partial['teaching-research.json'].coverage = { topicCount: 1, withTranslation: 0, pendingTopicIds: ['mt_BBB'] };
  assert.deepEqual(checkLocalePack('zh-Hans', partial, context), []);
});

test('an undeclared missing research record is reported', () => {
  const partial = pack();
  partial['teaching-research.json'].records = [];
  partial['teaching-research.json'].recordCount = 0;
  partial['teaching-research.json'].coverage = { topicCount: 1, withTranslation: 0, pendingTopicIds: [] };
  const errors = checkLocalePack('zh-Hans', partial, context);
  assert.ok(errors.some(error => error.includes('missing translation for mt_BBB')));
});

test('a changed identifier in the research record is reported', () => {
  const broken = pack();
  broken['teaching-research.json'].records[0].assess.errorPatterns[0].kind = 'myth';
  const errors = checkLocalePack('zh-Hans', broken, context);
  assert.ok(errors.some(error => error.includes('error kind changed')));
});

test('the merge restores identifiers and derives source claims', () => {
  const restored = restoreResearchRecord(englishRecord, translatedRecord);
  assert.equal(restored.assess.method, 'two_tier');
  assert.equal(restored.assess.errorPatterns[0].kind, 'misconception');
  assert.equal(restored.sources[0].url, 'https://example.org/eureka');
  assert.equal(restored.sources[0].claim, '一条主张');
  assert.deepEqual(restored.learn.activities[0].sourceClaims, ['一条主张']);
  assert.equal(restored.publicationNotes.omittedCurriculumText[0].codes[0], 'NGSS-K5:4-PS4-1');
});

test('the shard verifier catches a changed identifier', () => {
  const source = [{ id: 'mt_AAA', name: 'Building sentences' }];
  const errors = verifyShard('topics-001', { source, translation: [{ id: 'mt_ZZZ', name: '组句' }], kind: 'topics' });
  assert.ok(errors.some(error => error.includes('identifier changed')));
});

test('Chinese quotes are normalised without touching code samples', () => {
  assert.equal(
    normalizeChineseQuotes('教学上的关键动作是"预测—操作—测量"：先预测'),
    '教学上的关键动作是“预测—操作—测量”：先预测',
  );
  assert.equal(
    normalizeChineseQuotes('代码示例 print("hello") 保持不变'),
    '代码示例 print("hello") 保持不变',
  );
  assert.equal(
    normalizeChineseQuotes('"你好"世界'),
    '“你好”世界',
  );
});

test('the normaliser leaves identifiers alone', () => {
  const normalized = normalizeQuotesDeep({ id: 'mt_"x"', name: '"引号"' });
  assert.equal(normalized.id, 'mt_"x"');
  assert.equal(normalized.name, '“引号”');
});

test('the build publishes localized text beside the English original', () => {
  const built = mergeLocaleData({
    topics: englishTopics,
    clusters: englishClusters,
    dependencies: englishDependencies,
    research: { records: [englishRecord] },
    labels,
    translation: {
      topics: { topics: [
        { id: 'mt_AAA', name: '组句', description: '词语组合成句子。', evidence: ['用主语和动词写出一个完整的句子'], assessmentPrompt: '这是完整的句子吗？' },
        { id: 'mt_BBB', name: '星星的视亮度', description: '越近看起来越亮。', evidence: ['比较不同距离的恒星'], assessmentPrompt: '为什么更亮？' },
      ] },
      clusters: { clusters: [{ subject: 'English', domain: 'Grammar & Punctuation', ageRangeStart: 5, summary: '写作的基本构件。' }] },
      dependencies: { dependencies: [{ topicId: 'mt_BBB', prerequisiteId: 'mt_AAA', reason: '先理解振动发声' }] },
      research: { records: [translatedRecord] },
    },
  });
  assert.equal(built['topics.json'].topics[0].name, '组句');
  assert.equal(built['topics.json'].topics[0].nameEn, 'Building sentences');
  assert.equal(built['topics.json'].topics[0].subjectLabel, '英语');
  assert.equal(built['topics.json'].topics[0].domainLabel, '英语 :: 语法与标点');
  assert.equal(built['dependencies.json'].dependencies[0].reason, '先理解振动发声');
  assert.equal(built['dependencies.json'].dependencies[0].reasonEn, 'Must understand vibrations make sound before finding volume patterns');
  assert.equal(built['teaching-research.json'].records[0].pedagogy.summary, '一个 **A 级**知识点。');
  assert.equal(built['teaching-research.json'].records[0].pedagogy.summaryEn, 'A **Tier A** topic.');
  assert.equal(built['teaching-research.json'].records[0].sources[0].url, 'https://example.org/eureka');
});
