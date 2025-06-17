#!/bin/bash

# ARP Monitoring Application Installation Script
# This script installs and configures the ARP monitoring application on Rocky Linux 9

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
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

# Check if running as root
#check_root() {
 #   if [[ $EUID -eq 0 ]]; then
  #      error "This script should not be run as root for security reasons."
   #     error "Please run as a regular user with sudo privileges."
    #    exit 1
    #fi
#}

# Check if running on Rocky Linux 9
check_os() {
    if [[ ! -f /etc/rocky-release ]]; then
        error "This script is designed for Rocky Linux 9."
        error "Current OS: $(cat /etc/os-release | grep PRETTY_NAME | cut -d'"' -f2)"
        exit 1
    fi

    local version=$(cat /etc/rocky-release | grep -oE '[0-9]+\.[0-9]+' | head -1)
    if [[ ! "$version" =~ ^9\. ]]; then
        error "This script requires Rocky Linux 9.x"
        error "Current version: $version"
        exit 1
    fi

    log "Running on Rocky Linux $version ✓"
}

# Check system requirements
#check_requirements() {
 #   log "Checking system requirements..."

  #  # Check available memory (minimum 1GB)
   # local mem_kb=$(grep MemTotal /proc/meminfo | awk '{print $2}')
   # local mem_gb=$((mem_kb / 1024 / 1024))

   # if [[ $mem_gb -lt 1 ]]; then
    #    error "Insufficient memory. Minimum 1GB required, found ${mem_gb}GB"
     #   exit 1
   # fi

   # # Check available disk space (minimum 2GB)
   # local disk_gb=$(df / | awk 'NR==2 {print int($4/1024/1024)}')

   # if [[ $disk_gb -lt 2 ]]; then
    #    error "Insufficient disk space. Minimum 2GB required, found ${disk_gb}GB available"
     #   exit 1
   # fi

   # log "System requirements met ✓"
   # info "Memory: ${mem_gb}GB, Disk space: ${disk_gb}GB available"
#}

# Install system dependencies
install_system_deps() {
    log "Installing system dependencies..."

    # Update system
    sudo dnf update -y

    # Install EPEL repository
    sudo dnf install -y epel-release

    # Install required packages including build tools for SQLite compilation
    sudo dnf install -y \
        curl \
        wget \
        git \
        gcc \
        gcc-c++ \
        make \
        python3 \
        python3-pip \
        python3-devel \
        sqlite \
        arp-scan \
        net-tools \
        iproute

    log "System dependencies installed ✓"
}

# Install Node.js
install_nodejs() {
    log "Installing Node.js..."

    # Check if Node.js is already installed
    if command -v node &> /dev/null; then
        local node_version=$(node --version)
        log "Node.js already installed: $node_version"

        # Check if version is 18 or higher
        local major_version=$(echo $node_version | cut -d'v' -f2 | cut -d'.' -f1)
        if [[ $major_version -ge 18 ]]; then
            log "Node.js version is compatible ✓"
            return
        else
            warn "Node.js version is too old, installing newer version..."
        fi
    fi

    # Install Node.js 20.x
    curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
    sudo dnf install -y nodejs

    # Verify installation
    local node_version=$(node --version)
    local npm_version=$(npm --version)

    log "Node.js installed: $node_version"
    log "npm installed: $npm_version"
}

