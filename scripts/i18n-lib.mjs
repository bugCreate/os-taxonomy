// Shared helpers for the parallel locale packs.
//
// A locale pack never rewrites the English data files. It stores translated
// text beside the stable identifiers that the graph is built from, so a
// consumer joins the two by id and can fall back to English per field.
//
// Translation targets are derived from the English source, never authored
// twice: `projectResearchText` keeps only the translatable prose, and
// `restoreResearchRecord` re-attaches every identifier and enum from the
// English record so a locale file can never invent a method, a curriculum
// code or a prerequisite id.

export const LOCALE_ROOT = 'i18n';

export const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;

/** Fields that carry an identifier or an enum, never prose. A translation must
 *  reproduce them exactly; they are not translated and they are not checked
 *  for Chinese characters. */
export const IDENTIFIER_KEYS = new Set([
  'id',
  'topicId',
  'prerequisiteId',
  'subject',
  'domain',
  'ageRangeStart',
  'method',
  'kind',
  'reteachPrerequisiteId',
  'url',
  'source',
  'verified',
  'confidence',
  'schemaVersion',
]);

/** Curriculum and source codes that must survive translation verbatim.
 *  A token qualifies when it mixes letters and digits (4-PS4-1, AC9TDE2P04,
 *  ON-MATH-2020-G1-C3.1) — plain words never qualify, so the check stays
 *  specific to the codes and levels the English text cites. */
const CODE = /\b(?=[A-Za-z0-9-]*[A-Za-z])(?=[A-Za-z0-9-]*\d)[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*\b/g;
const ORDINAL = /^\d+(?:st|nd|rd|th)$/i;

/** Is this token a curriculum code, or prose that merely contains a number?
 *
 *  Codes are shaped like codes: they start with a digit (2-PS1-1, 3D), carry
 *  an upper-case run (AC9TDE2P04, KS1) or start with a short letter run
 *  (Ma6, P2, H2O). Prose that only looks code-ish is translated like prose:
 *  "5-minute", "Grade-5", "Within-20", "PreK-12", "Tier-2". */
export function isCodeToken(token) {
  if (!/[A-Z]/.test(token)) return false;
  // A tier label (Tier-2) is a level name the glossary translates.
  if (/^tier-\d/i.test(token)) return false;
  if (/^[0-9]/.test(token)) return true;
  if (/[A-Z]{2,}/.test(token)) return true;
  const lead = (token.match(/^[A-Za-z]+/) ?? [''])[0];
  return lead.length <= 3;
}

/** The codes a translation has to preserve. */
export function codeTokens(text) {
  if (typeof text !== 'string') return [];
  const tokens = new Set();
  for (const match of text.matchAll(CODE)) {
    const token = match[0];
    if (ORDINAL.test(token)) continue;
    if ((token.match(/[A-Za-z]/g) ?? []).length < 2) continue;
    if (!isCodeToken(token)) continue;
    tokens.add(token);
  }
  return [...tokens];
}

/** The marker the English source uses when a curriculum wording is not
 *  reproduced. The glossary keeps it verbatim, so it survives translation. */
export const OMITTED_MARKER = /\[curriculum wording omitted; reference [^\]]+\]/;

/** A string that is nothing but standards labels, codes and omitted-wording
 *  markers ("NGSS 2-PS1-1 '[curriculum wording omitted; reference 2-PS1-1]'")
 *  has no prose to translate. Such a string is copied as it stands, so it
 *  cannot be required to contain Chinese characters. */
export function isMarkerOnly(text) {
  if (typeof text !== 'string') return false;
  if (!OMITTED_MARKER.test(text)) return false;
  const rest = text.replace(new RegExp(OMITTED_MARKER, 'g'), ' ');
  // Any run of lower-case letters is prose that must be translated.
  if (/[a-z]{3,}/.test(rest)) return false;
  return true;
}

export function hasCJK(text) {
  return typeof text === 'string' && CJK.test(text);
}

/** Chinese typography: a straight double quote that quotes Chinese text
 *  becomes a full-width “ or ”. A straight quote inside a code sample
 *  (`print("hello")`) or inside an English marker such as
 *  `"[curriculum wording omitted; reference 4-PS4-1]"` is left alone, so the
 *  normaliser never corrupts code or a preserved marker. */
