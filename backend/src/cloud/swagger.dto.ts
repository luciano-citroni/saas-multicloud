import { ApiProperty } from '@nestjs/swagger';
import { CloudProvider } from '../db/entites/cloud-account.entity';

export class CloudAccountResponseDto {
    @ApiProperty({
        example: '123e4567-e89b-12d3-a456-426614174001',
        description: 'ID da conta de cloud (UUID)',
    })
    id: string;

    @ApiProperty({
        example: '123e4567-e89b-12d3-a456-426614174000',
        description: 'ID da organização à qual a conta pertence',
    })
    organizationId: string;

    @ApiProperty({
        example: CloudProvider.AWS,
        description: 'Provider da conta de cloud',
    })
    provider: CloudProvider;

    @ApiProperty({
        example: 'Produção',
        description: 'Alias legível da conta',
    })
    alias: string;

    @ApiProperty({
        example: true,
        description: 'Se a conta está ativa',
    })
    isActive: boolean;

    @ApiProperty({
        example: '2026-02-27T10:00:00Z',
        description: 'Data de criação',
    })
    createdAt: Date;

    @ApiProperty({
        example: '2026-02-27T10:00:00Z',
        description: 'Data da última atualização',
    })
    updatedAt: Date;
}
