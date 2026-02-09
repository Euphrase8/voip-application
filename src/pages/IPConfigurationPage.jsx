import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import {
  Settings,
  Server,
  Wifi,
  CheckCircle,
  XCircle,
  Loader2,
  Network,
  ArrowRight,
  AlertTriangle
} from 'lucide-react';
import ipConfigService from '../services/ipConfigService';

const IPConfigurationPage = ({ darkMode, toggleDarkMode }) => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState({
    backend: { status: 'untested', message: '' },
    asterisk: { status: 'untested', message: '' }
  });

  const [config, setConfig] = useState({
    backendHost: '192.168.1.2',
    backendPort: '8080',
    asteriskHost: '192.168.1.2',
    asteriskPort: '8088',
    asteriskAMIPort: '5038'
  });

  useEffect(() => {
    // Check if configuration already exists
    const existingConfig = localStorage.getItem('voipIPConfig');
    if (existingConfig) {
      try {
        const parsed = JSON.parse(existingConfig);
        setConfig(prev => ({ ...prev, ...parsed }));
      } catch (error) {
        console.error('Failed to parse existing config:', error);
      }
    }
  }, []);

  const handleInputChange = (field, value) => {
    setConfig(prev => ({
      ...prev,
      [field]: value
    }));
    
    // Reset connection status when config changes
    setConnectionStatus({
      backend: { status: 'untested', message: '' },
      asterisk: { status: 'untested', message: '' }
    });
  };

  const testBackendConnection = async () => {
    const backendUrl = `http://${config.backendHost}:${config.backendPort}`;
    
    try {
      const response = await fetch(`${backendUrl}/config`, {
        method: 'GET',
        timeout: 5000,
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          return { status: 'success', message: 'Backend connection successful' };
        }
      }
      return { status: 'error', message: 'Backend responded but config endpoint failed' };
    } catch (error) {
      return { 
        status: 'error', 
        message: `Backend connection failed: ${error.message}` 
      };
    }
  };

  const testAsteriskConnection = async () => {
    try {
      // Use the ipConfigService to test Asterisk connections through backend
      const result = await ipConfigService.testAsteriskConnection(config);

      if (result.success) {
        return {
          status: 'success',
          message: result.message,
          details: result.details
        };
      } else {
        return {
          status: 'warning',
          message: result.message,
          details: result.details
        };
      }
    } catch (error) {
      return {
        status: 'error',
        message: `Asterisk connection test failed: ${error.message}`,
        details: { error: error.message }
      };
    }
  };

  const testConnections = async () => {
    setTestingConnection(true);
    
    try {
      // Test backend connection
      setConnectionStatus(prev => ({
        ...prev,
        backend: { status: 'testing', message: 'Testing backend connection...' }
      }));
      
      const backendResult = await testBackendConnection();
      setConnectionStatus(prev => ({
        ...prev,
        backend: backendResult
      }));

      // Test Asterisk connection
      setConnectionStatus(prev => ({
        ...prev,
        asterisk: { status: 'testing', message: 'Testing Asterisk connection...' }
      }));
      
      const asteriskResult = await testAsteriskConnection();
      setConnectionStatus(prev => ({
        ...prev,
        asterisk: asteriskResult
      }));

      // Show overall result
      if (backendResult.status === 'success' && asteriskResult.status === 'success') {
        toast.success('All connections successful! Ready to save configuration.');
      } else if (backendResult.status === 'success' && asteriskResult.status === 'warning') {
        toast.success('Backend connected. Asterisk reachable but may need configuration. You can save and configure Asterisk later.');
      } else if (backendResult.status === 'success') {
        toast.error('Backend connected but Asterisk connection failed. Check Asterisk IP and configuration.');
      } else {
        toast.error('Connection tests failed. Please check your configuration.');
      }

    } catch (error) {
      console.error('Connection test failed:', error);
      toast.error('Connection test failed');
    } finally {
      setTestingConnection(false);
    }
  };

  const saveConfiguration = async () => {
    setIsLoading(true);
    
    try {
      // Validate configuration
      if (!config.backendHost || !config.backendPort || !config.asteriskHost || !config.asteriskPort) {
        toast.error('Please fill in all required fields');
        return;
      }

      // Save to localStorage
      localStorage.setItem('voipIPConfig', JSON.stringify(config));
      localStorage.setItem('voipConfigured', 'true');

      // Show appropriate success message based on connection status
      if (connectionStatus.backend.status === 'success' && connectionStatus.asterisk.status === 'success') {
        toast.success('Configuration saved! All services are ready.');
      } else if (connectionStatus.backend.status === 'success') {
        toast.success('Configuration saved! You can configure Asterisk services later.');
      } else {
        toast.success('Configuration saved! Please verify your settings after login.');
      }

      // Navigate to login page
      setTimeout(() => {
        navigate('/login');
      }, 1500);

    } catch (error) {
      console.error('Failed to save configuration:', error);
      toast.error('Failed to save configuration');
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'testing':
        return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
      default:
        return <div className="w-5 h-5 rounded-full border-2 border-gray-300" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'success':
        return 'text-green-600 dark:text-green-400';
      case 'warning':
        return 'text-yellow-600 dark:text-yellow-400';
      case 'error':
        return 'text-red-600 dark:text-red-400';
      case 'testing':
        return 'text-blue-600 dark:text-blue-400';
      default:
        return 'text-gray-600 dark:text-gray-400';
    }
  };

  return (
    <div className={`min-h-screen p-2 xs:p-3 sm:p-4 px-safe pt-safe pb-safe ${
      darkMode ? 'bg-gray-900' : 'bg-gradient-to-br from-blue-50 to-indigo-100'
    }`}>
      <div className="flex flex-col lg:flex-row gap-3 xs:gap-4 sm:gap-6 max-w-7xl mx-auto">
        {/* Main Configuration Card - Mobile Responsive */}
        <div className={`flex-1 ${
          darkMode ? 'bg-gray-800' : 'bg-white'
        } rounded-lg xs:rounded-xl sm:rounded-2xl shadow-lg xs:shadow-xl sm:shadow-2xl p-4 xs:p-6 sm:p-8`}>
        
        {/* Header - Mobile Responsive */}
        <div className="text-center mb-4 xs:mb-6 sm:mb-8">
          <div className="flex justify-center mb-3 xs:mb-4">
            <div className={`p-2 xs:p-3 sm:p-4 rounded-full ${
              darkMode ? 'bg-blue-900/50' : 'bg-blue-100'
            }`}>
              <Settings className={`w-6 h-6 xs:w-7 xs:h-7 sm:w-8 sm:h-8 ${
                darkMode ? 'text-blue-400' : 'text-blue-600'
              }`} />
            </div>
          </div>
          <h1 className={`text-xl xs:text-2xl sm:text-3xl font-bold mb-1 xs:mb-2 responsive-heading ${
            darkMode ? 'text-white' : 'text-gray-900'
          }`}>
            VoIP Configuration
          </h1>
          <p className={`text-sm xs:text-base sm:text-lg responsive-text ${
            darkMode ? 'text-gray-300' : 'text-gray-600'
          }`}>
            Configure your backend and Asterisk server connections
          </p>
        </div>

        {/* Configuration Form - Mobile Responsive */}
        <div className="space-y-4 xs:space-y-5 sm:space-y-6">

          {/* Backend Configuration - Mobile Responsive */}
          <div className={`p-3 xs:p-4 sm:p-6 rounded-lg xs:rounded-xl border ${
            darkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'
          }`}>
            <div className="flex items-center mb-3 xs:mb-4">
              <Server className={`w-4 h-4 xs:w-5 xs:h-5 mr-2 ${
                darkMode ? 'text-blue-400' : 'text-blue-600'
              }`} />
              <h3 className={`text-base xs:text-lg font-semibold ${
                darkMode ? 'text-white' : 'text-gray-900'
              }`}>
                Backend Server
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 xs:gap-4">
              <div>
                <label className={`block text-xs xs:text-sm font-medium mb-1 xs:mb-2 ${
                  darkMode ? 'text-gray-300' : 'text-gray-700'
                }`}>
                  Backend Host/IP
                </label>
                <input
                  type="text"
                  value={config.backendHost}
                  onChange={(e) => handleInputChange('backendHost', e.target.value)}
                  placeholder="192.168.1.2"
                  className={`w-full px-3 xs:px-4 py-2 xs:py-3 rounded-lg border focus:ring-2 focus:ring-blue-500 focus:border-transparent mobile-input touch-target ${
                    darkMode
                      ? 'bg-gray-600 border-gray-500 text-white placeholder-gray-400'
                      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                  }`}
                  style={{ fontSize: '16px' }}
                />
              </div>
              <div>
                <label className={`block text-xs xs:text-sm font-medium mb-1 xs:mb-2 ${
                  darkMode ? 'text-gray-300' : 'text-gray-700'
                }`}>
                  Backend Port
                </label>
                <input
                  type="text"
                  value={config.backendPort}
                  onChange={(e) => handleInputChange('backendPort', e.target.value)}
                  placeholder="8080"
                  className={`w-full px-3 xs:px-4 py-2 xs:py-3 rounded-lg border focus:ring-2 focus:ring-blue-500 focus:border-transparent mobile-input touch-target ${
                    darkMode
                      ? 'bg-gray-600 border-gray-500 text-white placeholder-gray-400'
                      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                  }`}
                  style={{ fontSize: '16px' }}
                />
              </div>
            </div>

            {/* Backend Status - Mobile Responsive */}
            <div className="mt-3 xs:mt-4 flex items-center space-x-2">
              {getStatusIcon(connectionStatus.backend.status)}
              <span className={`text-xs xs:text-sm ${getStatusColor(connectionStatus.backend.status)}`}>
                {connectionStatus.backend.message || 'Not tested'}
              </span>
            </div>
          </div>

          {/* Asterisk Configuration - Mobile Responsive */}
          <div className={`p-3 xs:p-4 sm:p-6 rounded-lg xs:rounded-xl border ${
            darkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'
          }`}>
            <div className="flex items-center mb-3 xs:mb-4">
              <Network className={`w-4 h-4 xs:w-5 xs:h-5 mr-2 ${
                darkMode ? 'text-green-400' : 'text-green-600'
              }`} />
              <h3 className={`text-base xs:text-lg font-semibold ${
                darkMode ? 'text-white' : 'text-gray-900'
              }`}>
                Asterisk Server
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 xs:gap-4">
              <div>
                <label className={`block text-xs xs:text-sm font-medium mb-1 xs:mb-2 ${
                  darkMode ? 'text-gray-300' : 'text-gray-700'
                }`}>
                  Asterisk Host/IP
                </label>
                <input
                  type="text"
                  value={config.asteriskHost}
                  onChange={(e) => handleInputChange('asteriskHost', e.target.value)}
                  placeholder="192.168.1.2"
                  className={`w-full px-3 xs:px-4 py-2 xs:py-3 rounded-lg border focus:ring-2 focus:ring-blue-500 focus:border-transparent mobile-input touch-target ${
                    darkMode
                      ? 'bg-gray-600 border-gray-500 text-white placeholder-gray-400'
                      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                  }`}
                  style={{ fontSize: '16px' }}
                />
              </div>
              <div>
                <label className={`block text-xs xs:text-sm font-medium mb-1 xs:mb-2 ${
                  darkMode ? 'text-gray-300' : 'text-gray-700'
                }`}>
                  SIP Port
                </label>
                <input
                  type="text"
                  value={config.asteriskPort}
                  onChange={(e) => handleInputChange('asteriskPort', e.target.value)}
                  placeholder="8088"
                  className={`w-full px-3 xs:px-4 py-2 xs:py-3 rounded-lg border focus:ring-2 focus:ring-blue-500 focus:border-transparent mobile-input touch-target ${
                    darkMode
                      ? 'bg-gray-600 border-gray-500 text-white placeholder-gray-400'
                      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                  }`}
                  style={{ fontSize: '16px' }}
                />
              </div>
              <div>
                <label className={`block text-xs xs:text-sm font-medium mb-1 xs:mb-2 ${
                  darkMode ? 'text-gray-300' : 'text-gray-700'
                }`}>
                  AMI Port
                </label>
                <input
                  type="text"
                  value={config.asteriskAMIPort}
                  onChange={(e) => handleInputChange('asteriskAMIPort', e.target.value)}
                  placeholder="5038"
                  className={`w-full px-3 xs:px-4 py-2 xs:py-3 rounded-lg border focus:ring-2 focus:ring-blue-500 focus:border-transparent mobile-input touch-target ${
                    darkMode
                      ? 'bg-gray-600 border-gray-500 text-white placeholder-gray-400'
                      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                  }`}
                  style={{ fontSize: '16px' }}
                />
              </div>
            </div>

            {/* Asterisk Status - Mobile Responsive */}
            <div className="mt-3 xs:mt-4 flex items-center space-x-2">
              {getStatusIcon(connectionStatus.asterisk.status)}
              <span className={`text-xs xs:text-sm ${getStatusColor(connectionStatus.asterisk.status)}`}>
                {connectionStatus.asterisk.message || 'Not tested'}
              </span>
            </div>
          </div>

          {/* Action Buttons - Mobile Responsive */}
          <div className="flex flex-col xs:flex-row gap-3 xs:gap-4">
            <button
              onClick={testConnections}
              disabled={testingConnection}
              className={`flex-1 flex items-center justify-center px-4 xs:px-6 py-3 xs:py-3 rounded-lg font-medium transition-colors touch-target tap-highlight ${
                testingConnection
                  ? 'bg-gray-400 cursor-not-allowed'
                  : darkMode
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
              style={{ minHeight: '44px' }}
            >
              {testingConnection ? (
                <Loader2 className="w-4 h-4 xs:w-5 xs:h-5 mr-1 xs:mr-2 animate-spin" />
              ) : (
                <Wifi className="w-4 h-4 xs:w-5 xs:h-5 mr-1 xs:mr-2" />
              )}
              <span className="text-sm xs:text-base">Test Connections</span>
            </button>

            <button
              onClick={saveConfiguration}
              disabled={isLoading}
              className={`flex-1 flex items-center justify-center px-4 xs:px-6 py-3 xs:py-3 rounded-lg font-medium transition-colors touch-target tap-highlight ${
                isLoading
                  ? 'bg-gray-400 cursor-not-allowed'
                  : connectionStatus.backend.status === 'error'
                    ? 'bg-orange-600 hover:bg-orange-700 text-white'
                    : darkMode
                      ? 'bg-green-600 hover:bg-green-700 text-white'
                      : 'bg-green-600 hover:bg-green-700 text-white'
              }`}
              style={{ minHeight: '44px' }}
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 xs:w-5 xs:h-5 mr-1 xs:mr-2 animate-spin" />
              ) : (
                <ArrowRight className="w-4 h-4 xs:w-5 xs:h-5 mr-1 xs:mr-2" />
              )}
              <span className="text-sm xs:text-base">
                {connectionStatus.backend.status === 'error' ? 'Save Anyway' : 'Save & Continue'}
              </span>
            </button>
          </div>

          {/* Dark Mode Toggle - Mobile Responsive */}
          <div className="flex justify-center pt-3 xs:pt-4">
            <button
              onClick={toggleDarkMode}
              className={`px-3 xs:px-4 py-2 rounded-lg text-xs xs:text-sm font-medium transition-colors touch-target tap-highlight ${
                darkMode
                  ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
              style={{ minHeight: '44px' }}
            >
              {darkMode ? '☀️ Light Mode' : '🌙 Dark Mode'}
            </button>
          </div>
        </div>
        </div>

        {/* Side Panel for Configuration Help - Mobile Responsive */}
        {(connectionStatus.asterisk.status === 'error' || connectionStatus.asterisk.status === 'warning' ||
          connectionStatus.backend.status === 'error') && (
          <div className="w-full lg:w-96 space-y-3 xs:space-y-4">

            {/* Connection Details Panel - Mobile Responsive */}
            {(connectionStatus.asterisk.details || connectionStatus.backend.status === 'error') && (
              <div className={`${
                darkMode ? 'bg-gray-800' : 'bg-white'
              } rounded-lg xs:rounded-xl shadow-lg p-4 xs:p-6`}>
                <h3 className={`text-lg font-semibold mb-4 ${
                  darkMode ? 'text-white' : 'text-gray-900'
                }`}>
                  Connection Details
                </h3>

                {/* Backend Details */}
                {connectionStatus.backend.status === 'error' && (
                  <div className="mb-4">
                    <h4 className="font-medium text-red-600 dark:text-red-400 mb-2">Backend Issues:</h4>
                    <p className="text-sm text-red-700 dark:text-red-300">
                      {connectionStatus.backend.message}
                    </p>
                  </div>
                )}

                {/* Asterisk Details */}
                {connectionStatus.asterisk.details && (
                  <div>
                    <h4 className="font-medium text-yellow-600 dark:text-yellow-400 mb-2">Asterisk Test Results:</h4>
                    <div className="space-y-2">
                      {/* Handle object structure instead of array */}
                      {connectionStatus.asterisk.details.ami && (
                        <div className={`flex items-center space-x-2 text-sm ${
                          darkMode ? 'text-gray-300' : 'text-gray-700'
                        }`}>
                          <span className={`w-2 h-2 rounded-full ${
                            connectionStatus.asterisk.details.ami.success ? 'bg-green-400' : 'bg-red-400'
                          }`}></span>
                          <span className="font-medium">AMI:</span>
                          <span className={connectionStatus.asterisk.details.ami.success ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                            {connectionStatus.asterisk.details.ami.success ? 'Connected' : 'Failed'}
                          </span>
                        </div>
                      )}
                      {connectionStatus.asterisk.details.http && (
                        <div className={`flex items-center space-x-2 text-sm ${
                          darkMode ? 'text-gray-300' : 'text-gray-700'
                        }`}>
                          <span className={`w-2 h-2 rounded-full ${
                            connectionStatus.asterisk.details.http.success ? 'bg-green-400' : 'bg-red-400'
                          }`}></span>
                          <span className="font-medium">HTTP:</span>
                          <span className={connectionStatus.asterisk.details.http.success ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                            {connectionStatus.asterisk.details.http.success ? 'Connected' : 'Failed'}
                          </span>
                        </div>
                      )}
                      {connectionStatus.asterisk.details.websocket && (
                        <div className={`flex items-center space-x-2 text-sm ${
                          darkMode ? 'text-gray-300' : 'text-gray-700'
                        }`}>
                          <span className={`w-2 h-2 rounded-full ${
                            connectionStatus.asterisk.details.websocket.success ? 'bg-green-400' : 'bg-red-400'
                          }`}></span>
                          <span className="font-medium">WebSocket:</span>
                          <span className={connectionStatus.asterisk.details.websocket.success ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                            {connectionStatus.asterisk.details.websocket.success ? 'Connected' : 'Failed'}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Asterisk Configuration Helper */}
            {(connectionStatus.asterisk.status === 'error' || connectionStatus.asterisk.status === 'warning') && (
              <div className={`${
                darkMode ? 'bg-gray-800' : 'bg-white'
              } rounded-xl shadow-lg p-6`}>
                <div className="flex items-center mb-4">
                  <AlertTriangle className={`w-5 h-5 mr-2 ${
                    connectionStatus.asterisk.status === 'error' ? 'text-red-500' : 'text-yellow-500'
                  }`} />
                  <h3 className={`text-lg font-semibold ${
                    darkMode ? 'text-white' : 'text-gray-900'
                  }`}>
                    Asterisk Setup Required
                  </h3>
                </div>

                <div className="space-y-4 text-sm">
                  <div>
                    <p className={`font-medium mb-2 ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                      1. Enable HTTP Interface
                    </p>
                    <div className={`p-3 rounded-lg font-mono text-xs ${
                      darkMode ? 'bg-gray-900 text-green-400' : 'bg-gray-100 text-gray-800'
                    }`}>
                      # /etc/asterisk/http.conf<br/>
                      [general]<br/>
                      enabled=yes<br/>
                      bindaddr=0.0.0.0<br/>
                      bindport=8088
                    </div>
                  </div>

                  <div>
                    <p className={`font-medium mb-2 ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                      2. Configure WebSocket Transport
                    </p>
                    <div className={`p-3 rounded-lg font-mono text-xs ${
                      darkMode ? 'bg-gray-900 text-green-400' : 'bg-gray-100 text-gray-800'
                    }`}>
                      # /etc/asterisk/pjsip.conf<br/>
                      [transport-ws]<br/>
                      type=transport<br/>
                      protocol=ws<br/>
                      bind=0.0.0.0:8088
                    </div>
                  </div>

                  <div>
                    <p className={`font-medium mb-2 ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                      3. Setup AMI Access
                    </p>
                    <div className={`p-3 rounded-lg font-mono text-xs ${
                      darkMode ? 'bg-gray-900 text-green-400' : 'bg-gray-100 text-gray-800'
                    }`}>
                      # /etc/asterisk/manager.conf<br/>
                      [general]<br/>
                      enabled = yes<br/>
                      port = 5038<br/>
                      bindaddr = 0.0.0.0<br/><br/>
                      [admin]<br/>
                      secret = amp111<br/>
                      read = all<br/>
                      write = all
                    </div>
                  </div>

                  <div>
                    <p className={`font-medium mb-2 ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                      4. Restart Services
                    </p>
                    <div className={`p-3 rounded-lg font-mono text-xs ${
                      darkMode ? 'bg-gray-900 text-green-400' : 'bg-gray-100 text-gray-800'
                    }`}>
                      sudo systemctl restart asterisk<br/>
                      sudo systemctl status asterisk
                    </div>
                  </div>

                  <div className={`p-3 rounded-lg border-l-4 ${
                    darkMode
                      ? 'border-blue-400 bg-blue-900/20 text-blue-200'
                      : 'border-blue-500 bg-blue-50 text-blue-800'
                  }`}>
                    <p className="text-xs">
                      <strong>💡 Pro Tip:</strong> You can save this configuration now and set up Asterisk later.
                      The VoIP application will work for user management, and calls will be enabled once Asterisk is configured.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default IPConfigurationPage;
