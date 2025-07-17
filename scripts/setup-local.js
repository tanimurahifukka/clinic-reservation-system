const { DynamoDBClient, CreateTableCommand } = require('@aws-sdk/client-dynamodb');
const { S3Client, CreateBucketCommand } = require('@aws-sdk/client-s3');

// Local DynamoDB client
const dynamoClient = new DynamoDBClient({
  endpoint: 'http://localhost:8000',
  region: 'ap-northeast-1',
  credentials: {
    accessKeyId: 'local',
    secretAccessKey: 'local'
  }
});

// Local S3 client (MinIO)
const s3Client = new S3Client({
  endpoint: 'http://localhost:9000',
  region: 'ap-northeast-1',
  credentials: {
    accessKeyId: 'minioadmin',
    secretAccessKey: 'minioadmin'
  },
  forcePathStyle: true
});

// DynamoDB table definitions
const tables = [
  {
    TableName: 'clinic-reservation-system-dev-booking-cache',
    KeySchema: [
      { AttributeName: 'pk', KeyType: 'HASH' },
      { AttributeName: 'sk', KeyType: 'RANGE' }
    ],
    AttributeDefinitions: [
      { AttributeName: 'pk', AttributeType: 'S' },
      { AttributeName: 'sk', AttributeType: 'S' },
      { AttributeName: 'gsi1pk', AttributeType: 'S' },
      { AttributeName: 'gsi1sk', AttributeType: 'S' }
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'GSI1',
        KeySchema: [
          { AttributeName: 'gsi1pk', KeyType: 'HASH' },
          { AttributeName: 'gsi1sk', KeyType: 'RANGE' }
        ],
        Projection: { ProjectionType: 'ALL' },
        BillingMode: 'PAY_PER_REQUEST'
      }
    ],
    BillingMode: 'PAY_PER_REQUEST'
  },
  {
    TableName: 'clinic-reservation-system-dev-notifications',
    KeySchema: [
      { AttributeName: 'pk', KeyType: 'HASH' },
      { AttributeName: 'sk', KeyType: 'RANGE' }
    ],
    AttributeDefinitions: [
      { AttributeName: 'pk', AttributeType: 'S' },
      { AttributeName: 'sk', AttributeType: 'S' }
    ],
    BillingMode: 'PAY_PER_REQUEST'
  },
  {
    TableName: 'clinic-reservation-system-dev-rate-limits',
    KeySchema: [
      { AttributeName: 'pk', KeyType: 'HASH' },
      { AttributeName: 'window', KeyType: 'RANGE' }
    ],
    AttributeDefinitions: [
      { AttributeName: 'pk', AttributeType: 'S' },
      { AttributeName: 'window', AttributeType: 'N' }
    ],
    BillingMode: 'PAY_PER_REQUEST'
  },
  {
    TableName: 'clinic-reservation-system-dev-sessions',
    KeySchema: [
      { AttributeName: 'sessionId', KeyType: 'HASH' }
    ],
    AttributeDefinitions: [
      { AttributeName: 'sessionId', AttributeType: 'S' },
      { AttributeName: 'userId', AttributeType: 'S' }
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'UserIdIndex',
        KeySchema: [
          { AttributeName: 'userId', KeyType: 'HASH' }
        ],
        Projection: { ProjectionType: 'ALL' },
        BillingMode: 'PAY_PER_REQUEST'
      }
    ],
    BillingMode: 'PAY_PER_REQUEST'
  },
  {
    TableName: 'clinic-reservation-system-dev-waiting-times',
    KeySchema: [
      { AttributeName: 'clinicId', KeyType: 'HASH' },
      { AttributeName: 'dateTime', KeyType: 'RANGE' }
    ],
    AttributeDefinitions: [
      { AttributeName: 'clinicId', AttributeType: 'S' },
      { AttributeName: 'dateTime', AttributeType: 'S' }
    ],
    BillingMode: 'PAY_PER_REQUEST'
  }
];

// S3 buckets
const buckets = [
  'clinic-reservation-system-dev-files'
];

async function createTables() {
  console.log('Creating DynamoDB tables...');
  
  for (const tableDefinition of tables) {
    try {
      await dynamoClient.send(new CreateTableCommand(tableDefinition));
      console.log(`✓ Created table: ${tableDefinition.TableName}`);
    } catch (error) {
      if (error.name === 'ResourceInUseException') {
        console.log(`○ Table already exists: ${tableDefinition.TableName}`);
      } else {
        console.error(`✗ Error creating table ${tableDefinition.TableName}:`, error);
      }
    }
  }
}

async function createBuckets() {
  console.log('\nCreating S3 buckets...');
  
  for (const bucketName of buckets) {
    try {
      await s3Client.send(new CreateBucketCommand({ Bucket: bucketName }));
      console.log(`✓ Created bucket: ${bucketName}`);
    } catch (error) {
      if (error.name === 'BucketAlreadyExists' || error.name === 'BucketAlreadyOwnedByYou') {
        console.log(`○ Bucket already exists: ${bucketName}`);
      } else {
        console.error(`✗ Error creating bucket ${bucketName}:`, error);
      }
    }
  }
}

async function main() {
  console.log('Setting up local development environment...\n');
  
  // Wait a bit for services to be ready
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  await createTables();
  await createBuckets();
  
  console.log('\n✓ Local setup complete!');
  console.log('\nServices available at:');
  console.log('- PostgreSQL: localhost:5432');
  console.log('- Redis: localhost:6379');
  console.log('- DynamoDB: http://localhost:8000');
  console.log('- MinIO (S3): http://localhost:9000 (Console: http://localhost:9001)');
  console.log('- MailHog: http://localhost:8025');
}

main().catch(console.error);