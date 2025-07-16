# Clinic Reservation System

A serverless clinic reservation system built with AWS Lambda, Aurora Serverless, and TypeScript.

## Architecture

- **Backend**: AWS Lambda functions with TypeScript
- **Database**: Aurora Serverless v2 (PostgreSQL)
- **API Gateway**: RESTful API endpoints
- **Authentication**: AWS Cognito
- **Monitoring**: CloudWatch + X-Ray
- **Infrastructure**: Serverless Framework

## Features

- Patient booking management
- Doctor schedule management
- Multi-channel booking (Web, LINE, Mobile)
- Online consultation support
- Automated notifications (Email, SMS, LINE)
- Family booking management
- Continuous treatment booking
- Medical questionnaires
- Reporting and analytics

## Prerequisites

- Node.js 18.x or later
- AWS CLI configured
- Serverless Framework CLI
- PostgreSQL (for local development)

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm run setup
   ```

## Configuration

### Environment Variables

Create a `.env` file for local development:

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=clinic_reservation
DB_USER=postgres
DB_PASSWORD=your_password

# AWS
AWS_REGION=ap-northeast-1
STAGE=dev

# Logging
LOG_LEVEL=info
```

### AWS Configuration

Ensure your AWS credentials are configured:

```bash
aws configure
```

## Development

### Local Development

1. Start the local development server:
   ```bash
   npm run dev
   ```

2. The API will be available at `http://localhost:3000`

### Database Setup

1. Run database migrations:
   ```bash
   npm run migrate:dev
   ```

### Testing

Run tests:
```bash
npm test
```

Run tests with coverage:
```bash
npm run test:coverage
```

Watch mode for development:
```bash
npm run test:watch
```

### Linting

Check code style:
```bash
npm run lint
```

Fix linting issues:
```bash
npm run lint:fix
```

## Deployment

### Development Environment

```bash
npm run deploy:dev
```

### Production Environment

```bash
npm run deploy:prod
```

## API Endpoints

### Health Check
- `GET /health` - System health status

### Booking Management
- `POST /bookings` - Create a new booking
- `GET /bookings` - List bookings with filters
- `PUT /bookings/{id}` - Update booking
- `DELETE /bookings/{id}` - Cancel booking

### Authentication
All booking endpoints require authentication via AWS Cognito.

## Infrastructure

The system uses the following AWS services:

- **Lambda**: Serverless compute
- **Aurora Serverless v2**: PostgreSQL database
- **API Gateway**: REST API management
- **Cognito**: User authentication
- **DynamoDB**: High-frequency data caching
- **SQS**: Message queuing
- **SNS**: Notifications
- **SES**: Email delivery
- **CloudWatch**: Monitoring and logging
- **Systems Manager**: Parameter storage
- **Secrets Manager**: Sensitive data storage

## Database Schema

The system includes the following main entities:

- **Clinics**: Medical facilities
- **Doctors**: Healthcare providers
- **Patients**: System users
- **Bookings**: Appointment records
- **Service Types**: Available medical services
- **Schedules**: Doctor and clinic availability
- **Questionnaires**: Medical intake forms
- **Video Sessions**: Online consultation records

## Monitoring

- CloudWatch dashboards for system metrics
- X-Ray tracing for request tracking
- Automated alarms for error rates and performance
- Log aggregation and analysis

## Security

- JWT-based authentication
- Role-based access control (Patient, Staff, Admin)
- Data encryption at rest and in transit
- HIPAA-compliant data handling
- VPC isolation for database access

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

## License

MIT License - see LICENSE file for details.