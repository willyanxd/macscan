import cron from 'node-cron';
import winston from 'winston';
import { getDatabase } from '../database/init.js';
import { JobRunner } from './JobRunner.js';

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

export class JobScheduler {
  constructor() {
    this.scheduledJobs = new Map();
    this.jobRunner = new JobRunner();
  }

  async initialize() {
    // Load and schedule all active jobs
    await this.loadScheduledJobs();
    
    // Start the scheduler check (runs every minute)
    cron.schedule('* * * * *', () => {
      this.checkScheduledJobs();
    });

    logger.info('Job scheduler initialized');
  }

  /**
   * Load all scheduled jobs from database
   */
  async loadScheduledJobs() {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT * FROM jobs 
      WHERE status = 'active' AND schedule != 'manual'
    `);
    
    const jobs = stmt.all();
    
    for (const job of jobs) {
      this.scheduleJob(job);
    }
    
    logger.info(`Loaded ${jobs.length} scheduled jobs`);
  }

  /**
   * Schedule a job based on its schedule configuration
   */
  scheduleJob(job) {
    if (job.schedule === 'manual') {
      return;
    }

    const cronExpression = this.getCronExpression(job.schedule);
    if (!cronExpression) {
      logger.warn(`Invalid schedule format for job ${job.name}: ${job.schedule}`);
      return;
    }

    // Remove existing schedule if it exists
    if (this.scheduledJobs.has(job.id)) {
      this.scheduledJobs.get(job.id).destroy();
    }

    // Create new scheduled task
    const task = cron.schedule(cronExpression, async () => {
      try {
        logger.info(`Running scheduled job: ${job.name}`);
        await this.jobRunner.runJob(job.id);
      } catch (error) {
        logger.error(`Scheduled job failed: ${job.name} - ${error.message}`);
      }
    }, {
      scheduled: true,
      timezone: 'UTC'
    });

    this.scheduledJobs.set(job.id, task);
    
    // Update next run time in database
    this.updateNextRunTime(job.id, job.schedule);
    
    logger.info(`Scheduled job: ${job.name} (${job.schedule})`);
  }

  /**
   * Remove a job from the scheduler
   */
  unscheduleJob(jobId) {
    if (this.scheduledJobs.has(jobId)) {
      this.scheduledJobs.get(jobId).destroy();
      this.scheduledJobs.delete(jobId);
      logger.info(`Unscheduled job: ${jobId}`);
    }
  }

  /**
   * Update job schedule
   */
  updateJobSchedule(job) {
    this.unscheduleJob(job.id);
    if (job.schedule !== 'manual' && job.status === 'active') {
      this.scheduleJob(job);
    }
  }

  /**
   * Convert schedule string to cron expression
   */
  getCronExpression(schedule) {
    const scheduleMap = {
      '1h': '0 * * * *',      // Every hour
      '6h': '0 */6 * * *',    // Every 6 hours
      '12h': '0 */12 * * *',  // Every 12 hours
      '24h': '0 0 * * *',     // Every 24 hours (daily)
      '7d': '0 0 * * 0',      // Every 7 days (weekly)
    };

    return scheduleMap[schedule] || null;
  }

  /**
   * Calculate and update next run time
   */
  updateNextRunTime(jobId, schedule) {
    const nextRun = this.calculateNextRunTime(schedule);
    if (nextRun) {
      const db = getDatabase();
      const stmt = db.prepare('UPDATE jobs SET next_run = ? WHERE id = ?');
      stmt.run(nextRun.toISOString(), jobId);
    }
  }

  /**
   * Calculate next run time based on schedule
   */
  calculateNextRunTime(schedule) {
    const now = new Date();
    const scheduleMap = {
      '1h': () => new Date(now.getTime() + 60 * 60 * 1000),
      '6h': () => new Date(now.getTime() + 6 * 60 * 60 * 1000),
      '12h': () => new Date(now.getTime() + 12 * 60 * 60 * 1000),
      '24h': () => {
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        return tomorrow;
      },
      '7d': () => {
        const nextWeek = new Date(now);
        nextWeek.setDate(nextWeek.getDate() + 7);
        nextWeek.setHours(0, 0, 0, 0);
        return nextWeek;
      }
    };

    const calculator = scheduleMap[schedule];
    return calculator ? calculator() : null;
  }

  /**
   * Check for jobs that need to be run (fallback mechanism)
   */
  async checkScheduledJobs() {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT * FROM jobs 
      WHERE status = 'active' 
      AND schedule != 'manual'
      AND (next_run IS NULL OR next_run <= datetime('now'))
    `);
    
    const jobsToRun = stmt.all();
    
    for (const job of jobsToRun) {
      // Don't run if already running
      if (this.jobRunner.isJobRunning(job.id)) {
        continue;
      }

      try {
        logger.info(`Running overdue job: ${job.name}`);
        await this.jobRunner.runJob(job.id);
        this.updateNextRunTime(job.id, job.schedule);
      } catch (error) {
        logger.error(`Overdue job failed: ${job.name} - ${error.message}`);
      }
    }
  }

  /**
   * Get scheduler status
   */
  getStatus() {
    return {
      scheduledJobsCount: this.scheduledJobs.size,
      runningJobsCount: this.jobRunner.getRunningJobs().length,
      runningJobs: this.jobRunner.getRunningJobs()
    };
  }
}