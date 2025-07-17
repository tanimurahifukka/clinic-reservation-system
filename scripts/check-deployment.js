const fs = require('fs');
const path = require('path');

console.log('🔍 Checking deployment readiness...\n');

const checks = {
  infrastructure: true,
  handlers: true,
  environment: true,
  dependencies: true
};

// Check Lambda handlers
const handlers = [
  'src/handlers/health/index.ts',
  'src/handlers/booking/create.ts',
  'src/handlers/booking/list.ts',
  'src/handlers/booking/update.ts',
  'src/handlers/booking/cancel.ts',
  'src/handlers/auth/authorizer.ts'
];

console.log('📋 Checking Lambda handlers:');
handlers.forEach(handler => {
  const filePath = path.join(__dirname, '..', handler);
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf-8');
    if (content.includes('TODO') || content.includes('implementation pending')) {
      console.log(`  ⚠️  ${handler} - Not implemented`);
      checks.handlers = false;
    } else {
      console.log(`  ✅ ${handler} - OK`);
    }
  } else {
    console.log(`  ❌ ${handler} - File not found`);
    checks.handlers = false;
  }
});

// Check environment configuration
console.log('\n🔧 Checking environment configuration:');
const requiredEnvVars = [
  'AWS_REGION',
  'USER_POOL_ID',
  'USER_POOL_CLIENT_ID',
  'DB_CLUSTER_ARN',
  'DB_SECRET_ARN'
];

const envFile = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFile)) {
  console.log('  ✅ .env file exists');
} else {
  console.log('  ❌ .env file not found');
  checks.environment = false;
}

// Check package.json
console.log('\n📦 Checking dependencies:');
const packageJson = require('../package.json');
if (packageJson.dependencies && Object.keys(packageJson.dependencies).length > 0) {
  console.log('  ✅ Dependencies defined');
} else {
  console.log('  ❌ No dependencies found');
  checks.dependencies = false;
}

// Check serverless.yml
console.log('\n⚙️  Checking serverless configuration:');
const serverlessYml = path.join(__dirname, '..', 'serverless.yml');
if (fs.existsSync(serverlessYml)) {
  console.log('  ✅ serverless.yml exists');
} else {
  console.log('  ❌ serverless.yml not found');
  checks.infrastructure = false;
}

// Summary
console.log('\n📊 Deployment Readiness Summary:');
console.log('================================');
Object.entries(checks).forEach(([category, status]) => {
  console.log(`${status ? '✅' : '❌'} ${category.charAt(0).toUpperCase() + category.slice(1)}`);
});

const isReady = Object.values(checks).every(check => check);

if (isReady) {
  console.log('\n✅ The application is ready for deployment!');
  console.log('\nTo deploy:');
  console.log('  1. Configure AWS credentials: aws configure');
  console.log('  2. Deploy to dev: npm run deploy:dev');
  console.log('  3. Deploy to prod: npm run deploy:prod');
} else {
  console.log('\n❌ The application is NOT ready for deployment.');
  console.log('\nRequired actions:');
  if (!checks.handlers) {
    console.log('  - Implement Lambda handler functions');
  }
  if (!checks.environment) {
    console.log('  - Create and configure .env file');
  }
  if (!checks.dependencies) {
    console.log('  - Install dependencies: npm install');
  }
  if (!checks.infrastructure) {
    console.log('  - Fix serverless configuration');
  }
}

process.exit(isReady ? 0 : 1);