import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  Network, 
  Activity, 
  Bell,
  Shield
} from 'lucide-react';
import { useApp } from '../context/AppContext';

interface LayoutProps {
  children: React.ReactNode;
}

function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const { notifications } = useApp();
  
  const unreadCount = notifications.filter(n => !n.read).length;
  
  const navItems = [
    { path: '/', label: 'Dashboard', icon: Activity },
    { path: '/jobs', label: 'Jobs', icon: Network },
    { path: '/notifications', label: 'Notifications', icon: Bell, badge: unreadCount },
  ];

  return (
    <div className="flex h-screen bg-dark-950">
      {/* Sidebar */}
      <div className="w-64 bg-dark-900 border-r border-dark-700">
        <div className="p-6">
          {/* Logo */}
          <div className="flex items-center space-x-3 mb-8">
            <div className="w-10 h-10 bg-gradient-to-r from-neon-cyan to-neon-purple rounded-lg flex items-center justify-center">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">ARP Monitor</h1>
              <p className="text-xs text-dark-400">Network Guardian</p>
            </div>
          </div>

          {/* Navigation */}
          <nav className="space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center justify-between px-4 py-3 rounded-lg transition-all duration-200 ${
                    isActive
                      ? 'bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/20 shadow-lg'
                      : 'text-dark-300 hover:text-white hover:bg-dark-800'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <Icon className="w-5 h-5" />
                    <span className="font-medium">{item.label}</span>
                  </div>
                  {item.badge && item.badge > 0 && (
                    <span className="w-5 h-5 bg-neon-orange rounded-full flex items-center justify-center text-xs font-bold text-white animate-pulse-neon">
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Top Bar */}
        <header className="bg-dark-900 border-b border-dark-700 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">
                {location.pathname === '/' && 'Dashboard Overview'}
                {location.pathname === '/jobs' && 'Job Management'}
                {location.pathname === '/notifications' && 'Notifications'}
                {location.pathname.startsWith('/jobs/') && location.pathname.endsWith('/edit') && 'Edit Job'}
                {location.pathname.startsWith('/jobs/') && !location.pathname.endsWith('/edit') && !location.pathname.endsWith('/create') && 'Job Details'}
                {location.pathname === '/jobs/create' && 'Create New Job'}
              </h2>
              <p className="text-sm text-dark-400">
                Real-time network monitoring and device tracking
              </p>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <main className="flex-1 overflow-auto bg-dark-950 p-6">
          {children}
        </main>
      </div>
    </div>
  );
}

export default Layout;