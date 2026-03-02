import { useEffect, useState, useCallback } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || '';

let socket = null;

export function useSocket(userId, userRole = 'admin') {
  const [isConnected, setIsConnected] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!socket) {
      socket = io(SOCKET_URL, {
        autoConnect: false,
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });
    }

    socket.connect();

    socket.on('connect', () => {
      setIsConnected(true);
      
      // Join appropriate room based on role
      if (userRole === 'admin' || userRole === 'superadmin') {
        socket.emit('join-admin-room');
      }
      if (userId) {
        socket.emit('join-user-room', userId);
      }
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      setIsConnected(false);
    });

    // Listen for various notification types
    socket.on('new-complaint', (data) => {
      addNotification({
        type: 'new-complaint',
        title: 'New Complaint Filed',
        message: `A new ${data.category} complaint has been filed`,
        data,
        timestamp: new Date(),
      });
    });

    socket.on('status-update', (data) => {
      addNotification({
        type: 'status-update',
        title: 'Status Updated',
        message: `Complaint ${data.complaintId} status changed to ${data.newStatus}`,
        data,
        timestamp: new Date(),
      });
    });

    socket.on('complaint-upvoted', (data) => {
      addNotification({
        type: 'upvote',
        title: 'New Support',
        message: `Your complaint received a new upvote (${data.totalUpvotes} total)`,
        data,
        timestamp: new Date(),
      });
    });

    socket.on('complaint-escalated', (data) => {
      addNotification({
        type: 'escalation',
        title: '⚠️ Complaint Escalated',
        message: `Complaint ${data.complaintId} has been escalated to level ${data.escalationLevel}`,
        data,
        timestamp: new Date(),
        priority: 'high',
      });
    });

    socket.on('sla-warning', (data) => {
      addNotification({
        type: 'sla-warning',
        title: '⏰ SLA Warning',
        message: `${data.count} complaints are approaching SLA breach`,
        data,
        timestamp: new Date(),
        priority: 'medium',
      });
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('connect_error');
      socket.off('new-complaint');
      socket.off('status-update');
      socket.off('complaint-upvoted');
      socket.off('complaint-escalated');
      socket.off('sla-warning');
    };
  }, [userId, userRole]);

  const addNotification = useCallback((notification) => {
    const newNotification = {
      id: Date.now() + Math.random(),
      read: false,
      ...notification,
    };
    
    setNotifications((prev) => [newNotification, ...prev].slice(0, 50));
    setUnreadCount((prev) => prev + 1);

    // Show browser notification if permitted
    if (Notification.permission === 'granted') {
      new Notification(notification.title, {
        body: notification.message,
        icon: '/icons/icon-192x192.png',
        tag: notification.type,
      });
    }
  }, []);

  const markAsRead = useCallback((notificationId) => {
    setNotifications((prev) =>
      prev.map((n) =>
        n.id === notificationId ? { ...n, read: true } : n
      )
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
    setUnreadCount(0);
  }, []);

  const joinComplaintRoom = useCallback((complaintId) => {
    if (socket && isConnected) {
      socket.emit('join-complaint-room', complaintId);
    }
  }, [isConnected]);

  const leaveComplaintRoom = useCallback((complaintId) => {
    if (socket && isConnected) {
      socket.emit('leave-complaint-room', complaintId);
    }
  }, [isConnected]);

  return {
    isConnected,
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    clearNotifications,
    joinComplaintRoom,
    leaveComplaintRoom,
  };
}

// Request notification permission
export async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }

  return false;
}

// Register service worker for push notifications
export async function registerPushNotifications(citizenToken) {
  try {
    const registration = await navigator.serviceWorker.ready;
    
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: import.meta.env.VITE_VAPID_PUBLIC_KEY,
    });

    // Send subscription to server
    await fetch('/api/citizen/push-subscription', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${citizenToken}`,
      },
      body: JSON.stringify(subscription),
    });

    return true;
  } catch (error) {
    console.error('Failed to register push notifications:', error);
    return false;
  }
}