# Verify arp-scan installation and permissions
verify_arpscan() {
    log "Verifying arp-scan installation..."

    # Define the path explicitly (since which is not available)
    local arpscan_path="/usr/sbin/arp-scan"

    if [[ ! -x "$arpscan_path" ]]; then
        error "arp-scan is not installed or not executable at $arpscan_path"
        exit 1
    fi

    # Check arp-scan version
    local version=$("$arpscan_path" --version 2>&1 | head -1)
    log "arp-scan version: $version"

    # Check if arp-scan has proper capabilities or is setuid
    if [[ ! -u "$arpscan_path" ]] && ! getcap "$arpscan_path" | grep -q cap_net_raw; then
        warn "arp-scan may not have proper permissions for raw socket access"
        info "Setting capabilities for arp-scan..."
        sudo setcap cap_net_raw+ep "$arpscan_path"
    fi

    log "arp-scan verification complete ✓"
}
# Create application user and directories
setup_app_structure() {
    log "Setting up application structure..."

    # Create application directory
    local app_dir="/opt/arp-monitoring"

    if [[ -d "$app_dir" ]]; then
        warn "Application directory already exists: $app_dir"
        read -p "Do you want to continue and overwrite? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            error "Installation cancelled by user"
            exit 1
        fi
        sudo rm -rf "$app_dir"
    fi

    sudo mkdir -p "$app_dir"
    sudo chown $USER:$USER "$app_dir"

    # Create logs directory
    sudo mkdir -p /var/log/arp-monitoring
    sudo chown $USER:$USER /var/log/arp-monitoring

    # Create database directory
    sudo mkdir -p /var/lib/arp-monitoring
    sudo chown $USER:$USER /var/lib/arp-monitoring

    log "Application structure created ✓"
    info "App directory: $app_dir"
    info "Logs directory: /var/log/arp-monitoring"
    info "Database directory: /var/lib/arp-monitoring"
}

# Copy application files
copy_app_files() {
    log "Copying application files..."

    local app_dir="/opt/arp-monitoring"
    local current_dir=$(pwd)

    # Copy all files except node_modules and .git
    rsync -av --exclude='node_modules' --exclude='.git' --exclude='*.log' "$current_dir/" "$app_dir/"

    log "Application files copied ✓"
}

# Install application dependencies
install_app_deps() {
    log "Installing application dependencies..."

    local app_dir="/opt/arp-monitoring"

    # Install frontend dependencies
    cd "$app_dir"
    npm install

    # Install backend dependencies
    cd "$app_dir/backend"

    # Force rebuild of better-sqlite3 from source
    npm install --build-from-source

    log "Application dependencies installed ✓"
}

# Initialize database
init_database() {
    log "Initializing database..."

    local app_dir="/opt/arp-monitoring"

    cd "$app_dir/backend"
    node src/database/init.js

    log "Database initialized ✓"
}

# Configure firewall
#configure_firewall() {
 #   log "Configuring firewall..."

    # Start and enable firewalld
  #  sudo systemctl start firewalld
   # sudo systemctl enable firewalld

    # Open ports for the application
   # sudo firewall-cmd --permanent --add-port=3001/tcp  # Backend API
 #   sudo firewall-cmd --permanent --add-port=5173/tcp  # Frontend dev server

    # Reload firewall
  #  sudo firewall-cmd --reload

   # log "Firewall configured ✓"
   # info "Opened ports: 3001 (API), 5173 (Frontend)"
#}

# Create systemd service
create_systemd_service() {
    log "Creating systemd service..."

    local app_dir="/opt/arp-monitoring"
    local service_file="/etc/systemd/system/arp-monitoring.service"

    sudo tee "$service_file" > /dev/null <<EOF
[Unit]
Description=ARP Monitoring Application
After=network.target
Wants=network.target

[Service]
Type=simple
User=$USER
Group=$USER
WorkingDirectory=$app_dir/backend
ExecStart=/usr/bin/node src/app.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=3001

# Logging
StandardOutput=append:/var/log/arp-monitoring/app.log
StandardError=append:/var/log/arp-monitoring/error.log

# Security settings
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/arp-monitoring /var/log/arp-monitoring $app_dir

[Install]
WantedBy=multi-user.target
EOF

    # Reload systemd and enable service
    sudo systemctl daemon-reload
    sudo systemctl enable arp-monitoring

    log "Systemd service created ✓"
    info "Service: arp-monitoring"
}

