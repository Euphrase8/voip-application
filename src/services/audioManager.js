// Audio Manager Service
// Centralized audio control for the VoIP application

import { microphoneFix } from '../utils/microphoneFix';

class AudioManager {
  constructor() {
    this.localStream = null;
    this.remoteAudio = null;
    this.audioContext = null;
    this.gainNode = null;
    this.settings = {
      volume: 0.8,
      microphoneVolume: 0.8,
      ringtoneVolume: 0.8,
      isMuted: false,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    };
    
    this.loadSettings();
    this.setupAudioContext();
  }

  // Load audio settings from localStorage
  loadSettings() {
    try {
      const savedSettings = localStorage.getItem('voipSettings');
      if (savedSettings) {
        const parsed = JSON.parse(savedSettings);
        if (parsed.audio) {
          this.settings = {
            ...this.settings,
            volume: (parsed.audio.volume || 80) / 100,
            echoCancellation: parsed.audio.echoCancellation !== false,
            noiseSuppression: parsed.audio.noiseSuppression !== false,
            autoGainControl: parsed.audio.autoGainControl !== false
          };
        }
      }
    } catch (error) {
      console.warn('[AudioManager] Failed to load settings:', error);
    }
  }

  // Save audio settings to localStorage
  saveSettings() {
    try {
      const existingSettings = JSON.parse(localStorage.getItem('voipSettings') || '{}');
      existingSettings.audio = {
        ...existingSettings.audio,
        volume: Math.round(this.settings.volume * 100),
        echoCancellation: this.settings.echoCancellation,
        noiseSuppression: this.settings.noiseSuppression,
        autoGainControl: this.settings.autoGainControl
      };
      localStorage.setItem('voipSettings', JSON.stringify(existingSettings));
      console.log('[AudioManager] Settings saved:', existingSettings.audio);
    } catch (error) {
      console.warn('[AudioManager] Failed to save settings:', error);
    }
  }

  // Setup Web Audio API context for advanced audio processing
  setupAudioContext() {
    try {
      // Check if AudioContext is available
      if (typeof window === 'undefined' || (!window.AudioContext && !window.webkitAudioContext)) {
        console.warn('[AudioManager] AudioContext not available, using basic audio controls');
        return;
      }

      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = this.settings.volume;
      this.gainNode.connect(this.audioContext.destination);
      console.log('[AudioManager] Audio context setup successful');
    } catch (error) {
      console.warn('[AudioManager] Failed to setup audio context, using basic audio controls:', error);
    }
  }

  // Get audio constraints based on current settings
  getAudioConstraints() {
    try {
      return {
        audio: {
          echoCancellation: this.settings.echoCancellation,
          noiseSuppression: this.settings.noiseSuppression,
          autoGainControl: this.settings.autoGainControl,
          sampleRate: 48000,
          channelCount: 1
        },
        video: false
      };
    } catch (error) {
      console.warn('[AudioManager] Error creating audio constraints, using basic constraints:', error);
      return {
        audio: true,
        video: false
      };
    }
  }

  // Set up local media stream with enhanced microphone fix
  async setupLocalMedia() {
    try {
      if (this.localStream && this.localStream.active) {
        console.log('[AudioManager] Local media already available');
        return this.localStream;
      }

      console.log('[AudioManager] Setting up local media with enhanced microphone fix...');

      // Use the enhanced microphone fix utility
      const micResult = await microphoneFix.requestMicrophoneAccess();

      if (!micResult.success) {
        console.error('[AudioManager] Microphone access failed:', micResult.error);

        // Generate user-friendly instructions
        const instructions = microphoneFix.generateFixInstructions(micResult.error);

        let errorMessage = instructions.title;
        if (instructions.steps.length > 0) {
          errorMessage += '\n\nSteps to fix:\n' + instructions.steps.map((step, i) => `${i + 1}. ${step}`).join('\n');
        }

        console.error('[AudioManager] Microphone fix instructions:', errorMessage);
        throw new Error(errorMessage);
      }

      this.localStream = micResult.stream;
      console.log('[AudioManager] ✅ Local media setup successful using:', micResult.method);

      // Test microphone levels
      try {
        const levelTest = await microphoneFix.testMicrophoneLevel(this.localStream, 1000);
        console.log('[AudioManager] Microphone test:', levelTest);

        if (!levelTest.isWorking) {
          console.warn('[AudioManager] Microphone may not be working properly');
        } else {
          console.log('[AudioManager] ✅ Microphone is working, quality:', levelTest.quality);
        }
      } catch (testError) {
        console.warn('[AudioManager] Microphone level test failed:', testError);
      }

      // Apply current mute state
      this.setMute(this.settings.isMuted);

      console.log('[AudioManager] Local media setup completed successfully');
      return this.localStream;
    } catch (error) {
      console.error('[AudioManager] Failed to setup local media:', error);

      // For enhanced error handling, throw the error so the calling code can handle it
      throw error;
    }
  }

