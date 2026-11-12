import { Injectable } from '@nestjs/common';
import { AwsEc2Instance } from '../../../db/entites/aws-ec2.entity';
import { AwsLambdaFunction } from '../../../db/entites/aws-lambda-function.entity';
import { AwsRdsInstance } from '../../../db/entites/aws-rds-instance.entity';
import { AwsS3Bucket } from '../../../db/entites/aws-s3-bucket.entity';
import { AwsSecurityGroup } from '../../../db/entites/aws-security-group.entity';
import {
    evaluateNamingFinding,
    resolveApplicableNamingPatterns,
    resolveAwsDisplayName,
} from '../org-knowledge-policy.helpers';
import {
    FindingSeverity,
    GovernancePolicy,
    PolicyContext,
    PolicyEvaluationResult,
} from '../policy.interface';

function asResults(result: PolicyEvaluationResult | null): PolicyEvaluationResult[] {
    return result ? [result] : [];
}

@Injectable()
export class Ec2NamingPolicy implements GovernancePolicy {
    readonly id = 'aws-ec2-naming';
    readonly name = 'EC2 Instance Must Match Naming Pattern';
    readonly description =
        'EC2 instance Name tag (or instance id fallback) must match organization naming patterns from the knowledge base.';
    readonly resourceType = 'EC2Instance';
    readonly severity: FindingSeverity = 'medium';
    readonly provider = 'aws';
    readonly category = 'compute' as const;
    readonly frameworks = ['SOC2'] as const;

    evaluate(instance: AwsEc2Instance, context: PolicyContext): PolicyEvaluationResult[] {
        const patterns = resolveApplicableNamingPatterns(context, 'aws', this.resourceType);
        return asResults(
            evaluateNamingFinding({
                resourceId: instance.awsInstanceId,
                resourceType: this.resourceType,
                resourceLabel: `EC2 instance "${instance.awsInstanceId}"`,
                nameValue: resolveAwsDisplayName(instance.tags, instance.awsInstanceId),
                patterns,
            }),
        );
    }
}

@Injectable()
export class S3NamingPolicy implements GovernancePolicy {
    readonly id = 'aws-s3-naming';
    readonly name = 'S3 Bucket Must Match Naming Pattern';
    readonly description =
        'S3 bucket names must match organization naming patterns from the knowledge base.';
    readonly resourceType = 'S3Bucket';
    readonly severity: FindingSeverity = 'medium';
    readonly provider = 'aws';
    readonly category = 'storage' as const;
    readonly frameworks = ['SOC2'] as const;

    evaluate(bucket: AwsS3Bucket, context: PolicyContext): PolicyEvaluationResult[] {
        const patterns = resolveApplicableNamingPatterns(context, 'aws', this.resourceType);
        return asResults(
            evaluateNamingFinding({
                resourceId: bucket.bucketName,
                resourceType: this.resourceType,
                resourceLabel: `S3 bucket "${bucket.bucketName}"`,
                nameValue: resolveAwsDisplayName(bucket.tags, bucket.bucketName),
                patterns,
            }),
        );
    }
}

@Injectable()
export class RdsNamingPolicy implements GovernancePolicy {
    readonly id = 'aws-rds-naming';
    readonly name = 'RDS Instance Must Match Naming Pattern';
    readonly description =
        'RDS instance identifiers must match organization naming patterns from the knowledge base.';
    readonly resourceType = 'RDSInstance';
    readonly severity: FindingSeverity = 'medium';
    readonly provider = 'aws';
    readonly category = 'storage' as const;
    readonly frameworks = ['SOC2'] as const;

    evaluate(instance: AwsRdsInstance, context: PolicyContext): PolicyEvaluationResult[] {
        const patterns = resolveApplicableNamingPatterns(context, 'aws', this.resourceType);
        return asResults(
            evaluateNamingFinding({
                resourceId: instance.awsDbInstanceIdentifier,
                resourceType: this.resourceType,
                resourceLabel: `RDS instance "${instance.awsDbInstanceIdentifier}"`,
                nameValue: resolveAwsDisplayName(instance.tags, instance.awsDbInstanceIdentifier),
                patterns,
            }),
        );
    }
}

@Injectable()
export class LambdaNamingPolicy implements GovernancePolicy {
    readonly id = 'aws-lambda-naming';
    readonly name = 'Lambda Function Must Match Naming Pattern';
    readonly description =
        'Lambda function names must match organization naming patterns from the knowledge base.';
    readonly resourceType = 'LambdaFunction';
    readonly severity: FindingSeverity = 'medium';
    readonly provider = 'aws';
    readonly category = 'compute' as const;
    readonly frameworks = ['SOC2'] as const;

    evaluate(fn: AwsLambdaFunction, context: PolicyContext): PolicyEvaluationResult[] {
        const patterns = resolveApplicableNamingPatterns(context, 'aws', this.resourceType);
        return asResults(
            evaluateNamingFinding({
                resourceId: fn.functionName,
                resourceType: this.resourceType,
                resourceLabel: `Lambda function "${fn.functionName}"`,
                nameValue: resolveAwsDisplayName(fn.tags, fn.functionName),
                patterns,
            }),
        );
    }
}

@Injectable()
export class SgNamingPolicy implements GovernancePolicy {
    readonly id = 'aws-sg-naming';
    readonly name = 'Security Group Must Match Naming Pattern';
    readonly description =
        'Security group names must match organization naming patterns from the knowledge base.';
    readonly resourceType = 'SecurityGroup';
    readonly severity: FindingSeverity = 'medium';
    readonly provider = 'aws';
    readonly category = 'network' as const;
    readonly frameworks = ['SOC2'] as const;

    evaluate(sg: AwsSecurityGroup, context: PolicyContext): PolicyEvaluationResult[] {
        const patterns = resolveApplicableNamingPatterns(context, 'aws', this.resourceType);
        return asResults(
            evaluateNamingFinding({
                resourceId: sg.awsSecurityGroupId,
                resourceType: this.resourceType,
                resourceLabel: `Security group "${sg.name}" (${sg.awsSecurityGroupId})`,
                nameValue: resolveAwsDisplayName(sg.tags, sg.name),
                patterns,
            }),
        );
    }
}
