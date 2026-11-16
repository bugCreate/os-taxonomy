#!/usr/bin/env node
/**
 * i18n-shards.mjs — split the English dataset into translation shards.
 *
 * Each shard is a self-contained JSON file holding the English source rows a
 * translator needs, plus a stable shard id. Translators write the matching
 * file under `work/i18n/out/`; the merge step joins them back into the locale
 * pack. Shards are deterministic: the same input always produces the same
 * plan, so a run can be resumed by regenerating the plan and skipping the
 * shards whose output already exists.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  projectClusterText,
  projectDependencyText,
  projectResearchText,
  projectTopicText,
} from './i18n-lib.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DATA = resolve(ROOT, 'data');
const WORK = resolve(ROOT, 'work', 'i18n');

// Source budget per shard, in English characters. Sized so one shard stays
// inside a single translator's comfortable output window.
export const BUDGET = {
  topics: 45000,
  clusters: 30000,
  dependencies: 40000,
  research: 55000,
};

const load = name => JSON.parse(readFileSync(resolve(DATA, name), 'utf8'));

/** Greedily group rows into shards of at most `size` source characters. */
export function packRows(items, size) {
  const groups = [];
  let current = [];
  let length = 0;
  for (const item of items) {
    const sizeOf = JSON.stringify(item).length;
    if (current.length && length + sizeOf > size) {
      groups.push(current);
      current = [];
      length = 0;
    }
    current.push(item);
    length += sizeOf;
  }
  if (current.length) groups.push(current);
  return groups;
}

/** Build the shard plan for one locale from the English dataset. */
export function buildShards({ topics, clusters, dependencies, research }) {
  const kinds = [
    ['topics', topics.topics.map(projectTopicText)],
    ['clusters', clusters.clusters.map(projectClusterText)],
    ['dependencies', dependencies.dependencies.map(projectDependencyText)],
    ['research', research.records.map(projectResearchText)],
  ];
  const shards = [];
  for (const [kind, items] of kinds) {
    packRows(items, BUDGET[kind]).forEach((rows, index) => {
      const shardId = `${kind}-${String(index + 1).padStart(3, '0')}`;
      shards.push({
        shardId,
        kind,
        count: rows.length,
        sourceChars: rows.reduce((n, row) => n + JSON.stringify(row).length, 0),
        input: `work/i18n/shards/${shardId}.json`,
        output: `work/i18n/out/${shardId}.json`,
        rows,
      });
    });
  }
  return shards;
}

/** Write the shard sources and the plan file. */
export function writeShards(shards, locale) {
  mkdirSync(resolve(WORK, 'shards'), { recursive: true });
  mkdirSync(resolve(WORK, 'out'), { recursive: true });
  const plan = {
    locale,
    shards: shards.map(({ rows, ...meta }) => meta),
  };
  for (const shard of shards) {
    writeFileSync(resolve(ROOT, shard.input), `${JSON.stringify(shard.rows, null, 2)}\n`);
  }
  writeFileSync(resolve(WORK, 'plan.json'), `${JSON.stringify(plan, null, 2)}\n`);
  return plan;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const locale = process.argv[2] ?? 'zh-Hans';
  const shards = buildShards({
    topics: load('topics.json'),
    clusters: load('clusters.json'),
    dependencies: load('dependencies.json'),
    research: load('teaching-research.json'),
  });
  const plan = writeShards(shards, locale);
  const totals = {};
  for (const shard of plan.shards) {
    const entry = totals[shard.kind] ?? { shards: 0, rows: 0, chars: 0 };
    entry.shards += 1;
    entry.rows += shard.count;
    entry.chars += shard.sourceChars;
    totals[shard.kind] = entry;
  }
  console.log(JSON.stringify({ locale, shardCount: plan.shards.length, totals }, null, 2));
}
