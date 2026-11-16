#!/usr/bin/env node
/**
 * i18n-merge.mjs — assemble translated shards into a locale pack.
 *
 * The merge is the only place that writes `data/i18n/<locale>/`. It reads the
 * shard plan, the translator output for every shard and the English dataset,
 * then:
 *   1. refuses to continue when a shard is missing or its row count drifted;
 *   2. re-attaches every identifier and enum from the English source, so a
 *      translation can never introduce a curriculum code, a prerequisite id
 *      or a topic id that the English graph does not have;
 *   3. writes the locale files, the locale manifest and the matching
 *      checksums in `data/manifest.json`.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  clusterKey,
  dependencyKey,
  normalizeQuotesDeep,
  projectClusterText,
  projectDependencyText,
  projectResearchText,
  projectTopicText,
  restoreResearchRecord,
} from './i18n-lib.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DATA = resolve(ROOT, 'data');
const WORK = resolve(ROOT, 'work', 'i18n');

const load = path => JSON.parse(readFileSync(resolve(ROOT, path), 'utf8'));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);

export const LOCALE_FILES = ['topics.json', 'clusters.json', 'dependencies.json', 'teaching-research.json', 'labels.json', 'notes.json'];

/** Collect the translated rows for one shard kind, in plan order. */
export function collectKind(plan, kind) {
  const shards = plan.shards.filter(shard => shard.kind === kind);
  const rows = [];
  const missing = [];
  for (const shard of shards) {
    if (!existsSync(resolve(ROOT, shard.output))) {
      missing.push(shard.shardId);
      continue;
    }
    const translated = load(shard.output);
    if (!Array.isArray(translated) || translated.length !== shard.count) {
      missing.push(`${shard.shardId} (row count ${Array.isArray(translated) ? translated.length : 'invalid'} ≠ ${shard.count})`);
      continue;
    }
    rows.push(...translated);
  }
  return { rows, missing, shards };
}

