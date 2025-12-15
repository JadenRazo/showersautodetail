import express from 'express';
import crypto from 'crypto';
import pool from '../config/database.js';
import { sendNotification } from '../middleware/notifications.js';
import { bookingValidation, idParamValidation } from '../middleware/validators.js';
import { bookingLimiter } from '../middleware/rateLimiter.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Generate secure payment token (12-char hex = 48 bits of entropy)
function generatePaymentToken() {
  return crypto.randomBytes(6).toString('hex');
}

// Create a new booking (public with rate limiting and validation)
router.post('/', bookingLimiter, bookingValidation, async (req, res) => {
  try {
    const {
      customerName,
      customerEmail,
      customerPhone,
      vehicleType,
      packageId,
      serviceId,
      addonIds,
      bookingDate,
      bookingTime,
      address,
      notes
    } = req.body;

    let totalAmount = 0;
    let serviceName = '';

    // Determine pricing based on service or package
    if (serviceId) {
      // Use new services table with fixed pricing
      const serviceResult = await pool.query(
        'SELECT name, sedan_price, suv_price, truck_price FROM services WHERE id = $1',
        [serviceId]
      );

      if (serviceResult.rows.length === 0) {
        return res.status(404).json({ error: 'Service not found' });
      }

      const service = serviceResult.rows[0];
      serviceName = service.name;
      const vehicle = vehicleType.toLowerCase();

      // Map vehicle type to price column (commercial uses truck_price)
      if (vehicle === 'sedan') {
        totalAmount = parseFloat(service.sedan_price);
      } else if (vehicle === 'suv') {
        totalAmount = parseFloat(service.suv_price);
      } else {
        totalAmount = parseFloat(service.truck_price); // commercial
      }
    } else if (packageId) {
      // Fallback to legacy packages table
      const packageResult = await pool.query(
        'SELECT name, base_price, vehicle_multipliers FROM packages WHERE id = $1',
        [packageId]
      );

      if (packageResult.rows.length === 0) {
        return res.status(404).json({ error: 'Package not found' });
      }

      const { name, base_price, vehicle_multipliers } = packageResult.rows[0];
      serviceName = name;
      const multiplier = vehicle_multipliers[vehicleType.toLowerCase()] || 1.0;
      totalAmount = parseFloat(base_price) * multiplier;
    } else {
      return res.status(400).json({ error: 'Service or package ID required' });
    }

    // Calculate addon costs if any
    let addonTotal = 0;
    const addonDetails = [];

    if (addonIds && Array.isArray(addonIds) && addonIds.length > 0) {
      const vehicle = vehicleType.toLowerCase();
      const priceColumn = vehicle === 'commercial' ? 'commercial_price'
        : vehicle === 'suv' ? 'suv_price' : 'sedan_price';

      const placeholders = addonIds.map((_, i) => `$${i + 1}`).join(',');
      const addonResult = await pool.query(
        `SELECT id, name, ${priceColumn} as price FROM addons
         WHERE id IN (${placeholders}) AND is_active = true`,
        addonIds
      );

      for (const addon of addonResult.rows) {
        addonTotal += parseFloat(addon.price);
        addonDetails.push({
          id: addon.id,
          name: addon.name,
          price: parseFloat(addon.price)
        });
      }
    }

    totalAmount += addonTotal;

    // Get deposit percentage from settings
    const settingsResult = await pool.query(
      "SELECT value FROM settings WHERE key = 'deposit_percentage'"
    );
    const depositPercentage = settingsResult.rows.length > 0
      ? parseFloat(settingsResult.rows[0].value)
      : parseFloat(process.env.DEPOSIT_PERCENTAGE || 0.25);

    const depositAmount = totalAmount * depositPercentage;

    // Generate payment token for secure payment links
    const paymentToken = generatePaymentToken();

    // Insert booking
    const result = await pool.query(
      `INSERT INTO bookings
       (customer_name, customer_email, customer_phone, vehicle_type, package_id, service_id,
        booking_date, booking_time, address, notes, total_amount, deposit_amount, status, payment_token)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *`,
      [customerName, customerEmail, customerPhone, vehicleType, packageId || null, serviceId || null,
       bookingDate, bookingTime, address, notes, totalAmount, depositAmount, 'pending', paymentToken]
    );

    const booking = result.rows[0];

    // Insert selected addons into booking_addons table
    if (addonDetails.length > 0) {
      const addonInserts = addonDetails.map(addon =>
        pool.query(
          'INSERT INTO booking_addons (booking_id, addon_id, price_charged) VALUES ($1, $2, $3)',
          [booking.id, addon.id, addon.price]
        )
      );
      await Promise.all(addonInserts);
    }

    // Send notification
    await sendNotification({
      type: 'new_booking',
      data: {
        bookingId: booking.id,
        customerName,
        customerEmail,
        customerPhone,
        vehicleType,
        serviceName,
        bookingDate,
        bookingTime,
        totalAmount,
        depositAmount,
        addons: addonDetails
      }
    });

    // Build payment link
    const baseUrl = process.env.APP_URL || 'https://showersautodetail.com';
    const paymentLink = `${baseUrl}/pay?id=${booking.id}&token=${paymentToken}`;

    res.status(201).json({
      success: true,
      booking,
      totalAmount: parseFloat(totalAmount.toFixed(2)),
      depositAmount: parseFloat(depositAmount.toFixed(2)),
      addons: addonDetails,
      paymentLink
    });
  } catch (error) {
    console.error('Error creating booking:', error);
    res.status(500).json({ error: 'Failed to create booking' });
  }
});

