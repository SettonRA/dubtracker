const express = require('express');
const Parser = require('rss-parser');
const cron = require('node-cron');
const path = require('path');

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
const REDDIT_NEW_JSON_URL = 'https://www.reddit.com/r/Animedubs/new.json';
const STARTUP_HISTORY_DAYS = 5;
const REQUEST_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
};

// Store dub releases in memory (in production, use a database)
let dubReleases = [];

// Function to check if a post is about a dub release
function isDubRelease(title, author) {
  const lc = title.toLowerCase();
  return lc.includes('dub available now on') || lc.includes('full release');
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
}

function mapRssItemToRelease(item) {
  return {
    id: item.id || item.guid,
    title: item.title,
    link: item.link,
    published: item.pubDate,
    author: item.author || 'Unknown',
    contentSnippet: item.contentSnippet || '',
    timestamp: new Date(item.pubDate).getTime()
  };
}

function mapRedditPostToRelease(post) {
  const postDate = new Date((post.created_utc || 0) * 1000);
  return {
    id: post.name || post.id,
    title: post.title,
    link: `https://www.reddit.com${post.permalink || ''}`,
    published: postDate.toISOString(),
    author: post.author || 'Unknown',
    contentSnippet: post.selftext || '',
    timestamp: postDate.getTime()
  };
}

async function backfillRecentReleases(days = STARTUP_HISTORY_DAYS) {
  const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
  const collected = [];
  let after = null;
  let page = 0;
  const maxPages = 15;

  console.log(`Backfilling up to last ${days} day(s) of posts from Reddit JSON...`);

  while (page < maxPages) {
    const url = `${REDDIT_NEW_JSON_URL}?limit=100${after ? `&after=${after}` : ''}`;
    const response = await fetch(url, { headers: REQUEST_HEADERS });

    if (!response.ok) {
      throw new Error(`Reddit JSON fetch failed with status ${response.status}`);
    }

    const payload = await response.json();
    const posts = payload?.data?.children || [];

    if (posts.length === 0) {
      break;
    }

    let reachedOlderPosts = false;

    for (const postWrap of posts) {
      const post = postWrap.data;
      const postTimestamp = (post.created_utc || 0) * 1000;

      if (postTimestamp < cutoff) {
        reachedOlderPosts = true;
        continue;
      }

      if (isDubRelease(post.title, post.author)) {
        collected.push(mapRedditPostToRelease(post));
      }
    }

    after = payload?.data?.after || null;
    page += 1;

    if (!after || reachedOlderPosts) {
      break;
    }

    // Small delay between pages to avoid hammering Reddit.
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  if (collected.length > 0) {
    mergeReleases(collected);
  }

  console.log(`Backfill complete: loaded ${collected.length} release(s) from the last ${days} day(s).`);
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

// Fetch releases on startup
async function bootstrapReleases() {
  try {
    await backfillRecentReleases(STARTUP_HISTORY_DAYS);
  } catch (error) {
    console.error('Startup backfill failed:', error.message);
  }

  await fetchDubReleases();
}

// Schedule to check every 20-40 minutes
function scheduleRandomFetch() {
  const min = 20, max = 40; // minutes
  const interval = Math.floor(Math.random() * (max - min + 1)) + min;
  console.log(`Next fetch in ${interval} minutes.`);
  setTimeout(async () => {
    console.log('Running scheduled fetch...');
    await fetchDubReleases();
    scheduleRandomFetch();
  }, interval * 60 * 1000);
}

bootstrapReleases().then(() => {
  scheduleRandomFetch();
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Anime Dub Tracker running on http://0.0.0.0:${PORT}`);
  console.log(`Checking r/Animedubs every 20-40 minutes for new dub releases`);
});
