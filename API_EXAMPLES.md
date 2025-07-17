# 🔌 API Usage Examples

## Authentication

### Patient Registration
```bash
curl -X POST https://api.clinic-reservation.com/patients/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "patient@example.com",
    "password": "SecurePass123!",
    "name": "田中 太郎",
    "phoneNumber": "+819012345678",
    "dateOfBirth": "1985-03-15",
    "gender": "male",
    "address": {
      "street": "渋谷区道玄坂1-1-1",
      "city": "渋谷区",
      "state": "東京都",
      "postalCode": "150-0043",
      "country": "JP"
    },
    "preferredLanguage": "ja",
    "termsAccepted": true
  }'

# Response
{
  "success": true,
  "data": {
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "patientId": "660e8400-e29b-41d4-a716-446655440000",
    "email": "patient@example.com",
    "medicalRecordNumber": "MRN2025000001"
  }
}
```

### Login (via Cognito)
```bash
# Use AWS Cognito SDK or Amplify for authentication
# Returns JWT tokens for API access
```

## Booking Management

### Create Booking
```bash
curl -X POST https://api.clinic-reservation.com/bookings \
  -H "Authorization: Bearer {JWT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "doctorId": "770e8400-e29b-41d4-a716-446655440000",
    "serviceTypeId": "880e8400-e29b-41d4-a716-446655440000",
    "appointmentTime": "2025-01-20T10:00:00.000Z",
    "notes": "定期健診をお願いします",
    "isFirstVisit": false,
    "symptoms": ["頭痛", "めまい"],
    "preferredLanguage": "ja",
    "paymentMethodId": "990e8400-e29b-41d4-a716-446655440000"
  }'

# Response
{
  "success": true,
  "data": {
    "id": "booking_123456",
    "patient_id": "660e8400-e29b-41d4-a716-446655440000",
    "doctor_id": "770e8400-e29b-41d4-a716-446655440000",
    "appointment_time": "2025-01-20T10:00:00.000Z",
    "status": "pending",
    "total_amount": 5000,
    "patient_payment_amount": 1500,
    "insurance_covered_amount": 3500,
    "qr_code": "data:image/png;base64,..."
  }
}
```

### List My Bookings
```bash
curl -X GET "https://api.clinic-reservation.com/bookings?status=confirmed&limit=10" \
  -H "Authorization: Bearer {JWT_TOKEN}"

# Response
{
  "success": true,
  "data": {
    "bookings": [
      {
        "id": "booking_123456",
        "appointment_time": "2025-01-20T10:00:00.000Z",
        "doctor_name": "山田 医師",
        "clinic_name": "渋谷クリニック",
        "service_name": "一般診察",
        "status": "confirmed"
      }
    ],
    "pagination": {
      "total": 15,
      "limit": 10,
      "offset": 0,
      "hasMore": true
    }
  }
}
```

### Update Booking
```bash
curl -X PUT https://api.clinic-reservation.com/bookings/booking_123456 \
  -H "Authorization: Bearer {JWT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "appointmentTime": "2025-01-21T14:00:00.000Z",
    "notes": "時間を変更させていただきます"
  }'

# Response
{
  "success": true,
  "data": {
    "id": "booking_123456",
    "appointment_time": "2025-01-21T14:00:00.000Z",
    "status": "confirmed",
    "updated_at": "2025-01-17T12:00:00.000Z"
  }
}
```

### Cancel Booking
```bash
curl -X POST https://api.clinic-reservation.com/bookings/booking_123456/cancel \
  -H "Authorization: Bearer {JWT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "急用のため"
  }'

# Response
{
  "success": true,
  "data": {
    "id": "booking_123456",
    "status": "cancelled",
    "cancellation_reason": "急用のため",
    "cancelled_at": "2025-01-17T12:00:00.000Z"
  }
}
```

## Doctor Availability

