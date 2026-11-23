#!/usr/bin/env node
/**
 * i18n-verify-shard.mjs — check one translated shard against its source.
 *
 * Translators run this before they report a shard as done, and the merge
 * step uses the same rules. It compares the two files row by row: same rows,
 * same order, same identifiers, same array lengths, Chinese text in every
 * string, and every curriculum code preserved.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IDENTIFIER_KEYS, codeTokens, hasCJK, hasNoProse } from './i18n-lib.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const load = path => JSON.parse(readFileSync(resolve(ROOT, path), 'utf8'));

/** Compare one source row with its translation, field by field. */
export function verifyRow(source, translation, path, errors) {
  if (typeof source === 'string') {
    if (typeof translation !== 'string') {
      errors.push(`${path}: translation is not a string`);
      return;
    }
    if (!translation.trim()) {
      errors.push(`${path}: empty translation`);
      return;
    }
    if (!hasCJK(translation) && !hasNoProse(source)) {
      errors.push(`${path}: no Chinese characters`);
      return;
    }
    for (const token of codeTokens(source)) {
      if (!translation.includes(token)) errors.push(`${path}: lost code ${token}`);
    }
    const before = (source.match(/\{\{\s*name\s*\}\}/g) ?? []).length;
    const after = (translation.match(/\{\{\s*name\s*\}\}/g) ?? []).length;
    if (before !== after) errors.push(`${path}: {{name}} placeholder count changed`);
    if (source.length >= 20 && (translation.length < source.length * 0.12 || translation.length > source.length * 4)) {
      errors.push(`${path}: length ${translation.length} is out of range for ${source.length}`);
    }
    return;
  }
  if (Array.isArray(source)) {
    if (!Array.isArray(translation)) {
      errors.push(`${path}: translation is not an array`);
      return;
    }
    if (translation.length !== source.length) {
      errors.push(`${path}: ${translation.length} rows, source has ${source.length}`);
      return;
    }
    source.forEach((item, index) => verifyRow(item, translation[index], `${path}[${index}]`, errors));
    return;
  }
  if (source && typeof source === 'object') {
    if (!translation || typeof translation !== 'object' || Array.isArray(translation)) {
      errors.push(`${path}: translation is not an object`);
      return;
    }
    const sourceKeys = Object.keys(source);
    const translationKeys = Object.keys(translation);
    if (sourceKeys.join(',') !== translationKeys.join(',')) {
      errors.push(`${path}: keys differ from the source (${sourceKeys.join(',')} vs ${translationKeys.join(',')})`);
      return;
    }
    for (const key of sourceKeys) {
      // Identifiers and enums are reproduced, never translated.
      if (IDENTIFIER_KEYS.has(key)) {
        if (source[key] !== translation[key]) {
          errors.push(`${path}.${key}: identifier changed (${JSON.stringify(source[key])} → ${JSON.stringify(translation[key])})`);
        }
        continue;
      }
      verifyRow(source[key], translation[key], `${path}.${key}`, errors);
    }
    return;
  }
  if (source !== translation) errors.push(`${path}: value changed`);
}

/** Verify a shard's translation file against the shard source. */
export function verifyShard(shardId, { source, translation, kind }) {
  const errors = [];
  if (!Array.isArray(translation)) {
    errors.push(`${shardId}: output is not a JSON array`);
    return errors;
  }
  if (translation.length !== source.length) {
    errors.push(`${shardId}: ${translation.length} rows, source has ${source.length}`);
    return errors;
  }
  const key = kind === 'topics' ? 'id' : kind === 'research' ? 'topicId'
    : kind === 'clusters' ? 'subject' : 'topicId';
  source.forEach((row, index) => {
    const translated = translation[index];
    if (!translated || typeof translated !== 'object') {
      errors.push(`${shardId}[${index}]: missing row`);
      return;
    }
    if (translated[key] !== row[key]) {
      errors.push(`${shardId}[${index}]: identifier changed (${row[key]} → ${translated[key]})`);
    }
    verifyRow(row, translated, `${shardId}[${index}]`, errors);
  });
  return errors;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = process.argv[2];
  if (!target) {
    console.error('usage: node scripts/i18n-verify-shard.mjs <shardId> | --all');
    process.exit(2);
  }
  const plan = load('work/i18n/plan.json');
  const shards = target === '--all' ? plan.shards : plan.shards.filter(entry => entry.shardId === target);
  if (!shards.length) {
    console.error(`unknown shard ${target}`);
    process.exit(2);
  }
  const failures = [];
  let verified = 0;
  for (const shard of shards) {
    let translation;
    try {
      translation = load(shard.output);
    } catch (error) {
      failures.push({ id: shard.shardId, errors: [`output file is missing or not valid JSON — ${error.message}`] });
      continue;
    }
    const errors = verifyShard(shard.shardId, { source: load(shard.input), translation, kind: shard.kind });
    if (errors.length) failures.push({ id: shard.shardId, errors });
    else verified += 1;
  }
  for (const failure of failures) {
    console.error(`✗ ${failure.id}: ${failure.errors.length} problem(s):`);
    for (const error of failure.errors.slice(0, 8)) console.error(`  - ${error}`);
    if (failure.errors.length > 8) console.error(`  …and ${failure.errors.length - 8} more`);
  }
  console.log(`✓ ${verified}/${shards.length} shards verified, ${failures.length} failed`);
  if (failures.length) process.exit(1);
}
