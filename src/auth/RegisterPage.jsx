import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  FiEye as Eye,
  FiEyeOff as EyeOff,
  FiUser as User,
  FiLock as Lock,
  FiMail as Mail,
  FiUserPlus as UserPlus,
  FiMoon as Moon,
  FiSun as Sun,
} from 'react-icons/fi';
import { register } from '../services/register';
import { useTheme } from '../contexts/ThemeContext';
import { cn } from '../utils/ui';
import toast from 'react-hot-toast';

const RegisterPage = ({ onRegister, onSwitchToLogin }) => {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const { darkMode, toggleDarkMode } = useTheme();

  const handleRegister = async (e) => {
    e.preventDefault();
    
    if (!username.trim() || username.length < 3) {
      toast.error('Username must be at least 3 characters long');
      return;
    }
    
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error('Please enter a valid email address');
      return;
    }
    
    if (password.length < 6) {
      toast.error('Password must be at least 6 characters long');
      return;
    }
    
    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    
    if (!agreedToTerms) {
      toast.error('Please agree to the terms and conditions');
      return;
    }

    setLoading(true);
    try {
      const result = await register(username, email, password);
      if (result.success) {
        toast.success(`Registration successful! Extension: ${result.extension}`);
        setTimeout(() => {
          onSwitchToLogin();
        }, 2000);
      } else {
        toast.error(result.message || 'Registration failed');
      }
    } catch (error) {
      console.error('Registration error:', error);
      toast.error('Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={cn(
      'min-h-screen flex items-center justify-center relative overflow-hidden',
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

      {/* Main Register Card */}
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
              <UserPlus className="w-8 h-8 text-primary-600" />
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
              Create Account
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
              Join our VoIP platform today
            </motion.p>
          </div>

          {/* Register Form */}
          <form onSubmit={handleRegister} className="space-y-6">
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
                  required
                />
              </div>
            </motion.div>

            {/* Email Field */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.6 }}
            >
              <label className={cn(
                'block text-sm font-medium mb-2',
                darkMode ? 'text-secondary-300' : 'text-secondary-700'
              )}>
                Email
              </label>
              <div className="relative">
                <Mail className={cn(
                  'absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5',
                  darkMode ? 'text-secondary-400' : 'text-secondary-500'
                )} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={cn(
                    'w-full pl-10 pr-4 py-3 rounded-lg border transition-all duration-200',
                    'focus:ring-2 focus:ring-primary-500 focus:border-primary-500',
                    darkMode
                      ? 'bg-secondary-800 border-secondary-600 text-white placeholder-secondary-400'
                      : 'bg-white border-secondary-300 text-secondary-900 placeholder-secondary-500'
                  )}
                  placeholder="Enter your email"
                  required
                />
              </div>
            </motion.div>

            {/* Password Field */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.7 }}
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
                  type={showPassword ? 'text' : 'password'}
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
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className={cn(
                    'absolute right-3 top-1/2 transform -translate-y-1/2',
                    darkMode ? 'text-secondary-400 hover:text-secondary-300' : 'text-secondary-500 hover:text-secondary-700'
                  )}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </motion.div>

            {/* Confirm Password Field */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.8 }}
            >
              <label className={cn(
                'block text-sm font-medium mb-2',
                darkMode ? 'text-secondary-300' : 'text-secondary-700'
              )}>
                Confirm Password
              </label>
              <div className="relative">
                <Lock className={cn(
                  'absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5',
                  darkMode ? 'text-secondary-400' : 'text-secondary-500'
                )} />
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={cn(
                    'w-full pl-10 pr-12 py-3 rounded-lg border transition-all duration-200',
                    'focus:ring-2 focus:ring-primary-500 focus:border-primary-500',
                    darkMode
                      ? 'bg-secondary-800 border-secondary-600 text-white placeholder-secondary-400'
                      : 'bg-white border-secondary-300 text-secondary-900 placeholder-secondary-500'
                  )}
                  placeholder="Confirm your password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className={cn(
                    'absolute right-3 top-1/2 transform -translate-y-1/2',
                    darkMode ? 'text-secondary-400 hover:text-secondary-300' : 'text-secondary-500 hover:text-secondary-700'
                  )}
                >
                  {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </motion.div>

            {/* Terms Agreement */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.9 }}
              className="flex items-start space-x-3"
            >
              <input
                type="checkbox"
                id="terms"
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                className="mt-1 w-4 h-4 text-primary-600 border-secondary-300 rounded focus:ring-primary-500"
              />
              <label htmlFor="terms" className={cn(
                'text-sm',
                darkMode ? 'text-secondary-400' : 'text-secondary-600'
              )}>
                I agree to the{' '}
                <a href="#" className="text-primary-600 hover:text-primary-700 underline">
                  Terms and Conditions
                </a>{' '}
                and{' '}
                <a href="#" className="text-primary-600 hover:text-primary-700 underline">
                  Privacy Policy
                </a>
              </label>
            </motion.div>

            {/* Register Button */}
            <motion.button
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.0 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="submit"
              disabled={loading}
              className={cn(
                'w-full py-3 px-4 rounded-lg font-medium transition-all duration-200',
                'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2',
                loading
                  ? 'bg-secondary-400 cursor-not-allowed'
                  : 'bg-primary-600 hover:bg-primary-700 text-white shadow-lg hover:shadow-xl'
              )}
            >
              {loading ? (
                <div className="flex items-center justify-center space-x-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Creating Account...</span>
                </div>
              ) : (
                <div className="flex items-center justify-center space-x-2">
                  <UserPlus className="w-5 h-5" />
                  <span>Create Account</span>
                </div>
              )}
            </motion.button>
          </form>

          {/* Login Link */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.1 }}
            className="mt-6 text-center"
          >
            <p className={cn(
              'text-sm',
              darkMode ? 'text-secondary-400' : 'text-secondary-600'
            )}>
              Already have an account?{' '}
              <button
                onClick={onSwitchToLogin}
                className="text-primary-600 hover:text-primary-700 font-medium underline"
              >
                Sign in here
              </button>
            </p>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
};

export default RegisterPage;
