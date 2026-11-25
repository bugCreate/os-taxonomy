import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildLocalePack, writeLocalePack } from './i18n-merge.mjs';
import { checkLocalePack, checkLocaleManifest } from './check-i18n.mjs';
import { mergeLocaleData } from './build-locale.mjs';

// A miniature dataset: two topics, one cluster, one dependency and one
// research record, with the Chinese translation written by hand. The test
// drives the whole chain — merge, validate, publish — the way a real
// locale pack is produced.
const englishTopics = {
  version: 'v1',
  topicCount: 2,
  topics: [
    {
      id: 'mt_TEST1',
      type: 'CONCEPTUAL',
      subject: 'English',
      domain: 'Grammar & Punctuation',
      name: 'Building sentences',
      description: 'Words combine to make sentences — a sentence expresses a complete thought.',
      ageRangeStart: 4,
      ageRangeEnd: 6,
      evidence: ['Distinguish between complete sentences and fragments'],
      assessmentPrompt: 'If {{name}} says something like "The dog", can they tell you that is not a complete sentence?',
      standards: [],
    },
    {
      id: 'mt_TEST2',
      type: 'CONCEPTUAL',
      subject: 'Science',
      domain: 'Waves, Light & Sound',
      name: 'Apparent brightness of stars',
      description: 'A star looks brighter when it is closer to Earth.',
      ageRangeStart: 9,
      ageRangeEnd: 12,
      evidence: ['Compare the brightness of stars at different distances'],
      assessmentPrompt: 'Why do some stars look brighter than others?',
      standards: [],
    },
  ],
};

const englishClusters = {
  version: 'v1',
  clusterCount: 1,
  clusters: [{ subject: 'English', domain: 'Grammar & Punctuation', ageRangeStart: 5, summary: 'Your child is learning the building blocks of writing.' }],
};

const englishDependencies = {
  version: 'v1',
  edgeCount: 1,
  dependencies: [{ topicId: 'mt_TEST2', prerequisiteId: 'mt_TEST1', strength: 'hard', reason: 'Must understand the sentence before the paragraph' }],
};

const englishResearch = {
  version: 'v1',
  recordCount: 1,
  notes: ['An English note.'],
  records: [{
    schemaVersion: 2,
    namespace: 'v1',
    topicId: 'mt_TEST1',
    pedagogy: {
      summary: 'Build sentences from a subject and a verb.',
      bestPractices: ['Say the sentence out loud.'],
      keyRepresentations: ['Sentence strip'],
      commonMisconceptions: ['A sentence must be long.'],
    },
    learn: {
      schemaVersion: 2,
      summary: 'Children build sentences.',
      activities: [{
        id: 'activity_1',
        title: 'Build it',
        learnerActions: ['Pick a subject card'],
        intendedInsight: 'A sentence needs a subject and a verb.',
        feedback: ['Good.'],
        rationale: 'Combining parts makes the structure visible.',
        sourceIds: ['citation_1'],
      }],
      constraints: ['Do not use formal grammar terms.'],
      reviewNotes: ['Check the order.'],
    },
    assess: {
      method: 'two_tier',
      diagnosticPrompt: 'Why is "The dog" not a sentence?',
      correctAnswer: 'It has no verb.',
      whatMakesItDiscriminate: 'Only a subject is present.',
      errorPatterns: [{ id: 'diagnostic_1', pattern: 'It is too short.', kind: 'misconception', revealedBy: 'Counts words.', nextMove: 'Ask for a verb.', distractor: null, reteachPrerequisiteId: null }],
      probeDeeper: ['What would make it a sentence?'],
      responseLevels: { gap: 'It is short.', partial: 'It needs a verb.', full: 'A sentence has a subject and a verb.' },
      poeTask: null,
    },
    sources: [{ id: 'citation_1', claim: 'A claim', source: 'Eureka Math 2018', url: 'https://example.org/eureka', verified: true }],
    confidence: 'high',
    authorship: { attribution: 'os-taxonomy research team' },
  }],
};

