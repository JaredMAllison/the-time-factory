# TTF Compose Capture — design

**Date:** 2026-08-16
**Status:** approved, not implemented
**Branch:** `feat/compose-capture` (off `feat/event-by-id`)
**Repos touched:** the-time-factory (most), marlin (none — endpoint already exists), Marlin vault (ADR + skill)

---

## Problem

TTF holds state the vault cannot see, joined to it by a pair of mutable pointers that can each rot independently. Measured against the live instance on 2026-08-16:

| Measure | Count |
|---|---|
| Events total | 152 |
| `source: marlin` **and** `external_id` — the join holds | **62** |
| Both NULL | **90** |
| One field but not the other | 0 |

The 62 are tasks that were pushed more than once: `/ttf-push` uses `POST` when a task has no `ttf_id` and `PUT` when it has one, `POST` silently discarded the provenance fields, and `PUT` wrote them correctly. **So every re-pushed task self-healed and every push-once-and-forget stayed broken** — which is why the failure was invisible for four months. Fixed in `a0cba6e`, unmerged and undeployed as of this writing.

The 90 are not sync artifacts. Google and Nextcloud sync are present in code and **not configured** — the live `config.json` has no sync section. They were authored by hand in TTF's `NEW EVENT` form (`index.html:159`, handler `ui.js:481`) and **exist nowhere else in the operator's system.**

That is the real defect. ttf-adr-008 declares "TTF is a view"; 59% of TTF is not a view of anything. **The architecture describes a system that does not exist.**

## Doctrinal failures being corrected

- **Covenant 2 — Portability Is Integrity.** *"Any model that reads files can operate the vault."* A model reading a task's `ttf_id` learns nothing — no date, no title, no completion state — without a running service and its SQLite file. Vault state whose meaning is only recoverable by querying a process.
- **Covenant 3 — Behavioral Trust Is Load-Bearing.** The Covenant's own threshold is *"90% reliable may be net negative."* Observed: 41%, undetected.
- **Build doctrine — no instance-specific exceptions.** `/ttf-push` is a hand-rolled Marlin-only integration issuing raw curl calls, duplicating what `src/backend/sync/engine.js` does generically. The bespoke path is the one that broke.
- **Operator's own principle**, from `Thinking/why-the-pill-spot-works` §2: *two artifacts can disagree, and over a long enough run they always do — prefer forms that cannot disagree with themselves.*

## Operator's framing, which is the design

> *"I feel that any part of my prosthetic should be ready for my input. Realizing I need to compose something and then needing to switch away from TTF seems troublesome. What about composes in TTF get queued for enrichment in Marlin?"*

> *"I like A and we can justify writing to the vault if TTF writes to a buffer rather than to live tasks/projects."*

TTF stops being *a view plus a rogue second store* and becomes *a view plus an intake surface*. Both are roles the architecture already understands. The inbox becomes a **protocol** rather than a file: `Inbox.md` is one implementation, the email gateway is another, TTF composes are a third.

This is also the operator's own friction doctrine (`Thinking/managing-your-own-friction`) applied to a new domain: **frictionless intake, friction placed at the commit boundary.** Composing costs nothing and happens where he already is; enrichment is deliberate and reviewed.

---

## Invariant

> **TTF never writes authoritative vault state. TTF may write to buffers.**

This **amends** ttf-adr-008 rather than superseding it. ADR-008's stated reason is conflict resolution — *"if a task is edited in TTF, which version wins?"* A buffer cannot be in conflict, because nothing defers to it. The rule was always about authoritative state; nobody had needed to distinguish because no other kind of write existed.

## Event classes

| Class | Discriminator | Authority | Rebuildable |
|---|---|---|---|
| **Projection** | `source: marlin` + `external_id` | vault | yes — delete and re-push |
| **Compose** | no `source`; `captured_at` set | vault buffer | no, until enriched |
| **Owned** | no `source`; external origin | TTF | no |

`Owned` is currently empty and exists so the sync engines have a home when configured. A compose becomes a projection at enrichment; that is the only transition, and it is operator-confirmed.

---

## Design

### 1. Capture is server-side

Capture happens inside `POST /api/events`, **not** in the browser's submit handler.

Client-side capture would require the browser to hold Marlin's address and a CORS grant, would die if the tab closed mid-request, and would cover only that one frontend — not the Godot rebuild (ttf-adr-011), not `curl`, not the cockpit. Server-side capture is one code path, covers every client, is retryable, and survives a frontend rewrite.

TTF gains a config field:

```json
{ "capture_url": "http://localhost:7832/inbox" }
```

**Unset by default.** TTF remains a generic calendar for any other user; capture is opt-in and instance-agnostic. This keeps the feature contributable upstream (Covenant 7) rather than a Marlin fork.

**No new Marlin work is required.** `webhook.py` already serves `POST /inbox` — it reads a body, calls `append_inbox()`, returns 200, and is bound to `0.0.0.0:7832`.

### 2. Loop prevention

