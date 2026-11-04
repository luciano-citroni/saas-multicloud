import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { FinopsResourceChangeEvent } from '../db/entites/finops-resource-change-event.entity';
import { CloudAccount } from '../db/entites/cloud-account.entity';
import { FinopsResourceChangeService } from './services/finops-resource-change.service';

/**
 * Módulo leve exportável para os services de inventário (EC2/RDS/Azure/GCP)
 * sem puxar o FinopsModule completo (evita ciclos).
 */
@Module({
    imports: [TypeOrmModule.forFeature([FinopsResourceChangeEvent, CloudAccount])],
    providers: [FinopsResourceChangeService],
    exports: [FinopsResourceChangeService],
})
export class FinopsResourceChangeModule {}
