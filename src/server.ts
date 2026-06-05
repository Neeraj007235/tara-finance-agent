import 'dotenv/config';
import express, { Express } from 'express';
import { askHandler, logsHandler } from './mastra/routes/ask.js';
import { initializeDatabase } from './mastra/db/connection.js';

const app: Express = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Main ask endpoint
app.post('/ask', askHandler);

// Logs endpoint for observability
app.get('/logs', logsHandler);

// Error handling middleware
app.use((err: any, req: any, res: any, next: any) => {
  console.error('Express error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
  });
});

// Initialize database and start server
async function start() {
  try {
    // Initialize database
    await initializeDatabase();
    console.log('Database initialized');

    app.listen(port, () => {
      console.log(`Tara Finance Agent listening on port ${port}`);
      console.log(`POST /ask - Ask Tara a finance question`);
      console.log(`GET /health - Health check`);
      console.log(`GET /logs - View request logs`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();

export default app;