const chineseTopics = [
  { id: 'mt_TEST1', name: '组句', description: '词语组合成句子——句子表达一个完整的意思。', evidence: ['区分完整句和残句'], assessmentPrompt: '如果 {{name}} 说“那只狗”，他能说出这不是一个完整的句子吗？' },
  { id: 'mt_TEST2', name: '星星的视亮度', description: '当一颗恒星更接近地球时，它看起来更亮。', evidence: ['比较不同距离的恒星的亮度'], assessmentPrompt: '为什么有些星星看起来更亮？' },
];
const chineseClusters = [{ subject: 'English', domain: 'Grammar & Punctuation', ageRangeStart: 5, summary: '你的孩子正在学习写作的基本构件。' }];
const chineseDependencies = [{ topicId: 'mt_TEST2', prerequisiteId: 'mt_TEST1', reason: '必须先理解句子，才能理解段落' }];
const chineseResearch = [{
  topicId: 'mt_TEST1',
  pedagogy: {
    summary: '用主语和动词组成句子。',
    bestPractices: ['把句子大声读出来。'],
    keyRepresentations: ['句子条'],
    commonMisconceptions: ['句子必须很长。'],
  },
  learn: {
    summary: '孩子练习组句。',
    activities: [{
      title: '搭句子',
      learnerActions: ['拿一张主语卡片'],
      intendedInsight: '句子需要主语和动词。',
      feedback: ['很好。'],
      rationale: '把部分组合起来，结构就看得见了。',
    }],
    constraints: ['不要使用正式语法术语。'],
    reviewNotes: ['检查顺序。'],
  },
  assess: {
    diagnosticPrompt: '为什么“那只狗”不是句子？',
    correctAnswer: '因为它没有动词。',
    whatMakesItDiscriminate: '只有主语。',
    errorPatterns: [{ pattern: '因为它太短了。', revealedBy: '数着词。', nextMove: '请他说出动词。', distractor: null }],
    probeDeeper: ['怎样才算一个句子？'],
    responseLevels: { gap: '它太短了。', partial: '它需要动词。', full: '句子有主语也有动词。' },
    poeTask: null,
  },
  sources: [{ claim: '一条主张' }],
}];

const chineseLabels = {
  locale: 'zh-Test',
  version: 'v1',
  subjects: { English: '英语', Science: '科学' },
  domains: { 'English :: Grammar & Punctuation': '英语 :: 语法与标点', 'Science :: Waves, Light & Sound': '科学 :: 波、光与声' },
  types: { CONCEPTUAL: '概念性', PROCEDURAL: '程序性', REPRESENTATIONAL: '表征性', LANGUAGE: '语言性', META: '元认知' },
};

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'taxonomy-i18n-'));
  const data = join(root, 'data');
  mkdirSync(join(data, 'i18n', 'zh-Test'), { recursive: true });
  const shards = join(root, 'shards');
  const out = join(root, 'out');
  mkdirSync(shards, { recursive: true });
  mkdirSync(out, { recursive: true });

  const write = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
  write(join(data, 'topics.json'), englishTopics);
  write(join(data, 'clusters.json'), englishClusters);
  write(join(data, 'dependencies.json'), englishDependencies);
  write(join(data, 'teaching-research.json'), englishResearch);
  write(join(data, 'manifest.json'), { dataset: 'fixture', taxonomyVersion: 'v1', counts: { topics: 2 }, files: {} });
  write(join(data, 'i18n', 'zh-Test', 'labels.json'), chineseLabels);

  const plan = { locale: 'zh-Test', shards: [] };
  const addShard = (id, kind, rows, translation) => {
    const input = join(shards, `${id}.json`);
    const output = join(out, `${id}.json`);
    write(input, rows);
    write(output, translation);
    plan.shards.push({ shardId: id, kind, count: rows.length, input, output });
  };
  addShard('topics-001', 'topics', englishTopics.topics.map(topic => ({
    id: topic.id, name: topic.name, description: topic.description, evidence: topic.evidence, assessmentPrompt: topic.assessmentPrompt,
  })), chineseTopics);
  addShard('clusters-001', 'clusters', englishClusters.clusters.map(cluster => ({
    subject: cluster.subject, domain: cluster.domain, ageRangeStart: cluster.ageRangeStart, summary: cluster.summary,
  })), chineseClusters);
  addShard('dependencies-001', 'dependencies', englishDependencies.dependencies.map(edge => ({
    topicId: edge.topicId, prerequisiteId: edge.prerequisiteId, reason: edge.reason,
  })), chineseDependencies);
  addShard('research-001', 'research', englishResearch.records.map(record => ({
    topicId: record.topicId,
    pedagogy: record.pedagogy,
    learn: {
      summary: record.learn.summary,
      activities: record.learn.activities.map(activity => ({
        title: activity.title,
        learnerActions: activity.learnerActions,
        intendedInsight: activity.intendedInsight,
        feedback: activity.feedback,
        rationale: activity.rationale,
      })),
      constraints: record.learn.constraints,
      reviewNotes: record.learn.reviewNotes,
    },
    assess: {
      diagnosticPrompt: record.assess.diagnosticPrompt,
      correctAnswer: record.assess.correctAnswer,
      whatMakesItDiscriminate: record.assess.whatMakesItDiscriminate,
      errorPatterns: record.assess.errorPatterns.map(pattern => ({
        pattern: pattern.pattern, revealedBy: pattern.revealedBy, nextMove: pattern.nextMove, distractor: pattern.distractor,
      })),
      probeDeeper: record.assess.probeDeeper,
      responseLevels: record.assess.responseLevels,
      poeTask: record.assess.poeTask,
    },
    sources: record.sources.map(source => ({ claim: source.claim })),
  })), chineseResearch);
  write(join(root, 'plan.json'), plan);
  return { root, data, plan };
}

