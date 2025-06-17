import { spawn } from 'child_process';
import winston from 'winston';

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

export class ArpScanner {
  constructor() {
    this.isRunning = false;
  }

  async scan(network_interface, subnet, timeout = 5) {
    if (this.isRunning) {
      throw new Error('ARP scan already in progress');
    }

    this.isRunning = true;
    logger.info(`Starting ARP scan on ${network_interface} for subnet ${subnet}`);

    try {
      const devices = await this._executeScan(network_interface, subnet, timeout);
      logger.info(`ARP scan completed. Found ${devices.length} devices`);
      return devices;
    } catch (error) {
      logger.error('ARP scan failed:', error);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  async _executeScan(network_interface, subnet, timeout) {
    return new Promise((resolve, reject) => {
      const args = [
        '-I', network_interface,
        '--format', '${ip}\t${mac}',
        '--plain',
        '--quiet',
        subnet
      ];

      logger.debug(`Executing: arp-scan ${args.join(' ')}`);

      const process = spawn('/usr/sbin/arp-scan', args);

      let stdout = '';
      let stderr = '';

      // Timeout para matar processo caso ultrapasse o limite
      const timer = setTimeout(() => {
        if (!process.killed) {
          process.kill('SIGTERM');
          reject(new Error('ARP scan timed out'));
        }
      }, (timeout + 10) * 1000);

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        clearTimeout(timer);

        if (code !== 0) {
          logger.error(`arp-scan exited with code ${code}: ${stderr}`);
          return reject(new Error(`arp-scan failed with exit code ${code}: ${stderr}`));
        }

        try {
          const devices = this._parseOutput(stdout);
          resolve(devices);
        } catch (error) {
          reject(error);
        }
      });

      process.on('error', (error) => {
        clearTimeout(timer);
        logger.error('Failed to start arp-scan process:', error);
        reject(new Error(`Failed to execute arp-scan: ${error.message}`));
      });
    });
  }

  _parseOutput(output) {
    const devices = [];
    const lines = output.trim().split('\n');

    for (const line of lines) {
      if (line.trim() === '') continue;

      const parts = line.split('\t');
      if (parts.length >= 2) {
        const device = {
          ip: parts[0].trim(),
          mac: parts[1].trim().toLowerCase(),
          detected_at: new Date().toISOString()
        };

        if (this._isValidIP(device.ip) && this._isValidMAC(device.mac)) {
          devices.push(device);
        } else {
          logger.warn(`Invalid device data: ${line}`);
        }
      }
    }

    return devices;
  }

  _isValidIP(ip) {
    const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    return ipRegex.test(ip);
  }

  _isValidMAC(mac) {
    const macRegex = /^([0-9a-f]{2}[:-]){5}([0-9a-f]{2})$/i;
    return macRegex.test(mac);
  }

  static async checkAvailability() {
    return new Promise((resolve) => {
      const process = spawn('which', ['arp-scan']);

      process.on('close', (code) => {
        resolve(code === 0);
      });

      process.on('error', () => {
        resolve(false);
      });
    });
  }

  static async getVersion() {
    return new Promise((resolve, reject) => {
      const process = spawn('arp-scan', ['--version']);

      let output = '';

      process.stdout.on('data', (data) => {
        output += data.toString();
      });

      process.stderr.on('data', (data) => {
        output += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          resolve(output.trim());
        } else {
          reject(new Error('Failed to get arp-scan version'));
        }
      });

      process.on('error', (error) => {
        reject(error);
      });
    });
  }
}
