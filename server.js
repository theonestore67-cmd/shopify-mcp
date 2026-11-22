import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { createShopifyMcpServer } from './mcpServer.js';
import { shopify } from './shopify.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for Claude / ChatGPT web / remote clients
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// JSON body parser for incoming POST requests
app.use(express.json());

// Map to hold active SSE transports by sessionId
const transports = new Map();

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    shop: shopify.shop || 'not-configured',
    timestamp: new Date().toISOString(),
    active_sessions: transports.size,
  });
});

// SSE endpoint for Claude & ChatGPT MCP connection
app.get(['/sse', '/mcp'], async (req, res) => {
  console.log(`[MCP SSE] New incoming connection from ${req.ip}`);

  try {
    const transport = new SSEServerTransport('/messages', res);
    const mcpServer = createShopifyMcpServer();

    transports.set(transport.sessionId, transport);
    console.log(`[MCP SSE] Session created: ${transport.sessionId}`);

    transport.onclose = () => {
      console.log(`[MCP SSE] Session closed: ${transport.sessionId}`);
      transports.delete(transport.sessionId);
    };

    await mcpServer.connect(transport);
  } catch (err) {
    console.error('[MCP SSE] Error establishing SSE session:', err);
    if (!res.headersSent) {
      res.status(500).send('Failed to initialize SSE connection');
    }
  }
});

// Message endpoint where Claude POSTs tool requests
app.post('/messages', async (req, res) => {
  const sessionId = req.query.sessionId;

  if (!sessionId) {
    return res.status(400).send('Missing sessionId query parameter');
  }

  const transport = transports.get(sessionId);
  if (!transport) {
    return res.status(404).send(`Session not found: ${sessionId}`);
  }

  try {
    await transport.handlePostMessage(req, res, req.body);
  } catch (err) {
    console.error(`[MCP SSE] Error handling message for session ${sessionId}:`, err);
    if (!res.headersSent) {
      res.status(500).send('Internal Server Error');
    }
  }
});

app.listen(PORT, () => {
  console.log('====================================================');
  console.log(`🚀 Shopify MCP Server is running!`);
  console.log(`Local SSE URL   : http://localhost:${PORT}/sse`);
  console.log(`Health Check    : http://localhost:${PORT}/health`);
  console.log(`Target Store    : ${process.env.SHOPIFY_SHOP_DOMAIN || '(Check .env)'}`);
  console.log('====================================================');
  console.log('For Claude Developer / Remote connection:');
  console.log(`Expose port ${PORT} using Cloudflare Tunnel or ngrok to get an HTTPS URL.`);
  console.log('Example: cloudflared tunnel --url http://localhost:3000');
  console.log('Then paste https://<tunnel-domain>/sse into Claude.');
});
