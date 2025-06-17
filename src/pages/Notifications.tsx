import React, { useState } from 'react';
import { 
  Bell, 
  AlertTriangle, 
  CheckCircle, 
  Trash2, 
  Check,
  Filter,
  X
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';
import { format, formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';

function Notifications() {
  const { notifications, fetchNotifications } = useApp();
  const [filter, setFilter] = useState<'all' | 'unread' | 'warning' | 'information'>('all');
  const [selectedNotifications, setSelectedNotifications] = useState<string[]>([]);

  const filteredNotifications = notifications.filter(notification => {
    switch (filter) {
      case 'unread':
        return !notification.read;
      case 'warning':
        return notification.type === 'warning';
      case 'information':
        return notification.type === 'information';
      default:
        return true;
    }
  }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const handleMarkAsRead = async (id: string) => {
    try {
      await api.patch(`/notifications/${id}/read`);
      await fetchNotifications();
      toast.success('Notification marked as read');
    } catch (error) {
      toast.error('Failed to mark notification as read');
    }
  };

  const handleDeleteNotification = async (id: string) => {
    try {
      await api.delete(`/notifications/${id}`);
      await fetchNotifications();
      toast.success('Notification deleted');
    } catch (error) {
      toast.error('Failed to delete notification');
    }
  };

  const handleBulkMarkAsRead = async () => {
    try {
      await Promise.all(
        selectedNotifications.map(id => api.patch(`/notifications/${id}/read`))
      );
      await fetchNotifications();
      setSelectedNotifications([]);
      toast.success(`${selectedNotifications.length} notifications marked as read`);
    } catch (error) {
      toast.error('Failed to mark notifications as read');
    }
  };

  const handleBulkDelete = async () => {
    if (window.confirm(`Are you sure you want to delete ${selectedNotifications.length} notifications?`)) {
      try {
        await Promise.all(
          selectedNotifications.map(id => api.delete(`/notifications/${id}`))
        );
        await fetchNotifications();
        setSelectedNotifications([]);
        toast.success(`${selectedNotifications.length} notifications deleted`);
      } catch (error) {
        toast.error('Failed to delete notifications');
      }
    }
  };

  const handleSelectNotification = (id: string) => {
    setSelectedNotifications(prev => 
      prev.includes(id) 
        ? prev.filter(nId => nId !== id)
        : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedNotifications.length === filteredNotifications.length) {
      setSelectedNotifications([]);
    } else {
      setSelectedNotifications(filteredNotifications.map(n => n.id));
    }
  };

  const unreadCount = notifications.filter(n => !n.read).length;
  const warningCount = notifications.filter(n => n.type === 'warning' && !n.read).length;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Notifications</h1>
          <p className="text-dark-400 mt-1">
            {unreadCount} unread notifications • {warningCount} warnings
          </p>
        </div>
        
        {selectedNotifications.length > 0 && (
          <div className="flex items-center space-x-3">
            <button
              onClick={handleBulkMarkAsRead}
              className="flex items-center space-x-2 px-4 py-2 bg-neon-cyan/10 border border-neon-cyan/20 rounded-lg hover:bg-neon-cyan/20 transition-colors text-neon-cyan font-medium"
            >
              <Check className="w-4 h-4" />
              <span>Mark as Read ({selectedNotifications.length})</span>
            </button>
            <button
              onClick={handleBulkDelete}
              className="flex items-center space-x-2 px-4 py-2 bg-neon-orange/10 border border-neon-orange/20 rounded-lg hover:bg-neon-orange/20 transition-colors text-neon-orange font-medium"
            >
              <Trash2 className="w-4 h-4" />
              <span>Delete ({selectedNotifications.length})</span>
            </button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="bg-dark-900 rounded-xl p-4 border border-dark-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Filter className="w-5 h-5 text-dark-400" />
            <div className="flex space-x-2">
              {[
                { key: 'all', label: 'All', count: notifications.length },
                { key: 'unread', label: 'Unread', count: unreadCount },
                { key: 'warning', label: 'Warnings', count: notifications.filter(n => n.type === 'warning').length },
                { key: 'information', label: 'Information', count: notifications.filter(n => n.type === 'information').length }
              ].map((filterOption) => (
                <button
                  key={filterOption.key}
                  onClick={() => setFilter(filterOption.key as any)}
                  className={`px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                    filter === filterOption.key
                      ? 'bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/30'
                      : 'bg-dark-800 text-dark-300 hover:text-white hover:bg-dark-700'
                  }`}
                >
                  {filterOption.label} ({filterOption.count})
                </button>
              ))}
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={selectedNotifications.length === filteredNotifications.length && filteredNotifications.length > 0}
              onChange={handleSelectAll}
              className="w-4 h-4 text-neon-cyan bg-dark-800 border-dark-600 rounded focus:ring-neon-cyan"
            />
            <span className="text-sm text-dark-400">Select All</span>
          </div>
        </div>
      </div>

      {/* Notifications List */}
      <div className="space-y-3">
        {filteredNotifications.length > 0 ? (
          filteredNotifications.map((notification) => (
            <div
              key={notification.id}
              className={`bg-dark-900 rounded-xl p-4 border transition-all duration-200 ${
                notification.read
                  ? 'border-dark-700'
                  : notification.type === 'warning'
                  ? 'border-neon-orange/30 bg-neon-orange/5'
                  : 'border-neon-cyan/30 bg-neon-cyan/5'
              } ${
                selectedNotifications.includes(notification.id)
                  ? 'ring-2 ring-neon-cyan/50'
                  : ''
              }`}
            >
              <div className="flex items-start space-x-4">
                <input
                  type="checkbox"
                  checked={selectedNotifications.includes(notification.id)}
                  onChange={() => handleSelectNotification(notification.id)}
                  className="w-4 h-4 text-neon-cyan bg-dark-800 border-dark-600 rounded focus:ring-neon-cyan mt-1"
                />
                
                <div className={`p-2 rounded-lg ${
                  notification.type === 'warning' 
                    ? 'bg-neon-orange/20 text-neon-orange'
                    : 'bg-neon-cyan/20 text-neon-cyan'
                }`}>
                  {notification.type === 'warning' ? (
                    <AlertTriangle className="w-5 h-5" />
                  ) : (
                    <CheckCircle className="w-5 h-5" />
                  )}
                </div>
                
                <div className="flex-1">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className={`font-medium ${notification.read ? 'text-dark-300' : 'text-white'}`}>
                        {notification.message}
                      </p>
                      <div className="flex items-center space-x-4 mt-2 text-sm text-dark-400">
                        <span>Job: {notification.job_name}</span>
                        <span>MAC: {notification.mac_address}</span>
                        <span>IP: {notification.ip_address}</span>
                      </div>
                      <p className="text-xs text-dark-500 mt-1">
                        {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })} • 
                        {format(new Date(notification.created_at), 'PPP p')}
                      </p>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      {!notification.read && (
                        <button
                          onClick={() => handleMarkAsRead(notification.id)}
                          className="p-1 rounded hover:bg-dark-700 transition-colors"
                          title="Mark as read"
                        >
                          <Check className="w-4 h-4 text-neon-cyan hover:text-neon-cyan/80" />
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteNotification(notification.id)}
                        className="p-1 rounded hover:bg-dark-700 transition-colors"
                        title="Delete notification"
                      >
                        <Trash2 className="w-4 h-4 text-neon-orange hover:text-neon-orange/80" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-dark-800 rounded-full flex items-center justify-center mx-auto mb-4">
              <Bell className="w-8 h-8 text-dark-400" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">No notifications</h3>
            <p className="text-dark-400">
              {filter === 'all' 
                ? 'No notifications yet. They will appear here when network events occur.'
                : `No ${filter} notifications found.`
              }
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default Notifications;