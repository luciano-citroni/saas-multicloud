import { ApiProperty } from '@nestjs/swagger';

export class AzureSyncResponseDto {
    @ApiProperty({ description: 'Mensagem de confirmação da sincronização' })
    message!: string;

    @ApiProperty({ description: 'Total de recursos sincronizados e persistidos', example: 142 })
    totalSynced!: number;

    @ApiProperty({ description: 'Timestamp de início da sincronização' })
    syncedAt!: Date;
}
