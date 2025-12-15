import express from 'express';
import { SquareClient, SquareEnvironment, WebhooksHelper, SquareError } from 'square';
import crypto from 'crypto';
import pool from '../config/database.js';
import { sendNotification } from '../middleware/notifications.js';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

// Initialize Square client
const squareClient = new SquareClient({
  token: process.env.SQUARE_ACCESS_TOKEN,
  environment: process.env.SQUARE_ENVIRONMENT === 'production'
    ? SquareEnvironment.Production
    : SquareEnvironment.Sandbox
});

// Create payment for deposit
router.post('/create-deposit-payment', async (req, res) => {
  try {
    const { bookingId, sourceId } = req.body;

    if (!bookingId) {
      return res.status(400).json({ error: 'Booking ID required' });
    }

    if (!sourceId) {
      return res.status(400).json({ error: 'Payment source ID required' });
    }

    // Get booking details
    const result = await pool.query(
      'SELECT * FROM bookings WHERE id = $1',
      [bookingId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const booking = result.rows[0];

    if (booking.deposit_paid) {
      return res.status(400).json({ error: 'Deposit already paid' });
    }

    // Create Square payment
    const paymentResult = await squareClient.payments.create({
      sourceId: sourceId,
      idempotencyKey: crypto.randomUUID(),
      amountMoney: {
        amount: BigInt(Math.round(booking.deposit_amount * 100)),
        currency: 'USD'
      },
      locationId: process.env.SQUARE_LOCATION_ID,
      referenceId: `booking-${booking.id}-deposit`,
      note: `Deposit for booking #${booking.id}`,
      buyerEmailAddress: booking.customer_email
    });

    // Update booking with payment ID
    await pool.query(
      'UPDATE bookings SET deposit_payment_id = $1 WHERE id = $2',
      [paymentResult.id, bookingId]
    );

    // If payment completed immediately, update booking status
    if (paymentResult.status === 'COMPLETED') {
      await pool.query(
        'UPDATE bookings SET deposit_paid = true, status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        ['confirmed', bookingId]
      );

      // Send confirmation notification
      const updatedBooking = await pool.query('SELECT * FROM bookings WHERE id = $1', [bookingId]);
      await sendNotification({
        type: 'deposit_paid',
        data: updatedBooking.rows[0]
      });
    }

    res.json({
      paymentId: paymentResult.id,
      status: paymentResult.status,
      amount: booking.deposit_amount
    });
  } catch (error) {
    console.error('Error creating deposit payment:', error);

    if (error instanceof SquareError) {
      return res.status(400).json({
        error: 'Payment failed',
        details: error.message
      });
    }

    res.status(500).json({ error: 'Failed to create payment' });
  }
});

// Create payment for final payment
router.post('/create-final-payment', async (req, res) => {
  try {
    const { bookingId, sourceId } = req.body;

    if (!bookingId) {
      return res.status(400).json({ error: 'Booking ID required' });
    }

    if (!sourceId) {
      return res.status(400).json({ error: 'Payment source ID required' });
    }

    // Get booking details
    const result = await pool.query(
      'SELECT * FROM bookings WHERE id = $1',
      [bookingId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const booking = result.rows[0];

    if (!booking.deposit_paid) {
      return res.status(400).json({ error: 'Deposit must be paid first' });
    }

    const remainingAmount = booking.total_amount - booking.deposit_amount;

    // Create Square payment for remaining amount
    const paymentResult = await squareClient.payments.create({
      sourceId: sourceId,
      idempotencyKey: crypto.randomUUID(),
      amountMoney: {
        amount: BigInt(Math.round(remainingAmount * 100)),
        currency: 'USD'
      },
      locationId: process.env.SQUARE_LOCATION_ID,
      referenceId: `booking-${booking.id}-final`,
      note: `Final payment for booking #${booking.id}`,
      buyerEmailAddress: booking.customer_email
    });

    // Update booking with payment ID
    await pool.query(
      'UPDATE bookings SET final_payment_id = $1 WHERE id = $2',
      [paymentResult.id, bookingId]
    );

    // If payment completed immediately, update booking status
    if (paymentResult.status === 'COMPLETED') {
      await pool.query(
        'UPDATE bookings SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        ['completed', bookingId]
      );

      const updatedBooking = await pool.query('SELECT * FROM bookings WHERE id = $1', [bookingId]);
      await sendNotification({
        type: 'payment_completed',
        data: updatedBooking.rows[0]
      });
    }

    res.json({
      paymentId: paymentResult.id,
      status: paymentResult.status,
      amount: remainingAmount
    });
  } catch (error) {
    console.error('Error creating final payment:', error);

    if (error instanceof SquareError) {
      return res.status(400).json({
        error: 'Payment failed',
        details: error.message
      });
    }

    res.status(500).json({ error: 'Failed to create payment' });
  }
});

// Webhook to handle Square events
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.headers['x-square-hmacsha256-signature'];
  const notificationUrl = `${process.env.API_URL || 'http://localhost:3000'}/api/payments/webhook`;

  try {
    const body = req.body.toString();

    // Verify webhook signature using SDK helper
    const isValid = await WebhooksHelper.verifySignature({
      requestBody: body,
      signatureHeader: signature,
      signatureKey: process.env.SQUARE_WEBHOOK_SIGNATURE_KEY,
      notificationUrl: notificationUrl
    });

    if (!isValid) {
      console.error('Webhook signature verification failed');
      return res.status(400).send('Webhook signature verification failed');
    }

    const event = JSON.parse(body);

    // Handle payment.updated event (payment.completed doesn't exist)
    if (event.type === 'payment.updated') {
      const payment = event.data.object.payment;

      // Only process completed payments
      if (payment.status !== 'COMPLETED') {
        return res.json({ received: true });
      }

      const referenceId = payment.reference_id;

      if (referenceId && referenceId.startsWith('booking-')) {
        const parts = referenceId.split('-');
        const bookingId = parts[1];
        const paymentType = parts[2];

        if (paymentType === 'deposit') {
          // Mark deposit as paid
          await pool.query(
            'UPDATE bookings SET deposit_paid = true, status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            ['confirmed', bookingId]
          );

          // Send confirmation notification
          const booking = await pool.query('SELECT * FROM bookings WHERE id = $1', [bookingId]);
          if (booking.rows.length > 0) {
            await sendNotification({
              type: 'deposit_paid',
              data: booking.rows[0]
            });
          }
        } else if (paymentType === 'final') {
          // Mark booking as completed
          await pool.query(
            'UPDATE bookings SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            ['completed', bookingId]
          );

          const booking = await pool.query('SELECT * FROM bookings WHERE id = $1', [bookingId]);
          if (booking.rows.length > 0) {
            await sendNotification({
              type: 'payment_completed',
              data: booking.rows[0]
            });
          }
        }
      }
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(400).send(`Webhook Error: ${error.message}`);
  }
});

export default router;
