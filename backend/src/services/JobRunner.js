import { v4 as uuidv4 } from 'uuid';
import winston from 'winston';
import { getDatabase } from '../database/init.js';
import { ArpScanner } from './ArpScanner.js';
import { NotificationService } from './NotificationService.js';

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

export class JobRunner {
  constructor() {
    this.runningJobs = new Map();
    this.scanner = new ArpScanner();
    this.notificationService = new NotificationService();
  }

  /**
   * Execute a job
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

    // Get job whitelist
    const whitelistStmt = db.prepare('SELECT mac_address FROM job_whitelist WHERE job_id = ?');
    const whitelist = new Set(whitelistStmt.all(jobId).map(row => row.mac_address));

    logger.info(`Starting job: ${job.name} (${jobId})`);

    // Create job run record
    const runId = uuidv4();
    const createRunStmt = db.prepare(`
      INSERT INTO job_runs (id, job_id, status, started_at)
      VALUES (?, ?, 'running', CURRENT_TIMESTAMP)
    `);
    createRunStmt.run(runId, jobId);

    // Update job status
    const updateJobStmt = db.prepare('UPDATE jobs SET status = ?, last_run = CURRENT_TIMESTAMP WHERE id = ?');
    updateJobStmt.run('running', jobId);

    this.runningJobs.set(jobId, { runId, startTime: Date.now() });

    try {
      // Perform ARP scan
      const devices = await this.scanner.scan(job.network_interface, job.subnet, job.execution_time);
      
      // Process discovered devices
      const result = await this._processDevices(jobId, devices, whitelist, job);
      
      // Update job run with results
      const duration = Math.floor((Date.now() - this.runningJobs.get(jobId).startTime) / 1000);
      const updateRunStmt = db.prepare(`
        UPDATE job_runs 
        SET status = 'completed', finished_at = CURRENT_TIMESTAMP, duration = ?,
            devices_found = ?, new_devices = ?, warnings = ?
        WHERE id = ?
      `);
      updateRunStmt.run(duration, result.devicesFound, result.newDevices, result.warnings, runId);

      // Update job status back to active
      const resetJobStmt = db.prepare('UPDATE jobs SET status = ? WHERE id = ?');
      resetJobStmt.run('active', jobId);

      logger.info(`Job completed: ${job.name} - Found ${result.devicesFound} devices, ${result.newDevices} new, ${result.warnings} warnings`);

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
      knownDevices.set(device.mac_address, device);
    }

    // Process each discovered device
    for (const device of devices) {
      const isWhitelisted = whitelist.has(device.mac);
      const existingDevice = knownDevices.get(device.mac);

      if (!existingDevice) {
        // New device discovered
        newDevices++;
        
        // Add to known devices
        const insertDeviceStmt = db.prepare(`
          INSERT INTO known_devices 
          (id, job_id, mac_address, ip_address, vendor, whitelisted, first_seen, last_seen, status)
          VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'active')
        `);
        insertDeviceStmt.run(uuidv4(), jobId, device.mac, device.ip, device.vendor, isWhitelisted ? 1 : 0);

        // Generate notification
        if (job.notifications_enabled) {
          if (isWhitelisted && job.notify_new_macs) {
            await this.notificationService.createNotification({
              job_id: jobId,
              job_name: job.name,
              type: 'information',
              message: `New authorized device discovered: ${device.mac}`,
              mac_address: device.mac,
              ip_address: device.ip
            });
          } else if (!isWhitelisted && job.notify_unauthorized_macs) {
            warnings++;
            await this.notificationService.createNotification({
              job_id: jobId,
              job_name: job.name,
              type: 'warning',
              message: `Unauthorized device detected: ${device.mac}`,
              mac_address: device.mac,
              ip_address: device.ip
            });
          }
        }
      } else {
        // Existing device - check for IP changes
        if (existingDevice.ip_address !== device.ip && job.notifications_enabled && job.notify_ip_changes) {
          await this.notificationService.createNotification({
            job_id: jobId,
            job_name: job.name,
            type: 'information',
            message: `Device ${device.mac} changed IP from ${existingDevice.ip_address} to ${device.ip}`,
            mac_address: device.mac,
            ip_address: device.ip
          });
        }

        // Update last seen and IP
        const updateDeviceStmt = db.prepare(`
          UPDATE known_devices 
          SET ip_address = ?, vendor = ?, last_seen = CURRENT_TIMESTAMP, status = 'active'
          WHERE job_id = ? AND mac_address = ?
        `);
        updateDeviceStmt.run(device.ip, device.vendor, jobId, device.mac);

        // Remove from knownDevices map to track which devices were not seen
        knownDevices.delete(device.mac);
      }

      // Add to device history
      const insertHistoryStmt = db.prepare(`
        INSERT INTO device_history (id, job_id, mac_address, ip_address, vendor, detected_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `);
      insertHistoryStmt.run(uuidv4(), jobId, device.mac, device.ip, device.vendor);
    }

    // Mark devices that were not seen as inactive
    for (const [mac, device] of knownDevices) {
      const updateInactiveStmt = db.prepare(`
        UPDATE known_devices 
        SET status = 'inactive' 
        WHERE job_id = ? AND mac_address = ?
      `);
      updateInactiveStmt.run(jobId, mac);
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