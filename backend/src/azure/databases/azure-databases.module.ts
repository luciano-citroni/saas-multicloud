import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AzureSqlServer } from '../../db/entites/azure-sql-server.entity';
import { AzureSqlDatabase } from '../../db/entites/azure-sql-database.entity';
import { AzurePostgresServer } from '../../db/entites/azure-postgres-server.entity';
import { AzureCosmosDb } from '../../db/entites/azure-cosmos-db.entity';
import { AzureDatabasesController } from './azure-databases.controller';
import { AzureDatabasesService } from './azure-databases.service';
import { CloudModule } from '../../cloud/cloud.module';
import { TenantModule } from '../../tenant/tenant.module';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([AzureSqlServer, AzureSqlDatabase, AzurePostgresServer, AzureCosmosDb]),
        CloudModule,
        TenantModule,
        RbacModule,
    ],
    providers: [AzureDatabasesService],
    controllers: [AzureDatabasesController],
    exports: [AzureDatabasesService],
})
export class AzureDatabasesModule {}
