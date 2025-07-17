# 🏥 Clinic Reservation System

A comprehensive serverless clinic reservation system built with AWS Lambda, Aurora Serverless, and TypeScript. Features multi-language support (Japanese, English, Chinese, Korean), integrated payment processing with Stripe, real-time notifications via email/SMS/LINE, and video consultation capabilities.

## Architecture

- **Backend**: AWS Lambda functions with TypeScript
- **Database**: Aurora Serverless v2 (PostgreSQL)
- **API Gateway**: RESTful API endpoints
- **Authentication**: AWS Cognito
- **Monitoring**: CloudWatch + X-Ray
- **Infrastructure**: Serverless Framework

## 🚀 Features

### Core Features
- **Patient Booking Management** - Create, update, cancel appointments
- **Doctor Schedule Management** - Flexible scheduling with availability management
- **Multi-language Support** - Japanese, English, Chinese, Korean
- **Payment Processing** - Integrated Stripe payments with refund support
- **Insurance Support** - Patient insurance information and coverage calculation

### Communication
- **Multi-channel Notifications** - Email (AWS SES), SMS (AWS SNS), LINE Bot
- **Automated Reminders** - Configurable appointment reminders
- **Real-time Updates** - Instant booking confirmations and changes

### Advanced Features
- **Video Consultations** - Agora-powered online consultations
- **QR Code Integration** - Quick check-in and medical record access
- **Family Booking Management** - Manage appointments for family members
- **Medical Questionnaires** - Digital intake forms
- **Waiting Time Management** - Real-time clinic waiting estimates
- **Doctor Ratings & Reviews** - Patient feedback system

### Technical Features
- **Serverless Architecture** - Auto-scaling and cost-efficient
- **High Performance** - Redis caching, optimized queries
- **Security** - JWT authentication, role-based access control
- **GDPR Compliant** - Data privacy and patient rights
- **Comprehensive Monitoring** - CloudWatch dashboards and alerts

## 📋 Prerequisites

- **Node.js** 18.x or later
- **AWS CLI** configured with appropriate permissions
- **Serverless Framework** CLI (`npm install -g serverless`)
- **Docker** (for local development)
- **PostgreSQL** client tools
- **Make** (optional, for using Makefile commands)

## 🛠️ Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/tanimurahifukka/clinic-reservation-system.git
   cd clinic-reservation-system
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment:**
   ```bash
   cp .env.example .env.dev
   # Edit .env.dev with your configuration
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

## 💻 Development

### Quick Start

```bash
# Start local environment (Docker required)
make local-up

# Run database migrations
make migrate STAGE=dev

# Seed test data
make local-seed

# Start development server
npm run dev
```

The API will be available at `http://localhost:3000`

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

## 🚀 Deployment

### Quick Deploy

```bash
# Deploy to development
make deploy STAGE=dev

# Deploy to staging
make deploy STAGE=staging

# Deploy to production
make deploy STAGE=prod PROFILE=prod
```

### Full Infrastructure Setup

1. **Deploy infrastructure:**
   ```bash
   make deploy-infra STAGE=dev
   ```

2. **Run migrations:**
   ```bash
   make migrate STAGE=dev
   ```

3. **Deploy application:**
   ```bash
   make deploy STAGE=dev
   ```

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment instructions.

## 📚 API Documentation

### Health & Status
- `GET /health` - System health status with dependency checks

### Authentication
- `POST /patients/register` - Patient registration
- `POST /auth/login` - User login (via Cognito)
- `POST /auth/refresh` - Refresh access token

### Booking Management
- `POST /bookings` - Create a new booking
- `GET /bookings` - List bookings with pagination
- `GET /bookings/{id}` - Get booking details
- `PUT /bookings/{id}` - Update booking
- `POST /bookings/{id}/cancel` - Cancel booking

### Doctor Management
- `GET /doctors/{doctorId}/availability` - Get doctor availability
- `GET /doctors/search-available` - Search available doctors

### Patient Management
- `GET /patients/profile` - Get patient profile
- `GET /patients/{patientId}/profile` - Get specific patient profile (staff only)
- `PUT /patients/profile` - Update patient profile

### Payment
- `POST /payments/create-intent` - Create payment intent
- `POST /payments/webhook` - Stripe webhook endpoint

All endpoints except health check and webhooks require JWT authentication.

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

## 🔧 Scripts

```bash
# Development
npm run dev              # Start local server
npm run build           # Build TypeScript
npm run test            # Run tests
npm run lint            # Run linter
npm run typecheck       # Type checking

# Deployment
npm run deploy:dev      # Deploy to dev
npm run deploy:staging  # Deploy to staging
npm run deploy:prod     # Deploy to production

# Database
npm run migrate         # Run migrations
npm run seed            # Seed test data

# Local Development
npm run docker:up       # Start Docker containers
npm run docker:down     # Stop Docker containers
```

## 🐛 Troubleshooting

### Common Issues

1. **Lambda Timeout**: Increase memory allocation or check VPC configuration
2. **Database Connection**: Verify security groups and credentials
3. **Authentication Errors**: Check Cognito configuration and JWT tokens

### Debug Mode

```bash
# Enable debug logging
export LOG_LEVEL=debug
npm run dev
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- AWS for serverless infrastructure
- Stripe for payment processing
- LINE for messaging integration
- Agora for video consultation support

---

**Built with ❤️ by the Clinic Reservation Team**