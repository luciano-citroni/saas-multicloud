import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FileStorageService } from './file-storage.service';

@Module({
    imports: [ConfigModule],
    providers: [FileStorageService],
    // Nenhum controller exposto, apenas serviço
    exports: [FileStorageService],
})
export class FileStorageModule {}
