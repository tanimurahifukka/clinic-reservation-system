import { RDSDataClient, ExecuteStatementCommand, BatchExecuteStatementCommand, BeginTransactionCommand, CommitTransactionCommand, RollbackTransactionCommand } from '@aws-sdk/client-rds-data';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { logger } from './logger';

interface AuroraConfig {
  clusterArn: string;
  secretArn: string;
  database: string;
  region: string;
}

interface QueryResult {
  records: any[];
  columnMetadata?: any[];
  numberOfRecordsUpdated?: number;
  generatedFields?: any[];
}

export class AuroraClient {
  private client: RDSDataClient;
  private config: AuroraConfig;
  private secretsClient: SecretsManagerClient;
  private cachedSecret: any = null;
  private secretCacheExpiry: number = 0;

  constructor(config: AuroraConfig) {
    this.config = config;
    this.client = new RDSDataClient({ region: config.region });
    this.secretsClient = new SecretsManagerClient({ region: config.region });
  }

  private async getSecret(): Promise<any> {
    const now = Date.now();
    if (this.cachedSecret && now < this.secretCacheExpiry) {
      return this.cachedSecret;
    }

    try {
      const command = new GetSecretValueCommand({ SecretId: this.config.secretArn });
      const response = await this.secretsClient.send(command);
      
      if (response.SecretString) {
        this.cachedSecret = JSON.parse(response.SecretString);
        this.secretCacheExpiry = now + 3600000; // Cache for 1 hour
        return this.cachedSecret;
      }
      
      throw new Error('Secret not found');
    } catch (error) {
      logger.error('Failed to retrieve database secret', { error });
      throw error;
    }
  }

  async query(sql: string, parameters?: any[]): Promise<QueryResult> {
    try {
      const params = {
        resourceArn: this.config.clusterArn,
        secretArn: this.config.secretArn,
        database: this.config.database,
        sql,
        parameters: parameters ? this.formatParameters(parameters) : undefined,
        includeResultMetadata: true,
      };

      const command = new ExecuteStatementCommand(params);
      const response = await this.client.send(command);

      return {
        records: this.formatRecords(response.records || [], response.columnMetadata || []),
        columnMetadata: response.columnMetadata,
        numberOfRecordsUpdated: response.numberOfRecordsUpdated,
        generatedFields: response.generatedFields,
      };
    } catch (error) {
      logger.error('Database query failed', { sql, error });
      throw error;
    }
  }

  async batchQuery(sql: string, parameterSets: any[][]): Promise<any> {
    try {
      const params = {
        resourceArn: this.config.clusterArn,
        secretArn: this.config.secretArn,
        database: this.config.database,
        sql,
        parameterSets: parameterSets.map(params => this.formatParameters(params)),
      };

      const command = new BatchExecuteStatementCommand(params);
      const response = await this.client.send(command);

      return response.updateResults;
    } catch (error) {
      logger.error('Batch query failed', { sql, error });
      throw error;
    }
  }

  async beginTransaction(): Promise<string> {
    try {
      const params = {
        resourceArn: this.config.clusterArn,
        secretArn: this.config.secretArn,
        database: this.config.database,
      };

      const command = new BeginTransactionCommand(params);
      const response = await this.client.send(command);

      return response.transactionId!;
    } catch (error) {
      logger.error('Failed to begin transaction', { error });
      throw error;
    }
  }

  async commitTransaction(transactionId: string): Promise<void> {
    try {
      const params = {
        resourceArn: this.config.clusterArn,
        secretArn: this.config.secretArn,
        transactionId,
      };

      const command = new CommitTransactionCommand(params);
      await this.client.send(command);
    } catch (error) {
      logger.error('Failed to commit transaction', { transactionId, error });
      throw error;
    }
  }

  async rollbackTransaction(transactionId: string): Promise<void> {
    try {
      const params = {
        resourceArn: this.config.clusterArn,
        secretArn: this.config.secretArn,
        transactionId,
      };

      const command = new RollbackTransactionCommand(params);
      await this.client.send(command);
    } catch (error) {
      logger.error('Failed to rollback transaction', { transactionId, error });
      throw error;
    }
  }

  async queryWithTransaction(sql: string, parameters?: any[], transactionId?: string): Promise<QueryResult> {
    try {
      const params = {
        resourceArn: this.config.clusterArn,
        secretArn: this.config.secretArn,
        database: this.config.database,
        sql,
        parameters: parameters ? this.formatParameters(parameters) : undefined,
        transactionId,
        includeResultMetadata: true,
      };

      const command = new ExecuteStatementCommand(params);
      const response = await this.client.send(command);

      return {
        records: this.formatRecords(response.records || [], response.columnMetadata || []),
        columnMetadata: response.columnMetadata,
        numberOfRecordsUpdated: response.numberOfRecordsUpdated,
        generatedFields: response.generatedFields,
      };
    } catch (error) {
      logger.error('Transaction query failed', { sql, transactionId, error });
      throw error;
    }
  }

  private formatParameters(parameters: any[]): any[] {
    return parameters.map(param => {
      if (param === null || param === undefined) {
        return { isNull: true };
      } else if (typeof param === 'string') {
        return { stringValue: param };
      } else if (typeof param === 'number') {
        if (Number.isInteger(param)) {
          return { longValue: param };
        } else {
          return { doubleValue: param };
        }
      } else if (typeof param === 'boolean') {
        return { booleanValue: param };
      } else if (param instanceof Date) {
        return { stringValue: param.toISOString() };
      } else if (param instanceof Buffer) {
        return { blobValue: param };
      } else {
        return { stringValue: JSON.stringify(param) };
      }
    });
  }

  private formatRecords(records: any[], columnMetadata: any[]): any[] {
    return records.map(record => {
      const formattedRecord: any = {};
      
      record.forEach((field: any, index: number) => {
        const columnName = columnMetadata[index]?.name || `column${index}`;
        
        if (field.isNull) {
          formattedRecord[columnName] = null;
        } else if (field.stringValue !== undefined) {
          formattedRecord[columnName] = field.stringValue;
        } else if (field.longValue !== undefined) {
          formattedRecord[columnName] = field.longValue;
        } else if (field.doubleValue !== undefined) {
          formattedRecord[columnName] = field.doubleValue;
        } else if (field.booleanValue !== undefined) {
          formattedRecord[columnName] = field.booleanValue;
        } else if (field.blobValue !== undefined) {
          formattedRecord[columnName] = field.blobValue;
        } else if (field.arrayValue !== undefined) {
          formattedRecord[columnName] = field.arrayValue;
        }
      });
      
      return formattedRecord;
    });
  }
}

// Singleton instance
let auroraClient: AuroraClient;

export const getAuroraClient = (): AuroraClient => {
  if (!auroraClient) {
    auroraClient = new AuroraClient({
      clusterArn: process.env.DB_CLUSTER_ARN!,
      secretArn: process.env.DB_SECRET_ARN!,
      database: process.env.DB_NAME!,
      region: process.env.REGION!,
    });
  }
  
  return auroraClient;
};