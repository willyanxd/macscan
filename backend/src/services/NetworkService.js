import { spawn } from 'child_process';
import { promisify } from 'util';
import winston from 'winston';
import { readFileSync } from 'fs';

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

export class NetworkService {
  /**
   * Get available network interfaces
   * @returns {Promise<Array<string>>} Array of interface names
   */
  static async getNetworkInterfaces() {
    try {
      // Read from /proc/net/dev on Linux
      const data = readFileSync('/proc/net/dev', 'utf8');
      const lines = data.split('\n');
      const interfaces = [];

      for (const line of lines) {
        if (line.includes(':')) {
          const interfaceName = line.split(':')[0].trim();
          // Skip loopback and virtual interfaces
          if (interfaceName !== 'lo' && !interfaceName.startsWith('docker') && !interfaceName.startsWith('veth')) {
            interfaces.push(interfaceName);
          }
        }
      }

      logger.info(`Found ${interfaces.length} network interfaces: ${interfaces.join(', ')}`);
      return interfaces;
    } catch (error) {
      logger.error('Failed to get network interfaces:', error);
      // Fallback: try using ip command
      return this.getInterfacesUsingIpCommand();
    }
  }

  /**
   * Fallback method using ip command
   * @private
   */
  static async getInterfacesUsingIpCommand() {
    return new Promise((resolve, reject) => {
      const process = spawn('ip', ['link', 'show']);
      let output = '';

      process.stdout.on('data', (data) => {
        output += data.toString();
      });

      process.on('close', (code) => {
        if (code !== 0) {
          resolve(['eth0', 'ens33', 'enp0s3']); // Common interface names as fallback
          return;
        }

        const interfaces = [];
        const lines = output.split('\n');
        
        for (const line of lines) {
          const match = line.match(/^\d+:\s+([^:]+):/);
          if (match) {
            const interfaceName = match[1].trim();
            if (interfaceName !== 'lo' && !interfaceName.startsWith('docker') && !interfaceName.startsWith('veth')) {
              interfaces.push(interfaceName);
            }
          }
        }

        resolve(interfaces);
      });

      process.on('error', () => {
        resolve(['eth0', 'ens33', 'enp0s3']); // Fallback interfaces
      });
    });
  }

  /**
   * Get interface information including IP addresses
   * @param {string} interfaceName - Interface name
   * @returns {Promise<Object>} Interface information
   */
  static async getInterfaceInfo(interfaceName) {
    return new Promise((resolve, reject) => {
      const process = spawn('ip', ['addr', 'show', interfaceName]);
      let output = '';

      process.stdout.on('data', (data) => {
        output += data.toString();
      });

      process.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Failed to get interface info for ${interfaceName}`));
          return;
        }

        const info = {
          name: interfaceName,
          addresses: [],
          status: 'unknown'
        };

        // Parse interface status
        if (output.includes('state UP')) {
          info.status = 'up';
        } else if (output.includes('state DOWN')) {
          info.status = 'down';
        }

        // Parse IP addresses
        const ipMatches = output.match(/inet\s+([^\s]+)/g);
        if (ipMatches) {
          for (const match of ipMatches) {
            const ip = match.replace('inet ', '');
            info.addresses.push(ip);
          }
        }

        resolve(info);
      });

      process.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Validate if an interface has an IP address in the specified subnet
   * @param {string} interfaceName - Interface name
   * @param {string} subnet - Subnet in CIDR notation (e.g., '192.168.1.0/24')
   * @returns {Promise<boolean>} True if interface has IP in subnet
   */
  static async validateInterfaceSubnet(interfaceName, subnet) {
    try {
      const interfaceInfo = await this.getInterfaceInfo(interfaceName);
      
      if (interfaceInfo.addresses.length === 0) {
        return false;
      }

      // Parse subnet
      const [subnetNetwork, subnetMask] = subnet.split('/');
      const subnetMaskBits = parseInt(subnetMask, 10);
      
      if (isNaN(subnetMaskBits) || subnetMaskBits < 0 || subnetMaskBits > 32) {
        throw new Error('Invalid subnet mask');
      }

      // Convert subnet to numeric for comparison
      const subnetNetworkNum = this.ipToNumber(subnetNetwork);
      const maskNum = (0xFFFFFFFF << (32 - subnetMaskBits)) >>> 0;

      // Check each interface IP
      for (const address of interfaceInfo.addresses) {
        const [ip] = address.split('/');
        const ipNum = this.ipToNumber(ip);
        
        // Check if IP is in the subnet
        if ((ipNum & maskNum) === (subnetNetworkNum & maskNum)) {
          return true;
        }
      }

      return false;
    } catch (error) {
      logger.error(`Failed to validate interface subnet: ${error.message}`);
      return false;
    }
  }

  /**
   * Convert IP address string to number
   * @private
   */
  static ipToNumber(ip) {
    const parts = ip.split('.');
    return (parseInt(parts[0], 10) << 24) +
           (parseInt(parts[1], 10) << 16) +
           (parseInt(parts[2], 10) << 8) +
           parseInt(parts[3], 10);
  }

  /**
   * Check if arp-scan is available and get system information
   * @returns {Promise<Object>} System information
   */
  static async getSystemInfo() {
    const info = {
      arpScanAvailable: false,
      arpScanVersion: null,
      interfaces: [],
      platform: process.platform,
      arch: process.arch
    };

    try {
      // Check arp-scan availability
      const arpScanAvailable = await new Promise((resolve) => {
        const process = spawn('which', ['arp-scan']);
        process.on('close', (code) => resolve(code === 0));
        process.on('error', () => resolve(false));
      });

      info.arpScanAvailable = arpScanAvailable;

      if (arpScanAvailable) {
        // Get arp-scan version
        try {
          const version = await new Promise((resolve, reject) => {
            const process = spawn('arp-scan', ['--version']);
            let output = '';
            
            process.stdout.on('data', (data) => output += data.toString());
            process.stderr.on('data', (data) => output += data.toString());
            
            process.on('close', (code) => {
              if (code === 0) {
                resolve(output.trim());
              } else {
                reject(new Error('Failed to get version'));
              }
            });
            
            process.on('error', reject);
          });
          
          info.arpScanVersion = version;
        } catch (error) {
          logger.warn('Could not get arp-scan version:', error.message);
        }
      }

      // Get network interfaces
      info.interfaces = await this.getNetworkInterfaces();

    } catch (error) {
      logger.error('Failed to get system info:', error);
    }

    return info;
  }
}