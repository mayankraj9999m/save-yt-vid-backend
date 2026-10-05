import express, { type Request, type Response } from 'express';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
import { YouTubeDownloader } from './helpers/YTDownloader.js';
import { ThrottleTransform } from './utils/ThrottleTransform.js';
import { logger } from './utils/logger.js';
import { pipeline } from 'stream/promises';
import https from 'https';
import { IncomingMessage } from 'http';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Rate Limiting: max 20 requests per hour per IP
const streamLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 20000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many streaming requests from this IP, please try again after an hour" }
});

const ytDownloader = new YouTubeDownloader();

/**
 * Monitors the stream for memory and backpressure events
 */
import { type QualityMode } from './helpers/YTDownloader.js';
import { spawn } from 'child_process';
import { Readable } from 'stream';

function monitorStream(clientRes: Response, upstreamRes: Readable, clientId: string) {
    let bytesTransferred = 0;
    const startTime = Date.now();

    upstreamRes.on('data', (chunk) => {
        bytesTransferred += chunk.length;
    });

    clientRes.on('drain', () => {
        logger.info({
            event: 'backpressure_drain',
            clientId,
            memoryMB: (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)
        });
    });

    clientRes.on('close', () => {
        const duration = (Date.now() - startTime) / 1000;
        const speedMbps = duration > 0 ? ((bytesTransferred * 8) / duration / 1_000_000).toFixed(2) : "0";

        logger.info({
            event: 'stream_complete_or_aborted',
            clientId,
            bytesTransferred,
            durationSecs: duration.toFixed(2),
            speedMbps,
            finalMemoryHeapMB: (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)
        });
    });
}

async function handleStreamRequest(req: Request, res: Response, mode: QualityMode) {
    const url = req.query.url as string;
    const customFormat = req.query.customFormat as string | undefined;
    const clientId = req.ip || Math.random().toString(36).substring(7);

    if (!url) {
        res.status(400).json({ error: "YouTube URL is required" });
        return;
    }

    try {
        logger.info({ event: 'stream_requested', url, mode, customFormat, clientId });

        const formatString = ytDownloader.generateFormattedString(mode, customFormat);
        if (!formatString) {
            res.status(400).json({ error: "Invalid mode or missing customFormat" });
            return;
        }

        const directUrls = await ytDownloader.getDirectStreamUrl(url, formatString);

        if (directUrls.length === 0) {
            res.status(500).json({ error: "Could not extract direct stream URL" });
            return;
        }

        const upstreamThrottle = new ThrottleTransform(50 * 1024 * 1024);
        const downstreamThrottle = new ThrottleTransform(50 * 1024 * 1024);

        if (directUrls.length === 1) {
            const mediaUrl = directUrls[0];
            if (!mediaUrl) {
                res.status(500).json({ error: "Media URL is missing" });
                return;
            }
            const options: https.RequestOptions = {};
            if (req.headers.range) {
                options.headers = { 'Range': req.headers.range };
            }

            const httpsReq = https.get(mediaUrl, options, (upstreamResponse) => {
                res.status(upstreamResponse.statusCode || 200);

                const headersToProxy = [
                    'content-type',
                    'content-length',
                    'content-range',
                    'accept-ranges'
                ];

                headersToProxy.forEach(header => {
                    if (upstreamResponse.headers[header]) {
                        res.setHeader(header, upstreamResponse.headers[header] as string);
                    }
                });

                if (!upstreamResponse.headers['content-type']) {
                    res.setHeader('Content-Type', 'video/mp4');
                }

                // Force the browser to download the file instead of playing it
                res.setHeader('Content-Disposition', 'attachment; filename="video.mp4"');

                monitorStream(res, upstreamResponse, clientId);

                req.on('close', () => {
                    upstreamResponse.destroy();
                    httpsReq.destroy();
                });

                pipeline(
                    upstreamResponse,
                    upstreamThrottle,
                    downstreamThrottle,
                    res
                ).catch(err => {
                    logger.error({ event: 'pipeline_error', error: err.message, clientId });
                });
            });

            httpsReq.on('error', (err) => {
                logger.error({ event: 'https_get_error', error: err.message, clientId });
                if (!res.headersSent) {
                    res.status(500).json({ error: "Failed to connect to YouTube CDN" });
                }
            });
        } else {
            const videoUrl = directUrls[0];
            const audioUrl = directUrls[1];

            if (!videoUrl || !audioUrl) {
                res.status(500).json({ error: "Missing video or audio URL for merge" });
                return;
            }

            const ffmpegProcess = spawn('ffmpeg', [
                '-i', videoUrl,
                '-i', audioUrl,
                '-c', 'copy',
                '-f', 'matroska',
                'pipe:1'
            ]);

            res.setHeader('Content-Type', 'video/x-matroska');
            res.setHeader('Transfer-Encoding', 'chunked');
            res.setHeader('Content-Disposition', 'attachment; filename="video.mkv"');

            monitorStream(res, ffmpegProcess.stdout, clientId);

            req.on('close', () => {
                ffmpegProcess.kill('SIGKILL');
            });

            pipeline(
                ffmpegProcess.stdout,
                upstreamThrottle,
                downstreamThrottle,
                res
            ).catch(err => {
                ffmpegProcess.kill('SIGKILL');
                logger.error({ event: 'pipeline_error', error: err.message, clientId });

            });
        }
    } catch (error: any) {
        logger.error({ event: 'stream_extraction_error', error: error.message, clientId });
        res.status(500).json({ error: error.message });
    }
}

app.get('/api/formats', streamLimiter, async (req: Request, res: Response): Promise<void> => {
    const url = req.query.url as string;
    if (!url) {
        logger.error({ event: 'formats_fetch_error', error: "YouTube URL is required" });
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

app.get('/api/stream/optimal', streamLimiter, (req, res) => handleStreamRequest(req, res, 'OPTIMAL'));
app.get('/api/stream/best', streamLimiter, (req, res) => handleStreamRequest(req, res, 'BEST'));
app.get('/api/stream/custom', streamLimiter, (req, res) => handleStreamRequest(req, res, 'CUSTOM'));

app.listen(PORT, () => {
    logger.info(`🚀 Streaming server listening on port ${PORT}`);
});
