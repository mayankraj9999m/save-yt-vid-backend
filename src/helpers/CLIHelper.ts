import * as readline from 'readline';

// ==========================================
// CLI Helper Class
// ==========================================
export default class CLIHelper {
    private rl: readline.Interface;

    constructor() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
    }

    /**
     * Prompts the user with a question and returns their answer as a Promise.
     */
    public ask(question: string): Promise<string> {
        return new Promise((resolve) => {
            this.rl.question(question, (answer) => {
                resolve(answer.trim());
            });
        });
    }

    /**
     * Closes the readline interface to prevent the app from hanging.
     */
    public close(): void {
        this.rl.close();
    }
}