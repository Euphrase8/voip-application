import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  FiActivity as Activity,
  FiAlertTriangle as AlertTriangle,
  FiCheckCircle as CheckCircle,
  FiXCircle as XCircle,
  FiRefreshCw as Refresh,
  FiSettings as Settings,
  FiWifi as Wifi,
  FiServer as Server
} from 'react-icons/fi';
import { cn } from '../utils/ui';
import asteriskDiagnostics from '../utils/asteriskConnectionDiagnostics';
import networkDiagnostics from '../utils/networkDiagnostics';

const AsteriskDiagnostics = ({ darkMode = false, onClose }) => {
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [discoveryResults, setDiscoveryResults] = useState(null);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [activeTab, setActiveTab] = useState('diagnostics'); // 'diagnostics', 'discovery', 'config'

  const runDiagnostics = async () => {
    setIsRunning(true);
    setError(null);
    setResults(null);

    try {
      const diagnosticResults = await asteriskDiagnostics.runDiagnostics();
      setResults(diagnosticResults);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsRunning(false);
    }
  };

  const runDiscovery = async () => {
    setIsDiscovering(true);
    setError(null);
    setDiscoveryResults(null);

    try {
      const discoveryResults = await networkDiagnostics.discoverAsteriskServers();
      setDiscoveryResults(discoveryResults);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsDiscovering(false);
    }
  };

  const getStatusIcon = (status) => {
    switch (status?.toLowerCase()) {
      case 'healthy':
      case 'reachable':
      case 'valid':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'partial':
      case 'warning':
      case 'issues_found':
        return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      case 'failed':
      case 'unhealthy':
      case 'unreachable':
        return <XCircle className="w-5 h-5 text-red-500" />;
      default:
        return <Activity className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'healthy':
      case 'reachable':
      case 'valid':
        return 'text-green-600 dark:text-green-400';
      case 'partial':
      case 'warning':
      case 'issues_found':
        return 'text-yellow-600 dark:text-yellow-400';
      case 'failed':
      case 'unhealthy':
      case 'unreachable':
        return 'text-red-600 dark:text-red-400';
      default:
        return 'text-gray-600 dark:text-gray-400';
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className={cn(
          "w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-xl shadow-2xl",
          darkMode ? "bg-secondary-900 text-white" : "bg-white text-secondary-900"
        )}
      >
        {/* Header */}
        <div className={cn(
          "flex items-center justify-between p-6 border-b",
          darkMode ? "border-secondary-700" : "border-secondary-200"
        )}>
          <div className="flex items-center space-x-3">
            <Server className="w-6 h-6 text-primary-600" />
            <h2 className="text-2xl font-bold">Asterisk Connection Diagnostics</h2>
          </div>
          <button
            onClick={onClose}
            className={cn(
              "p-2 rounded-lg transition-colors",
              darkMode ? "hover:bg-secondary-800" : "hover:bg-secondary-100"
            )}
          >
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className={cn(
          "flex border-b",
          darkMode ? "border-secondary-700" : "border-secondary-200"
        )}>
          {[
            { id: 'diagnostics', label: 'Diagnostics', icon: Activity },
            { id: 'discovery', label: 'Network Discovery', icon: Wifi },
            { id: 'config', label: 'Configuration', icon: Settings }
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center space-x-2 px-6 py-3 font-medium transition-colors",
                  activeTab === tab.id
                    ? "text-primary-600 border-b-2 border-primary-600"
                    : darkMode
                      ? "text-secondary-400 hover:text-white"
                      : "text-secondary-600 hover:text-secondary-900"
                )}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
          {/* Diagnostics Tab */}
          {activeTab === 'diagnostics' && (
            <>
              {/* Run Diagnostics Button */}
              <div className="mb-6">
                <button
                  onClick={runDiagnostics}
                  disabled={isRunning}
                  className={cn(
                    "flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-colors",
                    isRunning
                      ? "bg-gray-400 cursor-not-allowed"
                      : "bg-primary-600 hover:bg-primary-700 text-white"
                  )}
                >
                  <Refresh className={cn("w-4 h-4", isRunning && "animate-spin")} />
                  <span>{isRunning ? 'Running Diagnostics...' : 'Run Diagnostics'}</span>
                </button>
              </div>
            </>
          )}

          {/* Network Discovery Tab */}
          {activeTab === 'discovery' && (
            <>
              <div className="mb-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold">Network Discovery</h3>
                    <p className="text-sm text-secondary-500">
                      Automatically discover Asterisk servers on your network
                    </p>
                  </div>
                  <button
                    onClick={runDiscovery}
                    disabled={isDiscovering}
                    className={cn(
                      "flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-colors",
                      isDiscovering
                        ? "bg-gray-400 cursor-not-allowed"
                        : "bg-green-600 hover:bg-green-700 text-white"
                    )}
                  >
                    <Wifi className={cn("w-4 h-4", isDiscovering && "animate-pulse")} />
                    <span>{isDiscovering ? 'Discovering...' : 'Discover Servers'}</span>
                  </button>
                </div>

                {/* SSH Connection Info */}
                <div className={cn(
                  "p-4 rounded-lg border mb-4",
                  "bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800"
                )}>
                  <h4 className="font-medium mb-2 text-blue-800 dark:text-blue-300">
                    Local Asterisk Service (this PC)
                  </h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center space-x-2">
                      <span className="font-medium">Check status:</span>
                      <code className="bg-blue-100 dark:bg-blue-900/40 px-2 py-1 rounded">
                        sudo systemctl status asterisk
                      </code>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="font-medium">Restart:</span>
                      <code className="bg-blue-100 dark:bg-blue-900/40 px-2 py-1 rounded">
                        sudo systemctl restart asterisk
                      </code>
                    </div>
                    <div className="text-blue-700 dark:text-blue-400">
                      <p>• Make sure ports are open: 5038 (AMI) and 8088 (HTTP/WebSocket)</p>
                      <p>• If using UFW: <code>sudo ufw allow 5038/tcp</code> and <code>sudo ufw allow 8088/tcp</code></p>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Configuration Tab */}
          {activeTab === 'config' && (
            <>
              <div className="mb-6">
                <h3 className="text-lg font-semibold mb-4">Auto-Generated Configuration</h3>
                <p className="text-sm text-secondary-500 mb-4">
                  Based on discovered servers, here's the recommended configuration:
                </p>

                {discoveryResults?.recommended && (
                  <ConfigurationDisplay
                    server={discoveryResults.recommended}
                    darkMode={darkMode}
                  />
                )}

                {!discoveryResults?.recommended && (
                  <div className={cn(
                    "p-4 rounded-lg border text-center",
                    darkMode ? "bg-secondary-800 border-secondary-700" : "bg-secondary-50 border-secondary-200"
                  )}>
                    <Wifi className="w-12 h-12 mx-auto mb-2 text-secondary-400" />
                    <p className="text-secondary-500">
                      Run network discovery first to generate configuration
                    </p>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Error Display */}
          {error && (
            <div className={cn(
              "mb-6 p-4 rounded-lg border",
              "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400"
            )}>
              <div className="flex items-center space-x-2">
                <XCircle className="w-5 h-5" />
                <span className="font-medium">Diagnostic Error</span>
              </div>
              <p className="mt-2 text-sm">{error}</p>
            </div>
          )}

          {/* Discovery Results */}
          {activeTab === 'discovery' && discoveryResults && (
            <div className="space-y-6">
              {/* Discovered Servers */}
              <div>
                <h3 className="text-lg font-semibold mb-4">Discovered Servers</h3>
                {discoveryResults.discovered.length > 0 ? (
                  <div className="space-y-3">
                    {discoveryResults.discovered.map((server, index) => (
                      <div
                        key={server.ip}
                        className={cn(
                          "p-4 rounded-lg border",
                          server === discoveryResults.recommended
                            ? "border-green-500 bg-green-50 dark:bg-green-900/20"
                            : darkMode ? "bg-secondary-800 border-secondary-700" : "bg-white border-secondary-200"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="font-medium flex items-center space-x-2">
                              <Server className="w-4 h-4" />
                              <span>{server.ip}</span>
                              {server === discoveryResults.recommended && (
                                <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                                  RECOMMENDED
                                </span>
                              )}
                            </h4>
                            <p className="text-sm text-secondary-500">
                              Score: {server.score} | Response: {server.responseTime}ms
                            </p>
                          </div>
                          <div className="text-right">
                            <div className="flex items-center space-x-2 text-sm">
                              {server.services.ami?.available && (
                                <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs">AMI</span>
                              )}
                              {server.services.http?.available && (
                                <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded text-xs">HTTP</span>
                              )}
                              {server.services.sip?.available && (
                                <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs">SIP</span>
                              )}
                              {server.services.ssh?.available && (
                                <span className="bg-orange-100 text-orange-800 px-2 py-1 rounded text-xs">SSH</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className={cn(
                    "p-4 rounded-lg border text-center",
                    darkMode ? "bg-secondary-800 border-secondary-700" : "bg-secondary-50 border-secondary-200"
                  )}>
                    <XCircle className="w-12 h-12 mx-auto mb-2 text-secondary-400" />
                    <p className="text-secondary-500">No Asterisk servers discovered</p>
                  </div>
                )}
              </div>

              {/* Network Information */}
              <div>
                <h3 className="text-lg font-semibold mb-4">Network Information</h3>
                <div className={cn(
                  "p-4 rounded-lg border",
                  darkMode ? "bg-secondary-800 border-secondary-700" : "bg-white border-secondary-200"
                )}>
                  <pre className="text-xs overflow-x-auto">
                    {JSON.stringify(discoveryResults.networkInfo, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          )}

          {/* Diagnostics Results Display */}
          {activeTab === 'diagnostics' && results && (
            <div className="space-y-6">
              {/* Overall Status */}
              <div className={cn(
                "p-4 rounded-lg border",
                darkMode ? "bg-secondary-800 border-secondary-700" : "bg-secondary-50 border-secondary-200"
              )}>
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Overall Status</h3>
                  <div className="flex items-center space-x-2">
                    {getStatusIcon(results.overall)}
                    <span className={cn("font-medium", getStatusColor(results.overall))}>
                      {results.overall}
                    </span>
                  </div>
                </div>
                <p className="text-sm text-secondary-500 mt-1">
                  Diagnostics completed at {new Date(results.timestamp).toLocaleString()}
                </p>
              </div>

              {/* Test Results */}
              <div>
                <h3 className="text-lg font-semibold mb-4">Test Results</h3>
                <div className="space-y-3">
                  {Object.entries(results.results).map(([testName, result]) => (
                    <div
                      key={testName}
                      className={cn(
                        "p-4 rounded-lg border",
                        darkMode ? "bg-secondary-800 border-secondary-700" : "bg-white border-secondary-200"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium">{testName}</h4>
                        <div className="flex items-center space-x-2">
                          {getStatusIcon(result.status)}
                          <span className={cn("text-sm font-medium", getStatusColor(result.status))}>
                            {result.status}
                          </span>
                        </div>
                      </div>
                      
                      {result.error && (
                        <p className="text-sm text-red-600 dark:text-red-400 mt-2">
                          Error: {result.error}
                        </p>
                      )}
                      
                      {result.details && (
                        <details className="mt-2">
                          <summary className="text-sm text-secondary-500 cursor-pointer hover:text-secondary-700">
                            View Details
                          </summary>
                          <pre className={cn(
                            "text-xs mt-2 p-2 rounded overflow-x-auto",
                            darkMode ? "bg-secondary-900 text-secondary-300" : "bg-secondary-100 text-secondary-700"
                          )}>
                            {JSON.stringify(result.details, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Recommendations */}
              {results.recommendations && results.recommendations.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold mb-4">Recommendations</h3>
                  <div className={cn(
                    "p-4 rounded-lg border",
                    "bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800"
                  )}>
                    <ul className="space-y-2">
                      {results.recommendations.map((recommendation, index) => (
                        <li key={index} className="flex items-start space-x-2">
                          <span className="text-blue-600 dark:text-blue-400 font-bold">•</span>
                          <span className="text-sm text-blue-800 dark:text-blue-300">
                            {recommendation}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* Quick Fixes */}
              <div>
                <h3 className="text-lg font-semibold mb-4">Quick Fixes</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className={cn(
                    "p-4 rounded-lg border",
                    darkMode ? "bg-secondary-800 border-secondary-700" : "bg-white border-secondary-200"
                  )}>
                    <h4 className="font-medium mb-2">Check Asterisk Service</h4>
                    <p className="text-sm text-secondary-600 dark:text-secondary-400 mb-3">
                      Verify Asterisk is running and accessible
                    </p>
                    <code className={cn(
                      "block text-xs p-2 rounded",
                      darkMode ? "bg-secondary-900 text-secondary-300" : "bg-secondary-100 text-secondary-700"
                    )}>
                      sudo systemctl status asterisk
                    </code>
                  </div>

                  <div className={cn(
                    "p-4 rounded-lg border",
                    darkMode ? "bg-secondary-800 border-secondary-700" : "bg-white border-secondary-200"
                  )}>
                    <h4 className="font-medium mb-2">Test AMI Connection</h4>
                    <p className="text-sm text-secondary-600 dark:text-secondary-400 mb-3">
                      Test AMI connectivity manually
                    </p>
                    <code className={cn(
                      "block text-xs p-2 rounded",
                      darkMode ? "bg-secondary-900 text-secondary-300" : "bg-secondary-100 text-secondary-700"
                    )}>
                      telnet {results.results['Configuration Check']?.details?.config?.sipServer || 'asterisk-host'} 5038
                    </code>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

// Configuration Display Component
const ConfigurationDisplay = ({ server, darkMode }) => {
  const config = networkDiagnostics.generateConfiguration(server);

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
  };

  if (!config) return null;

  return (
    <div className="space-y-6">
      {/* Backend Configuration */}
      <div>
        <h4 className="font-medium mb-3">Backend Environment (.env)</h4>
        <div className={cn(
          "p-4 rounded-lg border relative",
          darkMode ? "bg-secondary-800 border-secondary-700" : "bg-secondary-50 border-secondary-200"
        )}>
          <button
            onClick={() => copyToClipboard(Object.entries(config.backend).map(([k, v]) => `${k}=${v}`).join('\n'))}
            className="absolute top-2 right-2 p-2 rounded hover:bg-secondary-200 dark:hover:bg-secondary-700"
            title="Copy to clipboard"
          >
            📋
          </button>
          <pre className="text-xs overflow-x-auto">
            {Object.entries(config.backend).map(([key, value]) => (
              <div key={key}>{key}={value}</div>
            ))}
          </pre>
        </div>
      </div>

      {/* Frontend Configuration */}
      <div>
        <h4 className="font-medium mb-3">Frontend Environment (.env)</h4>
        <div className={cn(
          "p-4 rounded-lg border relative",
          darkMode ? "bg-secondary-800 border-secondary-700" : "bg-secondary-50 border-secondary-200"
        )}>
          <button
            onClick={() => copyToClipboard(Object.entries(config.frontend).map(([k, v]) => `${k}=${v}`).join('\n'))}
            className="absolute top-2 right-2 p-2 rounded hover:bg-secondary-200 dark:hover:bg-secondary-700"
            title="Copy to clipboard"
          >
            📋
          </button>
          <pre className="text-xs overflow-x-auto">
            {Object.entries(config.frontend).map(([key, value]) => (
              <div key={key}>{key}={value}</div>
            ))}
          </pre>
        </div>
      </div>

      {/* SSH Connection */}
      <div>
        <h4 className="font-medium mb-3">SSH Connection</h4>
        <div className={cn(
          "p-4 rounded-lg border",
          "bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800"
        )}>
          <div className="space-y-2 text-sm">
            <div className="flex items-center space-x-2">
              <span className="font-medium">Command:</span>
              <code className="bg-blue-100 dark:bg-blue-900/40 px-2 py-1 rounded">
                {config.ssh.command}
              </code>
              <button
                onClick={() => copyToClipboard(config.ssh.command)}
                className="p-1 rounded hover:bg-blue-200 dark:hover:bg-blue-800"
                title="Copy command"
              >
                📋
              </button>
            </div>
            <div className="flex items-center space-x-2">
              <span className="font-medium">Password:</span>
              <code className="bg-blue-100 dark:bg-blue-900/40 px-2 py-1 rounded">
                {config.ssh.password}
              </code>
            </div>
            <div className="text-blue-700 dark:text-blue-400">
              <p>• IP: {config.ssh.ip}</p>
              <p>• Port: {config.ssh.port}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Setup Instructions */}
      <div>
        <h4 className="font-medium mb-3">Quick Setup Instructions</h4>
        <div className={cn(
          "p-4 rounded-lg border",
          "bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800"
        )}>
          <ol className="text-sm space-y-2 text-green-800 dark:text-green-300">
            <li>1. Copy the backend environment variables to your backend/.env file</li>
            <li>2. Copy the frontend environment variables to your frontend/.env file</li>
            <li>3. Restart both backend and frontend services</li>
            <li>4. Test the connection using the diagnostics tab</li>
            <li>5. Use SSH command to access Asterisk server if needed</li>
          </ol>
        </div>
      </div>
    </div>
  );
};

export default AsteriskDiagnostics;
