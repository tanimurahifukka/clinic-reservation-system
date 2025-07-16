#!/bin/bash

# Clinic Reservation System Deployment Script
set -e

STAGE=${1:-dev}
REGION=${2:-ap-northeast-1}

echo "🚀 Deploying Clinic Reservation System to $STAGE environment in $REGION region"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Run tests
echo "🧪 Running tests..."
npm run test

# Build TypeScript
echo "🔨 Building TypeScript..."
npm run build

# Deploy infrastructure
echo "🏗️  Deploying infrastructure..."
serverless deploy --stage $STAGE --region $REGION --verbose

echo "✅ Deployment completed successfully!"
echo "📊 You can view the CloudWatch dashboard at:"
echo "https://$REGION.console.aws.amazon.com/cloudwatch/home?region=$REGION#dashboards:name=clinic-reservation-system-$STAGE-dashboard"