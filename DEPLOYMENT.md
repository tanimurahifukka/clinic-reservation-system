# 🚀 Clinic Reservation System - Deployment Guide

This guide provides step-by-step instructions for deploying the Clinic Reservation System to AWS.

## 📋 Prerequisites

1. **AWS Account** with appropriate permissions
2. **AWS CLI** installed and configured
3. **Node.js** (v18 or higher) and npm
4. **Git** for version control
5. **Docker** (for local development)
6. **Make** (optional, for using Makefile commands)

## 🏗️ Architecture Overview

The system uses the following AWS services:
- **API Gateway** - REST API endpoint
- **Lambda** - Serverless compute
- **Aurora Serverless v2** - PostgreSQL database
- **Cognito** - User authentication
- **ElastiCache** - Redis caching
- **S3** - File storage
- **SES/SNS** - Email and SMS notifications
- **CloudWatch** - Monitoring and logs

## 🚦 Deployment Steps

### 1. Clone and Setup

```bash
# Clone the repository
git clone https://github.com/tanimurahifukka/clinic-reservation-system.git
cd clinic-reservation-system

# Install dependencies
npm install

# Copy environment template
cp .env.example .env.dev
```

### 2. Configure AWS Credentials

```bash
# Configure AWS CLI
aws configure --profile clinic-dev

# Set the following:
# - AWS Access Key ID
# - AWS Secret Access Key
# - Default region: ap-northeast-1
# - Default output format: json
```

### 3. Deploy Infrastructure

Deploy all AWS infrastructure components:

```bash
# Using Make
make deploy-infra STAGE=dev

# Or using script directly
./scripts/deploy-infrastructure.sh dev ap-northeast-1 clinic-dev
```

This will create:
- VPC with public/private subnets
- Cognito User Pool
- Aurora Serverless database
- ElastiCache cluster
- S3 buckets
- DynamoDB tables

### 4. Configure Secrets

After infrastructure deployment, configure the required secrets:

```bash
# Stripe API Keys
aws secretsmanager create-secret \
    --name "dev/clinic-reservation/stripe-secret-key" \
    --secret-string "sk_test_your_key" \
    --region ap-northeast-1

# Stripe Webhook Secret
aws secretsmanager create-secret \
    --name "dev/clinic-reservation/stripe-webhook-secret" \
    --secret-string "whsec_your_secret" \
    --region ap-northeast-1

# LINE Bot Credentials (if using)
aws secretsmanager create-secret \
    --name "dev/clinic-reservation/line-channel-access-token" \
    --secret-string "your_token" \
    --region ap-northeast-1
```

### 5. Run Database Migrations

```bash
# Using Make
make migrate STAGE=dev

# Or using script
./scripts/migrate-database.sh dev ap-northeast-1 clinic-dev
```

### 6. Deploy Application

```bash
# Using Make
make deploy STAGE=dev

# Or using script
./scripts/deploy.sh dev ap-northeast-1 clinic-dev
```

### 7. Verify Deployment

```bash
# Get service information
make info STAGE=dev

# Test health endpoint
curl https://your-api-id.execute-api.ap-northeast-1.amazonaws.com/dev/health
```

## 🌍 Environment-Specific Deployment

### Development
```bash
make deploy STAGE=dev
```

### Staging
```bash
make deploy STAGE=staging PROFILE=clinic-staging
```

### Production
```bash
make deploy STAGE=prod PROFILE=clinic-prod
```

## 📝 Post-Deployment Configuration

### 1. Configure Stripe Webhook

1. Log in to your Stripe Dashboard
2. Navigate to Webhooks
3. Add endpoint: `https://your-api-url/payments/webhook`
4. Select events:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `refund.created`
   - `refund.updated`

### 2. Configure LINE Bot (Optional)

1. Log in to LINE Developers Console
2. Update Webhook URL: `https://your-api-url/line/webhook`
3. Enable webhook
4. Verify webhook

### 3. Configure Custom Domain (Optional)

```bash
# Add custom domain to API Gateway
aws apigateway create-domain-name \
    --domain-name api.yourclinic.com \
    --certificate-arn arn:aws:acm:... \
    --region ap-northeast-1
```

## 🔍 Monitoring and Logs

### View Logs
```bash
# View specific function logs
make logs

# View all logs in CloudWatch
aws logs tail /aws/lambda/clinic-reservation-dev --follow
```

### CloudWatch Dashboard
Access the automatic dashboard at:
```
https://ap-northeast-1.console.aws.amazon.com/cloudwatch/home?region=ap-northeast-1#dashboards
```

## 🛠️ Troubleshooting

### Common Issues

1. **Lambda Timeout**
   - Check function memory allocation
   - Verify VPC configuration
   - Check database connection

2. **Database Connection Failed**
   - Verify security groups
   - Check VPC endpoints
   - Verify credentials in Secrets Manager

3. **Authentication Errors**
   - Verify Cognito User Pool configuration
   - Check JWT token expiration
   - Verify API Gateway authorizer

### Debug Commands

```bash
# Check deployment status
make check-deployment

# Test API endpoints
make test-api STAGE=dev

# View Lambda function configuration
aws lambda get-function --function-name clinic-reservation-dev-createBooking
```

## 🔄 Updating the Application

### Code Updates
```bash
# Pull latest changes
git pull origin main

# Deploy updates
make deploy STAGE=dev
```

### Database Schema Updates
```bash
# Add new migration file to database/migrations/
# Then run:
make migrate STAGE=dev
```

## 🗑️ Cleanup

To remove all resources (BE CAREFUL IN PRODUCTION):

```bash
# Remove application
make remove STAGE=dev

# Remove infrastructure (manual CloudFormation deletion required)
aws cloudformation delete-stack --stack-name clinic-reservation-vpc-dev
aws cloudformation delete-stack --stack-name clinic-reservation-auth-dev
aws cloudformation delete-stack --stack-name clinic-reservation-db-dev
aws cloudformation delete-stack --stack-name clinic-reservation-cache-dev
```

## 📞 Support

For issues or questions:
1. Check CloudWatch logs
2. Review the troubleshooting section
3. Create an issue on GitHub

## 🔐 Security Best Practices

1. **Never commit secrets** to the repository
2. **Use IAM roles** with least privilege
3. **Enable AWS CloudTrail** for audit logging
4. **Regularly update dependencies**
5. **Use AWS Secrets Manager** for all sensitive data
6. **Enable MFA** for AWS accounts
7. **Implement API rate limiting**
8. **Regular security audits**

## 📊 Cost Optimization

1. **Use Aurora Serverless v2** auto-scaling
2. **Set up Lambda reserved concurrency**
3. **Configure S3 lifecycle policies**
4. **Use CloudWatch Logs retention policies**
5. **Monitor with AWS Cost Explorer**

---

Last updated: 2025-01-17