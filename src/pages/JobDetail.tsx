import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  Play, 
  Edit3, 
  Trash2,
  Network,
  Clock,
  Shield,
  Activity,
  AlertTriangle,
  CheckCircle,
  X,
  UserX
} from 'lucide-react';
import { api } from '../services/api';
import { useApp } from '../context/AppContext';
import { format, formatDistanceToNow } from 'date-fns';
import toast from 'react-hot-toast';

interface JobDetails {
  id: string;
  name: string;
  network_interface: string;
  subnet: string;
  execution_time: number;
  schedule: string;
  notifications_enabled: boolean;
  retention_policy: string;
  retention_days: number;
  status: string;
  created_at: string;
  last_run: string | null;
  next_run: string | null;
  whitelist: string[];
}

interface JobRun {
  id: string;
  job_id: string;
  status: string;
  devices_found: number;
  new_devices: number;
  warnings: number;
  started_at: string;
  finished_at: string | null;
  duration: number | null;
}

interface KnownDevice {
  id: string;
  job_id: string;
  mac_address: string;
  ip_address: string;
  vendor: string;
  whitelisted: boolean;
  first_seen: string;
  last_seen: string;
  status: 'active' | 'inactive';
}

function JobDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { runJob, deleteJob } = useApp();
  
  const [job, setJob] = useState<JobDetails | null>(null);
  const [jobRuns, setJobRuns] = useState<JobRun[]>([]);
  const [knownDevices, setKnownDevices] = useState<KnownDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'runs' | 'devices'>('overview');

  useEffect(() => {
    if (id) {
      fetchJobDetails();
      fetchJobRuns();
      fetchKnownDevices();
    }
  }, [id]);

  const fetchJobDetails = async () => {
    try {
      const response = await api.get(`/jobs/${id}`);
      setJob(response.data);
    } catch (error) {
      toast.error('Failed to fetch job details');
      navigate('/jobs');
    }
  };

  const fetchJobRuns = async () => {
    try {
      const response = await api.get(`/jobs/${id}/runs`);
      setJobRuns(response.data);
    } catch (error) {
      console.error('Failed to fetch job runs:', error);
    }
  };

  const fetchKnownDevices = async () => {
    try {
      const response = await api.get(`/jobs/${id}/devices`);
      setKnownDevices(response.data);
    } catch (error) {
      console.error('Failed to fetch known devices:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRunJob = async () => {
    if (id) {
      await runJob(id);
      fetchJobDetails();
      fetchJobRuns();
    }
  };

  const handleDeleteJob = async () => {
    if (id && window.confirm('Are you sure you want to delete this job? This action cannot be undone.')) {
      await deleteJob(id);
      navigate('/jobs');
    }
  };

  const handleRemoveDevice = async (deviceId: string, macAddress: string) => {
    if (window.confirm(`Are you sure you want to remove device ${macAddress} from known devices?`)) {
      try {
        await api.delete(`/jobs/${id}/devices/${deviceId}`);
        await fetchKnownDevices();
        toast.success('Device removed successfully');
      } catch (error) {
        toast.error('Failed to remove device');
      }
    }
  };

  const handleAddToWhitelist = async (macAddress: string) => {
    try {
      const updatedWhitelist = [...(job?.whitelist || []), macAddress];
      await api.put(`/jobs/${id}`, { 
        ...job, 
        whitelist: updatedWhitelist 
      });
      await fetchJobDetails();
      await fetchKnownDevices();
      toast.success('Device added to whitelist');
    } catch (error) {
      toast.error('Failed to add device to whitelist');
    }
  };

  const handleRemoveFromWhitelist = async (macAddress: string) => {
    try {
      const updatedWhitelist = (job?.whitelist || []).filter(mac => mac !== macAddress);
      await api.put(`/jobs/${id}`, { 
        ...job, 
        whitelist: updatedWhitelist 
      });
      await fetchJobDetails();
      await fetchKnownDevices();
      toast.success('Device removed from whitelist');
    } catch (error) {
      toast.error('Failed to remove device from whitelist');
    }
  };

  if (loading || !job) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-neon-cyan"></div>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'neon-green';
      case 'running': return 'neon-cyan';
      case 'inactive': return 'dark-500';
      case 'completed': return 'neon-green';
      case 'failed': return 'neon-orange';
      default: return 'dark-500';
    }
  };

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Activity },
    { id: 'runs', label: 'Run History', icon: Clock },
    { id: 'devices', label: 'Known Devices', icon: Network }
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate('/jobs')}
            className="p-2 rounded-lg bg-dark-800 hover:bg-dark-700 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-white">{job.name}</h1>
            <p className="text-dark-400">Job Details & Management</p>
          </div>
        </div>
        
        <div className="flex items-center space-x-3">
          <button
            onClick={handleRunJob}
            disabled={job.status === 'running'}
            className="flex items-center space-x-2 px-4 py-2 bg-neon-cyan/10 border border-neon-cyan/20 rounded-lg hover:bg-neon-cyan/20 transition-colors text-neon-cyan font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Play className="w-4 h-4" />
            <span>{job.status === 'running' ? 'Running...' : 'Run Now'}</span>
          </button>
          
          <button 
            onClick={() => navigate(`/jobs/${id}/edit`)}
            className="flex items-center space-x-2 px-4 py-2 bg-dark-800 border border-dark-600 rounded-lg hover:bg-dark-700 transition-colors text-white font-medium"
          >
            <Edit3 className="w-4 h-4" />
            <span>Edit</span>
          </button>
          
          <button
            onClick={handleDeleteJob}
            className="flex items-center space-x-2 px-4 py-2 bg-neon-orange/10 border border-neon-orange/20 rounded-lg hover:bg-neon-orange/20 transition-colors text-neon-orange font-medium"
          >
            <Trash2 className="w-4 h-4" />
            <span>Delete</span>
          </button>
        </div>
      </div>

      {/* Job Status Card */}
      <div className="bg-dark-900 rounded-xl p-6 border border-dark-700">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="flex items-center space-x-3">
            <div className={`w-3 h-3 rounded-full bg-${getStatusColor(job.status)} ${job.status === 'running' ? 'animate-pulse' : ''}`}></div>
            <div>
              <p className="text-sm text-dark-400">Status</p>
              <p className="font-semibold text-white capitalize">{job.status}</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-3">
            <Network className="w-5 h-5 text-neon-cyan" />
            <div>
              <p className="text-sm text-dark-400">Network</p>
              <p className="font-semibold text-white">{job.network_interface} • {job.subnet}</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-3">
            <Clock className="w-5 h-5 text-neon-purple" />
            <div>
              <p className="text-sm text-dark-400">Schedule</p>
              <p className="font-semibold text-white">
                {job.schedule === 'manual' ? 'Manual' : `Every ${job.schedule}`}
              </p>
            </div>
          </div>
          
          <div className="flex items-center space-x-3">
            <Shield className="w-5 h-5 text-neon-green" />
            <div>
              <p className="text-sm text-dark-400">Notifications</p>
              <p className="font-semibold text-white">
                {job.notifications_enabled ? 'Enabled' : 'Disabled'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-dark-900 rounded-xl border border-dark-700">
        <div className="flex border-b border-dark-700">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center space-x-2 px-6 py-4 font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'text-neon-cyan border-b-2 border-neon-cyan'
                    : 'text-dark-400 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div className="p-6">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Configuration */}
              <div>
                <h3 className="text-lg font-semibold text-white mb-4">Configuration</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <p className="text-sm text-dark-400">Execution Time</p>
                    <p className="text-white">{job.execution_time} seconds</p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm text-dark-400">Retention Policy</p>
                    <p className="text-white">
                      {job.retention_policy === 'forever' ? 'Keep forever' :
                       job.retention_policy === 'days' ? `Keep for ${job.retention_days} days` :
                       'Remove immediately'}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm text-dark-400">Created</p>
                    <p className="text-white">{format(new Date(job.created_at), 'PPP')}</p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm text-dark-400">Last Run</p>
                    <p className="text-white">
                      {job.last_run ? formatDistanceToNow(new Date(job.last_run), { addSuffix: true }) : 'Never'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Whitelist */}
              <div>
                <h3 className="text-lg font-semibold text-white mb-4">Whitelist ({job.whitelist.length} devices)</h3>
                {job.whitelist.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                    {job.whitelist.map((mac, index) => (
                      <div key={index} className="flex items-center justify-between bg-dark-800 px-3 py-2 rounded-lg">
                        <span className="text-white font-mono text-sm">{mac}</span>
                        <button
                          onClick={() => handleRemoveFromWhitelist(mac)}
                          className="text-neon-orange hover:text-neon-orange/80 transition-colors"
                          title="Remove from whitelist"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-dark-400">No devices in whitelist</p>
                )}
              </div>
            </div>
          )}

          {activeTab === 'runs' && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white">Run History</h3>
              {jobRuns.length > 0 ? (
                <div className="space-y-3">
                  {jobRuns.map((run) => (
                    <div key={run.id} className="bg-dark-800 rounded-lg p-4 border border-dark-600">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                          <div className={`w-3 h-3 rounded-full bg-${getStatusColor(run.status)}`}></div>
                          <div>
                            <p className="font-medium text-white capitalize">{run.status}</p>
                            <p className="text-sm text-dark-400">
                              {format(new Date(run.started_at), 'PPP p')}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="flex items-center space-x-4 text-sm">
                            <span className="text-neon-cyan">{run.devices_found} devices</span>
                            <span className="text-neon-green">{run.new_devices} new</span>
                            <span className="text-neon-orange">{run.warnings} warnings</span>
                          </div>
                          {run.duration && (
                            <p className="text-xs text-dark-500 mt-1">
                              Duration: {run.duration}s
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-dark-400">No runs yet</p>
              )}
            </div>
          )}

          {activeTab === 'devices' && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-white">Known Devices ({knownDevices.length})</h3>
              {knownDevices.length > 0 ? (
                <div className="space-y-3">
                  {knownDevices.map((device) => (
                    <div key={device.id} className="bg-dark-800 rounded-lg p-4 border border-dark-600">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                          <div className={`w-3 h-3 rounded-full bg-${device.status === 'active' ? 'neon-green' : 'dark-500'}`}></div>
                          <div>
                            <p className="font-mono text-white">{device.mac_address}</p>
                            <p className="text-sm text-dark-400">{device.ip_address} • {device.vendor || 'Unknown vendor'}</p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-4">
                          <div className="text-right">
                            <div className="flex items-center space-x-2">
                              {device.whitelisted ? (
                                <span className="inline-flex items-center px-2 py-1 rounded text-xs bg-neon-green/10 text-neon-green border border-neon-green/20">
                                  <CheckCircle className="w-3 h-3 mr-1" />
                                  Whitelisted
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-1 rounded text-xs bg-neon-orange/10 text-neon-orange border border-neon-orange/20">
                                  <AlertTriangle className="w-3 h-3 mr-1" />
                                  Unauthorized
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-dark-500 mt-1">
                              Last seen: {formatDistanceToNow(new Date(device.last_seen), { addSuffix: true })}
                            </p>
                          </div>
                          <div className="flex items-center space-x-2">
                            {!device.whitelisted ? (
                              <button
                                onClick={() => handleAddToWhitelist(device.mac_address)}
                                className="p-1 rounded hover:bg-dark-700 transition-colors"
                                title="Add to whitelist"
                              >
                                <CheckCircle className="w-4 h-4 text-neon-green hover:text-neon-green/80" />
                              </button>
                            ) : (
                              <button
                                onClick={() => handleRemoveFromWhitelist(device.mac_address)}
                                className="p-1 rounded hover:bg-dark-700 transition-colors"
                                title="Remove from whitelist"
                              >
                                <X className="w-4 h-4 text-neon-orange hover:text-neon-orange/80" />
                              </button>
                            )}
                            <button
                              onClick={() => handleRemoveDevice(device.id, device.mac_address)}
                              className="p-1 rounded hover:bg-dark-700 transition-colors"
                              title="Remove device"
                            >
                              <UserX className="w-4 h-4 text-neon-orange hover:text-neon-orange/80" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-dark-400">No devices discovered yet</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default JobDetail;