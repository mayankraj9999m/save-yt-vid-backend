# Save YT Video - Backend API

A high-performance Node.js streaming proxy for downloading YouTube videos on the fly. This backend uses `yt-dlp` to extract streaming URLs and pipes the video directly to the client. For high-quality videos (1080p), it uses FFmpeg to live-merge the audio and video tracks without saving anything to the server's disk.

## Requirements
- Node.js 18+
- Python 3 (Required by yt-dlp)
- FFmpeg (Required for 1080p stream merging)

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

### 2. Stream Optimal Quality (1080p)
Downloads the best video stream (up to 1080p) and the best audio stream, and merges them live into an `.mkv` file.
- **Endpoint**: `GET /api/stream/optimal`
- **Query Parameters**: 
  - `url` (Required): The YouTube video URL
- **Example**: `http://localhost:3000/api/stream/optimal?url=https://www.youtube.com/watch?v=WZlTzLwP9jY`

### 3. Stream Best Single Format (720p max)
Downloads the best pre-merged `.mp4` format available directly from YouTube (usually 720p) without needing FFmpeg. Faster, and fully supports pausing/resuming.
- **Endpoint**: `GET /api/stream/best`
- **Query Parameters**: 
  - `url` (Required): The YouTube video URL
- **Example**: `http://localhost:3000/api/stream/best?url=https://www.youtube.com/watch?v=WZlTzLwP9jY`

### 4. Stream Custom Format
Allows you to specify exact `yt-dlp` format IDs to stream.
- **Endpoint**: `GET /api/stream/custom`
- **Query Parameters**: 
  - `url` (Required): The YouTube video URL
  - `customFormat` (Required): The format ID (e.g. `137+140` for 1080p video + m4a audio, or just `18` for 360p mp4).
- **Example**: `http://localhost:3000/api/stream/custom?url=https://www.youtube.com/watch?v=WZlTzLwP9jY&customFormat=137+140`
