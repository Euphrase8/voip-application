import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiX as X,
  FiUser as User,
  FiMail as Mail,
  FiPhone as Phone,
  FiCalendar as Calendar,
  FiClock as Clock,
  FiShield as Shield,
  FiCheckCircle as CheckCircle,
  FiXCircle as XCircle,
  FiEdit2 as Edit,
  FiTrash2 as Trash2
} from 'react-icons/fi';
import { cn, getStatusColor } from '../utils/ui';

const ViewUserModal = ({ isOpen, user, onClose, onEdit, onDelete, darkMode }) => {
  if (!user) return null;

  const formatDateTime = (value) => {
    if (!value) return 'Never';
    const date = new Date(value);
    if (isNaN(date.getTime())) return 'Never';
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  const initials = (user.username || '?').slice(0, 2).toUpperCase();

  const detailItems = [
    {
      label: 'Email Address',
      value: user.email || '—',
      icon: Mail
    },
    {
      label: 'Extension',
      value: user.extension || '—',
      icon: Phone
    },
    {
      label: 'Role',
      value: user.role === 'admin' ? 'Administrator' : 'User',
      icon: Shield
    },
    {
      label: 'Status',
      value: user.status || 'Unknown',
      icon: User,
      statusBadge: true
    },
    {
      label: 'Account',
      value: user.enabled === false ? 'Disabled' : 'Active',
      icon: user.enabled === false ? XCircle : CheckCircle,
      accountBadge: true
    },
    {
      label: 'Registered',
      value: formatDateTime(user.created_at),
      icon: Calendar
    },
    {
      label: 'Last Login',
      value: formatDateTime(user.last_login),
      icon: Clock
    }
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            className={cn(
              'relative w-full max-w-md mx-auto rounded-xl shadow-2xl',
              'max-h-[90vh] overflow-y-auto',
              darkMode
                ? 'bg-secondary-800 border border-secondary-700'
                : 'bg-white border border-secondary-200'
            )}
          >
            {/* Header */}
            <div className={cn(
              'flex items-start justify-between p-6 border-b',
              darkMode ? 'border-secondary-700' : 'border-secondary-200'
            )}>
              <div className="flex items-center space-x-4">
                {/* Avatar / Initials */}
                <div className={cn(
                  'w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg',
                  darkMode
                    ? 'bg-primary-900/40 text-primary-300'
                    : 'bg-primary-100 text-primary-700'
                )}>
                  {initials}
                </div>
                <div>
                  <h2 className={cn(
                    'text-lg font-semibold',
                    darkMode ? 'text-white' : 'text-secondary-900'
                  )}>
                    {user.username}
                  </h2>
                  <p className={cn(
                    'text-sm',
                    darkMode ? 'text-secondary-400' : 'text-secondary-600'
                  )}>
                    User Details
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className={cn(
                  'p-2 rounded-lg transition-colors',
                  darkMode
                    ? 'hover:bg-secondary-700 text-secondary-400 hover:text-white'
                    : 'hover:bg-secondary-100 text-secondary-500 hover:text-secondary-700'
                )}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Details */}
            <div className="p-6 space-y-4">
              {detailItems.map((item) => (
                <div key={item.label} className={cn(
                  'flex items-center justify-between p-3 rounded-lg border',
                  darkMode ? 'bg-secondary-900 border-secondary-700' : 'bg-secondary-50 border-secondary-200'
                )}>
                  <div className="flex items-center space-x-3 min-w-0">
                    <item.icon className={cn(
                      'w-4 h-4 flex-shrink-0',
                      item.accountBadge
                        ? (user.enabled === false ? 'text-danger-600' : 'text-success-600')
                        : darkMode ? 'text-secondary-400' : 'text-secondary-500'
                    )} />
                    <span className={cn(
                      'text-sm',
                      darkMode ? 'text-secondary-400' : 'text-secondary-500'
                    )}>
                      {item.label}
                    </span>
                  </div>
                  {item.statusBadge ? (
                    <span className={cn(
                      'px-2 py-1 rounded-full text-xs font-medium capitalize',
                      getStatusColor(item.value, 'bg'),
                      getStatusColor(item.value, 'text')
                    )}>
                      {item.value}
                    </span>
                  ) : item.accountBadge ? (
                    <span className={cn(
                      'px-2 py-1 rounded-full text-xs font-medium',
                      user.enabled === false
                        ? 'bg-danger-100 text-danger-700 dark:bg-danger-900/30 dark:text-danger-400'
                        : 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400'
                    )}>
                      {item.value}
                    </span>
                  ) : (
                    <span className={cn(
                      'text-sm font-medium text-right',
                      darkMode ? 'text-secondary-200' : 'text-secondary-800'
                    )}>
                      {item.value}
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Footer Actions */}
            <div className={cn(
              'flex items-center justify-end space-x-3 p-6 pt-0'
            )}>
              {user.role !== 'admin' && (
                <button
                  onClick={() => onDelete && onDelete(user)}
                  className={cn(
                    'px-4 py-2.5 rounded-lg font-medium transition-colors',
                    'flex items-center space-x-2',
                    darkMode
                      ? 'bg-secondary-700 text-danger-400 hover:bg-secondary-600'
                      : 'bg-secondary-100 text-danger-600 hover:bg-secondary-200'
                  )}
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete</span>
                </button>
              )}
              <button
                onClick={() => onEdit && onEdit(user)}
                className={cn(
                  'px-4 py-2.5 rounded-lg font-medium transition-colors',
                  'bg-primary-600 text-white hover:bg-primary-700',
                  'flex items-center space-x-2'
                )}
              >
                <Edit className="w-4 h-4" />
                <span>Edit User</span>
              </button>
              <button
                onClick={onClose}
                className={cn(
                  'px-4 py-2.5 rounded-lg font-medium transition-colors',
                  darkMode
                    ? 'bg-secondary-700 text-secondary-300 hover:bg-secondary-600 hover:text-white'
                    : 'bg-secondary-100 text-secondary-700 hover:bg-secondary-200'
                )}
              >
                Close
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default ViewUserModal;
