import React from 'react';
import { Link } from 'react-router-dom';
import { 
  Plus, 
  Play, 
  Pause, 
  Trash2, 
  Edit3,
  Network,
  Clock,
  Activity,
  Shield,
  Settings
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { format, formatDistanceToNow } from 'date-fns';

function Jobs() {
  const { jobs, runJob, deleteJob } = useApp();

  const handleRunJob = async (jobId: string) => {
    await runJob(jobId);
  };

  const handleDeleteJob = async (jobId: string) => {
    if (window.confirm('Are you sure you want to delete this job? This action cannot be undone.')) {
      await deleteJob(jobId);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'neon-green';
      case 'running': return 'neon-cyan';
      case 'inactive': return 'dark-500';
      default: return 'dark-500';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'active': return 'Active';
      case 'running': return 'Running';
      case 'inactive': return 'Inactive';
      default: return 'Unknown';
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Job Management</h1>
          <p className="text-dark-400 mt-1">Create and manage your network monitoring jobs</p>
        </div>
        <Link
          to="/jobs/create"
          className="flex items-center space-x-2 px-4 py-2 bg-neon-cyan text-dark-950 rounded-lg hover:bg-neon-cyan/90 transition-colors font-medium"
        >
          <Plus className="w-4 h-4" />
          <span>Create Job</span>
        </Link>
      </div>

      {/* Jobs Grid */}
      {jobs.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {jobs.map((job, index) => (
            <div
              key={job.id}
              className="bg-dark-900 rounded-xl p-6 border border-dark-700 hover:border-dark-600 transition-all duration-300 animate-slide-up"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              {/* Job Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className={`w-3 h-3 rounded-full bg-${getStatusColor(job.status)} ${job.status === 'running' ? 'animate-pulse' : ''}`}></div>
                  <div>
                    <h3 className="font-semibold text-white">{job.name}</h3>
                    <p className="text-sm text-dark-400">{getStatusText(job.status)}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <Link
                    to={`/jobs/${job.id}`}
                    className="p-1 rounded hover:bg-dark-700 transition-colors"
                  >
                    <Settings className="w-4 h-4 text-dark-400 hover:text-white" />
                  </Link>
                  <button
                    onClick={() => handleDeleteJob(job.id)}
                    className="p-1 rounded hover:bg-dark-700 transition-colors"
                  >
                    <Trash2 className="w-4 h-4 text-dark-400 hover:text-neon-orange" />
                  </button>
                </div>
              </div>

              {/* Job Details */}
              <div className="space-y-3 mb-4">
                <div className="flex items-center space-x-2 text-sm">
                  <Network className="w-4 h-4 text-neon-cyan" />
                  <span className="text-dark-300">{job.network_interface}</span>
                  <span className="text-dark-500">•</span>
                  <span className="text-dark-300">{job.subnet}</span>
                </div>
                
                <div className="flex items-center space-x-2 text-sm">
                  <Clock className="w-4 h-4 text-neon-purple" />
                  <span className="text-dark-300">
                    {job.schedule === 'manual' ? 'Manual execution' : `Every ${job.schedule}`}
                  </span>
                </div>

                {job.last_run && (
                  <div className="flex items-center space-x-2 text-sm">
                    <Activity className="w-4 h-4 text-neon-green" />
                    <span className="text-dark-300">
                      Last run: {formatDistanceToNow(new Date(job.last_run), { addSuffix: true })}
                    </span>
                  </div>
                )}

                <div className="flex items-center space-x-2 text-sm">
                  <Shield className="w-4 h-4 text-neon-orange" />
                  <span className="text-dark-300">
                    Notifications: {job.notifications_enabled ? 'Enabled' : 'Disabled'}
                  </span>
                </div>
              </div>

              {/* Job Actions */}
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleRunJob(job.id)}
                  disabled={job.status === 'running'}
                  className="flex items-center space-x-2 px-3 py-2 bg-neon-cyan/10 border border-neon-cyan/20 rounded-lg hover:bg-neon-cyan/20 transition-colors text-neon-cyan text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Play className="w-4 h-4" />
                  <span>{job.status === 'running' ? 'Running...' : 'Run Now'}</span>
                </button>
                
                <Link
                  to={`/jobs/${job.id}`}
                  className="flex items-center space-x-2 px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg hover:bg-dark-700 transition-colors text-white text-sm font-medium"
                >
                  <Edit3 className="w-4 h-4" />
                  <span>Details</span>
                </Link>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-16">
          <div className="w-16 h-16 bg-dark-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <Network className="w-8 h-8 text-dark-400" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">No jobs created yet</h3>
          <p className="text-dark-400 mb-6">Create your first monitoring job to start scanning your network</p>
          <Link
            to="/jobs/create"
            className="inline-flex items-center space-x-2 px-6 py-3 bg-neon-cyan text-dark-950 rounded-lg hover:bg-neon-cyan/90 transition-colors font-medium"
          >
            <Plus className="w-4 h-4" />
            <span>Create First Job</span>
          </Link>
        </div>
      )}
    </div>
  );
}

export default Jobs;