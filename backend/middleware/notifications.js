import { TransactionalEmailsApi, TransactionalEmailsApiApiKeys, SendSmtpEmail } from '@getbrevo/brevo';
import Telnyx from 'telnyx';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Brevo (Email)
let brevoClient;
if (process.env.BREVO_API_KEY) {
  brevoClient = new TransactionalEmailsApi();
  brevoClient.setApiKey(TransactionalEmailsApiApiKeys.apiKey, process.env.BREVO_API_KEY);
}

// Initialize Telnyx (SMS)
let telnyxClient;
if (process.env.TELNYX_API_KEY) {
  telnyxClient = new Telnyx(process.env.TELNYX_API_KEY);
}

/**
 * Send notification via email and/or SMS based on configuration
 */
export async function sendNotification({ type, data }) {
  const method = process.env.NOTIFICATION_METHOD || 'email';

  try {
    // Send email if configured
    if ((method === 'email' || method === 'both') && brevoClient) {
      // Send to business owner
      await sendEmailNotification(type, data);
      
      // Send confirmation to customer
      if (data.customerEmail) {
        await sendCustomerConfirmation(type, data);
      }
    }

    // Send SMS if configured
    if ((method === 'sms' || method === 'both') && telnyxClient) {
      await sendSMSNotification(type, data);
    }
  } catch (error) {
    console.error('Notification error:', error);
    // Don't throw - notifications failing shouldn't break the main flow
  }
}

/**
 * Send email notification to business owner via Brevo
 */
async function sendEmailNotification(type, data) {
  const emailTemplates = {
    quote_request: {
      subject: `New Quote Request from ${data.customerName}`,
      text: `
New quote request received:

Customer: ${data.customerName}
Email: ${data.customerEmail}
Phone: ${data.customerPhone}
Vehicle: ${data.vehicleType}
Service Level: ${data.serviceLevel}
${data.selectedAddons?.length ? `Add-ons: ${data.selectedAddons.join(', ')}
Add-on Total: $${data.addonTotal}
` : ''}Estimated Total: $${data.estimatedPrice}
Message: ${data.message || 'N/A'}
      `
    },
    new_booking: {
      subject: `New Booking #${data.bookingId} from ${data.customerName}`,
      text: `
New booking received:

Booking ID: #${data.bookingId}
Customer: ${data.customerName}
Email: ${data.customerEmail}
Phone: ${data.customerPhone}
Vehicle: ${data.vehicleType}
Date: ${data.bookingDate}
Time: ${data.bookingTime}
Total: $${data.totalAmount}
Deposit: $${data.depositAmount}
      `
    },
    deposit_paid: {
      subject: `Deposit Paid - Booking #${data.id}`,
      text: `
Deposit payment confirmed for booking #${data.id}

Customer: ${data.customer_name}
Amount Paid: $${data.deposit_amount}
Date: ${data.booking_date}
Time: ${data.booking_time}
      `
    },
    payment_completed: {
      subject: `Payment Completed - Booking #${data.id}`,
      text: `
Full payment received for booking #${data.id}

Customer: ${data.customer_name}
Total Amount: $${data.total_amount}
Date: ${data.booking_date}
      `
    }
  };

  const template = emailTemplates[type];
  if (!template) {
    console.warn(`No email template for notification type: ${type}`);
    return;
  }

  const sendSmtpEmail = new SendSmtpEmail();
  sendSmtpEmail.to = [{ email: process.env.NOTIFICATION_EMAIL_TO }];
  sendSmtpEmail.sender = {
    email: process.env.NOTIFICATION_EMAIL_FROM,
    name: process.env.BUSINESS_NAME || 'Showers Auto Detailing'
  };
  sendSmtpEmail.subject = template.subject;
  sendSmtpEmail.textContent = template.text;

  await brevoClient.sendTransacEmail(sendSmtpEmail);
  console.log(`Email notification sent to owner for ${type}`);
}

/**
 * Send confirmation email to customer via Brevo
 */
async function sendCustomerConfirmation(type, data) {
  const businessName = process.env.BUSINESS_NAME || 'Showers Auto Detailing';
  const businessPhone = process.env.BUSINESS_PHONE || '';
  const businessEmail = process.env.BUSINESS_EMAIL || process.env.NOTIFICATION_EMAIL_TO;

  const customerTemplates = {
    quote_request: {
      subject: `Quote Request Received - ${businessName}`,
      text: `
Hi ${data.customerName},

Thank you for requesting a quote from ${businessName}!

We've received your request and will get back to you shortly.

Your Request Details:
- Vehicle Type: ${data.vehicleType}
- Service: ${data.serviceLevel}
- Estimated Price: $${data.estimatedPrice}

If you have any questions, feel free to contact us:
Phone: (442) 229-5998
Email: ${businessEmail}

We look forward to serving you!

Best regards,
${businessName}
      `
    },
    new_booking: {
      subject: `Booking Confirmation #${data.bookingId} - ${businessName}`,
      text: `
Hi ${data.customerName},

Your booking has been confirmed!

Booking Details:
- Booking ID: #${data.bookingId}
- Date: ${data.bookingDate}
- Time: ${data.bookingTime}
- Vehicle: ${data.vehicleType}
- Total: $${data.totalAmount}
- Deposit Paid: $${data.depositAmount}

If you need to reschedule or have any questions, please contact us:
Phone: (442) 229-5998
Email: ${businessEmail}

Thank you for choosing ${businessName}!

Best regards,
${businessName}
      `
    }
  };

  const template = customerTemplates[type];
  if (!template) {
    return; // Not all notification types need customer confirmation
  }

  const sendSmtpEmail = new SendSmtpEmail();
  sendSmtpEmail.to = [{ email: data.customerEmail }];
  sendSmtpEmail.sender = {
    email: process.env.NOTIFICATION_EMAIL_FROM,
    name: businessName
  };
  sendSmtpEmail.subject = template.subject;
  sendSmtpEmail.textContent = template.text;

  await brevoClient.sendTransacEmail(sendSmtpEmail);
  console.log(`Customer confirmation email sent for ${type} to ${data.customerEmail}`);
}

/**
 * Send SMS notification via Telnyx
 */
async function sendSMSNotification(type, data) {
  const smsTemplates = {
    quote_request: `New quote request from ${data.customerName} for ${data.vehicleType} - ${data.serviceLevel} service. Est: $${data.estimatedPrice}`,
    new_booking: `New booking #${data.bookingId}! ${data.customerName} - ${data.bookingDate} at ${data.bookingTime}. Total: $${data.totalAmount}`,
    deposit_paid: `Deposit paid for booking #${data.id}. ${data.customer_name} - ${data.booking_date}`,
    payment_completed: `Payment completed! Booking #${data.id} fully paid. Total: $${data.total_amount}`
  };

  const message = smsTemplates[type];
  if (!message) {
    console.warn(`No SMS template for notification type: ${type}`);
    return;
  }

  await telnyxClient.messages.create({
    from: process.env.TELNYX_PHONE_NUMBER,
    to: process.env.NOTIFICATION_SMS_TO,
    text: message
  });

  console.log(`SMS notification sent for ${type}`);
}
