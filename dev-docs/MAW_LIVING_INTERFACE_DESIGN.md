# MAW Living Interface — design wave (2026-10-03)

Mission: evolve MAW's visuals, text presentation, and input experience into something
strikingly original, extremely responsive, and supportive of long AI coding missions.
Speed is a primary design constraint. This document records the competing directions,
the Lab evidence that shaped them, and the winning synthesis actually implemented.

Routing decision for the Lab-side execution record: `rd_1791084781842_9c833600`.

## Real Lab systems that participated

- `labctl route-task` — named the execution gates (workspace-check, validation runner) and
  honest finalization route (`labctl finish`). Its "client repo edits" caution is recorded
  as tension: Cody's mission explicitly authorizes MAW (client repo) edits.
- `labctl challenge` (Capability Challenge Engine) — PASS, proposed "run visual proof
  capture & diff tests on cockpit" (score 0.713). Contribution: visual *proof* over visual
  claims — adopted as the snapshot/frame-assertion discipline below, not the literal cockpit
  target (that surface is Lab-internal, not MAW).
- `labctl four-mind` (Four-Mind OS) — Cyber Cody creative frontier supplied the
  CONSTRAINT_INVERSION method ("locate one replaceable implementation assumption, then test
  its inversion while holding protected requirements constant"). Applied below. Symbiote
  reported `proof_hunger` (sev 0.8) — hence the before/after benchmark discipline. Melon
  supplied the critique lens (structural health / crystallization / decision confidence /
  focus). Brain reported style_coherence_weight 0.12 — style must obey coherence.
- `labctl cockpit-command-glass` (Command Glass style DNA) — the Lab's own interface
  vocabulary: each surface carries a *named motion/energy motif* (SOFT_PULSE, METALLIC_SNAP,
  ERRATIC_TWITCH, STEADY_THROB...) plus a state word and one terse flavor line. Energy is
  named and state-bound, never decorative. Adopted as the activity-motif principle.
- `labctl candidate-compare` — anchored the mission as DIRECT_INTENT (composite 1.0,
  Director Strategic Authority) against the Lab candidate store. It is an anti-tunneling
  instrument, not a design critic; it did not rank the visual directions.
- Research vault (`labctl research-status`, 132 notes, DIGESTION HEALTHY):
  - `VAULT_DIGEST_003_BIO_AI_DESIGN.md` — biological computation patterns (Physarum
    reinforcement, mycelial diversity, hive consolidation) and the governing design
    principle: **a creature's form emerges from evidence, not declaration**. Every visual
    state in the winning design must be caused by real system state.
  - `TRUE_SCHOLAR_UI_BLINDNESS_005.md` — deterministic UI feedback: geometric assertions
    (AABB/clipping) and WCAG relative-luminance contrast math turn visual quality into
    checkable claims. Adopted as contrast math in tests rather than "looks fine".

## Baseline measurements (before any change)

Harness: `tmp/bench/markdownStream.bench.tsx` (gitignored), ink-testing-library renders of
`MarkdownDisplay`, 100-col terminal. Numbers are wall-clock of `render`/`rerender`
including harness overhead; they are comparative evidence, not absolute CLI latency.

| scenario | mean | p95 | max | total |
|---|---|---|---|---|
| full render, 3.3KB doc | 35.7ms | 55.9 | 55.9 | 178ms (5 runs) |
| full render, 30KB doc | 258ms | 290 | 290 | 1.29s (5 runs) |
| streaming, 150 chunk appends from 3.3KB→18KB | 39.5ms | 66.6 | 134 | 5.93s |
| streaming, 150 chunk appends from 30KB→45KB | 195ms | 262 | 332 | 29.3s |

Finding: streaming re-render cost grows linearly with the whole document (≈35ms at 3KB →
≈195ms at 30KB per appended chunk). During a long response, every token arrival costs a
full reparse of the entire message — this is the dominant UI stall and the primary
target. Cause: `MarkdownDisplay` reparses all lines into fresh React nodes per render and
rebuilds regexes per line/render.

## Three competing creative directions

### D1 — IRON LEDGER (severity-first structured panels)
Every transcript element becomes a ledger row with a hard left spine, fixed status column,
and ruled title bars (`─ agent · model ───`). Errors invert. Idle = zero motion. Manga
panel-gutter influence: heavy rules, hard cuts between states.
Strengths: instant severity scanning; strong silhouette; deterministic.
Critique (Melon lens): fails *focus* — chrome rows waste narrow terminals, box re-render
cost competes with the speed constraint, and ASCII fallback loses the identity. Risks the
"generic dashboard" failure mode the mission forbids.

### D2 — MYCELIAL BREATH (adaptive organism)
The interface breathes with work: dense during tool bursts, expansive during reading;
named motion motifs (SOFT_PULSE = streaming, METALLIC_SNAP = completed tool, ERRATIC_TWITCH
= failure) animate only on real state transitions; "growth rings" thicken the response rail
as a turn accumulates; frequently used commands strengthen in suggestions (Physarum).
Strengths: genuinely alive, state-driven, memorable; uses the Lab's own style DNA.
Critique: time-driven motion violates the flicker/perf constraints; adaptive density causes
surprising layout shifts mid-read; high complexity → hard to validate deterministically.
What survives: the named-motif vocabulary bound to *real* state, and state-driven density
in the one place where it never surprises (transient loading area only).

### D3 — SIGNAL FLOW (typographic transcript spine)
Strip boxes from prose. A typographic document: continuous agent rail, hanging indents,
markdown as the hero (hierarchy markers, blockquotes as dim marginalia, horizontal rules as
real rules), tools as terse one-liners. Streaming caret marks live continuation.
Strengths: maximum readability per row; cheapest to render; strong ASCII fallback;
long-mission friendly.
Critique: alone it risks generic-minimal; role glyphs under-signal failures; tool groups
still need D1's severity legibility.

## Winning synthesis — "SIGNAL SPINE"

D3's typographic continuous spine + D2's evidence-bound named activity motifs +
D1's severity-first tool legibility. Principles:

1. **Form from evidence** (vault digest 003): every glyph/label describes real state
   (RESPONSE / SHELL / APPROVAL, tool status, pending truncation). No decorative motion.
2. **One continuous spine**: the bone `| ` response rail runs through *every* chunk of a
   long response (constraint inversion of "continuation chunks drop the rail"), so a long
   mission reads as one organism. Shared constant, width derived from the rail itself.
3. **Typographic hierarchy over chrome**: markdown carries the visual energy (spine
   markers for headings, real horizontal rules, dim blockquote gutters). No new boxes.
4. **Severity outranks category** in tool groups (existing border precedence), with a
   compact status tally in the group identity line for scanning long transcripts.
5. **Speed as identity**: streaming cost must become ~O(changed tail), not O(whole message),
   measured before/after. Faster feedback *is* the aesthetic.

## Implementation results (Waves B + C)

All claims below are backed by executed tests or the harness in
`tmp/bench/markdownStream.bench.tsx` (harness: growing document re-rendered per
chunk through `wrapWithProviders` + ink-testing-library).

### Shipped

1. **Signal-spine markdown hierarchy** (`MarkdownDisplay.tsx`): h1 `█ `, h2 `▌ `,
   h3 bold body, blockquote `▎ ` marginal gutter per line, horizontal rules as
   real terminal-width `─` rules. Tests: `MarkdownDisplay.maw.test.tsx` (9).
2. **Continuous response spine** (`RESPONSE_RAIL` in `textConstants.ts`):
   every response chunk, head and continuation, is marked with the bone `| `
   rail; continuation chunks derive indentation from the rail width instead of
   a phantom prefix. Tests: `AiMessageContent.maw.test.tsx` (3).
3. **Single role identity line**: profile and model share one dim
   `[profile] · model` row. Tests: `AiMessage.identity.maw.test.tsx` (2).
4. **Severity-first tool tally**: tool group identity rows carry a compact
   tally (`x2 -1 o1`) with error > warning > secondary coloring.
   Tests: `toolStatusTally.maw.test.ts` (4) + `ToolGroupMessage.test.tsx` (3).
5. **Activity motifs**: the activity indicator's spinner is state-derived
   (`arrow3` = approval decision, `toggle` = shell focus, `dots` = streaming).
   Tests: `LoadingIndicator.motifs.maw.test.tsx` (3).
6. **Incremental streaming parse** (`parseMarkdownIncremental`): a streaming
   append re-parses only the changed tail; sealed spans are reused. A span is
   reusable when its lines are unchanged and its start keeps the same one-line
   lookahead (the deliberate `lcp - 2` boundary that keeps a late table
   separator from being locked out). Regexes are hoisted to module scope.
   Tests: `MarkdownDisplay.incremental.maw.test.tsx` (7 frame-equality cases
   including the table-takeover and pending-truncation traps).

### Measured (same machine, same harness)

| scenario | before mean | after mean | before total | after total |
| --- | --- | --- | --- | --- |
| fullRender 3.3KB | 35.7ms | 43.3ms | 178ms | 216ms |
| fullRender 30KB | 258ms | 252ms | 1290ms | 1259ms |
| streaming 3.3KB -> 18KB (150 updates) | 39.5ms | 37.3ms | 5927ms | 5588ms |
| streaming 30KB -> 45KB (150 updates) | 195ms | 183ms | 29300ms | 27431ms |

Parse-work probe (`tmp/bench/parseProbe.tsx`, 20 updates on a ~1,150-line
document): **60 lines re-parsed vs 22,940 for naive full re-parse** — streaming
parse work is now O(changed tail) instead of O(document).

Honest interpretation: end-to-end frame time in this harness improved only
~5-6% because the harness re-lays-out the whole live tree through
ink-testing-library on every update; that residual is Ink layout + act()
overhead proportional to the live region, not parsing. Production bounds the
live region through the existing segment-committal Static machinery
(`pendingResponseBuffer` / `incrementalSplitScanner` / `committedSegmentLedger`),
which commits stable text as static history items while it streams. The parse
cache removes the constant whole-document re-parse that remained inside that
live region. The first fullRender row shows a small cold-cache cost (+7.6ms at
   3.3KB) from cache bookkeeping; steady-state streaming wins outweigh it.

## Wave B/C change list (implemented)

- `MarkdownDisplay` hierarchy: h1 `█ `, h2 `▌ `, h3 bold body, blockquote `▎ `
  gutter per line, real terminal-width `─` rules. Tests: `MarkdownDisplay.maw.test.tsx`.
- Response spine: `AiMessageContent` renders the same bone rail per chunk via shared
  `RESPONSE_RAIL`; width derived, not hardcoded. Tests: `AiMessageContent.maw.test.tsx`.
- Role noise: profile + model collapse to one dim identity line (both strings preserved).
- Tool group identity line gains a severity tally (`x2 -1 o1`), pure helper + tests.
- Activity motifs: state-derived spinner motifs (dots = streaming, toggle = shell
  focus, arrow3 = approval). Tests: `LoadingIndicator.motifs.maw.test.tsx`.
- Perf: streaming stable-prefix parse reuse + regex hoisting in the markdown path,
  benchmarked before/after in `tmp/bench/markdownStream.bench.tsx`.

## Research digest (2026-10-04, notes only — no scope added)

Post-implementation external research, recorded to validate direction and queue
future work. Nothing here was retrofitted into the shipped wave.

- Frontier agent CLIs (Claude Code's terminal stack, per public architecture
  writeups) use the same shape our Wave C landed: incremental markdown that
  splits at the last stable block boundary and never re-parses the stable
  prefix, plus content-hash parse caches. Their remaining wins come from the
  renderer below us (cell-level diffing, blit of unchanged regions, pooled
  string interning, damage rectangles) — i.e. Ink-layer work, not markdown-layer
  work. Candidate future direction only; MAW keeps stock Ink.
- Steady-state frames there cost O(changed cells), not O(screen). Our bench
  harness re-lays-out the whole live region per update, which is why measured
  e2e gains (~5-6%) understate the parse-layer win (60 vs 22,940 lines
  re-parsed). Production bounds the live region via the Static/pending-buffer
  machinery already upstream.
- Input path: dual-path render (immediate direct paint of the focused composer
  + debounced full layout) is the standard fix for keystroke latency under
  heavy content. MAW's composer (`inputPromptRender`) already renders only the
  visible slice; if typing latency ever regresses under long sessions, the
  fast-path paint is the proven next lever — not yet measured as a problem, so
  not implemented.
- Paste handling: bracketed-paste + raw-burst classification (rapid-keystroke
  detection with Enter suppression windows) is how other TUIs prevent multi-line
  pastes submitting mid-paste. MAW inherits upstream paste semantics; this is a
  named, unmeasured risk (see final report), not a silent assumption of safety.