export function normalizeChineseQuotes(text) {
  if (typeof text !== 'string' || !text.includes('"')) return text;
  const characters = [...text];
  const isCJK = character => Boolean(character) && CJK.test(character);
  const neighbour = (index, step) => {
    for (let i = index + step; i >= 0 && i < characters.length; i += step) {
      if (characters[i] !== ' ' && characters[i] !== '\n') return characters[i];
    }
    return '';
  };
  let opening = true;
  for (let index = 0; index < characters.length; index++) {
    if (characters[index] !== '"') continue;
    if (!isCJK(neighbour(index, -1)) && !isCJK(neighbour(index, 1))) continue;
    characters[index] = opening ? '“' : '”';
    opening = !opening;
  }
  return characters.join('');
}

/** Apply the quote normaliser to every translatable string in a tree. */
export function normalizeQuotesDeep(value, key = '') {
  if (typeof value === 'string') {
    return IDENTIFIER_KEYS.has(key) ? value : normalizeChineseQuotes(value);
  }
  if (Array.isArray(value)) return value.map(item => normalizeQuotesDeep(item, key));
  if (value && typeof value === 'object') {
    const output = {};
    for (const [childKey, child] of Object.entries(value)) output[childKey] = normalizeQuotesDeep(child, childKey);
    return output;
  }
  return value;
}

/** Stable key for a cluster row: subject + domain + age band. */
export function clusterKey(row) {
  return JSON.stringify([row.subject, row.domain, row.ageRangeStart]);
}

/** Stable key for a dependency edge. */
export function dependencyKey(row) {
  return JSON.stringify([row.topicId, row.prerequisiteId]);
}

/** The translatable projection of one research record.
 *  Identifiers, enums, URLs and provenance are deliberately excluded: the
 *  merge step restores them from the English record. */
export function projectResearchText(record) {
  const assess = record.assess;
  return {
    topicId: record.topicId,
    pedagogy: {
      summary: record.pedagogy.summary,
      bestPractices: [...record.pedagogy.bestPractices],
      keyRepresentations: [...record.pedagogy.keyRepresentations],
      commonMisconceptions: [...record.pedagogy.commonMisconceptions],
    },
    learn: {
      summary: record.learn.summary,
      activities: record.learn.activities.map(activity => ({
        title: activity.title,
        learnerActions: [...activity.learnerActions],
        intendedInsight: activity.intendedInsight,
        feedback: [...activity.feedback],
        rationale: activity.rationale,
      })),
      constraints: [...record.learn.constraints],
      reviewNotes: [...record.learn.reviewNotes],
    },
    assess: assess === null ? null : {
      diagnosticPrompt: assess.diagnosticPrompt,
      correctAnswer: assess.correctAnswer,
      whatMakesItDiscriminate: assess.whatMakesItDiscriminate,
      errorPatterns: assess.errorPatterns.map(pattern => ({
        pattern: pattern.pattern,
        revealedBy: pattern.revealedBy,
        nextMove: pattern.nextMove,
        distractor: pattern.distractor,
      })),
      probeDeeper: [...assess.probeDeeper],
      responseLevels: { ...assess.responseLevels },
      poeTask: assess.poeTask,
    },
    sources: record.sources.map(source => ({ claim: source.claim })),
  };
}

/** Rebuild a full research record from the English source and its translation.
 *  `sourceClaims` are not translated twice: each English claim string is
 *  matched back to the source it quotes, and the translated claim is reused,
 *  so the two lists cannot drift apart. */
