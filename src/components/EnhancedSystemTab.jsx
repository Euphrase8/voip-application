import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  Server,
  Database,
  Wifi,
  HardDrive,
  Cpu,
  MemoryStick,
  Clock,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Minus,
  Shield,
  Monitor,
  Users,

  UserCheck,
  UserX,
  Zap
} from 'lucide-react';
import { cn } from '../utils/ui';
import systemHealthService from '../services/systemHealthService';
import MetricsChart from './MetricsChart';

const EnhancedSystemTab = ({ systemStatus, darkMode, systemHealth }) => {
  const [activeSection, setActiveSection] = useState('health');
  const [realTimeHealth, setRealTimeHealth] = useState({
    status: 'loading',
    timestamp: new Date().toISOString(),
    uptime: 'Loading...',
    response_time_ms: 0,
    services: {
      backend: { status: 'loading', message: 'Checking backend status...' }
    },
    system_metrics: {
      cpu: { usage_percent: 0 },
      memory: { usage_percent: 0 },
      disk: { usage_percent: 0 }
    },
    database_health: {
      status: 'loading',
      total_users: 0,
      active_calls: 0,
      call_logs_count: 0
    }
  });
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [metricsHistory, setMetricsHistory] = useState({
    cpu: [],
    memory: [],
    disk: []
  });
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [allUsers, setAllUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [realTimeMetrics, setRealTimeMetrics] = useState({
    call_success_rate: 0,
    avg_call_duration: '0:00',
    total_call_logs: 0,
    successful_calls: 0,
    ws_connections: 0,
    connected_extensions: []
  });
  const intervalRef = useRef(null);

  // Load users with status (optimized)
  const loadUsersWithStatus = async () => {
    try {
      setUsersLoading(true);
      const users = await systemHealthService.getUsersWithStatus();
      setAllUsers(users);
    } catch (error) {
      console.error('Failed to load users:', error);
      setAllUsers([]);
    } finally {
      setUsersLoading(false);
    }
  };

  // Load system health data (optimized)
  const loadSystemHealth = async () => {
    try {
      const health = await systemHealthService.getSystemHealth();
      setRealTimeHealth(health);
      setLastUpdate(new Date());

      // Update metrics history for graphs (optimized)
      if (health.system_metrics) {
        const timestamp = Date.now();
        setMetricsHistory(prev => ({
          cpu: [...prev.cpu.slice(-19), {
            timestamp,
            value: health.system_metrics.cpu?.usage_percent || 0
          }],
          memory: [...prev.memory.slice(-19), {
            timestamp,
            value: health.system_metrics.memory?.usage_percent || 0
          }],
          disk: [...prev.disk.slice(-19), {
            timestamp,
            value: health.system_metrics.disk?.usage_percent || 0
          }]
        }));
      }
    } catch (error) {
      console.error('Failed to load system health:', error);
      // Set a default offline state when health check fails
      setRealTimeHealth({
        status: 'offline',
        timestamp: new Date().toISOString(),
        uptime: 'Unavailable',
        response_time_ms: 0,
        services: {
          backend: { status: 'offline', message: error.message || 'Backend is not responding' }
        },
        system_metrics: {
          cpu: { usage_percent: 0 },
          memory: { usage_percent: 0 },
          disk: { usage_percent: 0 }
        },
        database_health: {
          status: 'offline',
          total_users: 0,
          active_calls: 0,
          call_logs_count: 0
        }
      });
      setLastUpdate(new Date());
    }
  };

  // Load real-time metrics
  const loadRealTimeMetrics = async () => {
    try {
      const metrics = await systemHealthService.getRealTimeMetrics();
      setRealTimeMetrics(metrics);
    } catch (error) {
      console.error('Failed to load real-time metrics:', error);
      // Keep existing values on error
    }
  };

  // Load all data in parallel (optimized)
  const loadAllData = async () => {
    // Start all requests immediately without waiting
    const healthPromise = loadSystemHealth();
    const usersPromise = loadUsersWithStatus();
    const metricsPromise = loadRealTimeMetrics();

    // Don't wait for all to complete - let them finish independently
    healthPromise.catch(() => {}); // Silent error handling
    usersPromise.catch(() => {}); // Silent error handling
    metricsPromise.catch(() => {}); // Silent error handling
  };

  useEffect(() => {
    // Load data immediately without blocking UI
    loadAllData();

    if (autoRefresh) {
      // Faster refresh interval for better responsiveness
      intervalRef.current = setInterval(loadAllData, 10000); // 10 seconds
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [autoRefresh]);

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'healthy':
      case 'online':
        return 'text-success-600';
      case 'warning':
        return 'text-warning-600';
      case 'unhealthy':
      case 'offline':
      case 'critical':
        return 'text-danger-600';
      default:
        return 'text-secondary-500';
    }
  };

  const getStatusIcon = (status) => {
    switch (status?.toLowerCase()) {
      case 'healthy':
      case 'online':
        return CheckCircle;
      case 'warning':
        return AlertTriangle;
      case 'unhealthy':
      case 'offline':
      case 'critical':
        return XCircle;
      default:
        return Minus;
    }
  };

  const getUsageColor = (percentage) => {
    if (percentage >= 90) return 'bg-danger-500';
    if (percentage >= 75) return 'bg-warning-500';
    if (percentage >= 50) return 'bg-primary-500';
    return 'bg-success-500';
  };

  const formatUptime = (uptime) => {
    if (!uptime) return 'Unknown';
    return uptime;
  };

  const calculateUptimePercentage = (uptime) => {
    if (!uptime || uptime === 'Unknown' || uptime === 'Unavailable') return 'N/A';

    return formatUptime(uptime);
  };

  const formatBytes = (bytes) => {
    if (!bytes) return '0 B';
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  };



  const sections = [
    { id: 'health', label: 'System Health', icon: Activity },
    { id: 'users', label: 'Users & Extensions', icon: Users },
    { id: 'metrics', label: 'Performance Metrics', icon: Monitor }
  ];

  // Remove blocking loading state - show content immediately with loading indicators

  return (
    <div className="space-y-4">
      {/* Responsive Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className={cn(
            'text-lg sm:text-xl font-bold',
            darkMode ? 'text-white' : 'text-secondary-900'
          )}>
            System Status
          </h2>
          <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-4 mt-1 gap-1 sm:gap-0">
            <p className={cn(
              'text-xs',
              darkMode ? 'text-secondary-400' : 'text-secondary-600'
            )}>
              Real-time monitoring
            </p>
            {lastUpdate && (
              <span className={cn(
                'text-xs',
                darkMode ? 'text-secondary-500' : 'text-secondary-500'
              )}>
                Updated: {lastUpdate.toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center space-x-2 flex-shrink-0">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={cn(
              'flex items-center space-x-1 px-2 py-1 rounded text-xs font-medium transition-colors',
              autoRefresh
                ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                : darkMode
                  ? 'bg-secondary-700 text-secondary-300 hover:bg-secondary-600'
                  : 'bg-secondary-100 text-secondary-700 hover:bg-secondary-200'
            )}
          >
            <Activity className="w-3 h-3" />
            <span className="hidden sm:inline">{autoRefresh ? 'Auto' : 'Manual'}</span>
          </button>
          <button
            onClick={loadAllData}
            className={cn(
              'flex items-center space-x-1 px-2 py-1 rounded text-xs font-medium transition-colors',
              darkMode
                ? 'bg-secondary-700 text-secondary-300 hover:bg-secondary-600'
                : 'bg-secondary-100 text-secondary-700 hover:bg-secondary-200'
            )}
          >
            <RefreshCw className="w-3 h-3" />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* Responsive Navigation */}
      <div className={cn(
        'border-b',
        darkMode ? 'border-secondary-700' : 'border-secondary-200'
      )}>
        <nav className="flex space-x-2 sm:space-x-6 overflow-x-auto">
          {sections.map((section) => {
            const Icon = section.icon;
            return (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={cn(
                  'flex items-center space-x-1 py-2 px-2 sm:px-1 border-b-2 font-medium text-xs transition-colors whitespace-nowrap flex-shrink-0',
                  activeSection === section.id
                    ? 'border-primary-500 text-primary-600'
                    : cn(
                        'border-transparent',
                        darkMode
                          ? 'text-secondary-400 hover:text-secondary-300'
                          : 'text-secondary-500 hover:text-secondary-700'
                      )
                )}
              >
                <Icon className="w-3 h-3" />
                <span className="hidden sm:inline">{section.label}</span>
                <span className="sm:hidden">
                  {section.id === 'health' ? 'Health' :
                   section.id === 'users' ? 'Users' : 'Metrics'}
                </span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Content Sections */}
      {activeSection === 'health' && (
        <div className="space-y-4 sm:space-y-6">
          {/* Dashboard Overview - Key Metrics at Top */}
          {realTimeHealth && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                'p-4 sm:p-6 rounded-xl border-2',
                darkMode
                  ? 'bg-gradient-to-br from-secondary-800 to-secondary-900 border-secondary-700'
                  : 'bg-gradient-to-br from-white to-secondary-50 border-secondary-200'
              )}
            >
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className={cn(
                    'text-lg sm:text-xl font-bold',
                    darkMode ? 'text-white' : 'text-secondary-900'
                  )}>
                    System Overview
                  </h3>
                  <p className={cn(
                    'text-sm mt-1',
                    darkMode ? 'text-secondary-400' : 'text-secondary-600'
                  )}>
                    Real-time system health and performance metrics
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  {React.createElement(getStatusIcon(realTimeHealth.status), {
                    className: cn('w-6 h-6', getStatusColor(realTimeHealth.status))
                  })}
                  <div className="text-right">
                    <div className={cn(
                      'text-sm font-semibold capitalize',
                      getStatusColor(realTimeHealth.status)
                    )}>
                      {realTimeHealth.status}
                    </div>
                    <div className={cn(
                      'text-xs',
                      darkMode ? 'text-secondary-400' : 'text-secondary-600'
                    )}>
                      Overall Status
                    </div>
                  </div>
                </div>
              </div>

              {/* Key Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6">
                <div className="text-center">
                  <div className="flex items-center justify-center mb-2">
                    <Clock className="w-5 h-5 text-primary-500 mr-2" />
                    <span className={cn(
                      'text-xs font-medium',
                      darkMode ? 'text-secondary-300' : 'text-secondary-700'
                    )}>
                      Uptime
                    </span>
                  </div>
                  <div className={cn(
                    'text-xl sm:text-2xl font-bold',
                    darkMode ? 'text-white' : 'text-secondary-900'
                  )}>
                    {formatUptime(realTimeHealth.uptime)}
                  </div>
                </div>

                <div className="text-center">
                  <div className="flex items-center justify-center mb-2">
                    <Zap className="w-5 h-5 text-success-500 mr-2" />
                    <span className={cn(
                      'text-xs font-medium',
                      darkMode ? 'text-secondary-300' : 'text-secondary-700'
                    )}>
                      Response
                    </span>
                  </div>
                  <div className={cn(
                    'text-xl sm:text-2xl font-bold',
                    darkMode ? 'text-white' : 'text-secondary-900'
                  )}>
                    {realTimeHealth.response_time_ms || 0}ms
                  </div>
                </div>

                <div className="text-center">
                  <div className="flex items-center justify-center mb-2">
                    <Users className="w-5 h-5 text-primary-500 mr-2" />
                    <span className={cn(
                      'text-xs font-medium',
                      darkMode ? 'text-secondary-300' : 'text-secondary-700'
                    )}>
                      Active Users
                    </span>
                  </div>
                  <div className={cn(
                    'text-xl sm:text-2xl font-bold',
                    darkMode ? 'text-white' : 'text-secondary-900'
                  )}>
                    {realTimeHealth.database_health?.total_users || 0}
                  </div>
                </div>

                <div className="text-center">
                  <div className="flex items-center justify-center mb-2">
                    <Activity className="w-5 h-5 text-success-500 mr-2" />
                    <span className={cn(
                      'text-xs font-medium',
                      darkMode ? 'text-secondary-300' : 'text-secondary-700'
                    )}>
                      Active Calls
                    </span>
                  </div>
                  <div className={cn(
                    'text-xl sm:text-2xl font-bold',
                    darkMode ? 'text-white' : 'text-secondary-900'
                  )}>
                    {realTimeHealth.database_health?.active_calls || 0}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Services Status Dashboard */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
            {/* Services Health */}
            {realTimeHealth?.services && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className={cn(
                  'lg:col-span-1 p-4 sm:p-5 rounded-xl border',
                  darkMode
                    ? 'bg-secondary-800 border-secondary-700'
                    : 'bg-white border-secondary-200'
                )}
              >
                <div className="flex items-center mb-4">
                  <Server className="w-5 h-5 text-primary-500 mr-2" />
                  <h3 className={cn(
                    'text-base font-semibold',
                    darkMode ? 'text-white' : 'text-secondary-900'
                  )}>
                    Services Status
                  </h3>
                </div>

                <div className="space-y-3">
                  {Object.entries(realTimeHealth.services).map(([serviceName, service]) => {
                    const ServiceIcon = serviceName === 'asterisk' ? Server :
                                      serviceName === 'database' ? Database :
                                      serviceName === 'websocket' ? Wifi :
                                      serviceName === 'backend' ? Monitor : Shield;

                    return (
                      <div
                        key={serviceName}
                        className={cn(
                          'flex items-center justify-between p-3 rounded-lg border',
                          darkMode
                            ? 'bg-secondary-700 border-secondary-600'
                            : 'bg-secondary-50 border-secondary-200'
                        )}
                      >
                        <div className="flex items-center space-x-3">
                          <ServiceIcon className="w-4 h-4 text-primary-500" />
                          <div>
                            <div className={cn(
                              'text-sm font-medium capitalize',
                              darkMode ? 'text-white' : 'text-secondary-900'
                            )}>
                              {serviceName}
                            </div>
                            <div className={cn(
                              'text-xs',
                              darkMode ? 'text-secondary-400' : 'text-secondary-600'
                            )}>
                              {service.message || 'Service running'}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          {React.createElement(getStatusIcon(service.status), {
                            className: cn('w-4 h-4', getStatusColor(service.status))
                          })}
                          <span className={cn(
                            'text-xs font-medium capitalize',
                            getStatusColor(service.status)
                          )}>
                            {service.status}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {/* System Metrics Dashboard */}
            {realTimeHealth?.system_metrics && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className={cn(
                  'lg:col-span-2 p-4 sm:p-5 rounded-xl border',
                  darkMode
                    ? 'bg-secondary-800 border-secondary-700'
                    : 'bg-white border-secondary-200'
                )}
              >
                <div className="flex items-center mb-4">
                  <Monitor className="w-5 h-5 text-primary-500 mr-2" />
                  <h3 className={cn(
                    'text-base font-semibold',
                    darkMode ? 'text-white' : 'text-secondary-900'
                  )}>
                    System Performance
                  </h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* CPU Usage */}
                  <div className={cn(
                    'p-4 rounded-lg border',
                    darkMode
                      ? 'bg-secondary-700 border-secondary-600'
                      : 'bg-secondary-50 border-secondary-200'
                  )}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center space-x-2">
                        <Cpu className="w-4 h-4 text-primary-500" />
                        <span className={cn(
                          'text-sm font-medium',
                          darkMode ? 'text-white' : 'text-secondary-900'
                        )}>
                          CPU Usage
                        </span>
                      </div>
                      <span className={cn(
                        'text-lg font-bold',
                        darkMode ? 'text-white' : 'text-secondary-900'
                      )}>
                        {Math.round(realTimeHealth.system_metrics.cpu?.usage_percent || 0)}%
                      </span>
                    </div>

                    <div className={cn(
                      'w-full h-3 rounded-full mb-2',
                      darkMode ? 'bg-secondary-600' : 'bg-secondary-200'
                    )}>
                      <div
                        className={cn(
                          'h-3 rounded-full transition-all duration-500',
                          getUsageColor(realTimeHealth.system_metrics.cpu?.usage_percent || 0)
                        )}
                        style={{
                          width: `${Math.min(realTimeHealth.system_metrics.cpu?.usage_percent || 0, 100)}%`
                        }}
                      />
                    </div>

                    {realTimeHealth.system_metrics.cpu?.cores && (
                      <div className={cn(
                        'text-xs',
                        darkMode ? 'text-secondary-400' : 'text-secondary-600'
                      )}>
                        {realTimeHealth.system_metrics.cpu.cores} cores available
                      </div>
                    )}
                  </div>

                  {/* Memory Usage */}
                  <div className={cn(
                    'p-4 rounded-lg border',
                    darkMode
                      ? 'bg-secondary-700 border-secondary-600'
                      : 'bg-secondary-50 border-secondary-200'
                  )}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center space-x-2">
                        <MemoryStick className="w-4 h-4 text-primary-500" />
                        <span className={cn(
                          'text-sm font-medium',
                          darkMode ? 'text-white' : 'text-secondary-900'
                        )}>
                          Memory
                        </span>
                      </div>
                      <span className={cn(
                        'text-lg font-bold',
                        darkMode ? 'text-white' : 'text-secondary-900'
                      )}>
                        {Math.round(realTimeHealth.system_metrics.memory?.usage_percent || 0)}%
                      </span>
                    </div>

                    <div className={cn(
                      'w-full h-3 rounded-full mb-2',
                      darkMode ? 'bg-secondary-600' : 'bg-secondary-200'
                    )}>
                      <div
                        className={cn(
                          'h-3 rounded-full transition-all duration-500',
                          getUsageColor(realTimeHealth.system_metrics.memory?.usage_percent || 0)
                        )}
                        style={{
                          width: `${Math.min(realTimeHealth.system_metrics.memory?.usage_percent || 0, 100)}%`
                        }}
                      />
                    </div>

                    <div className={cn(
                      'text-xs',
                      darkMode ? 'text-secondary-400' : 'text-secondary-600'
                    )}>
                      {formatBytes(realTimeHealth.system_metrics.memory?.used)} / {formatBytes(realTimeHealth.system_metrics.memory?.total)}
                    </div>
                  </div>

                  {/* Disk Usage */}
                  <div className={cn(
                    'p-4 rounded-lg border',
                    darkMode
                      ? 'bg-secondary-700 border-secondary-600'
                      : 'bg-secondary-50 border-secondary-200'
                  )}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center space-x-2">
                        <HardDrive className="w-4 h-4 text-primary-500" />
                        <span className={cn(
                          'text-sm font-medium',
                          darkMode ? 'text-white' : 'text-secondary-900'
                        )}>
                          Storage
                        </span>
                      </div>
                      <span className={cn(
                        'text-lg font-bold',
                        darkMode ? 'text-white' : 'text-secondary-900'
                      )}>
                        {Math.round(realTimeHealth.system_metrics.disk?.usage_percent || 0)}%
                      </span>
                    </div>

                    <div className={cn(
                      'w-full h-3 rounded-full mb-2',
                      darkMode ? 'bg-secondary-600' : 'bg-secondary-200'
                    )}>
                      <div
                        className={cn(
                          'h-3 rounded-full transition-all duration-500',
                          getUsageColor(realTimeHealth.system_metrics.disk?.usage_percent || 0)
                        )}
                        style={{
                          width: `${Math.min(realTimeHealth.system_metrics.disk?.usage_percent || 0, 100)}%`
                        }}
                      />
                    </div>

                    <div className={cn(
                      'text-xs',
                      darkMode ? 'text-secondary-400' : 'text-secondary-600'
                    )}>
                      {formatBytes(realTimeHealth.system_metrics.disk?.used)} / {formatBytes(realTimeHealth.system_metrics.disk?.total)}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </div>

          {/* Database Health Dashboard */}
          {realTimeHealth?.database_health && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className={cn(
                'p-4 sm:p-5 rounded-xl border',
                darkMode
                  ? 'bg-secondary-800 border-secondary-700'
                  : 'bg-white border-secondary-200'
              )}
            >
              <div className="flex items-center mb-4">
                <Database className="w-5 h-5 text-primary-500 mr-2" />
                <h3 className={cn(
                  'text-base font-semibold',
                  darkMode ? 'text-white' : 'text-secondary-900'
                )}>
                  Database Health
                </h3>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="text-center p-3 rounded-lg border border-opacity-50">
                  <div className="flex items-center justify-center mb-2">
                    <Database className="w-5 h-5 text-primary-500 mr-2" />
                    <span className={cn(
                      'text-sm font-medium',
                      darkMode ? 'text-white' : 'text-secondary-900'
                    )}>
                      Total Users
                    </span>
                  </div>
                  <div className={cn(
                    'text-2xl font-bold',
                    darkMode ? 'text-white' : 'text-secondary-900'
                  )}>
                    {realTimeHealth.database_health.total_users || 0}
                  </div>
                  <div className={cn(
                    'text-xs mt-1',
                    darkMode ? 'text-secondary-400' : 'text-secondary-600'
                  )}>
                    Registered
                  </div>
                </div>

                <div className="text-center p-3 rounded-lg border border-opacity-50">
                  <div className="flex items-center justify-center mb-2">
                    <Activity className="w-5 h-5 text-success-500 mr-2" />
                    <span className={cn(
                      'text-sm font-medium',
                      darkMode ? 'text-white' : 'text-secondary-900'
                    )}>
                      Active Calls
                    </span>
                  </div>
                  <div className={cn(
                    'text-2xl font-bold',
                    darkMode ? 'text-white' : 'text-secondary-900'
                  )}>
                    {realTimeHealth.database_health.active_calls || 0}
                  </div>
                  <div className={cn(
                    'text-xs mt-1',
                    darkMode ? 'text-secondary-400' : 'text-secondary-600'
                  )}>
                    In Progress
                  </div>
                </div>

                <div className="text-center p-3 rounded-lg border border-opacity-50">
                  <div className="flex items-center justify-center mb-2">
                    <Clock className="w-5 h-5 text-warning-500 mr-2" />
                    <span className={cn(
                      'text-sm font-medium',
                      darkMode ? 'text-white' : 'text-secondary-900'
                    )}>
                      Call Logs
                    </span>
                  </div>
                  <div className={cn(
                    'text-2xl font-bold',
                    darkMode ? 'text-white' : 'text-secondary-900'
                  )}>
                    {realTimeHealth.database_health.call_logs_count || 0}
                  </div>
                  <div className={cn(
                    'text-xs mt-1',
                    darkMode ? 'text-secondary-400' : 'text-secondary-600'
                  )}>
                    Total Records
                  </div>
                </div>

                <div className="text-center p-3 rounded-lg border border-opacity-50">
                  <div className="flex items-center justify-center mb-2">
                    <HardDrive className="w-5 h-5 text-primary-500 mr-2" />
                    <span className={cn(
                      'text-sm font-medium',
                      darkMode ? 'text-white' : 'text-secondary-900'
                    )}>
                      DB Size
                    </span>
                  </div>
                  <div className={cn(
                    'text-2xl font-bold',
                    darkMode ? 'text-white' : 'text-secondary-900'
                  )}>
                    {realTimeHealth.database_health.database_size || 'N/A'}
                  </div>
                  <div className={cn(
                    'text-xs mt-1',
                    darkMode ? 'text-secondary-400' : 'text-secondary-600'
                  )}>
                    Storage Used
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      )}

      {activeSection === 'users' && systemStatus && (
        <div className="space-y-3 sm:space-y-4">
          {/* Responsive Users Overview */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
            {/* Summary Stats */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                'p-3 sm:p-4 rounded-lg border',
                darkMode
                  ? 'bg-secondary-800 border-secondary-700'
                  : 'bg-white border-secondary-200'
              )}
            >
              <h3 className={cn(
                'text-sm font-semibold mb-3',
                darkMode ? 'text-white' : 'text-secondary-900'
              )}>
                User Statistics
              </h3>

              <div className="grid grid-cols-2 gap-3">
                <div className="text-center">
                  <div className={cn(
                    'text-base sm:text-lg font-bold',
                    darkMode ? 'text-white' : 'text-secondary-900'
                  )}>
                    {allUsers.length}
                  </div>
                  <div className={cn(
                    'text-xs',
                    darkMode ? 'text-secondary-400' : 'text-secondary-600'
                  )}>
                    Total Users
                  </div>
                </div>

                <div className="text-center">
                  <div className="text-base sm:text-lg font-bold text-success-600">
                    {allUsers.filter(user => user.actual_status === 'online').length}
                  </div>
                  <div className={cn(
                    'text-xs',
                    darkMode ? 'text-secondary-400' : 'text-secondary-600'
                  )}>
                    Online
                  </div>
                </div>

                <div className="text-center">
                  <div className="text-base sm:text-lg font-bold text-warning-600">
                    {allUsers.filter(user => user.actual_status === 'away').length}
                  </div>
                  <div className={cn(
                    'text-xs',
                    darkMode ? 'text-secondary-400' : 'text-secondary-600'
                  )}>
                    Away
                  </div>
                </div>

                <div className="text-center">
                  <div className="text-base sm:text-lg font-bold text-orange-600">
                    {allUsers.filter(user => user.actual_status === 'busy').length}
                  </div>
                  <div className={cn(
                    'text-xs',
                    darkMode ? 'text-secondary-400' : 'text-secondary-600'
                  )}>
                    Busy
                  </div>
                </div>

                <div className="text-center">
                  <div className="text-base sm:text-lg font-bold text-secondary-600">
                    {allUsers.filter(user => user.actual_status === 'offline').length}
                  </div>
                  <div className={cn(
                    'text-xs',
                    darkMode ? 'text-secondary-400' : 'text-secondary-600'
                  )}>
                    Offline
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Quick Status Overview */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className={cn(
                'p-3 sm:p-4 rounded-lg border',
                darkMode
                  ? 'bg-secondary-800 border-secondary-700'
                  : 'bg-white border-secondary-200'
              )}
            >
              <h3 className={cn(
                'text-sm font-semibold mb-3',
                darkMode ? 'text-white' : 'text-secondary-900'
              )}>
                System Activity
              </h3>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className={cn(
                    'text-xs',
                    darkMode ? 'text-secondary-400' : 'text-secondary-600'
                  )}>
                    WebSocket Connections
                  </span>
                  <span className={cn(
                    'text-xs font-bold',
                    darkMode ? 'text-white' : 'text-secondary-900'
                  )}>
                    {realTimeMetrics.ws_connections || 0}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className={cn(
                    'text-xs',
                    darkMode ? 'text-secondary-400' : 'text-secondary-600'
                  )}>
                    Registered Extensions
                  </span>
                  <span className={cn(
                    'text-xs font-bold',
                    darkMode ? 'text-white' : 'text-secondary-900'
                  )}>
                    {realTimeMetrics.connected_extensions?.length || 0}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className={cn(
                    'text-xs',
                    darkMode ? 'text-secondary-400' : 'text-secondary-600'
                  )}>
                    Call Success Rate
                  </span>
                  <span className="text-xs font-bold text-success-600">
                    {realTimeMetrics.call_success_rate ? `${realTimeMetrics.call_success_rate.toFixed(1)}%` : 'N/A'}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className={cn(
                    'text-xs',
                    darkMode ? 'text-secondary-400' : 'text-secondary-600'
                  )}>
                    Avg Call Duration
                  </span>
                  <span className={cn(
                    'text-xs font-bold',
                    darkMode ? 'text-white' : 'text-secondary-900'
                  )}>
                    {realTimeMetrics.avg_call_duration || '0:00'}
                  </span>
                </div>
              </div>
            </motion.div>
          </div>

          {/* All Users with Extensions and Status */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className={cn(
              'p-4 sm:p-5 rounded-xl border',
              darkMode
                ? 'bg-secondary-800 border-secondary-700'
                : 'bg-white border-secondary-200'
            )}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <Users className="w-5 h-5 text-primary-500" />
                <h4 className={cn(
                  'text-base font-semibold',
                  darkMode ? 'text-white' : 'text-secondary-900'
                )}>
                  Users & Extensions
                </h4>
              </div>
              <div className="flex items-center space-x-3">
                {usersLoading && (
                  <RefreshCw className="w-4 h-4 animate-spin text-primary-500" />
                )}
                <span className={cn(
                  'text-sm',
                  darkMode ? 'text-secondary-400' : 'text-secondary-600'
                )}>
                  {allUsers.length} total users
                </span>
              </div>
            </div>

            {allUsers.length === 0 ? (
              <div className={cn(
                'text-center py-8',
                darkMode ? 'text-secondary-400' : 'text-secondary-600'
              )}>
                {usersLoading ? 'Loading users...' : 'No users found'}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {allUsers.map((user) => {
                    const StatusIcon = user.actual_status === 'online' ? UserCheck :
                                     user.actual_status === 'away' ? Clock :
                                     user.actual_status === 'busy' ? Minus :
                                     UserX;

                    const getStatusColor = (status) => {
                      switch (status) {
                        case 'online': return 'text-success-500';
                        case 'away': return 'text-warning-500';
                        case 'busy': return 'text-orange-500';
                        default: return 'text-secondary-400';
                      }
                    };

                    const getStatusBgColor = (status) => {
                      switch (status) {
                        case 'online': return 'bg-success-500';
                        case 'away': return 'bg-warning-500';
                        case 'busy': return 'bg-orange-500';
                        default: return 'bg-secondary-400';
                      }
                    };

                    const getLastSeenText = (lastSeen) => {
                      if (!lastSeen) return 'Never';
                      const now = new Date();
                      const lastSeenDate = new Date(lastSeen);
                      const diffMs = now - lastSeenDate;
                      const diffMins = Math.floor(diffMs / (1000 * 60));

                      if (diffMins < 1) return 'Just now';
                      if (diffMins < 60) return `${diffMins}m ago`;
                      const diffHours = Math.floor(diffMins / 60);
                      if (diffHours < 24) return `${diffHours}h ago`;
                      const diffDays = Math.floor(diffHours / 24);
                      return `${diffDays}d ago`;
                    };

                    return (
                      <div
                        key={user.id}
                        className={cn(
                          'p-3 rounded-lg border transition-all duration-200 hover:shadow-md relative',
                          darkMode
                            ? 'bg-secondary-700 border-secondary-600 hover:bg-secondary-600'
                            : 'bg-secondary-50 border-secondary-200 hover:bg-secondary-100'
                        )}
                      >
                        {/* Status indicator in top-right corner */}
                        <div className={cn(
                          'absolute top-2 right-2 w-3 h-3 rounded-full border-2',
                          getStatusBgColor(user.actual_status),
                          darkMode ? 'border-secondary-700' : 'border-secondary-50'
                        )} />

                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center space-x-2">
                            <StatusIcon className={cn(
                              'w-4 h-4 flex-shrink-0',
                              getStatusColor(user.actual_status)
                            )} />
                            <div className={cn(
                              'w-2 h-2 rounded-full flex-shrink-0',
                              getStatusBgColor(user.actual_status)
                            )} />
                          </div>
                          {user.role === 'admin' && (
                            <div className={cn(
                              'px-2 py-1 rounded text-xs font-medium',
                              darkMode
                                ? 'bg-primary-900/30 text-primary-400'
                                : 'bg-primary-100 text-primary-700'
                            )}>
                              Admin
                            </div>
                          )}
                        </div>

                        <div className="space-y-1">
                          <div className={cn(
                            'font-medium text-sm truncate',
                            darkMode ? 'text-white' : 'text-secondary-900'
                          )}>
                            {user.username}
                          </div>
                          <div className={cn(
                            'text-xs',
                            darkMode ? 'text-secondary-400' : 'text-secondary-600'
                          )}>
                            Extension: {user.extension}
                          </div>
                          <div className={cn(
                            'text-xs capitalize font-medium',
                            getStatusColor(user.actual_status)
                          )}>
                            {user.actual_status}
                          </div>
                          <div className={cn(
                            'text-xs',
                            darkMode ? 'text-secondary-500' : 'text-secondary-500'
                          )}>
                            Last seen: {getLastSeenText(user.last_seen)}
                          </div>
                        </div>

                        {/* Connection status and additional info */}
                        <div className="mt-2 pt-2 border-t border-opacity-50 border-secondary-300 dark:border-secondary-600">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              {user.ws_connected ? (
                                <div className={cn(
                                  'flex items-center space-x-1 text-xs',
                                  darkMode ? 'text-success-400' : 'text-success-600'
                                )}>
                                  <Wifi className="w-3 h-3" />
                                  <span>Connected</span>
                                  {user.client_count > 1 && (
                                    <span className="text-xs opacity-75">({user.client_count})</span>
                                  )}
                                </div>
                              ) : (
                                <div className={cn(
                                  'flex items-center space-x-1 text-xs',
                                  darkMode ? 'text-secondary-500' : 'text-secondary-500'
                                )}>
                                  <XCircle className="w-3 h-3" />
                                  <span>Disconnected</span>
                                </div>
                              )}
                            </div>

                            {/* Status badge */}
                            <div className={cn(
                              'px-2 py-1 rounded-full text-xs font-medium',
                              user.actual_status === 'online'
                                ? 'bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-400'
                                : user.actual_status === 'away'
                                ? 'bg-warning-100 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400'
                                : user.actual_status === 'busy'
                                ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                                : 'bg-secondary-100 text-secondary-700 dark:bg-secondary-800 dark:text-secondary-400'
                            )}>
                              {user.actual_status}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {allUsers.length > 20 && (
                  <div className={cn(
                    'text-center text-sm mt-4 pt-4 border-t',
                    darkMode ? 'text-secondary-400 border-secondary-600' : 'text-secondary-600 border-secondary-200'
                  )}>
                    Showing all {allUsers.length} users
                  </div>
                )}
              </>
            )}
          </motion.div>
        </div>
      )}

      {activeSection === 'metrics' && (
        <div className="space-y-3 sm:space-y-4">
          {/* Responsive Performance Charts */}
          {metricsHistory.cpu.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                'p-3 sm:p-4 rounded-lg border',
                darkMode
                  ? 'bg-secondary-800 border-secondary-700'
                  : 'bg-white border-secondary-200'
              )}
            >
              <h3 className={cn(
                'text-sm font-semibold mb-3',
                darkMode ? 'text-white' : 'text-secondary-900'
              )}>
                Performance Graphs
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                <MetricsChart
                  data={metricsHistory.cpu}
                  title="CPU Usage"
                  darkMode={darkMode}
                  unit="%"
                  height={80}
                />
                <MetricsChart
                  data={metricsHistory.memory}
                  title="Memory Usage"
                  darkMode={darkMode}
                  unit="%"
                  height={80}
                />
                <MetricsChart
                  data={metricsHistory.disk}
                  title="Disk Usage"
                  darkMode={darkMode}
                  unit="%"
                  height={80}
                />
              </div>
            </motion.div>
          )}

          {/* Responsive Performance Summary */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className={cn(
              'p-3 sm:p-4 rounded-lg border',
              darkMode
                ? 'bg-secondary-800 border-secondary-700'
                : 'bg-white border-secondary-200'
            )}
          >
            <h3 className={cn(
              'text-sm font-semibold mb-3',
              darkMode ? 'text-white' : 'text-secondary-900'
            )}>
              Performance Summary
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="text-center">
                <div className="flex items-center justify-center space-x-1 mb-1">
                  <CheckCircle className="w-3 h-3 text-success-600" />
                  <span className={cn(
                    'text-xs font-medium',
                    darkMode ? 'text-white' : 'text-secondary-900'
                  )}>
                    Success Rate
                  </span>
                </div>
                <div className={cn(
                  'text-base sm:text-lg font-bold',
                  darkMode ? 'text-white' : 'text-secondary-900'
                )}>
                  {realTimeMetrics.call_success_rate ? `${realTimeMetrics.call_success_rate.toFixed(1)}%` : 'N/A'}
                </div>
                <div className="text-xs text-success-600">
                  {realTimeMetrics.total_call_logs > 0 ? 'Real data' : 'No calls yet'}
                </div>
              </div>

              <div className="text-center">
                <div className="flex items-center justify-center space-x-1 mb-1">
                  <Clock className="w-3 h-3 text-primary-600" />
                  <span className={cn(
                    'text-xs font-medium',
                    darkMode ? 'text-white' : 'text-secondary-900'
                  )}>
                    Avg Duration
                  </span>
                </div>
                <div className={cn(
                  'text-base sm:text-lg font-bold',
                  darkMode ? 'text-white' : 'text-secondary-900'
                )}>
                  {realTimeMetrics.avg_call_duration || '0:00'}
                </div>
                <div className="text-xs text-success-600">
                  {realTimeMetrics.successful_calls > 0 ? `${realTimeMetrics.successful_calls} calls` : 'No completed calls'}
                </div>
              </div>

              <div className="text-center">
                <div className="flex items-center justify-center space-x-1 mb-1">
                  <Shield className="w-3 h-3 text-success-600" />
                  <span className={cn(
                    'text-xs font-medium',
                    darkMode ? 'text-white' : 'text-secondary-900'
                  )}>
                    Uptime
                  </span>
                </div>
                <div className={cn(
                  'text-base sm:text-lg font-bold',
                  darkMode ? 'text-white' : 'text-secondary-900'
                )}>
                  {calculateUptimePercentage(realTimeHealth.uptime)}
                </div>
                <div className="text-xs text-success-600">
                  {realTimeHealth.status === 'healthy' ? 'Stable' : realTimeHealth.status}
                </div>
              </div>

              <div className="text-center">
                <div className="flex items-center justify-center space-x-1 mb-1">
                  <Zap className="w-3 h-3 text-success-600" />
                  <span className={cn(
                    'text-xs font-medium',
                    darkMode ? 'text-white' : 'text-secondary-900'
                  )}>
                    Response
                  </span>
                </div>
                <div className={cn(
                  'text-base sm:text-lg font-bold',
                  darkMode ? 'text-white' : 'text-secondary-900'
                )}>
                  {realTimeHealth?.response_time_ms || 0}ms
                </div>
                <div className={cn(
                  'text-xs',
                  realTimeHealth?.response_time_ms < 100 ? 'text-success-600' :
                  realTimeHealth?.response_time_ms < 500 ? 'text-warning-600' : 'text-danger-600'
                )}>
                  {realTimeHealth?.response_time_ms < 100 ? 'Excellent' :
                   realTimeHealth?.response_time_ms < 500 ? 'Good' : 'Slow'}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default EnhancedSystemTab;
