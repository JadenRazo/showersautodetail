import express from 'express';
import pool from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Get all coupons (admin only)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM coupons ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching coupons:', error);
    res.status(500).json({ error: 'Failed to fetch coupons' });
  }
});

// Create coupon (admin only)
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { code, discountType, discountValue, maxUses, expiresAt } = req.body;

    if (!code || !discountType || !discountValue) {
      return res.status(400).json({ error: 'Code, discount type, and value required' });
    }

    if (!['percent', 'fixed'].includes(discountType)) {
      return res.status(400).json({ error: 'Discount type must be percent or fixed' });
    }

    if (discountType === 'percent' && (discountValue < 0 || discountValue > 100)) {
      return res.status(400).json({ error: 'Percent discount must be between 0 and 100' });
    }

    const result = await pool.query(
      `INSERT INTO coupons (code, discount_type, discount_value, max_uses, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [code.toUpperCase(), discountType, discountValue, maxUses || null, expiresAt || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Coupon code already exists' });
    }
    console.error('Error creating coupon:', error);
    res.status(500).json({ error: 'Failed to create coupon' });
  }
});

// Toggle coupon active status (admin only)
router.patch('/:id/toggle', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'UPDATE coupons SET is_active = NOT is_active WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Coupon not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error toggling coupon:', error);
    res.status(500).json({ error: 'Failed to toggle coupon' });
  }
});

// Delete coupon (admin only)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM coupons WHERE id = $1 RETURNING id, code',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Coupon not found' });
    }

    res.json({ success: true, deleted: result.rows[0] });
  } catch (error) {
    console.error('Error deleting coupon:', error);
    res.status(500).json({ error: 'Failed to delete coupon' });
  }
});

// Validate coupon code (public - for checkout)
router.post('/validate', async (req, res) => {
  try {
    const { code, subtotal } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'Coupon code required' });
    }

    const result = await pool.query(
      `SELECT * FROM coupons
       WHERE code = $1
       AND is_active = true
       AND (expires_at IS NULL OR expires_at > NOW())
       AND (max_uses IS NULL OR used_count < max_uses)`,
      [code.toUpperCase()]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid or expired coupon code' });
    }

    const coupon = result.rows[0];
    let discount = 0;

    if (coupon.discount_type === 'percent') {
      discount = (parseFloat(subtotal) * parseFloat(coupon.discount_value)) / 100;
    } else {
      discount = parseFloat(coupon.discount_value);
    }

    // Cap discount at subtotal
    discount = Math.min(discount, parseFloat(subtotal));

    res.json({
      valid: true,
      code: coupon.code,
      discountType: coupon.discount_type,
      discountValue: parseFloat(coupon.discount_value),
      discountAmount: parseFloat(discount.toFixed(2))
    });
  } catch (error) {
    console.error('Error validating coupon:', error);
    res.status(500).json({ error: 'Failed to validate coupon' });
  }
});

// Apply coupon to booking (internal use during payment)
router.post('/apply', async (req, res) => {
  try {
    const { code, bookingId } = req.body;

    if (!code || !bookingId) {
      return res.status(400).json({ error: 'Coupon code and booking ID required' });
    }

    // Get coupon
    const couponResult = await pool.query(
      `SELECT * FROM coupons
       WHERE code = $1
       AND is_active = true
       AND (expires_at IS NULL OR expires_at > NOW())
       AND (max_uses IS NULL OR used_count < max_uses)`,
      [code.toUpperCase()]
    );

    if (couponResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid or expired coupon code' });
    }

    const coupon = couponResult.rows[0];

    // Get booking
    const bookingResult = await pool.query(
      'SELECT total_amount, deposit_amount FROM bookings WHERE id = $1',
      [bookingId]
    );

    if (bookingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const booking = bookingResult.rows[0];
    let discount = 0;

    if (coupon.discount_type === 'percent') {
      discount = (parseFloat(booking.total_amount) * parseFloat(coupon.discount_value)) / 100;
    } else {
      discount = parseFloat(coupon.discount_value);
    }

    // Cap discount at total
    discount = Math.min(discount, parseFloat(booking.total_amount));

    // Update booking with coupon
    const depositPercentage = parseFloat(booking.deposit_amount) / parseFloat(booking.total_amount);
    const newTotal = parseFloat(booking.total_amount) - discount;
    const newDeposit = newTotal * depositPercentage;

    await pool.query(
      `UPDATE bookings
       SET coupon_code = $1, coupon_discount = $2, total_amount = $3, deposit_amount = $4
       WHERE id = $5`,
      [coupon.code, discount, newTotal, newDeposit, bookingId]
    );

    // Increment used count
    await pool.query(
      'UPDATE coupons SET used_count = used_count + 1 WHERE id = $1',
      [coupon.id]
    );

    res.json({
      success: true,
      discountApplied: parseFloat(discount.toFixed(2)),
      newTotal: parseFloat(newTotal.toFixed(2)),
      newDeposit: parseFloat(newDeposit.toFixed(2))
    });
  } catch (error) {
    console.error('Error applying coupon:', error);
    res.status(500).json({ error: 'Failed to apply coupon' });
  }
});

export default router;
