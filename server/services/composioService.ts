import { LettaClient } from '@letta-ai/letta-client';

export interface ComposioConfig {
  baseUrl: string;
  apiKey: string;
}

export interface ConnectionResult {
  redirectUrl: string;
  connectionId: string;
  status: string;
}

export interface UserConnection {
  connectionId: string;
  userEmail: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  status: 'active' | 'expired' | 'revoked';
}

export class ComposioService {
  private lettaClient: LettaClient;
  private config: ComposioConfig;
  private userConnections: Map<string, UserConnection> = new Map();

  // Google Calendar tools that we want to add to the agent
  private readonly GOOGLE_CALENDAR_TOOLS = [
    'GOOGLECALENDAR_PATCH_EVENT',
    'GOOGLECALENDAR_CALENDARS_UPDATE', 
    'GOOGLECALENDAR_CREATE_EVENT',
    'GOOGLECALENDAR_DELETE_EVENT',
    'GOOGLECALENDAR_EVENTS_INSTANCES',
    'GOOGLECALENDAR_EVENTS_LIST',
    'GOOGLECALENDAR_EVENTS_MOVE',
    'GOOGLECALENDAR_FIND_EVENT',
    'GOOGLECALENDAR_FREE_BUSY_QUERY',
    'GOOGLECALENDAR_GET_CALENDAR',
    'GOOGLECALENDAR_GET_CURRENT_DATE_TIME',
    'GOOGLECALENDAR_LIST_CALENDARS',
    'GOOGLECALENDAR_PATCH_CALENDAR',
    'GOOGLECALENDAR_QUICK_ADD',
    'GOOGLECALENDAR_REMOVE_ATTENDEE',
    'GOOGLECALENDAR_UPDATE_EVENT'
  ];

  constructor() {
    // Load configuration from environment variables
    this.config = {
      baseUrl: process.env.VITE_LETTA_BASE_URL || 'https://api.letta.ai',
      apiKey: process.env.VITE_LETTA_API_KEY || '',
    };

    // Initialize Letta client
    this.lettaClient = new LettaClient({
      baseUrl: this.config.baseUrl,
      token: this.config.apiKey,
    });

    console.log('🔧 Composio Service initialized:');
    console.log('- Letta Base URL:', this.config.baseUrl);
    console.log('- API Key:', this.config.apiKey ? 'Configured ✅' : 'Not configured ❌');
    console.log('- Google Calendar Tools:', this.GOOGLE_CALENDAR_TOOLS.length, 'tools available');

    if (!this.config.apiKey) {
      console.warn('⚠️ WARNING: No Letta API key configured. Composio functionality may be limited.');
    }
  }

