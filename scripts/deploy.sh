#!/bin/bash

# Deployment script for miuchi.chat
# Usage: ./scripts/deploy.sh [staging|production]

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ENVIRONMENT="${1:-staging}"
LOG_FILE="/tmp/miuchi-chat-deploy-$(date +%Y%m%d_%H%M%S).log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "$LOG_FILE"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$LOG_FILE"
}

# Validation functions
validate_environment() {
    if [[ "$ENVIRONMENT" != "staging" && "$ENVIRONMENT" != "production" ]]; then
        error "Invalid environment: $ENVIRONMENT. Must be 'staging' or 'production'"
        exit 1
    fi
}

check_prerequisites() {
    log "Checking prerequisites..."
    
    # Check if Docker is installed and running
    if ! command -v docker &> /dev/null; then
        error "Docker is not installed"
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        error "Docker daemon is not running"
        exit 1
    fi
    
    # Check if docker-compose is available
    if ! command -v docker-compose &> /dev/null; then
        error "docker-compose is not installed"
        exit 1
    fi
    
    # Check if required environment files exist
    if [[ ! -f "$PROJECT_DIR/.env.$ENVIRONMENT" ]]; then
        error "Environment file .env.$ENVIRONMENT not found"
        exit 1
    fi
    
    success "Prerequisites check passed"
}

check_docker_images() {
    log "Checking Docker images..."
    
    local backend_image="ghcr.io/miuchi/miuchi.chat:latest"
    local frontend_image="ghcr.io/miuchi/miuchi.chat-frontend:latest"
    
    # Try to pull latest images
    if ! docker pull "$backend_image"; then
        warning "Failed to pull backend image: $backend_image"
        return 1
    fi
    
    if ! docker pull "$frontend_image"; then
        warning "Failed to pull frontend image: $frontend_image"
        return 1
    fi
    
    success "Docker images are ready"
}

backup_database() {
    if [[ "$ENVIRONMENT" != "production" ]]; then
        log "Skipping database backup for $ENVIRONMENT environment"
        return 0
    fi
    
    log "Creating database backup..."
    
    local backup_dir="/backup/miuchi-chat/$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$backup_dir"
    
    # Backup PostgreSQL
    if docker exec miuchichat-postgres-prod pg_dump -U miuchichat_prod miuchichat_prod > "$backup_dir/database.sql"; then
        success "Database backup created: $backup_dir/database.sql"
    else
        error "Database backup failed"
        return 1
    fi
    
    # Backup Meilisearch data
    if docker exec miuchichat-meilisearch-prod tar czf - /meili_data > "$backup_dir/meilisearch.tar.gz"; then
        success "Meilisearch backup created: $backup_dir/meilisearch.tar.gz"
    else
        warning "Meilisearch backup failed"
    fi
}

deploy_services() {
    log "Deploying services for $ENVIRONMENT environment..."
    
    cd "$PROJECT_DIR"
    
    # Copy environment-specific configuration
    cp ".env.$ENVIRONMENT" ".env"
    
    # Deploy using docker-compose
    if docker-compose -f docker-compose.prod.yml up -d --remove-orphans; then
        success "Services deployed successfully"
    else
        error "Service deployment failed"
        return 1
    fi
}

wait_for_services() {
    log "Waiting for services to be ready..."
    
    local max_attempts=30
    local attempt=1
    
    while [[ $attempt -le $max_attempts ]]; do
        log "Health check attempt $attempt/$max_attempts..."
        
        # Check backend health
        if curl -f -s http://localhost:3001/health > /dev/null; then
            success "Backend service is healthy"
            break
        fi
        
        if [[ $attempt -eq $max_attempts ]]; then
            error "Services failed to become healthy after $max_attempts attempts"
            log "Service logs:"
            docker-compose -f docker-compose.prod.yml logs --tail=50
            return 1
        fi
        
        sleep 10
        ((attempt++))
    done
}

run_smoke_tests() {
    log "Running smoke tests..."
    
    local base_url="http://localhost:3001"
    
    # Test health endpoints
    if ! curl -f -s "$base_url/health" > /dev/null; then
        error "Health endpoint test failed"
        return 1
    fi
    
    if ! curl -f -s "$base_url/api/health" > /dev/null; then
        error "API health endpoint test failed"
        return 1
    fi
    
    # Test authentication endpoint
    local auth_status
    auth_status=$(curl -s -o /dev/null -w "%{http_code}" "$base_url/api/auth/login-url")
    if [[ "$auth_status" != "200" ]]; then
        error "Authentication endpoint test failed with status: $auth_status"
        return 1
    fi
    
    success "Smoke tests passed"
}

rollback() {
    error "Rolling back deployment..."
    
    cd "$PROJECT_DIR"
    
    # Stop current services
    docker-compose -f docker-compose.prod.yml down
    
    # Restore from backup if available
    if [[ "$ENVIRONMENT" == "production" ]]; then
        local latest_backup
        latest_backup=$(find /backup/miuchi-chat -type d -name "*" | sort | tail -1)
        
        if [[ -n "$latest_backup" && -f "$latest_backup/database.sql" ]]; then
            log "Restoring database from backup: $latest_backup"
            # Restore database logic would go here
            warning "Database restore functionality needs to be implemented"
        fi
    fi
    
    error "Rollback completed - manual intervention may be required"
}

cleanup() {
    log "Cleaning up..."
    
    # Remove old Docker images (keep last 3 versions)
    docker image prune -f
    
    # Clean up old log files (keep last 7 days)
    find /tmp -name "miuchi-chat-deploy-*.log" -type f -mtime +7 -delete 2>/dev/null || true
    
    success "Cleanup completed"
}

main() {
    log "Starting deployment to $ENVIRONMENT environment"
    log "Log file: $LOG_FILE"
    
    # Trap errors and run rollback
    trap rollback ERR
    
    validate_environment
    check_prerequisites
    
    if ! check_docker_images; then
        warning "Failed to pull latest images, continuing with local images"
    fi
    
    backup_database
    deploy_services
    wait_for_services
    run_smoke_tests
    cleanup
    
    success "Deployment to $ENVIRONMENT completed successfully!"
    log "Log file saved: $LOG_FILE"
    
    # Remove trap
    trap - ERR
}

# Help function
show_help() {
    cat << EOF
Deployment script for miuchi.chat

Usage: $0 [ENVIRONMENT]

ENVIRONMENT:
    staging     Deploy to staging environment (default)
    production  Deploy to production environment

Options:
    -h, --help  Show this help message

Examples:
    $0 staging
    $0 production

Prerequisites:
    - Docker and docker-compose installed
    - Environment files (.env.staging, .env.production) configured
    - Appropriate access to Docker registry

EOF
}

# Parse command line arguments
case "${1:-}" in
    -h|--help)
        show_help
        exit 0
        ;;
    *)
        main "$@"
        ;;
esac