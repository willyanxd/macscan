import React from 'react';
import { 
  Activity, 
  Shield, 
  AlertTriangle, 
  CheckCircle,
  Clock,
  Network,
  TrendingUp
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { format, formatDistanceToNow } from 'date-fns';

function Dashboard() {
  const { jobs, notifications } = useApp();
  
  const activeJobs = jobs.filter(job => job.status === 'active').length;
  const runningJobs = jobs.filter(job => job.status === 'running').length;
  const unreadNotifications = notifications.filter(n => !n.read).length;
  const warningNotifications = notifications.filter(n => n.type === 'warning' && !n.read).length;

  const stats = [
    {
      label: 'Active Jobs',
      value: activeJobs,
      icon: Network,
      color: 'neon-cyan',
      trend: '+12% from last week'
    },
    {
      label: 'Running Scans',
      value: runningJobs,
      icon: Activity,
      color: 'neon-green',
      trend: 'Real-time monitoring'
    },
    {
      label: 'New Alerts',
      value: unreadNotifications,
      icon: Shield,
      color: 'neon-orange',
      trend: `${warningNotifications} warnings`
    }
  ];

  const recentNotifications = notifications
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);

  const recentJobs = jobs
    .filter(job => job.last_run)
    .sort((a, b) => new Date(b.last_run!).getTime() - new Date(a.last_run!).getTime())
    .slice(0, 5);

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Welcome Section */}
      <div className="bg-gradient-to-r from-dark-900 to-dark-800 rounded-xl p-6 border border-dark-700">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white mb-2">
              Network Monitoring Dashboard
            </h1>
            <p className="text-dark-300">
              Monitor your network in real-time with advanced ARP scanning capabilities
            </p>
          </div>
          <div className="text-right">
            <div className="text-sm text-dark-400">Last Updated</div>
            <div className="text-neon-cyan font-mono">
              {format(new Date(), 'HH:mm:ss')}
            </div>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="bg-dark-900 rounded-xl p-6 border border-dark-700 hover:border-dark-600 transition-all duration-300 animate-slide-up"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className="flex items-center justify-between mb-4">
                <div className={`p-3 rounded-lg bg-${stat.color}/10 border border-${stat.color}/20`}>
                  <Icon className={`w-6 h-6 text-${stat.color}`} />
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-white">{stat.value}</div>
                  <div className="text-sm text-dark-400">{stat.label}</div>
                </div>
              </div>
              <div className="text-xs text-dark-500">{stat.trend}</div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Recent Notifications */}
        <div className="bg-dark-900 rounded-xl p-6 border border-dark-700">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-white">Recent Notifications</h3>
            <span className="text-sm text-dark-400">{notifications.length} total</span>
          </div>
          
          <div className="space-y-4">
            {recentNotifications.length > 0 ? (
              recentNotifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`p-4 rounded-lg border transition-all duration-200 ${
                    notification.read
                      ? 'bg-dark-800 border-dark-600'
                      : notification.type === 'warning'
                      ? 'bg-neon-orange/5 border-neon-orange/20'
                      : 'bg-neon-cyan/5 border-neon-cyan/20'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-3">
                      <div className={`p-1 rounded ${
                        notification.type === 'warning' 
                          ? 'bg-neon-orange/20 text-neon-orange'
                          : 'bg-neon-cyan/20 text-neon-cyan'
                      }`}>
                        {notification.type === 'warning' ? (
                          <AlertTriangle className="w-4 h-4" />
                        ) : (
                          <CheckCircle className="w-4 h-4" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">
                          {notification.message}
                        </p>
                        <p className="text-xs text-dark-400 mt-1">
                          Job: {notification.job_name} • MAC: {notification.mac_address}
                        </p>
                      </div>
                    </div>
                    <div className="text-xs text-dark-500">
                      {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-dark-400">
                <Shield className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No notifications yet</p>
              </div>
            )}
          </div>
        </div>

        {/* Recent Job Activity */}
        <div className="bg-dark-900 rounded-xl p-6 border border-dark-700">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-white">Recent Job Activity</h3>
            <span className="text-sm text-dark-400">{jobs.length} jobs</span>
          </div>
          
          <div className="space-y-4">
            {recentJobs.length > 0 ? (
              recentJobs.map((job) => (
                <div
                  key={job.id}
                  className="p-4 rounded-lg bg-dark-800 border border-dark-600 hover:border-dark-500 transition-all duration-200"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className={`w-3 h-3 rounded-full ${
                        job.status === 'active' ? 'bg-neon-green animate-pulse' :
                        job.status === 'running' ? 'bg-neon-cyan animate-pulse' :
                        'bg-dark-500'
                      }`}></div>
                      <div>
                        <p className="font-medium text-white">{job.name}</p>
                        <p className="text-sm text-dark-400">
                          {job.network_interface} • {job.subnet}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-dark-500">Last run</div>
                      <div className="text-sm text-white font-mono">
                        {job.last_run && formatDistanceToNow(new Date(job.last_run), { addSuffix: true })}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-dark-400">
                <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No job activity yet</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;