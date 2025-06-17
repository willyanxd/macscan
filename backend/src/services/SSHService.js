import { Client } from 'ssh2';
import winston from 'winston';
import { CryptoService } from './CryptoService.js';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

export class SSHService {
  constructor() {
    this.connections = new Map();
  }

  /**
   * Test SSH connection
   * @param {Object} hostConfig - SSH host configuration
   * @returns {Promise<Object>} Test result
   */
  async testConnection(hostConfig) {
    const { host, port, username, password } = hostConfig;
    
    logger.info(`Testing SSH connection to ${username}@${host}:${port}`);
    
    return new Promise((resolve) => {
      const conn = new Client();
      const startTime = Date.now();
      
      const timeout = setTimeout(() => {
        conn.end();
        resolve({
          success: false,
          error: 'Connection timeout (30s)',
          duration: Date.now() - startTime
        });
      }, 30000);

      conn.on('ready', () => {
        clearTimeout(timeout);
        const duration = Date.now() - startTime;
        logger.info(`SSH connection successful to ${host} in ${duration}ms`);
        
        conn.end();
        resolve({
          success: true,
          message: 'Connection successful',
          duration
        });
      });

      conn.on('error', (err) => {
        clearTimeout(timeout);
        const duration = Date.now() - startTime;
        logger.error(`SSH connection failed to ${host}:`, err.message);
        
        resolve({
          success: false,
          error: err.message,
          duration
        });
      });

      try {
        conn.connect({
          host,
          port,
          username,
          password,
          readyTimeout: 30000,
          algorithms: {
            kex: ['diffie-hellman-group14-sha256', 'diffie-hellman-group14-sha1'],
            cipher: ['aes128-ctr', 'aes192-ctr', 'aes256-ctr'],
            hmac: ['hmac-sha2-256', 'hmac-sha2-512', 'hmac-sha1'],
            compress: ['none']
          }
        });
      } catch (error) {
        clearTimeout(timeout);
        resolve({
          success: false,
          error: error.message,
          duration: Date.now() - startTime
        });
      }
    });
  }

  /**
   * Execute command via SSH
   * @param {Object} hostConfig - SSH host configuration
   * @param {string} command - Command to execute
   * @returns {Promise<Object>} Command result
   */
  async executeCommand(hostConfig, command) {
    const { host, port, username, password } = hostConfig;
    
    logger.info(`Executing SSH command on ${host}: ${command}`);
    
    return new Promise((resolve) => {
      const conn = new Client();
      const startTime = Date.now();
      
      const timeout = setTimeout(() => {
        conn.end();
        resolve({
          success: false,
          error: 'Command execution timeout (60s)',
          output: '',
          duration: Date.now() - startTime
        });
      }, 60000);

      conn.on('ready', () => {
        conn.exec(command, (err, stream) => {
          if (err) {
            clearTimeout(timeout);
            conn.end();
            resolve({
              success: false,
              error: err.message,
              output: '',
              duration: Date.now() - startTime
            });
            return;
          }

          let output = '';
          let errorOutput = '';

          stream.on('close', (code, signal) => {
            clearTimeout(timeout);
            conn.end();
            
            const duration = Date.now() - startTime;
            const success = code === 0;
            
            logger.info(`SSH command completed on ${host} with code ${code} in ${duration}ms`);
            
            resolve({
              success,
              output: output.trim(),
              error: errorOutput.trim() || (success ? null : `Command exited with code ${code}`),
              duration,
              exitCode: code
            });
          });

          stream.on('data', (data) => {
            output += data.toString();
          });

          stream.stderr.on('data', (data) => {
            errorOutput += data.toString();
          });

          // Handle --more-- prompts by sending space or enter
          stream.stdin.write(' ');
        });
      });

      conn.on('error', (err) => {
        clearTimeout(timeout);
        logger.error(`SSH connection error to ${host}:`, err.message);
        
        resolve({
          success: false,
          error: err.message,
          output: '',
          duration: Date.now() - startTime
        });
      });

      try {
        conn.connect({
          host,
          port,
          username,
          password,
          readyTimeout: 30000,
          algorithms: {
            kex: ['diffie-hellman-group14-sha256', 'diffie-hellman-group14-sha1'],
            cipher: ['aes128-ctr', 'aes192-ctr', 'aes256-ctr'],
            hmac: ['hmac-sha2-256', 'hmac-sha2-512', 'hmac-sha1'],
            compress: ['none']
          }
        });
      } catch (error) {
        clearTimeout(timeout);
        resolve({
          success: false,
          error: error.message,
          output: '',
          duration: Date.now() - startTime
        });
      }
    });
  }

  /**
   * Execute MAC address table command
   * @param {Object} hostConfig - SSH host configuration
   * @param {number} vlanId - VLAN ID (optional)
   * @returns {Promise<Object>} MAC table result
   */
  async getMacAddressTable(hostConfig, vlanId = null) {
    const command = vlanId 
      ? `show mac address-table vlan ${vlanId}`
      : 'show mac address-table';
    
    logger.info(`Getting MAC address table from ${hostConfig.host}${vlanId ? ` for VLAN ${vlanId}` : ''}`);
    
    const result = await this.executeCommand(hostConfig, command);
    
    if (!result.success) {
      return result;
    }

    try {
      const devices = this.parseMacAddressTable(result.output, hostConfig.host);
      
      return {
        ...result,
        devices,
        deviceCount: devices.length
      };
    } catch (error) {
      logger.error('Failed to parse MAC address table:', error);
      return {
        ...result,
        success: false,
        error: 'Failed to parse MAC address table output',
        devices: []
      };
    }
  }

  /**
   * Parse MAC address table output
   * @param {string} output - Command output
   * @param {string} hostName - Host name
   * @returns {Array} Parsed devices
   */
  parseMacAddressTable(output, hostName) {
    const devices = [];
    const lines = output.split('\n');
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Skip header lines, empty lines, and --more-- lines
      if (!trimmedLine || 
          trimmedLine.includes('VlanId') || 
          trimmedLine.includes('---') ||
          trimmedLine.includes('--more--') ||
          trimmedLine.includes('Codes:') ||
          trimmedLine.startsWith('pv ')) {
        continue;
      }

      // Parse MAC table entry
      // Format: VlanId Mac Address Type Interface
      const parts = trimmedLine.split(/\s+/);
      
      if (parts.length >= 4) {
        const vlanId = parseInt(parts[0], 10);
        const macAddress = parts[1].toLowerCase();
        const type = parts[2];
        const interfaceName = parts.slice(3).join(' ');

        // Validate MAC address format
        if (this.isValidMAC(macAddress) && !isNaN(vlanId)) {
          devices.push({
            mac_address: macAddress,
            vlan_id: vlanId,
            type,
            interface_name: interfaceName,
            host_name: hostName,
            detected_at: new Date().toISOString()
          });
        }
      }
    }

    logger.info(`Parsed ${devices.length} MAC addresses from ${hostName}`);
    return devices;
  }

  /**
   * Validate MAC address format
   * @param {string} mac - MAC address
   * @returns {boolean} Is valid
   */
  isValidMAC(mac) {
    const macRegex = /^([0-9a-f]{2}[:-]){5}([0-9a-f]{2})$/i;
    return macRegex.test(mac);
  }

  /**
   * Close all connections
   */
  closeAllConnections() {
    for (const [key, conn] of this.connections) {
      try {
        conn.end();
      } catch (error) {
        logger.warn(`Error closing SSH connection ${key}:`, error.message);
      }
    }
    this.connections.clear();
  }
}