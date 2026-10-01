import CLIHelper from "./helpers/CLIHelper.js";
import { YouTubeDownloader, type DownloadConfig, type QualityMode } from "./helpers/YTDownloader.js";
import * as path from "node:path";
import * as os from 'os';

// ==========================================
// Main Application Class
// ==========================================
class App {
    private cli: CLIHelper;
    private downloader: YouTubeDownloader;

    constructor() {
        this.cli = new CLIHelper();
        this.downloader = new YouTubeDownloader();
    }

    public async run(): Promise<void> {
        console.log("==========================================");
        console.log("       yt-dlp Video Downloader Menu       ");
        console.log("==========================================\n");

        // 1. Ask for URL & Location (Input Validation outside the try block)
        const url = await this.cli.ask("🔗 Enter YouTube URL: ");
        if (!url) {
            console.error("\n❌ ERROR --> URL cannot be empty.");
            this.cli.close();
            return;
        }

        const input: string = await this.cli.ask("💾 Enter download location (press Enter for Videos folder): ");
        let location: string[] = input.trim() ? [input.trim()] : [path.join(os.homedir(), "Videos")];

        // 2. Ask for Quality Mode
        console.log("\n⚙️  Select Quality Mode:");
        console.log("   1) BEST    (Highest quality available, potentially huge files)");
        console.log("   2) OPTIMAL (Balanced: Max 1080p, MP4 container)");
        console.log("   3) CUSTOM  (List formats & pick your own Video + Audio IDs)");

        const modeChoice = await this.cli.ask("\nEnter choice (1/2/3): ");

        let mode: QualityMode;
        let customFormat: string | undefined;

        if (modeChoice === "1") {
            mode = "BEST";
        } else if (modeChoice === "2") {
            mode = "OPTIMAL";
        } else if (modeChoice === "3") {
            mode = "CUSTOM";

            // 3. Fetch formats, show them, and ask for IDs
            await this.downloader.fetchAndDisplayFormats(url);

            console.log("\n------------------------------------------");
            const videoId = await this.cli.ask("🎥 Enter VIDEO Format ID: ");
            const audioId = await this.cli.ask("🎵 Enter AUDIO Format ID: ");

            if (!videoId || !audioId) {
                console.error("\n❌ ERROR --> Video and Audio IDs are required for CUSTOM mode.");
                this.cli.close();
                return;
            }

            // yt-dlp syntax for merging is video+audio
            customFormat = `${videoId}+${audioId}`;
        } else {
            console.error("\n❌ ERROR --> Invalid menu choice.");
            this.cli.close();
            return;
        }

        // 4. Fetch metadata BEFORE downloading
        try {
            const metadata = await this.downloader.fetchSelectedMetadata(url, mode, customFormat);
            this.downloader.printMetadata(metadata);
            const confirm = await this.cli.ask("⬇️  Start download? (y/n): ");
            if (confirm.toLowerCase() !== "y") {
                console.log("\n❌ Download cancelled.");
                return;
            }

            // 5. Construct Configuration Object
            const config: DownloadConfig = {
                url,
                mode,
                outputPath: path.resolve(...location),
                customFormat,
            };

            // 6. Execute Download
            const result = await this.downloader.downloadVideo(config);
            console.log(`\n${result}`);
        } catch (error: any) {
            console.error(`\n❌ DOWNLOAD FAILED --> ${error.message}`);
        } finally {
            this.cli.close();
        }
    }
}

// ==========================================
// Execution Entry Point
// ==========================================
const app = new App();
app.run();