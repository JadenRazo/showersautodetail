import express from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import pool from '../config/database.js';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { loginValidation } from '../middleware/validators.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY_DAYS = 30;

// Login - uses environment variables for credentials
router.post('/login', loginValidation, async (req, res) => {
  const { email, password, rememberMe = false, totpCode } = req.body;

  try {
    // Check credentials against environment variables
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminEmail || !adminPassword) {
      console.error('ADMIN_EMAIL or ADMIN_PASSWORD not set in environment');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    if (email !== adminEmail || password !== adminPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check if 2FA is enabled (stored in admin_users table)
    let user = null;
    const userResult = await pool.query(
      'SELECT * FROM admin_users WHERE email = $1',
      [adminEmail]
    );

    if (userResult.rows.length > 0) {
      user = userResult.rows[0];

      // Check 2FA if enabled
      if (user.totp_enabled && user.totp_secret) {
        if (!totpCode) {
          return res.status(200).json({
            requiresTwoFactor: true,
            message: 'Please enter your 2FA code'
          });
        }

        const isValidCode = authenticator.verify({ token: totpCode, secret: user.totp_secret });
        if (!isValidCode) {
          return res.status(401).json({ error: 'Invalid 2FA code' });
        }
      }
    } else {
      // Auto-create admin user entry for 2FA support
      const result = await pool.query(
        'INSERT INTO admin_users (email, password_hash, name, role) VALUES ($1, $2, $3, $4) RETURNING *',
        [adminEmail, 'ENV_MANAGED', 'Admin', 'admin']
      );
      user = result.rows[0];
    }

    // Generate access token
    const accessToken = jwt.sign(
      { id: user.id, email: adminEmail, role: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: ACCESS_TOKEN_EXPIRY }
    );

    // Always generate refresh token (different expiry based on rememberMe)
    const refreshToken = crypto.randomBytes(64).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const expiryDays = rememberMe ? REFRESH_TOKEN_EXPIRY_DAYS : 1; // 30 days or 1 day
    const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);

    await pool.query(
      'INSERT INTO refresh_tokens (user_id, token_hash, expires_at, device_info) VALUES ($1, $2, $3, $4)',
      [user.id, tokenHash, expiresAt, req.headers['user-agent'] || 'Unknown']
    );

    res.json({
      accessToken,
      refreshToken,
      expiresIn: ACCESS_TOKEN_EXPIRY,
      user: { id: user.id, email: adminEmail, name: user.name || 'Admin', role: 'admin' }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Refresh access token
router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({ error: 'Refresh token required' });
  }

  try {
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    const result = await pool.query(
      'SELECT rt.*, au.email, au.name, au.role FROM refresh_tokens rt JOIN admin_users au ON rt.user_id = au.id WHERE rt.token_hash = $1 AND rt.is_revoked = false AND rt.expires_at > NOW() AND au.is_active = true',
      [tokenHash]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    const tokenData = result.rows[0];

    const accessToken = jwt.sign(
      { id: tokenData.user_id, email: tokenData.email, role: tokenData.role },
      process.env.JWT_SECRET,
      { expiresIn: ACCESS_TOKEN_EXPIRY }
    );

    res.json({ accessToken, expiresIn: ACCESS_TOKEN_EXPIRY });
  } catch (error) {
    console.error('Refresh error:', error);
    res.status(500).json({ error: 'Token refresh failed' });
  }
});

// Logout (revoke refresh token)
router.post('/logout', async (req, res) => {
  const { refreshToken } = req.body;

  if (refreshToken) {
    try {
      const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
      await pool.query(
        'UPDATE refresh_tokens SET is_revoked = true WHERE token_hash = $1',
        [tokenHash]
      );
    } catch (error) {
      console.error('Logout error:', error);
    }
  }

  res.json({ success: true });
});

// Get current user info
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, email, name, role, created_at FROM admin_users WHERE id = $1 AND is_active = true',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user info' });
  }
});

// 2FA Setup - Generate secret and QR code
router.post('/2fa/setup', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Check if 2FA already enabled
    const userResult = await pool.query(
      'SELECT totp_enabled FROM admin_users WHERE id = $1',
      [userId]
    );

    if (userResult.rows[0]?.totp_enabled) {
      return res.status(400).json({ error: '2FA is already enabled' });
    }

    // Generate new secret
    const secret = authenticator.generateSecret();
    const email = req.user.email;
    const otpauth = authenticator.keyuri(email, 'Showers Auto Detail', secret);

    // Generate QR code
    const qrCode = await QRCode.toDataURL(otpauth);

    // Store secret temporarily (not enabled yet)
    await pool.query(
      'UPDATE admin_users SET totp_secret = $1 WHERE id = $2',
      [secret, userId]
    );

    res.json({
      secret,
      qrCode,
      manualEntry: secret
    });
  } catch (error) {
    console.error('2FA setup error:', error);
    res.status(500).json({ error: 'Failed to setup 2FA' });
  }
});

// 2FA Verify and Enable
router.post('/2fa/verify', authenticateToken, async (req, res) => {
  try {
    const { code } = req.body;
    const userId = req.user.id;

    if (!code) {
      return res.status(400).json({ error: 'Verification code required' });
    }

    // Get user's secret
    const result = await pool.query(
      'SELECT totp_secret, totp_enabled FROM admin_users WHERE id = $1',
      [userId]
    );

    const user = result.rows[0];

    if (!user?.totp_secret) {
      return res.status(400).json({ error: 'Please setup 2FA first' });
    }

    if (user.totp_enabled) {
      return res.status(400).json({ error: '2FA is already enabled' });
    }

    // Verify code
    const isValid = authenticator.verify({ token: code, secret: user.totp_secret });

    if (!isValid) {
      return res.status(400).json({ error: 'Invalid verification code' });
    }

    // Enable 2FA
    await pool.query(
      'UPDATE admin_users SET totp_enabled = true WHERE id = $1',
      [userId]
    );

    res.json({ success: true, message: '2FA enabled successfully' });
  } catch (error) {
    console.error('2FA verify error:', error);
    res.status(500).json({ error: 'Failed to verify 2FA' });
  }
});

// 2FA Disable
router.post('/2fa/disable', authenticateToken, async (req, res) => {
  try {
    const { code } = req.body;
    const userId = req.user.id;

    if (!code) {
      return res.status(400).json({ error: 'Current 2FA code required' });
    }

    // Get user's secret
    const result = await pool.query(
      'SELECT totp_secret, totp_enabled FROM admin_users WHERE id = $1',
      [userId]
    );

    const user = result.rows[0];

    if (!user?.totp_enabled) {
      return res.status(400).json({ error: '2FA is not enabled' });
    }

    // Verify code
    const isValid = authenticator.verify({ token: code, secret: user.totp_secret });

    if (!isValid) {
      return res.status(400).json({ error: 'Invalid verification code' });
    }

    // Disable 2FA
    await pool.query(
      'UPDATE admin_users SET totp_enabled = false, totp_secret = NULL WHERE id = $1',
      [userId]
    );

    res.json({ success: true, message: '2FA disabled successfully' });
  } catch (error) {
    console.error('2FA disable error:', error);
    res.status(500).json({ error: 'Failed to disable 2FA' });
  }
});

// 2FA Status
router.get('/2fa/status', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT totp_enabled FROM admin_users WHERE id = $1',
      [req.user.id]
    );

    res.json({ enabled: result.rows[0]?.totp_enabled || false });
  } catch (error) {
    console.error('2FA status error:', error);
    res.status(500).json({ error: 'Failed to get 2FA status' });
  }
});

export default router;
