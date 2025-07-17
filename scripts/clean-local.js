const { DynamoDBClient, DeleteTableCommand, ListTablesCommand } = require('@aws-sdk/client-dynamodb');
const { S3Client, DeleteBucketCommand, DeleteObjectsCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { Pool } = require('pg');

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

// PostgreSQL connection
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'clinic_reservation',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

async function cleanDynamoDB() {
  console.log('🧹 Cleaning DynamoDB tables...');
  
  try {
    const { TableNames } = await dynamoClient.send(new ListTablesCommand({}));
    
    for (const tableName of TableNames || []) {
      if (tableName.startsWith('clinic-reservation-system-dev-')) {
        try {
          await dynamoClient.send(new DeleteTableCommand({ TableName: tableName }));
          console.log(`✓ Deleted table: ${tableName}`);
        } catch (error) {
          console.error(`✗ Error deleting table ${tableName}:`, error.message);
        }
      }
    }
  } catch (error) {
    console.error('Error cleaning DynamoDB:', error);
  }
}

async function cleanS3() {
  console.log('\n🧹 Cleaning S3 buckets...');
  
  const bucketName = 'clinic-reservation-system-dev-files';
  
  try {
    // First, delete all objects in the bucket
    const { Contents } = await s3Client.send(new ListObjectsV2Command({ Bucket: bucketName }));
    
    if (Contents && Contents.length > 0) {
      const objects = Contents.map(obj => ({ Key: obj.Key }));
      await s3Client.send(new DeleteObjectsCommand({
        Bucket: bucketName,
        Delete: { Objects: objects }
      }));
      console.log(`✓ Deleted ${objects.length} objects from bucket: ${bucketName}`);
    }
    
    // Then delete the bucket
    await s3Client.send(new DeleteBucketCommand({ Bucket: bucketName }));
    console.log(`✓ Deleted bucket: ${bucketName}`);
  } catch (error) {
    if (error.name === 'NoSuchBucket') {
      console.log(`○ Bucket does not exist: ${bucketName}`);
    } else {
      console.error(`✗ Error cleaning S3:`, error.message);
    }
  }
}

async function cleanPostgreSQL() {
  console.log('\n🧹 Cleaning PostgreSQL data...');
  
  const client = await pool.connect();
  
  try {
    // Get all table names
    const result = await client.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public' 
      AND tablename NOT IN ('migrations')
      ORDER BY tablename
    `);
    
    if (result.rows.length > 0) {
      // Disable foreign key checks temporarily
      await client.query('SET session_replication_role = replica;');
      
      // Truncate all tables
      for (const row of result.rows) {
        await client.query(`TRUNCATE TABLE ${row.tablename} CASCADE`);
        console.log(`✓ Truncated table: ${row.tablename}`);
      }
      
      // Re-enable foreign key checks
      await client.query('SET session_replication_role = DEFAULT;');
    }
    
    console.log('✓ PostgreSQL data cleaned');
  } catch (error) {
    console.error('Error cleaning PostgreSQL:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

async function main() {
  console.log('🚀 Starting local environment cleanup...\n');
  
  const args = process.argv.slice(2);
  const cleanAll = args.length === 0 || args.includes('--all');
  
  if (cleanAll || args.includes('--dynamodb')) {
    await cleanDynamoDB();
  }
  
  if (cleanAll || args.includes('--s3')) {
    await cleanS3();
  }
  
  if (cleanAll || args.includes('--postgres')) {
    await cleanPostgreSQL();
  }
  
  console.log('\n✅ Cleanup complete!');
  console.log('\nUsage:');
  console.log('  node scripts/clean-local.js          # Clean all');
  console.log('  node scripts/clean-local.js --dynamodb  # Clean only DynamoDB');
  console.log('  node scripts/clean-local.js --s3        # Clean only S3');
  console.log('  node scripts/clean-local.js --postgres  # Clean only PostgreSQL');
}

main().catch(console.error);