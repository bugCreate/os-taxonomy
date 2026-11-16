#!/usr/bin/env node
/**
 * build-locale.mjs — publish a merged, app-ready dataset for one locale.
 *
 * The locale pack under `data/i18n/<locale>/` is the source of truth. This
 * script joins it with the English dataset and writes `dist/<locale>/`, where
 * every translated field carries the localized text and the English original
 * stays available next to it in a `<field>En` companion. A consumer can then
 * render either language and switch without a second data source.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const load = path => JSON.parse(readFileSync(resolve(ROOT, path), 'utf8'));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);

function mergeTopics(topics, translation, labels) {
  const byId = new Map(translation.topics.map(topic => [topic.id, topic]));
  return {
    version: topics.version,
    topicCount: topics.topics.length,
    topics: topics.topics.map(topic => {
      const zh = byId.get(topic.id) ?? {};
      const domainLabel = labels.domains?.[`${topic.subject} :: ${topic.domain}`] ?? null;
      return {
        ...topic,
        name: zh.name ?? topic.name,
        nameEn: topic.name,
        description: zh.description ?? topic.description,
        descriptionEn: topic.description,
        evidence: zh.evidence ?? topic.evidence,
        evidenceEn: topic.evidence,
        assessmentPrompt: zh.assessmentPrompt ?? topic.assessmentPrompt,
        assessmentPromptEn: topic.assessmentPrompt,
        subjectLabel: labels.subjects?.[topic.subject] ?? topic.subject,
        domainLabel: domainLabel ?? topic.domain,
      };
    }),
  };
}

function mergeClusters(clusters, translation) {
  const byKey = new Map(translation.clusters.map(cluster => [JSON.stringify([cluster.subject, cluster.domain, cluster.ageRangeStart]), cluster]));
  return {
    version: clusters.version,
    clusterCount: clusters.clusters.length,
    clusters: clusters.clusters.map(cluster => {
      const zh = byKey.get(JSON.stringify([cluster.subject, cluster.domain, cluster.ageRangeStart])) ?? {};
      return { ...cluster, summary: zh.summary ?? cluster.summary, summaryEn: cluster.summary };
    }),
  };
}

function mergeDependencies(dependencies, translation) {
  const byKey = new Map(translation.dependencies.map(edge => [JSON.stringify([edge.topicId, edge.prerequisiteId]), edge]));
  return {
    version: dependencies.version,
    edgeCount: dependencies.dependencies.length,
    dependencies: dependencies.dependencies.map(edge => {
      const zh = byKey.get(JSON.stringify([edge.topicId, edge.prerequisiteId])) ?? {};
      return { ...edge, reason: zh.reason ?? edge.reason, reasonEn: edge.reason };
    }),
  };
}

function mergeResearch(research, translation) {
  const byId = new Map(translation.records.map(record => [record.topicId, record]));
  return {
    ...research,
    records: research.records.map(record => {
      const zh = byId.get(record.topicId);
      if (!zh) return record;
      return {
        ...record,
        pedagogy: {
          summary: zh.pedagogy.summary,
          summaryEn: record.pedagogy.summary,
          bestPractices: zh.pedagogy.bestPractices,
          bestPracticesEn: record.pedagogy.bestPractices,
          keyRepresentations: zh.pedagogy.keyRepresentations,
          keyRepresentationsEn: record.pedagogy.keyRepresentations,
          commonMisconceptions: zh.pedagogy.commonMisconceptions,
          commonMisconceptionsEn: record.pedagogy.commonMisconceptions,
        },
        learn: {
          ...record.learn,
          summary: zh.learn.summary,
          summaryEn: record.learn.summary,
          activities: record.learn.activities.map((activity, index) => ({
            ...activity,
            title: zh.learn.activities[index]?.title ?? activity.title,
            titleEn: activity.title,
            learnerActions: zh.learn.activities[index]?.learnerActions ?? activity.learnerActions,
            learnerActionsEn: activity.learnerActions,
            intendedInsight: zh.learn.activities[index]?.intendedInsight ?? activity.intendedInsight,
            intendedInsightEn: activity.intendedInsight,
            feedback: zh.learn.activities[index]?.feedback ?? activity.feedback,
            feedbackEn: activity.feedback,
            rationale: zh.learn.activities[index]?.rationale ?? activity.rationale,
            rationaleEn: activity.rationale,
          })),
          constraints: zh.learn.constraints ?? record.learn.constraints,
          constraintsEn: record.learn.constraints,
          reviewNotes: zh.learn.reviewNotes ?? record.learn.reviewNotes,
          reviewNotesEn: record.learn.reviewNotes,
        },
        assess: record.assess === null ? null : {
          ...record.assess,
          diagnosticPrompt: zh.assess.diagnosticPrompt,
          diagnosticPromptEn: record.assess.diagnosticPrompt,
          correctAnswer: zh.assess.correctAnswer,
          correctAnswerEn: record.assess.correctAnswer,
          whatMakesItDiscriminate: zh.assess.whatMakesItDiscriminate,
          whatMakesItDiscriminateEn: record.assess.whatMakesItDiscriminate,
          errorPatterns: record.assess.errorPatterns.map((pattern, index) => ({
            ...pattern,
            pattern: zh.assess.errorPatterns[index]?.pattern ?? pattern.pattern,
            patternEn: pattern.pattern,
            revealedBy: zh.assess.errorPatterns[index]?.revealedBy ?? pattern.revealedBy,
            revealedByEn: pattern.revealedBy,
            nextMove: zh.assess.errorPatterns[index]?.nextMove ?? pattern.nextMove,
            nextMoveEn: pattern.nextMove,
            distractor: zh.assess.errorPatterns[index]?.distractor ?? pattern.distractor,
            distractorEn: pattern.distractor,
          })),
          probeDeeper: zh.assess.probeDeeper ?? record.assess.probeDeeper,
          probeDeeperEn: record.assess.probeDeeper,
          responseLevels: {
            ...record.assess.responseLevels,
            gap: zh.assess.responseLevels.gap,
            gapEn: record.assess.responseLevels.gap,
            partial: zh.assess.responseLevels.partial,
            partialEn: record.assess.responseLevels.partial,
            full: zh.assess.responseLevels.full,
            fullEn: record.assess.responseLevels.full,
          },
          poeTask: zh.assess.poeTask ?? record.assess.poeTask,
          poeTaskEn: record.assess.poeTask,
        },
        sources: record.sources.map((source, index) => ({
          ...source,
          claim: zh.sources[index]?.claim ?? source.claim,
          claimEn: source.claim,
        })),
      };
    }),
  };
}

export function mergeLocaleData({ topics, clusters, dependencies, research, labels, translation }) {
  return {
    'topics.json': mergeTopics(topics, translation.topics, labels),
    'clusters.json': mergeClusters(clusters, translation.clusters),
    'dependencies.json': mergeDependencies(dependencies, translation.dependencies),
    'teaching-research.json': mergeResearch(research, translation.research),
  };
}

export function buildLocale(locale, { topics, clusters, dependencies, research, labels }) {
  const directory = `data/i18n/${locale}`;
  const translation = {
    topics: load(`${directory}/topics.json`),
    clusters: load(`${directory}/clusters.json`),
    dependencies: load(`${directory}/dependencies.json`),
    research: load(`${directory}/teaching-research.json`),
  };
  return mergeLocaleData({ topics, clusters, dependencies, research, labels, translation });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const locale = process.argv[2] ?? 'zh-Hans';
  const outDir = resolve(ROOT, 'dist', locale);
  mkdirSync(outDir, { recursive: true });
  const built = buildLocale(locale, {
    topics: load('data/topics.json'),
    clusters: load('data/clusters.json'),
    dependencies: load('data/dependencies.json'),
    research: load('data/teaching-research.json'),
    labels: load(`data/i18n/${locale}/labels.json`),
  });
  const files = {};
  for (const [name, value] of Object.entries(built)) {
    const bytes = json(value);
    writeFileSync(resolve(outDir, name), bytes);
    files[name] = { bytes: bytes.length, sha256: sha256(bytes) };
  }
  const manifest = { locale, generatedAt: new Date().toISOString(), files };
  writeFileSync(resolve(outDir, 'manifest.json'), json(manifest));
  console.log(JSON.stringify({ locale, out: `dist/${locale}`, files: Object.keys(files) }, null, 2));
}
