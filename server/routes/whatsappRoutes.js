const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const config = require('../config');
const { whatsappService } = require('../services');

/**
 * WhatsApp Webhook Verification (GET)
 * Facebook/Meta verifies the webhook endpoint with this
 */
router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  // Use a verify token from env (should be set when configuring webhook)
  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'grievance_portal_verify';

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('Webhook verified');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

/**
 * WhatsApp Webhook Handler (POST)
 * Receives messages and status updates from WhatsApp
 */
router.post('/webhook', async (req, res) => {
  try {
    const body = req.body;

    // Check if this is a WhatsApp Business API webhook
    if (body.object !== 'whatsapp_business_account') {
      return res.sendStatus(404);
    }

    // Process each entry
    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value;

        // Handle incoming messages
        if (value.messages) {
          for (const message of value.messages) {
            await handleIncomingMessage(message, value.contacts?.[0]);
          }
        }

        // Handle message status updates
        if (value.statuses) {
          for (const status of value.statuses) {
            await handleStatusUpdate(status);
          }
        }
      }
    }

    // Always respond with 200 to acknowledge receipt
    res.sendStatus(200);
  } catch (error) {
    console.error('Webhook error:', error);
    res.sendStatus(500);
  }
});

/**
 * Handle incoming WhatsApp messages
 */
async function handleIncomingMessage(message, contact) {
  const phoneNumber = message.from;
  const messageType = message.type;
  const messageId = message.id;

  console.log(`Incoming message from ${phoneNumber}:`, messageType);

  // Mark message as read
  await whatsappService.markAsRead(messageId);

  // Handle text messages
  if (messageType === 'text') {
    const text = message.text.body.toLowerCase().trim();

    // Check for keywords
    if (text.includes('complaint') || text.includes('grievance') || text.includes('report')) {
      // Generate a session ID for this complaint
      const sessionId = crypto.randomBytes(16).toString('hex');
      
      // Send link to complaint portal
      await whatsappService.sendComplaintLink(phoneNumber, sessionId, 'en');
    } else if (text.includes('status') || text.includes('track')) {
      // Send status tracking instructions
      await whatsappService.sendTextMessage(
        phoneNumber,
        'To check your complaint status, please reply with your Complaint ID (e.g., GRV2603020001).'
      );
    } else if (text.match(/^grv\d+$/i)) {
      // User sent a complaint ID - fetch and send status
      const complaintId = text.toUpperCase();
      // This would need to be implemented with the Complaint model
      await whatsappService.sendTextMessage(
        phoneNumber,
        `To check the status of complaint ${complaintId}, please visit: ${config.clientUrl}/track/${complaintId}`
      );
    } else {
      // Default response
      await whatsappService.sendTextMessage(
        phoneNumber,
        'Welcome to Grievance Portal! 🏛️\n\n' +
        'To file a new complaint, reply with "complaint"\n' +
        'To check complaint status, reply with "status"\n\n' +
        'For help, contact support.'
      );
    }
  } else if (messageType === 'interactive') {
    // Handle button/list responses
    const interactiveType = message.interactive.type;
    if (interactiveType === 'button_reply') {
      const buttonId = message.interactive.button_reply.id;
      await handleButtonResponse(phoneNumber, buttonId);
    } else if (interactiveType === 'list_reply') {
      const listId = message.interactive.list_reply.id;
      await handleListResponse(phoneNumber, listId);
    }
  }
}

/**
 * Handle WhatsApp message status updates
 */
async function handleStatusUpdate(status) {
  const messageId = status.id;
  const statusType = status.status; // sent, delivered, read, failed

  console.log(`Message ${messageId} status: ${statusType}`);

  // You can update your database here to track delivery status
  if (statusType === 'failed') {
    console.error(`Message ${messageId} failed:`, status.errors);
    // Log failure to audit log
  }
}

/**
 * Handle interactive button responses
 */
async function handleButtonResponse(phoneNumber, buttonId) {
  switch (buttonId) {
    case 'new_complaint':
      const sessionId = crypto.randomBytes(16).toString('hex');
      await whatsappService.sendComplaintLink(phoneNumber, sessionId, 'en');
      break;
    case 'check_status':
      await whatsappService.sendTextMessage(
        phoneNumber,
        'Please enter your Complaint ID to check status.'
      );
      break;
    default:
      console.log('Unknown button:', buttonId);
  }
}

/**
 * Handle interactive list responses
 */
async function handleListResponse(phoneNumber, listId) {
  // Handle category selection, language selection, etc.
  console.log('List selection:', listId);
}

/**
 * Manual trigger to send complaint link (for testing)
 */
const { auth } = require('../middleware');
router.post('/send-link', auth, async (req, res) => {
  try {
    const { phoneNumber, sessionId, language } = req.body;

    if (!phoneNumber || !sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Phone number and session ID are required',
      });
    }

    const result = await whatsappService.sendComplaintLink(
      phoneNumber,
      sessionId,
      language || 'en'
    );

    res.json({
      success: result.success,
      messageId: result.messageId,
      error: result.error,
    });
  } catch (error) {
    console.error('Send link error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send link',
    });
  }
});

module.exports = router;
