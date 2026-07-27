import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  FiPhone as Phone,
  FiSearch as Search,
  FiUser as User,
  FiUsers as Users,
  FiPhoneCall as PhoneCall,
  FiVideo as Video,
  FiMessageSquare as Chat,
  FiMail as VoicemailIcon,
  FiRefreshCw as RefreshIcon
} from 'react-icons/fi';
import { getUsers } from '../services/users';
import { getExtension } from '../services/login';
import { call } from '../services/call';
import { useTheme } from '../contexts/ThemeContext';
import { cn, getInitials, getAvatarColor } from '../utils/ui';
import toast from 'react-hot-toast';
import {
  ResponsiveText,
  ResponsiveFlex,
  ResponsiveButton
} from '../components/ResponsiveLayout';

const Contact = ({ contact, onCall, onVideoCall, onChat, onVoicemail, darkMode }) => {
  const { darkMode: themeDarkMode } = useTheme();
  const isDark = darkMode || themeDarkMode;
  const isOnline = contact.status === 'online';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2, scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className={cn(
        "relative rounded-xl border shadow-sm p-4 transition-all duration-300",
        "hover:shadow-lg",
        isDark
          ? "bg-secondary-800 border-secondary-700 hover:border-secondary-600"
          : "bg-white border-secondary-200 hover:border-secondary-300"
      )}
    >
      {/* Online Status Indicator */}
      <div className={cn(
        "absolute top-3 right-3 w-3 h-3 rounded-full border-2",
        isOnline
          ? "bg-green-500 border-white dark:border-secondary-800"
          : "bg-secondary-400 border-white dark:border-secondary-800"
      )} />

      <div className="flex items-center space-x-3 mb-3">
        <div className={cn(
          "w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-sm",
          getAvatarColor(contact.username || contact.name)
        )}>
          {getInitials(contact.username || contact.name)}
        </div>
        <div className="flex-1 min-w-0">
          <ResponsiveText
            variant="bodyMedium"
            weight="semibold"
            className={cn(
              "truncate",
              isDark ? "text-white" : "text-secondary-900"
            )}
          >
            {contact.username || contact.name}
          </ResponsiveText>
          <ResponsiveText
            variant="caption"
            className={cn(
              "flex items-center space-x-1",
              isDark ? "text-secondary-400" : "text-secondary-600"
            )}
          >
            <Phone className="w-3 h-3" />
            <span>Ext: {contact.extension}</span>
          </ResponsiveText>
          <div className="flex items-center space-x-1 mt-0.5">
            <div className={cn(
              "w-1.5 h-1.5 rounded-full",
              isOnline ? "bg-green-500" : "bg-secondary-400"
            )} />
            <ResponsiveText
              variant="caption"
              className={cn(
                "text-xs",
                isOnline
                  ? "text-green-600 dark:text-green-400"
                  : "text-secondary-500"
              )}
            >
              {isOnline ? 'Online' : 'Offline'}
            </ResponsiveText>
          </div>
        </div>
      </div>

      {contact.email && (
        <ResponsiveText
          variant="caption"
          className={cn(
            "truncate mb-3 flex items-center space-x-1",
            isDark ? "text-secondary-500" : "text-secondary-500"
          )}
        >
          <User className="w-3 h-3" />
          <span>{contact.email}</span>
        </ResponsiveText>
      )}

      <div className="flex items-center justify-center gap-2 pt-2 border-t border-secondary-200 dark:border-secondary-700">
        <ActionButton icon={PhoneCall} label="Call" onClick={() => onCall(contact.extension)} isDark={isDark} color="blue" />
        <ActionButton icon={Video} label="Video" onClick={() => onVideoCall && onVideoCall(contact)} isDark={isDark} color="purple" />
        <ActionButton icon={Chat} label="Chat" onClick={() => onChat && onChat(contact)} isDark={isDark} color="green" />
        <ActionButton icon={VoicemailIcon} label="Voicemail" onClick={() => onVoicemail && onVoicemail(contact)} isDark={isDark} color="amber" />
      </div>
    </motion.div>
  );
};

const ActionButton = ({ icon: Icon, label, onClick, isDark, color }) => {
  const colorMap = {
    blue: isDark ? 'hover:bg-blue-900/40 text-blue-400' : 'hover:bg-blue-50 text-blue-600',
    purple: isDark ? 'hover:bg-purple-900/40 text-purple-400' : 'hover:bg-purple-50 text-purple-600',
    green: isDark ? 'hover:bg-green-900/40 text-green-400' : 'hover:bg-green-50 text-green-600',
    amber: isDark ? 'hover:bg-amber-900/40 text-amber-400' : 'hover:bg-amber-50 text-amber-600',
  };
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={cn(
        "flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg transition-all text-xs",
        colorMap[color] || colorMap.blue
      )}
      title={label}
    >
      <Icon className="w-4 h-4" />
      <span>{label}</span>
    </button>
  );
};

