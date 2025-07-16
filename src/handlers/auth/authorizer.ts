import { APIGatewayAuthorizerResult, APIGatewayTokenAuthorizerEvent, Context } from 'aws-lambda';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import { logger } from '../../utils/logger';

interface JwtPayload {
  sub: string;
  'cognito:groups'?: string[];
  email?: string;
  phone_number?: string;
  [key: string]: any;
}

// JWKS client setup
const client = jwksClient({
  jwksUri: `https://cognito-idp.${process.env.REGION}.amazonaws.com/${process.env.USER_POOL_ID}/.well-known/jwks.json`,
  cache: true,
  cacheMaxEntries: 5,
  cacheMaxAge: 600000, // 10 minutes
});

// Get signing key
const getSigningKey = (kid: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    client.getSigningKey(kid, (err, key) => {
      if (err) {
        reject(err);
      } else {
        const signingKey = key?.getPublicKey();
        if (signingKey) {
          resolve(signingKey);
        } else {
          reject(new Error('Unable to get signing key'));
        }
      }
    });
  });
};

// Generate policy document
const generatePolicy = (
  principalId: string,
  effect: 'Allow' | 'Deny',
  resource: string,
  context?: Record<string, any>
): APIGatewayAuthorizerResult => {
  const authResponse: APIGatewayAuthorizerResult = {
    principalId,
    policyDocument: {
      Version: '2012-10-17',
      Statement: [
        {
          Action: 'execute-api:Invoke',
          Effect: effect,
          Resource: resource,
        },
      ],
    },
  };

  if (context) {
    authResponse.context = context;
  }

  return authResponse;
};

// Main authorizer handler
export const handler = async (
  event: APIGatewayTokenAuthorizerEvent,
  context: Context
): Promise<APIGatewayAuthorizerResult> => {
  logger.info('Authorizer invoked', { methodArn: event.methodArn });

  try {
    // Extract token
    const token = event.authorizationToken?.replace('Bearer ', '');
    
    if (!token) {
      throw new Error('No token provided');
    }

    // Decode token to get header
    const decodedToken = jwt.decode(token, { complete: true });
    
    if (!decodedToken || typeof decodedToken === 'string') {
      throw new Error('Invalid token format');
    }

    // Get signing key
    const kid = decodedToken.header.kid;
    if (!kid) {
      throw new Error('No kid in token header');
    }

    const signingKey = await getSigningKey(kid);

    // Verify token
    const payload = jwt.verify(token, signingKey, {
      algorithms: ['RS256'],
      issuer: `https://cognito-idp.${process.env.REGION}.amazonaws.com/${process.env.USER_POOL_ID}`,
      audience: process.env.CLIENT_ID,
    }) as JwtPayload;

    // Check token expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      throw new Error('Token expired');
    }

    // Extract user groups for role-based access
    const groups = payload['cognito:groups'] || [];
    const isAdmin = groups.includes('admin');
    const isStaff = groups.includes('staff') || isAdmin;
    const isPatient = groups.includes('patient') || (!isAdmin && !isStaff);

    // Build context
    const authContext = {
      userId: payload.sub,
      email: payload.email || '',
      phoneNumber: payload.phone_number || '',
      groups: groups.join(','),
      isAdmin: isAdmin.toString(),
      isStaff: isStaff.toString(),
      isPatient: isPatient.toString(),
    };

    logger.info('Authorization successful', { userId: payload.sub, groups });

    return generatePolicy(payload.sub, 'Allow', event.methodArn, authContext);
  } catch (error) {
    logger.error('Authorization failed', { error });
    
    // Return explicit deny
    return generatePolicy('user', 'Deny', event.methodArn);
  }
};

// Role-based access control helper
export const checkRole = (event: any, requiredRoles: string[]): boolean => {
  const context = event.requestContext?.authorizer;
  
  if (!context) {
    return false;
  }

  const userGroups = context.groups?.split(',') || [];
  
  return requiredRoles.some(role => {
    switch (role) {
      case 'admin':
        return context.isAdmin === 'true';
      case 'staff':
        return context.isStaff === 'true';
      case 'patient':
        return context.isPatient === 'true';
      default:
        return userGroups.includes(role);
    }
  });
};

// Get user context from event
export const getUserContext = (event: any): {
  userId: string;
  email?: string;
  phoneNumber?: string;
  groups: string[];
  isAdmin: boolean;
  isStaff: boolean;
  isPatient: boolean;
} | null => {
  const context = event.requestContext?.authorizer;
  
  if (!context?.userId) {
    return null;
  }

  return {
    userId: context.userId,
    email: context.email,
    phoneNumber: context.phoneNumber,
    groups: context.groups?.split(',') || [],
    isAdmin: context.isAdmin === 'true',
    isStaff: context.isStaff === 'true',
    isPatient: context.isPatient === 'true',
  };
};