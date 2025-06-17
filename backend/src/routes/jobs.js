import express from 'express';
import { Job } from '../models/Job.js';
import { JobRunner } from '../services/JobRunner.js';
import { getDatabase } from '../database/init.js';
import { NetworkService } from '../services/NetworkService.js';

const router = express.Router();
const jobRunner = new JobRunner();

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
    const { name, network_interface, subnet } = req.body;
    
    if (!name || !network_interface || !subnet) {
      return res.status(400).json({ message: 'Name, network interface, and subnet are required' });
    }

    // Validate interface and subnet compatibility
    const isValid = await NetworkService.validateInterfaceSubnet(network_interface, subnet);
    if (!isValid) {
      return res.status(400).json({ 
        message: 'Network interface does not have an IP address in the specified subnet' 
      });
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

    // Validate interface and subnet if they're being updated
    const { network_interface, subnet } = req.body;
    if (network_interface && subnet) {
      const isValid = await NetworkService.validateInterfaceSubnet(network_interface, subnet);
      if (!isValid) {
        return res.status(400).json({ 
          message: 'Network interface does not have an IP address in the specified subnet' 
        });
      }
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
    if (jobRunner.isJobRunning(req.params.id)) {
      return res.status(409).json({ message: 'Job is already running' });
    }

    // Start job asynchronously
    jobRunner.runJob(req.params.id).catch(error => {
      console.error(`Job ${req.params.id} failed:`, error);
    });
    
    res.json({ message: 'Job started successfully' });
  } catch (error) {
    console.error('Error starting job:', error);
    res.status(500).json({ message: 'Failed to start job' });
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