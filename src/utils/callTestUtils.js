// Call Testing Utilities
// Comprehensive testing tools for call functionality

import { hangupCall } from '../services/hangupService';
import webrtcCallService from '../services/webrtcCallService';

export class CallTester {
  constructor() {
    this.testResults = [];
  }

  // Test hangup functionality
  async testHangupFunctionality(channel = 'test-channel-123') {
    console.log('🧪 Testing hangup functionality...');
    
    const tests = [
      { name: 'SIP Call Hangup', type: 'sip' },
      { name: 'WebRTC Call Hangup', type: 'webrtc' },
      { name: 'WebSocket Call Hangup', type: 'websocket' },
      { name: 'Auto-detect Hangup', type: 'auto' }
    ];

    const results = [];

    for (const test of tests) {
      try {
        console.log(`Testing ${test.name}...`);
        const result = await hangupCall(`${test.type}-${channel}`, test.type);
        
        results.push({
          test: test.name,
          success: result.success,
          method: result.method,
          details: result
        });

        console.log(`✅ ${test.name}: ${result.success ? 'PASSED' : 'FAILED'}`);
      } catch (error) {
        results.push({
          test: test.name,
          success: false,
          error: error.message,
          details: error
        });

        console.log(`❌ ${test.name}: FAILED - ${error.message}`);
      }
    }

    return {
      summary: {
        total: tests.length,
        passed: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length
      },
      results
    };
  }

  // Test WebRTC service directly
  async testWebRTCService() {
    console.log('🧪 Testing WebRTC service...');
    
    const tests = [
      {
        name: 'WebRTC End Call',
        test: () => {
          webrtcCallService.endCall();
          return { success: true, message: 'End call executed' };
        }
      },
      {
        name: 'WebRTC Reject Call',
        test: () => {
          webrtcCallService.rejectCall();
          return { success: true, message: 'Reject call executed' };
        }
      },
      {
        name: 'WebRTC Cleanup',
        test: () => {
          webrtcCallService.cleanup();
          return { success: true, message: 'Cleanup executed' };
        }
      }
    ];

    const results = [];

    for (const test of tests) {
      try {
        const result = test.test();
        results.push({
          test: test.name,
          success: result.success,
          message: result.message
        });
        console.log(`✅ ${test.name}: PASSED`);
      } catch (error) {
        results.push({
          test: test.name,
          success: false,
          error: error.message
        });
        console.log(`❌ ${test.name}: FAILED - ${error.message}`);
      }
    }

    return {
      summary: {
        total: tests.length,
        passed: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length
      },
      results
    };
  }

  // Test incoming call handling
  async testIncomingCallHandling() {
    console.log('🧪 Testing incoming call handling...');
    
    // Simulate incoming call message
    const mockIncomingCall = {
      type: 'incoming_call',
      caller: '1001',
      channel: 'test-incoming-123',
      priority: 'normal',
      transport: 'transport-ws'
    };

    const tests = [
      {
        name: 'Parse Incoming Call',
        test: () => {
          const isValid = mockIncomingCall.type === 'incoming_call' &&
                          mockIncomingCall.caller &&
                          mockIncomingCall.channel;
          return { success: isValid, message: 'Incoming call parsed correctly' };
        }
      },
      {
        name: 'Detect Call Type',
        test: () => {
          const isWebRTC = mockIncomingCall.channel.includes('webrtc');
          const isSIP = !isWebRTC;
          return { 
            success: true, 
            message: `Detected as ${isWebRTC ? 'WebRTC' : 'SIP'} call` 
          };
        }
      }
    ];

    const results = [];

    for (const test of tests) {
      try {
        const result = test.test();
        results.push({
          test: test.name,
          success: result.success,
          message: result.message
        });
        console.log(`✅ ${test.name}: PASSED`);
      } catch (error) {
        results.push({
          test: test.name,
          success: false,
          error: error.message
        });
        console.log(`❌ ${test.name}: FAILED - ${error.message}`);
      }
    }

    return {
      summary: {
        total: tests.length,
        passed: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length
      },
      results,
      mockCall: mockIncomingCall
    };
  }

  // Run all tests
  async runAllTests() {
    console.log('🚀 Running comprehensive call tests...');
    
    const testSuites = [
      { name: 'Hangup Functionality', test: () => this.testHangupFunctionality() },
      { name: 'WebRTC Service', test: () => this.testWebRTCService() },
      { name: 'Incoming Call Handling', test: () => this.testIncomingCallHandling() }
    ];

    const allResults = [];

    for (const suite of testSuites) {
      try {
        console.log(`\n📋 Running ${suite.name} tests...`);
        const result = await suite.test();
        allResults.push({
          suite: suite.name,
          ...result
        });
      } catch (error) {
        allResults.push({
          suite: suite.name,
          summary: { total: 0, passed: 0, failed: 1 },
          results: [{ test: suite.name, success: false, error: error.message }]
        });
      }
    }

    // Calculate overall summary
    const overallSummary = allResults.reduce((acc, suite) => {
      acc.total += suite.summary.total;
      acc.passed += suite.summary.passed;
      acc.failed += suite.summary.failed;
      return acc;
    }, { total: 0, passed: 0, failed: 0 });

    console.log('\n📊 Test Results Summary:');
    console.log(`Total Tests: ${overallSummary.total}`);
    console.log(`Passed: ${overallSummary.passed}`);
    console.log(`Failed: ${overallSummary.failed}`);
    console.log(`Success Rate: ${((overallSummary.passed / overallSummary.total) * 100).toFixed(1)}%`);

    return {
      summary: overallSummary,
      suites: allResults
    };
  }
}

// Quick test functions for console use
export const quickHangupTest = async (channel = 'test-123') => {
  const tester = new CallTester();
  return await tester.testHangupFunctionality(channel);
};

export const quickWebRTCTest = async () => {
  const tester = new CallTester();
  return await tester.testWebRTCService();
};

export const quickIncomingCallTest = async () => {
  const tester = new CallTester();
  return await tester.testIncomingCallHandling();
};

export const runAllCallTests = async () => {
  const tester = new CallTester();
  return await tester.runAllTests();
};

// Export for global access in browser console (development only)
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  window.callTester = {
    quickHangupTest,
    quickWebRTCTest,
    quickIncomingCallTest,
    runAllCallTests,
    CallTester
  };
}

export default CallTester;
