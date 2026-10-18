# Known limitations (honest status)

Recorded browser/build baseline environment: Linux, Python 3.12, Node 22, PostgreSQL 16.15, **headless Chromium 153 (bundled via @sparticuz/chromium)**. Docker was not available for that run. The source PDFs were not located during the previous audit; both were subsequently found in Downloads and their extracted text was reviewed for the final readiness audit.

## Latest workspace audit (Windows, 2026-10-19)
* `.\scripts\test.ps1`: **28 backend tests passed** (including the standalone schema tests), **33 frontend tests passed across 10 files**, and the production frontend build passed. Vite reported existing output chunks larger than 500 kB.
* Backend tests ran against `newtonite_test`; the connected `current_database()` was verified before destructive fixture setup. The fixture rejects targets not suffixed `_test` and targets matching the configured development database name. A same-target negative probe was rejected before test collection. The development database was not targeted.
* `docker compose config --services` validated the Compose file and listed the `db` service. No Compose services were started.
* Both challenge PDFs were located and inspected: `Newtonite_Software_Engineering_Challenge.pdf` and `GU_CCIO_Advisory_Newtonite_Software_Engineering_Execution_Plan (1).pdf`.
* A fresh Git clone/startup was not performed: no `.git` directory or worktree file exists at the project root or its parents. Docker provisioning and browser E2E/a11y checks were not run.
* A local heuristic scan found no common private-key, cloud-key, or access-token patterns in scanned source/config files. Tracked-file and commit-history secret checks remain unavailable without Git metadata.

## Implemented and tested (actually executed against the final code)
* **Backend pytest on PostgreSQL: 25 passed in 17.74s.** Schema is created by the Alembic migrations. Covers auth/CSRF/session expiry, team and resource authorization, workflow + lead-only approval, forced claim / stale-edit / transition races, atomic rollback of state + audit + outbox + idempotency key, idempotent create (retry, concurrent, key reuse → 409), search/filter/pagination, the `needs_attention` view, outbox retry/backoff/dead-letter/crash recovery/idempotent delivery, seed, migration drift and downgrade. Test strength was mutation-checked in the previous review round (removing the claim predicate, the version guard, or committing before the audit write each made a test fail); that check was not repeated in this round.
* **Frontend unit/component tests: Tests 22 passed (22) / Test Files 6 passed (6)**, including WCAG contrast of both themes + CSS/token parity, the stale-update conflict flow, create-form idempotency (same key on uncertain retry, new key on edit), login validation and the API client. **Production build: ✓ built in 762ms.**
* **Real-browser checks (headless Chromium, desktop 1440 / laptop 1280 / tablet 768 / mobile 390):**
  * **21 passed, 0 failed** — end-to-end through the UI and live backend: lost claim race shows the conflict banner and no success toast; stale edit shows the banner, refreshes to the newer record, leaves the server value unchanged until the user explicitly retries; a double-click on Create makes exactly one item; a member cannot approve (no control, direct API call 403) and a lead approves through the confirmation dialog; activity timeline records it.
  * **Horizontal overflow:** 0000 pages overflowing (9 pages × 4 widths, desktop/laptop/tablet/mobile order).
  * **axe-core 4.14 (wcag2a/aa, wcag21aa, best-practice): 17 of 17 page/theme states clean; 0 with violations.** Keyboard: visible 2px focus ring, `/` focuses search, `Esc` closes the dialog; the reduced-motion rule is present.
  * Screenshots in `docs/screenshots/` were viewed and used to find real defects (queue toolbar stacking, tooltip-induced page overflow, tablet table crushed by a pinned sidebar, clipped dialog tooltip, mobile title truncation), all fixed.

## Not verified
* Browsers other than Chromium (Firefox, Safari), real phones/tablets, touch behaviour, and any **screen reader** — axe is automated and catches only part of accessibility. Touch-target sizes were not measured (buttons are 32px high).
* Mobile and tablet layouts were viewed for the Overview, navigation drawer and (mobile) search/create; the other pages at those widths were checked for overflow and axe but not all inspected by eye.
* Windows/PowerShell Docker provisioning and browser scripts (including `CHROME_PATH`), and `docker compose exec`, remain unexecuted; the latest Windows run covered backend/frontend tests and the frontend build only.
* No visual-regression baseline: screenshots are documentation, not assertions.
* The browser E2E script mutates development data (claims, approvals, creates). Re-seed after running it; the dev database used during this work is not part of the archive.

## Known weaknesses / differences from the brief
* The attention rule exists in three places (`/dashboard/attention`, `view=needs_attention`, the UI's signal tags); a backend test pins the view only. `/dashboard/attention` is no longer used by the UI.
* Light theme is retained and verified, but the dark theme is the primary design.
* Offset (not cursor) pagination; `ILIKE` search without a trigram index; no due-date range filter (only "overdue").
* shadcn/ui and Recharts are not used (small hand-written components; distributions are CSS bars).
* One outbox job type and no notification UI. Activity page shows the 12 most recent changes (no global activity endpoint).

## Not implemented
Login rate limiting, password change/reset, user/team administration, comment edit/delete, live updates, real email, attachments. There is no AI provider integration or configuration; the UI reports the copilot unavailable. The schema has no workflow entity or dependency links: the 3D constellation visualizes real work items grouped by status but does not invent connections.

## Deferred
Keyset pagination, pg_trgm index, row-level security, activity partitioning, dead-job inspection UI, visual-regression and cross-browser E2E in CI.
