# UCLA Anderson MSBA House Points

Website: https://alisaayz.github.io/msba-housepoints/

The shared competition scoreboard for houses M, S, B and A, using the supplied UCLA Anderson logo and the four house colors.

## Submit points

1. Click **Add points**.
2. Enter a name or nickname, select your house, and enter your earned points and activity.
3. Click **Submit points**. The entry saves directly on the page, with no account or GitHub login required.

Names, activities, and point amounts appear publicly in the shared history. Submit each activity once. This is a self-reported scoreboard, without student identity verification.

Starting scores provided October 7, 2026: **M 95, S 83, B 115, A 134** (427 total). New submissions add to these totals. The baseline is in `dist/ledger.mjs`.

## Shared storage

The frontend is published on GitHub Pages. Direct submissions are stored in a Sites-backed D1 database and read through the public entry service:

https://msba-housepoints-data.zhaoheng988.chatgpt.site/entries

`dist/service.mjs` submits name, house, points, activity, and a unique request ID. Retrying the same request ID does not add points twice. Failed saves retain the form inputs; success is shown only after the server confirms the saved entry. Saved entries are shared across devices, without browser-local score storage or frontend credentials.

`backend/` mirrors the published Worker source, schema, and generated Drizzle migrations. Its hosting manifest identifies the existing Sites project. Update that same project for backend changes; pushing to GitHub publishes only the frontend. Do not replace the database or rewrite applied migrations. The backend accepts requests from the GitHub website origin, validates inputs, and uses prepared statements.

The previously published GitHub issue snapshot remains available as legacy data. It is no longer the input path for students. `scripts/snapshot.mjs` validates that retained snapshot without querying or writing GitHub Issues. If the live service is unavailable, the page explicitly warns that the displayed scoreboard may be missing recent submissions.

## Verification and publishing

With Node.js 22 or newer:

```sh
node --test tests/ledger.test.mjs
node --test backend/tests/worker.test.mjs
node scripts/snapshot.mjs
```

The backend tests use an isolated SQLite database to check credential-free persistence, retry idempotency, input validation, and browser cross-origin requests. Browser testing uses an isolated local database and never adds fake entries to the live scoreboard.

GitHub Pages uses the GitHub Actions publishing source. `.github/workflows/pages.yml` publishes only `dist/` after pushes to main. Frontend assets use versioned URLs to avoid mixed versions in browser caches. Keep that version consistent across imports when changing the application.

Optional WebMCP tools read the scoreboard, stage an entry, and submit a confirmed public entry through the same visible form actions.
