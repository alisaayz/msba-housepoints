# MSBA House Points

The shared competition scoreboard for houses **M, S, B, and A**.

Website: https://alisaayz.github.io/msba-housepoints/

## Add points

1. Open the website and click **Add points**.
2. Select a house, enter a whole point amount, and describe the activity. Use negative points for deductions.
3. Click **Continue to GitHub**, sign in, and click **Create** to save the prefilled entry.
4. Return to the scoreboard and click Refresh. Everyone sees the same saved entries.

Only entries created by the repository owner or GitHub collaborators count. Other organizers need collaborator access to this repository; the site does not itself grant access. Reasons, point amounts, and organizer usernames are public. Avoid posting private student information.

Entries use issue titles in the exact format `[house-points] M +25` and the issue body as the reason. Keep the title format when editing. Closed issues do not count: close an entry to void it or reopen to restore it. Ordinary issues and pull requests are ignored. Points start at zero; there is no sample competition data.

## How sharing works

GitHub Issues is the durable shared point ledger. The website reads the public GitHub API without embedding credentials. It refreshes on request and when returning to the tab after 30 seconds. The Pages workflow also publishes a scoreboard snapshot when organizers create, edit, close, or reopen entries. A snapshot remains available when live GitHub API updates are unavailable or rate limited, with an explicit notice that it may be outdated.

This is a GitHub Pages static website. Saving entries takes place in GitHub's authenticated interface, rather than a login form on the scoreboard. No server, database subscription, frontend tokens, or browser-local score storage is required.

## Development

No external JavaScript packages are required. Use Node.js 22 or newer:

```sh
npm test
npm run build
python3 -m http.server 4174 --directory dist
```

`npm run build` reads current organizer entries and creates `dist/snapshot.json`; it fails instead of replacing scores with zero if GitHub cannot be reached. The workflow uses its temporary read-only GitHub token to avoid the public API rate limit during publishing.

GitHub Pages should use **GitHub Actions** as its publishing source. `.github/workflows/pages.yml` runs the ledger checks, builds the snapshot, and publishes only `dist/`. Pushes to `main` publish site changes automatically.

The browser optionally exposes read-scoreboard and stage-entry WebMCP tools when supported. Staging fills the visible form and never saves or publishes an entry.
