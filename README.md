# Anime Dub Tracker

Lightweight web app that watches [r/Animedubs](https://www.reddit.com/r/Animedubs/)
for new English-dub release announcements and lists them in a clean UI.
Served at **https://dubs.cineclark.studio**.

## How it works

1. Loads the persisted release list from `./data/releases.json` on startup.
2. Polls the r/Animedubs **RSS feed** every 15–25 min, filters posts that look
   like dub releases, merges + de-dupes, keeps the 100 most recent.
3. Every 2 h, checks older posts and drops any that were deleted/removed.
4. Any change is written back to `./data/releases.json` (debounced 1 s).
5. Serves a REST API + static frontend (auto-refreshes every 5 min).

> Reddit's unauthenticated JSON API 403s server-side, so there's **no multi-day
> backfill** — the persisted file *is* the history; RSS keeps it current. A
> brand-new deployment starts with whatever's in the current RSS window and
> fills in over the following days.

## Deployment (Docker01)

Runs as a compose stack under the standard layout — `/opt/docker/dubtracker/`
(this repo mirrors that dir 1:1). Image is built + pushed to
`ghcr.io/settonra/dubtracker:latest` by GitHub Actions on every push to `main`.

```bash
cd /opt/docker/dubtracker
docker compose pull && docker compose up -d
docker compose logs -f
```

- **Port:** host `3001` → container `3000`
- **Persistence:** bind mount `./data` (gitignored). Back up = `tar` the stack dir.
- **NPM:** proxy host 19 (`dubs.cineclark.studio`) → `http://192.168.1.111:3001`.

## Local dev

```bash
npm install && npm run dev            # http://localhost:3000
# or containerised:
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

## API

- `GET /api/releases` — the tracked releases + `lastUpdated`
- `GET /api/refresh` — force an RSS fetch now
- `GET /api/cleanup` — force the deleted-post check now

## License

MIT
