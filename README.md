# ARP Monitoring Application

A comprehensive network monitoring solution using ARP scanning to detect and track devices on your network in real-time.

## 🚀 Features

### Core Functionality
- **Job-based Monitoring**: Create multiple monitoring jobs with individual configurations
- **Real-time ARP Scanning**: Automated network scanning using arp-scan utility
- **Device Discovery & Tracking**: Intelligent device detection and status monitoring
- **Smart Notifications**: Configurable alerts for new devices, unauthorized access, and IP changes
- **Whitelist Management**: Maintain authorized device lists per monitoring job
- **Flexible Retention Policies**: Customizable data retention options

### User Interface
- **Modern Dark Theme**: Professional interface with neon accent colors
- **Responsive Design**: Optimized for desktop, tablet, and mobile devices
- **Real-time Dashboard**: Live overview of network activity and job status
- **Intuitive Navigation**: Clean, organized interface with contextual tooltips

### Technical Features
- **Scheduling System**: Manual or automated job execution with cron-like scheduling
- **SQLite Database**: Lightweight, embedded database with full ACID compliance
- **RESTful API**: Complete REST API for integration and automation
- **Comprehensive Logging**: Detailed logging with multiple verbosity levels
- **Security-focused**: Non-root execution with minimal required privileges

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │    Backend      │    │   arp-scan      │
│   (React)       │◄──►│   (Node.js)     │◄──►│   (System)      │
│   Port: 5173    │    │   Port: 3001    │    │   Raw Sockets   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Web Browser   │    │   SQLite DB     │    │   Network       │
│   (Any Device)  │    │   (Local)       │    │   Interfaces    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Technology Stack
- **Frontend**: React 18, TypeScript, Tailwind CSS, React Router
- **Backend**: Node.js, Express, SQLite3, Winston (logging)
- **Scanner**: arp-scan with child process management
- **Scheduler**: Node-cron for automated job execution
- **Database**: SQLite with WAL mode for concurrent access

## 📋 System Requirements

### Minimum Requirements
- **OS**: Rocky Linux 9.x (primary), CentOS 8+, RHEL 8+, or compatible
- **CPU**: 1 core, 1 GHz
- **RAM**: 1 GB
- **Storage**: 2 GB available space
- **Network**: At least one configured network interface

### Recommended Requirements
- **CPU**: 2+ cores, 2+ GHz
- **RAM**: 2+ GB
- **Storage**: 5+ GB available space
- **Network**: Multiple interfaces for comprehensive monitoring

### Dependencies
- Node.js 18+ (automatically installed)
- arp-scan utility (automatically installed)
- SQLite3 (automatically installed)
- Standard Linux networking tools (ip, netstat)

## 🔧 Installation

### Quick Install (Recommended)

1. **Download and prepare the installation script:**
   ```bash
   chmod +x install.sh
   ```

2. **Run the installer:**
   ```bash
   ./install.sh
   ```

The installer will automatically:
- ✅ Verify system requirements and compatibility
- ✅ Install all required dependencies (Node.js, arp-scan, etc.)
- ✅ Set up application directory structure
- ✅ Configure firewall rules for network access
- ✅ Create systemd service for automatic startup
- ✅ Initialize SQLite database with proper schema
- ✅ Set up logging directories and permissions
- ✅ Create start/stop scripts with error handling

### Manual Installation

If you prefer manual installation or need to customize the setup:

1. **Install system dependencies:**
   ```bash
   sudo dnf update -y
   sudo dnf install -y epel-release
   sudo dnf install -y nodejs npm arp-scan sqlite git
   ```

2. **Set up application:**
   ```bash
   # Create application directory
   sudo mkdir -p /opt/arp-monitoring
   sudo chown $USER:$USER /opt/arp-monitoring
   
   # Copy application files
   cp -r . /opt/arp-monitoring/
   cd /opt/arp-monitoring
   
   # Install dependencies
   npm run install:all
   
   # Initialize database
   cd backend && node src/database/init.js
   ```

