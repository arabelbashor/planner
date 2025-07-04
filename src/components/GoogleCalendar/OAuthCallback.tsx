import React, { useEffect, useState } from 'react';
import { CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { oauthService } from '../../services/oauthService';
import { googleCalendarService } from '../../services/googleCalendarService';
import { useApp } from '../../contexts/AppContext';

interface CallbackState {
  status: 'processing' | 'success' | 'error';
  message: string;
  details?: string;
}

export default function OAuthCallback() {
  const { state, dispatch } = useApp();
  const [callbackState, setCallbackState] = useState<CallbackState>({
    status: 'processing',
    message: 'Processing authentication...',
  });

  useEffect(() => {
    handleOAuthCallback();
  }, []);

  const handleOAuthCallback = async () => {
    try {
      setCallbackState({
        status: 'processing',
        message: 'Validating authorization code...',
      });

      // Get current URL
      const currentUrl = window.location.href;
      console.log('🔍 Processing OAuth callback:', currentUrl);

      // Handle the callback
      const callbackResult = oauthService.handleCallback(currentUrl);
      
      if (!callbackResult) {
        throw new Error('Failed to process OAuth callback');
      }

      const { code, state: stateParam } = callbackResult;

      setCallbackState({
        status: 'processing',
        message: 'Exchanging authorization code for access token...',
      });

      // Exchange code for tokens
      const tokens = await oauthService.exchangeCodeForTokens(code, stateParam);

      setCallbackState({
        status: 'processing',
        message: 'Setting up AI integration...',
      });

      // Connect to server integration if user email is available
      if (state.user?.email) {
        try {
          await googleCalendarService.connectToServerIntegration(state.user.email);
          console.log('✅ Connected to server integration');
        } catch (error) {
          console.warn('⚠️ Failed to connect to server integration:', error);
          // Don't fail the entire flow if server integration fails
        }
      }

      setCallbackState({
        status: 'success',
        message: 'Authentication successful!',
        details: 'Google Calendar is now connected with AI integration. Redirecting...',
      });

      // Add success message to chat
      dispatch({
        type: 'ADD_CHAT_MESSAGE',
        payload: {
          id: Date.now().toString(),
          type: 'ai',
          content: '🎉 Perfect! Google Calendar is now connected with full editing permissions and AI integration. Your calendar events will sync automatically and I can now directly create, update, and manage events in your Google Calendar using natural language commands!',
          timestamp: new Date().toISOString(),
        },
      });

      // Redirect back to main app after a short delay
      setTimeout(() => {
        window.location.href = '/';
      }, 2000);

    } catch (error) {
      console.error('❌ OAuth callback error:', error);
      
      setCallbackState({
        status: 'error',
        message: 'Authentication failed',
        details: error instanceof Error ? error.message : 'Unknown error occurred',
      });

      // Add error message to chat
      dispatch({
        type: 'ADD_CHAT_MESSAGE',
        payload: {
          id: Date.now().toString(),
          type: 'ai',
          content: `❌ Authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}. Please try connecting again.`,
          timestamp: new Date().toISOString(),
        },
      });

      // Redirect back to main app after showing error
      setTimeout(() => {
        window.location.href = '/';
      }, 5000);
    }
  };

  const getStatusIcon = () => {
    switch (callbackState.status) {
      case 'processing':
        return <Loader2 className="h-8 w-8 animate-spin text-blue-500" />;
      case 'success':
        return <CheckCircle className="h-8 w-8 text-green-500" />;
      case 'error':
        return <AlertCircle className="h-8 w-8 text-red-500" />;
    }
  };

  const getStatusColor = () => {
    switch (callbackState.status) {
      case 'processing':
        return 'border-blue-200 bg-blue-50';
      case 'success':
        return 'border-green-200 bg-green-50';
      case 'error':
        return 'border-red-200 bg-red-50';
    }
  };

  return (
    <div className={`min-h-screen flex items-center justify-center p-4 ${
      state.isDarkMode ? 'bg-gray-900' : 'bg-gray-50'
    }`}>
      <div className={`max-w-md w-full rounded-xl shadow-lg border p-8 text-center ${
        state.isDarkMode 
          ? 'bg-gray-800 border-gray-700' 
          : `bg-white ${getStatusColor()}`
      }`}>
        {/* Status Icon */}
        <div className="flex justify-center mb-6">
          {getStatusIcon()}
        </div>

        {/* Status Message */}
        <h1 className={`text-xl font-semibold mb-4 ${
          state.isDarkMode ? 'text-white' : 'text-gray-900'
        }`}>
          {callbackState.message}
        </h1>

        {/* Details */}
        {callbackState.details && (
          <p className={`text-sm mb-6 ${
            state.isDarkMode ? 'text-gray-400' : 'text-gray-600'
          }`}>
            {callbackState.details}
          </p>
        )}

        {/* Progress Indicator */}
        {callbackState.status === 'processing' && (
          <div className={`w-full bg-gray-200 rounded-full h-2 ${
            state.isDarkMode ? 'bg-gray-700' : 'bg-gray-200'
          }`}>
            <div className="bg-blue-500 h-2 rounded-full animate-pulse" style={{ width: '60%' }}></div>
          </div>
        )}

        {/* Action Buttons */}
        {callbackState.status === 'error' && (
          <div className="mt-6">
            <button
              onClick={() => window.location.href = '/'}
              className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                state.isDarkMode
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-blue-500 text-white hover:bg-blue-600'
              }`}
            >
              Return to App
            </button>
          </div>
        )}

        {/* Debug Information (Development Only) */}
        {import.meta.env.DEV && (
          <div className={`mt-6 p-4 rounded-lg text-xs text-left ${
            state.isDarkMode ? 'bg-gray-700' : 'bg-gray-100'
          }`}>
            <p className="font-medium mb-2">Debug Info:</p>
            <p>URL: {window.location.href}</p>
            <p>Status: {callbackState.status}</p>
            <p>User Email: {state.user?.email || 'Not available'}</p>
            <p>Timestamp: {new Date().toISOString()}</p>
          </div>
        )}
      </div>
    </div>
  );
}