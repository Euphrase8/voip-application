import clsx from 'clsx';

/**
 * Utility function to combine class names
 */
export const cn = (...classes) => {
  return clsx(...classes);
};

/**
 * Get status color classes
 */
export const getStatusColor = (status, variant = 'bg') => {
  const colors = {
    online: {
      bg: 'bg-success-500',
      text: 'text-success-600',
      border: 'border-success-500',
      ring: 'ring-success-500',
    },
    offline: {
      bg: 'bg-secondary-400',
      text: 'text-secondary-600',
      border: 'border-secondary-400',
      ring: 'ring-secondary-400',
    },
    busy: {
      bg: 'bg-danger-500',
      text: 'text-danger-600',
      border: 'border-danger-500',
      ring: 'ring-danger-500',
    },
    away: {
      bg: 'bg-warning-500',
      text: 'text-warning-600',
      border: 'border-warning-500',
      ring: 'ring-warning-500',
    },
  };

  return colors[status]?.[variant] || colors.offline[variant];
};

/**
 * Get call type color classes
 */
export const getCallTypeColor = (type, variant = 'bg') => {
  const colors = {
    incoming: {
      bg: 'bg-success-500',
      text: 'text-success-600',
      border: 'border-success-500',
    },
    outgoing: {
      bg: 'bg-primary-500',
      text: 'text-primary-600',
      border: 'border-primary-500',
    },
    missed: {
      bg: 'bg-danger-500',
      text: 'text-danger-600',
      border: 'border-danger-500',
    },
    active: {
      bg: 'bg-warning-500',
      text: 'text-warning-600',
      border: 'border-warning-500',
    },
  };

  return colors[type]?.[variant] || colors.outgoing[variant];
};

/**
 * Format duration in seconds to human readable format
 */
export const formatDuration = (seconds) => {
  if (!seconds || seconds < 0) return '00:00';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  
  return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

/**
 * Format date to human readable format
 */
export const formatDate = (date, options = {}) => {
  if (!date) return '';
  
  const dateObj = new Date(date);
  const now = new Date();
  const diffInMs = now - dateObj;
  const diffInHours = diffInMs / (1000 * 60 * 60);
  const diffInDays = diffInMs / (1000 * 60 * 60 * 24);

  // If less than 24 hours ago, show time
  if (diffInHours < 24) {
    return dateObj.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  }

  // If less than 7 days ago, show day of week
  if (diffInDays < 7) {
    return dateObj.toLocaleDateString('en-US', {
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  }

  // Otherwise show full date
  return dateObj.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: dateObj.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    ...options,
  });
};

/**
 * Get initials from name
 */
export const getInitials = (name) => {
  if (!name) return '??';
  
  return name
    .split(' ')
    .map(word => word.charAt(0).toUpperCase())
    .slice(0, 2)
    .join('');
};

/**
 * Generate avatar background color based on name
 */
export const getAvatarColor = (name) => {
  if (!name) return 'bg-secondary-400';
  
  const colors = [
    'bg-red-500',
    'bg-orange-500',
    'bg-amber-500',
    'bg-yellow-500',
    'bg-lime-500',
    'bg-green-500',
    'bg-emerald-500',
    'bg-teal-500',
    'bg-cyan-500',
    'bg-sky-500',
    'bg-blue-500',
    'bg-indigo-500',
    'bg-violet-500',
    'bg-purple-500',
    'bg-fuchsia-500',
    'bg-pink-500',
    'bg-rose-500',
  ];

  const hash = name.split('').reduce((acc, char) => {
    return char.charCodeAt(0) + ((acc << 5) - acc);
  }, 0);

  return colors[Math.abs(hash) % colors.length];
};

/**
 * Debounce function
 */
export const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

/**
 * Throttle function
 */
export const throttle = (func, limit) => {
  let inThrottle;
  return function() {
    const args = arguments;
    const context = this;
    if (!inThrottle) {
      func.apply(context, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
};

/**
 * Copy text to clipboard
 */
export const copyToClipboard = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    // Fallback for older browsers
    const textArea = document.createElement('textarea');
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand('copy');
      return true;
    } catch (err) {
      return false;
    } finally {
      document.body.removeChild(textArea);
    }
  }
};

/**
 * Generate random ID
 */
export const generateId = (length = 8) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

/**
 * Validate email
 */
export const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validate phone number/extension
 */
export const isValidExtension = (extension) => {
  const extensionRegex = /^\d{3,6}$/;
  return extensionRegex.test(extension);
};
