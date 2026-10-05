import * as readline from 'readline';
import { Readable } from 'stream';

// ==========================================
// Output Logger Class
// ==========================================
export default class YTDlpLogger {
    private rl: readline.Interface;
    private finalFilePath: string | null = null;

    // Matches: "[download]" + spaces + numbers + optional decimal + "%"
    private progressRegex: RegExp = /\[download\]\s+\d+(\.\d+)?%/;
    private readonly filePathMarker = '__YT_DLP_FINAL_PATH__:';
    private onProgress?: ((progressLine: string) => void) | undefined;

    constructor(inputStream: Readable, onProgress?: (progressLine: string) => void) {
        this.onProgress = onProgress;
        this.rl = readline.createInterface({
            input: inputStream,
            terminal: false
        });
        this.initListeners();
    }

    private initListeners(): void {
        this.rl.on('line', (line: string) => {
            const trimmedLine = line.trim();
            if (!trimmedLine) {
                return;
            }

            if (trimmedLine.startsWith(this.filePathMarker)) {
                this.finalFilePath = trimmedLine
                    .slice(this.filePathMarker.length)
                    .trim();
                return;
            }

            if (this.progressRegex.test(trimmedLine)) {
                process.stdout.write(`\r\x1b[K${trimmedLine}`);
                if (this.onProgress) {
                    this.onProgress(trimmedLine);
                }
                return;
            }

            console.log(trimmedLine);
        });
    }

    public getFinalFilePath(): string | null {
        return this.finalFilePath;
    }

    public close(): void {
        this.rl.close();
    }
}