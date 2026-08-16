import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import {
  FiEye as Eye,
  FiEyeOff as EyeOff,
  FiUser as User,
  FiLock as Lock,
  FiPhone as Phone,
  FiShield as Shield,
  FiMoon as Moon,
  FiSun as Sun,
  FiArrowRight as ArrowRight,
  FiDownload as Download
} from "react-icons/fi";
import { login } from "../services/login";
import { useTheme } from "../contexts/ThemeContext";
import { cn } from "../utils/ui";
import toast from "react-hot-toast";

const LoginPage = ({ onLogin, onSwitchToRegister }) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { darkMode, toggleDarkMode } = useTheme();

  // URL of the public CA certificate endpoint so users can install the local CA
  // on their phone/laptop and trust the encrypted HTTPS/WebRTC connections.
  const caDownloadUrl = () => {
    const { hostname, port } = window.location;
    if (port === '3000') return `http://${hostname}:8080/api/server-info/ca.crt`;
    return `${window.location.origin}/api/server-info/ca.crt`;
  };

  useEffect(() => {
    // Show success message if redirected from registration
    if (location.state?.success) {
      toast.success(location.state.success);
      // Clear the state to prevent showing the message again
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location, navigate]);

  useEffect(() => {
    // Load saved username if remember me was checked
    const savedUsername = localStorage.getItem('rememberedUsername');
    const wasRemembered = localStorage.getItem('rememberMe') === 'true';
    if (savedUsername && wasRemembered) {
      setUsername(savedUsername);
      setRememberMe(true);
    }
  }, []);

  const validateForm = () => {
    if (!username.trim()) {
      toast.error("Username is required");
      return false;
    }
    if (username.trim().length < 3) {
      toast.error("Username must be at least 3 characters");
      return false;
    }
    if (!password) {
      toast.error("Password is required");
      return false;
    }
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return false;
    }
    return true;
  };

  const handleLogin = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setLoading(true);

    try {
      console.log('[LoginPage.jsx] Attempting login with username:', username);
      const result = await login(username, password);
      console.log('[LoginPage.jsx] Login result:', result);

      if (result.success) {
        // Handle remember me
        if (rememberMe) {
          localStorage.setItem('rememberedUsername', username);
          localStorage.setItem('rememberMe', 'true');
        } else {
          localStorage.removeItem('rememberedUsername');
          localStorage.removeItem('rememberMe');
        }

        toast.success(result.message || "Login successful!");
        console.log('[LoginPage.jsx] Login successful, calling onLogin with result:', result);

        // Call the parent's onLogin handler
        if (typeof onLogin === 'function') {
          onLogin(result);
        } else {
          console.error('[LoginPage.jsx] onLogin is not a function:', onLogin);
        }
      } else {
        console.error('[LoginPage.jsx] Login failed:', result.error);
        toast.error(result.error || "Login failed");
      }
    } catch (error) {
      console.error('[LoginPage.jsx] Login error:', error);
      toast.error(error.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={cn(
      'min-h-screen flex items-center justify-center relative overflow-hidden px-safe pt-safe pb-safe',
      darkMode
        ? 'bg-gradient-to-br from-secondary-900 via-secondary-800 to-secondary-900'
        : 'bg-gradient-to-br from-primary-50 via-white to-accent-50'
    )}>
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-20 left-20 w-72 h-72 bg-primary-500 rounded-full mix-blend-multiply filter blur-xl animate-pulse" />
        <div className="absolute top-40 right-20 w-72 h-72 bg-accent-500 rounded-full mix-blend-multiply filter blur-xl animate-pulse delay-1000" />
        <div className="absolute bottom-20 left-40 w-72 h-72 bg-success-500 rounded-full mix-blend-multiply filter blur-xl animate-pulse delay-2000" />
      </div>

      {/* Dark Mode Toggle */}
      <button
        onClick={toggleDarkMode}
        className={cn(
          'absolute top-6 right-6 p-3 rounded-xl transition-all duration-200 z-10',
          darkMode
            ? 'bg-secondary-800 hover:bg-secondary-700 text-yellow-400'
            : 'bg-white hover:bg-secondary-50 text-secondary-600 shadow-lg'
        )}
      >
        {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
      </button>
      {/* Main Login Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className={cn(
          'w-full max-w-md mx-4 relative z-10',
          darkMode ? 'glass-effect-dark' : 'glass-effect'
        )}
      >
        <div className="p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
              className="inline-flex items-center justify-center w-16 h-16 bg-primary-100 rounded-2xl mb-4"
            >
              <Shield className="w-8 h-8 text-primary-600" />
            </motion.div>
            <motion.h1
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className={cn(
                'text-2xl font-bold mb-2',
                darkMode ? 'text-white' : 'text-secondary-900'
              )}
            >
              Welcome Back
            </motion.h1>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
              className={cn(
                'text-sm',
                darkMode ? 'text-secondary-400' : 'text-secondary-600'
              )}
            >
              Sign in to your VoIP account
            </motion.p>
          </div>

          {/* Login Form */}
          <form onSubmit={handleLogin} className="space-y-6">
            {/* Username Field */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5 }}
            >
              <label className={cn(
                'block text-sm font-medium mb-2',
                darkMode ? 'text-secondary-300' : 'text-secondary-700'
              )}>
                Username
              </label>
              <div className="relative">
                <User className={cn(
                  'absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5',
                  darkMode ? 'text-secondary-400' : 'text-secondary-500'
                )} />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className={cn(
                    'w-full pl-10 pr-4 py-3 rounded-lg border transition-all duration-200',
                    'focus:ring-2 focus:ring-primary-500 focus:border-primary-500',
                    darkMode
                      ? 'bg-secondary-800 border-secondary-600 text-white placeholder-secondary-400'
                      : 'bg-white border-secondary-300 text-secondary-900 placeholder-secondary-500'
                  )}
                  placeholder="Enter your username"
                  disabled={loading}
                  autoComplete="username"
                />
              </div>
            </motion.div>

            {/* Password Field */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.6 }}
            >
              <label className={cn(
                'block text-sm font-medium mb-2',
                darkMode ? 'text-secondary-300' : 'text-secondary-700'
              )}>
                Password
              </label>
              <div className="relative">
                <Lock className={cn(
                  'absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5',
                  darkMode ? 'text-secondary-400' : 'text-secondary-500'
                )} />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={cn(
                    'w-full pl-10 pr-12 py-3 rounded-lg border transition-all duration-200',
                    'focus:ring-2 focus:ring-primary-500 focus:border-primary-500',
                    darkMode
                      ? 'bg-secondary-800 border-secondary-600 text-white placeholder-secondary-400'
                      : 'bg-white border-secondary-300 text-secondary-900 placeholder-secondary-500'
                  )}
                  placeholder="Enter your password"
                  disabled={loading}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className={cn(
                    'absolute right-3 top-1/2 transform -translate-y-1/2 p-1 rounded',
                    darkMode ? 'text-secondary-400 hover:text-secondary-300' : 'text-secondary-500 hover:text-secondary-700'
                  )}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </motion.div>
            {/* Remember Me */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7 }}
              className="flex items-center justify-between"
            >
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500 focus:ring-2"
                />
                <span className={cn(
                  'ml-2 text-sm',
                  darkMode ? 'text-secondary-300' : 'text-secondary-700'
                )}>
                  Remember me
                </span>
              </label>
            </motion.div>

            {/* Login Button */}
            <motion.button
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8 }}
              type="submit"
              disabled={loading}
              className={cn(
                'w-full py-3 px-4 rounded-lg font-medium transition-all duration-200',
                'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2',
                loading
                  ? 'bg-secondary-400 cursor-not-allowed'
                  : 'bg-primary-600 hover:bg-primary-700 transform hover:-translate-y-0.5 shadow-lg hover:shadow-xl',
                'text-white flex items-center justify-center space-x-2'
              )}
            >
              {loading ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Signing in...</span>
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </motion.button>

            {/* Register Link */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.9 }}
              className="text-center"
            >
              <p className={cn(
                'text-sm',
                darkMode ? 'text-secondary-400' : 'text-secondary-600'
              )}>
                Don't have an account?{' '}
                <button
                  type="button"
                  onClick={onSwitchToRegister}
                  disabled={loading}
                  className={cn(
                    'font-medium transition-colors',
                    loading
                      ? 'text-secondary-400 cursor-not-allowed'
                      : 'text-primary-600 hover:text-primary-500'
                  )}
                >
                  Create account
                </button>
              </p>
            </motion.div>
          </form>
        </div>

        {/* Footer */}
        <div className={cn(
          'px-8 py-4 border-t',
          darkMode ? 'border-secondary-700' : 'border-secondary-200'
        )}>
          <div className="flex flex-col items-center gap-1.5">
            <a
              href={caDownloadUrl()}
              download="voip-local-ca.crt"
              className={cn(
                'inline-flex items-center gap-1.5 text-xs font-medium transition-colors',
                darkMode
                  ? 'text-primary-400 hover:text-primary-300'
                  : 'text-primary-600 hover:text-primary-500'
              )}
              title="Install the local CA certificate to trust encrypted calls on this device"
            >
              <Download className="w-3.5 h-3.5" />
              Download CA certificate
            </a>
            <details className="w-full">
              <summary className={cn(
                'cursor-pointer text-[11px] text-center transition-colors',
                darkMode ? 'text-secondary-500 hover:text-secondary-300' : 'text-secondary-400 hover:text-secondary-600'
              )}>
                How to install it
              </summary>
              <div className={cn(
                'mt-2 text-left text-[11px] leading-relaxed rounded-lg p-3',
                darkMode ? 'bg-secondary-800 text-secondary-300' : 'bg-secondary-50 text-secondary-600'
              )}>
                <p><span className="font-medium">Windows:</span> run the file, Install Certificate → Local Machine → Trusted Root Certification Authorities.</p>
                <p className="mt-1"><span className="font-medium">macOS:</span> Keychain Access → drag into System → double-click → Always Trust.</p>
                <p className="mt-1"><span className="font-medium">iOS:</span> open the file, install the profile, then Settings → General → About → Certificate Trust Settings → enable full trust.</p>
                <p className="mt-1"><span className="font-medium">Android:</span> Settings → Security → Install a certificate → CA certificate.</p>
                <p className="mt-1"><span className="font-medium">Linux:</span> <code>sudo cp ca.crt /usr/local/share/ca-certificates/ &amp;&amp; sudo update-ca-certificates</code></p>
                <p className="mt-1"><span className="font-medium">Firefox:</span> Settings → Certificates → View Certificates → Authorities → Import.</p>
              </div>
            </details>
            <div className="flex items-center justify-center space-x-2 text-xs pt-1">
              <Phone className="w-4 h-4 text-primary-500" />
              <span className={cn(
                darkMode ? 'text-secondary-400' : 'text-secondary-500'
              )}>
                Professional VoIP System
              </span>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default LoginPage;