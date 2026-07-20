<div align="center">
  <h1>Classic TV Guide Video Player</h1>
  <p>A dynamic video playlist manager with date-based scheduling, calendar selection, and automated daily playlist refresh.</p>
</div>

---

## Overview

**Classic TV Guide Video Player** is a web application that manages and plays video playlists organized by date. The app automatically loads fresh playlists daily, allows users to browse historical playlists via a calendar modal, and provides a customizable video player with thumbnail support.

### Key Features

- **Scheduled Playlist Loading** — Automatically loads today's playlist on page load
- **Calendar Selection** — Browse and select playlists from any available date
- **Multiple Format Support** — Parse playlists from `.m3u`, `.json`, `.xml`, and `.csv` files
- **Fallback Logic** — Continues playing last loaded playlist if no fresh file is found
- **Custom Thumbnails** — Display video thumbnails with SVG/image fallback
- **Background Worker** — Continuously monitors playlist folder for updates
- **Lazy Loading** — Efficient loading of historical playlists on demand
- **GitHub Actions Automation** — Daily scheduled refresh of playlist files

---

## Project Structure

Classic-TV-Guide-Video-Player/
├── src/
│   ├── components/
│   │   ├── VideoPlayer/
│   │   │   ├── VideoPlayer.ts
│   │   │   └── VideoPlayer.css
│   │   ├── Calendar/
│   │   │   ├── CalendarModal.ts
│   │   │   └── CalendarModal.css
│   │   └── PlaylistManager/
│   │       └── PlaylistManager.ts
│   ├── services/
│   │   ├── playlistService.ts
│   │   ├── fileParser.ts
│   │   ├── dateOrganizer.ts
│   │   └── workerService.ts
│   ├── workers/
│   │   └── playlistUpdater.worker.ts
│   ├── types/
│   │   ├── playlist.ts
│   │   ├── video.ts
│   │   └── fileFormats.ts
│   ├── utils/
│   ├── styles/
│   └── main.ts
├── playlists/
│   ├── 2026-07-19/
│   │   ├── schedule.m3u (or .json, .xml, .csv)
│   │   └── metadata.json
│   └── [archived dates]/
├── assets/
│   ├── thumbnails/
│   └── default-thumbnail.svg
├── .github/workflows/
│   ├── daily-refresh.yml
│   └── deploy.yml
├── tests/
├── vite.config.ts
├── tsconfig.json
├── package.json
└── README.md

---

## Prerequisites

- **Node.js** 18+ (for running locally and building)
- **npm** or **yarn** (package manager)
- **Playlist files** in supported formats (`.m3u`, `.json`, `.xml`, `.csv`)

---

## Installation & Setup

### 1. Clone the Repository

