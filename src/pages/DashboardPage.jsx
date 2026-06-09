import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import {
  FiPhone as Phone,
  FiSettings as Settings,
  FiUsers as Users,
  FiClock as Clock,
  FiGrid as Grid,
  FiLogOut as LogOut,
  FiBell as Bell,
  FiMessageSquare as Chat,
} from "react-icons/fi";
import { Voicemail as VoicemailIcon, Smartphone } from 'lucide-react';
import HomePage from "./HomePage";
import SettingsPage from "./SettingsPage";
import ContactsPage from "./ContactsPage";
import CallLogsPage from "./CallLogsPage";
import CallingPage from "./CallingPage";
import IncomingCallPage from "./IncomingCallPage";
import SettingsModal from "../components/SettingsModal";
import NotificationsPage from "./NotificationsPage";
import ChatPage from "./ChatPage";
import VoicemailPage from "./VoicemailPage";
import SoftphoneGuidePage from "./SoftphoneGuidePage";
import ConferencePage from "./ConferencePage";
import statusService from "../services/statusService";
import { getVoicemailUnreadCount } from "../services/voicemail";

import { call, hangupCall } from "../services/call";
import webrtcCallService from "../services/webrtcCallService";
import ConnectionStatus from "../components/ConnectionStatus";
import { useTheme } from "../contexts/ThemeContext";
import notificationService from "../utils/notificationService";
import { cn } from "../utils/ui";
import {
  ResponsiveContainer,
  ResponsiveText,
  ResponsiveFlex,
  ResponsiveButton
} from '../components/ResponsiveLayout';

const initialContacts = [
  {
    id: 1,
    name: "John Doe",
    priority: "high",
    status: "online",
    avatar: null,
    isFavorite: true,
    extension: "1001",
  },
  {
    id: 2,
    name: "Jane Smith",
    priority: "medium",
    status: "offline",
    avatar: null,
    isFavorite: false,
    extension: "1002",
  },
  {
    id: 3,
    name: "Alice Brown",
    priority: "low",
    status: "online",
    avatar: null,
    isFavorite: false,
    extension: "1003",
  },
];

