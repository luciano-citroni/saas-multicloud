import { ApiProperty } from '@nestjs/swagger';

export class CreateOrganizationRequestDto {
    @ApiProperty({
        example: 'ACME Corporation',
        description: 'Nome da organização',
        minLength: 2,
        maxLength: 100,
    })
    name: string;

    @ApiProperty({
        example: '12345678000190',
        description: 'CNPJ da organização',
        minLength: 11,
        maxLength: 20,
    })
    cnpj: string;
}

export class UpdateOrganizationRequestDto {
    @ApiProperty({
        example: 'Updated ACME',
        description: 'Novo nome da organização',
        required: false,
        minLength: 2,
        maxLength: 100,
    })
    name?: string;

    @ApiProperty({
        example: '12345678000190',
        description: 'Novo CNPJ da organização',
        required: false,
    })
    cnpj?: string;
}

export class OrganizationResponseDto {
    @ApiProperty({
        example: '123e4567-e89b-12d3-a456-426614174000',
        description: 'ID único da organização (UUID)',
    })
    id: string;

    @ApiProperty({
        example: 'ACME Corporation',
        description: 'Nome da organização',
    })
    name: string;

    @ApiProperty({
        example: '12345678000190',
        description: 'CNPJ da organização',
    })
    cnpj: string;
}

export class DeleteOrganizationResponseDto {
    @ApiProperty({
        example: '123e4567-e89b-12d3-a456-426614174000',
        description: 'ID da organização deletada',
    })
    id: string;

    @ApiProperty({
        example: true,
        description: 'Confirmação de deleção',
    })
    deleted: boolean;
}