### Check Doctor Availability
```bash
curl -X GET "https://api.clinic-reservation.com/doctors/770e8400/availability?date=2025-01-20&timezone=Asia/Tokyo"

# Response
{
  "success": true,
  "data": {
    "doctorId": "770e8400-e29b-41d4-a716-446655440000",
    "date": "2025-01-20",
    "timezone": "Asia/Tokyo",
    "timeSlots": [
      {
        "time": "09:00",
        "available": true,
        "doctorId": "770e8400-e29b-41d4-a716-446655440000"
      },
      {
        "time": "09:30",
        "available": true,
        "doctorId": "770e8400-e29b-41d4-a716-446655440000"
      },
      {
        "time": "10:00",
        "available": false,
        "doctorId": "770e8400-e29b-41d4-a716-446655440000"
      }
    ]
  }
}
```

### Search Available Doctors
```bash
curl -X GET "https://api.clinic-reservation.com/doctors/search-available?clinicId=clinic123&date=2025-01-20&serviceTypeId=service456&preferredTime=14:00"

# Response
{
  "success": true,
  "data": {
    "clinicId": "clinic123",
    "date": "2025-01-20",
    "totalFound": 3,
    "doctors": [
      {
        "doctor": {
          "id": "doctor1",
          "name": "山田 太郎",
          "specialization": "内科",
          "rating": 4.8
        },
        "availableSlots": [
          {"time": "14:00", "available": true},
          {"time": "14:30", "available": true},
          {"time": "15:00", "available": true}
        ]
      },
      {
        "doctor": {
          "id": "doctor2",
          "name": "佐藤 花子",
          "specialization": "内科",
          "rating": 4.9
        },
        "availableSlots": [
          {"time": "13:30", "available": true},
          {"time": "14:00", "available": true}
        ]
      }
    ]
  }
}
```

## Payment

### Create Payment Intent
```bash
curl -X POST https://api.clinic-reservation.com/payments/create-intent \
  -H "Authorization: Bearer {JWT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "bookingId": "booking_123456",
    "amount": 1500,
    "currency": "jpy",
    "paymentMethodId": "pm_1234567890"
  }'

# Response
{
  "success": true,
  "data": {
    "paymentIntentId": "pi_1234567890",
    "clientSecret": "pi_1234567890_secret_key",
    "amount": 1500,
    "currency": "jpy"
  }
}
```

## Health Check

### System Health
```bash
curl -X GET https://api.clinic-reservation.com/health

# Response
{
  "status": "healthy",
  "timestamp": "2025-01-17T12:00:00.000Z",
  "service": "clinic-reservation-system",
  "version": "1.0.0",
  "environment": "prod",
  "checks": [
    {
      "service": "aurora-database",
      "status": "healthy",
      "latency": 45
    },
    {
      "service": "redis-cache",
      "status": "healthy",
      "latency": 12
    }
  ],
  "responseTime": 58
}
```

## Error Responses

### Validation Error
```json
{
  "error": "Validation error: appointmentTime must be in the future",
  "requestId": "abc123-def456"
}
```

### Authentication Error
```json
{
  "error": "Unauthorized",
  "requestId": "abc123-def456"
}
```

### Rate Limit Error
```json
{
  "error": "Too many requests",
  "retryAfter": 60,
  "requestId": "abc123-def456"
}
```

## Headers

### Required Headers
- `Authorization: Bearer {JWT_TOKEN}` - For authenticated endpoints
- `Content-Type: application/json` - For POST/PUT requests
- `Accept-Language: ja` - For language preference (optional)

### Response Headers
- `X-Request-Id` - Unique request identifier
- `X-Rate-Limit-Remaining` - Remaining requests in window
- `X-Rate-Limit-Reset` - Time when rate limit resets

---

## 🌐 Multi-language Support

All endpoints support multiple languages via `Accept-Language` header:
- `ja` - Japanese (default)
- `en` - English
- `zh` - Chinese
- `ko` - Korean

Example:
```bash
curl -X GET https://api.clinic-reservation.com/bookings \
  -H "Authorization: Bearer {JWT_TOKEN}" \
  -H "Accept-Language: en"
```