```bash
git clone https://github.com/banamine/Classic-TV-Guide-Video-Player.git
cd Classic-TV-Guide-Video-Player

npm install
2. Install Dependencies
bash


npm install
3. Create Playlist Folder Structure
bash


mkdir -p playlists/\$(date +%Y-%m-%d)
mkdir -p assets/thumbnails
4. Add Your First Playlist
Place a playlist file in playlists/YYYY-MM-DD/ directory:

bash


# Example: playlists/2026-07-19/schedule.m3u
#EXTM3U
#EXTINF:-1,Video Title 1
http://example.com/video1.mp4
#EXTINF:-1,Video Title 2
http://example.com/video2.mp4
5. Run Locally
bash


npm run dev
The app will start at http://localhost:5173 (or next available port).

Usage
Video Player Page
Open the app — it automatically loads today's playlist (if available)
Videos play in the custom video player
Browse the queue of upcoming videos
If no fresh playlist exists, the last loaded playlist continues playing
Calendar Modal
Click the Calendar button on the video player page
Select any date with an available playlist
That date's playlist loads and begins playing
Close the modal to return to the player
Adding New Playlists
Simply add files to the playlists/YYYY-MM-DD/ folder:

schedule.m3u — M3U format (common for media players)
schedule.json — JSON format (for structured metadata)
schedule.xml — XML format
schedule.csv — CSV format
The app will automatically detect and load new files.

Supported File Formats
M3U (.m3u)


#EXTM3U
#EXTINF:-1,Title
http://url/video.mp4
JSON (.json)
json


{
  "playlist": [
    {
      "title": "Video Title",
      "url": "http://url/video.mp4",
      "thumbnail": "http://url/thumb.jpg",
      "duration": 3600
    }
  ]
}
XML (.xml)
xml


<?xml version="1.0"?>
<playlist>
  <video>
    <title>Video Title</title>
    <url>http://url/video.mp4</url>
    <thumbnail>http://url/thumb.jpg</thumbnail>
  </video>
</playlist>
CSV (.csv)


title,url,thumbnail,duration
"Video Title","http://url/video.mp4","http://url/thumb.jpg",3600
Configuration
Custom Thumbnails
Place thumbnail images in assets/thumbnails/
Reference thumbnails in your playlist metadata
If a video has no thumbnail, a default SVG is displayed
Thumbnail Fallback
The app provides a default SVG thumbnail (assets/default-thumbnail.svg) for videos without custom images. You can customize this by editing the SVG file.

Scripts
bash


# Development
npm run dev              # Run dev server with hot reload

# Build
npm run build            # Build for production

# Preview
npm run preview          # Preview production build locally

# Playlist Management
npm run check-playlists  # Check for new playlist files
npm run build-playlist-index  # Generate playlist index

# Testing (optional)
npm run test             # Run unit tests
GitHub Actions Automation
Daily Playlist Refresh
The .github/workflows/daily-refresh.yml workflow runs daily at midnight UTC to:

Check for new playlist files in the playlists/ folder
Update the playlist index
Commit and push changes to the repository
To enable:

Ensure .github/workflows/daily-refresh.yml exists
Commit changes to trigger the workflow
Monitor Actions tab in GitHub for workflow runs
Manual Trigger
You can manually trigger the daily refresh:

Go to Actions tab in your GitHub repository
Select Daily Playlist Refresh workflow
Click Run workflow
Development
Project Architecture
TypeScript — Type-safe development
Vite — Fast build tool and dev server
Web Workers — Background monitoring without blocking UI
Modular Services — Separation of concerns (parsing, loading, organizing)
Key Services
Service	Purpose
PlaylistService	Load playlists, handle fallbacks, manage state
FileParser	Parse m3u, json, xml, csv formats
DateOrganizer	Organize files by date, find available dates
WorkerService	Manage Web Worker for background monitoring
Adding New Features
Create a feature branch: git checkout -b feature/your-feature
Make changes in src/
Test locally: npm run dev
Build and verify: npm run build
Commit and push: git push origin feature/your-feature
Open a Pull Request
Deployment
GitHub Pages
bash


npm run build
# Push dist/ folder to gh-pages branch
git push origin --force-with-lease gh-pages
Other Hosting
The app is a static TypeScript/Vite project. Deploy the dist/ folder to any static hosting:

Vercel
Netlify
GitHub Pages
AWS S3
Any static web server
Troubleshooting
Playlist Not Loading
Check folder structure — Ensure playlist files are in playlists/YYYY-MM-DD/ format
Verify file format — Use a supported format (.m3u, .json, .xml, .csv)
Check console — Open browser DevTools (F12) → Console tab for error messages
Check date — Ensure the date folder matches today's date (or a selected date)
Videos Not Playing
Verify video URLs — Ensure URLs in playlist are correct and accessible
Check CORS — Video URLs may be blocked by CORS policies
Check format — Verify playlist format is correctly structured
Browser support — Ensure your browser supports the video codec
Thumbnails Not Showing
Check thumbnail paths — Verify thumbnail URLs in playlist metadata
Check asset folder — Ensure assets/thumbnails/ folder exists
Use fallback — If thumbnail missing, default SVG will display
Contributing
Contributions are welcome! To contribute:

Fork the repository
Create a feature branch (git checkout -b feature/improvement)
Make your changes
Test thoroughly
Commit with clear messages
Push to your branch
Open a Pull Request
License
This project is licensed under the MIT License — see the LICENSE [blocked] file for details.

---

## Key Changes Made:

1. **Removed Google AI Studio references** — This isn't a Gemini API app, it's a video player
2. **Removed API key requirements** — The app uses user-provided playlist files, not external APIs
3. **Added accurate project overview** — Explains what the app actually does
4. **Added detailed folder structure** — Shows where playlists go
5. **Added usage instructions** — How to use the video player and calendar
6. **Documented all supported file formats** — With examples
7. **Added automation docs** — GitHub Actions setup
8. **Added troubleshooting** — Common issues and solutions
9. **Added development guide** — For contributors
10. **Removed deployment to AI Studio** — Replaced with standard hosting options

This README now accurately represents your Classic TV Guide Video Player project!
Support
For issues, feature requests, or questions:

GitHub Issues — Create an issue in the repository
Discussions — Use GitHub Discussions for general questions
Documentation — Check the /docs folder for detailed guides
Roadmap
 Basic video player
 Calendar date selection
 Playlist parser (m3u, json, xml, csv)
 Background worker for monitoring
 GitHub Actions daily refresh
 Thumbnail system with fallbacks
 Lazy-loading old playlists
 Advanced playlist filtering
 User preferences/settings
 Mobile responsive design
