# CI/CD Guide for miuchi.chat

## Overview

This guide covers the comprehensive CI/CD pipeline implementation for the miuchi.chat project, including automated testing, security scanning, quality gates, and deployment strategies.

## CI/CD Architecture

### Workflow Structure

```mermaid
graph TD
    A[Code Push/PR] --> B[CI Pipeline]
    B --> C[Quality Gates]
    B --> D[Security Scan]
    B --> E[Coverage Report]
    C --> F{All Checks Pass?}
    D --> F
    E --> F
    F -->|Yes| G[Build & Push Images]
    F -->|No| H[Block Deployment]
    G --> I[Deploy to Staging]
    I --> J[Smoke Tests]
    J --> K{Production Ready?}
    K -->|Yes| L[Deploy to Production]
    K -->|No| M[Manual Review]
```

## Workflow Files

### 1. Main CI Pipeline (`.github/workflows/ci.yml`)

**Triggers:**
- Push to `main` or `develop` branches
- Pull requests to `main`

**Jobs:**
- **backend-test**: Rust compilation, testing, and linting
- **frontend-test**: TypeScript compilation, testing, and linting
- **security-scan**: Vulnerability scanning for dependencies
- **docker-build**: Build and push Docker images (main branch only)
- **deploy**: Deployment to staging environment

**Services:**
- PostgreSQL 15 for integration tests
- Meilisearch v1.5 for search functionality tests

### 2. Quality Gates (`.github/workflows/quality-gates.yml`)

**Purpose:** Enforce code quality standards before merging

**Checks:**
- **Code Quality**: Formatting, linting, unused dependencies
- **Performance**: Binary size, bundle size analysis
- **Documentation**: README, API docs, Rust docs
- **Commit Quality**: Conventional commit message format

**Thresholds:**
- Rust test coverage: ≥80%
- Frontend test coverage: ≥75%
- Binary size: <50MB
- Frontend bundle: <10MB

### 3. Coverage Reporting (`.github/workflows/coverage-report.yml`)

**Features:**
- Separate coverage for backend (Rust) and frontend (React)
- Codecov integration
- Coverage badge generation
- Detailed HTML reports
- Coverage trend tracking

**Tools:**
- **Rust**: cargo-tarpaulin
- **Frontend**: Vitest with c8

### 4. Security Scanning (`.github/workflows/security-scan.yml`)

**Comprehensive Security Checks:**
- **Rust Dependencies**: cargo-audit
- **Frontend Dependencies**: npm audit
- **Container Security**: Trivy scanner
- **Code Analysis**: CodeQL
- **Secrets Detection**: TruffleHog
- **License Compliance**: License checker

**Schedule:** Daily scans at 2 AM UTC

### 5. Deployment Pipeline (`.github/workflows/deploy.yml`)

**Multi-stage deployment:**
- **Staging**: Automatic deployment on main branch
- **Production**: Tag-based or manual deployment
- **Rollback**: Automated backup and rollback capabilities

## Environment Setup

### Required Secrets

#### Staging Environment
```bash
STAGING_HOST                 # Staging server hostname
STAGING_USER                 # SSH username
STAGING_SSH_KEY             # SSH private key
STAGING_PORT                # SSH port (default: 22)
STAGING_URL                 # Staging application URL
STAGING_POSTGRES_PASSWORD   # Database password
STAGING_GITHUB_CLIENT_ID    # OAuth client ID
STAGING_GITHUB_CLIENT_SECRET # OAuth client secret
STAGING_JWT_SECRET          # JWT signing secret
STAGING_MEILISEARCH_API_KEY # Search API key
```

#### Production Environment
```bash
PROD_HOST                   # Production server hostname
PROD_USER                   # SSH username
PROD_SSH_KEY               # SSH private key
PROD_PORT                  # SSH port (default: 22)
PROD_URL                   # Production application URL
PROD_POSTGRES_PASSWORD     # Database password
PROD_GITHUB_CLIENT_ID      # OAuth client ID
PROD_GITHUB_CLIENT_SECRET  # OAuth client secret
PROD_JWT_SECRET            # JWT signing secret
PROD_MEILISEARCH_API_KEY   # Search API key
```

#### Optional Secrets
```bash
CODECOV_TOKEN              # Code coverage reporting
```

### Environment Files

Create environment-specific configuration files:

**.env.staging**
```bash
POSTGRES_USER=miuchichat_staging
POSTGRES_PASSWORD=${STAGING_POSTGRES_PASSWORD}
POSTGRES_DB=miuchichat_staging
DATABASE_URL=postgres://miuchichat_staging:${STAGING_POSTGRES_PASSWORD}@postgres:5432/miuchichat_staging
GITHUB_CLIENT_ID=${STAGING_GITHUB_CLIENT_ID}
GITHUB_CLIENT_SECRET=${STAGING_GITHUB_CLIENT_SECRET}
JWT_SECRET=${STAGING_JWT_SECRET}
RUST_LOG=info
MEILISEARCH_API_KEY=${STAGING_MEILISEARCH_API_KEY}
```

**.env.production**
```bash
POSTGRES_USER=miuchichat_prod
POSTGRES_PASSWORD=${PROD_POSTGRES_PASSWORD}
POSTGRES_DB=miuchichat_prod
DATABASE_URL=postgres://miuchichat_prod:${PROD_POSTGRES_PASSWORD}@postgres:5432/miuchichat_prod
GITHUB_CLIENT_ID=${PROD_GITHUB_CLIENT_ID}
GITHUB_CLIENT_SECRET=${PROD_GITHUB_CLIENT_SECRET}
JWT_SECRET=${PROD_JWT_SECRET}
RUST_LOG=warn
MEILISEARCH_API_KEY=${PROD_MEILISEARCH_API_KEY}
```