# Create start script
create_start_script() {
    log "Creating start script..."

    local app_dir="/opt/arp-monitoring"
    local start_script="$app_dir/start.sh"

    tee "$start_script" > /dev/null <<'EOF'
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

APP_DIR="/opt/arp-monitoring"
BACKEND_DIR="$APP_DIR/backend"

# Check if running from correct directory
if [[ ! -f "$BACKEND_DIR/src/app.js" ]]; then
    error "Application files not found in $APP_DIR"
    error "Please run the install script first"
    exit 1
fi

# Check if arp-scan is available
if ! command -v arp-scan &> /dev/null; then
    error "arp-scan is not installed or not in PATH"
    exit 1
fi

# Check database
if [[ ! -f "$BACKEND_DIR/database/arp_monitoring.db" ]]; then
    warn "Database not found, initializing..."
    cd "$BACKEND_DIR"
    node src/database/init.js
fi

# Start the application
log "Starting ARP Monitoring Application..."

# Check if systemd service is available
if systemctl is-enabled arp-monitoring &> /dev/null; then
    log "Starting via systemd service..."
    sudo systemctl start arp-monitoring

    # Wait a moment and check status
    sleep 2
    if systemctl is-active arp-monitoring &> /dev/null; then
        log "Backend service started successfully ✓"
        info "Backend API: http://0.0.0.0:3001"
        info "Health check: http://0.0.0.0:3001/api/health"

        # Get local IP for external access
        LOCAL_IP=$(hostname -I | awk '{print $1}')
        if [[ -n "$LOCAL_IP" ]]; then
            info "External access:"
            info "  Backend: http://$LOCAL_IP:3001"
            info "  Frontend: http://$LOCAL_IP:5173"
        fi

        # Start frontend in development mode
        log "Starting frontend development server..."
        cd "$APP_DIR"

        info "Frontend will be available at: http://0.0.0.0:5173"

        npm run dev:frontend
    else
        error "Failed to start backend service"
        sudo systemctl status arp-monitoring
        exit 1
    fi
else
    # Fallback: start manually
    log "Starting manually..."
    cd "$APP_DIR"

    # Set environment variables
    export NODE_ENV=production
    export PORT=3001

    # Start both frontend and backend
    npm run dev
fi
EOF

    chmod +x "$start_script"

    log "Start script created ✓"
    info "Start script: $start_script"
}

