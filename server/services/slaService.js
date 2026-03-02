const cron = require('node-cron');
const Complaint = require('../models/Complaint');
const Admin = require('../models/Admin');
const { notifyEscalation, notifyAdmin } = require('./socketService');
const { sendEscalationEmail } = require('./emailService');

// SLA Configuration (in hours)
const SLA_CONFIG = {
  road_damage: { target: 72, warning: 48 },
  street_light: { target: 48, warning: 24 },
  water_supply: { target: 24, warning: 12 },
  sewage: { target: 24, warning: 12 },
  garbage: { target: 24, warning: 12 },
  encroachment: { target: 168, warning: 120 }, // 7 days
  noise_pollution: { target: 48, warning: 24 },
  illegal_construction: { target: 168, warning: 120 },
  traffic: { target: 72, warning: 48 },
  other: { target: 72, warning: 48 },
};

// Escalation levels and their admin roles
const ESCALATION_LEVELS = {
  1: 'admin',           // Regular admin
  2: 'supervisor',      // Supervisor
  3: 'super_admin',     // Super admin
};

// Calculate target resolution date based on category
const calculateTargetDate = (category, createdAt) => {
  const slaHours = SLA_CONFIG[category]?.target || 72;
  const baseDate = createdAt ? new Date(createdAt) : new Date();
  
  // Ensure we have a valid date
  if (isNaN(baseDate.getTime())) {
    const now = new Date();
    now.setHours(now.getHours() + slaHours);
    return now;
  }
  
  const targetDate = new Date(baseDate);
  targetDate.setHours(targetDate.getHours() + slaHours);
  return targetDate;
};

// Check if complaint is overdue
const isOverdue = (complaint) => {
  if (!complaint.sla?.targetResolutionDate) return false;
  return new Date() > new Date(complaint.sla.targetResolutionDate);
};

// Get hours remaining until SLA breach
const getHoursRemaining = (complaint) => {
  if (!complaint.sla?.targetResolutionDate) return null;
  const remaining = new Date(complaint.sla.targetResolutionDate) - new Date();
  return Math.max(0, Math.floor(remaining / (1000 * 60 * 60)));
};

// Initialize SLA for new complaint
const initializeSLA = async (complaint) => {
  // Use current time if createdAt is not yet set
  const createdTime = complaint.createdAt || new Date();
  const targetDate = calculateTargetDate(complaint.category, createdTime);
  
  complaint.sla = {
    targetResolutionDate: targetDate,
    isOverdue: false,
    escalationLevel: 0,
    escalationHistory: [],
  };
  return complaint;
};

// Escalate complaint to next level
const escalateComplaint = async (complaint, reason) => {
  const currentLevel = complaint.sla?.escalationLevel || 0;
  const newLevel = currentLevel + 1;
  
  if (newLevel > 3) {
    console.log(`Complaint ${complaint.complaintId} already at max escalation`);
    return complaint;
  }

  // Find admin at the escalation level
  const targetRole = ESCALATION_LEVELS[newLevel];
  let targetAdmin = null;

  if (targetRole === 'super_admin') {
    targetAdmin = await Admin.findOne({ role: 'super_admin', isActive: true });
  } else if (targetRole === 'supervisor') {
    // First try to find a supervisor
    targetAdmin = await Admin.findOne({ role: 'admin', isActive: true })
      .sort({ 'permissions.canAssignComplaints': -1 });
  } else {
    // Assign to any available admin
    targetAdmin = await Admin.findOne({ 
      isActive: true,
      _id: { $ne: complaint.assignedTo }
    });
  }

  // Update complaint
  if (!complaint.sla) {
    complaint.sla = {
      targetResolutionDate: calculateTargetDate(complaint.category, complaint.createdAt),
      isOverdue: true,
      escalationLevel: 0,
      escalationHistory: [],
    };
  }

  complaint.sla.escalationLevel = newLevel;
  complaint.sla.isOverdue = true;
  complaint.sla.escalationHistory.push({
    level: newLevel,
    escalatedTo: targetAdmin?._id,
    escalatedAt: new Date(),
    reason,
  });

  // If we found a target admin, assign and notify
  if (targetAdmin) {
    complaint.assignedTo = targetAdmin._id;
    
    // Send real-time notification
    notifyEscalation(complaint, { level: newLevel, reason });
    notifyAdmin(targetAdmin._id.toString(), 'complaint:assigned', {
      complaintId: complaint.complaintId,
      _id: complaint._id,
      escalationLevel: newLevel,
      reason,
    });

    // Send email notification
    if (targetAdmin.email) {
      await sendEscalationEmail(targetAdmin.email, complaint, newLevel);
    }
  }

  await complaint.save();
  console.log(`📈 Escalated complaint ${complaint.complaintId} to level ${newLevel}`);
  
  return complaint;
};