/** Build the locale pack in memory from the English dataset and the translations. */
export function buildLocalePack({ locale, plan, topics, clusters, dependencies, research, labels, notes }) {
  const problems = [];

  const topicSource = topics.topics.map(projectTopicText);
  const topicRows = collectKind(plan, 'topics');
  problems.push(...topicRows.missing.map(id => `missing topic shard: ${id}`));
  const topicTranslations = new Map();
  for (const row of topicRows.rows) {
    if (topicTranslations.has(row.id)) problems.push(`duplicate topic translation: ${row.id}`);
    topicTranslations.set(row.id, row);
  }
  for (const source of topicSource) {
    if (!topicTranslations.has(source.id)) problems.push(`untranslated topic: ${source.id}`);
  }
  const translatedTopics = topicSource.map(source => {
    const translation = topicTranslations.get(source.id) ?? {};
    return {
      id: source.id,
      name: translation.name ?? null,
      description: translation.description ?? null,
      evidence: translation.evidence ?? [],
      assessmentPrompt: translation.assessmentPrompt ?? null,
    };
  });

  const clusterSource = clusters.clusters.map(projectClusterText);
  const clusterRows = collectKind(plan, 'clusters');
  problems.push(...clusterRows.missing.map(id => `missing cluster shard: ${id}`));
  const clusterTranslations = new Map();
  for (const row of clusterRows.rows) {
    const key = clusterKey(row);
    if (clusterTranslations.has(key)) problems.push(`duplicate cluster translation: ${key}`);
    clusterTranslations.set(key, row);
  }
  for (const source of clusterSource) {
    if (!clusterTranslations.has(clusterKey(source))) problems.push(`untranslated cluster: ${clusterKey(source)}`);
  }
  const translatedClusters = clusterSource.map(source => {
    const translation = clusterTranslations.get(clusterKey(source)) ?? {};
    return {
      subject: source.subject,
      domain: source.domain,
      ageRangeStart: source.ageRangeStart,
      summary: translation.summary ?? null,
    };
  });

  const dependencySource = dependencies.dependencies.map(projectDependencyText);
  const dependencyRows = collectKind(plan, 'dependencies');
  problems.push(...dependencyRows.missing.map(id => `missing dependency shard: ${id}`));
  const dependencyTranslations = new Map();
  for (const row of dependencyRows.rows) {
    const key = dependencyKey(row);
    if (dependencyTranslations.has(key)) problems.push(`duplicate dependency translation: ${key}`);
    dependencyTranslations.set(key, row);
  }
  for (const source of dependencySource) {
    if (!dependencyTranslations.has(dependencyKey(source))) problems.push(`untranslated dependency: ${dependencyKey(source)}`);
  }
  const translatedDependencies = dependencySource.map(source => {
    const translation = dependencyTranslations.get(dependencyKey(source)) ?? {};
    return {
      topicId: source.topicId,
      prerequisiteId: source.prerequisiteId,
      reason: translation.reason ?? null,
    };
  });

  const researchSource = research.records.map(projectResearchText);
  const researchRows = collectKind(plan, 'research');
  // A missing research shard is not an error: those records are untranslated
  // and the pack declares them as pending. The other layers must be whole.
  const researchTranslations = new Map();
  for (const row of researchRows.rows) {
    if (researchTranslations.has(row.topicId)) problems.push(`duplicate research translation: ${row.topicId}`);
    researchTranslations.set(row.topicId, row);
  }
  // A research record without a translation is not an error: the pack
  // declares the gap in its coverage block, exactly as the English research
  // export declares its own missing topics.
  const pendingResearch = researchSource.filter(source => !researchTranslations.has(source.topicId)).map(source => source.topicId);
  const translatedResearch = [];
  for (const source of researchSource) {
    const translation = researchTranslations.get(source.topicId);
    if (!translation) continue;
    const english = research.records.find(record => record.topicId === source.topicId);
    try {
      translatedResearch.push(restoreResearchRecord(english, translation));
    } catch (error) {
      problems.push(error.message);
    }
  }

  const pack = {
    'topics.json': {
      locale,
      version: topics.version,
      topicCount: translatedTopics.length,
      topics: translatedTopics,
    },
    'clusters.json': {
      locale,
      version: clusters.version,
      clusterCount: translatedClusters.length,
      clusters: translatedClusters,
    },
    'dependencies.json': {
      locale,
      version: dependencies.version,
      edgeCount: translatedDependencies.length,
      dependencies: translatedDependencies,
    },
    'teaching-research.json': {
      locale,
      version: research.version,
      sourceVersion: research.version,
      recordCount: translatedResearch.length,
      coverage: {
        topicCount: research.records.length,
        withTranslation: translatedResearch.length,
        pendingTopicIds: pendingResearch,
      },
      notes: notes?.notes ?? [],
      records: translatedResearch,
    },
    'labels.json': labels,
    'notes.json': notes,
  };
  // Chinese typography is normalised once, here, so every locale pack is
  // identical whatever the individual translators produced.
  for (const name of LOCALE_FILES) {
    if (pack[name] !== undefined) pack[name] = normalizeQuotesDeep(pack[name]);
  }
  return { pack, problems };
}