# Create troubleshooting guide
create_troubleshooting_guide() {
    log "Creating troubleshooting guide..."

    local app_dir="/opt/arp-monitoring"
    local guide_file="$app_dir/TROUBLESHOOTING.md"

    tee "$guide_file" > /dev/null <<'EOF'
# ARP Monitoring - Troubleshooting Guide

## Common Issues and Solutions

### 1. arp-scan Permission Denied

**Problem**: `arp-scan: pcap_open_live: socket: Operation not permitted`

**Solutions**:
```bash
# Option 1: Set capabilities (recommended)
sudo setcap cap_net_raw+ep $(which arp-scan)

# Option 2: Run as root (not recommended)
sudo ./start.sh

# Option 3: Add user to specific groups
sudo usermod -a -G netdev $USER
```

### 2. Port Already in Use

**Problem**: `Error: listen EADDRINUSE: address already in use :::3001`

**Solutions**:
```bash
# Find process using the port
sudo netstat -tlnp | grep :3001
sudo lsof -i :3001

# Kill the process
sudo kill -9 <PID>

# Or use a different port
export PORT=3002
```

### 3. Database Issues

**Problem**: Database connection errors or corruption

**Solutions**:
```bash
# Reinitialize database
cd /opt/arp-monitoring/backend
rm -f database/arp_monitoring.db
node src/database/init.js

# Check database permissions
ls -la database/
sudo chown $USER:$USER database/arp_monitoring.db
```

### 4. Network Interface Not Found

**Problem**: Interface not available or not configured

**Solutions**:
```bash
# List available interfaces
ip link show
cat /proc/net/dev

# Check interface status
ip addr show <interface>

# Bring interface up
sudo ip link set <interface> up
```

### 5. Firewall Blocking Connections

**Problem**: Cannot access application from other machines

**Solutions**:
```bash
# Check firewall status
sudo firewall-cmd --list-all

# Open required ports
sudo firewall-cmd --permanent --add-port=3001/tcp
sudo firewall-cmd --permanent --add-port=5173/tcp
sudo firewall-cmd --reload

# Temporarily disable firewall (testing only)
sudo systemctl stop firewalld
```

### 6. Service Won't Start

**Problem**: Systemd service fails to start

**Solutions**:
```bash
# Check service status
sudo systemctl status arp-monitoring

# View logs
sudo journalctl -u arp-monitoring -f

# Check application logs
tail -f /var/log/arp-monitoring/app.log
tail -f /var/log/arp-monitoring/error.log

# Restart service
sudo systemctl restart arp-monitoring
```

### 7. High CPU/Memory Usage

**Problem**: Application consuming too many resources

**Solutions**:
```bash
# Monitor resource usage
top -p $(pgrep -f "node.*app.js")
htop

# Check for memory leaks
ps aux | grep node

# Restart application
sudo systemctl restart arp-monitoring
```

### 8. Network Scanning Issues

**Problem**: No devices found or incomplete scans

**Solutions**:
```bash
# Test arp-scan manually
sudo arp-scan -l
sudo arp-scan -I eth0 192.168.1.0/24

# Check network connectivity
ping -c 3 <gateway_ip>

# Verify subnet configuration
ip route show
```

### 9. External Access Issues

**Problem**: Cannot access from other machines

**Solutions**:
```bash
# Check if server is binding to all interfaces
netstat -tlnp | grep :3001
# Should show 0.0.0.0:3001, not 127.0.0.1:3001

# Test connectivity from external machine
curl -v http://SERVER_IP:3001/api/health

# Check firewall rules
sudo firewall-cmd --list-ports
sudo iptables -L

# Verify CORS configuration in backend
grep -n "origin" /opt/arp-monitoring/backend/src/app.js
```

### 10. SQLite Compilation Issues

**Problem**: better-sqlite3 fails to install

**Solutions**:
```bash
# Install build dependencies
sudo dnf install -y gcc gcc-c++ make python3-devel

# Rebuild from source
cd /opt/arp-monitoring/backend
npm rebuild better-sqlite3 --build-from-source

# Or reinstall completely
rm -rf node_modules package-lock.json
npm install --build-from-source
```

## Log Files

- Application logs: `/var/log/arp-monitoring/app.log`
- Error logs: `/var/log/arp-monitoring/error.log`
- System logs: `sudo journalctl -u arp-monitoring`

## Configuration Files

- Main config: `/opt/arp-monitoring/backend/src/app.js`
- Database: `/opt/arp-monitoring/backend/database/arp_monitoring.db`
- Service file: `/etc/systemd/system/arp-monitoring.service`

## Useful Commands

```bash
# Check application status
sudo systemctl status arp-monitoring

# View real-time logs
sudo journalctl -u arp-monitoring -f

# Test API endpoint
curl http://localhost:3001/api/health

# Test external access
curl http://$(hostname -I | awk '{print $1}'):3001/api/health

# Check network interfaces
ip addr show

# Test arp-scan
sudo arp-scan --help
sudo arp-scan -l

# Monitor network traffic
sudo tcpdump -i any arp

# Check open ports
sudo netstat -tlnp | grep -E ':(3001|5173)'

# Check firewall
sudo firewall-cmd --list-all
```

## Getting Help

If you continue to experience issues:

1. Check the logs for specific error messages
2. Verify all dependencies are installed correctly
3. Ensure proper network configuration
4. Test arp-scan functionality manually
5. Check system resources (CPU, memory, disk)
6. Verify external access with curl commands

For additional support, please check the README.md file or create an issue in the project repository.
EOF

    log "Troubleshooting guide created ✓"
    info "Guide location: $guide_file"
}

