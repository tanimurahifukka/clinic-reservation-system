# Makefile for Clinic Reservation System

.PHONY: help install build test deploy clean

STAGE ?= dev
REGION ?= ap-northeast-1
PROFILE ?= default

help: ## Show this help message
	@echo 'Usage: make [target] [STAGE=dev|staging|prod]'
	@echo ''
	@echo 'Targets:'
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-20s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: ## Install dependencies
	npm install

build: ## Build TypeScript
	npm run build

test: ## Run tests
	npm run test

lint: ## Run linter
	npm run lint

typecheck: ## Run TypeScript type checking
	npm run typecheck

validate: lint typecheck test ## Run all validations

# Infrastructure deployment
deploy-infra: ## Deploy infrastructure (VPC, Database, etc.)
	./scripts/deploy-infrastructure.sh $(STAGE) $(REGION) $(PROFILE)

migrate: ## Run database migrations
	./scripts/migrate-database.sh $(STAGE) $(REGION) $(PROFILE)

# Application deployment
deploy: validate ## Deploy the application
	./scripts/deploy.sh $(STAGE) $(REGION) $(PROFILE)

deploy-fast: ## Deploy without validation (use with caution)
	npx serverless deploy --stage $(STAGE) --region $(REGION) --aws-profile $(PROFILE)

# Local development
local-up: ## Start local development environment
	docker-compose up -d
	npm run setup:local

local-down: ## Stop local development environment
	docker-compose down

local-logs: ## View local development logs
	docker-compose logs -f

local-clean: ## Clean local development data
	npm run clean:local

local-seed: ## Seed local database with test data
	npm run seed

# Production operations
logs: ## View CloudWatch logs
	npx serverless logs -f health -t --stage $(STAGE) --region $(REGION) --aws-profile $(PROFILE)

info: ## Show service information
	npx serverless info --stage $(STAGE) --region $(REGION) --aws-profile $(PROFILE)

remove: ## Remove the service (BE CAREFUL!)
	@echo "⚠️  WARNING: This will delete all resources!"
	@echo "Press Ctrl+C to cancel, or Enter to continue..."
	@read confirm
	npx serverless remove --stage $(STAGE) --region $(REGION) --aws-profile $(PROFILE)

# Utilities
check-deployment: ## Check deployment readiness
	node scripts/check-deployment.js

test-api: ## Test API endpoints
	API_URL=$$(npx serverless info --stage $(STAGE) --region $(REGION) --aws-profile $(PROFILE) | grep "endpoint:" | awk '{print $$2}') \
	node scripts/test-api.js

clean: ## Clean build artifacts
	rm -rf dist/
	rm -rf node_modules/
	rm -rf .serverless/

# CI/CD helpers
ci-setup: ## Setup for CI environment
	npm ci
	npm run build

ci-test: ## Run tests in CI environment
	npm run test:coverage

# Docker commands for production debugging
ssh-bastion: ## SSH into bastion host (if available)
	@echo "Connecting to bastion host..."
	aws ssm start-session --target $$(aws ec2 describe-instances --filters "Name=tag:Name,Values=clinic-reservation-$(STAGE)-bastion" --query "Reservations[0].Instances[0].InstanceId" --output text --region $(REGION) --profile $(PROFILE)) --region $(REGION) --profile $(PROFILE)

# Secrets management
create-secret: ## Create a secret in AWS Secrets Manager
	@read -p "Secret name: " secret_name; \
	read -p "Secret value: " secret_value; \
	aws secretsmanager create-secret \
		--name "$(STAGE)/clinic-reservation/$$secret_name" \
		--secret-string "$$secret_value" \
		--region $(REGION) \
		--profile $(PROFILE)

update-secret: ## Update a secret in AWS Secrets Manager
	@read -p "Secret name: " secret_name; \
	read -p "New secret value: " secret_value; \
	aws secretsmanager put-secret-value \
		--secret-id "$(STAGE)/clinic-reservation/$$secret_name" \
		--secret-string "$$secret_value" \
		--region $(REGION) \
		--profile $(PROFILE)