const ContactsPage = ({ darkMode = false, onCall, onVideoCall, onChat, onVoicemail, userID }) => {
  const navigate = useNavigate();
  const [contacts, setContacts] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const { darkMode: themeDarkMode } = useTheme();
  const isDark = darkMode || themeDarkMode;

  useEffect(() => {
    fetchContacts();
  }, []);

  const fetchContacts = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const currentUserExtension = getExtension();
      const result = await getUsers();

      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch users');
      }

      const filtered = (result.users || [])
        .filter((user) => `${user.extension}` !== `${currentUserExtension}`)
        .map((user) => ({
          ...user,
          channel: `PJSIP/${user.extension}`,
          avatar: user.avatar || null,
          status: user.status === 'online' ? 'online' : 'offline',
          is_online: user.is_online || user.status === 'online',
        }));

      setContacts(filtered);
    } catch (error) {
      console.error('Error fetching users:', error.message);
      setErrorMsg(error.message || 'Failed to load contacts');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchContacts();
    setRefreshing(false);
    toast.success('Contacts refreshed');
  };

  const handleCall = async (extension) => {
    try {
      if (onCall) {
        onCall(extension);
      } else {
        await call(extension);
        toast.success(`Calling ${extension}...`);
        navigate('/calling', { state: { extension } });
      }
    } catch (error) {
      console.error('Error initiating call:', error.message);
      toast.error('Failed to initiate call');
    }
  };

  // Filter contacts based on search term (case-insensitive, partial match)
  const filteredContacts = contacts.filter(contact =>
    !searchTerm ||
    contact.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    contact.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    contact.extension?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (contact.email || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleRetry = () => {
    fetchContacts();
  };

  return (
    <div className="h-full flex flex-col">
      {/* Search Bar */}
      <div className="flex-shrink-0 p-4 lg:p-6 border-b border-secondary-200 dark:border-secondary-700">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <ResponsiveText variant="caption" color="muted">
              {filteredContacts.length} contact{filteredContacts.length !== 1 ? 's' : ''} available
            </ResponsiveText>
          </div>
          <button
            onClick={handleRefresh}
            disabled={loading || refreshing}
            className={cn(
              "p-2 rounded-lg transition-colors",
              isDark ? "hover:bg-secondary-700 text-secondary-400" : "hover:bg-secondary-100 text-secondary-600",
              (loading || refreshing) && 'opacity-50 cursor-not-allowed'
            )}
            title="Refresh contacts"
          >
            <RefreshIcon className={cn("w-4 h-4", refreshing && 'animate-spin')} />
          </button>
        </div>

        <div className="relative">
          <Search className={cn(
            "absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4",
            isDark ? "text-secondary-400" : "text-secondary-500"
          )} />
          <input
            type="text"
            placeholder="Search by name, extension, or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={cn(
              "w-full pl-10 pr-4 py-2.5 rounded-lg border transition-all duration-200",
              "focus:ring-2 focus:ring-primary-500 focus:border-primary-500",
              "text-sm",
              isDark
                ? "bg-secondary-900 border-secondary-600 text-white placeholder-secondary-400"
                : "bg-white border-secondary-300 text-secondary-900 placeholder-secondary-500"
            )}
          />
        </div>
        {errorMsg && (
          <div className="mt-2 flex items-center gap-2 text-xs text-red-500 dark:text-red-400">
            <span>{errorMsg}</span>
            <button onClick={handleRetry} className="underline hover:no-underline">Retry</button>
          </div>
        )}
      </div>

      {/* Contacts List */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 lg:p-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <div className="w-8 h-8 border-2 border-primary-600 border-t-transparent rounded-full animate-spin mb-4" />
              <p className={cn("text-sm mb-2", isDark ? "text-secondary-400" : "text-secondary-600")}>
                Loading contacts...
              </p>
            </div>
          ) : filteredContacts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <Users className={cn("w-16 h-16 mb-4", isDark ? "text-secondary-600" : "text-secondary-400")} />
              <p className={cn("text-sm mb-2", isDark ? "text-secondary-400" : "text-secondary-600")}>
                {searchTerm ? 'No contacts match your search' : 'No contacts available'}
              </p>
              <p className={cn("text-xs", isDark ? "text-secondary-500" : "text-secondary-500")}>
                {searchTerm
                  ? 'Try a different name, extension, or email.'
                  : 'No other users are registered in the system.'
                }
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredContacts.map((contact, index) => (
                <motion.div
                  key={contact.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.03 }}
                >
                  <Contact
                    contact={contact}
                    onCall={handleCall}
                    onVideoCall={onVideoCall}
                    onChat={onChat}
                    onVoicemail={onVoicemail}
                    darkMode={isDark}
                  />
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ContactsPage;