3. **Configure arp-scan permissions:**
   ```bash
   sudo setcap cap_net_raw+ep $(which arp-scan)
   ```

## 🚀 Starting the Application

### Using the Start Script (Recommended)
```bash
/opt/arp-monitoring/start.sh
```

### Using Systemd Service
```bash
# Start the service
sudo systemctl start arp-monitoring

# Enable auto-start on boot
sudo systemctl enable arp-monitoring

# Check status
sudo systemctl status arp-monitoring
```

### Manual Start (Development)
```bash
cd /opt/arp-monitoring
npm run dev
```

## 🌐 Access Points

Once started, the application will be available at:

### Local Access
- **Frontend Interface**: http://localhost:5173
- **Backend API**: http://localhost:3001
- **Health Check**: http://localhost:3001/api/health

### Remote Access
Replace `YOUR_SERVER_IP` with your server's IP address:
- **Frontend**: http://YOUR_SERVER_IP:5173
- **Backend API**: http://YOUR_SERVER_IP:3001

### Firewall Configuration
The installer automatically configures firewall rules. If you need to manually configure:
```bash
sudo firewall-cmd --permanent --add-port=3001/tcp  # Backend API
sudo firewall-cmd --permanent --add-port=5173/tcp  # Frontend
sudo firewall-cmd --reload
```

## 📖 Usage Guide

### 1. Creating Your First Monitoring Job

1. **Navigate to Jobs**: Click on "Jobs" in the sidebar
2. **Create New Job**: Click "Create Job" button
3. **Configure Basic Settings**:
   - **Job Name**: Descriptive name (e.g., "Office Network Monitor")
   - **Network Interface**: Select from detected interfaces (e.g., eth0, ens33)
   - **Subnet**: CIDR notation (e.g., 192.168.1.0/24)
   - **Execution Time**: Scan duration in seconds (default: 300)

4. **Set Schedule**:
   - **Manual**: Run only when triggered manually
   - **Hourly**: Every hour
   - **6 Hours**: Every 6 hours
   - **12 Hours**: Every 12 hours
   - **Daily**: Once per day
   - **Weekly**: Once per week

5. **Configure Notifications**:
   - ✅ Enable notifications
   - ✅ Notify on new MAC addresses
   - ✅ Notify on unauthorized devices
   - ✅ Notify on IP address changes

6. **Set Retention Policy**:
   - **Keep Forever**: Maintain all device records
   - **Keep for X Days**: Remove inactive devices after specified days
   - **Remove Immediately**: Delete inactive devices right away

### 2. Managing Whitelists

**Adding Authorized Devices**:
- Enter MAC addresses in the whitelist section
- Format: `00:11:22:33:44:55` or `00-11-22-33-44-55`
- Devices in whitelist generate "Information" notifications
- Devices not in whitelist generate "Warning" notifications

### 3. Monitoring and Notifications

**Dashboard Overview**:
- Real-time job status and statistics
- Recent notifications and alerts
- System health indicators
- Quick action buttons

**Notification Types**:
- 🔵 **Information**: New authorized devices, returning devices
- 🟠 **Warning**: Unauthorized devices, security concerns
- 🟢 **Success**: Job completions, system status

### 4. Job Management

**Running Jobs**:
- **Manual Execution**: Click "Run Now" on any job
- **Scheduled Execution**: Automatic based on schedule
- **Status Monitoring**: Real-time status updates

**Viewing Results**:
- **Job Details**: Click on any job to view detailed information
- **Run History**: Complete log of all executions
- **Known Devices**: All discovered devices with status
- **Device History**: Timeline of device appearances

## 🔧 Configuration

### Environment Variables

Create a `.env` file in the backend directory:
```bash
# Server Configuration
NODE_ENV=production
PORT=3001
FRONTEND_URL=http://localhost:5173

# Database Configuration
DB_PATH=./database/arp_monitoring.db

# Logging Configuration
LOG_LEVEL=info
LOG_FILE=./logs/app.log
```

