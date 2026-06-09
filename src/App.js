import { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { ThemeProvider } from './contexts/ThemeContext';
// Import enhanced toast utilities to ensure all methods are available globally
import './utils/toastUtils';
import LoginPage from './auth/LoginPage';
import RegisterPage from './auth/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import AdminDashboard from './pages/AdminDashboard';
import ContactsPage from './pages/ContactsPage';
import CallLogsPage from './pages/CallLogsPage';
import CallingPage from './pages/CallingPage';
import WebRTCTestPage from './pages/WebRTCTestPage';
import IPConfigurationPage from './pages/IPConfigurationPage';
import Loader from './components/loader';
import { initializeSIP } from './services/call';
import CONFIG from './services/config';
import VoipPhone from './components/VoipPhone';
import IncomingCallListener from './pages/IncomingCallListener';
import BrowserCompatibilityAlert from './components/BrowserCompatibilityAlert';
import MicrophoneFix from './components/MicrophoneFix';
import MicrophoneTroubleshooter from './components/MicrophoneTroubleshooter';
import sipManager from './services/sipManager';
import ipConfigService from './services/ipConfigService';
import { testMicrophoneAccess } from './utils/microphoneDiagnostics';
import MicrophoneTestPage from './pages/MicrophoneTestPage';

const App = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [sipPassword, setSipPassword] = useState(null);
  const [darkMode, setDarkMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [notification, setNotification] = useState(null);
  const [isRegistered, setIsRegistered] = useState(false);
  const [showMicrophoneFix, setShowMicrophoneFix] = useState(false);
  const [showMicrophoneTroubleshooter, setShowMicrophoneTroubleshooter] = useState(false);
  const [microphoneStatus, setMicrophoneStatus] = useState(null);
  const [contacts] = useState([
    { id: 1, name: 'John Doe', extension: '1001', avatar: null },
    { id: 2, name: 'Jane Smith', extension: '1002', avatar: null },
  ]);

  useEffect(() => {
    // Check if IP configuration is required first
    if (!ipConfigService.isConfigured()) {
      console.log('[App.js] IP configuration required, redirecting to /ip-config');
      if (window.location.pathname !== '/ip-config') {
        navigate('/ip-config', { replace: true });
      }
      return;
    }

    const token = localStorage.getItem('token');
    const extension = localStorage.getItem('extension');
    const storedSipPassword = localStorage.getItem('sipPassword');
    const userRole = localStorage.getItem('userRole') || 'user';

    if (token && extension && storedSipPassword) {
      setUser({ username: 'User', extension, role: userRole });
      setSipPassword(storedSipPassword);
      initializeConnection(extension);
    } else if (!token && window.location.pathname !== '/login' && window.location.pathname !== '/register' && window.location.pathname !== '/ip-config') {
      console.log('[App.js] No token, redirecting to /login');
      navigate('/login', { replace: true });
    }
  }, [navigate]);

  useEffect(() => {
    const handleRegistrationStatus = (event) => {
      const { extension, registered, cause } = event.detail;
      if (extension === user?.extension) {
        setIsRegistered(registered);
        if (!registered && cause) {
          setNotification({ message: `Registration failed: ${cause}`, type: 'error' });
          setTimeout(() => setNotification(null), 5000);
        }
      }
    };
    window.addEventListener('registrationStatus', handleRegistrationStatus);
    return () => window.removeEventListener('registrationStatus', handleRegistrationStatus);
  }, [user?.extension]);

  // Check microphone access
  const checkMicrophoneAccess = async () => {
    try {
      const result = await testMicrophoneAccess();
      setMicrophoneStatus(result);

      if (!result.success) {
        console.warn('[App.js] Microphone access failed:', result.message);
        // Don't automatically show the fix dialog, let user trigger it
      } else {
        console.log('[App.js] Microphone access successful');
      }

      return result.success;
    } catch (error) {
      console.error('[App.js] Microphone check failed:', error);
      setMicrophoneStatus({
        success: false,
        message: 'Microphone check failed: ' + error.message
      });
      return false;
    }
  };

  const handleMicrophoneFixed = () => {
    setShowMicrophoneFix(false);
    setShowMicrophoneTroubleshooter(false);
    checkMicrophoneAccess(); // Re-check after fix
  };

  const handleShowTroubleshooter = () => {
    setShowMicrophoneTroubleshooter(true);
  };

  const initializeConnection = async (extension) => {
    try {
      // Use WebRTC mode by default (no traditional SIP registration)
      await initializeSIP({ extension }, (call) => {
        // Handle incoming calls
        console.log('[App.js] Incoming call received:', call);
        navigate('/calling', {
          state: {
            contact: contacts.find((c) => c.extension === call.from) || {
              name: `Ext ${call.from}`,
              extension: call.from,
            },
            callStatus: 'Incoming',
            isOutgoing: false,
            channel: `${call.from}@${(CONFIG?.SIP_SERVER || '192.168.1.2')}`, 
            session: call.session,
          },
        });
      }, true); // Enable WebRTC mode
      console.log('[App.js] WebRTC connection initialized for extension:', extension);
    } catch (error) {
      console.error('[App.js] Connection initialization failed:', error);
      // Don't show error for WebRTC mode since it's expected to skip SIP registration
      if (!error.message.includes('WebRTC mode')) {
        setNotification({ message: `Connection failed: ${error.message}`, type: 'error' });
        setTimeout(() => setNotification(null), 5000);
      }
    }
  };

  const handleLogin = (result) => {
    if (result.success) {
      localStorage.setItem('token', result.token);
      localStorage.setItem('extension', result.user?.extension);
      localStorage.setItem('sipPassword', `password${result.user?.extension}`);
      localStorage.setItem('userRole', result.user?.role || 'user');
      localStorage.setItem('user_id', result.user?.id?.toString() || '');
      const extension = result.user?.extension;
      const role = result.user?.role || 'user';
      console.log('[App.js] Login successful, setting user:', {
        username: result.user?.username,
        extension,
        role
      });
      setUser({
        username: result.user?.username || 'User',
        extension,
        role
      });
      setSipPassword(`password${extension}`);
      initializeConnection(extension);

      // Check microphone access after login
      setTimeout(() => {
        checkMicrophoneAccess();
      }, 1000);

      // Navigate to appropriate dashboard based on role
      if (role === 'admin') {
        navigate('/admin', { state: { success: result.message } });
      } else {
        navigate('/dashboard', { state: { success: result.message } });
      }
    }
  };

  const handleRegister = (extension, sipPassword) => {
  // Clear any saved auth info (or don't save yet)
  localStorage.removeItem('token');
  localStorage.removeItem('extension');
  localStorage.removeItem('sipPassword');

  // Just navigate to login page, let user login explicitly
  setUser(null);
  setSipPassword(null);
  navigate('/login', { state: { success: 'Registered successfully, please log in' } });
};


  const handleLogout = () => {
    // Clean up SIP connection
    sipManager.destroy();

    // Clear localStorage
    localStorage.removeItem('token');
    localStorage.removeItem('extension');
    localStorage.removeItem('sipPassword');
    localStorage.removeItem('userRole');
    localStorage.removeItem(`sipRegistered_${user?.extension}`);

    // Reset state
    setUser(null);
    setSipPassword(null);
    setDarkMode(false);
    setIsRegistered(false);

    navigate('/login', { state: { success: 'Logged out successfully' } });
  };

  const token = localStorage.getItem('token');

  return (
    <ThemeProvider>
      <div className={`h-screen w-screen overflow-hidden ${darkMode ? 'bg-gray-900' : 'bg-gray-100'}`}>
        <BrowserCompatibilityAlert darkMode={darkMode} />
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: {
              background: darkMode ? '#374151' : '#ffffff',
              color: darkMode ? '#ffffff' : '#374151',
            },
          }}
        />
      {notification && (
        <div
          className={`fixed top-20 right-4 sm:right-6 z-50 glass-effect p-3 sm:p-4 rounded-lg shadow-lg animate-[fadeInUp_0.6s_ease-out_forwards] ${
            notification.type === 'success' ? 'bg-green-500/80' : notification.type === 'error' ? 'bg-red-500/80' : 'bg-blue-500/80'
          }`}
          role="alert"
          aria-live="polite"
        >
          <span className="text-xs sm:text-sm font-medium text-white">{notification.message}</span>
        </div>
      )}
      {user?.extension && sipPassword && (
        <>
          {/* SipClient disabled for WebRTC mode - uncomment if you want traditional SIP */}
          {/* <SipClient
            extension={user.extension}
            sipPassword={sipPassword}
          /> */}
          <IncomingCallListener /> {/* Add IncomingCallListener here */}
        </>
      )}
      <Routes>
        <Route
          path="/ip-config"
          element={<IPConfigurationPage
            darkMode={darkMode}
            toggleDarkMode={() => setDarkMode(!darkMode)}
          />}
        />
        <Route
          path="/login"
          element={<LoginPage
            onLogin={handleLogin}
            onSwitchToRegister={() => navigate('/register')}
            darkMode={darkMode}
            toggleDarkMode={() => setDarkMode(!darkMode)}
          />}
        />
        <Route
          path="/register"
          element={<RegisterPage
            onRegister={handleRegister}
            onSwitchToLogin={() => navigate('/login')}
            darkMode={darkMode}
            toggleDarkMode={() => setDarkMode(!darkMode)}
          />}
        />
        <Route
          path="/dashboard"
          element={token ? <DashboardPage
            user={user}
            onLogout={handleLogout}
            darkMode={darkMode}
            toggleDarkMode={() => setDarkMode(!darkMode)}
          /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/admin"
          element={token && user?.role === 'admin' ? <AdminDashboard
            user={user}
            onLogout={handleLogout}
          /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/contacts"
          element={token ? <ContactsPage
            darkMode={darkMode}
            toggleDarkMode={() => setDarkMode(!darkMode)}
            setIsLoading={setIsLoading}
          /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/callings"
          element={token ? <VoipPhone
            extension={user?.extension || ''}
            sipPassword={sipPassword}
            darkMode={darkMode}
            toggleDarkMode={() => setDarkMode(!darkMode)}
            setIsLoading={setIsLoading}
          /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/callLogs"
          element={token ? <CallLogsPage
            darkMode={darkMode}
            toggleDarkMode={() => setDarkMode(!darkMode)}
          /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/calling"
          element={token ? <CallingPage
            darkMode={darkMode}
          /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/webrtc-test"
          element={token ? <WebRTCTestPage /> : <Navigate to="/login" replace />}
        />
        <Route
          path="/microphone-test"
          element={<MicrophoneTestPage darkMode={darkMode} />}
        />
        <Route path="/" element={
          ipConfigService.isConfigured()
            ? <Navigate to="/login" replace />
            : <Navigate to="/ip-config" replace />
        } />
      </Routes>
      {isLoading && <Loader />}

      {/* Browser Compatibility Alert */}
      <BrowserCompatibilityAlert darkMode={darkMode} />

      {/* Microphone Fix Dialog */}
      <MicrophoneFix
        isOpen={showMicrophoneFix}
        onClose={() => setShowMicrophoneFix(false)}
        onFixed={handleMicrophoneFixed}
      />

      {/* Enhanced Microphone Troubleshooter */}
      <MicrophoneTroubleshooter
        isOpen={showMicrophoneTroubleshooter}
        onClose={() => setShowMicrophoneTroubleshooter(false)}
        onFixed={handleMicrophoneFixed}
      />

      {/* Microphone Status Indicator */}
      {microphoneStatus && !microphoneStatus.success && (
        <div className="fixed bottom-4 left-4 z-40 flex space-x-2">
          <button
            onClick={() => setShowMicrophoneTroubleshooter(true)}
            className="flex items-center space-x-2 bg-red-600 text-white px-4 py-2 rounded-lg shadow-lg hover:bg-red-700 transition-colors"
            title="Open Microphone Troubleshooter"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
            <span>Fix Microphone</span>
          </button>

          <button
            onClick={() => setShowMicrophoneFix(true)}
            className="flex items-center space-x-2 bg-yellow-600 text-white px-4 py-2 rounded-lg shadow-lg hover:bg-yellow-700 transition-colors"
            title="Quick microphone fix"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <span>Fix Microphone</span>
          </button>
        </div>
      )}
      </div>
    </ThemeProvider>
  );
};

export default App;