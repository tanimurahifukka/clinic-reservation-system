#!/bin/bash

# Infrastructure Deployment Script for Clinic Reservation System
# This script deploys all CloudFormation stacks in the correct order

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Parameters
STAGE=${1:-dev}
REGION=${2:-ap-northeast-1}
PROFILE=${3:-default}

echo "🏗️  Deploying Infrastructure for Clinic Reservation System"
echo "Stage: $STAGE"
echo "Region: $REGION"
echo "Profile: $PROFILE"
echo ""

# Function to deploy stack
deploy_stack() {
    local stack_name=$1
    local template_file=$2
    local parameters=$3
    
    echo -e "${YELLOW}📦 Deploying $stack_name...${NC}"
    
    if [ -n "$parameters" ]; then
        aws cloudformation deploy \
            --template-file $template_file \
            --stack-name $stack_name \
            --parameter-overrides $parameters \
            --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM \
            --region $REGION \
            --profile $PROFILE \
            --no-fail-on-empty-changeset
    else
        aws cloudformation deploy \
            --template-file $template_file \
            --stack-name $stack_name \
            --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM \
            --region $REGION \
            --profile $PROFILE \
            --no-fail-on-empty-changeset
    fi
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ $stack_name deployed successfully${NC}"
    else
        echo -e "${RED}❌ Failed to deploy $stack_name${NC}"
        exit 1
    fi
}

# Function to get stack output
get_stack_output() {
    local stack_name=$1
    local output_key=$2
    
    aws cloudformation describe-stacks \
        --stack-name $stack_name \
        --query "Stacks[0].Outputs[?OutputKey=='$output_key'].OutputValue" \
        --output text \
        --region $REGION \
        --profile $PROFILE
}

# 1. Deploy VPC
echo "1️⃣ VPC Infrastructure"
deploy_stack \
    "clinic-reservation-vpc-$STAGE" \
    "infrastructure/vpc.yml" \
    "Stage=$STAGE"

# Get VPC outputs
VPC_ID=$(get_stack_output "clinic-reservation-vpc-$STAGE" "VPCId")
PRIVATE_SUBNETS=$(get_stack_output "clinic-reservation-vpc-$STAGE" "PrivateSubnetIds")

echo "VPC ID: $VPC_ID"
echo "Private Subnets: $PRIVATE_SUBNETS"
echo ""

# 2. Deploy Cognito
echo "2️⃣ Authentication (Cognito)"
deploy_stack \
    "clinic-reservation-auth-$STAGE" \
    "infrastructure/cognito.yml" \
    "Stage=$STAGE"

USER_POOL_ID=$(get_stack_output "clinic-reservation-auth-$STAGE" "UserPoolId")
USER_POOL_CLIENT_ID=$(get_stack_output "clinic-reservation-auth-$STAGE" "UserPoolClientId")

echo "User Pool ID: $USER_POOL_ID"
echo ""

# 3. Deploy Database
echo "3️⃣ Database (Aurora Serverless)"
deploy_stack \
    "clinic-reservation-db-$STAGE" \
    "infrastructure/database.yml" \
    "Stage=$STAGE VPCId=$VPC_ID PrivateSubnetIds=$PRIVATE_SUBNETS"

DB_CLUSTER_ARN=$(get_stack_output "clinic-reservation-db-$STAGE" "DBClusterArn")
DB_SECRET_ARN=$(get_stack_output "clinic-reservation-db-$STAGE" "DBSecretArn")

echo "Database Cluster ARN: $DB_CLUSTER_ARN"
echo ""

# 4. Deploy Cache and Queues
echo "4️⃣ Cache and Queues"
deploy_stack \
    "clinic-reservation-cache-$STAGE" \
    "infrastructure/cache-queues.yml" \
    "Stage=$STAGE VPCId=$VPC_ID PrivateSubnetIds=$PRIVATE_SUBNETS"

REDIS_ENDPOINT=$(get_stack_output "clinic-reservation-cache-$STAGE" "RedisEndpoint")
echo "Redis Endpoint: $REDIS_ENDPOINT"
echo ""

# 5. Deploy Parameters
echo "5️⃣ SSM Parameters"
deploy_stack \
    "clinic-reservation-parameters-$STAGE" \
    "infrastructure/parameters.yml" \
    "Stage=$STAGE"

# 6. Export environment variables for Serverless
echo ""
echo "6️⃣ Creating .env.$STAGE file..."
cat > .env.$STAGE << EOF
# Auto-generated environment file
STAGE=$STAGE
REGION=$REGION
USER_POOL_ID=$USER_POOL_ID
USER_POOL_CLIENT_ID=$USER_POOL_CLIENT_ID
DB_CLUSTER_ARN=$DB_CLUSTER_ARN
DB_SECRET_ARN=$DB_SECRET_ARN
DB_NAME=clinic_reservation
REDIS_ENDPOINT=$REDIS_ENDPOINT
VPC_ID=$VPC_ID
PRIVATE_SUBNETS=$PRIVATE_SUBNETS
EOF

echo -e "${GREEN}✅ Infrastructure deployment completed!${NC}"
echo ""
echo "📌 Next steps:"
echo "1. Deploy the application: npm run deploy:$STAGE"
echo "2. Run database migrations: npm run migrate:$STAGE"
echo "3. Configure secrets in AWS Secrets Manager:"
echo "   - Stripe API keys"
echo "   - LINE Bot credentials"
echo "   - Email settings"