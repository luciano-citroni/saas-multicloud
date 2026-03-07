import { ConfigService } from '@nestjs/config';
import { config } from 'dotenv';
import { DataSourceOptions, DataSource } from 'typeorm';
import {
    Organization,
    OrganizationMember,
    User,
    UserSession,
    CloudAccount,
    OrganizationInvite,
    AwsVpc,
    AwsSubnet,
    AwsEc2Instance,
    AwsRouteTable,
    AwsEcsCluster,
    AwsEcsTaskDefinition,
    AwsEcsService,
    AwsLoadBalancer,
    AwsLoadBalancerListener,
    AwsSecurityGroup,
    AwsIamRole,
    AwsRdsInstance,
} from './entites';

config();

const configService = new ConfigService();

const dataSourceOptions: DataSourceOptions = {
    type: 'postgres',
    host: configService.get<string>('DB_HOST'),
    port: configService.get<number>('DB_PORT'),
    username: configService.get<string>('DB_USERNAME'),
    password: configService.get<string>('DB_PASSWORD'),
    database: configService.get<string>('DB_NAME'),
    entities: [
        Organization,
        OrganizationMember,
        User,
        UserSession,
        CloudAccount,
        OrganizationInvite,
        AwsVpc,
        AwsSubnet,
        AwsEc2Instance,
        AwsRouteTable,
        AwsEcsCluster,
        AwsEcsTaskDefinition,
        AwsEcsService,
        AwsLoadBalancer,
        AwsLoadBalancerListener,
        AwsSecurityGroup,
        AwsIamRole,
        AwsRdsInstance,
    ],
    migrations: [__dirname + '/migrations/*.ts'],
    synchronize: false,
};

export default new DataSource(dataSourceOptions);
