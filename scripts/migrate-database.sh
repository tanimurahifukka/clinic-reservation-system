#!/bin/bash

# Database Migration Script
# Usage: ./migrate-database.sh [stage] [region] [profile]

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

echo "🗄️  Running Database Migrations"
echo "Stage: $STAGE"
echo "Region: $REGION"
echo "Profile: $PROFILE"
echo ""

# Check if .env file exists
if [ ! -f ".env.$STAGE" ]; then
    echo -e "${RED}❌ .env.$STAGE file not found. Run deploy-infrastructure.sh first.${NC}"
    exit 1
fi

# Load environment variables
export $(cat .env.$STAGE | xargs)

# Get database connection details from Secrets Manager
echo "🔑 Retrieving database credentials..."
DB_SECRET=$(aws secretsmanager get-secret-value \
    --secret-id $DB_SECRET_ARN \
    --region $REGION \
    --profile $PROFILE \
    --query SecretString \
    --output text)

DB_HOST=$(echo $DB_SECRET | jq -r .host)
DB_PORT=$(echo $DB_SECRET | jq -r .port)
DB_NAME=$(echo $DB_SECRET | jq -r .dbname)
DB_USER=$(echo $DB_SECRET | jq -r .username)
DB_PASS=$(echo $DB_SECRET | jq -r .password)

# Export for migration script
export DB_HOST
export DB_PORT
export DB_NAME
export DB_USER
export DB_PASSWORD=$DB_PASS

# Run migrations
echo ""
echo "🚀 Running migrations..."
node database/migrate.js

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Migrations completed successfully!${NC}"
else
    echo -e "${RED}❌ Migration failed${NC}"
    exit 1
fi

# Verify tables
echo ""
echo "📊 Verifying database tables..."
TABLES=$(PGPASSWORD=$DB_PASS psql -h $DB_HOST -U $DB_USER -d $DB_NAME -t -c "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;")

echo "Tables created:"
echo "$TABLES" | while read table; do
    if [ ! -z "$table" ]; then
        echo "  ✅ $table"
    fi
done

echo ""
echo -e "${GREEN}🎉 Database setup completed!${NC}"