import { Transform, type TransformCallback } from 'stream';

export class ThrottleTransform extends Transform {
    private bytesPassed: number = 0;
    private startTime: number = Date.now();
    private bytesPerSecond: number;

    /**
     * @param bytesPerSecond Maximum bytes per second allowed through the stream
     */
    constructor(bytesPerSecond: number) {
        super();
        this.bytesPerSecond = bytesPerSecond;
    }

    _transform(chunk: Buffer, encoding: BufferEncoding, callback: TransformCallback) {
        this.bytesPassed += chunk.length;
        const elapsedSeconds = (Date.now() - this.startTime) / 1000;
        const expectedBytes = elapsedSeconds * this.bytesPerSecond;

        if (this.bytesPassed > expectedBytes) {
            // We are ahead of schedule, calculate how long to wait
            const delayMs = ((this.bytesPassed - expectedBytes) / this.bytesPerSecond) * 1000;
            setTimeout(() => {
                callback(null, chunk);
            }, delayMs);
        } else {
            // We are behind or on schedule, proceed immediately
            callback(null, chunk);
        }
    }
}
