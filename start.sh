#!/bin/bash

# ARP Monitoring Application Start Script

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"
}

info() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] INFO: $1${NC}"
}

# Check if running from correct directory
if [[ ! -f "backend/src/app.js" ]]; then
    error "Application files not found in current directory"
    error "Please run from the application root directory"
    exit 1
fi

# Check if arp-scan is available
if ! command -v arp-scan &> /dev/null; then
    error "arp-scan is not installed or not in PATH"
    error "Please install arp-scan: sudo dnf install arp-scan"
    exit 1
fi

# Check Node.js
if ! command -v node &> /dev/null; then
    error "Node.js is not installed"
    error "Please install Node.js 18+ first"
    exit 1
fi

# Check if dependencies are installed
if [[ ! -d "node_modules" ]] || [[ ! -d "backend/node_modules" ]]; then
    warn "Dependencies not found, installing..."
    npm run install:all
fi

# Initialize database if it doesn't exist
if [[ ! -f "backend/database/arp_monitoring.db" ]]; then
    warn "Database not found, initializing..."
    cd backend
    node src/database/init.js
    cd ..
fi

# Create logs directory if it doesn't exist
mkdir -p logs

log "Starting ARP Monitoring Application..."

# Set environment variables
export NODE_ENV=development
export VITE_API_URL=http://localhost:3001/api

# Get local IP for external access
LOCAL_IP=$(hostname -I | awk '{print $1}')

info "Backend API will be available at: http://0.0.0.0:3001"
info "Frontend will be available at: http://0.0.0.0:5173"
info "Health check: http://localhost:3001/api/health"

if [[ -n "$LOCAL_IP" ]]; then
    info "Access from other machines:"
    info "  Frontend: http://$LOCAL_IP:5173"
    info "  Backend: http://$LOCAL_IP:3001"
    info "  Health check: http://$LOCAL_IP:3001/api/health"
fi

echo
log "Starting both frontend and backend servers..."
log "Press Ctrl+C to stop both servers"
echo

# Start both frontend and backend
npm run dev