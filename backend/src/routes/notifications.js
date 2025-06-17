import express from 'express';
import { NotificationService } from '../services/NotificationService.js';

const router = express.Router();
const notificationService = new NotificationService();

// Get all notifications
router.get('/', async (req, res) => {
  try {
    const options = {
      unreadOnly: req.query.unread === 'true',
      jobId: req.query.jobId,
      type: req.query.type,
      limit: req.query.limit ? parseInt(req.query.limit, 10) : undefined
    };

    const notifications = await notificationService.getNotifications(options);
    res.json(notifications);
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ message: 'Failed to fetch notifications' });
  }
});

// Mark notification as read
router.patch('/:id/read', async (req, res) => {
  try {
    const success = await notificationService.markAsRead(req.params.id);
    if (!success) {
      return res.status(404).json({ message: 'Notification not found' });
    }
    
    res.json({ message: 'Notification marked as read' });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({ message: 'Failed to mark notification as read' });
  }
});

// Delete notification
router.delete('/:id', async (req, res) => {
  try {
    const success = await notificationService.deleteNotification(req.params.id);
    if (!success) {
      return res.status(404).json({ message: 'Notification not found' });
    }
    
    res.json({ message: 'Notification deleted successfully' });
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({ message: 'Failed to delete notification' });
  }
});

// Mark all notifications as read for a job
router.patch('/job/:jobId/read-all', async (req, res) => {
  try {
    const count = await notificationService.markAllAsReadForJob(req.params.jobId);
    res.json({ message: `${count} notifications marked as read` });
  } catch (error) {
    console.error('Error marking notifications as read:', error);
    res.status(500).json({ message: 'Failed to mark notifications as read' });
  }
});

// Get notification statistics
router.get('/stats', async (req, res) => {
  try {
    const stats = await notificationService.getStatistics();
    res.json(stats);
  } catch (error) {
    console.error('Error fetching notification statistics:', error);
    res.status(500).json({ message: 'Failed to fetch notification statistics' });
  }
});

// Cleanup old notifications
router.delete('/cleanup', async (req, res) => {
  try {
    const days = req.query.days ? parseInt(req.query.days, 10) : 30;
    const count = await notificationService.cleanupOldNotifications(days);
    res.json({ message: `${count} old notifications cleaned up` });
  } catch (error) {
    console.error('Error cleaning up notifications:', error);
    res.status(500).json({ message: 'Failed to cleanup notifications' });
  }
});

export default router;