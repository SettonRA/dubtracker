const express = require('express');
const Parser = require('rss-parser');
const path = require('path');
const fs = require('fs');

const app = express();
const parser = new Parser({
  customFields: {
    item: [['content:encoded', 'contentEncoded']]
  },
  requestOptions: {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
    }
  }
});

const PORT = process.env.PORT || 3000;
const RSS_URL = 'https://www.reddit.com/r/Animedubs/new/.rss';
const REQUEST_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
};

// Release list. Kept in memory for serving; persisted to a JSON file on the
// bind-mounted ./data dir so it survives restarts (Reddit's unauthenticated
// JSON API 403s server-side, so there's no multi-day backfill to fall back on).
let dubReleases = [];

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../data');
const STORE_FILE = path.join(DATA_DIR, 'releases.json');

function loadReleases() {
  try {
    const parsed = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
    if (Array.isArray(parsed)) {
      dubReleases = parsed;
      console.log(`Loaded ${dubReleases.length} release(s) from ${STORE_FILE}`);
    }
  } catch (err) {
    if (err.code !== 'ENOENT') console.error('Could not load stored releases:', err.message);
  }
}

let saveTimer = null;
function saveReleases() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(STORE_FILE, JSON.stringify(dubReleases), 'utf8');
    } catch (err) {
      console.error('Could not save releases:', err.message);
    }
  }, 1000);
}

// Function to check if a post is about a dub release
function isDubRelease(title, author) {
  const lc = title.toLowerCase();
  const hasEpisode = /\bepisodes?\b/.test(lc);
  const hasAvailable = lc.includes('available');
  return (hasEpisode && hasAvailable) || lc.includes('full release');
}

