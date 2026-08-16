# Progress Tracking Rules (`PROGRESS.md`)

This repo's root has a `PROGRESS.md` that a separate dashboard tool (ProgressMap) renders as a mind map. It is the single source of truth for progress — never cache a copy elsewhere, always read it fresh. This applies to any agent working in this repo (Claude Code, Codex, or others), not just one specific tool.

Read this file when starting or finishing a unit of work in this repo. It is not loaded automatically — `AGENTS.md` only points here.

## Format — nested list, arbitrary depth

```markdown
---
updated: 2026-08-15
---

## 金流 [進行中]
- LINE Pay 付款 [進行中]
  > 處理團購訂單付款：預授權、截止結算、修改訂單重新授權、退款。
  - Backend 端 [完成]
    > 已核准分離式請款；曾用 ECPay 當備援，核准後降為次要角色。
```

- `##` = top-level module, `-` = nested item (2-space indent per level, depth unlimited).
- Each line may carry `[status]` (one of exactly: `完成`／`進行中`／`待處理`／`暫緩`), `(date)`, `— note` — all optional.
- An item's own line may be followed by an indented `> ` line for a longer explanation (multiple `>` lines join into one paragraph).
  - `>` 說明 = what the item **is / does** — stable, usually written once.
  - `— note` (or the item's own line) = current progress, blockers, evidence — updates as work proceeds.
- Parent nodes' completion is computed from descendant leaf status, not from the parent's own `[status]` tag.

## Granularity

One item = one sentence, independently verifiable, roughly PR-sized. Depth has no fixed target — judge each level on its own: can't state what was verified → split further; children are inseparable, none individually "done" → merge. Don't split just to reach a depth.

## Naming

Noun/capability-based, no verb prefixes ("add", "implement"). Reuse the project's own vocabulary for module names.

## Marking `[完成]` — evidence tiers

1. Automated tests passed
2. Manual smoke-test script run
3. Manual operation with observed results recorded
4. Static/type-check only — **do not mark complete**; use `[進行中]` and note what's missing in the note field

Required rigor scales with the item's risk/importance, not a fixed bar for every item — payment, auth, or database-migration items warrant tier 1; small UI/copy items are fine at tier 2 or 3. Don't write automated tests just to satisfy this rule for a low-risk change.

## Writing habits

For small edits, patch the relevant lines with `Edit` rather than rewriting the whole file — cost should scale with the change, not the file size. Only use a full rewrite for genuine large-scale re-categorization.

## No `PROGRESS.md` yet

- New project: build a skeleton from README/code structure/existing docs, mark everything `進行中` or `待處理`.
- Already-in-progress project without one: build the skeleton first, then cross-check against existing records (`git log`, test results) to promote genuinely-verified items to `完成`; leave unsupported items at `進行中`.