  // Set up remote audio element
  setupRemoteAudio(audioElement = null) {
    if (audioElement) {
      this.remoteAudio = audioElement;
    } else {
      this.remoteAudio = new Audio();
      this.remoteAudio.autoplay = true;
      this.remoteAudio.playsInline = true;
      this.remoteAudio.controls = false;
    }
    
    this.remoteAudio.volume = this.settings.volume;
    
    // Connect to Web Audio API if available
    if (this.audioContext && this.gainNode) {
      try {
        const source = this.audioContext.createMediaElementSource(this.remoteAudio);
        source.connect(this.gainNode);
      } catch (error) {
        console.warn('[AudioManager] Failed to connect to audio context:', error);
      }
    }

    return this.remoteAudio;
  }

  // Mute/unmute microphone
  toggleMute() {
    this.settings.isMuted = !this.settings.isMuted;
    this.setMute(this.settings.isMuted);
    return !this.settings.isMuted; // Return enabled state
  }

  setMute(muted) {
    this.settings.isMuted = muted;
    
    if (this.localStream && this.localStream.active) {
      const audioTracks = this.localStream.getAudioTracks();
      audioTracks.forEach(track => {
        track.enabled = !muted;
      });
    } else if (this.localStream) {
      console.warn('[AudioManager] Local stream exists but is inactive, cannot toggle mute');
    } else {
      console.warn('[AudioManager] No local stream available, mute state saved for later');
    }
    
    console.log('[AudioManager] Microphone', muted ? 'muted' : 'enabled');
    this.saveSettings();
  }

  // Set speaker volume
  setVolume(volume) {
    const normalizedVolume = Math.max(0, Math.min(1, volume));
    this.settings.volume = normalizedVolume;
    
    if (this.remoteAudio) {
      this.remoteAudio.volume = normalizedVolume;
    }
    
    if (this.gainNode) {
      this.gainNode.gain.value = normalizedVolume;
    }
    
    console.log('[AudioManager] Volume set to:', normalizedVolume);
    this.saveSettings();
    return normalizedVolume;
  }

  // Get current volume
  getVolume() {
    return this.settings.volume;
  }

  // Check if microphone is muted
  isMuted() {
    return this.settings.isMuted;
  }

  // Update audio settings
  updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    this.saveSettings();
    
    // Apply volume changes immediately
    if (newSettings.volume !== undefined) {
      this.setVolume(newSettings.volume);
    }
    
    // If audio processing settings changed, we might need to restart the stream
    const processingChanged = ['echoCancellation', 'noiseSuppression', 'autoGainControl']
      .some(key => newSettings[key] !== undefined && newSettings[key] !== this.settings[key]);
    
    if (processingChanged && this.localStream) {
      console.log('[AudioManager] Audio processing settings changed, stream restart may be needed');
    }
  }

  // Play ringtone
  playRingtone() {
    try {
      if (this.audioContext && this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }
      
      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();
      
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(440, this.audioContext.currentTime);
      gainNode.gain.setValueAtTime(this.settings.ringtoneVolume * 0.3, this.audioContext.currentTime);
      
      oscillator.connect(gainNode);
      gainNode.connect(this.audioContext.destination);
      
      oscillator.start();
      oscillator.stop(this.audioContext.currentTime + 0.5);
      
      return oscillator;
    } catch (error) {
      console.warn('[AudioManager] Failed to play ringtone:', error);
      return null;
    }
  }

  // Clean up resources
  cleanup() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }
    
    if (this.remoteAudio) {
      this.remoteAudio.pause();
      this.remoteAudio.srcObject = null;
      this.remoteAudio = null;
    }
    
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
      this.audioContext = null;
      this.gainNode = null;
    }
    
    console.log('[AudioManager] Cleanup completed');
  }

  // Get current settings
  getSettings() {
    return { ...this.settings };
  }
}

// Create singleton instance
const audioManager = new AudioManager();

export default audioManager;
