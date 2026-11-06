import dataSource from '../../db/typeorm.migrations.config';
import { FinopsCostAnomaly } from '../../db/entites/finops-cost-anomaly.entity';
import { FinopsCostRecord } from '../../db/entites/finops-cost-record.entity';
import { FinopsAnomalyDetectionService } from '../services/finops-anomaly-detection.service';

async function main(): Promise<void> {
    await dataSource.initialize();
    try {
        const service = new FinopsAnomalyDetectionService(
            dataSource.getRepository(FinopsCostRecord),
            dataSource.getRepository(FinopsCostAnomaly),
        );
        const result = await service.rebuildAllFromStoredCosts();
        console.log(JSON.stringify(result));
    } finally {
        await dataSource.destroy();
    }
}

main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
});
