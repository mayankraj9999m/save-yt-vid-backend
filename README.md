# Save YT Video - Local API

A lightweight Node.js backend for downloading YouTube videos locally. It uses the `yt-dlp` CLI to download and merge videos directly to your computer's `Downloads` folder at maximum speed.

## Requirements
- Node.js 18+
- Python 3 (Required by yt-dlp)
- FFmpeg (Required for 1080p merging)

## Installation & Setup
```bash
npm install
npm run dev:server
```
The server will start on port `3000`.

## API Routes

### 1. Get Available Formats
Fetch all available video and audio formats for a specific YouTube URL.
- **Endpoint**: `GET /api/formats`
- **Query Parameters**: 
  - `url` (Required): The YouTube video URL
- **Example**: `http://localhost:3000/api/formats?url=https://www.youtube.com/watch?v=WZlTzLwP9jY`

### 2. Get Video Metadata
Fetch metadata (title, duration, filesize, thumbnail, etc.) for a specific YouTube URL and quality mode.
- **Endpoint**: `GET /api/metadata`
- **Query Parameters**: 
  - `url` (Required): The YouTube video URL
  - `mode` (Optional): `OPTIMAL` (default), `BEST`, `CUSTOM`
  - `customFormat` (Optional): Specify format if mode is CUSTOM.
- **Example**: `http://localhost:3000/api/metadata?url=https://www.youtube.com/watch?v=WZlTzLwP9jY&mode=OPTIMAL`

### 3. Download Video Locally
Triggers `yt-dlp` to download the video directly to your computer's `Downloads` folder (e.g. `C:\Users\username\Downloads`), or a custom location you specify. The download happens in the background at maximum multi-connection speeds.
- **Endpoint**: `GET /api/download`
- **Query Parameters**: 
  - `url` (Required): The YouTube video URL
  - `mode` (Optional): `OPTIMAL` (default), `BEST`, `CUSTOM`
  - `customFormat` (Optional): Specify format if mode is CUSTOM.
  - `customLocation` (Optional): An absolute path to a custom download directory.
- **Example Request**: 
```
GET http://localhost:3000/api/download?url=https://www.youtube.com/watch?v=WZlTzLwP9jY&mode=OPTIMAL
```
