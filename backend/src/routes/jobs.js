import express from 'express';
import { Job } from '../models/Job.js';
import { MacScanRunner } from '../services/MacScanRunner.js';
import { SSHService } from '../services/SSHService.js';
import { CryptoService } from '../services/CryptoService.js';
import { getDatabase } from '../database/init.js';

const router = express.Router();
const macScanRunner = new MacScanRunner();
const sshService = new SSHService();

// Get all jobs
router.get('/', async (req, res) => {
  try {
    const jobs = await Job.findAll();
    res.json(jobs);
  } catch (error) {
    console.error('Error fetching jobs:', error);
    res.status(500).json({ message: 'Failed to fetch jobs' });
  }
});

// Get job by ID
router.get('/:id', async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) {
      return res.status(404).json({ message: 'Job not found' });
    }
    res.json(job);
  } catch (error) {
    console.error('Error fetching job:', error);
    res.status(500).json({ message: 'Failed to fetch job' });
  }
});

// Create new job
router.post('/', async (req, res) => {
  try {
    // Validate required fields
    const { name, ssh_hosts } = req.body;
    
    if (!name) {
      return res.status(400).json({ message: 'Job name is required' });
    }

    if (!ssh_hosts || ssh_hosts.length === 0) {
      return res.status(400).json({ message: 'At least one SSH host is required' });
    }

    // Validate SSH hosts
    for (const host of ssh_hosts) {
      if (!host.name || !host.host || !host.username || !host.password) {
        return res.status(400).json({ 
          message: 'All SSH host fields (name, host, username, password) are required' 
        });
      }
    }

    const job = new Job(req.body);
    await job.save();
    
    res.status(201).json({ message: 'Job created successfully', id: job.id });
  } catch (error) {
    console.error('Error creating job:', error);
    res.status(500).json({ message: 'Failed to create job' });
  }
});

// Update job
router.put('/:id', async (req, res) => {
  try {
    const existingJob = await Job.findById(req.params.id);
    if (!existingJob) {
      return res.status(404).json({ message: 'Job not found' });
    }

    const job = new Job({ ...existingJob, ...req.body, id: req.params.id });
    await job.save();

    // Update whitelist status for known devices
    await updateDeviceWhitelistStatus(req.params.id, job.whitelist);
    
    res.json({ message: 'Job updated successfully' });
  } catch (error) {
    console.error('Error updating job:', error);
    res.status(500).json({ message: 'Failed to update job' });
  }
});

// Delete job
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await Job.delete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: 'Job not found' });
    }
    
    res.json({ message: 'Job deleted successfully' });
  } catch (error) {
    console.error('Error deleting job:', error);
    res.status(500).json({ message: 'Failed to delete job' });
  }
});

// Run job manually
router.post('/:id/run', async (req, res) => {
  try {
    if (macScanRunner.isJobRunning(req.params.id)) {
      return res.status(409).json({ message: 'Job is already running' });
    }

    // Start job asynchronously
    macScanRunner.runJob(req.params.id).catch(error => {
      console.error(`Job ${req.params.id} failed:`, error);
    });
    
    res.json({ message: 'Job started successfully' });
  } catch (error) {
    console.error('Error starting job:', error);
    res.status(500).json({ message: 'Failed to start job' });
  }
});

// Test SSH connection
router.post('/:id/test-ssh/:hostId', async (req, res) => {
  try {
    const db = getDatabase();
    const hostStmt = db.prepare('SELECT * FROM ssh_hosts WHERE id = ? AND job_id = ?');
    const host = hostStmt.get(req.params.hostId, req.params.id);

    if (!host) {
      return res.status(404).json({ message: 'SSH host not found' });
    }

    const password = CryptoService.decrypt(host.password_encrypted);
    const hostConfig = {
      host: host.host,
      port: host.port,
      username: host.username,
      password
    };

    const result = await sshService.testConnection(hostConfig);

    // Update test status in database
    const updateStmt = db.prepare(`
      UPDATE ssh_hosts 
      SET last_test = CURRENT_TIMESTAMP, test_status = ? 
      WHERE id = ?
    `);
    updateStmt.run(result.success ? 'success' : 'failed', host.id);

    res.json(result);
  } catch (error) {
    console.error('Error testing SSH connection:', error);
    res.status(500).json({ message: 'Failed to test SSH connection' });
  }
});

