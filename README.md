# Anime Dub Tracker

A lightweight web application that monitors [r/Animedubs](https://www.reddit.com/r/Animedubs/) for new dub release announcements and displays them in a clean, easy-to-read interface.

## Features

- 🎬 **Real-time Monitoring** - Checks r/Animedubs RSS feed every 10 minutes
- 🎨 **Clean Interface** - Modern, responsive web UI with dark theme
- 🔗 **Direct Links** - Click any release to go straight to the Reddit post
- ⚡ **Lightweight** - Runs efficiently in a Docker container
- 🔄 **Auto-refresh** - Web page updates every 5 minutes automatically
- 🐳 **Docker Ready** - Easy deployment with Docker Compose

## Screenshot

The tracker displays:
- Release title with link to Reddit post
- Author and timestamp
- Brief content preview
- Manual refresh button

## Quick Start

### Prerequisites

- Docker and Docker Compose installed on your Docker01 server
- Port 3000 available (or change in docker-compose.yml)

### Deployment

1. **Copy the project to your Docker01 server:**
   ```bash
   scp -r AnimeDubTracker user@docker01:/path/to/projects/
   ```

2. **SSH into your Docker01 server:**
   ```bash
   ssh user@docker01
   cd /path/to/projects/AnimeDubTracker
   ```

3. **Build and run with Docker Compose:**
   ```bash
   docker-compose up -d
   ```

4. **Access the tracker:**
   Open your browser to `http://docker01:3000`

### Alternative: Docker Build

If you prefer to build manually:

```bash
# Build the image
docker build -t anime-dub-tracker .

# Run the container
docker run -d -p 3000:3000 --name anime-dub-tracker anime-dub-tracker
```

## Configuration

### Change Port

Edit `docker-compose.yml`:
```yaml
ports:
  - "8080:3000"  # Change 8080 to your desired port
```

### Adjust Check Frequency

Edit `server/index.js` line 75:
```javascript
// Check every 10 minutes (change the cron expression)
cron.schedule('*/10 * * * *', () => {
  // ...
});
```

Cron format: `*/X * * * *` where X is minutes

### Customize Keywords

Edit `server/index.js` lines 18-28 to add/remove keywords for filtering:
```javascript
const DUB_KEYWORDS = [
  'dub available',
  'available now on',
  // Add your keywords here
];
```

## Management

### View Logs
```bash
docker-compose logs -f anime-dub-tracker
```

### Stop the Tracker
```bash
docker-compose down
```

### Restart
```bash
docker-compose restart
```

### Update
```bash
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

## Development

### Local Development (without Docker)

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Run in development mode:**
   ```bash
   npm run dev
   ```

3. **Access locally:**
   Open `http://localhost:3000`

## API Endpoints

- `GET /api/releases` - Returns JSON with all tracked dub releases
- `POST /api/refresh` - Manually triggers a refresh of the RSS feed

## Project Structure

```
AnimeDubTracker/
├── server/
│   └── index.js          # Backend server and RSS parser
├── public/
│   ├── index.html        # Main web interface
│   ├── css/
│   │   └── styles.css    # Styling
│   └── js/
│       └── app.js        # Frontend JavaScript
├── Dockerfile            # Docker image configuration
├── docker-compose.yml    # Docker Compose setup
├── package.json          # Node.js dependencies
└── README.md            # This file
```

## How It Works

1. **Backend** fetches the r/Animedubs RSS feed every 10 minutes
2. **Filters** posts based on keywords (dub available, episode names, streaming services)
3. **Stores** up to 100 most recent releases in memory
4. **Serves** a REST API and static web interface
5. **Frontend** auto-refreshes every 5 minutes and displays releases with links

## Reverse Proxy Setup

If you want to access it via a domain (e.g., `anime.yourdomain.com`):

### Using Nginx Proxy Manager

1. Add a new Proxy Host
2. Domain: `anime.yourdomain.com`
3. Forward Hostname/IP: `docker01` (or IP)
4. Forward Port: `3000`
5. Enable SSL if desired

### Using Nginx

```nginx
server {
    listen 80;
    server_name anime.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Troubleshooting

### Container won't start
```bash
# Check logs
docker-compose logs

# Verify port isn't in use
netstat -tulpn | grep 3000
```

### No releases showing up
- Check if the RSS feed is accessible: `curl https://www.reddit.com/r/Animedubs/new/.rss`
- Reddit may rate-limit requests; wait a few minutes
- Check container logs for errors

### Web page not loading
- Ensure port 3000 is accessible
- Check firewall rules
- Verify container is running: `docker ps`

## License

MIT

## Credits

Built for tracking anime dub releases from the r/Animedubs community.
