import Joi from 'joi';

export interface ValidationResult {
  isValid: boolean;
  errors?: string[];
}

// Booking request validation schema
const bookingRequestSchema = Joi.object({
  patientId: Joi.string().required().messages({
    'string.empty': 'Patient ID is required',
    'any.required': 'Patient ID is required'
  }),
  doctorId: Joi.string().required().messages({
    'string.empty': 'Doctor ID is required',
    'any.required': 'Doctor ID is required'
  }),
  serviceTypeId: Joi.string().required().messages({
    'string.empty': 'Service type ID is required',
    'any.required': 'Service type ID is required'
  }),
  appointmentTime: Joi.date().iso().required().messages({
    'date.base': 'Appointment time must be a valid date',
    'date.format': 'Appointment time must be in ISO format',
    'any.required': 'Appointment time is required'
  }),
  duration: Joi.number().integer().min(15).max(240).default(30).messages({
    'number.base': 'Duration must be a number',
    'number.integer': 'Duration must be an integer',
    'number.min': 'Duration must be at least 15 minutes',
    'number.max': 'Duration cannot exceed 240 minutes'
  }),
  notes: Joi.string().max(500).optional().messages({
    'string.max': 'Notes cannot exceed 500 characters'
  }),
  patientInfo: Joi.object({
    name: Joi.string().required().messages({
      'string.empty': 'Patient name is required',
      'any.required': 'Patient name is required'
    }),
    phone: Joi.string().pattern(/^[\+]?[0-9\-\s\(\)]+$/).required().messages({
      'string.pattern.base': 'Phone number format is invalid',
      'string.empty': 'Phone number is required',
      'any.required': 'Phone number is required'
    }),
    email: Joi.string().email().required().messages({
      'string.email': 'Email format is invalid',
      'string.empty': 'Email is required',
      'any.required': 'Email is required'
    }),
    reason: Joi.string().max(200).optional().messages({
      'string.max': 'Reason cannot exceed 200 characters'
    })
  }).required()
});

export const validateBookingRequest = (data: any): ValidationResult => {
  const { error } = bookingRequestSchema.validate(data, { 
    abortEarly: false,
    allowUnknown: false 
  });

  if (error) {
    return {
      isValid: false,
      errors: error.details.map(detail => detail.message)
    };
  }

  return { isValid: true };
};

// Patient registration validation schema
const patientRegistrationSchema = Joi.object({
  name: Joi.string().min(2).max(100).required().messages({
    'string.min': 'Name must be at least 2 characters',
    'string.max': 'Name cannot exceed 100 characters',
    'string.empty': 'Name is required',
    'any.required': 'Name is required'
  }),
  email: Joi.string().email().required().messages({
    'string.email': 'Email format is invalid',
    'string.empty': 'Email is required',
    'any.required': 'Email is required'
  }),
  phone: Joi.string().pattern(/^[\+]?[0-9\-\s\(\)]+$/).required().messages({
    'string.pattern.base': 'Phone number format is invalid',
    'string.empty': 'Phone number is required',
    'any.required': 'Phone number is required'
  }),
  birthDate: Joi.date().max('now').required().messages({
    'date.base': 'Birth date must be a valid date',
    'date.max': 'Birth date cannot be in the future',
    'any.required': 'Birth date is required'
  }),
  gender: Joi.string().valid('male', 'female', 'other').optional(),
  address: Joi.string().max(200).optional().messages({
    'string.max': 'Address cannot exceed 200 characters'
  })
});

export const validatePatientRegistration = (data: any): ValidationResult => {
  const { error } = patientRegistrationSchema.validate(data, { 
    abortEarly: false,
    allowUnknown: false 
  });

  if (error) {
    return {
      isValid: false,
      errors: error.details.map(detail => detail.message)
    };
  }

  return { isValid: true };
};