// Process SLA checks for all pending complaints
const processSLAChecks = async () => {
  console.log('🕐 Running SLA check...');
  
  try {
    // Find all non-closed complaints
    const complaints = await Complaint.find({
      status: { $in: ['pending', 'in_progress'] },
    });

    let overdueCount = 0;
    let warningCount = 0;
    let escalatedCount = 0;

    for (const complaint of complaints) {
      // Initialize SLA if not set
      if (!complaint.sla?.targetResolutionDate) {
        await initializeSLA(complaint);
        await complaint.save();
      }

      const hoursRemaining = getHoursRemaining(complaint);
      const slaConfig = SLA_CONFIG[complaint.category] || SLA_CONFIG.other;

      // Check if overdue
      if (isOverdue(complaint)) {
        overdueCount++;
        
        if (!complaint.sla.isOverdue) {
          complaint.sla.isOverdue = true;
          await complaint.save();
        }

        // Determine if escalation is needed
        const daysSinceCreation = Math.floor(
          (Date.now() - new Date(complaint.createdAt)) / (1000 * 60 * 60 * 24)
        );
        
        const currentLevel = complaint.sla?.escalationLevel || 0;
        
        // Escalation thresholds (in days overdue)
        if (daysSinceCreation > 14 && currentLevel < 3) {
          await escalateComplaint(complaint, 'Overdue for more than 14 days');
          escalatedCount++;
        } else if (daysSinceCreation > 7 && currentLevel < 2) {
          await escalateComplaint(complaint, 'Overdue for more than 7 days');
          escalatedCount++;
        } else if (daysSinceCreation > 3 && currentLevel < 1) {
          await escalateComplaint(complaint, 'Overdue for more than 3 days');
          escalatedCount++;
        }
      } 
      // Check if in warning zone
      else if (hoursRemaining <= slaConfig.warning) {
        warningCount++;
        // Could send warning notifications here
      }
    }

    console.log(`✅ SLA check complete: ${overdueCount} overdue, ${warningCount} warnings, ${escalatedCount} escalated`);
  } catch (error) {
    console.error('❌ SLA check error:', error);
  }
};

// Get SLA statistics
const getSLAStats = async () => {
  const now = new Date();
  
  const stats = await Complaint.aggregate([
    {
      $match: {
        status: { $in: ['pending', 'in_progress'] },
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        overdue: {
          $sum: {
            $cond: [
              { $and: [
                { $ne: ['$sla.targetResolutionDate', null] },
                { $lt: ['$sla.targetResolutionDate', now] }
              ]},
              1,
              0
            ]
          }
        },
        level1Escalations: {
          $sum: { $cond: [{ $eq: ['$sla.escalationLevel', 1] }, 1, 0] }
        },
        level2Escalations: {
          $sum: { $cond: [{ $eq: ['$sla.escalationLevel', 2] }, 1, 0] }
        },
        level3Escalations: {
          $sum: { $cond: [{ $eq: ['$sla.escalationLevel', 3] }, 1, 0] }
        },
      }
    }
  ]);

  return stats[0] || {
    total: 0,
    overdue: 0,
    level1Escalations: 0,
    level2Escalations: 0,
    level3Escalations: 0,
  };
};

// Initialize SLA cron job (runs every hour)
const initializeSLACron = () => {
  // Run SLA check every hour
  cron.schedule('0 * * * *', processSLAChecks);
  
  // Also run once on startup
  setTimeout(processSLAChecks, 5000);
  
  console.log('⏰ SLA monitoring cron job initialized');
};

module.exports = {
  SLA_CONFIG,
  calculateTargetDate,
  isOverdue,
  getHoursRemaining,
  initializeSLA,
  escalateComplaint,
  processSLAChecks,
  getSLAStats,
  initializeSLACron,
};