export function restoreResearchRecord(source, translation) {
  const claimIndex = new Map();
  source.sources.forEach((entry, index) => {
    if (!claimIndex.has(entry.claim)) claimIndex.set(entry.claim, index);
  });
  const translatedClaims = translation.sources.map(entry => entry.claim);
  const claimOf = english => {
    const index = claimIndex.get(english);
    if (index === undefined) throw new Error(`research ${source.topicId}: unmapped source claim`);
    return translatedClaims[index];
  };
  return {
    topicId: source.topicId,
    pedagogy: {
      summary: translation.pedagogy.summary,
      bestPractices: [...translation.pedagogy.bestPractices],
      keyRepresentations: [...translation.pedagogy.keyRepresentations],
      commonMisconceptions: [...translation.pedagogy.commonMisconceptions],
    },
    learn: {
      schemaVersion: source.learn.schemaVersion,
      summary: translation.learn.summary,
      activities: source.learn.activities.map((activity, index) => ({
        title: translation.learn.activities[index].title,
        learnerActions: [...translation.learn.activities[index].learnerActions],
        intendedInsight: translation.learn.activities[index].intendedInsight,
        feedback: [...translation.learn.activities[index].feedback],
        rationale: translation.learn.activities[index].rationale,
        sourceClaims: activity.sourceClaims.map(claimOf),
      })),
      constraints: [...translation.learn.constraints],
      reviewNotes: [...translation.learn.reviewNotes],
    },
    assess: source.assess === null ? null : {
      method: source.assess.method,
      diagnosticPrompt: translation.assess.diagnosticPrompt,
      correctAnswer: translation.assess.correctAnswer,
      whatMakesItDiscriminate: translation.assess.whatMakesItDiscriminate,
      errorPatterns: source.assess.errorPatterns.map((pattern, index) => ({
        pattern: translation.assess.errorPatterns[index].pattern,
        kind: pattern.kind,
        revealedBy: translation.assess.errorPatterns[index].revealedBy,
        nextMove: translation.assess.errorPatterns[index].nextMove,
        distractor: translation.assess.errorPatterns[index].distractor,
        reteachPrerequisiteId: pattern.reteachPrerequisiteId,
      })),
      probeDeeper: [...translation.assess.probeDeeper],
      responseLevels: { ...translation.assess.responseLevels },
      poeTask: translation.assess.poeTask,
    },
    sources: source.sources.map((entry, index) => ({
      claim: translatedClaims[index],
      source: entry.source,
      url: entry.url,
      verified: entry.verified,
    })),
    confidence: source.confidence,
    provenance: { ...source.provenance },
    publicationNotes: { ...source.publicationNotes },
  };
}

/** The translatable projection of one topic. */
export function projectTopicText(topic) {
  return {
    id: topic.id,
    name: topic.name,
    description: topic.description,
    evidence: [...topic.evidence],
    assessmentPrompt: topic.assessmentPrompt,
  };
}

/** The translatable projection of one cluster. */
export function projectClusterText(cluster) {
  return {
    subject: cluster.subject,
    domain: cluster.domain,
    ageRangeStart: cluster.ageRangeStart,
    summary: cluster.summary,
  };
}

/** The translatable projection of one dependency edge. */
export function projectDependencyText(edge) {
  return {
    topicId: edge.topicId,
    prerequisiteId: edge.prerequisiteId,
    reason: edge.reason,
  };
}

/** Walk a text tree and yield every [english, chinese] string pair.
 *  Used by the structure check to compare the two trees field by field.
 *  Identifier and enum fields are marked so the caller can require them to be
 *  identical instead of translated. */
export function textPairs(source, translation, path = '$') {
  const pairs = [];
  const walk = (left, right, current, identifier = false) => {
    if (typeof left === 'string') {
      pairs.push({ path: current, english: left, chinese: right, identifier });
      return;
    }
    if (Array.isArray(left)) {
      if (!Array.isArray(right) || right.length !== left.length) {
        pairs.push({ path: current, english: left, chinese: right, shapeError: true });
        return;
      }
      left.forEach((item, index) => walk(item, right[index], `${current}[${index}]`));
      return;
    }
    if (left && typeof left === 'object') {
      for (const key of Object.keys(left)) {
        if (!(key in (right ?? {}))) {
          pairs.push({ path: `${current}.${key}`, english: left[key], chinese: undefined, shapeError: true });
          continue;
        }
        walk(left[key], right[key], `${current}.${key}`, IDENTIFIER_KEYS.has(key));
      }
      return;
    }
    pairs.push({ path: current, english: left, chinese: right, identifier });
  };
  walk(source, translation, path);
  return pairs;
}
