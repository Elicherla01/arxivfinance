# q-fin Digest

A reader for [arXiv Quantitative Finance](https://arxiv.org/archive/q-fin) that pulls the
latest submissions from all nine q-fin subject classes and generates a short summary,
key findings and topic tags for every paper.

## Stack

- **Next.js 16** (App Router) + **React 19**
- **TypeScript**
- **Tailwind CSS v4** via `@tailwindcss/postcss`
- **shadcn/ui** components on **Radix UI** primitives
- **Lucide** icons

## Run

The app runs permanently on **http://localhost:6453** as a macOS LaunchAgent — it starts
at login and restarts automatically if it crashes. See [Always-on service](#always-on-service).

For local development:

```bash
npm install
npm run dev        # http://localhost:3000
npm run build && npm start   # production, port 6453
npm run lint
```

No API key or `.env` file is needed — arXiv's API is open.

## Always-on service

The LaunchAgent lives at `~/Library/LaunchAgents/com.ravindraprasad.qfin-digest.plist`
and runs `next start -p 6453` from this directory with `RunAtLoad` and `KeepAlive`, so it
survives both logout and crashes. Output goes to `logs/`.

```bash
npm run service:status    # is it running, current pid
npm run service:restart   # after a rebuild
npm run service:logs      # tail stdout + stderr
npm run service:stop      # unload until next login
npm run service:start     # load again
```

After changing code, run `npm run build` then `npm run service:restart` — `next start`
serves the build output, so a restart alone will not pick up source changes.

Startup takes roughly 10–30 seconds before the port accepts connections. Once warm, the
home page is served from the ISR cache in well under a second.

## How it works

### Data

Papers come from the arXiv Atom API (`export.arxiv.org/api/query`), the supported
machine-readable view of the archive listing pages. `lib/arxiv.ts` queries each subject
class with `cat:<id>`, sorted by submission date, plus one bulk `cat:q-fin*` query that
backs the **Latest** tab.

Two details worth knowing:

- `q-fin.EC` is an alias for `econ.GN`. Papers are only ever tagged with the econ code,
  so querying `cat:q-fin.EC` returns nothing — the client queries `econ.GN` instead.
- Papers are frequently cross-listed, so the same paper legitimately appears under
  several subject classes.

Requests go out in batches of three to stay polite with arXiv, and responses are cached
for 30 minutes through Next.js ISR. The **Refresh** button bypasses that cache.

Every request is bounded by a 12-second timeout with one retry, and the whole snapshot
has a 40-second budget. arXiv throttles cloud IPs and will sometimes accept a connection
and then never answer; without those bounds a single stalled request hangs the prerender
until the host's build timeout kills the deploy. Once the budget is spent, remaining
subject classes are skipped and the page renders with what arrived — the next
revalidation fills in the rest, so a slow upstream degrades the page instead of failing
the build.

## Deploying

The app builds on Vercel with no configuration or environment variables. The home page
is prerendered at build time and then revalidated every 30 minutes.

### Summaries

`lib/summarize.ts` builds each summary locally by extractive ranking — no model or API
key involved. Sentences are scored on normalised term frequency, position in the
abstract, and rhetorical cues that mark contribution and result statements
("we propose", "we show", "out-of-sample", …).

The TL;DR pairs the best **framing** sentence (from the opening two) with the best
**contribution** sentence, since an abstract's gist needs both halves. Remaining
high-scoring sentences become the key-findings bullets. Topic chips are matched with
word-boundary regexes so `defined-contribution` no longer reads as *DeFi*.

Summaries are derived text, not a substitute for the paper — read the source before
citing anything.

## API

The same data is available as JSON:

| Route | Result |
| --- | --- |
| `GET /api/papers` | Full snapshot: every subject class plus the latest stream |
| `GET /api/papers?category=q-fin.TR` | One subject class |
| `GET /api/papers?limit=20` | Papers per class (default 12) |
| `GET /api/papers?refresh=1` | Bypass the ISR cache |

Responses reuse the same 30-minute fetch cache as the page, so repeat calls return in
milliseconds instead of re-querying arXiv.

## Layout

```
app/
  page.tsx            server component; fetches the snapshot, renders header stats
  loading.tsx         skeleton shown while the snapshot loads
  api/papers/route.ts JSON API
components/
  archive-explorer.tsx  tabs, search and sort (client)
  paper-card.tsx        summary card with expandable abstract
  relative-time.tsx     client-rendered "2d ago" labels
  ui/                   shadcn/ui components
lib/
  arxiv.ts            API client and Atom parser
  summarize.ts        extractive summarizer
  categories.ts       the nine q-fin subject classes
```

Relative timestamps render as absolute dates on the server and swap to "2d ago" after
mount, so a page prerendered 20 minutes ago does not hydrate with a stale "now".

## Credit

Thank you to arXiv for use of its open access interoperability.
