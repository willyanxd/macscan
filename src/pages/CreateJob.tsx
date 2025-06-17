import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Network, Clock, Shield, AlertTriangle, Plus, X, TestTube, Server } from 'lucide-react';
import { api } from '../services/api';
import toast from 'react-hot-toast';

interface SSHHost {
  id?: string;
  name: string;
  host: string;
  port: number;
  username: string;
  password: string;
  enabled: boolean;
  testStatus?: 'unknown' | 'success' | 'failed';
  testing?: boolean;
}

interface JobFormData {
  name: string;
  vlan_id: number | null;
  schedule: string;
  notifications_enabled: boolean;
  notify_new_macs: boolean;
  notify_unauthorized_macs: boolean;
  notify_ip_changes: boolean;
  retention_policy: string;
  retention_days: number;
  whitelist: string[];
  ssh_hosts: SSHHost[];
}

function CreateJob() {
  const navigate = useNavigate();
  
  const [formData, setFormData] = useState<JobFormData>({
    name: '',
    vlan_id: null,
    schedule: 'manual',
    notifications_enabled: true,
    notify_new_macs: true,
    notify_unauthorized_macs: true,
    notify_ip_changes: true,
    retention_policy: 'days',
    retention_days: 30,
    whitelist: [],
    ssh_hosts: []
  });

  const [newWhitelistMac, setNewWhitelistMac] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);

  const scheduleOptions = [
    { value: 'manual', label: 'Manual execution only' },
    { value: '1h', label: 'Every hour' },
    { value: '6h', label: 'Every 6 hours' },
    { value: '12h', label: 'Every 12 hours' },
    { value: '24h', label: 'Every 24 hours' },
    { value: '7d', label: 'Every week' }
  ];

  const retentionOptions = [
    { value: 'forever', label: 'Keep forever' },
    { value: 'days', label: 'Keep for specified days' },
    { value: 'remove', label: 'Remove immediately' }
  ];

  const addDebugLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setDebugLogs(prev => [...prev, `[${timestamp}] ${message}`]);
  };

  const handleInputChange = (field: keyof JobFormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    addDebugLog(`Updated ${field}: ${value}`);
  };

  const handleAddSSHHost = () => {
    const newHost: SSHHost = {
      id: `temp-${Date.now()}`,
      name: '',
      host: '',
      port: 22,
      username: '',
      password: '',
      enabled: true,
      testStatus: 'unknown'
    };
    
    setFormData(prev => ({
      ...prev,
      ssh_hosts: [...prev.ssh_hosts, newHost]
    }));
    addDebugLog('Added new SSH host configuration');
  };

  const handleUpdateSSHHost = (index: number, field: keyof SSHHost, value: any) => {
    setFormData(prev => ({
      ...prev,
      ssh_hosts: prev.ssh_hosts.map((host, i) => 
        i === index ? { ...host, [field]: value } : host
      )
    }));
    addDebugLog(`Updated SSH host ${index + 1} ${field}: ${field === 'password' ? '***' : value}`);
  };

  const handleRemoveSSHHost = (index: number) => {
    setFormData(prev => ({
      ...prev,
      ssh_hosts: prev.ssh_hosts.filter((_, i) => i !== index)
    }));
    addDebugLog(`Removed SSH host ${index + 1}`);
  };

  const handleTestSSHConnection = async (index: number) => {
    const host = formData.ssh_hosts[index];
    
    if (!host.host || !host.username || !host.password) {
      toast.error('Please fill in all SSH host fields before testing');
      return;
    }

    // Update testing status
    handleUpdateSSHHost(index, 'testing', true);
    addDebugLog(`Testing SSH connection to ${host.name || host.host}...`);

    try {
      // Create a temporary job to test the connection
      const testData = {
        name: 'temp-test',
        ssh_hosts: [host]
      };

      const response = await api.post('/jobs', testData);
      const tempJobId = response.data.id;

      try {
        const testResponse = await api.post(`/jobs/${tempJobId}/test-ssh/${host.id}`);
        
        if (testResponse.data.success) {
          handleUpdateSSHHost(index, 'testStatus', 'success');
          addDebugLog(`SSH connection test successful for ${host.name || host.host} (${testResponse.data.duration}ms)`);
          toast.success(`SSH connection successful! (${testResponse.data.duration}ms)`);
        } else {
          handleUpdateSSHHost(index, 'testStatus', 'failed');
          addDebugLog(`SSH connection test failed for ${host.name || host.host}: ${testResponse.data.error}`);
          toast.error(`SSH connection failed: ${testResponse.data.error}`);
        }
      } finally {
        // Clean up temporary job
        await api.delete(`/jobs/${tempJobId}`);
      }
    } catch (error: any) {
      handleUpdateSSHHost(index, 'testStatus', 'failed');
      const errorMessage = error.response?.data?.message || error.message;
      addDebugLog(`SSH connection test error for ${host.name || host.host}: ${errorMessage}`);
      toast.error(`Test failed: ${errorMessage}`);
    } finally {
      handleUpdateSSHHost(index, 'testing', false);
    }
  };

  const handleAddWhitelistMac = () => {
    if (newWhitelistMac && !formData.whitelist.includes(newWhitelistMac)) {
      setFormData(prev => ({
        ...prev,
        whitelist: [...prev.whitelist, newWhitelistMac]
      }));
      addDebugLog(`Added MAC to whitelist: ${newWhitelistMac}`);
      setNewWhitelistMac('');
    }
  };

  const handleRemoveWhitelistMac = (mac: string) => {
    setFormData(prev => ({
      ...prev,
      whitelist: prev.whitelist.filter(m => m !== mac)
    }));
    addDebugLog(`Removed MAC from whitelist: ${mac}`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast.error('Job name is required');
      return;
    }
    
    if (formData.ssh_hosts.length === 0) {
      toast.error('At least one SSH host is required');
      return;
    }

    // Validate SSH hosts
    for (let i = 0; i < formData.ssh_hosts.length; i++) {
      const host = formData.ssh_hosts[i];
      if (!host.name || !host.host || !host.username || !host.password) {
        toast.error(`SSH host ${i + 1}: All fields are required`);
        return;
      }
    }

    setIsSubmitting(true);
    addDebugLog('Starting job creation...');
    
    try {
      await api.post('/jobs', formData);
      addDebugLog('Job created successfully');
      toast.success('Job created successfully');
      navigate('/jobs');
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'Failed to create job';
      addDebugLog(`Job creation failed: ${errorMessage}`);
      toast.error(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center space-x-4">
        <button
          onClick={() => navigate('/jobs')}
          className="p-2 rounded-lg bg-dark-800 hover:bg-dark-700 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-white">Create New MAC Scan Job</h1>
          <p className="text-dark-400">Set up a new SSH-based MAC address scanning job</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Form */}
        <div className="lg:col-span-2 space-y-8">
          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Basic Information */}
            <div className="bg-dark-900 rounded-xl p-6 border border-dark-700">
              <div className="flex items-center space-x-3 mb-6">
                <Network className="w-5 h-5 text-neon-cyan" />
                <h2 className="text-lg font-semibold text-white">Basic Information</h2>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Job Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    className="w-full px-4 py-3 bg-dark-800 border border-dark-600 rounded-lg focus:border-neon-cyan focus:outline-none text-white placeholder-dark-400"
                    placeholder="My MAC Scanner"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    VLAN ID (Optional)
                  </label>
                  <input
                    type="number"
                    value={formData.vlan_id || ''}
                    onChange={(e) => handleInputChange('vlan_id', e.target.value ? parseInt(e.target.value) : null)}
                    className="w-full px-4 py-3 bg-dark-800 border border-dark-600 rounded-lg focus:border-neon-cyan focus:outline-none text-white placeholder-dark-400"
                    placeholder="200"
                    min="1"
                    max="4094"
                  />
                  <p className="text-xs text-dark-400 mt-1">Leave empty to scan all VLANs</p>
                </div>
              </div>
            </div>

            {/* SSH Hosts Configuration */}
            <div className="bg-dark-900 rounded-xl p-6 border border-dark-700">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-3">
                  <Server className="w-5 h-5 text-neon-purple" />
                  <h2 className="text-lg font-semibold text-white">SSH Hosts</h2>
                </div>
                <button
                  type="button"
                  onClick={handleAddSSHHost}
                  className="flex items-center space-x-2 px-3 py-2 bg-neon-cyan/10 border border-neon-cyan/20 rounded-lg hover:bg-neon-cyan/20 transition-colors text-neon-cyan font-medium"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Host</span>
                </button>
              </div>

              {formData.ssh_hosts.length === 0 ? (
                <div className="text-center py-8 text-dark-400">
                  <Server className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p>No SSH hosts configured. Add at least one host to continue.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {formData.ssh_hosts.map((host, index) => (
                    <div key={host.id} className="bg-dark-800 rounded-lg p-4 border border-dark-600">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-medium text-white">SSH Host {index + 1}</h3>
                        <div className="flex items-center space-x-2">
                          <button
                            type="button"
                            onClick={() => handleTestSSHConnection(index)}
                            disabled={host.testing || !host.host || !host.username || !host.password}
                            className={`flex items-center space-x-2 px-3 py-1 rounded-lg text-sm font-medium transition-colors ${
                              host.testStatus === 'success' 
                                ? 'bg-neon-green/10 border border-neon-green/20 text-neon-green'
                                : host.testStatus === 'failed'
                                ? 'bg-neon-orange/10 border border-neon-orange/20 text-neon-orange'
                                : 'bg-dark-700 border border-dark-600 text-white hover:bg-dark-600'
                            } disabled:opacity-50 disabled:cursor-not-allowed`}
                          >
                            <TestTube className="w-4 h-4" />
                            <span>
                              {host.testing ? 'Testing...' : 
                               host.testStatus === 'success' ? 'Connected' :
                               host.testStatus === 'failed' ? 'Failed' : 'Test'}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveSSHHost(index)}
                            className="p-1 rounded hover:bg-dark-700 transition-colors"
                          >
                            <X className="w-4 h-4 text-neon-orange hover:text-neon-orange/80" />
                          </button>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-white mb-2">
                            Host Name *
                          </label>
                          <input
                            type="text"
                            value={host.name}
                            onChange={(e) => handleUpdateSSHHost(index, 'name', e.target.value)}
                            className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg focus:border-neon-cyan focus:outline-none text-white placeholder-dark-400"
                            placeholder="Switch-01"
                            required
                          />
                        </div>
                        
                        <div>
                          <label className="block text-sm font-medium text-white mb-2">
                            IP Address *
                          </label>
                          <input
                            type="text"
                            value={host.host}
                            onChange={(e) => handleUpdateSSHHost(index, 'host', e.target.value)}
                            className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg focus:border-neon-cyan focus:outline-none text-white placeholder-dark-400"
                            placeholder="192.168.1.100"
                            required
                          />
                        </div>
                        
                        <div>
                          <label className="block text-sm font-medium text-white mb-2">
                            SSH Port
                          </label>
                          <input
                            type="number"
                            value={host.port}
                            onChange={(e) => handleUpdateSSHHost(index, 'port', parseInt(e.target.value))}
                            className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg focus:border-neon-cyan focus:outline-none text-white"
                            min="1"
                            max="65535"
                          />
                        </div>
                        
                        <div>
                          <label className="block text-sm font-medium text-white mb-2">
                            Username *
                          </label>
                          <input
                            type="text"
                            value={host.username}
                            onChange={(e) => handleUpdateSSHHost(index, 'username', e.target.value)}
                            className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg focus:border-neon-cyan focus:outline-none text-white placeholder-dark-400"
                            placeholder="admin"
                            required
                          />
                        </div>
                        
                        <div>
                          <label className="block text-sm font-medium text-white mb-2">
                            Password *
                          </label>
                          <input
                            type="password"
                            value={host.password}
                            onChange={(e) => handleUpdateSSHHost(index, 'password', e.target.value)}
                            className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg focus:border-neon-cyan focus:outline-none text-white placeholder-dark-400"
                            placeholder="••••••••"
                            required
                          />
                        </div>
                        
                        <div className="flex items-center">
                          <input
                            type="checkbox"
                            id={`enabled-${index}`}
                            checked={host.enabled}
                            onChange={(e) => handleUpdateSSHHost(index, 'enabled', e.target.checked)}
                            className="w-4 h-4 text-neon-cyan bg-dark-800 border-dark-600 rounded focus:ring-neon-cyan"
                          />
                          <label htmlFor={`enabled-${index}`} className="ml-2 text-white">
                            Enabled
                          </label>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Scheduling */}
            <div className="bg-dark-900 rounded-xl p-6 border border-dark-700">
              <div className="flex items-center space-x-3 mb-6">
                <Clock className="w-5 h-5 text-neon-purple" />
                <h2 className="text-lg font-semibold text-white">Scheduling</h2>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Schedule
                </label>
                <select
                  value={formData.schedule}
                  onChange={(e) => handleInputChange('schedule', e.target.value)}
                  className="w-full px-4 py-3 bg-dark-800 border border-dark-600 rounded-lg focus:border-neon-cyan focus:outline-none text-white"
                >
                  {scheduleOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Notifications */}
            <div className="bg-dark-900 rounded-xl p-6 border border-dark-700">
              <div className="flex items-center space-x-3 mb-6">
                <Shield className="w-5 h-5 text-neon-green" />
                <h2 className="text-lg font-semibold text-white">Notifications</h2>
              </div>
              
              <div className="space-y-4">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="notifications_enabled"
                    checked={formData.notifications_enabled}
                    onChange={(e) => handleInputChange('notifications_enabled', e.target.checked)}
                    className="w-4 h-4 text-neon-cyan bg-dark-800 border-dark-600 rounded focus:ring-neon-cyan"
                  />
                  <label htmlFor="notifications_enabled" className="ml-2 text-white">
                    Enable notifications
                  </label>
                </div>
                
                {formData.notifications_enabled && (
                  <div className="ml-6 space-y-3">
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="notify_new_macs"
                        checked={formData.notify_new_macs}
                        onChange={(e) => handleInputChange('notify_new_macs', e.target.checked)}
                        className="w-4 h-4 text-neon-cyan bg-dark-800 border-dark-600 rounded focus:ring-neon-cyan"
                      />
                      <label htmlFor="notify_new_macs" className="ml-2 text-dark-300">
                        Notify when new MACs are discovered
                      </label>
                    </div>
                    
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="notify_unauthorized_macs"
                        checked={formData.notify_unauthorized_macs}
                        onChange={(e) => handleInputChange('notify_unauthorized_macs', e.target.checked)}
                        className="w-4 h-4 text-neon-cyan bg-dark-800 border-dark-600 rounded focus:ring-neon-cyan"
                      />
                      <label htmlFor="notify_unauthorized_macs" className="ml-2 text-dark-300">
                        Notify when unauthorized MACs are detected
                      </label>
                    </div>
                    
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="notify_ip_changes"
                        checked={formData.notify_ip_changes}
                        onChange={(e) => handleInputChange('notify_ip_changes', e.target.checked)}
                        className="w-4 h-4 text-neon-cyan bg-dark-800 border-dark-600 rounded focus:ring-neon-cyan"
                      />
                      <label htmlFor="notify_ip_changes" className="ml-2 text-dark-300">
                        Notify when MACs change interfaces
                      </label>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* MAC Whitelist */}
            <div className="bg-dark-900 rounded-xl p-6 border border-dark-700">
              <div className="flex items-center space-x-3 mb-6">
                <Shield className="w-5 h-5 text-neon-orange" />
                <h2 className="text-lg font-semibold text-white">MAC Whitelist</h2>
              </div>
              
              <div className="space-y-4">
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={newWhitelistMac}
                    onChange={(e) => setNewWhitelistMac(e.target.value)}
                    className="flex-1 px-4 py-2 bg-dark-800 border border-dark-600 rounded-lg focus:border-neon-cyan focus:outline-none text-white placeholder-dark-400"
                    placeholder="Enter MAC address (e.g., 00:11:22:33:44:55)"
                  />
                  <button
                    type="button"
                    onClick={handleAddWhitelistMac}
                    className="px-4 py-2 bg-neon-cyan text-dark-950 rounded-lg hover:bg-neon-cyan/90 transition-colors"
                  >
                    Add
                  </button>
                </div>
                
                {formData.whitelist.length > 0 && (
                  <div className="space-y-2">
                    {formData.whitelist.map((mac, index) => (
                      <div key={index} className="flex items-center justify-between bg-dark-800 px-3 py-2 rounded-lg">
                        <span className="text-white font-mono">{mac}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveWhitelistMac(mac)}
                          className="text-neon-orange hover:text-neon-orange/80 transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Retention Policy */}
            <div className="bg-dark-900 rounded-xl p-6 border border-dark-700">
              <div className="flex items-center space-x-3 mb-6">
                <AlertTriangle className="w-5 h-5 text-neon-orange" />
                <h2 className="text-lg font-semibold text-white">Retention Policy</h2>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    MAC Retention Policy
                  </label>
                  <select
                    value={formData.retention_policy}
                    onChange={(e) => handleInputChange('retention_policy', e.target.value)}
                    className="w-full px-4 py-3 bg-dark-800 border border-dark-600 rounded-lg focus:border-neon-cyan focus:outline-none text-white"
                  >
                    {retentionOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                
                {formData.retention_policy === 'days' && (
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">
                      Retention Days
                    </label>
                    <input
                      type="number"
                      value={formData.retention_days}
                      onChange={(e) => handleInputChange('retention_days', parseInt(e.target.value))}
                      className="w-full px-4 py-3 bg-dark-800 border border-dark-600 rounded-lg focus:border-neon-cyan focus:outline-none text-white"
                      min="1"
                      max="365"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Submit Button */}
            <div className="flex items-center justify-end space-x-4">
              <button
                type="button"
                onClick={() => navigate('/jobs')}
                className="px-6 py-3 bg-dark-800 border border-dark-600 rounded-lg text-white hover:bg-dark-700 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || formData.ssh_hosts.length === 0}
                className="px-6 py-3 bg-neon-cyan text-dark-950 rounded-lg hover:bg-neon-cyan/90 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Creating...' : 'Create Job'}
              </button>
            </div>
          </form>
        </div>

        {/* Debug Panel */}
        <div className="bg-dark-900 rounded-xl p-6 border border-dark-700">
          <h3 className="text-lg font-semibold text-white mb-4">Debug Logs</h3>
          <div className="bg-dark-800 rounded-lg p-4 h-96 overflow-y-auto">
            {debugLogs.length === 0 ? (
              <p className="text-dark-400 text-sm">No debug logs yet...</p>
            ) : (
              <div className="space-y-1">
                {debugLogs.map((log, index) => (
                  <div key={index} className="text-xs text-dark-300 font-mono">
                    {log}
                  </div>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setDebugLogs([])}
            className="mt-2 text-xs text-dark-400 hover:text-white transition-colors"
          >
            Clear logs
          </button>
        </div>
      </div>
    </div>
  );
}

export default CreateJob;