import dotenv from 'dotenv';

dotenv.config();

export const agentConfig = {
  apiUrl: process.env.MCP_API_URL || '',
  apiToken: process.env.MCP_API_TOKEN || '',
  websocketUrl: process.env.MCP_WEBSOCKET_URL || '',
  enabled: Boolean(process.env.MCP_API_TOKEN),
};
