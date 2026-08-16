import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  FiPhoneCall as PhoneCall,
  FiTrash2 as Trash2,
  FiUser as User,
  FiUsers as Users
} from 'react-icons/fi';
import { call } from '../services/call';
import { useTheme } from '../contexts/ThemeContext';
import { cn } from '../utils/ui';
import toast from 'react-hot-toast';
import {
  ResponsiveText,
  ResponsiveButton
} from '../components/ResponsiveLayout';

const HomePage = ({ darkMode = false, onCall }) => {
  const [extension, setExtension] = useState('');
  const [loading, setLoading] = useState(false);
  const [recentCalls, setRecentCalls] = useState([]);
  const [error, setError] = useState(null);

  const { darkMode: themeDarkMode } = useTheme();
  const isDark = darkMode || themeDarkMode;

  const initiateCall = useCallback(async (ext) => {
    setLoading(true);
    try {
      // Delegate the actual call to the parent (DashboardPage) so the call is
      // initiated exactly once. Only fall back to a direct call when there is
      // no parent handler.
      if (onCall) {
        await onCall(ext);
      } else {
        await call(ext);
        toast.success(`Dialing ${ext}...`);
      }
      const newCall = {
        extension: ext,
        timestamp: new Date(),
        type: 'outgoing'
      };
      setRecentCalls(prev => [newCall, ...prev.slice(0, 4)]);
    } catch (err) {
      console.error('[HomePage] Call initiation failed:', err);
      toast.error(err?.message || 'Failed to initiate call. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [onCall]);

  const handleCall = useCallback(() => {
    if (!extension || !/^\d{3,6}$/.test(extension)) {
      toast.error('Please enter a valid extension (3-6 digits)');
      return;
    }
    initiateCall(extension);
  }, [extension, initiateCall]);

  // Handle Enter key press for calling
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && extension && !loading) {
      handleCall();
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Main Content - Enhanced Mobile Layout */}
      <div className="flex-1 overflow-y-auto mobile-scroll">
        <div className="p-2 xs:p-3 sm:p-4 lg:p-6 pb-safe">
          <div className="max-w-7xl mx-auto">
          <div className="h-full grid grid-cols-1 lg:grid-cols-3 gap-2 xs:gap-3 lg:gap-4 auto-rows-fr lg:auto-rows-auto">
            {/* Main Dialer Section - Left Column */}
            <div className="lg:col-span-2 h-full flex flex-col min-h-0">
              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.1, duration: 0.3 }}
                className="h-full"
              >
                <div className={cn(
                  "h-full bg-white dark:bg-gray-800 rounded-lg xs:rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-3 xs:p-4 md:p-6 flex flex-col",
                  "hover:shadow-md transition-shadow duration-200"
                )}>
                  {/* Header */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-2">
                      <div className={cn(
                        'w-2 h-2 rounded-full animate-pulse',
                        isDark ? 'bg-green-400' : 'bg-green-500'
                      )} />
                      <ResponsiveText variant="label" color="muted">
                        Ready to dial
                      </ResponsiveText>
                    </div>
                    <ResponsiveText variant="label" weight="medium" className={isDark ? "text-gray-300" : "text-gray-700"}>
                      Extension
                    </ResponsiveText>
                  </div>

                  {/* Title */}
                  <div className="text-center mb-2">
                    <ResponsiveText variant="title" weight="semibold" className={isDark ? "text-white" : "text-gray-900"}>
                      Make a Call
                    </ResponsiveText>
                    <ResponsiveText variant="bodyMedium" color="muted" className="mt-1">
                      Enter a 3-6 digit extension to connect
                    </ResponsiveText>
                  </div>

                  {/* Input Section - Flex Grow */}
                  <div className="flex-1 flex flex-col justify-center">
                    <div className="relative mb-6">
                      <input
                        type="text"
                        value={extension}
                        onChange={(e) => {
                          const value = e.target.value.replace(/[^0-9*#]/g, '').slice(0, 6);
                          setExtension(value);
                          setError('');
                        }}
                        onKeyDown={handleKeyDown}
                        placeholder="Enter extension"
                        className={cn(
                          "w-full text-lg xs:text-xl md:text-2xl lg:text-3xl font-mono font-bold text-center px-3 xs:px-4 py-2.5 xs:py-3 md:py-4 rounded-lg border-2 transition-all duration-200 mobile-input",
                          "focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500",
                          "placeholder:text-xs xs:placeholder:text-sm md:placeholder:text-base placeholder:font-normal",
                          extension
                            ? (isDark
                                ? "text-white border-primary-500 bg-primary-900/20 shadow-inner"
                                : "text-gray-900 border-primary-500 bg-primary-50 shadow-inner")
                            : (isDark
                                ? "text-gray-300 border-gray-600 bg-gray-700/50 placeholder:text-gray-500"
                                : "text-gray-700 border-gray-300 bg-gray-50 placeholder:text-gray-400")
                        )}
                        autoComplete="off"
                        inputMode="numeric"
                      />
                      {extension && (
                        <button
                          onClick={() => {
                            setExtension('');
                            setError('');
                          }}
                          className={cn(
                            "absolute right-3 top-1/2 transform -translate-y-1/2 p-2 rounded-full transition-colors",
                            isDark
                              ? "text-gray-400 hover:text-white hover:bg-gray-600"
                              : "text-gray-500 hover:text-gray-700 hover:bg-gray-200"
                          )}
                          aria-label="Clear extension"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    {error && (
                      <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                        <ResponsiveText variant="bodyMedium" className="text-red-600 dark:text-red-400 text-center">{error}</ResponsiveText>
                      </div>
                    )}

                    <ResponsiveButton
                      onClick={handleCall}
                      disabled={!extension || loading}
                      size="lg"
                      variant={!extension || loading ? "secondary" : "success"}
                      fullWidth
                      className="h-12 md:h-14"
                    >
                      {loading ? (
                        <div className="flex items-center justify-center space-x-3">
                          <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          <span className="font-medium">Calling...</span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center space-x-3">
                          <PhoneCall className="w-5 h-2" />
                          <span className="font-medium">Make Call</span>
                        </div>
                      )}
                    </ResponsiveButton>
                  </div>
                </div>
              </motion.div>
            </div>

            {/* Right Column - Info Panel */}
            <div className="lg:col-span-1 h-full flex flex-col space-y-3 lg:space-y-4 min-h-0">
              {/* Features Section */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.3 }}
                className="flex-shrink-0"
              >
                <div className={cn(
                  "bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4"
                )}>
                  <ResponsiveText variant="bodyLarge" weight="semibold" className={cn("text-center mb-3", isDark ? "text-white" : "text-gray-900")}>
                    Features
                  </ResponsiveText>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="text-center">
                      <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg inline-flex mb-2">
                        <PhoneCall className={cn("w-4 h-4", isDark ? "text-blue-400" : "text-blue-600")} />
                      </div>
                      <ResponsiveText variant="caption" weight="medium" className={isDark ? "text-white" : "text-gray-900"}>
                        HD Voice
                      </ResponsiveText>
                    </div>
                    <div className="text-center">
                      <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg inline-flex mb-2">
                        <User className={cn("w-4 h-4", isDark ? "text-green-400" : "text-green-600")} />
                      </div>
                      <ResponsiveText variant="caption" weight="medium" className={isDark ? "text-white" : "text-gray-900"}>
                        Instant
                      </ResponsiveText>
                    </div>
                    <div className="text-center">
                      <div className="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg inline-flex mb-2">
                        <Users className={cn("w-4 h-4", isDark ? "text-yellow-400" : "text-yellow-600")} />
                      </div>
                      <ResponsiveText variant="caption" weight="medium" className={isDark ? "text-white" : "text-gray-900"}>
                        Multi-Device
                      </ResponsiveText>
                    </div>
                  </div>
                </div>
              </motion.div>

              {/* Recent Calls */}
              {recentCalls.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3, duration: 0.3 }}
                  className="flex-shrink-0"
                >
                  <div className={cn(
                    "bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4"
                  )}>
                    <div className="flex items-center space-x-2 mb-3">
                      <PhoneCall className="w-4 h-4 text-primary-600 dark:text-primary-400" />
                      <ResponsiveText variant="bodyLarge" weight="semibold" className={isDark ? "text-white" : "text-gray-900"}>
                        Recent Calls
                      </ResponsiveText>
                    </div>
                    <div className="space-y-2">
                      {recentCalls.slice(0, 2).map((call, index) => (
                        <div
                          key={index}
                          className={cn(
                            "flex items-center justify-between p-2 rounded border",
                            isDark ? "bg-gray-700/50 border-gray-600" : "bg-gray-50 border-gray-200"
                          )}
                        >
                          <ResponsiveText variant="caption" weight="medium" className={cn("font-mono", isDark ? "text-white" : "text-gray-900")}>
                            {call.extension}
                          </ResponsiveText>
                          <ResponsiveText variant="caption" color="muted">
                            {call.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </ResponsiveText>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Quick Tips Section */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.3 }}
                className="flex-1 min-h-0"
              >
                <div className={cn(
                  "h-full bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm p-4 flex flex-col"
                )}>
                  <ResponsiveText variant="bodyLarge" weight="semibold" className={cn("text-center mb-3", isDark ? "text-white" : "text-gray-800")}>
                    Quick Tips
                  </ResponsiveText>

                  <div className="flex-1 space-y-3 overflow-y-auto">
                    <div className={cn("flex items-start space-x-2 p-2 rounded", isDark ? "bg-gray-700/50" : "bg-gray-50")}>
                      <div className={cn("w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold mt-0.5 flex-shrink-0", isDark ? "bg-primary-600 text-white" : "bg-primary-500 text-white")}>
                        1
                      </div>
                      <div className="min-w-0">
                        <ResponsiveText variant="caption" weight="medium" className={isDark ? "text-white" : "text-gray-900"}>
                          Enter Extension
                        </ResponsiveText>
                        <ResponsiveText variant="caption" color="muted" className="text-xs">
                          Type 3-6 digits in the input field
                        </ResponsiveText>
                      </div>
                    </div>

                    <div className={cn("flex items-start space-x-2 p-2 rounded", isDark ? "bg-gray-700/50" : "bg-gray-50")}>
                      <div className={cn("w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold mt-0.5 flex-shrink-0", isDark ? "bg-primary-600 text-white" : "bg-primary-500 text-white")}>
                        2
                      </div>
                      <div className="min-w-0">
                        <ResponsiveText variant="caption" weight="medium" className={isDark ? "text-white" : "text-gray-900"}>
                          Make Call
                        </ResponsiveText>
                        <ResponsiveText variant="caption" color="muted" className="text-xs">
                          Click button or press Enter
                        </ResponsiveText>
                      </div>
                    </div>

                    <div className={cn("flex items-start space-x-2 p-2 rounded", isDark ? "bg-gray-700/50" : "bg-gray-50")}>
                      <div className={cn("w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold mt-0.5 flex-shrink-0", isDark ? "bg-primary-600 text-white" : "bg-primary-500 text-white")}>
                        3
                      </div>
                      <div className="min-w-0">
                        <ResponsiveText variant="caption" weight="medium" className={isDark ? "text-white" : "text-gray-900"}>
                          Keyboard Support
                        </ResponsiveText>
                        <ResponsiveText variant="caption" color="muted" className="text-xs">
                          Use keyboard for numbers, * and #
                        </ResponsiveText>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>

          </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HomePage;