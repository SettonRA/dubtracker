// Auto-refresh every 5 minutes
const AUTO_REFRESH_INTERVAL = 5 * 60 * 1000;

let autoRefreshTimer = null;

// Fetch and display releases
async function fetchReleases() {
    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error');
    const releasesEl = document.getElementById('releases');
    const noReleasesEl = document.getElementById('noReleases');

    try {
        loadingEl.style.display = 'block';
        errorEl.style.display = 'none';
        releasesEl.innerHTML = '';
        noReleasesEl.style.display = 'none';

        const response = await fetch('/api/releases');
        if (!response.ok) throw new Error('Failed to fetch');

        const data = await response.json();
        loadingEl.style.display = 'none';

        updateLastUpdated(data.lastUpdated);

        if (data.releases.length === 0) {
            noReleasesEl.style.display = 'block';
            return;
        }

        displayReleases(data.releases);
        
        // Reset auto-refresh timer
        resetAutoRefresh();
    } catch (error) {
        console.error('Error fetching releases:', error);
        loadingEl.style.display = 'none';
        errorEl.style.display = 'block';
    }
}

// Display releases in the UI
function displayReleases(releases) {
    const releasesEl = document.getElementById('releases');
    
    releases.forEach(release => {
        const card = createReleaseCard(release);
        releasesEl.appendChild(card);
    });
}

// Create a release card element
function createReleaseCard(release) {
    const publishedDate = new Date(release.published);
    const timeAgo = getTimeAgo(publishedDate);
    
    // Check for special episode types
    const normalizedTitle = release.title.toUpperCase();
    const isPremiere = normalizedTitle.includes('PREMIERE');
    const isFinale = normalizedTitle.includes('FINALE') || normalizedTitle.includes('FINAL');
    const isFullRelease = normalizedTitle.includes('FULL RELEASE');
    const titleClass = isPremiere ? 'premiere' : (isFinale ? 'finale' : (isFullRelease ? 'full-release' : ''));
    const cardClass = `release-card ${titleClass}`;
    
    const card = document.createElement('div');
    card.className = cardClass;

    card.innerHTML = `
        <div class="release-header">
            <div class="release-title ${titleClass}">
                <h2><a href="${release.link}" target="_blank" rel="noopener noreferrer">${escapeHtml(release.title)}</a></h2>
            </div>
        </div>
        <div class="release-meta">
            <div class="meta-item">
                <span>🕒</span>
                <span>${timeAgo}</span>
            </div>
            <div class="meta-item">
                <span>📅</span>
                <span>${publishedDate.toLocaleDateString()}</span>
            </div>
            <button class="download-btn" data-title="${escapeHtml(release.title)}" title="Add to Sonarr">
                ⬇️
            </button>
        </div>
    `;

    // Add click handler for download button
    const downloadBtn = card.querySelector('.download-btn');
    downloadBtn.addEventListener('click', () => openInSonarr(downloadBtn));

    return card;
}

// Calculate time ago
function getTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    
    const intervals = {
        year: 31536000,
        month: 2592000,
        week: 604800,
        day: 86400,
        hour: 3600,
        minute: 60
    };

    for (const [unit, secondsInUnit] of Object.entries(intervals)) {
        const interval = Math.floor(seconds / secondsInUnit);
        if (interval >= 1) {
            return `${interval} ${unit}${interval > 1 ? 's' : ''} ago`;
        }
    }

    return 'Just now';
}

// Update last updated timestamp
function updateLastUpdated(timestamp) {
    const lastUpdatedEl = document.getElementById('lastUpdated');
    const date = new Date(timestamp);
    lastUpdatedEl.textContent = `Last updated: ${date.toLocaleTimeString()}`;
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Open show in Sonarr
function openInSonarr(button) {
    const fullTitle = button.getAttribute('data-title');
    // Extract just the show title (everything before " - Episode", " - Season", or " - Dub")
    const title = fullTitle.split(' - ')[0];
    
    // URL encode the title for the search parameter
    const encodedTitle = encodeURIComponent(title);
    const sonarrUrl = `https://anime.cineclark.studio/add/new?term=${encodedTitle}`;
    
    // Open in new tab
    window.open(sonarrUrl, '_blank', 'noopener,noreferrer');
    
    // Visual feedback
    const originalText = button.textContent;
    button.textContent = '✅';
    button.style.background = 'var(--success)';
    
    setTimeout(() => {
        button.textContent = originalText;
        button.style.background = '';
    }, 1500);
}

// Reset auto-refresh timer
function resetAutoRefresh() {
    if (autoRefreshTimer) {
        clearTimeout(autoRefreshTimer);
    }
    autoRefreshTimer = setTimeout(() => {
        console.log('Auto-refreshing...');
        fetchReleases();
    }, AUTO_REFRESH_INTERVAL);
}

// Manual refresh button
document.getElementById('refreshBtn').addEventListener('click', async () => {
    const btn = document.getElementById('refreshBtn');
    btn.disabled = true;
    btn.textContent = '🔄 Refreshing...';
    
    await fetchReleases();
    
    btn.disabled = false;
    btn.textContent = '🔄 Refresh';
});

// Initial load
fetchReleases();