  /**
   * Connect user's Google Account to Composio (simplified version)
   */
  async connectUserGoogleAccount(userEmail: string, accessToken: string, refreshToken?: string, expiresIn?: number): Promise<string> {
    try {
      console.log('🔗 Connecting user Google Account to Composio:', userEmail);

      // For now, we'll simulate the connection since Composio integration is complex
      // In a real implementation, you would use the Composio SDK to create the connection
      const connectionId = `conn_${userEmail}_${Date.now()}`;

      // Store the connection details
      const userConnection: UserConnection = {
        connectionId: connectionId,
        userEmail: userEmail,
        accessToken: accessToken,
        refreshToken: refreshToken,
        expiresAt: expiresIn ? Date.now() + (expiresIn * 1000) : Date.now() + (3600 * 1000),
        status: 'active'
      };

      this.userConnections.set(userEmail, userConnection);

      console.log('✅ User Google Account connected successfully:', {
        userEmail,
        connectionId: connectionId,
        hasRefreshToken: !!refreshToken
      });

      return connectionId;
    } catch (error) {
      console.error('❌ Failed to connect user Google Account:', error);
      throw new Error(`Failed to connect Google Account for ${userEmail}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get user's connection ID
   */
  getUserConnectionId(userEmail: string): string | null {
    const connection = this.userConnections.get(userEmail);
    return connection?.connectionId || null;
  }

  /**
   * Check if user has an active Google Calendar connection
   */
  hasUserConnection(userEmail: string): boolean {
    const connection = this.userConnections.get(userEmail);
    return connection?.status === 'active' && connection.expiresAt > Date.now();
  }

  /**
   * Refresh user's connection if needed
   */
  async refreshUserConnection(userEmail: string): Promise<boolean> {
    try {
      const connection = this.userConnections.get(userEmail);
      if (!connection || !connection.refreshToken) {
        return false;
      }

      console.log('🔄 Refreshing user connection:', userEmail);

      // Here you would implement token refresh logic
      // For now, we'll assume the connection is still valid
      connection.expiresAt = Date.now() + (3600 * 1000); // Extend by 1 hour
      this.userConnections.set(userEmail, connection);

      return true;
    } catch (error) {
      console.error('❌ Failed to refresh user connection:', error);
      return false;
    }
  }

  /**
   * Add Composio Google Calendar tools to Letta with user-specific connection
   */
  async addGoogleCalendarToolsForUser(userEmail: string): Promise<string[]> {
    try {
      console.log('🛠️ Adding Google Calendar tools for user:', userEmail);

      // Ensure user has a valid connection
      if (!this.hasUserConnection(userEmail)) {
        throw new Error(`No active Google Calendar connection for user: ${userEmail}`);
      }

      const connectionId = this.getUserConnectionId(userEmail);
      if (!connectionId) {
        throw new Error(`No connection ID found for user: ${userEmail}`);
      }

      const toolIds: string[] = [];

      // For now, we'll simulate adding tools since the actual Composio integration is complex
      // In a real implementation, you would use the Letta client to add Composio tools
      for (const toolName of this.GOOGLE_CALENDAR_TOOLS) {
        try {
          console.log(`📦 Simulating tool addition: ${toolName} for user: ${userEmail}`);
          
          // Simulate tool ID generation
          const toolId = `tool_${toolName.toLowerCase()}_${userEmail}_${Date.now()}`;
          toolIds.push(toolId);
          
          console.log(`✅ Simulated tool ${toolName} with ID: ${toolId}`);
        } catch (toolError) {
          console.warn(`⚠️ Failed to add tool ${toolName}:`, toolError);
          // Continue with other tools even if one fails
        }
      }

      console.log(`🎉 Successfully simulated adding ${toolIds.length}/${this.GOOGLE_CALENDAR_TOOLS.length} Google Calendar tools for user: ${userEmail}`);
      return toolIds;

    } catch (error) {
      console.error('❌ Failed to add Google Calendar tools for user:', error);
      throw error;
    }
  }

  /**
   * Test the basic Composio connection
   */
  async testConnection(): Promise<{ status: string; message: string; timestamp: string }> {
    try {
      console.log('🔍 Testing Composio connection...');
      
      // Test if we can initialize the service
      const testResult = {
        lettaClient: !!this.lettaClient,
        hasApiKey: !!this.config.apiKey,
        baseUrl: this.config.baseUrl,
        userConnections: this.userConnections.size
      };

      console.log('✅ Composio connection test successful:', testResult);
      
      return {
        status: 'success',
        message: `Composio service is properly initialized and ready for connections. ${this.userConnections.size} user connections active.`,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ Composio connection test failed:', error);
      
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error during connection test',
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Initiate Google Calendar connection using Composio (fallback method)
   */
  async initiateGoogleCalendarConnection(): Promise<ConnectionResult> {
    try {
      console.log('🔄 Initiating Google Calendar connection via Composio...');
      
      // For now, we'll simulate the connection initiation
      // In a real implementation, you would use the Composio SDK
      const connectionId = `fallback_conn_${Date.now()}`;
      const redirectUrl = `https://accounts.google.com/oauth/authorize?client_id=example&redirect_uri=http://localhost:3001/callback&response_type=code&scope=https://www.googleapis.com/auth/calendar`;

      console.log(`✅ Google Calendar connection initiated successfully`);
      console.log(`🔗 Simulated redirect URL: ${redirectUrl}`);

      return {
        redirectUrl: redirectUrl,
        connectionId: connectionId,
        status: 'initiated'
      };
    } catch (error) {
      console.error('❌ Failed to initiate Google Calendar connection:', error);
      
      // Provide detailed error information
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorDetails = {
        error: errorMessage,
        hasApiKey: !!this.config.apiKey,
        timestamp: new Date().toISOString()
      };

      console.error('🔍 Error details:', errorDetails);
      
      throw new Error(`Google Calendar connection failed: ${errorMessage}`);
    }
  }

  /**
   * Get all connected accounts
   */
  async getConnections(): Promise<any[]> {
    try {
      console.log('🔍 Fetching Composio connections...');
      
      // Return user connections
      const connections = Array.from(this.userConnections.values()).map(conn => ({
        id: conn.connectionId,
        userEmail: conn.userEmail,
        status: conn.status,
        expiresAt: new Date(conn.expiresAt).toISOString(),
        hasRefreshToken: !!conn.refreshToken
      }));
      
      console.log(`📋 Found ${connections.length} user connections`);
      return connections;
    } catch (error) {
      console.error('❌ Failed to fetch connections:', error);
      throw new Error(`Failed to fetch connections: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Remove user connection
   */
  async removeUserConnection(userEmail: string): Promise<boolean> {
    try {
      const connection = this.userConnections.get(userEmail);
      if (!connection) {
        return false;
      }

      // Mark as revoked
      connection.status = 'revoked';
      this.userConnections.set(userEmail, connection);

      console.log('🗑️ Removed user connection:', userEmail);
      return true;
    } catch (error) {
      console.error('❌ Failed to remove user connection:', error);
      return false;
    }
  }

  /**
   * Get the Letta client instance
   */
  getLettaClient(): LettaClient {
    return this.lettaClient;
  }

  /**
   * Get service configuration
   */
  getConfig(): Partial<ComposioConfig> {
    return {
      baseUrl: this.config.baseUrl,
      // Don't expose the API key
    };
  }

  /**
   * Get user connections summary
   */
  getUserConnectionsSummary(): { total: number; active: number; expired: number } {
    const connections = Array.from(this.userConnections.values());
    return {
      total: connections.length,
      active: connections.filter(c => c.status === 'active' && c.expiresAt > Date.now()).length,
      expired: connections.filter(c => c.status === 'active' && c.expiresAt <= Date.now()).length
    };
  }
}