/** Write the locale pack and refresh both manifests. */
export function writeLocalePack(locale, pack, { manifest, generatedAt, dataDirectory = DATA }) {
  const directory = resolve(dataDirectory, 'i18n', locale);
  mkdirSync(directory, { recursive: true });
  const files = {};
  for (const name of LOCALE_FILES) {
    if (pack[name] === undefined) continue;
    const bytes = json(pack[name]);
    writeFileSync(resolve(directory, name), bytes);
    files[name] = { bytes: bytes.length, sha256: sha256(bytes) };
  }
  const localeManifest = {
    locale,
    language: locale === 'zh-Hans' ? '简体中文' : locale,
    direction: 'ltr',
    version: pack['topics.json'].version,
    sourceTaxonomyVersion: manifest.taxonomyVersion,
    generatedAt,
    counts: {
      topics: pack['topics.json'].topicCount,
      clusters: pack['clusters.json'].clusterCount,
      dependencies: pack['dependencies.json'].edgeCount,
      teachingResearch: pack['teaching-research.json'].recordCount,
      teachingResearchPending: pack['teaching-research.json'].coverage.pendingTopicIds.length,
    },
    files,
  };
  const localeManifestBytes = json(localeManifest);
  writeFileSync(resolve(directory, 'manifest.json'), localeManifestBytes);
  localeManifest.files['manifest.json'] = { bytes: localeManifestBytes.length, sha256: sha256(localeManifestBytes) };

  // Keep the dataset manifest in step: locale files are listed with their
  // checksums so `npm run validate` covers them like any other data file.
  manifest.files = manifest.files ?? {};
  manifest.counts = manifest.counts ?? {};
  for (const [name, meta] of Object.entries(localeManifest.files)) {
    manifest.files[`i18n/${locale}/${name}`] = meta;
  }
  manifest.i18n = manifest.i18n ?? {};
  manifest.i18n[locale] = {
    language: localeManifest.language,
    version: localeManifest.version,
    counts: localeManifest.counts,
    manifest: `i18n/${locale}/manifest.json`,
  };
  return { localeManifest, manifest };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const options = { locale: 'zh-Hans', plan: 'work/i18n/plan.json', data: 'data', root: ROOT };
  const rest = process.argv.slice(2);
  for (let index = 0; index < rest.length; index++) {
    const flag = rest[index];
    if (flag === '--plan') options.plan = rest[++index];
    else if (flag === '--data') options.data = rest[++index];
    else if (!flag.startsWith('--')) options.locale = flag;
  }
  const root = resolve(options.root, options.data);
  const plan = JSON.parse(readFileSync(resolve(options.root, options.plan), 'utf8'));
  const manifest = JSON.parse(readFileSync(resolve(root, 'manifest.json'), 'utf8'));
  const labelsPath = resolve(root, 'i18n', options.locale, 'labels.json');
  if (!existsSync(labelsPath)) {
    console.error(`missing ${labelsPath}`);
    process.exit(1);
  }
  const notesPath = resolve(root, 'i18n', options.locale, 'notes.json');
  const { pack, problems } = buildLocalePack({
    locale: options.locale,
    plan,
    topics: JSON.parse(readFileSync(resolve(root, 'topics.json'), 'utf8')),
    clusters: JSON.parse(readFileSync(resolve(root, 'clusters.json'), 'utf8')),
    dependencies: JSON.parse(readFileSync(resolve(root, 'dependencies.json'), 'utf8')),
    research: JSON.parse(readFileSync(resolve(root, 'teaching-research.json'), 'utf8')),
    labels: JSON.parse(readFileSync(labelsPath, 'utf8')),
    notes: existsSync(notesPath) ? JSON.parse(readFileSync(notesPath, 'utf8')) : null,
  });
  if (problems.length) {
    console.error(`✗ ${problems.length} merge problem(s):`);
    for (const problem of problems.slice(0, 40)) console.error(`  - ${problem}`);
    if (problems.length > 40) console.error(`  …and ${problems.length - 40} more`);
    process.exit(1);
  }
  const generatedAt = new Date().toISOString();
  const { manifest: nextManifest } = writeLocalePack(options.locale, pack, {
    manifest,
    generatedAt,
    dataDirectory: root,
  });
  writeFileSync(resolve(root, 'manifest.json'), json(nextManifest));
  console.log(JSON.stringify({
    locale: options.locale,
    topics: pack['topics.json'].topicCount,
    clusters: pack['clusters.json'].clusterCount,
    dependencies: pack['dependencies.json'].edgeCount,
    teachingResearch: pack['teaching-research.json'].recordCount,
    generatedAt,
  }, null, 2));
}
