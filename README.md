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
machine-readable view of the archive listing pages.

A snapshot is **two requests**, not one per subject class: a bulk `cat:q-fin*` query and
a second pass for `econ.GN`. Papers are then bucketed into the nine subject classes
locally. This matters — arXiv asks for a single connection and roughly one request every
three seconds, and an earlier version that fanned out across all nine classes in parallel
earned a string of `429`s that blocked the IP for several minutes.

Two details worth knowing:

- `q-fin.EC` is an alias for `econ.GN`. Papers are only ever tagged with the econ code,
  so `cat:q-fin*` never returns them and they need their own query.
- Papers are frequently cross-listed, so the same paper legitimately appears under
  several subject classes.

Responses are cached for 30 minutes on the server. The **Refresh** button bypasses that
cache.

### Time windows

The window selector controls how far back a snapshot reaches, using arXiv's
`submittedDate` filter:

| Window | Range | Papers pulled |
| --- | --- | --- |
| Recent | newest, no date filter | ~250 |
| 1 month | 30 days | ~450 |
| 6 months | 182 days | ~650 |
| 1 year | 365 days | ~850 |

q-fin gets roughly 3,400 submissions a year, which is far more than is useful to ship to
a browser, so wide windows load the newest slice and the UI states plainly how many of
the window's papers were loaded. Wider windows take longer and weigh more — the 1-year
snapshot is about 1&nbsp;MB gzipped.

### Timeouts

arXiv's latency swings between 100&nbsp;ms and well over a minute depending on how it
feels about your IP, so every layer is bounded: each request has a timeout with one
backed-off retry, the snapshot has an overall budget, and the route caps the whole thing
at 50 seconds. The request timeout is enforced by racing a timer rather than trusting
`AbortSignal` alone, because an aborted request under Next's cached `fetch` has been seen
to keep running — a 45-second budget once produced a 101-second response.

### Search

Search queries **arXiv itself**, not the loaded window, so it reaches the entire q-fin
archive including papers that were never on screen. `/api/search` builds an `all:` query
— which covers titles, abstracts, authors and comments — scoped to
`(cat:q-fin* OR cat:econ.GN)` and to the selected time window, and returns the top 100
by relevance. Searching *deep hedging* on the Recent window matches papers back to 2011.

User input is reduced to plain terms before the query is assembled, so field prefixes,
quotes and boolean operators cannot change what is asked.

## Deploying

The app builds on Vercel with no configuration or environment variables.

**No page fetches arXiv at build time.** The home page is a fully static shell and papers
are loaded from `/api/papers` in the browser, so a build cannot fail because arXiv is
slow, throttling, or down. This was not the original design: prerendering the page meant
every deploy depended on arXiv answering within Vercel's 60-second static generation
limit, and it did not.

The trade-off is that paper content is not server-rendered, so it is not visible to
crawlers that do not execute JavaScript. For a reading dashboard that is a fair price
for deploys that cannot break on someone else's rate limiter.

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
| `GET /api/papers?range=1y` | Widen the window: `recent`, `1m`, `6m`, `1y` |
| `GET /api/papers?category=q-fin.TR` | One subject class |
| `GET /api/papers?limit=20` | Papers for a single class |
| `GET /api/papers?refresh=1` | Bypass the 30-minute cache |
| `GET /api/search?q=deep+hedging` | Search the whole archive, ranked by relevance |
| `GET /api/search?q=jump+risk&range=6m` | Same, restricted to a window |

These routes are what the UI itself calls. Responses are cached for 30 minutes, so repeat
calls return in milliseconds instead of re-querying arXiv.

## Layout

```
app/
  page.tsx            static shell; no data fetching
  api/papers/route.ts snapshot API
  api/search/route.ts archive-wide search
components/
  archive-explorer.tsx  fetches papers, stats, tabs, window and search (client)
  paper-card.tsx        summary card with expandable abstract
  relative-time.tsx     "2d ago" labels
  ui/                   shadcn/ui components
lib/
  arxiv.ts            API client and Atom parser (server only)
  summarize.ts        extractive summarizer
  categories.ts       the nine q-fin subject classes
  config.ts           window definitions shared by server and client
```

`lib/arxiv.ts` is imported as a value only by the API routes; components import from it
with `import type`, so none of the arXiv client reaches the browser bundle.

Summaries are built in the browser, in `PaperCard`, rather than sent from the server.
They are derived from the abstract, so shipping both would send the same prose twice —
about 38% of the payload — and only cards actually on screen pay for the work.

## Credit

Thank you to arXiv for use of its open access interoperability.
