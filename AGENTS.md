# Working on os-taxonomy

This repository contains a shared primary/elementary taxonomy. Reviewed Git
content defines public taxonomy changes; downstream application publication is
a separate maintenance operation. Do not use a DB export or an agent's private
graph to overwrite accepted content.

For curriculum ingestion, alignment, topic curation or coverage review, use
[taxonomy-curation](.agents/skills/taxonomy-curation/SKILL.md). Other agents can
read that file directly. Its shared [curation principles](docs/curation/principles.md)
also apply to manual contributions. Using an agent or skill is optional for contributors.

- Keep current work within primary-school scope, through age 12. Broader historical
  catalogue entries are not instructions to extend the current authoring scope.
- Preserve stable topic IDs and unaffected scoped alignments. One topic represents
  one mastery claim; country, grade and medium alone do not justify duplicates.
- Follow [PROVENANCE.md](PROVENANCE.md). Keep restricted wording, private audits,
  learner data and credentials out of files, commits and PRs.
- Author scoped associations in `data/curriculum-alignments.json`; flat topic
  standards and ages are generated compatibility fields.
- After data changes, run `npm run alignments:generate`, `npm run validate`,
  `npm run alignments:generated-check` and `npm test`. Inspect the generated diff.
  For documentation-only changes, check links and any skill metadata; do not
  regenerate unchanged data.
- Submit the actual change in an ordinary PR. Repository review accepts the
  semantics; consumers handle deployment and private-state compatibility.
- Prefer a PR targeting the repository's default branch. For a dependent stack,
  retarget and reconcile the next PR against the default branch after its base
  reaches that branch. An intentional feature-integration stack needs an explicit
  final PR to the default branch. Verify accepted contents before reporting completion;
  a PR merged into a feature branch has not reached the default branch, and
  squash merges can change commit identities.

## Localisation

A locale pack under `data/i18n/<locale>/` holds translated prose beside the
stable ids of the English dataset. The English files stay the source of truth:
never translate a curriculum standard, never change an id, a curriculum code or
an enum inside a locale file, and never let a locale file replace the English
one. Use the published glossary in `docs/i18n/` for terminology.

After changing `data/topics.json`, `data/clusters.json`,
`data/dependencies.json` or `data/teaching-research.json`, run
`npm run i18n:check`: a locale pack that no longer matches the English source
fails `npm run validate`. See [docs/i18n.md](docs/i18n.md).

