// Understanding Log Examples
// This file provides examples and utilities for testing understanding logs

import understandingLogger from './understandingLogger';
import notificationService from './notificationService';

// Example usage functions for testing understanding logs
export const generateExampleUnderstandingLogs = () => {
  // User interaction examples
  understandingLogger.logUserInteraction('call_initiated', {
    targetExtension: '1001',
    method: 'click',
    interface: 'contacts_list',
    duration: 0.5
  });

  understandingLogger.logUserInteraction('navigation', {
    from: 'dashboard',
    to: 'call_logs',
    method: 'menu_click',
    timestamp: new Date().toISOString()
  });

  understandingLogger.logUserInteraction('search_performed', {
    query: 'john doe',
    results_count: 3,
    selected_result: 1,
    search_time: 1.2
  });

  // AI response examples
  understandingLogger.logAIResponse('call_suggestion', 0.85, {
    suggested_contact: 'John Doe',
    reason: 'frequent_contact',
    context: 'user_searched_similar_name'
  });

  understandingLogger.logAIResponse('auto_complete', 0.92, {
    input: 'john',
    suggestion: 'John Doe (ext: 1001)',
    accepted: true
  });

  // Comprehension examples
  understandingLogger.logComprehension('high', 'user_intent_recognized', {
    intent: 'make_call',
    confidence: 0.95,
    context_clues: ['clicked_call_button', 'selected_contact']
  });

  understandingLogger.logComprehension('medium', 'pattern_detected', {
    pattern: 'frequent_caller',
    evidence: ['3_calls_today', 'same_contact'],
    reliability: 0.7
  });

  understandingLogger.logComprehension('low', 'ambiguous_action', {
    action: 'double_click',
    possible_intents: ['call', 'edit_contact', 'view_details'],
    chosen_interpretation: 'call'
  });

  // Error recovery examples
  understandingLogger.logErrorRecovery(
    'call_failed_busy',
    'suggest_callback_later',
    true,
    {
      original_error: 'BUSY',
      recovery_action: 'schedule_callback',
      user_accepted: true,
      callback_time: '15_minutes'
    }
  );

  understandingLogger.logErrorRecovery(
    'network_timeout',
    'retry_with_fallback',
    false,
    {
      original_error: 'TIMEOUT',
      retry_attempts: 3,
      fallback_method: 'websocket_to_polling',
      success: false
    }
  );

  // Learning examples
  understandingLogger.logLearning(
    'user_prefers_video_calls_afternoon',
    0.78,
    'pattern_recognition',
    {
      evidence: ['5_video_calls_after_2pm', '0_video_calls_morning'],
      sample_size: 20,
      time_period: '2_weeks'
    }
  );

  understandingLogger.logLearning(
    'contact_john_doe_high_priority',
    0.89,
    'user_behavior',
    {
      indicators: ['quick_response_time', 'frequent_calls', 'long_duration'],
      avg_response_time: '2_seconds',
      call_frequency: '3_per_day'
    }
  );

  // Feature usage examples
  understandingLogger.logFeatureUsage('speed_dial', 'frequent', 0.85);
  understandingLogger.logFeatureUsage('call_recording', 'occasional', 0.6);
  understandingLogger.logFeatureUsage('video_call', 'occasional', 0.5);

  // User feedback examples
  understandingLogger.logUserFeedback(5, 'Great call quality today!', 'call_quality');
  understandingLogger.logUserFeedback(3, 'Interface could be more intuitive', 'ui_ux');
  understandingLogger.logUserFeedback(4, 'Love the new contact search feature', 'features');

  console.log('Generated example understanding logs');
};

// Generate system logs for comparison
export const generateExampleSystemLogs = () => {
  notificationService.addLog('info', 'WebSocket connection established');
  notificationService.addLog('warning', 'High CPU usage detected: 85%');
  notificationService.addLog('error', 'Failed to connect to Asterisk AMI');
  notificationService.addLog('info', 'User authentication successful');
  notificationService.addLog('warning', 'Database query took longer than expected: 2.5s');
  notificationService.addLog('info', 'Call log exported successfully');
  
  console.log('Generated example system logs');
};

// Clear all understanding logs
export const clearUnderstandingLogs = () => {
  notificationService.clearUnderstandingLogs();
  console.log('Cleared understanding logs');
};

// Clear all logs
export const clearAllLogs = () => {
  notificationService.clearAllLogs();
  console.log('Cleared all logs');
};

// Get understanding metrics
export const getUnderstandingMetrics = () => {
  const metrics = understandingLogger.getMetrics();
  console.log('Understanding Metrics:', metrics);
  return metrics;
};

// Get log statistics
export const getLogStatistics = () => {
  const stats = notificationService.getStats();
  console.log('Log Statistics:', stats);
  return stats;
};

// Auto-generate logs for demo purposes
export const startAutoLogGeneration = (interval = 10000) => {
  const logTypes = [
    () => understandingLogger.logUserInteraction('button_click', { button: 'call', timestamp: Date.now() }),
    () => understandingLogger.logAIResponse('suggestion', Math.random(), { type: 'contact_suggestion' }),
    () => understandingLogger.logComprehension('medium', 'user_pattern', { pattern: 'frequent_user' }),
    () => notificationService.addLog('info', `System check completed at ${new Date().toLocaleTimeString()}`),
    () => notificationService.addLog('warning', `Memory usage: ${Math.round(Math.random() * 40 + 60)}%`)
  ];

  const intervalId = setInterval(() => {
    const randomLog = logTypes[Math.floor(Math.random() * logTypes.length)];
    randomLog();
  }, interval);

  console.log(`Started auto log generation (interval: ${interval}ms)`);
  return intervalId;
};

// Stop auto log generation
export const stopAutoLogGeneration = (intervalId) => {
  if (intervalId) {
    clearInterval(intervalId);
    console.log('Stopped auto log generation');
  }
};

// Export for global access in development
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  window.understandingLogExamples = {
    generateExampleUnderstandingLogs,
    generateExampleSystemLogs,
    clearUnderstandingLogs,
    clearAllLogs,
    getUnderstandingMetrics,
    getLogStatistics,
    startAutoLogGeneration,
    stopAutoLogGeneration
  };
}
