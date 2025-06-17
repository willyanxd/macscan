import { v4 as uuidv4 } from 'uuid';
import { getDatabase } from '../database/init.js';
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

export class NotificationService {
  /**
   * Create a new notification
   * @param {Object} notificationData - Notification data
   * @returns {Promise<string>} Notification ID
   */
  async createNotification(notificationData) {
    const db = getDatabase();
    const id = uuidv4();
    
    const stmt = db.prepare(`
      INSERT INTO notifications (id, job_id, job_name, type, message, mac_address, ip_address)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    try {
      stmt.run(
        id,
        notificationData.job_id,
        notificationData.job_name,
        notificationData.type,
        notificationData.message,
        notificationData.mac_address,
        notificationData.ip_address
      );

      logger.info(`Notification created: ${notificationData.type} - ${notificationData.message}`);
      return id;
    } catch (error) {
      logger.error('Failed to create notification:', error);
      throw error;
    }
  }

  /**
   * Get all notifications
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of notifications
   */
  async getNotifications(options = {}) {
    const db = getDatabase();
    let query = 'SELECT * FROM notifications';
    const params = [];

    if (options.unreadOnly) {
      query += ' WHERE read = 0';
    }

    if (options.jobId) {
      query += options.unreadOnly ? ' AND' : ' WHERE';
      query += ' job_id = ?';
      params.push(options.jobId);
    }

    if (options.type) {
      query += (options.unreadOnly || options.jobId) ? ' AND' : ' WHERE';
      query += ' type = ?';
      params.push(options.type);
    }

    query += ' ORDER BY created_at DESC';

    if (options.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
    }

    const stmt = db.prepare(query);
    return stmt.all(...params);
  }

  /**
   * Mark notification as read
   * @param {string} notificationId - Notification ID
   * @returns {Promise<boolean>} Success status
   */
  async markAsRead(notificationId) {
    const db = getDatabase();
    const stmt = db.prepare('UPDATE notifications SET read = 1 WHERE id = ?');
    
    try {
      const result = stmt.run(notificationId);
      return result.changes > 0;
    } catch (error) {
      logger.error('Failed to mark notification as read:', error);
      throw error;
    }
  }

  /**
   * Delete notification
   * @param {string} notificationId - Notification ID
   * @returns {Promise<boolean>} Success status
   */
  async deleteNotification(notificationId) {
    const db = getDatabase();
    const stmt = db.prepare('DELETE FROM notifications WHERE id = ?');
    
    try {
      const result = stmt.run(notificationId);
      return result.changes > 0;
    } catch (error) {
      logger.error('Failed to delete notification:', error);
      throw error;
    }
  }

  /**
   * Mark all notifications as read for a job
   * @param {string} jobId - Job ID
   * @returns {Promise<number>} Number of notifications marked as read
   */
  async markAllAsReadForJob(jobId) {
    const db = getDatabase();
    const stmt = db.prepare('UPDATE notifications SET read = 1 WHERE job_id = ? AND read = 0');
    
    try {
      const result = stmt.run(jobId);
      return result.changes;
    } catch (error) {
      logger.error('Failed to mark notifications as read for job:', error);
      throw error;
    }
  }

  /**
   * Delete old notifications
   * @param {number} daysOld - Delete notifications older than this many days
   * @returns {Promise<number>} Number of deleted notifications
   */
  async cleanupOldNotifications(daysOld = 30) {
    const db = getDatabase();
    const stmt = db.prepare(`
      DELETE FROM notifications 
      WHERE datetime(created_at) < datetime('now', '-' || ? || ' days')
    `);
    
    try {
      const result = stmt.run(daysOld);
      logger.info(`Cleaned up ${result.changes} old notifications`);
      return result.changes;
    } catch (error) {
      logger.error('Failed to cleanup old notifications:', error);
      throw error;
    }
  }

  /**
   * Get notification statistics
   * @returns {Promise<Object>} Statistics object
   */
  async getStatistics() {
    const db = getDatabase();
    
    const totalStmt = db.prepare('SELECT COUNT(*) as count FROM notifications');
    const unreadStmt = db.prepare('SELECT COUNT(*) as count FROM notifications WHERE read = 0');
    const warningsStmt = db.prepare('SELECT COUNT(*) as count FROM notifications WHERE type = "warning" AND read = 0');
    const informationStmt = db.prepare('SELECT COUNT(*) as count FROM notifications WHERE type = "information" AND read = 0');

    return {
      total: totalStmt.get().count,
      unread: unreadStmt.get().count,
      unreadWarnings: warningsStmt.get().count,
      unreadInformation: informationStmt.get().count
    };
  }
}