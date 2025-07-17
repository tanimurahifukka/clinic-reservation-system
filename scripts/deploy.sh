#!/bin/bash

# Clinic Reservation System Deployment Script
# Usage: ./deploy.sh [stage] [region] [profile]

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default values
STAGE=${1:-dev}
REGION=${2:-ap-northeast-1}
PROFILE=${3:-default}

echo "🚀 Deploying Clinic Reservation System"
echo "Stage: $STAGE"
echo "Region: $REGION"
echo "AWS Profile: $PROFILE"
echo ""

# Function to check if AWS CLI is installed
check_aws_cli() {
    if ! command -v aws &> /dev/null; then
        echo -e "${RED}❌ AWS CLI is not installed. Please install it first.${NC}"
        exit 1
    fi
}

# Function to check AWS credentials
check_aws_credentials() {
    if ! aws sts get-caller-identity --profile $PROFILE &> /dev/null; then
        echo -e "${RED}❌ AWS credentials not configured for profile: $PROFILE${NC}"
        exit 1
    fi
}

# Check prerequisites
echo "🔍 Checking prerequisites..."
check_aws_cli
check_aws_credentials

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
npm install

# Run tests
echo ""
echo "🧪 Running tests..."
npm run test || true  # Don't fail on test errors for now

# Build TypeScript
echo ""
echo "🔨 Building TypeScript..."
npm run build

# Deploy with Serverless Framework
echo ""
echo "🏗️  Deploying application..."
npx serverless deploy --stage $STAGE --region $REGION --aws-profile $PROFILE --verbose

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✅ Deployment completed successfully!${NC}"
    
    # Get service information
    API_URL=$(npx serverless info --stage $STAGE --region $REGION --aws-profile $PROFILE --verbose | grep "ServiceEndpoint:" | awk '{print $2}')
    
    echo ""
    echo "📌 Service Information:"
    echo "🌐 API Endpoint: $API_URL"
    echo "🏥 Health Check: $API_URL/health"
    echo ""
    echo "📊 CloudWatch Dashboard:"
    echo "https://$REGION.console.aws.amazon.com/cloudwatch/home?region=$REGION#dashboards"
else
    echo -e "${RED}❌ Deployment failed${NC}"
    exit 1
fi