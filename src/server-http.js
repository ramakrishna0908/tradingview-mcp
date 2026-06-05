import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpServer } from './create-server.js';

const PORT = parseInt(process.env.MCP_HTTP_PORT || process.argv[2] || '3000');
const HOST = process.env.MCP_HTTP_HOST || '127.0.0.1';

// sessionId → StreamableHTTPServerTransport
const sessions = new Map();

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return undefined;
  try {
    return JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    return undefined;
  }
}

const httpServer = createServer(async (req, res) => {
  if (req.url !== '/mcp') {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found — MCP endpoint is /mcp');
    return;
  }

  try {
    const sessionId = req.headers['mcp-session-id'];

    if (req.method === 'POST') {
      const body = await readBody(req);

      if (!sessionId) {
        // New session: client sending initialize (or first request)
        const newId = randomUUID();
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => newId,
        });
        const mcpServer = createMcpServer();
        await mcpServer.connect(transport);
        sessions.set(newId, transport);
        transport.onclose = () => sessions.delete(newId);
        await transport.handleRequest(req, res, body);
      } else {
        const transport = sessions.get(sessionId);
        if (!transport) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Session not found');
          return;
        }
        await transport.handleRequest(req, res, body);
      }
    } else if (req.method === 'GET' || req.method === 'DELETE') {
      const transport = sessions.get(sessionId);
      if (!transport) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Session not found');
        return;
      }
      await transport.handleRequest(req, res, undefined);
    } else {
      res.writeHead(405, { Allow: 'GET, POST, DELETE' });
      res.end('Method not allowed');
    }
  } catch (err) {
    process.stderr.write(`MCP HTTP error: ${err.message}\n`);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal server error');
    }
  }
});

process.stderr.write('⚠  tradingview-mcp  |  Unofficial tool. Not affiliated with TradingView Inc. or Anthropic.\n');
process.stderr.write('   Ensure your usage complies with TradingView\'s Terms of Use.\n\n');

httpServer.listen(PORT, HOST, () => {
  process.stderr.write(`MCP HTTP server listening on http://${HOST}:${PORT}/mcp\n`);
});
