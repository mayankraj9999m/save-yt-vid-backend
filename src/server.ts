import express, { type Request, type Response } from 'express';
import cors from 'cors';
import path from 'path';
import os from 'os';
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
        const formats = await ytDownloader.getAvailableFormats(url);
        res.json({ url, formats });
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

    // Default to the user's Downloads folder or use custom location
    const downloadsFolder = customLocation ? path.resolve(customLocation) : path.join(os.homedir(), 'Downloads');

    try {
        logger.info({ event: 'download_started', url, mode, customFormat, dest: downloadsFolder });
        
        // Let the client know the download started successfully
        res.write(`data: ${JSON.stringify({ status: 'starting', destination: downloadsFolder })}\n\n`);

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
            customFormat
        }, onProgress);
        
        logger.info({ event: 'download_complete', filePath });
        res.write(`data: ${JSON.stringify({ status: 'completed', filePath })}\n\n`);
        res.end();

    } catch (error: any) {
        logger.error({ event: 'download_error', error: error.message });
        res.write(`data: ${JSON.stringify({ status: 'error', error: error.message })}\n\n`);
        res.end();
    }
});

app.listen(PORT, () => {
    logger.info(`🚀 Local Downloader API listening on port ${PORT}`);
});
