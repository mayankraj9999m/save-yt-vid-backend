import { spawn } from "child_process";

import * as path from "path";
import * as Utils from "../utils/utils.js";
import YTDlpLogger from "./YTLogger.js";

// ==========================================
// Types and Interfaces
// ==========================================
type QualityMode = "BEST" | "OPTIMAL" | "CUSTOM";

interface DownloadConfig {
    url: string;
    mode: QualityMode;
    outputPath: string;
    customFormat?: string | undefined;
}

interface SelectedVideoMetadata {
    name: string;
    uploadDate: string;
    fileSize: string | null;
    videoId: string;
    audioId: string;
    thumbnail: string;
    duration: number | null;
}

class YouTubeDownloader {
    public generateFormattedString(mode: QualityMode, customFormat: string | undefined): string | undefined {
        let format: string | undefined;
        switch (mode) {
            case "BEST":
                format = "bestvideo+bestaudio/best";
                break;
            case "OPTIMAL":
                format = "bestvideo[ext=mp4][height<=1080]+bestaudio[ext=m4a]/best[ext=mp4][height<=1080]/best";
                break;
            case "CUSTOM":
                if (!customFormat) {
                    throw new Error("Custom format is missing for CUSTOM mode.");
                }
                format = customFormat;
                break;
        }

        return format;
    }

    // List all formats available for the video link
    public fetchAndDisplayFormats(url: string): Promise<void> {
        return new Promise((resolve, reject) => {
            console.log(`\n🔍 Fetching available formats for: ${url}...\n`);

            const child = spawn("yt-dlp", ["--encoding", "utf-8", "-F", url], {
                stdio: ["ignore", "pipe", "pipe"],
            });

            // stdout -> terminal
            child.stdout.on("data", (data: Buffer) => {
                process.stdout.write(data);
            });

            // stderr -> terminal
            child.stderr.on("data", (data: Buffer) => {
                process.stderr.write(data);
            });

            child.on("close", (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`yt-dlp format fetch failed with code ${code}`));
                }
            });

