// Integrity and quality checks for a parallel locale pack.
//
// The locale pack is only useful if it is complete, structurally faithful to
// the English source and actually translated. These checks are deliberately
// strict: a locale pack that drifts from the graph is worse than no locale
// pack, because a consumer would show a child the wrong text.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  clusterKey,
  dependencyKey,
  hasCJK,
  projectResearchText,
  textPairs,
} from './i18n-lib.mjs';

// A curriculum code mixes letters and digits: 4-PS4-1, AC9TDE2P04.
// Ordinals (1st, 2nd) are prose, not codes, and are translated as prose.
const CODE = /\b(?=[A-Za-z0-9-]*[A-Za-z])(?=[A-Za-z0-9-]*\d)[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*\b/g;
const ORDINAL = /^\d+(?:st|nd|rd|th)$/i;

function codeTokensStrict(text) {
  if (typeof text !== 'string') return [];
  const tokens = new Set();
  for (const match of text.matchAll(CODE)) {
    const token = match[0];
    if (ORDINAL.test(token)) continue;
    if ((token.match(/[A-Za-z]/g) ?? []).length < 2) continue;
    tokens.add(token);
  }
  return [...tokens];
}

/** Chinese copy should be Chinese: a long ASCII word run usually means an
 *  untranslated English sentence slipped through. */
function looksUntranslated(chinese) {
  if (typeof chinese !== 'string' || chinese.length < 60) return false;
  const cjk = (chinese.match(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g) ?? []).length;
  const latin = (chinese.match(/[A-Za-z]/g) ?? []).length;
  return latin > cjk;
}

function checkTextPair(errors, label, english, chinese, { allowNull = false, identifier = false } = {}) {
  if (identifier) {
    // Identifiers and enums are reproduced, never translated.
    if (english !== chinese) errors.push(`${label}: identifier changed`);
    return;
  }
  if (english === null || english === undefined) {
    if (chinese !== null && chinese !== undefined) {
      errors.push(`${label}: English source is empty but the locale has text`);
    }
    return;
  }
  if (chinese === null || chinese === undefined) {
    errors.push(`${label}: missing translation`);
    return;
  }
  if (typeof chinese !== 'string') {
    errors.push(`${label}: translation is not a string`);
    return;
  }
  if (!chinese.trim()) {
    errors.push(`${label}: empty translation`);
    return;
  }
  if (allowNull) return;
  if (!hasCJK(chinese)) {
    errors.push(`${label}: translation has no Chinese characters`);
    return;
  }
  for (const token of codeTokensStrict(english)) {
    if (!chinese.includes(token)) {
      errors.push(`${label}: lost code ${token}`);
    }
  }
  const placeholders = (english.match(/\{\{\s*name\s*\}\}/g) ?? []).length;
  const translatedPlaceholders = (chinese.match(/\{\{\s*name\s*\}\}/g) ?? []).length;
  if (placeholders !== translatedPlaceholders) {
    errors.push(`${label}: {{name}} placeholder count changed`);
  }
  // Chinese compresses short headings hard ("Building sentences" → "组句"),
  // so the length rule only applies once the English text is long enough for
  // a ratio to mean something.
  if (english.length >= 20 && (chinese.length < english.length * 0.12 || chinese.length > english.length * 4)) {
    errors.push(`${label}: translation length ${chinese.length} is out of range for ${english.length} characters`);
  }
  if (looksUntranslated(chinese)) {
    errors.push(`${label}: translation still reads as English`);
  }
}

/** Compare two trees of the same shape, field by field. */
function checkTree(errors, label, source, translation) {
  for (const pair of textPairs(source, translation, label)) {
    if (pair.shapeError) {
      errors.push(`${pair.path}: structure differs from the English source`);
      continue;
    }
    checkTextPair(errors, pair.path, pair.english, pair.chinese, { allowNull: pair.english === null, identifier: pair.identifier });
  }
}

/** Validate one locale pack against the English dataset. */
export function checkLocalePack(locale, pack, context) {
  const { topics, clusters, dependencies, research, labels } = context;
  const errors = [];
  const check = (condition, message) => { if (!condition) errors.push(message); };

  // --- topics ----------------------------------------------------------------
  const topicRows = pack?.topics?.topics;
  if (!Array.isArray(topicRows)) {
    errors.push(`${locale}: topics translation missing`);
  } else {
    check(pack.topics.locale === locale, 'topics: locale mismatch');
    check(pack.topics.topicCount === topicRows.length, 'topics: topicCount does not match translation rows');
    check(pack.topics.topicCount === topics.topics.length, 'topics: topicCount does not match the English inventory');
    const seen = new Set();
    const sourceById = new Map(topics.topics.map(topic => [topic.id, topic]));
    for (const row of topicRows) {
      if (seen.has(row.id)) errors.push(`topics: duplicate translation ${row.id}`);
      seen.add(row.id);
      const source = sourceById.get(row.id);
      if (!source) {
        errors.push(`topics: translation for unknown topic ${row.id}`);
        continue;
      }
      checkTextPair(errors, `topics ${row.id}.name`, source.name, row.name);
      checkTextPair(errors, `topics ${row.id}.description`, source.description, row.description);
      checkTextPair(errors, `topics ${row.id}.assessmentPrompt`, source.assessmentPrompt, row.assessmentPrompt);
      if (!Array.isArray(row.evidence)) {
        errors.push(`topics ${row.id}: evidence is not an array`);
      } else if (row.evidence.length !== source.evidence.length) {
        errors.push(`topics ${row.id}: evidence has ${row.evidence.length} rows, source has ${source.evidence.length}`);
      } else {
        source.evidence.forEach((item, index) => {
          checkTextPair(errors, `topics ${row.id}.evidence[${index}]`, item, row.evidence[index]);
        });
      }
    }
    for (const source of topics.topics) {
      if (!seen.has(source.id)) errors.push(`topics: missing translation for ${source.id}`);
    }
  }

  // --- clusters --------------------------------------------------------------
  const clusterRows = pack?.clusters?.clusters;
  if (!Array.isArray(clusterRows)) {
    errors.push(`${locale}: clusters translation missing`);
  } else {
    check(pack.clusters.clusterCount === clusterRows.length, 'clusters: clusterCount does not match translation rows');
    const seen = new Set();
    const sourceByKey = new Map(clusters.clusters.map(cluster => [clusterKey(cluster), cluster]));
    for (const row of clusterRows) {
      const key = clusterKey(row);
      if (seen.has(key)) errors.push(`clusters: duplicate translation ${key}`);
      seen.add(key);
      const source = sourceByKey.get(key);
      if (!source) {
        errors.push(`clusters: translation for unknown cluster ${key}`);
        continue;
      }
      checkTextPair(errors, `clusters ${key}.summary`, source.summary, row.summary);
    }
    for (const source of clusters.clusters) {
      if (!seen.has(clusterKey(source))) errors.push(`clusters: missing translation for ${clusterKey(source)}`);
    }
  }

  // --- dependencies ----------------------------------------------------------
  const dependencyRows = pack?.dependencies?.dependencies;
  if (!Array.isArray(dependencyRows)) {
    errors.push(`${locale}: dependencies translation missing`);
  } else {
    check(pack.dependencies.edgeCount === dependencyRows.length, 'dependencies: edgeCount does not match translation rows');
    const seen = new Set();
    const sourceByKey = new Map(dependencies.dependencies.map(edge => [dependencyKey(edge), edge]));
    for (const row of dependencyRows) {
      const key = dependencyKey(row);
      if (seen.has(key)) errors.push(`dependencies: duplicate translation ${key}`);
      seen.add(key);
      const source = sourceByKey.get(key);
      if (!source) {
        errors.push(`dependencies: translation for unknown edge ${key}`);
        continue;
      }
      checkTextPair(errors, `dependencies ${key}.reason`, source.reason, row.reason);
    }
    for (const source of dependencies.dependencies) {
      if (!seen.has(dependencyKey(source))) errors.push(`dependencies: missing translation for ${dependencyKey(source)}`);
    }
  }

  // --- teaching research -----------------------------------------------------
  const researchRows = pack?.['teaching-research.json']?.records;
  if (!Array.isArray(researchRows)) {
    errors.push(`${locale}: teaching research translation missing`);
  } else {
    const seen = new Set();
    const sourceById = new Map(research.records.map(record => [record.topicId, record]));
    for (const row of researchRows) {
      if (seen.has(row.topicId)) errors.push(`research: duplicate translation ${row.topicId}`);
      seen.add(row.topicId);
      const source = sourceById.get(row.topicId);
      if (!source) {
        errors.push(`research: translation for unknown topic ${row.topicId}`);
        continue;
      }
      // The locale record keeps every identifier of the English record, so the
      // prose is compared through the shared projection and the identifiers
      // are compared one by one.
      const sourceText = projectResearchText(source);
      const translatedText = projectResearchText(row);
      checkTree(errors, `research ${row.topicId}.pedagogy`, sourceText.pedagogy, translatedText.pedagogy);
      checkTree(errors, `research ${row.topicId}.learn`, sourceText.learn, translatedText.learn);
      if (source.assess === null) {
        if (row.assess !== null) errors.push(`research ${row.topicId}.assess: source has no assessment`);
      } else {
        checkTree(errors, `research ${row.topicId}.assess`, sourceText.assess, translatedText.assess);
        check(row.assess.method === source.assess.method, `research ${row.topicId}: assessment method changed`);
        source.assess.errorPatterns.forEach((pattern, index) => {
          const translated = row.assess.errorPatterns?.[index];
          if (!translated) return;
          check(translated.kind === pattern.kind, `research ${row.topicId}: error kind changed`);
          check(translated.reteachPrerequisiteId === pattern.reteachPrerequisiteId, `research ${row.topicId}: reteach prerequisite changed`);
        });
      }
      source.sources.forEach((entry, index) => {
        const translated = row.sources?.[index];
        if (!translated) return;
        check(translated.source === entry.source, `research ${row.topicId}: source name changed`);
        check(translated.url === entry.url, `research ${row.topicId}: source url changed`);
        check(translated.verified === entry.verified, `research ${row.topicId}: source verification flag changed`);
      });
      check(row.confidence === source.confidence, `research ${row.topicId}: confidence changed`);
    }
    for (const source of research.records) {
      if (!seen.has(source.topicId)) errors.push(`research: missing translation for ${source.topicId}`);
    }
  }

  // --- labels ----------------------------------------------------------------
  if (!labels || typeof labels !== 'object') {
    errors.push(`${locale}: labels file missing`);
  } else {
    for (const field of ['subjects', 'domains', 'types']) {
      if (!labels[field] || typeof labels[field] !== 'object') {
        errors.push(`labels: ${field} missing`);
      }
    }
    const subjects = new Set(topics.topics.map(topic => topic.subject));
    for (const subject of subjects) {
      if (!labels.subjects?.[subject]) errors.push(`labels: no translation for subject ${subject}`);
    }
    const domains = new Set(topics.topics.map(topic => `${topic.subject} :: ${topic.domain}`));
    for (const domain of domains) {
      if (!labels.domains?.[domain]) errors.push(`labels: no translation for domain ${domain}`);
    }
    for (const type of ['CONCEPTUAL', 'PROCEDURAL', 'REPRESENTATIONAL', 'LANGUAGE', 'META']) {
      if (!labels.types?.[type]) errors.push(`labels: no translation for topic type ${type}`);
    }
    for (const [key, value] of Object.entries(labels.subjects ?? {})) {
      if (!hasCJK(value)) errors.push(`labels: subject ${key} is not translated`);
    }
    for (const [key, value] of Object.entries(labels.domains ?? {})) {
      if (!hasCJK(value)) errors.push(`labels: domain ${key} is not translated`);
    }
  }

  return errors;
}

/** Checksum and manifest wiring for a locale pack on disk. */
export function checkLocaleManifest(locale, { localeManifest, manifest, files }) {
  const errors = [];
  const check = (condition, message) => { if (!condition) errors.push(message); };
  if (!localeManifest) return [`${locale}: locale manifest missing`];
  check(localeManifest.locale === locale, 'locale manifest: locale mismatch');
  check(localeManifest.sourceTaxonomyVersion === manifest.taxonomyVersion, 'locale manifest: source taxonomy version mismatch');
  for (const [name, meta] of Object.entries(localeManifest.files ?? {})) {
    const actual = files[name];
    if (!actual) {
      errors.push(`locale manifest: ${name} is declared but missing`);
      continue;
    }
    check(actual.bytes === meta.bytes, `locale manifest: ${name} byte count mismatch`);
    check(actual.sha256 === meta.sha256, `locale manifest: ${name} checksum mismatch`);
    const declared = manifest.files?.[`i18n/${locale}/${name}`];
    check(declared?.sha256 === meta.sha256, `dataset manifest: i18n/${locale}/${name} checksum mismatch`);
  }
  const counts = manifest.i18n?.[locale]?.counts;
  check(counts?.topics === localeManifest.counts?.topics, 'dataset manifest: locale topic count mismatch');
  check(counts?.clusters === localeManifest.counts?.clusters, 'dataset manifest: locale cluster count mismatch');
  check(counts?.dependencies === localeManifest.counts?.dependencies, 'dataset manifest: locale dependency count mismatch');
  check(counts?.teachingResearch === localeManifest.counts?.teachingResearch, 'dataset manifest: locale research count mismatch');
  return errors;
}

/** Load every locale pack found under data/i18n/ and check it. */
export function checkAllLocales(root) {
  const errors = [];
  const localeRoot = resolve(root, 'data', 'i18n');
  if (!existsSync(localeRoot)) return errors;
  const load = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
  const topics = load('data/topics.json');
  const clusters = load('data/clusters.json');
  const dependencies = load('data/dependencies.json');
  const research = load('data/teaching-research.json');
  const manifest = load('data/manifest.json');
  for (const locale of readdirSync(localeRoot).sort()) {
    const directory = resolve(localeRoot, locale);
    if (!existsSync(resolve(directory, 'topics.json'))) continue;
    const pack = {
      topics: load(`data/i18n/${locale}/topics.json`),
      clusters: load(`data/i18n/${locale}/clusters.json`),
      dependencies: load(`data/i18n/${locale}/dependencies.json`),
      'teaching-research.json': load(`data/i18n/${locale}/teaching-research.json`),
    };
    const labels = existsSync(resolve(directory, 'labels.json'))
      ? load(`data/i18n/${locale}/labels.json`)
      : null;
    errors.push(...checkLocalePack(locale, pack, { topics, clusters, dependencies, research, labels }));
    const localeManifestPath = resolve(directory, 'manifest.json');
    if (!existsSync(localeManifestPath)) {
      errors.push(`${locale}: locale manifest missing`);
      continue;
    }
    const localeManifest = JSON.parse(readFileSync(localeManifestPath, 'utf8'));
    const files = {};
    for (const name of Object.keys(localeManifest.files ?? {})) {
      const path = resolve(directory, name);
      if (!existsSync(path)) continue;
      const bytes = readFileSync(path);
      files[name] = { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
    }
    errors.push(...checkLocaleManifest(locale, { localeManifest, manifest, files }));
  }
  return errors;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const errors = checkAllLocales(root);
  if (errors.length) {
    console.error(`✗ ${errors.length} i18n problem(s):`);
    for (const error of errors.slice(0, 50)) console.error(`  - ${error}`);
    if (errors.length > 50) console.error(`  …and ${errors.length - 50} more`);
    process.exit(1);
  }
  console.log('✓ i18n — every locale pack is complete, structurally faithful and translated.');
}