// Execute SSH command (console)
router.post('/:id/ssh-console/:hostId', async (req, res) => {
  try {
    const { command } = req.body;
    
    if (!command) {
      return res.status(400).json({ message: 'Command is required' });
    }

    const db = getDatabase();
    const hostStmt = db.prepare('SELECT * FROM ssh_hosts WHERE id = ? AND job_id = ?');
    const host = hostStmt.get(req.params.hostId, req.params.id);

    if (!host) {
      return res.status(404).json({ message: 'SSH host not found' });
    }

    const password = CryptoService.decrypt(host.password_encrypted);
    const hostConfig = {
      host: host.host,
      port: host.port,
      username: host.username,
      password
    };

    const result = await sshService.executeCommand(hostConfig, command);

    // Save console session
    const sessionStmt = db.prepare(`
      INSERT INTO ssh_console_sessions (id, job_id, host_id, command, output, error_message, duration)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    
    const { v4: uuidv4 } = await import('uuid');
    sessionStmt.run(
      uuidv4(),
      req.params.id,
      req.params.hostId,
      command,
      result.output || '',
      result.error || '',
      result.duration || 0
    );

    res.json(result);
  } catch (error) {
    console.error('Error executing SSH command:', error);
    res.status(500).json({ message: 'Failed to execute SSH command' });
  }
});

// Get SSH console history
router.get('/:id/ssh-console/:hostId/history', async (req, res) => {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT * FROM ssh_console_sessions 
      WHERE job_id = ? AND host_id = ? 
      ORDER BY executed_at DESC 
      LIMIT 50
    `);
    
    const sessions = stmt.all(req.params.id, req.params.hostId);
    res.json(sessions);
  } catch (error) {
    console.error('Error fetching SSH console history:', error);
    res.status(500).json({ message: 'Failed to fetch SSH console history' });
  }
});

// Get job runs
router.get('/:id/runs', async (req, res) => {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT * FROM job_runs 
      WHERE job_id = ? 
      ORDER BY started_at DESC 
      LIMIT 50
    `);
    
    const runs = stmt.all(req.params.id);
    res.json(runs);
  } catch (error) {
    console.error('Error fetching job runs:', error);
    res.status(500).json({ message: 'Failed to fetch job runs' });
  }
});

// Get known devices for job
router.get('/:id/devices', async (req, res) => {
  try {
    const db = getDatabase();
    const stmt = db.prepare(`
      SELECT * FROM known_devices 
      WHERE job_id = ? 
      ORDER BY last_seen DESC
    `);
    
    const devices = stmt.all(req.params.id);
    res.json(devices);
  } catch (error) {
    console.error('Error fetching known devices:', error);
    res.status(500).json({ message: 'Failed to fetch known devices' });
  }
});

// Remove known device
router.delete('/:id/devices/:deviceId', async (req, res) => {
  try {
    const db = getDatabase();
    const stmt = db.prepare('DELETE FROM known_devices WHERE id = ? AND job_id = ?');
    const result = stmt.run(req.params.deviceId, req.params.id);
    
    if (result.changes === 0) {
      return res.status(404).json({ message: 'Device not found' });
    }
    
    res.json({ message: 'Device removed successfully' });
  } catch (error) {
    console.error('Error removing device:', error);
    res.status(500).json({ message: 'Failed to remove device' });
  }
});

// Helper function to update device whitelist status
async function updateDeviceWhitelistStatus(jobId, whitelist) {
  const db = getDatabase();
  
  // Update all devices to not whitelisted first
  const resetStmt = db.prepare('UPDATE known_devices SET whitelisted = 0 WHERE job_id = ?');
  resetStmt.run(jobId);
  
  // Update whitelisted devices
  if (whitelist && whitelist.length > 0) {
    const updateStmt = db.prepare('UPDATE known_devices SET whitelisted = 1 WHERE job_id = ? AND mac_address = ?');
    for (const mac of whitelist) {
      updateStmt.run(jobId, mac);
    }
  }
}

export default router;