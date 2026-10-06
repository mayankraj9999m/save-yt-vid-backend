import express, { type Request, type Response } from 'express';
import cors from 'cors';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { YouTubeDownloader, type QualityMode } from './helpers/YTDownloader.js';
import { logger } from './utils/logger.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const ytDownloader = new YouTubeDownloader();

app.get('/api/formats', async (req: Request, res: Response): Promise<void> => {
    const url = req.query.url as string;
    if (!url) {
        res.status(400).json({ error: "YouTube URL is required" });
        return;
    }

    try {
        const result = await ytDownloader.getAvailableFormats(url);
        res.json({ url, formats: result.formats, info: result.info });
    } catch (error: any) {
        logger.error({ event: 'formats_fetch_error', error: error.message });
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/metadata', async (req: Request, res: Response): Promise<void> => {
    const url = req.query.url as string;
    const mode = (req.query.mode as string) || 'OPTIMAL';
    const customFormat = req.query.customFormat as string | undefined;

    if (!url) {
        res.status(400).json({ error: "YouTube URL is required" });
        return;
    }

    const validModes = ["BEST", "OPTIMAL", "CUSTOM"];
    if (!validModes.includes(mode)) {
        res.status(400).json({ error: `Invalid mode provided. Valid modes are: ${validModes.join(", ")}` });
        return;
    }

    try {
        const metadata = await ytDownloader.fetchSelectedMetadata(url, mode as QualityMode, customFormat);
        res.json(metadata);
    } catch (error: any) {
        logger.error({ event: 'metadata_fetch_error', error: error.message });
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/download', async (req: Request, res: Response): Promise<void> => {
    const url = req.query.url as string;
    const mode = (req.query.mode as string) || 'OPTIMAL';
    const customFormat = req.query.customFormat as string | undefined;
    const downloadId = (req.query.id as string) || Math.random().toString(36).substring(2, 15);
    const customLocation = req.query.customLocation as string | undefined;

    if (!url) {
        res.status(400).json({ error: "YouTube URL is required" });
        return;
    }

    const validModes = ["BEST", "OPTIMAL", "CUSTOM"];
    if (!validModes.includes(mode)) {
        res.status(400).json({ error: `Invalid mode provided. Valid modes are: ${validModes.join(", ")}` });
        return;
    }

    // Set headers for Server-Sent Events (SSE)
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();


    // Use custom location or default to user's Downloads folder
    const downloadsFolder = customLocation 
        ? path.resolve(customLocation)
        : path.join(os.homedir(), 'Downloads', 'save-yt-video');
        
    if (!fs.existsSync(downloadsFolder)) {
        fs.mkdirSync(downloadsFolder, { recursive: true });
    }

    try {
        logger.info({ event: 'download_started', url, mode, customFormat, dest: downloadsFolder, id: downloadId });

        // Let the client know the download started successfully and give them the ID to cancel/pause
        res.write(`data: ${JSON.stringify({ status: 'starting', destination: downloadsFolder, id: downloadId })}\n\n`);

        // Throttle progress updates to 1 per second
        let lastSentTime = 0;
        const onProgress = (line: string) => {
            const now = Date.now();
            if (now - lastSentTime > 1000) {
                res.write(`data: ${JSON.stringify({ status: 'downloading', log: line.trim() })}\n\n`);
                lastSentTime = now;
            }
        };

        const filePath = await ytDownloader.downloadVideo({
            url,
            mode: mode as QualityMode,
            outputPath: downloadsFolder,
            customFormat,
            id: downloadId
        }, onProgress);

        logger.info({ event: 'download_complete', filePath });
        res.write(`data: ${JSON.stringify({ status: 'completed', filePath })}\n\n`);
        res.end();

    } catch (error: any) {
        logger.error({ event: 'download_error', error: error.message, id: downloadId });
        res.write(`data: ${JSON.stringify({ status: 'error', error: error.message, id: downloadId })}\n\n`);
        res.end();
    }
});

// Route to cancel a download
app.post('/api/download/cancel', (req: Request, res: Response) => {
    const { id } = req.body;
    if (!id) {
        res.status(400).json({ error: "Download ID is required" });
        return;
    }

    const cancelled = ytDownloader.cancelDownload(id);
    if (cancelled) {
        logger.info({ event: 'download_cancelled', id });
        res.json({ success: true, message: "Download cancelled successfully." });
    } else {
        res.status(404).json({ error: "Download not found or already completed." });
    }
});

// Route to pause a download
// Note: yt-dlp automatically resumes from partial .part files. 
// "Pausing" is achieved by killing the process (cancelling). 
// To resume, the client just requests /api/download again with the same URL and output path.
app.post('/api/download/pause', (req: Request, res: Response) => {
    const { id } = req.body;
    if (!id) {
        res.status(400).json({ error: "Download ID is required" });
        return;
    }

    const paused = ytDownloader.cancelDownload(id);
    if (paused) {
        logger.info({ event: 'download_paused', id });
        res.json({ success: true, message: "Download paused successfully. Call /api/download again to resume." });
    } else {
        res.status(404).json({ error: "Download not found or already completed." });
    }
});

app.listen(PORT, () => {
    logger.info(`🚀 Local Downloader API listening on port ${PORT}`);
});