### Database Configuration

The SQLite database is automatically configured with:
- **WAL Mode**: For concurrent read/write access
- **Foreign Keys**: Enabled for data integrity
- **Indexes**: Optimized for query performance
- **Triggers**: Automatic timestamp updates

### Advanced Configuration

**Custom arp-scan Options**:
Edit `backend/src/services/ArpScanner.js` to modify scanning parameters:
```javascript
const args = [
  '-I', interface,           // Network interface
  '-t', timeout,            // Timeout in milliseconds
  '--retry', '3',           // Number of retries
  '--bandwidth', '256000',  // Bandwidth limit
  subnet                    // Target subnet
];
```

## 📊 API Documentation

### Authentication
Currently, the API does not require authentication (suitable for internal networks).

### Endpoints

#### Jobs Management
```bash
# List all jobs
GET /api/jobs

# Get specific job
GET /api/jobs/:id

# Create new job
POST /api/jobs
Content-Type: application/json
{
  "name": "Office Network",
  "interface": "eth0",
  "subnet": "192.168.1.0/24",
  "schedule": "1h",
  "notifications_enabled": true,
  "whitelist": ["00:11:22:33:44:55"]
}

# Update job
PUT /api/jobs/:id

# Delete job
DELETE /api/jobs/:id

# Run job manually
POST /api/jobs/:id/run

# Get job run history
GET /api/jobs/:id/runs

# Get known devices for job
GET /api/jobs/:id/devices
```

#### Notifications
```bash
# Get all notifications
GET /api/notifications

# Get unread notifications only
GET /api/notifications?unread=true

# Mark notification as read
PATCH /api/notifications/:id/read

# Get notification statistics
GET /api/notifications/stats
```

#### Network Information
```bash
# Get available network interfaces
GET /api/network/interfaces

# Get interface details
GET /api/network/interfaces/:name

# Validate interface/subnet combination
POST /api/network/validate
{
  "interface": "eth0",
  "subnet": "192.168.1.0/24"
}

# Get system information
GET /api/network/system
```

#### Health Check
```bash
# Application health status
GET /api/health
```

## 📁 File Structure

```
/opt/arp-monitoring/
├── frontend/
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── pages/         # Page components
│   │   ├── services/      # API services
│   │   └── context/       # React context
│   ├── public/            # Static assets
│   └── package.json       # Frontend dependencies
├── backend/
│   ├── src/
│   │   ├── routes/        # API routes
│   │   ├── services/      # Business logic
│   │   ├── models/        # Data models
│   │   └── database/      # Database setup
│   ├── database/          # SQLite database
│   ├── logs/             # Application logs
│   └── package.json      # Backend dependencies
├── logs/                 # System logs
├── start.sh             # Application start script
├── install.sh           # Installation script
├── README.md            # This file
└── TROUBLESHOOTING.md   # Troubleshooting guide
```

## 📝 Logging

### Log Locations
- **Application Logs**: `/var/log/arp-monitoring/app.log`
- **Error Logs**: `/var/log/arp-monitoring/error.log`
- **System Logs**: `sudo journalctl -u arp-monitoring`

### Log Levels
- **ERROR**: Critical errors requiring attention
- **WARN**: Warning conditions
- **INFO**: General information messages
- **DEBUG**: Detailed debugging information

### Viewing Logs
```bash
# Real-time application logs
tail -f /var/log/arp-monitoring/app.log

# Real-time error logs
tail -f /var/log/arp-monitoring/error.log

# System service logs
sudo journalctl -u arp-monitoring -f

# Search logs for specific terms
grep "ERROR" /var/log/arp-monitoring/app.log
```

## 🔒 Security Considerations

### Network Security
- Application designed for internal network use
- No authentication required (suitable for trusted networks)
- Firewall rules limit access to specific ports
- Raw socket access required for arp-scan functionality

