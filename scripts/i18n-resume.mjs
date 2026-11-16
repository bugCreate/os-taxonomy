#!/usr/bin/env node
/**
 * i18n-resume.mjs — report the translation work that is still outstanding.
 *
 * The translation is a long, resumable job: shards are translated
 * independently and written to `work/i18n/out/`. This script prints the shard
 * ids that still need work, so an interrupted run can pick up where it
 * stopped instead of starting over.
 *
 *   node scripts/i18n-resume.mjs zh-Hans          # human-readable summary
 *   node scripts/i18n-resume.mjs zh-Hans --json   # {"skip": [...], "todo": [...]}
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyShard } from './i18n-verify-shard.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const load = path => JSON.parse(readFileSync(resolve(ROOT, path), 'utf8'));

const locale = process.argv[2] ?? 'zh-Hans';
const plan = load('work/i18n/plan.json');
const outputDirectory = resolve(ROOT, 'work/i18n/out');

const done = [];
const todo = [];
const broken = [];
for (const shard of plan.shards) {
  const path = resolve(outputDirectory, `${shard.shardId}.json`);
  if (!existsSync(path)) {
    todo.push(shard.shardId);
    continue;
  }
  let translation;
  try {
    translation = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    broken.push(shard.shardId);
    continue;
  }
  const errors = verifyShard(shard.shardId, { source: load(shard.input), translation, kind: shard.kind });
  if (errors.length) broken.push(shard.shardId);
  else done.push(shard.shardId);
}

const summary = { locale, total: plan.shards.length, done: done.length, todo: todo.length, broken: broken.length };
if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ ...summary, skip: done, todo, broken }));
} else {
  console.log(`${locale}: ${summary.done}/${summary.total} shards verified, ${summary.todo} missing, ${summary.broken} broken`);
  if (broken.length) console.log(`broken: ${broken.join(', ')}`);
}
