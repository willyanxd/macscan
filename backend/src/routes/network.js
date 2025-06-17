import express from 'express';
import { NetworkService } from '../services/NetworkService.js';

const router = express.Router();

// Get available network interfaces
router.get('/interfaces', async (req, res) => {
  try {
    const interfaces = await NetworkService.getNetworkInterfaces();
    res.json(interfaces);
  } catch (error) {
    console.error('Error fetching network interfaces:', error);
    res.status(500).json({ message: 'Failed to fetch network interfaces' });
  }
});

// Get interface information
router.get('/interfaces/:name', async (req, res) => {
  try {
    const info = await NetworkService.getInterfaceInfo(req.params.name);
    res.json(info);
  } catch (error) {
    console.error('Error fetching interface info:', error);
    res.status(500).json({ message: 'Failed to fetch interface information' });
  }
});

// Validate interface and subnet compatibility
router.post('/validate', async (req, res) => {
  try {
    const { interface: networkInterface, subnet } = req.body;
    
    if (!networkInterface || !subnet) {
      return res.status(400).json({ message: 'Interface and subnet are required' });
    }

    const isValid = await NetworkService.validateInterfaceSubnet(networkInterface, subnet);
    res.json({ valid: isValid });
  } catch (error) {
    console.error('Error validating interface/subnet:', error);
    res.status(500).json({ message: 'Failed to validate interface and subnet' });
  }
});

// Get system information
router.get('/system', async (req, res) => {
  try {
    const systemInfo = await NetworkService.getSystemInfo();
    res.json(systemInfo);
  } catch (error) {
    console.error('Error fetching system info:', error);
    res.status(500).json({ message: 'Failed to fetch system information' });
  }
});

export default router;