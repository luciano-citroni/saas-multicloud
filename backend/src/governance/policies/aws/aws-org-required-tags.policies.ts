import { Injectable } from '@nestjs/common';
import { AwsLambdaFunction } from '../../../db/entites/aws-lambda-function.entity';
import { AwsRdsInstance } from '../../../db/entites/aws-rds-instance.entity';
import { AwsS3Bucket } from '../../../db/entites/aws-s3-bucket.entity';
import { AwsSecurityGroup } from '../../../db/entites/aws-security-group.entity';
import {
    evaluateRequiredTagsFinding,
    resolveApplicableRequiredTags,
} from '../org-knowledge-policy.helpers';
import {
    FindingSeverity,
    GovernancePolicy,
    PolicyContext,
    PolicyEvaluationResult,
} from '../policy.interface';

@Injectable()
export class S3RequiredTagsPolicy implements GovernancePolicy {
    readonly id = 'aws-s3-required-tags';
    readonly name = 'S3 Bucket Must Have Required Tags';
    readonly description =
        'S3 buckets must have organization-required tags from the knowledge base when configured.';
    readonly resourceType = 'S3Bucket';
    readonly severity: FindingSeverity = 'medium';
    readonly provider = 'aws';
    readonly category = 'storage' as const;
    readonly frameworks = ['SOC2'] as const;

    evaluate(bucket: AwsS3Bucket, context: PolicyContext): PolicyEvaluationResult[] {
        const requiredTags = resolveApplicableRequiredTags(context, 'aws', this.resourceType);
        if (!requiredTags) return [];
        return [
            evaluateRequiredTagsFinding({
                resourceId: bucket.bucketName,
                resourceType: this.resourceType,
                resourceLabel: `S3 bucket "${bucket.bucketName}"`,
                tags: bucket.tags,
                requiredTags,
            }),
        ];
    }
}

@Injectable()
export class RdsRequiredTagsPolicy implements GovernancePolicy {
    readonly id = 'aws-rds-required-tags';
    readonly name = 'RDS Instance Must Have Required Tags';
    readonly description =
        'RDS instances must have organization-required tags from the knowledge base when configured.';
    readonly resourceType = 'RDSInstance';
    readonly severity: FindingSeverity = 'medium';
    readonly provider = 'aws';
    readonly category = 'storage' as const;
    readonly frameworks = ['SOC2'] as const;

    evaluate(instance: AwsRdsInstance, context: PolicyContext): PolicyEvaluationResult[] {
        const requiredTags = resolveApplicableRequiredTags(context, 'aws', this.resourceType);
        if (!requiredTags) return [];
        return [
            evaluateRequiredTagsFinding({
                resourceId: instance.awsDbInstanceIdentifier,
                resourceType: this.resourceType,
                resourceLabel: `RDS instance "${instance.awsDbInstanceIdentifier}"`,
                tags: instance.tags,
                requiredTags,
            }),
        ];
    }
}

@Injectable()
export class LambdaRequiredTagsPolicy implements GovernancePolicy {
    readonly id = 'aws-lambda-required-tags';
    readonly name = 'Lambda Function Must Have Required Tags';
    readonly description =
        'Lambda functions must have organization-required tags from the knowledge base when configured.';
    readonly resourceType = 'LambdaFunction';
    readonly severity: FindingSeverity = 'medium';
    readonly provider = 'aws';
    readonly category = 'compute' as const;
    readonly frameworks = ['SOC2'] as const;

    evaluate(fn: AwsLambdaFunction, context: PolicyContext): PolicyEvaluationResult[] {
        const requiredTags = resolveApplicableRequiredTags(context, 'aws', this.resourceType);
        if (!requiredTags) return [];
        return [
            evaluateRequiredTagsFinding({
                resourceId: fn.functionName,
                resourceType: this.resourceType,
                resourceLabel: `Lambda function "${fn.functionName}"`,
                tags: fn.tags,
                requiredTags,
            }),
        ];
    }
}

@Injectable()
export class SgRequiredTagsPolicy implements GovernancePolicy {
    readonly id = 'aws-sg-required-tags';
    readonly name = 'Security Group Must Have Required Tags';
    readonly description =
        'Security groups must have organization-required tags from the knowledge base when configured.';
    readonly resourceType = 'SecurityGroup';
    readonly severity: FindingSeverity = 'medium';
    readonly provider = 'aws';
    readonly category = 'network' as const;
    readonly frameworks = ['SOC2'] as const;

    evaluate(sg: AwsSecurityGroup, context: PolicyContext): PolicyEvaluationResult[] {
        const requiredTags = resolveApplicableRequiredTags(context, 'aws', this.resourceType);
        if (!requiredTags) return [];
        return [
            evaluateRequiredTagsFinding({
                resourceId: sg.awsSecurityGroupId,
                resourceType: this.resourceType,
                resourceLabel: `Security group "${sg.name}" (${sg.awsSecurityGroupId})`,
                tags: sg.tags,
                requiredTags,
            }),
        ];
    }
}