// Get all bookings (admin only)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT b.*, p.name as package_name
       FROM bookings b
       LEFT JOIN packages p ON b.package_id = p.id
       ORDER BY b.booking_date DESC, b.booking_time DESC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching bookings:', error);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

// Get single booking (with ID validation)
router.get('/:id', idParamValidation, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `SELECT b.*, p.name as package_name, p.description as package_description
       FROM bookings b
       LEFT JOIN packages p ON b.package_id = p.id
       WHERE b.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching booking:', error);
    res.status(500).json({ error: 'Failed to fetch booking' });
  }
});

// Get payment info for a booking (public, requires valid token)
// Used by customer payment page to display booking summary before payment
router.get('/:id/payment-info', idParamValidation, async (req, res) => {
  try {
    const { id } = req.params;
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ error: 'Payment token required' });
    }

    const result = await pool.query(
      `SELECT b.id, b.customer_name, b.vehicle_type, b.booking_date, b.booking_time,
              b.total_amount, b.deposit_amount, b.deposit_paid, b.payment_token,
              COALESCE(s.name, p.name) as service_name
       FROM bookings b
       LEFT JOIN services s ON b.service_id = s.id
       LEFT JOIN packages p ON b.package_id = p.id
       WHERE b.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const booking = result.rows[0];

    // Validate token
    if (booking.payment_token !== token) {
      return res.status(404).json({ error: 'Invalid payment link' });
    }

    // Return limited info (no sensitive data)
    res.json({
      id: booking.id,
      customerFirstName: booking.customer_name.split(' ')[0],
      vehicleType: booking.vehicle_type,
      serviceName: booking.service_name,
      bookingDate: booking.booking_date,
      bookingTime: booking.booking_time,
      totalAmount: parseFloat(booking.total_amount),
      depositAmount: parseFloat(booking.deposit_amount),
      depositPaid: booking.deposit_paid
    });
  } catch (error) {
    console.error('Error fetching payment info:', error);
    res.status(500).json({ error: 'Failed to fetch payment info' });
  }
});

// Update booking status (admin only)
router.patch('/:id/status', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const result = await pool.query(
      'UPDATE bookings SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating booking:', error);
    res.status(500).json({ error: 'Failed to update booking' });
  }
});

// Update booking details (admin only)
router.put('/:id', authenticateToken, idParamValidation, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      customerName,
      customerEmail,
      customerPhone,
      vehicleType,
      bookingDate,
      bookingTime,
      address,
      notes,
      totalAmount,
      depositAmount,
      status
    } = req.body;

    // Build dynamic update query
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (customerName !== undefined) {
      updates.push('customer_name = $' + paramCount++);
      values.push(customerName);
    }
    if (customerEmail !== undefined) {
      updates.push('customer_email = $' + paramCount++);
      values.push(customerEmail);
    }
    if (customerPhone !== undefined) {
      updates.push('customer_phone = $' + paramCount++);
      values.push(customerPhone);
    }
    if (vehicleType !== undefined) {
      updates.push('vehicle_type = $' + paramCount++);
      values.push(vehicleType);
    }
    if (bookingDate !== undefined) {
      updates.push('booking_date = $' + paramCount++);
      values.push(bookingDate);
    }
    if (bookingTime !== undefined) {
      updates.push('booking_time = $' + paramCount++);
      values.push(bookingTime);
    }
    if (address !== undefined) {
      updates.push('address = $' + paramCount++);
      values.push(address);
    }
    if (notes !== undefined) {
      updates.push('notes = $' + paramCount++);
      values.push(notes);
    }
    if (totalAmount !== undefined) {
      updates.push('total_amount = $' + paramCount++);
      values.push(totalAmount);
    }
    if (depositAmount !== undefined) {
      updates.push('deposit_amount = $' + paramCount++);
      values.push(depositAmount);
    }
    if (status !== undefined) {
      const validStatuses = ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }
      updates.push('status = $' + paramCount++);
      values.push(status);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    const result = await pool.query(
      'UPDATE bookings SET ' + updates.join(', ') + ' WHERE id = $' + paramCount + ' RETURNING *',
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating booking:', error);
    res.status(500).json({ error: 'Failed to update booking' });
  }
});