function normalizeRedditId(id) {
  if (!id) return id;
  if (/^t3_[a-z0-9]+$/i.test(id)) return id;
  const urlMatch = id.match(/\/comments\/([a-z0-9]+)\//i);
  if (urlMatch) return `t3_${urlMatch[1]}`;
  return id;
}

function extractPostFullname(release) {
  // Check if id is already a Reddit fullname (t3_xxxxx)
  if (release.id && /^t3_[a-z0-9]+$/i.test(release.id)) {
    return release.id;
  }
  // Extract post ID from the link URL
  const match = release.link && release.link.match(/\/comments\/([a-z0-9]+)\//i);
  if (match) return `t3_${match[1]}`;
  return null;
}

async function checkForDeletedPosts() {
  if (dubReleases.length === 0) return 0;

  // Only check posts older than 24 hours to reduce API load
  const cutoff = Date.now() - (24 * 60 * 60 * 1000);
  const toCheck = dubReleases.filter(r => r.timestamp < cutoff);
  if (toCheck.length === 0) return 0;

  const deletedFullnames = new Set();

  for (const release of toCheck) {
    const fn = extractPostFullname(release);
    if (!fn) continue;

    const postId = fn.replace(/^t3_/, '');
    const url = `https://www.reddit.com/r/Animedubs/comments/${postId}.json`;

    try {
      const response = await fetch(url, { headers: REQUEST_HEADERS });
      if (response.status === 404) {
        deletedFullnames.add(fn);
      } else if (response.ok) {
        const data = await response.json();
        const post = data?.[0]?.data?.children?.[0]?.data;
        if (post && (post.author === '[deleted]' || post.removed_by_category)) {
          deletedFullnames.add(fn);
        }
      }
    } catch (err) {
      // Skip on network error, will retry next cleanup cycle
    }

    // Pace requests to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  if (deletedFullnames.size > 0) {
    const before = dubReleases.length;
    dubReleases = dubReleases.filter(release => {
      const fn = extractPostFullname(release);
      return !fn || !deletedFullnames.has(fn);
    });
    const removed = before - dubReleases.length;
    console.log(`Removed ${removed} deleted/removed post(s) from the list`);
    if (removed > 0) saveReleases();
    return removed;
  }

  return 0;
}

function mergeReleases(releases) {
  const merged = [...releases, ...dubReleases];
  const deduped = [];
  const seenIds = new Set();

  for (const release of merged) {
    if (!seenIds.has(release.id)) {
      seenIds.add(release.id);
      deduped.push(release);
    }
  }

  dubReleases = deduped
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 100);

  saveReleases();
}

function mapRssItemToRelease(item) {
  return {
    id: normalizeRedditId(item.id || item.guid),
    title: item.title,
    link: item.link,
    published: item.pubDate,
    author: item.author || 'Unknown',
    contentSnippet: item.contentSnippet || '',
    timestamp: new Date(item.pubDate).getTime()
  };
}

// Function to fetch and parse Reddit RSS feed
async function fetchDubReleases() {
  try {
    console.log('Fetching Reddit RSS feed...');
    const feed = await parser.parseURL(RSS_URL);
    
    // Debug: Log first item to see structure
    if (feed.items.length > 0) {
      console.log('Sample item:', JSON.stringify(feed.items[0], null, 2));
    }

    const newReleases = feed.items
      .filter(item => {
        const result = isDubRelease(item.title, item.author);
        console.log(`Filtering: "${item.title}" by "${item.author}" -> ${result}`);
        return result;
      })
      .map(mapRssItemToRelease)
      .sort((a, b) => b.timestamp - a.timestamp);

    const countBefore = dubReleases.length;
    mergeReleases(newReleases);
    const addedCount = dubReleases.length - countBefore;

    if (addedCount > 0) {
      console.log(`Found ${addedCount} new dub release(s)`);
    }

    return newReleases;
  } catch (error) {
    console.error('Error fetching RSS feed:', error.message);
    return [];
  }
}

// Serve static files from public directory with cache control
app.use(express.static(path.join(__dirname, '../public'), {
  setHeaders: (res, path) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
}));

// API endpoint to get dub releases
app.get('/api/releases', (req, res) => {
  res.json({
    releases: dubReleases,
    lastUpdated: new Date().toISOString()
  });
});

// API endpoint to manually trigger refresh
app.get('/api/refresh', async (req, res) => {
  await fetchDubReleases();
  res.json({ success: true, count: dubReleases.length });
});

// API endpoint to manually check for and remove deleted posts
app.get('/api/cleanup', async (req, res) => {
  const removed = await checkForDeletedPosts();
  res.json({ success: true, removed, remaining: dubReleases.length });
});

// Load the persisted list, then top it up from RSS — retrying a few times so a
// transient network/DNS hiccup on boot doesn't leave the list stale.
async function bootstrapReleases() {
  loadReleases();
  for (let attempt = 1; attempt <= 5; attempt++) {
    const items = await fetchDubReleases();
    if (items.length > 0 || dubReleases.length > 0) return;
    console.log(`Startup fetch empty (attempt ${attempt}/5) — retrying in 30s`);
    await new Promise(resolve => setTimeout(resolve, 30000));
  }
}

// Schedule to check every 15-25 minutes
function scheduleRandomFetch() {
  const min = 15, max = 25; // minutes
  const interval = Math.floor(Math.random() * (max - min + 1)) + min;
  console.log(`Next fetch in ${interval} minutes.`);
  setTimeout(async () => {
    console.log('Running scheduled fetch...');
    await fetchDubReleases();
    scheduleRandomFetch();
  }, interval * 60 * 1000);
}

// Separate cleanup schedule — every 2 hours, using individual post checks
function scheduleCleanup() {
  setTimeout(async () => {
    console.log('Running scheduled deleted-post cleanup...');
    await checkForDeletedPosts();
    scheduleCleanup();
  }, 2 * 60 * 60 * 1000);
}

bootstrapReleases().then(() => {
  scheduleRandomFetch();
  scheduleCleanup();
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Anime Dub Tracker running on http://0.0.0.0:${PORT}`);
  console.log(`Checking r/Animedubs every 20-40 minutes for new dub releases`);
});
