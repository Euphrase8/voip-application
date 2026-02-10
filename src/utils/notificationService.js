// Notification service for VoIP application
// Handles system notifications, logs, and user feedback

import toast from 'react-hot-toast';
import { showToast, callToast, healthToast } from './toastUtils';

class NotificationService {
  constructor() {
    this.notifications = [];
    this.logs = [];
    this.understandingLogs = [];
    this.listeners = [];
    this.maxNotifications = 50;
    this.maxLogs = 100;
    this.maxUnderstandingLogs = 200;

    // Load existing data
    this.loadFromStorage();

    // Set up console monitoring
    this.setupConsoleMonitoring();
  }

  // Load notifications and logs from localStorage
  loadFromStorage() {
    try {
      const savedNotifications = localStorage.getItem('voipNotifications');
      if (savedNotifications) {
        this.notifications = JSON.parse(savedNotifications);
      }

      const savedLogs = localStorage.getItem('voipSystemLogs');
      if (savedLogs) {
        this.logs = JSON.parse(savedLogs);
      }

      const savedUnderstandingLogs = localStorage.getItem('voipUnderstandingLogs');
      if (savedUnderstandingLogs) {
        this.understandingLogs = JSON.parse(savedUnderstandingLogs);
      }
    } catch (error) {
      console.error('Failed to load notifications from storage:', error);
    }
  }

  // Save to localStorage
  saveToStorage() {
    try {
      localStorage.setItem('voipNotifications', JSON.stringify(this.notifications));
      localStorage.setItem('voipSystemLogs', JSON.stringify(this.logs));
      localStorage.setItem('voipUnderstandingLogs', JSON.stringify(this.understandingLogs));
    } catch (error) {
      console.error('Failed to save notifications to storage:', error);
    }
  }

  // Set up console monitoring for automatic log capture
  setupConsoleMonitoring() {
    const originalConsole = {
      log: console.log,
      warn: console.warn,
      error: console.error,
      info: console.info
    };

    // Override console methods
    console.log = (...args) => {
      originalConsole.log(...args);
      this.addLog('info', args.map(formatArg).join(' '));
    };

    console.warn = (...args) => {
      originalConsole.warn(...args);
      this.addLog('warning', args.map(formatArg).join(' '));
    };

    const formatArg = (a) => {
      try {
        if (a instanceof Error) return a.message || String(a);
        // Browser WS errors are often Event / ProgressEvent
        if (a && typeof a === 'object' && (a.type || a.target)) {
          const type = a.type ? String(a.type) : 'event';
          const target = a.target && a.target.url ? ` ${a.target.url}` : '';
          return `[${type}]${target}`;
        }
        if (typeof a === 'string') return a;
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    };

    console.error = (...args) => {
      originalConsole.error(...args);
      this.addLog('error', args.map(formatArg).join(' '));
    };

    console.info = (...args) => {
      originalConsole.info(...args);
      this.addLog('info', args.map(formatArg).join(' '));
    };
  }

  // Add a notification
  addNotification(type, title, message, options = {}) {
    const notification = {
      id: Date.now() + Math.random(),
      type,
      title,
      message,
      timestamp: new Date().toISOString(),
      read: false,
      ...options
    };

    this.notifications.unshift(notification);
    
    // Keep only the latest notifications
    if (this.notifications.length > this.maxNotifications) {
      this.notifications = this.notifications.slice(0, this.maxNotifications);
    }

    this.saveToStorage();
    this.notifyListeners('notification', notification);

    // Show toast notification
    this.showToast(type, title, message);

    return notification;
  }

  // Add a system log
  addLog(level, message, context = {}) {
    const log = {
      id: Date.now() + Math.random(),
      level,
      message,
      timestamp: new Date().toISOString(),
      context
    };

    this.logs.unshift(log);

    // Keep only the latest logs
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(0, this.maxLogs);
    }

    this.saveToStorage();
    this.notifyListeners('log', log);

    return log;
  }

  // Add an understanding log
  addUnderstandingLog(type, action, details = {}) {
    const understandingLog = {
      id: Date.now() + Math.random(),
      type, // 'user_action', 'ai_response', 'comprehension', 'error_recovery', 'learning'
      action,
      details,
      timestamp: new Date().toISOString(),
      sessionId: this.getSessionId(),
      confidence: details.confidence || null,
      context: details.context || {}
    };

    this.understandingLogs.unshift(understandingLog);

    // Keep only the latest understanding logs
    if (this.understandingLogs.length > this.maxUnderstandingLogs) {
      this.understandingLogs = this.understandingLogs.slice(0, this.maxUnderstandingLogs);
    }

    this.saveToStorage();
    this.notifyListeners('understanding_log', understandingLog);

    return understandingLog;
  }

  // Show toast notification using enhanced toast methods
  showToast(type, title, message) {
    const toastOptions = {
      duration: 4000,
      position: 'top-right'
    };

    switch (type) {
      case 'success':
        showToast.success(title, toastOptions);
        break;
      case 'error':
        showToast.error(title, toastOptions);
        break;
      case 'warning':
        showToast.warning(title, toastOptions);
        break;
      case 'info':
        showToast.info(title, toastOptions);
        break;
      case 'call':
        showToast.call(title, toastOptions);
        break;
      default:
        toast(title, toastOptions);
    }
  }

  // Predefined notification types
  callConnected(extension) {
    return this.addNotification(
      'success',
      'Call Connected',
      `Successfully connected to extension ${extension}`,
      { category: 'call' }
    );
  }

  callFailed(extension, reason) {
    return this.addNotification(
      'error',
      'Call Failed',
      `Failed to connect to extension ${extension}: ${reason}`,
      { category: 'call' }
    );
  }

