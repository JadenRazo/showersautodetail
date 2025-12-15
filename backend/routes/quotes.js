import express from 'express';
import pool from '../config/database.js';
import { sendNotification } from '../middleware/notifications.js';
import { quoteValidation } from '../middleware/validators.js';
import { quoteLimiter } from '../middleware/rateLimiter.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Submit a quote request (public with rate limiting and validation)
router.post('/', quoteLimiter, quoteValidation, async (req, res) => {
  try {
    const {
      customerName,
      customerEmail,
      customerPhone,
      vehicleType,
      serviceLevel,
      message,
      selectedAddons,
      addonTotal,
      totalEstimate
    } = req.body;

    // Calculate estimated price based on service level
    // Vehicle types: sedan (Sedan/Coupe), suv (SUV/Truck), commercial (Commercial)
    const prices = {
      'exterior': { sedan: 50, suv: 60, commercial: 80 },
      'interior': { sedan: 120, suv: 160, commercial: 200 },
      'deep-interior': { sedan: 200, suv: 240, commercial: 280 },
      'package-deal': { sedan: 150, suv: 200, commercial: 250 },
      'disaster': { sedan: 230, suv: 270, commercial: 310 }
    };

    const level = (serviceLevel || 'exterior').toLowerCase();
    const vehicle = vehicleType.toLowerCase();
    const estimatedPrice = totalEstimate || prices[level]?.[vehicle] || prices.exterior.sedan;

    // Insert quote request
    const result = await pool.query(
      `INSERT INTO quote_requests
       (customer_name, customer_email, customer_phone, vehicle_type, service_level, estimated_price, message)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [customerName, customerEmail, customerPhone, vehicleType, serviceLevel, estimatedPrice, message]
    );

    // Send notification to business owner
    await sendNotification({
      type: 'quote_request',
      data: {
        customerName,
        customerEmail,
        customerPhone,
        vehicleType,
        serviceLevel,
        estimatedPrice,
        message,
        selectedAddons: selectedAddons || [],
        addonTotal: addonTotal || 0
      }
    });

    res.status(201).json({
      success: true,
      quote: result.rows[0],
      estimatedPrice
    });
  } catch (error) {
    console.error('Error creating quote request:', error);
    res.status(500).json({ error: 'Failed to submit quote request' });
  }
});

// Get all quote requests (admin only)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM quote_requests ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching quotes:', error);
    res.status(500).json({ error: 'Failed to fetch quotes' });
  }
});

export default router;
