/**
 * Converts a file size from bytes into a human-readable format.
 *
 * @param bytes - File size in bytes
 * @param decimals - Number of decimal places
 * @returns Formatted file size string
 */
function formatFileSize(bytes: number, decimals: number = 2): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const units = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${units[i]}`;
}

function formatUploadDate(date: string): string {
    if (!date || date.length !== 8) {
        return date || 'Unknown';
    }
    return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
}

export {formatUploadDate, formatFileSize};