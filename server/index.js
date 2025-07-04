import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { openai } from '@ai-sdk/openai';
import { VercelAIToolSet } from 'composio-core';
import { generateText } from 'ai';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.SERVER_PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());

// Initialize Composio ToolSet
const toolset = new VercelAIToolSet({
  apiKey: process.env.COMPOSIO_API_KEY,
});

// User-specific storage for connections and entities
const userConnections = new Map(); // userEmail -> connection data
const userEntities = new Map(); // userEmail -> entityId

// Helper function to setup user connection if not exists
async function setupUserConnectionIfNotExists(userEmail) {
  try {
    console.log(`🔗 Setting up Composio connection for user: ${userEmail}`);
    
    // Create entity ID based on user email (sanitized)
    const entityId = userEmail.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    
    // Store entity mapping
    userEntities.set(userEmail, entityId);
    
    const entity = await toolset.client.getEntity(entityId);
    
    try {
      // Try to get existing connection
      const connection = await entity.getConnection({
        app: 'googlecalendar',
      });
      
      console.log(`✅ Found existing Google Calendar connection for ${userEmail}`);
      
      // Store connection info
      userConnections.set(userEmail, {
        entityId,
        connectionId: connection.id,
        status: 'active',
        connectedAt: new Date().toISOString()
      });
      
      return connection;
    } catch (error) {
      // No existing connection, create new one
      console.log(`🔄 Creating new Google Calendar connection for ${userEmail}`);
      
      const newConnection = await entity.initiateConnection({
        appName: 'googlecalendar',
        entity: entityId
      });
      
      console.log(`🔗 Google Calendar connection URL for ${userEmail}:`, newConnection.redirectUrl);
      
      // Store pending connection info
      userConnections.set(userEmail, {
        entityId,
        connectionId: newConnection.id,
        redirectUrl: newConnection.redirectUrl,
        status: 'pending',
        createdAt: new Date().toISOString()
      });
      
      return newConnection;
    }
  } catch (error) {
    console.error(`❌ Error setting up connection for ${userEmail}:`, error);
    throw error;
  }
}

// Helper function to get user-specific tools
async function getUserTools(userEmail) {
  try {
    const entityId = userEntities.get(userEmail);
    if (!entityId) {
      throw new Error(`No entity found for user: ${userEmail}`);
    }
    
    console.log(`🛠️ Getting tools for user ${userEmail} with entity ${entityId}`);
    
    const tools = await toolset.getTools({
      actions: [
        'GOOGLECALENDAR_QUICK_ADD',
        'GOOGLECALENDAR_LIST_EVENTS',
        'GOOGLECALENDAR_CREATE_EVENT',
        'GOOGLECALENDAR_UPDATE_EVENT',
        'GOOGLECALENDAR_DELETE_EVENT'
      ]
    }, entityId);
    
    console.log(`✅ Retrieved ${tools ? Object.keys(tools).length : 0} tools for ${userEmail}`);
    return tools;
  } catch (error) {
    console.error(`❌ Error getting tools for ${userEmail}:`, error);
    throw error;
  }
}

// Helper function to check if connection is active
async function checkConnectionStatus(userEmail) {
  try {
    const connectionData = userConnections.get(userEmail);
    const entityId = userEntities.get(userEmail);
    
    if (!connectionData || !entityId) {
      return { status: 'not_found', message: 'No connection found' };
    }
    
    // Try to get tools to verify connection is working
    const tools = await getUserTools(userEmail);
    
    if (tools && Object.keys(tools).length > 0) {
      // Update status to active if tools are available
      connectionData.status = 'active';
      userConnections.set(userEmail, connectionData);
      
      return { 
        status: 'active', 
        message: 'Connection is active',
        toolsAvailable: Object.keys(tools).length
      };
    } else {
      return { status: 'pending', message: 'Connection pending authentication' };
    }
  } catch (error) {
    console.error(`❌ Error checking connection status for ${userEmail}:`, error);
    return { status: 'error', message: error.message };
  }
}

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'SmartPlan API Server with Composio + OpenAI',
    status: 'running',
    clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
    endpoints: {
      health: '/api/health',
      setupConnection: '/api/composio/setup-connection',
      sendMessage: '/api/ai/send-message',
      getConnections: '/api/composio/connections',
      testConnection: '/api/composio/test-connection',
      stats: '/api/stats'
    },
    note: 'This server uses Composio + OpenAI for user-specific Google Calendar management.',
    userConnections: userConnections.size,
    userEntities: userEntities.size,
    timestamp: new Date().toISOString()
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    services: {
      openai: process.env.OPENAI_API_KEY ? 'configured' : 'missing',
      composio: process.env.COMPOSIO_API_KEY ? 'configured' : 'missing'
    },
    userConnections: userConnections.size,
    userEntities: userEntities.size
  });
});

