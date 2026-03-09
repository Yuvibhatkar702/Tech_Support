const config = require('../config');

class SMSService {
  constructor() {
    const { accountSid, authToken, whatsappFrom } = config.sms || {};
    this.enabled = !!(accountSid && authToken && whatsappFrom);
    this.whatsappFrom = whatsappFrom;
    if (this.enabled) {
      const twilio = require('twilio');
      this.client = twilio(accountSid, authToken);
    }
  }

  /**
   * Normalise phone to E.164 format (+91XXXXXXXXXX)
   */
  normalizePhone(phone) {
    if (!phone) return null;
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
    if (digits.length === 10) return `+91${digits}`;
    if (digits.startsWith('+')) return phone;
    return null;
  }

  /**
   * Send WhatsApp message via Twilio
   */
  async send(phoneNumber, message) {
    const phone = this.normalizePhone(phoneNumber);
    if (!phone) {
      console.warn('WhatsApp: invalid phone number', phoneNumber);
      return { success: false, reason: 'invalid_phone' };
    }

    if (!this.enabled) {
      console.log(`WhatsApp [dev]: To ${phone} → ${message}`);
      return { success: true, dev: true };
    }

    try {
      const result = await this.client.messages.create({
        body: message,
        from: `whatsapp:${this.whatsappFrom}`,
        to: `whatsapp:${phone}`,
      });
      console.log(`WhatsApp sent to ${phone} (SID: ${result.sid})`);
      return { success: true, sid: result.sid };
    } catch (err) {
      console.error('WhatsApp send failed:', err.message);
      return { success: false, reason: err.message };
    }
  }

  // ── Pre-built message templates ─────────────────────────────────────

  async notifyComplaintSubmitted(complaint) {
    const msg =
      `Your complaint ${complaint.complaintId} has been registered successfully.\n` +
      `Category: ${complaint.category}\n` +
      `Track: ${config.clientUrl}/track/${complaint.complaintId}\n` +
      `— Municipal Grievance Portal`;
    return this.send(complaint.user?.phoneNumber, msg);
  }

  async notifyComplaintClosed(complaint) {
    const msg =
      `Your complaint ${complaint.complaintId} has been resolved and closed.\n` +
      `Resolution: ${complaint.resolution?.description || 'Issue resolved'}\n` +
      `View: ${config.clientUrl}/track/${complaint.complaintId}\n` +
      `— Municipal Grievance Portal`;
    return this.send(complaint.user?.phoneNumber, msg);
  }

  async notifyStatusUpdate(complaint, newStatus) {
    const statusLabels = {
      pending: 'Pending',
      assigned: 'Assigned to officer',
      in_progress: 'In Progress',
      closed: 'Resolved & Closed',
      rejected: 'Rejected',
      reopened: 'Reopened',
    };
    const label = statusLabels[newStatus] || newStatus;
    const msg =
      `Update on complaint ${complaint.complaintId}: Status changed to "${label}".\n` +
      `Track: ${config.clientUrl}/track/${complaint.complaintId}\n` +
      `— Municipal Grievance Portal`;
    return this.send(complaint.user?.phoneNumber, msg);
  }
}

module.exports = new SMSService();
