---
title: Measure a generated lookup table by holding data out, not by checking it covers its training set
date: 2026-08-23
category: best-practices
module: scripts
problem_type: best_practice
component: tooling
applies_when:
  - A build step derives a lookup table, model, or mapping from captured samples
  - The table will meet inputs at runtime that were not in the sample
  - There is a fallback path, so a gap degrades quietly rather than failing
tags: [generated-code, coverage, holdout, fixtures, validation, teletext]
---

# Measure a generated lookup table by holding data out, not by checking it covers its training set

## Context

The app renders teletext pages as text by looking each character cell's bitmap up in a table generated from captured pages. A bitmap the table does not hold falls back to showing that cell as a slice of the original picture.

The obvious check — regenerate the table and confirm every glyph in the fixtures resolves — passed completely: zero unresolved cells across every captured sub-page. That number is worthless. The table was built from those same pages, so it is guaranteed to cover them. It measures nothing about the pages the app will actually meet.

## Guidance

**Hold a sample out, rebuild without it, and measure against it.** Rebuild the table from every sample except one, then count how much of the held-out sample has no entry. Repeat per sample and pool the result. That is the only number that estimates behaviour on unseen input.

Doing this here changed the decision. Trained on the five original fixtures:

| held out | cells with no entry |
|---|---|
| front page | **24.3%** |
| one other page | 9.4% |
| pooled | 4.9% |

A quarter of the most-visited page would have rendered as blocky fallback beside sharp text. The self-coverage check reported perfection for the same table.

**Then use the measurement to size the sample.** The fix was not architectural, it was more data: capturing fifty-odd pages took the pooled held-out rate to **0.14%**, worst single page 3.2%. The same measurement that condemned the table is what showed the remedy was sufficient and where it saturates — the glyph inventory turned out to be small and nearly exhausted, which is itself only knowable by watching the held-out rate flatten.

**Keep the generated artifact honest about its inputs.** A generated file that nobody regenerates goes stale silently. A check that rebuilds it and fails on any difference from the committed copy runs in CI, so a changed sample or a changed algorithm cannot drift away from the artifact it produced.

## Why This Matters

A fallback path makes this failure mode invisible. Every page still rendered, still readable, just partly as pictures — so nothing failed, no test went red, and the only signal was aesthetic. Any generated mapping with a graceful degradation has the same shape: the quality of the artifact is unobservable from the outside, and self-coverage will always report success.

The general form: **a check that cannot fail is not a check.** If regenerating from a sample and testing against that sample is the whole validation, it confirms the generator is deterministic and nothing else.

## Related Issues

- The same work carried a second failure that only a real machine exposed: reading pixels back from a canvas returns them colour-managed, so exact comparison stopped meaning identity. Both failures shared a shape — a passing suite that structurally could not observe the thing that was broken.
