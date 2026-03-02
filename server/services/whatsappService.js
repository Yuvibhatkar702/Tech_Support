const axios = require('axios');
const config = require('../config');
const AuditLog = require('../models/AuditLog');

class WhatsAppService {
  constructor() {
    this.apiUrl = config.whatsapp.apiUrl;
    this.phoneNumberId = config.whatsapp.phoneNumberId;
    this.accessToken = config.whatsapp.accessToken;
  }

  /**
   * Get the base URL for WhatsApp API calls
   */
  getBaseUrl() {
    return `${this.apiUrl}/${this.phoneNumberId}/messages`;
  }

  /**
   * Get authorization headers
   */
  getHeaders() {
    return {
      'Authorization': `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Send a template message (for outside 24-hour window)
   * Templates must be pre-approved by WhatsApp
   */
  async sendTemplateMessage(phoneNumber, templateName, languageCode, components = []) {
    try {
      const response = await axios.post(
        this.getBaseUrl(),
        {
          messaging_product: 'whatsapp',
          to: phoneNumber,
          type: 'template',
          template: {
            name: templateName,
            language: {
              code: languageCode,
            },
            components,
          },
        },
        { headers: this.getHeaders() }
      );

      return {
        success: true,
        messageId: response.data.messages?.[0]?.id,
        data: response.data,
      };
    } catch (error) {
      console.error('WhatsApp template message failed:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data || error.message,
      };
    }
  }

  /**
   * Send a text message (within 24-hour window)
   */
  async sendTextMessage(phoneNumber, message) {
    try {
      const response = await axios.post(
        this.getBaseUrl(),
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: phoneNumber,
          type: 'text',
          text: {
            preview_url: false,
            body: message,
          },
        },
        { headers: this.getHeaders() }
      );

      return {
        success: true,
        messageId: response.data.messages?.[0]?.id,
        data: response.data,
      };
    } catch (error) {
      console.error('WhatsApp text message failed:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data || error.message,
      };
    }
  }

  /**
   * Send status update notification
   * Uses templates for compliance with WhatsApp 24-hour window
   */
  async sendStatusUpdate(complaint, newStatus) {
    const phoneNumber = complaint.user.phoneNumber;
    const complaintId = complaint.complaintId;
    const language = complaint.user.preferredLanguage || 'en';

    // Map status to template names (these must be created in WhatsApp Business Manager)
    const templateMap = {
      pending: 'complaint_received',
      in_progress: 'complaint_in_progress',
      closed: 'complaint_resolved',
      rejected: 'complaint_rejected',
    };

    const templateName = templateMap[newStatus];
    if (!templateName) {
      return { success: false, error: 'Unknown status' };
    }

    // Status messages in different languages
    const statusMessages = this.getStatusMessages(newStatus, complaintId, language);

    // Try sending template message first (works outside 24-hour window)
    const templateResult = await this.sendTemplateMessage(
      phoneNumber,
      templateName,
      language === 'hi' ? 'hi' : 'en',
      [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: complaintId },
            { type: 'text', text: statusMessages.shortStatus },
          ],
        },
      ]
    );

    // Log the attempt
    await AuditLog.log(templateResult.success ? 'whatsapp_sent' : 'whatsapp_failed', {
      complaint: complaint._id,
      complaintId: complaint.complaintId,
      userPhone: phoneNumber,
      details: {
        status: newStatus,
        templateName,
        messageId: templateResult.messageId,
      },
      success: templateResult.success,
      errorMessage: templateResult.error?.message,
    });

    return templateResult;
  }

  /**
   * Get status messages in different languages
   */
  getStatusMessages(status, complaintId, language) {
    const messages = {
      en: {
        pending: {
          title: 'Complaint Received',
          shortStatus: 'Pending Review',
          body: `Your complaint (${complaintId}) has been received and is pending review. We will update you on the progress.`,
        },
        in_progress: {
          title: 'Work In Progress',
          shortStatus: 'In Progress',
          body: `Your complaint (${complaintId}) is now being worked on. Our team is addressing the issue.`,
        },
        closed: {
          title: 'Complaint Closed',
          shortStatus: 'Closed',
          body: `Your complaint (${complaintId}) has been closed. Thank you for helping improve our community.`,
        },
        rejected: {
          title: 'Complaint Update',
          shortStatus: 'Rejected',
          body: `Your complaint (${complaintId}) could not be processed. Please contact support for more information.`,
        },
      },
      hi: {
        pending: {
          title: 'शिकायत प्राप्त हुई',
          shortStatus: 'समीक्षाधीन',
          body: `आपकी शिकायत (${complaintId}) प्राप्त हो गई है और समीक्षाधीन है। हम आपको प्रगति के बारे में अपडेट करेंगे।`,
        },
        in_progress: {
          title: 'कार्य प्रगति पर',
          shortStatus: 'प्रगति पर',
          body: `आपकी शिकायत (${complaintId}) पर अब काम किया जा रहा है। हमारी टीम इस मुद्दे को संबोधित कर रही है।`,
        },
        closed: {
          title: 'शिकायत बंद',
          shortStatus: 'बंद',
          body: `आपकी शिकायत (${complaintId}) बंद कर दी गई है। हमारे समुदाय को बेहतर बनाने में मदद करने के लिए धन्यवाद।`,
        },
        rejected: {
          title: 'शिकायत अपडेट',
          shortStatus: 'अस्वीकृत',
          body: `आपकी शिकायत (${complaintId}) संसाधित नहीं की जा सकी। अधिक जानकारी के लिए कृपया सहायता से संपर्क करें।`,
        },
      },
      ta: {
        pending: {
          title: 'புகார் பெறப்பட்டது',
          shortStatus: 'மதிப்பாய்வு நிலுவையில்',
          body: `உங்கள் புகார் (${complaintId}) பெறப்பட்டு மதிப்பாய்வில் உள்ளது. முன்னேற்றத்தைப் பற்றி உங்களுக்குத் தெரிவிப்போம்.`,
        },
        in_progress: {
          title: 'பணி நடைபெறுகிறது',
          shortStatus: 'நடைபெறுகிறது',
          body: `உங்கள் புகார் (${complaintId}) இப்போது பணியில் உள்ளது. எங்கள் குழு பிரச்சினையை தீர்க்கிறது.`,
        },
        closed: {
          title: 'புகார் மூடப்பட்டது',
          shortStatus: 'மூடப்பட்டது',
          body: `உங்கள் புகார் (${complaintId}) தீர்க்கப்பட்டது. எங்கள் சமூகத்தை மேம்படுத்த உதவியதற்கு நன்றி.`,
        },
        rejected: {
          title: 'புகார் புதுப்பிப்பு',
          shortStatus: 'நிராகரிக்கப்பட்டது',
          body: `உங்கள் புகார் (${complaintId}) செயலாக்க முடியவில்லை. மேலும் தகவலுக்கு ஆதரவைத் தொடர்புகொள்ளவும்.`,
        },
      },
    };

    return messages[language]?.[status] || messages['en'][status];
  }

  /**
   * Send complaint submission link
   */
  async sendComplaintLink(phoneNumber, sessionId, language = 'en') {
    const linkMessages = {
      en: `Please click the link below to submit your complaint with photo and location:\n\n${config.clientUrl}/submit/${sessionId}\n\nThis link will expire in 24 hours.`,
      hi: `कृपया फोटो और स्थान के साथ अपनी शिकायत जमा करने के लिए नीचे दिए गए लिंक पर क्लिक करें:\n\n${config.clientUrl}/submit/${sessionId}\n\nयह लिंक 24 घंटे में समाप्त हो जाएगा।`,
      ta: `புகாரை புகைப்படம் மற்றும் இடத்துடன் சமர்ப்பிக்க கீழே உள்ள இணைப்பைக் கிளிக் செய்யவும்:\n\n${config.clientUrl}/submit/${sessionId}\n\nஇந்த இணைப்பு 24 மணி நேரத்தில் காலாவதியாகும்.`,
    };

    const message = linkMessages[language] || linkMessages['en'];
    return this.sendTextMessage(phoneNumber, message);
  }

  /**
   * Mark message as read
   */
  async markAsRead(messageId) {
    try {
      await axios.post(
        this.getBaseUrl(),
        {
          messaging_product: 'whatsapp',
          status: 'read',
          message_id: messageId,
        },
        { headers: this.getHeaders() }
      );
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = new WhatsAppService();
