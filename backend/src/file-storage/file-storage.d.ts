export interface FileStorageProvider {
    saveFile(key: string, buffer: Buffer, contentType?: string): Promise<void>;
    getFile(key: string): Promise<Buffer | null>;
}
