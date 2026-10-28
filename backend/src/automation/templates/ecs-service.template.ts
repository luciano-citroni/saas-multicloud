export const ECS_SERVICE_TEMPLATE = `AWSTemplateFormatVersion: '2010-09-09'
Description: >
  ECS service template. Reuses an existing VPC and subnets. Cluster, ECR repository,
  IAM roles, secret and load balancer are created only when the matching parameter is empty.
  Existing resources are referenced and are not imported into stack management.
  ContainerImage defaults to a public nginx image so the service can start.
  Set CertificateArn to publish HTTPS on the load balancer and redirect HTTP to HTTPS.

Parameters:
  AppName:
    Type: String
    MaxLength: 20
    Description: Short application name.
  Environment:
    Type: String
    Default: dev
    AllowedValues: [dev, staging, prod]
  ContainerImage:
    Type: String
    Default: public.ecr.aws/docker/library/nginx:alpine
    Description: Image URI. The default is a public nginx image.
  DesiredCount:
    Type: Number
    Default: 2
    MinValue: 0
    MaxValue: 10
  Cpu:
    Type: String
    Default: '256'
    AllowedValues: ['256', '512', '1024', '2048']
  Memory:
    Type: String
    Default: '512'
    AllowedValues: ['512', '1024', '2048', '4096']
  VpcId:
    Type: AWS::EC2::VPC::Id
  SubnetIds:
    Type: List<AWS::EC2::Subnet::Id>
  AssignPublicIp:
    Type: String
    Default: ENABLED
    AllowedValues: [ENABLED, DISABLED]
  ExistingClusterName:
    Type: String
    Default: ''
  ExistingRepositoryUri:
    Type: String
    Default: ''
  ExecutionRoleArn:
    Type: String
    Default: ''
  TaskRoleArn:
    Type: String
    Default: ''
  SecretArn:
    Type: String
    Default: ''
    NoEcho: true
  ContainerPort:
    Type: Number
    Default: 80
  CreateLoadBalancer:
    Type: String
    Default: 'true'
    AllowedValues: ['true', 'false']
  CertificateArn:
    Type: String
    Default: ''
    Description: ACM certificate ARN. When set, the load balancer serves HTTPS and redirects HTTP.

Conditions:
  CreateCluster: !Equals [!Ref ExistingClusterName, '']
  CreateRepository: !Equals [!Ref ExistingRepositoryUri, '']
  CreateExecutionRole: !Equals [!Ref ExecutionRoleArn, '']
  CreateTaskRole: !Equals [!Ref TaskRoleArn, '']
  HasSecret: !Not [!Equals [!Ref SecretArn, '']]
  GrantSecretToNewRole: !And [!Condition CreateExecutionRole, !Condition HasSecret]
  UseLoadBalancer: !Equals [!Ref CreateLoadBalancer, 'true']
  SkipLoadBalancer: !Not [!Condition UseLoadBalancer]
  UseHttps: !And
    - !Condition UseLoadBalancer
    - !Not [!Equals [!Ref CertificateArn, '']]
  UseHttpOnly: !And
    - !Condition UseLoadBalancer
    - !Equals [!Ref CertificateArn, '']

Resources:
  Cluster:
    Type: AWS::ECS::Cluster
    Condition: CreateCluster
    Properties:
      ClusterName: !Sub '\${AppName}-\${Environment}'
  Repository:
    Type: AWS::ECR::Repository
    Condition: CreateRepository
    Properties:
      RepositoryName: !Sub '\${AppName}-\${Environment}'
      ImageScanningConfiguration:
        ScanOnPush: true
  ExecutionRole:
    Type: AWS::IAM::Role
    Condition: CreateExecutionRole
    Properties:
      RoleName: !Sub '\${AppName}-\${Environment}-exec'
      AssumeRolePolicyDocument:
        Version: '2012-10-17'
        Statement:
          - Effect: Allow
            Principal:
              Service: ecs-tasks.amazonaws.com
            Action: sts:AssumeRole
      ManagedPolicyArns:
        - arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
  ExecutionRoleSecretPolicy:
    Type: AWS::IAM::Policy
    Condition: GrantSecretToNewRole
    Properties:
      PolicyName: read-app-secret
      Roles:
        - !Ref ExecutionRole
      PolicyDocument:
        Version: '2012-10-17'
        Statement:
          - Effect: Allow
            Action: secretsmanager:GetSecretValue
            Resource: !Ref SecretArn
  TaskRole:
    Type: AWS::IAM::Role
    Condition: CreateTaskRole
    Properties:
      RoleName: !Sub '\${AppName}-\${Environment}-task'
      AssumeRolePolicyDocument:
        Version: '2012-10-17'
        Statement:
          - Effect: Allow
            Principal:
              Service: ecs-tasks.amazonaws.com
            Action: sts:AssumeRole
  LogGroup:
    Type: AWS::Logs::LogGroup
    Properties:
      LogGroupName: !Sub '/ecs/\${AppName}-\${Environment}'
      RetentionInDays: 14
  ServiceSecurityGroup:
    Type: AWS::EC2::SecurityGroup
    Properties:
      GroupDescription: !Sub '\${AppName} tasks'
      VpcId: !Ref VpcId
  LoadBalancerSecurityGroup:
    Type: AWS::EC2::SecurityGroup
    Condition: UseLoadBalancer
    Properties:
      GroupDescription: !Sub '\${AppName} load balancer'
      VpcId: !Ref VpcId
      SecurityGroupIngress:
        - IpProtocol: tcp
          FromPort: 80
          ToPort: 80
          CidrIp: 0.0.0.0/0
  LoadBalancerHttpsIngress:
    Type: AWS::EC2::SecurityGroupIngress
    Condition: UseHttps
    Properties:
      GroupId: !Ref LoadBalancerSecurityGroup
      IpProtocol: tcp
      FromPort: 443
      ToPort: 443
      CidrIp: 0.0.0.0/0
  ServiceIngressFromAlb:
    Type: AWS::EC2::SecurityGroupIngress
    Condition: UseLoadBalancer
    Properties:
      GroupId: !Ref ServiceSecurityGroup
      IpProtocol: tcp
      FromPort: !Ref ContainerPort
      ToPort: !Ref ContainerPort
      SourceSecurityGroupId: !Ref LoadBalancerSecurityGroup
  ServiceIngressFromCidr:
    Type: AWS::EC2::SecurityGroupIngress
    Condition: SkipLoadBalancer
    Properties:
      GroupId: !Ref ServiceSecurityGroup
      IpProtocol: tcp
      FromPort: !Ref ContainerPort
      ToPort: !Ref ContainerPort
      CidrIp: 10.0.0.0/8
  LoadBalancer:
    Type: AWS::ElasticLoadBalancingV2::LoadBalancer
    Condition: UseLoadBalancer
    Properties:
      Name: !Sub '\${AppName}-\${Environment}'
      Scheme: internet-facing
      Type: application
      Subnets: !Ref SubnetIds
      SecurityGroups:
        - !Ref LoadBalancerSecurityGroup
  TargetGroup:
    Type: AWS::ElasticLoadBalancingV2::TargetGroup
    Condition: UseLoadBalancer
    Properties:
      Name: !Sub '\${AppName}-\${Environment}'
      VpcId: !Ref VpcId
      Port: !Ref ContainerPort
      Protocol: HTTP
      TargetType: ip
      HealthCheckPath: /
  Listener:
    Type: AWS::ElasticLoadBalancingV2::Listener
    Condition: UseHttpOnly
    Properties:
      LoadBalancerArn: !Ref LoadBalancer
      Port: 80
      Protocol: HTTP
      DefaultActions:
        - Type: forward
          TargetGroupArn: !Ref TargetGroup
  HttpRedirectListener:
    Type: AWS::ElasticLoadBalancingV2::Listener
    Condition: UseHttps
    Properties:
      LoadBalancerArn: !Ref LoadBalancer
      Port: 80
      Protocol: HTTP
      DefaultActions:
        - Type: redirect
          RedirectConfig:
            Protocol: HTTPS
            Port: '443'
            StatusCode: HTTP_301
  HttpsListener:
    Type: AWS::ElasticLoadBalancingV2::Listener
    Condition: UseHttps
    Properties:
      LoadBalancerArn: !Ref LoadBalancer
      Port: 443
      Protocol: HTTPS
      Certificates:
        - CertificateArn: !Ref CertificateArn
      DefaultActions:
        - Type: forward
          TargetGroupArn: !Ref TargetGroup
  TaskDefinition:
    Type: AWS::ECS::TaskDefinition
    Properties:
      Family: !Sub '\${AppName}-\${Environment}'
      RequiresCompatibilities: [FARGATE]
      NetworkMode: awsvpc
      Cpu: !Ref Cpu
      Memory: !Ref Memory
      ExecutionRoleArn: !If [CreateExecutionRole, !GetAtt ExecutionRole.Arn, !Ref ExecutionRoleArn]
      TaskRoleArn: !If [CreateTaskRole, !GetAtt TaskRole.Arn, !Ref TaskRoleArn]
      ContainerDefinitions:
        - Name: app
          Image: !Ref ContainerImage
          Essential: true
          PortMappings:
            - ContainerPort: !Ref ContainerPort
              Protocol: tcp
          LogConfiguration:
            LogDriver: awslogs
            Options:
              awslogs-group: !Ref LogGroup
              awslogs-region: !Ref AWS::Region
              awslogs-stream-prefix: app
          Secrets: !If
            - HasSecret
            - - Name: APP_SECRET
                ValueFrom: !Ref SecretArn
            - !Ref AWS::NoValue
  Service:
    Type: AWS::ECS::Service
    Properties:
      ServiceName: !Sub '\${AppName}-\${Environment}'
      Cluster: !If [CreateCluster, !Ref Cluster, !Ref ExistingClusterName]
      LaunchType: FARGATE
      DesiredCount: !Ref DesiredCount
      TaskDefinition: !Ref TaskDefinition
      NetworkConfiguration:
        AwsvpcConfiguration:
          AssignPublicIp: !Ref AssignPublicIp
          SecurityGroups:
            - !Ref ServiceSecurityGroup
          Subnets: !Ref SubnetIds
      LoadBalancers: !If
        - UseLoadBalancer
        - - ContainerName: app
            ContainerPort: !Ref ContainerPort
            TargetGroupArn: !Ref TargetGroup
        - !Ref AWS::NoValue

Outputs:
  ClusterName:
    Description: Cluster created by the stack or the existing cluster name.
    Value: !If [CreateCluster, !Ref Cluster, !Ref ExistingClusterName]
  ServiceName:
    Value: !GetAtt Service.Name
  TaskDefinitionArn:
    Value: !Ref TaskDefinition
  SecurityGroupId:
    Value: !Ref ServiceSecurityGroup
  LoadBalancerDns:
    Condition: UseLoadBalancer
    Value: !GetAtt LoadBalancer.DNSName
  RepositoryUri:
    Condition: CreateRepository
    Value: !GetAtt Repository.RepositoryUri
`;

export const ECS_PLATFORM_TEMPLATE_NAME = 'ECS service';