### System Security
- Runs as non-root user with minimal privileges
- arp-scan uses capabilities instead of setuid root
- Database stored with restricted permissions
- Input validation on all API endpoints
- SQL injection protection with prepared statements

### Recommendations
- Deploy behind a firewall or VPN
- Monitor access logs regularly
- Keep system and dependencies updated
- Use network segmentation for sensitive environments
- Consider adding authentication for production use

## 🛠️ Troubleshooting

### Common Issues

#### 1. Permission Denied Errors
```bash
# Fix arp-scan permissions
sudo setcap cap_net_raw+ep $(which arp-scan)

# Verify capabilities
getcap $(which arp-scan)
```

#### 2. Port Already in Use
```bash
# Find process using port
sudo lsof -i :3001

# Kill process if needed
sudo kill -9 <PID>
```

#### 3. Database Issues
```bash
# Reinitialize database
cd /opt/arp-monitoring/backend
rm -f database/arp_monitoring.db
node src/database/init.js
```

#### 4. Network Interface Problems
```bash
# List available interfaces
ip link show

# Check interface status
ip addr show eth0

# Bring interface up
sudo ip link set eth0 up
```

### Diagnostic Commands

```bash
# Check service status
sudo systemctl status arp-monitoring

# Test arp-scan manually
sudo arp-scan -l
sudo arp-scan -I eth0 192.168.1.0/24

# Test API connectivity
curl http://localhost:3001/api/health

# Check network connectivity
ping -c 3 8.8.8.8

# Monitor resource usage
top -p $(pgrep -f "node.*app.js")
```

### Getting Help

1. **Check Logs**: Always start by examining the log files
2. **Verify Configuration**: Ensure network interfaces and subnets are correct
3. **Test Components**: Test arp-scan and network connectivity separately
4. **Review Documentation**: Check TROUBLESHOOTING.md for detailed solutions

## 🔄 Updates and Maintenance

### Updating the Application
```bash
# Stop the service
sudo systemctl stop arp-monitoring

# Backup database
cp /opt/arp-monitoring/backend/database/arp_monitoring.db ~/arp_monitoring_backup.db

# Update application files
# (Copy new files to /opt/arp-monitoring)

# Update dependencies
cd /opt/arp-monitoring
npm run install:all

# Restart service
sudo systemctl start arp-monitoring
```

### Database Maintenance
```bash
# Backup database
sqlite3 /opt/arp-monitoring/backend/database/arp_monitoring.db ".backup backup.db"

# Vacuum database (optimize)
sqlite3 /opt/arp-monitoring/backend/database/arp_monitoring.db "VACUUM;"

# Check database integrity
sqlite3 /opt/arp-monitoring/backend/database/arp_monitoring.db "PRAGMA integrity_check;"
```

### Log Rotation
```bash
# Set up logrotate for application logs
sudo tee /etc/logrotate.d/arp-monitoring > /dev/null <<EOF
/var/log/arp-monitoring/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 644 $USER $USER
}
EOF
```

## 🤝 Contributing

This application is designed as a complete, production-ready solution. For customizations:

1. **Frontend Modifications**: Edit React components in `src/components/` and `src/pages/`
2. **Backend Logic**: Modify services in `backend/src/services/`
3. **Database Schema**: Update `backend/src/database/init.js`
4. **API Endpoints**: Add routes in `backend/src/routes/`

## 📄 License

This project is provided as-is for testing, educational, and production use.

## ⚠️ Important Notes

- **Network Authorization**: Ensure you have proper authorization before scanning networks
- **Resource Usage**: Monitor system resources during intensive scanning operations
- **Backup Strategy**: Implement regular database backups for production use
- **Security Updates**: Keep system and dependencies updated regularly

---

**Happy Network Monitoring! 🔍**

For additional support, check the `TROUBLESHOOTING.md` file or examine the application logs for specific error messages.