⚠️ `/ttf-push` also POSTs to `/api/events`. Without a guard, pushing a vault task to TTF writes it back into `Inbox.md`, enrichment creates a second task, that gets pushed, and the loop never terminates.

**The discriminator is `source`:**

- POST carrying `source` → projection or sync write → **never captured**
- POST with no `source` → operator compose → **captured**

This makes `a0cba6e` a **prerequisite**, not merely a related bugfix: the guard requires `source` to survive the create, and before that commit it did not.

### 3. Durability and retry

Add to the events table:

```sql
captured_at TIMESTAMP NULL
```

Flow on a compose POST: insert the row, respond 201, then attempt capture. Stamp `captured_at` on success; leave NULL on failure.

**Event creation must not fail when capture fails.** Losing the balloon because Marlin is down is worse than the exposure window. Capture is best-effort with retry.

**Retry trigger:** the sweep runs at the start of any `GET /api/events` — the frontend polls it, so a browser left open drives retries without a scheduler, and a closed browser means nothing is being composed anyway. Bound the sweep (oldest N uncaptured, N small) so one long outage cannot turn a page load into a stampede.

### 4. ⚠️ Uncaptured must be visible

**This requirement is load-bearing and is the lesson of the bug being fixed.**

The `external_id` defect survived four months because its failure mode was invisible: TTF returned 201 and everything looked correct. A capture path that can fail silently is the same defect rebuilt with better intentions.

A compose that has not reached the vault **renders as uncaptured** — a marked balloon, a count, some visible signal. Uncaptured is a state the operator can see, not one discovered in a later audit.

### 5. Buffer line format

```
- [2026-08-16 14:20] (TTF · due 2026-08-20 · Job Hunt) Call the recruiter back <!-- ttf:940e9de7-f543-4346-81cf-e5fd3e486fbf -->
```

Human-readable content first. The exact event id trails in an HTML comment — Obsidian does not render it, the file retains it. The operator reads the line during enrichment; enrichment gets a deterministic id with no prefix-matching or title-guessing.

Description, when present, follows the title after an em space on the same line. **Newlines in a description are collapsed to spaces** — an inbox entry is one line, and a multi-line entry would break the drain. The description is **not truncated**: the buffer's job is to lose nothing, and a long line is a display annoyance where a truncated one is data loss.

Recurrence is not encoded in the line. **A compose carrying an `rrule` is still captured** — one entry, for the series, at its first occurrence — because dropping it would make recurring composes silently vault-invisible, which is the defect this design exists to remove.

### 6. The join is made at enrichment

`/marlin-enrich` drains the line as it drains any inbox entry, and completes the whole join in one place:

1. Create the task file
2. Write `ttf_id` into its frontmatter
3. `PUT` `external_id` + `source: marlin` back to the TTF event
4. The row is now a projection

**This is the structural fix.** Today the join is attempted by a fire-and-forget pusher that never verifies. Here it is made by the one process that holds both halves open and requires operator confirmation. It cannot fail silently, because a human is looking at both sides when it happens.

---

## Testing

TTF is Node + Express + `better-sqlite3` with Vitest. Tests set `process.env.DB_PATH = ':memory:'` before `require('../server.js')`.

- POST with no `source` and `capture_url` set → capture attempted, `captured_at` stamped, correct line body posted
- POST **with** `source` → capture **not** attempted (loop guard) — the highest-value test here
- POST with `capture_url` unset → no capture, no error, `captured_at` NULL
- Capture endpoint returns 500 / times out / connection refused → event still created with 201, `captured_at` NULL
- Retry sweep stamps a previously-failed compose without duplicating the inbox line
- Line format round-trips: id in the comment matches the created event's id
- Recurring compose (`rrule` set) → captured once, at the first occurrence, not once per expansion
- Description containing newlines → collapsed to a single-line entry, nothing dropped

⚠️ **Never point `capture_url` at the real vault in tests.** Use a stub HTTP server on an ephemeral port. Writing into `/home/jared/Documents/Obsidian/` from a test is itself a defect.

## Out of scope — named so they are not forgotten

- **The 90 existing composes.** An inbox with no drain, four months deep. Dumping 90 lines into `Inbox.md` would be its own damage. Their disposition is a separate operator decision, informed by `TTF Dangling References Audit — 2026-08-15` (39 of them dangle for an unrelated reason: they predate the 2026-05-21 vault repo separation).
- **Pop reconciliation** (ttf-adr-013, TTF completion → vault). Fully specified, and `modified_since` is implemented (`src/backend/routes/events.js:55-72`), but building it is separate work.
- **The 39 dangling references.** Untouched.
- **Retiring `/ttf-push`'s bespoke curl path** in favour of the sync-engine machinery. Doctrinally indicated, not required by this design.

## Companion artifact

An ADR amending ttf-adr-008 with the buffer carve-out belongs in the Marlin vault's `Decisions/`. Without it, the next reader finds ADR-008 saying TTF cannot write to the vault and concludes this design violates it.