test('the merge, the validator and the build agree on a locale pack', () => {
  const { root, data, plan } = fixture();
  try {
    const { pack, problems } = buildLocalePack({
      locale: 'zh-Test',
      plan,
      topics: englishTopics,
      clusters: englishClusters,
      dependencies: englishDependencies,
      research: englishResearch,
      labels: chineseLabels,
      notes: null,
    });
    assert.deepEqual(problems, []);

    const manifest = JSON.parse(readFileSync(join(data, 'manifest.json'), 'utf8'));
    const { manifest: nextManifest } = writeLocalePack('zh-Test', pack, {
      manifest,
      generatedAt: '2026-01-01T00:00:00.000Z',
      dataDirectory: data,
    });
    assert.equal(nextManifest.i18n['zh-Test'].counts.topics, 2);
    assert.ok(nextManifest.files['i18n/zh-Test/topics.json'].sha256);

    // The written pack passes the same checks CI runs.
    const written = JSON.parse(readFileSync(join(data, 'i18n', 'zh-Test', 'topics.json'), 'utf8'));
    const errors = checkLocalePack('zh-Test', {
      topics: written,
      clusters: JSON.parse(readFileSync(join(data, 'i18n', 'zh-Test', 'clusters.json'), 'utf8')),
      dependencies: JSON.parse(readFileSync(join(data, 'i18n', 'zh-Test', 'dependencies.json'), 'utf8')),
      'teaching-research.json': JSON.parse(readFileSync(join(data, 'i18n', 'zh-Test', 'teaching-research.json'), 'utf8')),
    }, {
      topics: englishTopics,
      clusters: englishClusters,
      dependencies: englishDependencies,
      research: englishResearch,
      labels: chineseLabels,
    });
    assert.deepEqual(errors, []);

    // The locale manifest matches the bytes on disk.
    const localeManifest = JSON.parse(readFileSync(join(data, 'i18n', 'zh-Test', 'manifest.json'), 'utf8'));
    const files = {};
    for (const name of Object.keys(localeManifest.files)) {
      const bytes = readFileSync(join(data, 'i18n', 'zh-Test', name));
      files[name] = { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
    }
    assert.deepEqual(checkLocaleManifest('zh-Test', { localeManifest, manifest: nextManifest, files }), []);

    // The published build carries the Chinese text and the English original.
    const built = mergeLocaleData({
      topics: englishTopics,
      clusters: englishClusters,
      dependencies: englishDependencies,
      research: englishResearch,
      labels: chineseLabels,
      translation: {
        topics: pack['topics.json'],
        clusters: pack['clusters.json'],
        dependencies: pack['dependencies.json'],
        research: pack['teaching-research.json'],
      },
    });
    assert.equal(built['topics.json'].topics[0].name, '组句');
    assert.equal(built['topics.json'].topics[0].nameEn, 'Building sentences');
    assert.equal(built['topics.json'].topics[1].subjectLabel, '科学');
    assert.equal(built['teaching-research.json'].records[0].learn.activities[0].title, '搭句子');
    assert.equal(built['teaching-research.json'].records[0].learn.activities[0].titleEn, 'Build it');
    assert.equal(built['teaching-research.json'].records[0].sources[0].url, 'https://example.org/eureka');
    assert.deepEqual(built['teaching-research.json'].records[0].learn.activities[0].sourceIds, ['citation_1']);
    assert.ok(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
