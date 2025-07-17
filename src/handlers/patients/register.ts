import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { CognitoIdentityProviderClient, AdminCreateUserCommand, AdminSetUserPasswordCommand } from '@aws-sdk/client-cognito-identity-provider';
import { getAuroraClient } from '../../utils/aurora-client';
import { createResponse, createErrorResponse } from '../../utils/response';
import { logger } from '../../utils/logger';
import Joi from 'joi';

const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION || 'ap-northeast-1'
});

const auroraClient = getAuroraClient();

// Validation schema
const registrationSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).required(),
  name: Joi.string().min(2).max(100).required(),
  phoneNumber: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).required(),
  dateOfBirth: Joi.date().iso().max('now').required(),
  gender: Joi.string().valid('male', 'female', 'other').required(),
  address: Joi.object({
    street: Joi.string().required(),
    city: Joi.string().required(),
    state: Joi.string().required(),
    postalCode: Joi.string().required(),
    country: Joi.string().default('JP')
  }).required(),
  preferredLanguage: Joi.string().valid('ja', 'en', 'zh', 'ko').default('ja'),
  emergencyContact: Joi.object({
    name: Joi.string().required(),
    relationship: Joi.string().required(),
    phoneNumber: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).required()
  }).optional(),
  medicalHistory: Joi.object({
    allergies: Joi.array().items(Joi.string()).optional(),
    chronicConditions: Joi.array().items(Joi.string()).optional(),
    currentMedications: Joi.array().items(Joi.string()).optional()
  }).optional(),
  insuranceInfo: Joi.object({
    provider: Joi.string().required(),
    policyNumber: Joi.string().required(),
    groupNumber: Joi.string().optional(),
    expiryDate: Joi.date().iso().min('now').required()
  }).optional(),
  marketingConsent: Joi.boolean().default(false),
  termsAccepted: Joi.boolean().valid(true).required()
});

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  const transactionId = await auroraClient.beginTransaction();

  try {
    // Parse and validate request body
    if (!event.body) {
      return createErrorResponse(400, 'Request body is required');
    }

    let requestBody;
    try {
      requestBody = JSON.parse(event.body);
    } catch (error) {
      return createErrorResponse(400, 'Invalid JSON in request body');
    }

    // Validate input
    const { error, value: validatedData } = registrationSchema.validate(requestBody);
    if (error) {
      return createErrorResponse(400, `Validation error: ${error.details[0].message}`);
    }

    // Check if email already exists
    const existingUserResult = await auroraClient.queryWithTransaction(
      'SELECT id FROM users WHERE email = $1',
      [validatedData.email],
      transactionId
    );

    if (existingUserResult.records.length > 0) {
      await auroraClient.rollbackTransaction(transactionId);
      return createErrorResponse(409, 'Email already registered');
    }

    // Generate IDs
    const userId = uuidv4();
    const patientId = uuidv4();
    const now = new Date().toISOString();

    // Create Cognito user
    try {
      await cognitoClient.send(new AdminCreateUserCommand({
        UserPoolId: process.env.USER_POOL_ID,
        Username: validatedData.email,
        UserAttributes: [
          { Name: 'email', Value: validatedData.email },
          { Name: 'phone_number', Value: validatedData.phoneNumber },
          { Name: 'name', Value: validatedData.name },
          { Name: 'custom:user_id', Value: userId },
          { Name: 'custom:user_type', Value: 'patient' }
        ],
        MessageAction: 'SUPPRESS' // Don't send welcome email yet
      }));

      // Set permanent password
      await cognitoClient.send(new AdminSetUserPasswordCommand({
        UserPoolId: process.env.USER_POOL_ID,
        Username: validatedData.email,
        Password: validatedData.password,
        Permanent: true
      }));
    } catch (cognitoError: any) {
      await auroraClient.rollbackTransaction(transactionId);
      logger.error('Cognito user creation failed', { error: cognitoError });
      
      if (cognitoError.name === 'UsernameExistsException') {
        return createErrorResponse(409, 'Email already registered');
      }
      
      throw cognitoError;
    }

    // Hash password for database storage (as backup)
    const hashedPassword = await bcrypt.hash(validatedData.password, 10);

    // Create user record
    await auroraClient.queryWithTransaction(
      `INSERT INTO users (
        id, email, password_hash, name, phone_number, 
        user_type, is_active, email_verified, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        userId,
        validatedData.email,
        hashedPassword,
        validatedData.name,
        validatedData.phoneNumber,
        'patient',
        true,
        false, // Email not verified yet
        now,
        now
      ],
      transactionId
    );

    // Create patient record
    await auroraClient.queryWithTransaction(
      `INSERT INTO patients (
        id, user_id, date_of_birth, gender, blood_type,
        address, emergency_contact_name, emergency_contact_phone,
        emergency_contact_relationship, preferred_language,
        marketing_consent, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        patientId,
        userId,
        validatedData.dateOfBirth,
        validatedData.gender,
        null, // Blood type can be added later
        JSON.stringify(validatedData.address),
        validatedData.emergencyContact?.name || null,
        validatedData.emergencyContact?.phoneNumber || null,
        validatedData.emergencyContact?.relationship || null,
        validatedData.preferredLanguage,
        validatedData.marketingConsent,
        now,
        now
      ],
      transactionId
    );

    // Create medical history if provided
    if (validatedData.medicalHistory) {
      const medicalHistoryId = uuidv4();
      await auroraClient.queryWithTransaction(
        `INSERT INTO medical_histories (
          id, patient_id, allergies, chronic_conditions,
          current_medications, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          medicalHistoryId,
          patientId,
          JSON.stringify(validatedData.medicalHistory.allergies || []),
          JSON.stringify(validatedData.medicalHistory.chronicConditions || []),
          JSON.stringify(validatedData.medicalHistory.currentMedications || []),
          now,
          now
        ],
        transactionId
      );
    }

    // Create insurance record if provided
    if (validatedData.insuranceInfo) {
      const insuranceId = uuidv4();
      await auroraClient.queryWithTransaction(
        `INSERT INTO patient_insurance (
          id, patient_id, provider, policy_number, group_number,
          expiry_date, coverage_percentage, is_active, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          insuranceId,
          patientId,
          validatedData.insuranceInfo.provider,
          validatedData.insuranceInfo.policyNumber,
          validatedData.insuranceInfo.groupNumber || null,
          validatedData.insuranceInfo.expiryDate,
          70, // Default coverage percentage
          true,
          now
        ],
        transactionId
      );
    }

    // Generate medical record number
    const medicalRecordNumber = await generateMedicalRecordNumber();
    await auroraClient.queryWithTransaction(
      'UPDATE patients SET medical_record_number = $1 WHERE id = $2',
      [medicalRecordNumber, patientId],
      transactionId
    );

    // Commit transaction
    await auroraClient.commitTransaction(transactionId);

    logger.info('Patient registered successfully', {
      userId,
      patientId,
      email: validatedData.email,
      medicalRecordNumber
    });

    // TODO: Send verification email

    return createResponse(201, {
      success: true,
      data: {
        userId,
        patientId,
        email: validatedData.email,
        name: validatedData.name,
        medicalRecordNumber,
        message: 'Registration successful. Please check your email to verify your account.'
      }
    });

  } catch (error: any) {
    await auroraClient.rollbackTransaction(transactionId);
    
    logger.error('Patient registration error', {
      error: error.message,
      stack: error.stack,
      event: {
        body: event.body,
      }
    });

    if (error.message?.includes('already exists')) {
      return createErrorResponse(409, 'User already exists');
    }

    return createErrorResponse(500, 'Failed to register patient', {
      requestId: event.requestContext.requestId
    });
  }
};

async function generateMedicalRecordNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `MRN${year}`;
  
  // Get the latest medical record number for this year
  const result = await auroraClient.query(
    `SELECT medical_record_number FROM patients 
     WHERE medical_record_number LIKE $1 
     ORDER BY medical_record_number DESC 
     LIMIT 1`,
    [`${prefix}%`]
  );

  let sequence = 1;
  if (result.records.length > 0) {
    const lastNumber = result.records[0].medical_record_number;
    const lastSequence = parseInt(lastNumber.replace(prefix, ''));
    sequence = lastSequence + 1;
  }

  return `${prefix}${sequence.toString().padStart(6, '0')}`;
}