const BottomNav = ({ currentPage, onNavigate, isDarkMode }) => {
  const navItems = [
    { id: "keypad", label: "Keypad", icon: Phone },
    { id: "contacts", label: "Contacts", icon: Users },
    { id: "chat", label: "Chat", icon: Chat },
    { id: "calllogs", label: "Call Logs", icon: Clock },
    { id: "notifications", label: "Notifications", icon: Bell },
  ];

  return (
    <motion.div
      initial={{ y: 100 }}
      animate={{ y: 0 }}
      className={cn(
        "fixed bottom-0 left-0 right-0 lg:hidden z-40 safe-area-bottom",
        "border-t",
        isDarkMode
          ? "bg-secondary-900 border-secondary-700"
          : "bg-white border-secondary-200"
      )}
    >
      <div className="flex justify-around items-center py-2 px-2 pb-safe">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;

          return (
            <motion.button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              whileTap={{ scale: 0.95 }}
              className={cn(
                "flex flex-col items-center p-2 rounded-lg transition-all duration-200 min-w-0 flex-1",
                isActive
                  ? cn(
                      "bg-primary-500 text-white",
                      isDarkMode && "bg-primary-600"
                    )
                  : cn(
                      "text-secondary-500 hover:text-primary-600 hover:bg-primary-50",
                      isDarkMode && "text-secondary-400 hover:text-primary-400 hover:bg-secondary-800"
                    )
              )}
            >
              <Icon className="w-4 h-4 mb-1 flex-shrink-0" />
              <span className="text-xs font-medium truncate">{item.label}</span>
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
};

const DashboardPage = ({ user, onLogout, darkMode, setIncomingCall }) => {
  const { darkMode: themeDarkMode, toggleDarkMode } = useTheme();
  const [contacts, setContacts] = useState(initialContacts);
  const [callStatus, setCallStatus] = useState(null);
  const [activeCallContact, setActiveCallContact] = useState(null);
  const [currentPage, setCurrentPage] = useState("keypad");
  const [notification, setNotification] = useState(null);
  const [incomingCall, setLocalIncomingCall] = useState(null);
  const [showSettings, setShowSettings] = useState(false);


  const [unreadCount, setUnreadCount] = useState(0);
  const [voicemailUnread, setVoicemailUnread] = useState(0);
  const navigate = useNavigate();
  const location = useLocation();

  // Use theme context dark mode if available, fallback to prop
  const isDarkMode = themeDarkMode !== undefined ? themeDarkMode : darkMode;

  // Test status service endpoint
  const testStatusService = async () => {
    console.log('[Dashboard] Testing status service...');
    console.log('[Dashboard] Current user data:', {
      user,
      token: localStorage.getItem('token')?.substring(0, 20) + '...',
      username: localStorage.getItem('username'),
      extension: localStorage.getItem('extension')
    });

    // First test the endpoint
    const result = await statusService.testStatusEndpoint();
    console.log('[Dashboard] Status service test result:', result);

    // Then try a manual status update
    try {
      console.log('[Dashboard] Attempting manual status update...');
      await statusService.updateStatus('online');
      console.log('[Dashboard] Manual status update successful');
    } catch (error) {
      console.error('[Dashboard] Manual status update failed:', error);
    }

    if (result.success) {
      alert('Status service test successful! Check console for details.');
    } else {
      alert(`Status service test failed: ${result.error}. Check console for details.`);
    }
  };

  // Load voicemail unread count
  useEffect(() => {
    const loadVMUnread = async () => {
      try {
        const data = await getVoicemailUnreadCount();
        if (data.success) setVoicemailUnread(data.unread_count);
      } catch (e) {}
    };
    loadVMUnread();
    const interval = setInterval(loadVMUnread, 30000);
    return () => clearInterval(interval);
  }, []);

  // Initialize status service for online/offline tracking
  useEffect(() => {
    if (user) {
      console.log('[Dashboard] Initializing status service for user:', user);
      statusService.initialize();
    }

    // Cleanup status service on unmount
    return () => {
      if (user) {
        statusService.cleanup();
      }
    };
  }, [user]);

  // Update unread notification count
  useEffect(() => {
    const updateUnreadCount = () => {
      setUnreadCount(notificationService.getUnreadCount());
    };

    // Initial count
    updateUnreadCount();

    // Listen for changes
    const unsubscribe = notificationService.addListener(() => {
      updateUnreadCount();
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (location.state?.success) {
      setNotification({
        message: `${location.state.success}${user?.extension ? ` (Ext: ${user.extension})` : ""}`,
        type: "success",
      });
      setTimeout(() => setNotification(null), 3000);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location, navigate, user?.extension]);

  // Initialize WebRTC service
  useEffect(() => {
    if (user?.extension) {
      console.log('[Dashboard] Initializing WebRTC service for extension:', user.extension);

      webrtcCallService.initialize(
        user.extension,
        (incomingCallData) => {
          console.log('[Dashboard] Incoming WebRTC call:', incomingCallData);
          setLocalIncomingCall(incomingCallData);
          setNotification({
            message: `📞 ${incomingCallData.fromUsername || incomingCallData.caller_username || `Extension ${incomingCallData.from}`} is calling`,
            type: "info"
          });
        },
        (status) => {
          console.log('[Dashboard] WebRTC call status:', status);
          setCallStatus(status);
        }
      );

      return () => {
        webrtcCallService.cleanup();
      };
    }
  }, [user?.extension]);

  useEffect(() => {
    const fetchUserStatuses = async () => {
      try {
        const data = await (await import("../services/users")).getUsers();
        if (data.length > 0) {
          setContacts((prev) =>
            prev.map((contact) => ({
              ...contact,
              status: data.find((u) => u.extension === contact.extension)?.status || contact.status,
            }))
          );
        }
      } catch (e) {}
    };

    fetchUserStatuses();
    const interval = setInterval(fetchUserStatuses, 15000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (callStatus) {
      const type =
        callStatus === "Connected"
          ? "success"
          : callStatus === "Call failed"
          ? "error"
          : "info";
      setNotification({ message: callStatus, type });
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [callStatus]);

  const startCall = async (contact) => {
    setActiveCallContact(contact);
    try {
      setCallStatus(`Initiating call to ${contact.name}...`);

      // Add notification for call attempt
      notificationService.addNotification(
        'info',
        'Initiating Call',
        `Calling ${contact.name || contact.extension}...`
      );

      const { channel } = await call(contact.extension);
      setCallStatus("Connected");

      // Add notification for successful connection
      notificationService.callConnected(contact.extension);

      setCurrentPage("calling");
      navigate("/calling", {
        state: {
          contact,
          callStatus: "Connecting...",
          isOutgoing: true,
          channel,
          callAccepted: false,
          isWebRTCCall: channel && channel.startsWith('webrtc-call-'),
          callId: channel
        },
      });
    } catch (error) {
      console.error("[Dashboard] Call error:", error);
      setCallStatus("Call failed");

      // Add notification for call failure
      notificationService.callFailed(contact.extension, error.message);

      setTimeout(() => {
        setCallStatus(null);
        setActiveCallContact(null);
        setCurrentPage("keypad");
      }, 2000);
    }
  };

  const endCall = async () => {
    if (activeCallContact && callStatus) {
      try {
        await hangupCall(`PJSIP/${activeCallContact.extension}`);

        // Add notification for call ended
        notificationService.callEnded(activeCallContact.extension, 'Unknown duration');
      } catch (error) {
        console.error("[Dashboard] End call error:", error);
        setNotification({ message: "Failed to end call", type: "error" });

        // Add notification for end call failure
        notificationService.addNotification(
          'error',
          'End Call Failed',
          `Failed to end call with ${activeCallContact.extension}: ${error.message}`
        );
      }
    }
    setCallStatus(null);
    setActiveCallContact(null);
    setCurrentPage("keypad");
    navigate("/dashboard");
  };



  const handleLogout = () => {
    localStorage.removeItem("token");
    setContacts(initialContacts);
    setCallStatus(null);
    setActiveCallContact(null);
    setCurrentPage("keypad");
    setNotification({ message: "Logged out successfully", type: "info" });
    setTimeout(() => {
      if (typeof onLogout === "function") onLogout();
      navigate("/login");
    }, 1000);
  };



  return (
    <div className={cn(
      "h-screen w-screen overflow-hidden flex flex-col",
      isDarkMode
        ? "bg-secondary-900"
        : "bg-slate-50"
    )}>
      {/* Incoming Call UI */}
      {incomingCall && (
        <IncomingCallPage
          callData={{
            from: (incomingCall?.caller || incomingCall?.from),
            fromUsername: incomingCall?.fromUsername,
            caller_username: incomingCall?.caller_username,
            channel: (incomingCall?.channel || incomingCall?.callId),
            priority: (incomingCall?.priority || 'normal'),
            transport: (incomingCall?.transport || 'transport-ws'),
            call_id: incomingCall?.callId
          }}
          contacts={contacts}
          user={user}
          darkMode={darkMode}
          onCallAccepted={() => {
            setLocalIncomingCall(null);
            if (setIncomingCall) setIncomingCall(null);
          }}
          onCallRejected={() => {
            setLocalIncomingCall(null);
            if (setIncomingCall) setIncomingCall(null);
          }}
        />
      )}

      {/* Fixed Header */}
      <motion.header
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className={cn(
          "flex-shrink-0 z-30 border-b",
          isDarkMode
            ? "bg-secondary-900 border-secondary-700"
            : "bg-white border-secondary-200"
        )}
      >
        <ResponsiveContainer padding="compact">
          <ResponsiveFlex justify="between" align="center" className="h-14">
            {/* Left Section */}
            <ResponsiveFlex align="center" spacing="inline">
              <div className="w-8 h-8 bg-primary-500 rounded-lg flex items-center justify-center">
                <Phone className="w-5 h-5 text-white" />
              </div>
              <div className="hidden sm:block">
                <ResponsiveText variant="bodyLarge" weight="semibold" className={isDarkMode ? "text-white" : "text-secondary-900"}>
                  VoIP Dashboard
                </ResponsiveText>
                <ResponsiveText variant="caption" className={isDarkMode ? "text-secondary-400" : "text-secondary-600"}>
                  {user?.username} (Ext: {user?.extension})
                </ResponsiveText>
              </div>
            </ResponsiveFlex>

            {/* Center Section - Call Status */}
            {callStatus && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className={cn(
                  "hidden md:flex items-center space-x-2 px-3 py-1.5 rounded-full font-medium",
                  callStatus.includes("Connected")
                    ? "bg-success-100 text-success-700"
                    : "bg-warning-100 text-warning-700"
                )}
              >
                <div className="w-2 h-2 bg-current rounded-full animate-pulse" />
                <ResponsiveText variant="caption">{callStatus}</ResponsiveText>
              </motion.div>
            )}

            {/* Right Section */}
            <ResponsiveFlex align="center" spacing="inline">
              <ResponsiveButton
                onClick={() => setCurrentPage("notifications")}
                variant="ghost"
                size="sm"
                className={cn(
                  "relative",
                  currentPage === "notifications"
                    ? "bg-primary-100 text-primary-600"
                    : isDarkMode
                      ? "hover:bg-secondary-800 text-secondary-400 hover:text-white"
                      : "hover:bg-secondary-100 text-secondary-600 hover:text-secondary-900"
                )}
                title="Notifications & Logs"
              >
                <Bell className="w-4 h-4" />
                {/* Notification badge */}
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 bg-danger-500 text-white text-xs rounded-full flex items-center justify-center px-1">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </ResponsiveButton>

              <ResponsiveButton
                onClick={() => setShowSettings(true)}
                variant="ghost"
                size="sm"
                className={isDarkMode
                  ? "hover:bg-secondary-800 text-secondary-400 hover:text-white"
                  : "hover:bg-secondary-100 text-secondary-600 hover:text-secondary-900"
                }
                title="Settings"
              >
                <Settings className="w-4 h-4" />
              </ResponsiveButton>

              {/* Temporary debugging button */}
              <ResponsiveButton
                onClick={testStatusService}
                variant="ghost"
                size="sm"
                className="text-warning-600 hover:bg-warning-50"
                title="Test Status Service (Debug)"
              >
                🔧
              </ResponsiveButton>

              <ResponsiveButton
                onClick={handleLogout}
                variant="ghost"
                size="sm"
                className="text-danger-600 hover:bg-danger-50"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
              </ResponsiveButton>
            </ResponsiveFlex>
          </ResponsiveFlex>
        </ResponsiveContainer>
      </motion.header>

      {/* Notification Display */}
      {notification && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className={cn(
            "fixed top-20 right-4 z-50 p-4 rounded-lg shadow-lg max-w-sm",
            notification.type === 'success' ? 'bg-success-500 text-white' :
            notification.type === 'error' ? 'bg-danger-500 text-white' :
            'bg-primary-500 text-white'
          )}
        >
          <p className="text-sm font-medium">{notification.message}</p>
        </motion.div>
      )}

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Fixed Sidebar */}
        <motion.aside
          initial={{ x: -20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          className={cn(
            "hidden lg:flex flex-col border-r flex-shrink-0",
            "w-56",
            isDarkMode
              ? "bg-secondary-900 border-secondary-700"
              : "bg-white border-secondary-200"
          )}
        >
          <nav className="flex-1 overflow-y-auto">
            <ResponsiveContainer padding="compact">
              <div className="space-y-1">
                {[
                  { id: "keypad", label: "Keypad", icon: Grid },
                  { id: "settings", label: "Settings", icon: Settings },
                  { id: "contacts", label: "Contacts", icon: Users },
                  { id: "chat", label: "Messages", icon: Chat },
                  { id: "voicemail", label: "Voicemail", icon: VoicemailIcon, badge: voicemailUnread },
                  { id: "calllogs", label: "Call Logs", icon: Clock },
                  { id: "conference", label: "Conference", icon: Users },
                  { id: "softphone", label: "Softphone", icon: Smartphone },
                  { id: "notifications", label: "Notifications", icon: Bell },
                ].map((item) => {
                  const Icon = item.icon;
                  const isActive = currentPage === item.id;

                  return (
                    <motion.button
                      key={item.id}
                      onClick={() => setCurrentPage(item.id)}
                      whileHover={{ x: 2 }}
                      whileTap={{ scale: 0.98 }}
                      className={cn(
                        "w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-all duration-200 text-left",
                        isActive
                          ? cn(
                              "bg-primary-500 text-white shadow-md",
                              isDarkMode && "bg-primary-600"
                            )
                          : cn(
                              "text-secondary-600 hover:text-primary-600 hover:bg-primary-50",
                              isDarkMode && "text-secondary-400 hover:text-primary-400 hover:bg-secondary-800"
                            )
                      )}
                    >
                      <Icon className="w-5 h-5 flex-shrink-0" />
                      <ResponsiveText variant="bodyMedium" className="font-medium flex-1">{item.label}</ResponsiveText>
                      {item.badge !== undefined && item.badge > 0 && (
                        <span className="bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                          {item.badge}
                        </span>
                      )}
                    </motion.button>
                  );
                })}
              </div>
            </ResponsiveContainer>
          </nav>
        </motion.aside>

        {/* Incoming Call Modal */}
        {incomingCall && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-xl max-w-sm w-full mx-4">
              <div className="text-center">
                <div className="mb-4">
                  <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-2">
                    <Phone className="w-8 h-8 text-white" />
                  </div>
                  <h3 className="text-lg font-semibold">Incoming Call</h3>
                  <p className="text-gray-600 dark:text-gray-300">
                    {incomingCall.fromUsername || incomingCall.caller_username || `Extension ${incomingCall.from}`} is calling
                  </p>
                </div>
                <div className="flex space-x-4">
                  <button
                    onClick={() => {
                      incomingCall.onAccept();
                      setLocalIncomingCall(null);
                    }}
                    className="flex-1 bg-green-500 hover:bg-green-600 text-white py-3 px-4 rounded-xl font-medium transition-colors"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => {
                      incomingCall.onReject();
                      setLocalIncomingCall(null);
                    }}
                    className="flex-1 bg-red-500 hover:bg-red-600 text-white py-3 px-4 rounded-xl font-medium transition-colors"
                  >
                    Reject
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Main Content */}
        <main className="flex-1 overflow-hidden flex flex-col">
          {/* Content Area with Professional Layout */}
          <div className="flex-1 overflow-hidden pb-20 lg:pb-6">
            <ResponsiveContainer padding="section" className="h-full">
              <motion.div
                key={currentPage}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className="h-full flex flex-col"
              >
                {currentPage === "keypad" && (
                  <div className="h-full flex flex-col">
                    {/* Static Header Card */}
                    <div className={cn(
                      "flex-shrink-0 rounded-t-xl border-b",
                      isDarkMode
                        ? "bg-secondary-800 border-secondary-700"
                        : "bg-white border-secondary-200"
                    )}>
                      <div className="p-4 lg:p-6">
                        <div className="flex items-center space-x-3">
                          <div className="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
                            <Grid className={cn(
                              'w-5 h-5',
                              isDarkMode ? 'text-primary-400' : 'text-primary-600'
                            )} />
                          </div>
                          <div>
                            <h1 className={cn(
                              'text-xl font-bold',
                              isDarkMode ? 'text-white' : 'text-secondary-900'
                            )}>
                              VoIP Dialer
                            </h1>
                            <p className={cn(
                              'text-sm',
                              isDarkMode ? 'text-secondary-400' : 'text-secondary-600'
                            )}>
                              Make calls using the keypad or keyboard input
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                    {/* Scrollable Content */}
                    <div className={cn(
                      "flex-1 overflow-y-auto rounded-b-xl",
                      isDarkMode
                        ? "bg-secondary-800 border-secondary-700"
                        : "bg-white border-secondary-200"
                    )}>
                      <HomePage onCall={(extension) => startCall({ extension, name: `Extension ${extension}` })} darkMode={isDarkMode} />
                    </div>
                  </div>
                )}
                {currentPage === "settings" && (
                  <div className="h-full flex flex-col">
                    {/* Static Header Card */}
                    <div className={cn(
                      "flex-shrink-0 rounded-t-xl border-b",
                      isDarkMode
                        ? "bg-secondary-800 border-secondary-700"
                        : "bg-white border-secondary-200"
                    )}>
                      <div className="p-4 lg:p-6">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <div className="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
                              <Settings className={cn(
                                'w-5 h-5',
                                isDarkMode ? 'text-primary-400' : 'text-primary-600'
                              )} />
                            </div>
                            <div>
                              <h1 className={cn(
                                'text-xl font-bold',
                                isDarkMode ? 'text-white' : 'text-secondary-900'
                              )}>
                                Settings
                              </h1>
                              <p className={cn(
                                'text-sm',
                                isDarkMode ? 'text-secondary-400' : 'text-secondary-600'
                              )}>
                                Configure your VoIP preferences and account settings
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    {/* Scrollable Content */}
                    <div className={cn(
                      "flex-1 overflow-y-auto rounded-b-xl",
                      isDarkMode
                        ? "bg-secondary-800"
                        : "bg-white"
                    )}>
                      <SettingsPage
                        darkMode={isDarkMode}
                        onToggleDarkMode={toggleDarkMode}
                        user={user}
                      />
                    </div>
                  </div>
                )}
                {currentPage === "contacts" && (
                  <div className="h-full flex flex-col">
                    {/* Static Header Card */}
                    <div className={cn(
                      "flex-shrink-0 rounded-t-xl border-b",
                      isDarkMode
                        ? "bg-secondary-800 border-secondary-700"
                        : "bg-white border-secondary-200"
                    )}>
                      <div className="p-4 lg:p-6">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <div className="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
                              <Users className={cn(
                                'w-5 h-5',
                                isDarkMode ? 'text-primary-400' : 'text-primary-600'
                              )} />
                            </div>
                            <div>
                              <h1 className={cn(
                                'text-xl font-bold',
                                isDarkMode ? 'text-white' : 'text-secondary-900'
                              )}>
                                Contacts Directory
                              </h1>
                              <p className={cn(
                                'text-sm',
                                isDarkMode ? 'text-secondary-400' : 'text-secondary-600'
                              )}>
                                Browse and call your contacts
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    {/* Scrollable Content */}
                    <div className={cn(
                      "flex-1 overflow-hidden rounded-b-xl",
                      isDarkMode
                        ? "bg-secondary-800"
                        : "bg-white"
                    )}>
                      <ContactsPage
                        onCall={(extension) => startCall({ extension, name: `Extension ${extension}` })}
                        darkMode={isDarkMode}
                        userID={user?.username}
                      />
                    </div>
                  </div>
                )}
                {currentPage === "calllogs" && (
                  <div className="h-full flex flex-col">
                    {/* Static Header Card */}
                    <div className={cn(
                      "flex-shrink-0 rounded-t-xl border-b",
                      isDarkMode
                        ? "bg-secondary-800 border-secondary-700"
                        : "bg-white border-secondary-200"
                    )}>
                      <div className="p-4 lg:p-6">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <div className="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
                              <Clock className={cn(
                                'w-5 h-5',
                                isDarkMode ? 'text-primary-400' : 'text-primary-600'
                              )} />
                            </div>
                            <div>
                              <h1 className={cn(
                                'text-xl font-bold',
                                isDarkMode ? 'text-white' : 'text-secondary-900'
                              )}>
                                Call Logs
                              </h1>
                              <p className={cn(
                                'text-sm',
                                isDarkMode ? 'text-secondary-400' : 'text-secondary-600'
                              )}>
                                View your call history and details
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    {/* Scrollable Content */}
                    <div className={cn(
                      "flex-1 overflow-hidden rounded-b-xl",
                      isDarkMode
                        ? "bg-secondary-800"
                        : "bg-white"
                    )}>
                      <CallLogsPage darkMode={isDarkMode} user={user} onCall={(extension) => startCall({ extension, name: `Extension ${extension}` })} />
                    </div>
                  </div>
                )}
                {currentPage === "chat" && (
                  <div className="h-full flex flex-col">
                    <div className={cn(
                      "flex-1 overflow-hidden rounded-xl",
                      darkMode ? "bg-secondary-800" : "bg-white"
                    )}>
                      <ChatPage darkMode={isDarkMode} currentUser={user} />
                    </div>
                  </div>
                )}
                {currentPage === "voicemail" && (
                  <div className="h-full flex flex-col">
                    <div className={cn(
                      "flex-1 overflow-hidden rounded-xl",
                      darkMode ? "bg-secondary-800" : "bg-white"
                    )}>
                      <VoicemailPage darkMode={isDarkMode} />
                    </div>
                  </div>
                )}
                {currentPage === "conference" && (
                  <div className="h-full flex flex-col">
                    <div className={cn(
                      "flex-1 overflow-hidden rounded-xl",
                      darkMode ? "bg-secondary-800" : "bg-white"
                    )}>
                      <ConferencePage darkMode={isDarkMode} onStartCall={(contact) => startCall(contact)} />
                    </div>
                  </div>
                )}
                {currentPage === "softphone" && (
                  <div className="h-full flex flex-col">
                    <div className={cn(
                      "flex-1 overflow-hidden rounded-xl",
                      darkMode ? "bg-secondary-800" : "bg-white"
                    )}>
                      <SoftphoneGuidePage darkMode={isDarkMode} />
                    </div>
                  </div>
                )}
                {currentPage === "notifications" && (
                  <div className="h-full flex flex-col">
                    {/* Static Header Card */}
                    <div className={cn(
                      "flex-shrink-0 rounded-t-xl border-b",
                      isDarkMode
                        ? "bg-secondary-800 border-secondary-700"
                        : "bg-white border-secondary-200"
                    )}>
                      <div className="p-4 lg:p-6">
                        <div className="flex items-center space-x-3">
                          <div className="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
                            <Bell className={cn(
                              'w-5 h-5',
                              isDarkMode ? 'text-primary-400' : 'text-primary-600'
                            )} />
                          </div>
                          <div>
                            <h1 className={cn(
                              'text-xl font-bold',
                              isDarkMode ? 'text-white' : 'text-secondary-900'
                            )}>
                              {user?.role === 'admin' ? 'Notifications & Logs' : 'Notifications'}
                            </h1>
                            <p className={cn(
                              'text-sm',
                              isDarkMode ? 'text-secondary-400' : 'text-secondary-600'
                            )}>
                              Stay updated with system alerts and messages
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                    {/* Scrollable Content */}
                    <div className={cn(
                      "flex-1 overflow-hidden rounded-b-xl",
                      isDarkMode
                        ? "bg-secondary-800"
                        : "bg-white"
                    )}>
                      <NotificationsPage darkMode={isDarkMode} user={user} />
                    </div>
                  </div>
                )}
                {currentPage === "calling" && activeCallContact && (
                  <CallingPage
                    contact={activeCallContact}
                    callStatus={callStatus}
                    onEndCall={endCall}
                    channel={`PJSIP/${activeCallContact.extension}`}
                    darkMode={isDarkMode}
                  />
                )}
              </motion.div>
            </ResponsiveContainer>
          </div>
        </main>
      </div>

      {/* Bottom Navigation for Mobile */}
      <BottomNav currentPage={currentPage} onNavigate={setCurrentPage} isDarkMode={isDarkMode} />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        darkMode={isDarkMode}
      />





      {/* Connection Status Monitor */}
      <ConnectionStatus />
    </div>
  );
};

export default DashboardPage;