// Setup Composio connection for user
app.post('/api/composio/setup-connection', async (req, res) => {
  try {
    const { userEmail } = req.body;
    
    if (!userEmail) {
      return res.status(400).json({
        success: false,
        error: 'userEmail is required',
        timestamp: new Date().toISOString()
      });
    }
    
    console.log(`🔄 Setting up Composio connection for: ${userEmail}`);
    
    const connection = await setupUserConnectionIfNotExists(userEmail);
    const connectionData = userConnections.get(userEmail);
    
    res.json({
      success: true,
      userEmail,
      entityId: connectionData?.entityId,
      connectionId: connectionData?.connectionId,
      redirectUrl: connectionData?.redirectUrl,
      status: connectionData?.status,
      message: connectionData?.status === 'pending' 
        ? `Please complete Google Calendar authentication using the redirect URL`
        : `Google Calendar connection is active for ${userEmail}`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error setting up Composio connection:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

// AI Chat endpoint with Composio tools
app.post('/api/ai/send-message', async (req, res) => {
  try {
    const { message, userEmail, context } = req.body;
    
    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'Message is required',
        timestamp: new Date().toISOString()
      });
    }
    
    if (!userEmail) {
      return res.status(400).json({
        success: false,
        error: 'User email is required for personalized calendar management',
        timestamp: new Date().toISOString()
      });
    }
    
    console.log(`💬 Processing AI message for ${userEmail}: "${message}"`);
    
    // Check connection status
    const connectionStatus = await checkConnectionStatus(userEmail);
    
    if (connectionStatus.status === 'not_found') {
      return res.json({
        success: true,
        response: {
          message: `Hi! To manage your Google Calendar with AI, I need to connect to your account first. Please use the "Setup Connection" button to authenticate with Google Calendar through Composio.`,
          needsConnection: true,
          userEmail: userEmail
        },
        timestamp: new Date().toISOString()
      });
    }
    
    if (connectionStatus.status === 'pending') {
      const connectionData = userConnections.get(userEmail);
      return res.json({
        success: true,
        response: {
          message: `Hi! Your Google Calendar connection is pending. Please complete the authentication process using the provided link.`,
          needsConnection: true,
          redirectUrl: connectionData?.redirectUrl,
          userEmail: userEmail
        },
        timestamp: new Date().toISOString()
      });
    }
    
    if (connectionStatus.status === 'error') {
      return res.json({
        success: true,
        response: {
          message: `There's an issue with your Google Calendar connection: ${connectionStatus.message}. Please try reconnecting.`,
          needsConnection: true,
          userEmail: userEmail
        },
        timestamp: new Date().toISOString()
      });
    }
    
    // Get user-specific tools
    const tools = await getUserTools(userEmail);
    
    // Build context for the AI
    const contextInfo = [];
    if (context?.currentDate) {
      contextInfo.push(`Current date: ${context.currentDate}`);
    }
    if (context?.events && context.events.length > 0) {
      const todayEvents = context.events.filter(e => 
        e.date === context.currentDate?.split('T')[0]
      );
      if (todayEvents.length > 0) {
        contextInfo.push(`Today's events: ${todayEvents.map(e => `${e.startTime} - ${e.title}`).join(', ')}`);
      }
    }
    if (context?.preferences?.focusAreas) {
      contextInfo.push(`User's focus areas: ${context.preferences.focusAreas.join(', ')}`);
    }
    
    const systemContext = contextInfo.length > 0 ? contextInfo.join('\n') : '';
    
    // Create enhanced prompt for calendar management
    const enhancedPrompt = `You are a personal AI calendar assistant for ${userEmail}. 
    
${systemContext ? `Context:\n${systemContext}\n\n` : ''}

User request: "${message}"

You have access to Google Calendar tools to help manage ${userEmail}'s calendar. You can:
- Create calendar events
- List existing events  
- Update events
- Delete events
- Quick add events using natural language

Please help ${userEmail} with their calendar request. If they want to schedule something, use the appropriate calendar tools. Always be helpful and confirm what actions you're taking.

Important: When creating events, always include specific details like:
- Clear event title
- Specific date and time
- Duration or end time
- Any relevant description

Be conversational and friendly in your responses.`;
    
    console.log(`🤖 Sending request to OpenAI for ${userEmail} with ${tools ? Object.keys(tools).length : 0} tools`);
    
    // Generate response using OpenAI with Composio tools
    const output = await generateText({
      model: openai("gpt-4o"),
      tools: tools,
      prompt: enhancedPrompt,
      maxToolRoundtrips: 5,
    });
    
    // Generate a user-friendly summary
    const finalOutput = await generateText({
      model: openai("gpt-4o"),
      prompt: `Based on these calendar operations for ${userEmail}:
      
Tool calls: ${JSON.stringify(output.toolCalls)}
Results: ${JSON.stringify(output.toolResults)}

Provide a friendly, conversational summary of what was accomplished for ${userEmail}. If calendar events were created, updated, or managed, mention the specific details. If there were any issues, explain them clearly. Keep the tone helpful and personal.

If no calendar operations were performed, just provide a helpful response to their message.`,
      maxToolRoundtrips: 1,
    });
    
    console.log(`✅ Generated AI response for ${userEmail}`);
    
    res.json({
      success: true,
      response: {
        message: finalOutput.text,
        toolCalls: output.toolCalls,
        toolResults: output.toolResults,
        userEmail: userEmail
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error processing AI message:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

// Get user connections
app.get('/api/composio/connections', async (req, res) => {
  try {
    const connections = Array.from(userConnections.entries()).map(([userEmail, conn]) => ({
      userEmail: userEmail,
      entityId: conn.entityId,
      connectionId: conn.connectionId,
      status: conn.status,
      connectedAt: conn.connectedAt || conn.createdAt,
      redirectUrl: conn.redirectUrl
    }));
    
    res.json({
      success: true,
      connections,
      userCount: userConnections.size,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Failed to get connections:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

// Test connection for user
app.post('/api/composio/test-connection', async (req, res) => {
  try {
    const { userEmail } = req.body;
    
    if (!userEmail) {
      return res.status(400).json({
        success: false,
        error: 'userEmail is required for connection test',
        timestamp: new Date().toISOString()
      });
    }
    
    console.log(`🧪 Testing connection for user: ${userEmail}`);
    
    const connectionStatus = await checkConnectionStatus(userEmail);
    const connectionData = userConnections.get(userEmail);
    const entityId = userEntities.get(userEmail);
    
    if (connectionStatus.status === 'active') {
      const testResult = {
        status: 'success',
        message: `Connection test successful for ${userEmail}`,
        userEmail: userEmail,
        entityId: entityId,
        connectionId: connectionData?.connectionId,
        connectionStatus: connectionStatus.status,
        toolsAvailable: connectionStatus.toolsAvailable || 0,
        features: {
          googleCalendarIntegration: 'active',
          composioTools: 'available',
          openaiIntegration: 'active',
          userSpecificEntity: 'enabled'
        },
        timestamp: new Date().toISOString()
      };
      
      res.json({
        success: true,
        testResult,
        timestamp: new Date().toISOString()
      });
    } else {
      res.json({
        success: false,
        error: `Connection test failed for ${userEmail}: ${connectionStatus.message}`,
        userEmail,
        connectionData,
        connectionStatus: connectionStatus.status,
        timestamp: new Date().toISOString()
      });
    }
    
  } catch (error) {
    console.error('❌ Connection test failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

// Service statistics
app.get('/api/stats', async (req, res) => {
  try {
    const stats = {
      userConnections: userConnections.size,
      userEntities: userEntities.size,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      nodeVersion: process.version,
      platform: process.platform,
      services: {
        openai: process.env.OPENAI_API_KEY ? 'configured' : 'missing',
        composio: process.env.COMPOSIO_API_KEY ? 'configured' : 'missing'
      },
      userDetails: {
        connectedUsers: Array.from(userConnections.keys()),
        entityUsers: Array.from(userEntities.keys()),
        userEntityMapping: Array.from(userEntities.entries()).map(([email, entityId]) => ({
          userEmail: email,
          entityId: entityId,
          connectionStatus: userConnections.get(email)?.status || 'unknown'
        }))
      },
      timestamp: new Date().toISOString()
    };
    
    res.json({
      success: true,
      stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Failed to get service stats:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('🚨 Server Error:', error);
  res.status(500).json({
    error: 'Internal server error',
    message: error.message,
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.originalUrl,
    availableEndpoints: [
      'GET /',
      'GET /api/health',
      'POST /api/composio/setup-connection',
      'POST /api/ai/send-message',
      'GET /api/composio/connections',
      'POST /api/composio/test-connection',
      'GET /api/stats'
    ],
    note: 'This is an API server with Composio + OpenAI integration. Visit http://localhost:5173 for the client application.',
    userConnections: userConnections.size,
    userEntities: userEntities.size,
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  console.log('🚀 SmartPlan Server with Composio + OpenAI started successfully!');
  console.log(`📡 Server running on port ${PORT}`);
  console.log(`🌐 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🔗 CORS enabled for: ${process.env.CLIENT_URL || 'http://localhost:5173'}`);
  console.log('');
  console.log('🔧 Configuration:');
  console.log(`  - OpenAI API Key: ${process.env.OPENAI_API_KEY ? '✅ Configured' : '❌ Missing'}`);
  console.log(`  - Composio API Key: ${process.env.COMPOSIO_API_KEY ? '✅ Configured' : '❌ Missing'}`);
  console.log('');
  console.log('📋 Available endpoints:');
  console.log('  GET  /');
  console.log('  GET  /api/health');
  console.log('  POST /api/composio/setup-connection');
  console.log('  POST /api/ai/send-message');
  console.log('  GET  /api/composio/connections');
  console.log('  POST /api/composio/test-connection');
  console.log('  GET  /api/stats');
  console.log('');
  console.log('✅ Server is ready to handle requests!');
  console.log('🤖 Each authenticated user gets their own Composio entity and Google Calendar connection.');
  console.log('🔐 User-specific calendar management with complete data isolation.');
  console.log('🎯 OpenAI + Composio integration for intelligent calendar operations.');
  console.log('');
  console.log('🎯 To use the application:');
  console.log('   👉 Visit: http://localhost:5173');
  console.log('   📱 This server (port 3001) is the API backend');
  console.log('   🖥️  The client app (port 5173) is the user interface');
  console.log('   👤 Each authenticated user gets their own Composio entity');
});

export default app;