## Docker Configuration

### Multi-stage Builds

**Backend Dockerfile:**
- Rust build environment with cargo caching
- Optimized release builds
- Minimal runtime image

**Frontend Dockerfile:**
- Node.js build with pnpm
- Static asset generation
- Nginx serving with security headers

### Production Deployment

**docker-compose.prod.yml** includes:
- PostgreSQL with persistent volumes
- Meilisearch with data persistence
- Backend API with health checks
- Frontend with Nginx
- Reverse proxy configuration
- Network isolation

## Manual Deployment

### Using the Deployment Script

```bash
# Deploy to staging
./scripts/deploy.sh staging

# Deploy to production
./scripts/deploy.sh production
```

**Script Features:**
- Prerequisites validation
- Docker image pulling
- Database backup (production)
- Service deployment
- Health checks
- Smoke testing
- Automatic rollback on failure

### Manual Docker Commands

```bash
# Build images locally
docker build -t miuchi-chat:local .
docker build -t miuchi-chat-frontend:local ./frontend

# Deploy with docker-compose
cp .env.staging .env
docker-compose -f docker-compose.prod.yml up -d

# Check service health
curl http://localhost:3001/health
curl http://localhost:8080/health
```

## Monitoring and Alerting

### Health Checks

All services include comprehensive health checks:
- **Backend**: `/health` and `/api/health` endpoints
- **Database**: PostgreSQL connectivity
- **Search**: Meilisearch availability
- **Frontend**: Nginx serving status

### Deployment Notifications

- **Success**: GitHub commit comments with deployment details
- **Failure**: Automatic GitHub issues creation
- **Production**: Release creation for successful deployments

### Log Aggregation

**Deployment Logs:**
- Stored in `/tmp/miuchi-chat-deploy-*.log`
- Retention: 7 days
- Includes timestamps and color-coded messages

**Application Logs:**
```bash
# View real-time logs
docker logs -f miuchichat-backend-prod
docker logs -f miuchichat-frontend-prod

# Check all services
docker-compose -f docker-compose.prod.yml logs --tail=50
```

## Quality Metrics

### Code Coverage Targets

| Component | Target | Minimum |
|-----------|--------|---------|
| Rust Backend | ≥80% | 70% |
| React Frontend | ≥75% | 65% |

### Performance Targets

| Metric | Target | Maximum |
|--------|--------|---------|
| Backend Binary | <30MB | 50MB |
| Frontend Bundle | <5MB | 10MB |
| Build Time | <10min | 15min |

### Security Standards

- **Zero** high-severity vulnerabilities
- **Automated** dependency updates
- **Daily** security scans
- **Immediate** security issue notifications

## Troubleshooting

### Common Issues

**Build Failures:**
```bash
# Check Rust compilation
cargo check
cargo clippy --all-targets --all-features

# Check frontend compilation
cd frontend && pnpm run build
```

**Test Failures:**
```bash
# Run specific test suite
cargo test --test integration_tests
cd frontend && pnpm test api.test.ts
```

**Deployment Issues:**
```bash
# Check service status
docker-compose -f docker-compose.prod.yml ps

# View logs
docker-compose -f docker-compose.prod.yml logs
```

### Recovery Procedures

**Database Recovery:**
```bash
# Restore from backup
backup_dir="/backup/miuchi-chat/$(ls -t /backup/miuchi-chat | head -1)"
docker exec -i miuchichat-postgres-prod psql -U miuchichat_prod miuchichat_prod < "$backup_dir/database.sql"
```

**Service Recovery:**
```bash
# Restart specific service
docker-compose -f docker-compose.prod.yml restart backend

# Full stack restart
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml up -d
```

## Best Practices

### Development Workflow

1. **Feature Development:**
   - Create feature branch from `develop`
   - Write tests before implementation
   - Ensure all quality gates pass
   - Submit PR to `develop`

2. **Release Process:**
   - Merge `develop` to `main`
   - Automatic staging deployment
   - Manual testing on staging
   - Tag release for production

3. **Hotfix Process:**
   - Create hotfix branch from `main`
   - Minimal changes only
   - Direct merge to `main`
   - Immediate production deployment

### Security Guidelines

- **Never commit secrets** to repository
- **Use environment variables** for configuration
- **Rotate secrets regularly** (quarterly minimum)
- **Monitor security alerts** daily
- **Update dependencies** weekly

### Performance Optimization

- **Profile before optimizing**
- **Measure build times** and bundle sizes
- **Use caching strategies** effectively
- **Monitor resource usage** in production
- **Optimize Docker layers** for faster builds

## Future Enhancements

### Planned Improvements

1. **Infrastructure as Code:**
   - Terraform for server provisioning
   - Kubernetes deployment option
   - Auto-scaling configuration

2. **Advanced Monitoring:**
   - Prometheus metrics collection
   - Grafana dashboards
   - Application performance monitoring

3. **Testing Enhancements:**
   - E2E testing with Playwright
   - Load testing with k6
   - Chaos engineering tests

4. **Deployment Features:**
   - Blue-green deployments
   - Canary releases
   - Feature flags integration

This CI/CD pipeline provides a robust foundation for maintaining code quality, security, and reliable deployments while supporting the rapid development needs of the miuchi.chat project.