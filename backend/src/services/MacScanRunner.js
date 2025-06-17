import { v4 as uuidv4 } from 'uuid';
import winston from 'winston';
import { getDatabase } from '../database/init.js';
import { SSHService } from './SSHService.js';
import { NotificationService } from './NotificationService.js';
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

export class MacScanRunner {
  constructor() {
    this.runningJobs = new Map();
    this.sshService = new SSHService();
    this.notificationService = new NotificationService();
  }

  /**
   * Execute a MAC scan job
   * @param {string} jobId - ID of the job to run
   * @returns {Promise<void>}
   */
  async runJob(jobId) {
    if (this.runningJobs.has(jobId)) {
      throw new Error('Job is already running');
    }

    const db = getDatabase();
    
    // Get job details
    const jobStmt = db.prepare('SELECT * FROM jobs WHERE id = ? AND status = ?');
    const job = jobStmt.get(jobId, 'active');
    
    if (!job) {
      throw new Error('Job not found or inactive');
    }

    // Get SSH hosts for this job
    const hostsStmt = db.prepare('SELECT * FROM ssh_hosts WHERE job_id = ? AND enabled = 1');
    const sshHosts = hostsStmt.all(jobId);

    if (sshHosts.length === 0) {
      throw new Error('No enabled SSH hosts configured for this job');
    }

    // Get job whitelist
    const whitelistStmt = db.prepare('SELECT mac_address FROM job_whitelist WHERE job_id = ?');
    const whitelist = new Set(whitelistStmt.all(jobId).map(row => row.mac_address));

    logger.info(`Starting MAC scan job: ${job.name} (${jobId}) on ${sshHosts.length} hosts`);

    // Create job run record
    const runId = uuidv4();
    const createRunStmt = db.prepare(`
      INSERT INTO job_runs (id, job_id, status, hosts_scanned, started_at)
      VALUES (?, ?, 'running', ?, CURRENT_TIMESTAMP)
    `);
    createRunStmt.run(runId, jobId, sshHosts.length);

    // Update job status
    const updateJobStmt = db.prepare('UPDATE jobs SET status = ?, last_run = CURRENT_TIMESTAMP WHERE id = ?');
    updateJobStmt.run('running', jobId);

    this.runningJobs.set(jobId, { runId, startTime: Date.now() });

    try {
      // Scan all hosts
      const allDevices = [];
      const debugInfo = [];
      let successfulHosts = 0;

      for (const host of sshHosts) {
        try {
          logger.info(`Scanning host: ${host.name} (${host.host})`);
          debugInfo.push(`[${new Date().toISOString()}] Starting scan on ${host.name} (${host.host}:${host.port})`);

          // Decrypt password
          const password = CryptoService.decrypt(host.password_encrypted);
          
          const hostConfig = {
            host: host.host,
            port: host.port,
            username: host.username,
            password
          };

          // Get MAC address table
          const result = await this.sshService.getMacAddressTable(hostConfig, job.vlan_id);
          
          if (result.success) {
            successfulHosts++;
            allDevices.push(...result.devices);
            debugInfo.push(`[${new Date().toISOString()}] Successfully scanned ${host.name}: ${result.devices.length} devices found`);
            logger.info(`Host ${host.name} scan completed: ${result.devices.length} devices found`);
          } else {
            debugInfo.push(`[${new Date().toISOString()}] Failed to scan ${host.name}: ${result.error}`);
            logger.error(`Host ${host.name} scan failed: ${result.error}`);
          }
        } catch (error) {
          debugInfo.push(`[${new Date().toISOString()}] Error scanning ${host.name}: ${error.message}`);
          logger.error(`Error scanning host ${host.name}:`, error);
        }
      }

      if (successfulHosts === 0) {
        throw new Error('Failed to scan any hosts');
      }

      // Process discovered devices
      const result = await this._processDevices(jobId, allDevices, whitelist, job);
      
      // Update job run with results
      const duration = Math.floor((Date.now() - this.runningJobs.get(jobId).startTime) / 1000);
      const updateRunStmt = db.prepare(`
        UPDATE job_runs 
        SET status = 'completed', finished_at = CURRENT_TIMESTAMP, duration = ?,
            devices_found = ?, new_devices = ?, warnings = ?, debug_info = ?
        WHERE id = ?
      `);
      updateRunStmt.run(
        duration, 
        result.devicesFound, 
        result.newDevices, 
        result.warnings, 
        debugInfo.join('\n'),
        runId
      );

      // Update job status back to active
      const resetJobStmt = db.prepare('UPDATE jobs SET status = ? WHERE id = ?');
      resetJobStmt.run('active', jobId);

      logger.info(`Job completed: ${job.name} - Scanned ${successfulHosts}/${sshHosts.length} hosts, Found ${result.devicesFound} devices, ${result.newDevices} new, ${result.warnings} warnings`);

    } catch (error) {
      logger.error(`Job failed: ${job.name} - ${error.message}`);
      
      // Update job run with error
      const updateRunStmt = db.prepare(`
        UPDATE job_runs 
        SET status = 'failed', finished_at = CURRENT_TIMESTAMP, error_message = ?
        WHERE id = ?
      `);
      updateRunStmt.run(error.message, runId);

      // Update job status back to active
      const resetJobStmt = db.prepare('UPDATE jobs SET status = ? WHERE id = ?');
      resetJobStmt.run('active', jobId);

      throw error;
    } finally {
      this.runningJobs.delete(jobId);
    }
  }

