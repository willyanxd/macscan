import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../database/init.js';

export class Job {
  constructor(data) {
    this.id = data.id || uuidv4();
    this.name = data.name;
    this.network_interface = data.network_interface;
    this.subnet = data.subnet;
    this.execution_time = data.execution_time || 300;
    this.schedule = data.schedule || 'manual';
    this.notifications_enabled = data.notifications_enabled !== false;
    this.notify_new_macs = data.notify_new_macs !== false;
    this.notify_unauthorized_macs = data.notify_unauthorized_macs !== false;
    this.notify_ip_changes = data.notify_ip_changes !== false;
    this.retention_policy = data.retention_policy || 'days';
    this.retention_days = data.retention_days || 30;
    this.status = data.status || 'active';
    this.whitelist = data.whitelist || [];
  }

  async save() {
    const db = getDatabase();
    
    const jobData = {
      id: this.id,
      name: this.name,
      network_interface: this.network_interface,
      subnet: this.subnet,
      execution_time: this.execution_time,
      schedule: this.schedule,
      notifications_enabled: this.notifications_enabled ? 1 : 0,
      notify_new_macs: this.notify_new_macs ? 1 : 0,
      notify_unauthorized_macs: this.notify_unauthorized_macs ? 1 : 0,
      notify_ip_changes: this.notify_ip_changes ? 1 : 0,
      retention_policy: this.retention_policy,
      retention_days: this.retention_days,
      status: this.status
    };

    // Start transaction
    const transaction = db.transaction(() => {
      // Insert/update job
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO jobs 
        (id, name, network_interface, subnet, execution_time, schedule, notifications_enabled, 
         notify_new_macs, notify_unauthorized_macs, notify_ip_changes, retention_policy, 
         retention_days, status)
        VALUES 
        (@id, @name, @network_interface, @subnet, @execution_time, @schedule, @notifications_enabled,
         @notify_new_macs, @notify_unauthorized_macs, @notify_ip_changes, @retention_policy,
         @retention_days, @status)
      `);
      stmt.run(jobData);

      // Clear existing whitelist
      const clearWhitelist = db.prepare('DELETE FROM job_whitelist WHERE job_id = ?');
      clearWhitelist.run(this.id);

      // Insert new whitelist entries
      if (this.whitelist && this.whitelist.length > 0) {
        const insertWhitelist = db.prepare(`
          INSERT INTO job_whitelist (id, job_id, mac_address) 
          VALUES (?, ?, ?)
        `);
        
        for (const mac of this.whitelist) {
          insertWhitelist.run(uuidv4(), this.id, mac);
        }
      }
    });

    transaction();
    return this;
  }

  static async findById(id) {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM jobs WHERE id = ?');
    const jobData = stmt.get(id);
    
    if (!jobData) return null;

    // Get whitelist
    const whitelistStmt = db.prepare('SELECT mac_address FROM job_whitelist WHERE job_id = ?');
    const whitelist = whitelistStmt.all(id).map(row => row.mac_address);

    return {
      ...jobData,
      notifications_enabled: Boolean(jobData.notifications_enabled),
      notify_new_macs: Boolean(jobData.notify_new_macs),
      notify_unauthorized_macs: Boolean(jobData.notify_unauthorized_macs),
      notify_ip_changes: Boolean(jobData.notify_ip_changes),
      whitelist
    };
  }

  static async findAll() {
    const db = getDatabase();
    const stmt = db.prepare('SELECT * FROM jobs ORDER BY created_at DESC');
    const jobs = stmt.all();

    // Get whitelist for each job
    const whitelistStmt = db.prepare('SELECT mac_address FROM job_whitelist WHERE job_id = ?');
    
    return jobs.map(job => ({
      ...job,
      notifications_enabled: Boolean(job.notifications_enabled),
      notify_new_macs: Boolean(job.notify_new_macs),
      notify_unauthorized_macs: Boolean(job.notify_unauthorized_macs),
      notify_ip_changes: Boolean(job.notify_ip_changes),
      whitelist: whitelistStmt.all(job.id).map(row => row.mac_address)
    }));
  }

  static async delete(id) {
    const db = getDatabase();
    const stmt = db.prepare('DELETE FROM jobs WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  static async updateStatus(id, status) {
    const db = getDatabase();
    const stmt = db.prepare('UPDATE jobs SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
    stmt.run(status, id);
  }

  static async updateLastRun(id, timestamp = null) {
    const db = getDatabase();
    const stmt = db.prepare('UPDATE jobs SET last_run = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
    stmt.run(timestamp || new Date().toISOString(), id);
  }

  static async getScheduledJobs() {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT * FROM jobs 
      WHERE status = 'active' 
      AND schedule != 'manual' 
      AND (next_run IS NULL OR next_run <= CURRENT_TIMESTAMP)
    `);
    return stmt.all();
  }
}