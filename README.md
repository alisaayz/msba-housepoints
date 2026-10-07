# MSBA House Points

The shared UCLA Anderson MSBA competition scoreboard for houses **M, S, B, and A**. The masthead uses UCLA blue (#2774AE) and gold (#FFD100), while house colors remain distinct.

Website: https://alisaayz.github.io/msba-housepoints/

## Add points

1. Open the website and click **Add points**.
2. Select your house, enter the positive whole points you earned, and describe the activity. Submit each activity once.
3. Click **Continue to GitHub**, sign in, and click **Create** to save the prefilled entry.
4. Return to the scoreboard and click Refresh. Everyone sees the same saved entries.

Every student can submit earned points using their GitHub account, without collaborator access to this repository. Reasons, point amounts, and GitHub usernames are public. Avoid posting private student information. This is a self-reported scoreboard; entries are not gated by UCLA student verification.

Entries use issue titles in the exact format `[house-points] M +25` and the issue body as the reason. Keep the title format when editing. Closed issues do not count: close an entry to void it or reopen to restore it. Ordinary issues and pull requests are ignored. Organizers may create negative correction entries directly on GitHub (for example, `[house-points] M -5`); deductions from other accounts are ignored.

Starting totals, provided on October 7, 2026: **M 95, S 83, B 115, A 134** (427 total). `STARTING_POINTS` in `dist/ledger.mjs` stores these existing totals. New entries are added to that baseline, so refreshing or rebuilding does not reset it. No individual past activities have been invented.

## How sharing works

GitHub Issues is the durable shared point ledger. The website reads the public GitHub API without embedding credentials. It refreshes on request and when returning to the tab after 30 seconds. The Pages workflow also publishes a scoreboard snapshot when students create, edit, close, or reopen entries. A snapshot remains available when live GitHub API updates are unavailable or rate limited, with an explicit notice that it may be outdated.

This is a GitHub Pages static website. Saving entries takes place in GitHub's authenticated interface, rather than a login form on the scoreboard. No server, database subscription, frontend tokens, or browser-local score storage is required.

## Development

No external JavaScript packages are required. Use Node.js 22 or newer:

```sh
npm test
npm run build
python3 -m http.server 4174 --directory dist
```

`npm run build` reads current point entries and creates `dist/snapshot.json`; it fails instead of discarding saved points if GitHub cannot be reached. The workflow uses its temporary read-only GitHub token to avoid the public API rate limit during publishing.

GitHub Pages should use **GitHub Actions** as its publishing source. `.github/workflows/pages.yml` runs the ledger checks, builds the snapshot, and publishes only `dist/`. Pushes to `main` publish site changes automatically.

The browser optionally exposes read-scoreboard and stage-entry WebMCP tools when supported. Staging fills the visible form and never saves or publishes an entry.