# Create README
create_readme() {
    log "Creating README..."

    local app_dir="/opt/arp-monitoring"
    local readme_file="$app_dir/README.md"

    tee "$readme_file" > /dev/null <<'EOF'
# ARP Monitoring Application

A comprehensive network monitoring solution using ARP scanning to detect and track devices on your network.

## Features

- **Job-based Monitoring**: Create multiple monitoring jobs with individual configurations
- **Real-time Scanning**: Automated ARP scanning using arp-scan utility
- **Device Tracking**: Track known devices and detect new/unauthorized devices
- **Intelligent Notifications**: Configurable alerts for new devices, unauthorized access, and IP changes
- **Whitelist Management**: Maintain authorized device lists per job
- **Retention Policies**: Flexible data retention options
- **Modern Web Interface**: Dark theme with neon accents and responsive design
- **Scheduling System**: Manual or automated job execution with cron-like scheduling

## Architecture

- **Frontend**: React with TypeScript, Tailwind CSS, modern dark UI
- **Backend**: Node.js with Express, SQLite database
- **Scanner**: arp-scan integration with child process management
- **Scheduler**: Built-in job scheduling system
- **Notifications**: Real-time notification system

## Installation

Run the installation script:

```bash
chmod +x install.sh
./install.sh
```

The installer will:
- Check system requirements
- Install dependencies (Node.js, arp-scan, etc.)
- Set up application structure
- Configure firewall
- Create systemd service
- Initialize database

## Starting the Application

Use the provided start script:

```bash
/opt/arp-monitoring/start.sh
```

Or use systemd:

```bash
sudo systemctl start arp-monitoring
```

## Access

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3001
- **Health Check**: http://localhost:3001/api/health

To access from other machines, use your server's IP address:
- Frontend: http://YOUR_SERVER_IP:5173
- Backend: http://YOUR_SERVER_IP:3001

## External Access Configuration

The application is configured to accept connections from external machines. The backend binds to `0.0.0.0:3001` and includes CORS configuration for common private network ranges.

### Firewall Configuration

The installer automatically opens the required ports:
```bash
sudo firewall-cmd --permanent --add-port=3001/tcp  # Backend API
sudo firewall-cmd --permanent --add-port=5173/tcp  # Frontend
sudo firewall-cmd --reload
```

### Testing External Access

From another machine on the network:
```bash
# Test backend API
curl http://SERVER_IP:3001/api/health

# Access frontend
http://SERVER_IP:5173
```

## Usage

### Creating a Job

1. Navigate to the Jobs section
2. Click "Create Job"
3. Configure:
   - Job name and network interface
   - Subnet to scan (CIDR notation)
   - Execution time and schedule
   - Notification preferences
   - MAC address whitelist
   - Retention policy

### Managing Jobs

- **Run manually**: Click "Run Now" on any job
- **View details**: Access job-specific information, run history, and known devices
- **Edit settings**: Modify job configuration as needed
- **Delete jobs**: Remove jobs and all associated data

### Monitoring

- **Dashboard**: Overview of all jobs and recent activity
- **Notifications**: Real-time alerts for network changes
- **Device tracking**: View all discovered devices per job
- **Run history**: Detailed logs of all scan executions

## Configuration

### Environment Variables

- `NODE_ENV`: Application environment (production/development)
- `PORT`: Backend server port (default: 3001)
- `FRONTEND_URL`: Frontend URL for CORS (default: http://localhost:5173)

### Database

SQLite database located at: `/opt/arp-monitoring/backend/database/arp_monitoring.db`

### Logs

- Application: `/var/log/arp-monitoring/app.log`
- Errors: `/var/log/arp-monitoring/error.log`
- System: `sudo journalctl -u arp-monitoring`

## API Endpoints

### Jobs
- `GET /api/jobs` - List all jobs
- `POST /api/jobs` - Create new job
- `GET /api/jobs/:id` - Get job details
- `PUT /api/jobs/:id` - Update job
- `DELETE /api/jobs/:id` - Delete job
- `POST /api/jobs/:id/run` - Run job manually

### Notifications
- `GET /api/notifications` - List notifications
- `PATCH /api/notifications/:id/read` - Mark as read

### Network
- `GET /api/network/interfaces` - List network interfaces
- `GET /api/network/system` - System information

## Security Considerations

- arp-scan requires raw socket access (CAP_NET_RAW capability)
- Application runs as non-root user with minimal privileges
- Firewall configured to allow only necessary ports
- Input validation on all API endpoints
- SQL injection protection with prepared statements

## Troubleshooting

See `TROUBLESHOOTING.md` for common issues and solutions.

### Quick Checks

```bash
# Check service status
sudo systemctl status arp-monitoring

# View logs
tail -f /var/log/arp-monitoring/app.log

# Test arp-scan
sudo arp-scan -l

# Check network interfaces
ip addr show

# Test external access
curl http://$(hostname -I | awk '{print $1}'):3001/api/health
```

## System Requirements

- Rocky Linux 9.x
- Node.js 18+
- arp-scan utility
- 1GB+ RAM
- 2GB+ disk space
- Network interface with appropriate permissions

## Development

### Frontend Development
```bash
cd /opt/arp-monitoring
npm run dev:frontend
```

### Backend Development
```bash
cd /opt/arp-monitoring/backend
npm run dev
```

### Database Management
```bash
cd /opt/arp-monitoring/backend
node src/database/init.js
```

## License

This project is provided as-is for testing and educational purposes.

## Support

For issues and troubleshooting:
1. Check the logs for error messages
2. Review the troubleshooting guide
3. Verify system requirements
4. Test arp-scan functionality manually

---

**Note**: This application is designed for network monitoring and security purposes. Ensure you have proper authorization before scanning networks you don't own or manage.
EOF

    log "README created ✓"
    info "README location: $readme_file"
}

# Final verification
final_verification() {
    log "Performing final verification..."

    local app_dir="/opt/arp-monitoring"

    # Check if all required files exist
    local required_files=(
        "$app_dir/package.json"
        "$app_dir/backend/package.json"
        "$app_dir/backend/src/app.js"
        "$app_dir/start.sh"
        "/etc/systemd/system/arp-monitoring.service"
    )

    for file in "${required_files[@]}"; do
        if [[ ! -f "$file" ]]; then
            error "Required file missing: $file"
            exit 1
        fi
    done

    # Check if arp-scan works
    if ! arp-scan --help &> /dev/null; then
        error "arp-scan is not working properly"
        exit 1
    fi

    # Check if Node.js works
    if ! node --version &> /dev/null; then
        error "Node.js is not working properly"
        exit 1
    fi

    # Check database
    if [[ ! -f "$app_dir/backend/database/arp_monitoring.db" ]]; then
        warn "Database file not found, will be created on first run"
    fi

    log "Final verification complete ✓"
}

# Print installation summary
print_summary() {
    log "Installation completed successfully! 🎉"
    echo
    info "=== ARP Monitoring Application ==="
    info "Installation directory: /opt/arp-monitoring"
    info "Logs directory: /var/log/arp-monitoring"
    info "Database directory: /var/lib/arp-monitoring"
    echo
    info "=== How to start ==="
    info "1. Run: /opt/arp-monitoring/start.sh"
    info "2. Or use systemd: sudo systemctl start arp-monitoring"
    echo
    info "=== Access URLs ==="
    info "Frontend: http://localhost:5173"
    info "Backend API: http://localhost:3001"
    info "Health check: http://localhost:3001/api/health"
    echo
    info "From other machines:"
    info "Frontend: http://$(hostname -I | awk '{print $1}'):5173"
    info "Backend: http://$(hostname -I | awk '{print $1}'):3001"
    echo
    info "=== Test External Access ==="
    info "curl http://$(hostname -I | awk '{print $1}'):3001/api/health"
    echo
    info "=== Useful commands ==="
    info "Start: /opt/arp-monitoring/start.sh"
    info "Status: sudo systemctl status arp-monitoring"
    info "Logs: tail -f /var/log/arp-monitoring/app.log"
    info "Stop: sudo systemctl stop arp-monitoring"
    echo
    info "=== Documentation ==="
    info "README: /opt/arp-monitoring/README.md"
    info "Troubleshooting: /opt/arp-monitoring/TROUBLESHOOTING.md"
    echo
    warn "Note: Make sure to configure your network interfaces and subnets correctly"
    warn "before creating monitoring jobs."
    echo
    log "Happy monitoring! 🔍"
}

# Main installation function
main() {
    log "Starting ARP Monitoring Application installation..."
    log "Target OS: Rocky Linux 9"
    echo


    check_os
#    check_requirements
    install_system_deps
    install_nodejs
    verify_arpscan
    setup_app_structure
    copy_app_files
    install_app_deps
    init_database
 #   configure_firewall
    create_systemd_service
    create_start_script
    create_troubleshooting_guide
    create_readme
    final_verification
    print_summary
}

# Run main function
main "$@"