  /**
   * Process discovered devices and generate notifications
   * @private
   */
  async _processDevices(jobId, devices, whitelist, job) {
    const db = getDatabase();
    let newDevices = 0;
    let warnings = 0;

    // Get currently known devices for this job
    const knownDevicesStmt = db.prepare('SELECT * FROM known_devices WHERE job_id = ?');
    const knownDevices = new Map();
    
    for (const device of knownDevicesStmt.all(jobId)) {
      const key = `${device.mac_address}:${device.host_name}`;
      knownDevices.set(key, device);
    }

    // Process each discovered device
    for (const device of devices) {
      const deviceKey = `${device.mac_address}:${device.host_name}`;
      const isWhitelisted = whitelist.has(device.mac_address);
      const existingDevice = knownDevices.get(deviceKey);

      if (!existingDevice) {
        // New device discovered
        newDevices++;
        
        // Add to known devices
        const insertDeviceStmt = db.prepare(`
          INSERT INTO known_devices 
          (id, job_id, mac_address, host_name, interface_name, vlan_id, whitelisted, first_seen, last_seen, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'active')
        `);
        insertDeviceStmt.run(
          uuidv4(), 
          jobId, 
          device.mac_address, 
          device.host_name, 
          device.interface_name,
          device.vlan_id,
          isWhitelisted ? 1 : 0
        );

        // Generate notification
        if (job.notifications_enabled) {
          if (isWhitelisted && job.notify_new_macs) {
            await this.notificationService.createNotification({
              job_id: jobId,
              job_name: job.name,
              type: 'information',
              message: `New authorized device discovered: ${device.mac_address} on ${device.host_name}`,
              mac_address: device.mac_address,
              host_name: device.host_name,
              interface_name: device.interface_name
            });
          } else if (!isWhitelisted && job.notify_unauthorized_macs) {
            warnings++;
            await this.notificationService.createNotification({
              job_id: jobId,
              job_name: job.name,
              type: 'warning',
              message: `Unauthorized device detected: ${device.mac_address} on ${device.host_name}`,
              mac_address: device.mac_address,
              host_name: device.host_name,
              interface_name: device.interface_name
            });
          }
        }
      } else {
        // Existing device - check for interface changes
        if (existingDevice.interface_name !== device.interface_name && job.notifications_enabled && job.notify_ip_changes) {
          await this.notificationService.createNotification({
            job_id: jobId,
            job_name: job.name,
            type: 'information',
            message: `Device ${device.mac_address} moved from ${existingDevice.interface_name} to ${device.interface_name} on ${device.host_name}`,
            mac_address: device.mac_address,
            host_name: device.host_name,
            interface_name: device.interface_name
          });
        }

        // Update last seen and interface
        const updateDeviceStmt = db.prepare(`
          UPDATE known_devices 
          SET interface_name = ?, vlan_id = ?, last_seen = CURRENT_TIMESTAMP, status = 'active'
          WHERE job_id = ? AND mac_address = ? AND host_name = ?
        `);
        updateDeviceStmt.run(
          device.interface_name, 
          device.vlan_id, 
          jobId, 
          device.mac_address, 
          device.host_name
        );

        // Remove from knownDevices map to track which devices were not seen
        knownDevices.delete(deviceKey);
      }

      // Add to device history
      const insertHistoryStmt = db.prepare(`
        INSERT INTO device_history (id, job_id, mac_address, host_name, interface_name, vlan_id, detected_at)
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `);
      insertHistoryStmt.run(
        uuidv4(), 
        jobId, 
        device.mac_address, 
        device.host_name, 
        device.interface_name,
        device.vlan_id
      );
    }

    // Mark devices that were not seen as inactive
    for (const [deviceKey, device] of knownDevices) {
      const updateInactiveStmt = db.prepare(`
        UPDATE known_devices 
        SET status = 'inactive' 
        WHERE job_id = ? AND mac_address = ? AND host_name = ?
      `);
      updateInactiveStmt.run(jobId, device.mac_address, device.host_name);
    }

    // Apply retention policy
    await this._applyRetentionPolicy(jobId, job);

    return {
      devicesFound: devices.length,
      newDevices,
      warnings
    };
  }

  /**
   * Apply retention policy for inactive devices
   * @private
   */
  async _applyRetentionPolicy(jobId, job) {
    if (job.retention_policy === 'forever') {
      return; // Keep all devices
    }

    const db = getDatabase();

    if (job.retention_policy === 'remove') {
      // Remove inactive devices immediately
      const deleteStmt = db.prepare('DELETE FROM known_devices WHERE job_id = ? AND status = ?');
      deleteStmt.run(jobId, 'inactive');
    } else if (job.retention_policy === 'days') {
      // Remove devices inactive for more than retention_days
      const deleteStmt = db.prepare(`
        DELETE FROM known_devices 
        WHERE job_id = ? AND status = ? 
        AND datetime(last_seen) < datetime('now', '-' || ? || ' days')
      `);
      deleteStmt.run(jobId, 'inactive', job.retention_days);
    }
  }

  /**
   * Check if a job is currently running
   * @param {string} jobId - Job ID to check
   * @returns {boolean}
   */
  isJobRunning(jobId) {
    return this.runningJobs.has(jobId);
  }

  /**
   * Get all currently running jobs
   * @returns {Array<string>} Array of job IDs
   */
  getRunningJobs() {
    return Array.from(this.runningJobs.keys());
  }
}