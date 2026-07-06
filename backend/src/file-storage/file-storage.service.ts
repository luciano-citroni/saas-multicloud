import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';

export interface FileStorageProvider {
    saveFile(key: string, buffer: Buffer, contentType?: string): Promise<void>;
    getFile(key: string): Promise<Buffer | null>;
}

class MemoryStorageProvider implements FileStorageProvider {
    private files = new Map<string, Buffer>();

    async saveFile(key: string, buffer: Buffer): Promise<void> {
        this.files.set(key, buffer);
    }

    async getFile(key: string): Promise<Buffer | null> {
        return this.files.get(key) ?? null;
    }
}

class S3StorageProvider implements FileStorageProvider {
    private s3: S3Client;
    private bucket: string;
    private logger = new Logger(S3StorageProvider.name);

    constructor(bucket: string, endpoint?: string, accessKeyId?: string, secretAccessKey?: string, region?: string) {
        this.bucket = bucket;
        this.s3 = new S3Client({
            endpoint: endpoint || undefined,
            region: region || 'us-east-1',
            credentials: accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined,
            forcePathStyle: !!endpoint, // MinIO precisa disso
        });
    }

    async saveFile(key: string, buffer: Buffer, contentType?: string): Promise<void> {
        await this.s3.send(
            new PutObjectCommand({
                Bucket: this.bucket,
                Key: key,
                Body: buffer,
                ContentType: contentType,
            })
        );
    }

    async getFile(key: string): Promise<Buffer | null> {
        try {
            const res = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
            if (!res.Body) return null;
            const stream = res.Body as Readable;
            const chunks: Buffer[] = [];
            for await (const chunk of stream) chunks.push(Buffer.from(chunk));
            return Buffer.concat(chunks);
        } catch (e) {
            this.logger.warn(`Erro ao buscar arquivo do S3: ${e}`);
            return null;
        }
    }
}

@Injectable()
export class FileStorageService implements FileStorageProvider {
    private provider: FileStorageProvider;

    constructor(private readonly config: ConfigService) {
        const bucket = config.get<string>('FILE_BUCKET_NAME');
        const providerType = config.get<string>('FILE_STORAGE_PROVIDER', 's3');
        if (bucket) {
            if (providerType === 'minio') {
                this.provider = new S3StorageProvider(
                    bucket,
                    config.get<string>('MINIO_ENDPOINT'),
                    config.get<string>('MINIO_ACCESS_KEY'),
                    config.get<string>('MINIO_SECRET_KEY'),
                    config.get<string>('MINIO_REGION', 'us-east-1')
                );
            } else {
                this.provider = new S3StorageProvider(
                    bucket,
                    config.get<string>('AWS_S3_ENDPOINT'),
                    config.get<string>('AWS_ACCESS_KEY_ID'),
                    config.get<string>('AWS_SECRET_ACCESS_KEY'),
                    config.get<string>('AWS_REGION', 'us-east-1')
                );
            }
        } else {
            this.provider = new MemoryStorageProvider();
        }
    }

    saveFile(key: string, buffer: Buffer, contentType?: string): Promise<void> {
        return this.provider.saveFile(key, buffer, contentType);
    }

    getFile(key: string): Promise<Buffer | null> {
        return this.provider.getFile(key);
    }
}