            child.on("error", (err) => {
                reject(new Error(`❌ Failed to start yt-dlp. Is it installed?\n${err.message}`));
            });
        });
    }

    /**
     * Fetches and displays metadata for a YouTube video using `yt-dlp --print`.
     */
    public fetchSelectedMetadata(
        url: string,
        mode: QualityMode,
        customFormat: string | undefined,
    ): Promise<SelectedVideoMetadata> {
        return new Promise((resolve, reject) => {
            const format: string | undefined = this.generateFormattedString(mode, customFormat);
            if (!format) throw new Error("No format provided");

            console.log(`\n📄 Fetching selected format metadata...`);
            const args = [
                "--quiet",
                "--no-warnings",
                "--encoding",
                "utf-8",
                "-f",
                format,
                "--print",
                "%(title)s\t%(upload_date)s\t%(thumbnail)s\t%(duration)s\t%(filesize_approx)s\t%(format_id)s",
                url,
            ];

            const ytProcess = spawn("yt-dlp", args);
            ytProcess.stdout.setEncoding("utf8");
            ytProcess.stderr.setEncoding("utf8");

            let output = "";
            let errorOutput = "";

            ytProcess.stdout.on("data", (data) => {
                output += data;
            });

            ytProcess.stderr.on("data", (data) => {
                errorOutput += data;
            });

            ytProcess.on("close", (code) => {
                if (code !== 0) {
                    reject(new Error(`Failed to fetch metadata. yt-dlp exited with code ${code}\n${errorOutput}`));
                    return;
                }

                try {
                    const line = output.trim();
                    if (!line) {
                        reject(new Error("yt-dlp returned no metadata."));
                        return;
                    }

                    const [
                        title = "Unknown Title",
                        uploadDate = "",
                        thumbnail = "",
                        duration,
                        fileSize,
                        formatId = "",
                    ] = line.split("\t");

                    const [videoId = "unknown", audioId = "unknown"] = formatId.split("+");

                    resolve({
                        name: title,
                        uploadDate: Utils.formatUploadDate(uploadDate),
                        fileSize: fileSize ? Utils.formatFileSize(Number(fileSize)) : null,
                        videoId,
                        audioId,
                        thumbnail,
                        duration: duration ? Number(duration) : null,
                    });
                } catch (error) {
                    reject(
                        new Error(
                            `Failed to parse yt-dlp metadata: ${
                                error instanceof Error ? error.message : String(error)
                            }`,
                        ),
                    );
                }
            });

            ytProcess.on("error", (err) => {
                reject(new Error(`❌ Failed to start yt-dlp.\n${err.message}`));
            });
        });
    }

    /**
     * Downloads a YouTube video using the official yt-dlp CLI based on config.
     */
    public downloadVideo(config: DownloadConfig): Promise<string> {
        const { url, mode, outputPath, customFormat } = config;

        return new Promise((resolve, reject) => {
            // Construct the output template: Directory + %(title)s_%(upload_date)s.%(ext)s
            // Example output: ./downloads/My_Video_Title_20231025.mp4
            const outputTemplate = path.join(outputPath, "%(title)s_%(upload_date)s.%(ext)s");

            const args: string[] = [
                "--encoding",
                "utf-8",
                "--newline",
                "--no-quiet",
                url,
                "-o",
                outputTemplate,
                "--merge-output-format",
                "mp4",
                "--print",
                "after_move:__YT_DLP_FINAL_PATH__:%(filepath)s",
            ];

            const format = this.generateFormattedString(mode, customFormat);
            if (format) args.push("-f", format);

            console.log(`\n🚀 Starting yt-dlp with arguments: yt-dlp ${args.join(" ")}\n`);

            const ytProcess = spawn("yt-dlp", args, {
                stdio: ["ignore", "pipe", "pipe"],
            });

            // UTF-8 decoding
            ytProcess.stdout.setEncoding("utf8");
            ytProcess.stderr.setEncoding("utf8");

            // Logger
            const ytLogger = new YTDlpLogger(ytProcess.stdout);

            ytProcess.stderr.on("data", (data) => {
                const msg = data.toString();
                console.error(`\n[yt-dlp Warning/Error]: ${msg.trim()}`);
            });

            ytProcess.on("close", (code) => {
                let finalFilePath = ytLogger.getFinalFilePath();
                ytLogger.close();
                if (code === 0) {
                    if (!finalFilePath) {
                        finalFilePath = outputTemplate;
                    }
                    console.log("\n==========================================");
                    console.log("            DOWNLOAD COMPLETED");
                    console.log("==========================================");
                    console.log(`📁 Location : ${finalFilePath}`);
                    console.log("==========================================\n");
                    resolve(finalFilePath);
                } else {
                    reject(new Error(`yt-dlp process exited with code ${code}\n`));
                }
            });

            ytProcess.on("error", (err) => {
                ytLogger.close();
                reject(new Error(`❌ Failed to start yt-dlp.\n${err.message}`));
            });
        });
    }

    public printMetadata(metadata: SelectedVideoMetadata): void {
        console.log("\n==========================================");
        console.log("           VIDEO INFORMATION");
        console.log("==========================================");
        console.log(`🎬 Title              : ${metadata.name}`);
        console.log(`📅 Upload Date        : ${metadata.uploadDate}`);
        console.log(`⏱️  Duration           : ${metadata.duration ?? "Unknown"} seconds`);
        console.log(`💾 File Size (approx) : ${metadata.fileSize ?? "Unknown"}`);
        console.log(`🎥 Video ID           : ${metadata.videoId}`);
        console.log(`🎵 Audio ID           : ${metadata.audioId}`);
        console.log(`🖼️  Thumbnail          : ${metadata.thumbnail}`);
        console.log("==========================================\n");
    }
}

export type { QualityMode, DownloadConfig };
export { YouTubeDownloader };