// Delete booking (admin only)
router.delete('/:id', authenticateToken, idParamValidation, async (req, res) => {
  try {
    const { id } = req.params;

    // First delete related booking_addons
    await pool.query('DELETE FROM booking_addons WHERE booking_id = $1', [id]);

    // Then delete the booking
    const result = await pool.query(
      'DELETE FROM bookings WHERE id = $1 RETURNING id, customer_name',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    res.json({ success: true, deleted: result.rows[0] });
  } catch (error) {
    console.error('Error deleting booking:', error);
    res.status(500).json({ error: 'Failed to delete booking' });
  }
});

// Manually mark deposit as paid (admin only)
router.post('/:id/mark-paid', authenticateToken, idParamValidation, async (req, res) => {
  try {
    const { id } = req.params;
    const { paymentId } = req.body;

    const result = await pool.query(
      'UPDATE bookings SET deposit_paid = true, deposit_payment_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [paymentId || 'MANUAL_' + Date.now(), id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    res.json({ success: true, booking: result.rows[0] });
  } catch (error) {
    console.error('Error marking as paid:', error);
    res.status(500).json({ error: 'Failed to mark as paid' });
  }
});

// Resend payment link notification (admin only)
router.post('/:id/resend-link', authenticateToken, idParamValidation, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'SELECT b.*, COALESCE(s.name, p.name) as service_name FROM bookings b LEFT JOIN services s ON b.service_id = s.id LEFT JOIN packages p ON b.package_id = p.id WHERE b.id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const booking = result.rows[0];

    if (booking.deposit_paid) {
      return res.status(400).json({ error: 'Deposit already paid' });
    }

    if (!booking.payment_token) {
      return res.status(400).json({ error: 'No payment link exists for this booking' });
    }

    const baseUrl = process.env.APP_URL || 'https://showersautodetail.com';
    const paymentLink = baseUrl + '/pay?id=' + booking.id + '&token=' + booking.payment_token;

    // Send notification
    await sendNotification({
      type: 'payment_reminder',
      data: {
        bookingId: booking.id,
        customerName: booking.customer_name,
        customerEmail: booking.customer_email,
        customerPhone: booking.customer_phone,
        serviceName: booking.service_name,
        depositAmount: parseFloat(booking.deposit_amount),
        paymentLink
      }
    });

    res.json({ success: true, paymentLink });
  } catch (error) {
    console.error('Error resending link:', error);
    res.status(500).json({ error: 'Failed to resend payment link' });
  }
});

// Get booking stats (admin only)
router.get('/stats/summary', authenticateToken, async (req, res) => {
  try {
    const totalBookings = await pool.query('SELECT COUNT(*) FROM bookings');

    const pendingPayments = await pool.query(
      'SELECT COUNT(*) FROM bookings WHERE deposit_paid = false AND status != $1',
      ['cancelled']
    );

    const thisMonthRevenue = await pool.query(
      'SELECT COALESCE(SUM(deposit_amount), 0) as revenue FROM bookings WHERE deposit_paid = true AND created_at >= date_trunc($1, CURRENT_DATE)',
      ['month']
    );

    const statusCounts = await pool.query(
      'SELECT status, COUNT(*) as count FROM bookings GROUP BY status'
    );

    res.json({
      totalBookings: parseInt(totalBookings.rows[0].count),
      pendingPayments: parseInt(pendingPayments.rows[0].count),
      thisMonthRevenue: parseFloat(thisMonthRevenue.rows[0].revenue),
      statusCounts: statusCounts.rows.reduce((acc, row) => {
        acc[row.status] = parseInt(row.count);
        return acc;
      }, {})
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});
export default router;