  callEnded(extension, duration) {
    return this.addNotification(
      'info',
      'Call Ended',
      `Call with extension ${extension} ended. Duration: ${duration}`,
      { category: 'call' }
    );
  }

  incomingCall(extension) {
    return this.addNotification(
      'call',
      'Incoming Call',
      `Incoming call from extension ${extension}`,
      { category: 'call', priority: 'high' }
    );
  }

  networkIssue(message) {
    return this.addNotification(
      'warning',
      'Network Issue',
      message,
      { category: 'network' }
    );
  }

  systemUpdate(message) {
    return this.addNotification(
      'info',
      'System Update',
      message,
      { category: 'system' }
    );
  }

  microphoneError(message) {
    return this.addNotification(
      'error',
      'Microphone Error',
      message,
      { category: 'audio' }
    );
  }

  // Get notifications
  getNotifications() {
    return this.notifications;
  }

  // Get logs
  getLogs() {
    return this.logs;
  }

  // Get all understanding logs
  getUnderstandingLogs() {
    return this.understandingLogs;
  }

  // Get combined logs (system + understanding)
  getCombinedLogs() {
    const systemLogs = this.logs.map(log => ({
      ...log,
      logType: 'system'
    }));

    const understandingLogs = this.understandingLogs.map(log => ({
      ...log,
      logType: 'understanding'
    }));

    // Combine and sort by timestamp
    return [...systemLogs, ...understandingLogs]
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  // Get unread notifications count
  getUnreadCount() {
    return this.notifications.filter(n => !n.read).length;
  }

  // Mark notification as read
  markAsRead(id) {
    const notification = this.notifications.find(n => n.id === id);
    if (notification) {
      notification.read = true;
      this.saveToStorage();
      this.notifyListeners('read', notification);
    }
  }

  // Mark all notifications as read
  markAllAsRead() {
    this.notifications.forEach(n => n.read = true);
    this.saveToStorage();
    this.notifyListeners('readAll');
  }

  // Clear notifications
  clearNotifications() {
    this.notifications = [];
    this.saveToStorage();
    this.notifyListeners('clear');
  }

  // Clear logs
  clearLogs() {
    this.logs = [];
    this.saveToStorage();
    this.notifyListeners('clearLogs');
  }

  // Clear understanding logs
  clearUnderstandingLogs() {
    this.understandingLogs = [];
    this.saveToStorage();
    this.notifyListeners('clearUnderstandingLogs');
  }

  // Clear all logs (system + understanding)
  clearAllLogs() {
    this.logs = [];
    this.understandingLogs = [];
    this.saveToStorage();
    this.notifyListeners('clearAllLogs');
  }

  // Add listener for notifications/logs updates
  addListener(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(l => l !== callback);
    };
  }

  // Notify all listeners
  notifyListeners(type, data) {
    this.listeners.forEach(callback => {
      try {
        callback(type, data);
      } catch (error) {
        console.error('Error in notification listener:', error);
      }
    });
  }

  // Generate test notifications for development
  generateTestNotifications() {
    const testNotifications = [
      { type: 'success', title: 'Call Connected', message: 'Successfully connected to extension 1001' },
      { type: 'warning', title: 'Network Warning', message: 'Connection quality is poor' },
      { type: 'error', title: 'Call Failed', message: 'Failed to connect to extension 1002' },
      { type: 'info', title: 'System Update', message: 'VoIP system has been updated' },
      { type: 'call', title: 'Incoming Call', message: 'Call from extension 1003' }
    ];

    testNotifications.forEach((notif, index) => {
      setTimeout(() => {
        this.addNotification(notif.type, notif.title, notif.message);
      }, index * 500);
    });
  }

  // Get session ID for understanding logs
  getSessionId() {
    if (!this.sessionId) {
      this.sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    return this.sessionId;
  }

  // Helper methods for understanding logs
  logUserAction(action, details = {}) {
    return this.addUnderstandingLog('user_action', action, details);
  }

  logAIResponse(response, confidence = null, context = {}) {
    return this.addUnderstandingLog('ai_response', response, { confidence, context });
  }

  logComprehension(level, details = {}) {
    return this.addUnderstandingLog('comprehension', level, details);
  }

  logErrorRecovery(error, recovery, details = {}) {
    return this.addUnderstandingLog('error_recovery', `${error} -> ${recovery}`, details);
  }

  logLearning(insight, confidence = null, context = {}) {
    return this.addUnderstandingLog('learning', insight, { confidence, context });
  }

  // Get statistics
  getStats() {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const todayNotifications = this.notifications.filter(n =>
      new Date(n.timestamp) >= today
    );

    const todayLogs = this.logs.filter(l =>
      new Date(l.timestamp) >= today
    );

    const todayUnderstandingLogs = this.understandingLogs.filter(l =>
      new Date(l.timestamp) >= today
    );

    return {
      totalNotifications: this.notifications.length,
      unreadNotifications: this.getUnreadCount(),
      todayNotifications: todayNotifications.length,
      totalLogs: this.logs.length,
      todayLogs: todayLogs.length,
      errorLogs: this.logs.filter(l => l.level === 'error').length,
      warningLogs: this.logs.filter(l => l.level === 'warning').length,
      totalUnderstandingLogs: this.understandingLogs.length,
      todayUnderstandingLogs: todayUnderstandingLogs.length,
      userActions: this.understandingLogs.filter(l => l.type === 'user_action').length,
      aiResponses: this.understandingLogs.filter(l => l.type === 'ai_response').length,
      comprehensionEvents: this.understandingLogs.filter(l => l.type === 'comprehension').length
    };
  }
}

// Create singleton instance
const notificationService = new NotificationService();

export default notificationService;
