import { Request, Response } from 'express';
import { mastra } from '../index.js';
import { initializeDatabase } from '../db/connection.js';
import { randomUUID } from 'crypto';

// Request/response logging
interface RequestLog {
  requestId: string;
  timestamp: string;
  question: string;
  toolsCalled: string[];
  status: 'success' | 'error';
  latency: number;
  error?: string;
}

const requestLogs: RequestLog[] = [];

async function logRequest(log: RequestLog) {
  requestLogs.push(log);
  // Also log to console for observability
  console.log(JSON.stringify(log, null, 2));
}

export async function askHandler(req: Request, res: Response) {
  const requestId = randomUUID();
  const startTime = Date.now();

  try {
    // Validate input
    const { question } = req.body;
    if (!question || typeof question !== 'string') {
      return res.status(400).json({
        error: 'Invalid request: question must be a non-empty string',
      });
    }

    // Initialize DB if not already done
    try {
      await initializeDatabase();
    } catch (err) {
      // Database might already be initialized
    }
  
    const toolsCalled: string[] = [];
    let response: any;

    // Try API with quota error handling
      const agent = mastra.getAgent("taraAgent");

      if (!agent) {
        throw new Error("taraAgent not found in Mastra registry");
      }

      response = await agent.generate(
        [{ role: 'user', content: question }],
        {
          toolChoice: 'required',
        }
      );

    const latency = Date.now() - startTime;
    
    // DEBUG: Log full response structure
    console.log('\n=== AGENT RESPONSE DEBUG ===');
    console.log('response.text:', response.text);
    console.log('response.toolCalls length:', Array.isArray(response.toolCalls) ? response.toolCalls.length : 'not array');
    if (Array.isArray(response.toolCalls)) {
      response.toolCalls.forEach((call: any, idx: number) => {
        console.log(`\ntoolCall[${idx}]:`);
        console.log('  - toolName:', call.payload?.toolName);
        console.log('  - output type:', call.payload?.output?.type);
        console.log('  - full output:', JSON.stringify(call.payload?.output, null, 2));
      });
    }
    console.log('=== END DEBUG ===\n');

    let answer = response.text || '';

    // If model didn't produce final text, try to synthesize an answer from tool outputs
    if (!answer && Array.isArray(response.toolCalls) && response.toolCalls.length > 0) {
      try {
        const outputs = response.toolCalls
          .map((c: any) => c.payload?.output)
          .filter((o: any) => o && typeof o === 'object');

        // Helper: sum amounts in a transactions-style output
        const sumTransactions = (txOut: any) => {
          if (!txOut || !Array.isArray(txOut.data)) return 0;
          return txOut.data.reduce((s: number, t: any) => s + (t.amount || 0), 0);
        };

        // Prefer aggregate total_spend
        const agg = outputs.find((o: any) => o.type === 'aggregate' && o.metric === 'total_spend');
        if (agg && typeof agg.value === 'number') {
          answer = `Total spend between ${agg.period?.startDate || 'start'} and ${agg.period?.endDate || 'end'}: ${agg.currency || ''} ${agg.value.toFixed(2)}`;
        } else {
          // Try transactions/time_series outputs and sum amounts
          let total = 0;
          for (const o of outputs) {
            if (o.type === 'time_series' && Array.isArray(o.data)) {
              total += o.data.reduce((s: number, p: any) => s + (p.amount || 0), 0);
            } else if (o.type === 'transactions') {
              total += sumTransactions(o);
            } else if (o.type === 'aggregation' && Array.isArray(o.data)) {
              // spend_by_category entries
              total += o.data.reduce((s: number, r: any) => s + (r.amount || 0), 0);
            }
          }
          if (total > 0) {
            answer = `Computed total from tool outputs: ${total.toFixed(2)}`;
          }
        }
      } catch (e: any) {
        // ignore synthesis errors
      }

      if (!answer) {
        answer = "I couldn't find an answer to your question. Please try rephrasing it.";
      }
    }

    const responseToolCalls = Array.isArray(response.toolCalls)
      ? response.toolCalls.map((call: any) => call.payload?.toolName).filter(Boolean)
      : [];

    toolsCalled.push(...responseToolCalls);

    // Log the successful request
    await logRequest({
      requestId,
      timestamp: new Date().toISOString(),
      question,
      toolsCalled,
      status: 'success',
      latency,
    });

    return res.json({
      answer,
      requestId,
      toolsCalled,
      latency,
    });
  } catch (error: any) {
    const latency = Date.now() - startTime;

    console.error('Error in askHandler:', error);

    // Log the failed request
    await logRequest({
      requestId,
      timestamp: new Date().toISOString(),
      question: req.body?.question || 'unknown',
      toolsCalled: [],
      status: 'error',
      latency,
      error: error.message,
    });

    return res.status(500).json({
      error: 'Failed to process question',
      message: error.message,
      requestId,
    });
  }
}

export function logsHandler(req: Request, res: Response) {
  // Return recent logs for observability
  const limit = parseInt(req.query.limit as string) || 20;
  return res.json({
    totalLogs: requestLogs.length,
    recentLogs: requestLogs.slice(-limit),
  });
}
