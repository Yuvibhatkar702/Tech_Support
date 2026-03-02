import axios from 'axios';
import { useAuthStore, useOfficialStore } from '../store';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
// Checks both the admin store and the official store so officer/dept-head
// API calls automatically include the right bearer token.
api.interceptors.request.use(
  (config) => {
    // If the caller already set an Authorization header (e.g. citizen API), keep it
    if (config.headers.Authorization) return config;

    // Prefer official store token (dept-head / officer), fall back to admin store
    const officialToken = useOfficialStore.getState().token;
    const adminToken = useAuthStore.getState().token;
    const token = officialToken || adminToken;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Mark activity on every outgoing API call
    const keys = ['adminSession', 'officerSession'];
    keys.forEach((k) => {
      if (localStorage.getItem(k)) localStorage.setItem(k, Date.now().toString());
    });

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor:
// 1. Capture x-refresh-token header (sliding session) and update correct store
// 2. Handle 401 to auto-logout stale sessions
api.interceptors.response.use(
  (response) => {
    // ── Sliding session: pick up the refreshed JWT ──────────────────
    const freshToken = response.headers['x-refresh-token'];
    if (freshToken) {
      // Determine which store owns the token that was sent
      const officialToken = useOfficialStore.getState().token;
      const adminToken = useAuthStore.getState().token;

      if (officialToken && response.config?.headers?.Authorization?.includes(officialToken)) {
        useOfficialStore.getState().login(useOfficialStore.getState().official, freshToken);
      } else if (adminToken && response.config?.headers?.Authorization?.includes(adminToken)) {
        useAuthStore.getState().login(useAuthStore.getState().admin, freshToken);
      }
    }

    return response;
  },
  (error) => {
    // On 401 (Unauthorized), the JWT might have expired or become invalid
    // Clear both stores to force re-login
    if (error.response?.status === 401) {
      const message = error.response?.data?.message || '';
      // Only auto-clear if it's a token issue (not just wrong password on login)
      if (message.includes('expired') || message.includes('Invalid token') || message.includes('Access denied') || message.includes('mismatch')) {
        console.warn('Session expired or invalid token - clearing auth stores');
        // Don't clear during login attempts
        const url = error.config?.url || '';
        if (!url.includes('/login')) {
          useAuthStore.getState().logout();
          useOfficialStore.getState().logout();
          localStorage.removeItem('adminSession');
          localStorage.removeItem('officerSession');
        }
      }
    }
    return Promise.reject(error);
  }
);

// Complaint APIs
export const complaintApi = {
  // Create a new complaint
  create: async (formData) => {
    try {
      const response = await api.post('/complaints', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      return response.data;
    } catch (error) {
      // Handle duplicate detection (409 Conflict)
      if (error.response?.status === 409 && error.response?.data?.isDuplicate) {
        return {
          success: false,
          isDuplicate: true,
          message: error.response.data.message,
          duplicates: error.response.data.duplicates,
        };
      }
      throw error;
    }
  },
  
  // Check for duplicates
  checkDuplicates: async (latitude, longitude, category) => {
    const response = await api.post('/complaints/check-duplicates', {
      latitude,
      longitude,
      category,
    });
    return response.data;
  },
  
  // Reverse geocode
  reverseGeocode: async (latitude, longitude) => {
    const response = await api.get('/complaints/geocode', {
      params: { latitude, longitude },
    });
    return response.data;
  },
  
  // Get complaint status (public)
  getStatus: async (complaintId, phone) => {
    const response = await api.get(`/complaints/status/${complaintId}`, {
      params: phone ? { phone } : {},
    });
    return response.data;
  },

  // Send OTP for mobile-number tracking (public)
  trackSendOTP: async (phoneNumber) => {
    const response = await api.post('/complaints/track/send-otp', { phoneNumber });
    return response.data;
  },

  // Verify OTP and get complaints by mobile number (public)
  trackVerifyOTP: async (phoneNumber, otp) => {
    const response = await api.post('/complaints/track/verify-otp', { phoneNumber, otp });
    return response.data;
  },

  // Reopen a closed complaint (public)
  reopenComplaint: async (complaintId, reason, phone, imageFile) => {
    const formData = new FormData();
    formData.append('reason', reason);
    if (phone) formData.append('phone', phone);
    if (imageFile) formData.append('reopenImage', imageFile);
    
    const response = await api.post(`/complaints/status/${complaintId}/reopen`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  // Rate the officer after resolution (public)
  rateOfficer: async (complaintId, rating, comment, phone) => {
    const response = await api.post(`/complaints/status/${complaintId}/rate`, {
      rating,
      comment: comment || '',
      phone: phone || undefined,
    });
    return response.data;
  },
  
  // Get all complaints (admin)
  getAll: async (params = {}) => {
    const response = await api.get('/complaints', { params });
    return response.data;
  },
  
  // Get single complaint (admin)
  getById: async (id) => {
    const response = await api.get(`/complaints/${id}`);
    return response.data;
  },
  
  // Get complaints for map (admin)
  getForMap: async (params = {}) => {
    const response = await api.get('/complaints/map', { params });
    return response.data;
  },
  
  // Get statistics (admin)
  getStats: async (params = {}) => {
    const response = await api.get('/complaints/stats', { params });
    return response.data;
  },
  
  // Update status (admin)
  updateStatus: async (id, status, remarks) => {
    const response = await api.patch(`/complaints/${id}/status`, {
      status,
      remarks,
    });
    return response.data;
  },
  
  // Assign complaint (admin)
  assign: async (id, adminId) => {
    const response = await api.patch(`/complaints/${id}/assign`, {
      adminId,
    });
    return response.data;
  },
  
  // Get image URL
  getImageUrl: (id) => `${API_BASE_URL}/complaints/${id}/image`,
};

// Admin APIs
export const adminApi = {
  // Initialize super admin (first time only)
  initialize: async (email, password, name) => {
    const response = await api.post('/admin/initialize', {
      email,
      password,
      name,
    });
    return response.data;
  },
  
  // Login
  login: async (email, password) => {
    const response = await api.post('/admin/login', {
      email,
      password,
    });
    return response.data;
  },
  
  // Get profile
  getProfile: async () => {
    const response = await api.get('/admin/profile');
    return response.data;
  },
  
  // Update profile
  updateProfile: async (updates) => {
    const response = await api.patch('/admin/profile', updates);
    return response.data;
  },
  
  // Change password
  changePassword: async (currentPassword, newPassword) => {
    const response = await api.post('/admin/change-password', {
      currentPassword,
      newPassword,
    });
    return response.data;
  },
  
  // Logout
  logout: async () => {
    const response = await api.post('/admin/logout');
    return response.data;
  },
  
  // Get all admins (super admin)
  getAll: async () => {
    const response = await api.get('/admin/all');
    return response.data;
  },
  
  // Create admin (super admin)
  create: async (adminData) => {
    const response = await api.post('/admin', adminData);
    return response.data;
  },
  
  // Update admin (super admin)
  update: async (id, updates) => {
    const response = await api.patch(`/admin/${id}`, updates);
    return response.data;
  },
  
  // Delete admin (super admin)
  delete: async (id) => {
    const response = await api.delete(`/admin/${id}`);
    return response.data;
  },
  
  // Get complaints (admin dashboard)
  getComplaints: async (params = {}) => {
    const response = await api.get('/complaints', { params });
    return response.data;
  },
  
  // Get single complaint (admin)
  getComplaint: async (id) => {
    const response = await api.get(`/complaints/${id}`);
    return response.data;
  },
  
  // Get map data
  getMapData: async (params = {}) => {
    const response = await api.get('/complaints/map', { params });
    return response.data;
  },
  
  // Get statistics
  getStats: async (params = {}) => {
    const response = await api.get('/complaints/stats', { params });
    return response.data;
  },
  
  // Update complaint
  updateComplaint: async (id, updates) => {
    const response = await api.patch(`/complaints/${id}`, updates);
    return response.data;
  },
};

// Citizen Portal APIs
export const citizenApi = {
  // Request OTP
  requestOTP: async (phoneNumber) => {
    const response = await api.post('/citizen/request-otp', { phoneNumber });
    return response.data;
  },

  // Verify OTP
  verifyOTP: async (phoneNumber, otp) => {
    const response = await api.post('/citizen/verify-otp', { phoneNumber, otp });
    return response.data;
  },

  // Get profile
  getProfile: async (token) => {
    const response = await api.get('/citizen/profile', {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.data;
  },

  // Update profile
  updateProfile: async (token, updates) => {
    const response = await api.patch('/citizen/profile', updates, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.data;
  },

  // Get citizen's complaints
  getComplaints: async (token, params = {}) => {
    const response = await api.get('/citizen/complaints', {
      headers: { Authorization: `Bearer ${token}` },
      params,
    });
    return response.data;
  },

  // Submit feedback
  submitFeedback: async (token, complaintId, rating, comment) => {
    const response = await api.post(
      `/citizen/complaints/${complaintId}/feedback`,
      { rating, comment },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return response.data;
  },

  // Logout
  logout: async (token) => {
    const response = await api.post('/citizen/logout', {}, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.data;
  },

  // Register push subscription
  registerPush: async (token, subscription) => {
    const response = await api.post('/citizen/push-subscription', subscription, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.data;
  },
};

// Analytics APIs
export const analyticsApi = {
  // Get dashboard analytics
  getDashboardStats: async (params = {}) => {
    const response = await api.get('/complaints/stats', { params });
    return response.data;
  },

  // Get trend data
  getTrends: async (days = 30) => {
    const response = await api.get('/complaints/stats', {
      params: { trendDays: days },
    });
    return response.data;
  },

  // Get SLA stats
  getSLAStats: async () => {
    const response = await api.get('/complaints/stats');
    return response.data;
  },
};

// ─── Department APIs ────────────────────────────────────────────────
export const departmentApi = {
  getAll: async () => {
    const response = await api.get('/departments');
    return response.data;
  },
  getByCode: async (code) => {
    const response = await api.get(`/departments/${code}`);
    return response.data;
  },
  create: async (data) => {
    const response = await api.post('/departments', data);
    return response.data;
  },
  update: async (id, data) => {
    const response = await api.patch(`/departments/${id}`, data);
    return response.data;
  },
  delete: async (id) => {
    const response = await api.delete(`/departments/${id}`);
    return response.data;
  },
};

// ─── Official APIs (department heads + officers) ────────────────────
export const officialApi = {
  // Official login (email + password)
  login: async (email, password) => {
    const response = await api.post('/officials/login', { email, password });
    return response.data;
  },

  // Get own profile (verify token validity)
  getProfile: async () => {
    const response = await api.get('/officials/profile');
    return response.data;
  },

  // Admin: create department head
  createDepartmentHead: async (data) => {
    const response = await api.post('/officials/department-heads', data);
    return response.data;
  },

  // Admin: create officer
  createOfficer: async (data) => {
    const response = await api.post('/officials/officers', data);
    return response.data;
  },

  // Admin: get all officials
  getAllOfficials: async (params = {}) => {
    const response = await api.get('/officials/all', { params });
    return response.data;
  },

  // Department head: get officers in department
  getDepartmentOfficers: async () => {
    const response = await api.get('/officials/officers');
    return response.data;
  },

  // Department head: get department complaints
  getDepartmentComplaints: async (params = {}) => {
    const response = await api.get('/officials/department/complaints', { params });
    return response.data;
  },

  // Department head: department stats
  getDepartmentStats: async () => {
    const response = await api.get('/officials/department/stats');
    return response.data;
  },

  // Department head: assign officer
  assignOfficer: async (complaintId, officerId) => {
    const response = await api.patch(`/officials/complaints/${complaintId}/assign`, { officerId });
    return response.data;
  },

  // Officer: get assigned complaints
  getOfficerComplaints: async (params = {}) => {
    const response = await api.get('/officials/officer/complaints', { params });
    return response.data;
  },

  // Officer: stats
  getOfficerStats: async () => {
    const response = await api.get('/officials/officer/stats');
    return response.data;
  },

  // Officer: start work
  startWork: async (complaintId) => {
    const response = await api.patch(`/officials/complaints/${complaintId}/start`);
    return response.data;
  },

  // Officer: resolve
  resolveComplaint: async (complaintId, formData) => {
    const response = await api.patch(`/officials/complaints/${complaintId}/resolve`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  // Admin: reassign
  reassignComplaint: async (complaintId, data) => {
    const response = await api.patch(`/officials/complaints/${complaintId}/reassign`, data);
    return response.data;
  },

  // Admin: delete (deactivate) an official
  deleteOfficial: async (id) => {
    const response = await api.delete(`/officials/${id}`);
    return response.data;
  },
};

export default api;
