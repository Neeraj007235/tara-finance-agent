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
        [{ role: 'user', content: question }]
      );

    const latency = Date.now() - startTime;
    
    let answer = response.text || '';

    // Try different places for tool invocations and outputs!
    let toolInvocations: any[] = [];
    let outputs: any[] = [];
    
    // First, check all steps for toolResults or content with tool-result!
    if (Array.isArray(response.steps)) {
      for (const step of response.steps) {
        // Try step.toolResults first!
        if (step.toolResults && step.toolResults.length > 0) {
          toolInvocations = step.toolResults;
          outputs = step.toolResults.map((res: any) => res.payload?.output || res.output).filter(o => o);
          if (outputs.length > 0) {
            break;
          }
        }
        
        // Try step.content for tool-result objects!
        if (step.content && Array.isArray(step.content)) {
          const toolResultsFromContent = step.content.filter((c: any) => c.type === 'tool-result');
          if (toolResultsFromContent.length > 0) {
            toolInvocations = toolResultsFromContent;
            outputs = toolResultsFromContent.map((c: any) => c.output).filter(o => o);
            if (outputs.length > 0) {
              break;
            }
          }
        }
        
        // Try step.toolInvocations as a last resort!
        if (step.toolInvocations && step.toolInvocations.length > 0) {
          toolInvocations = step.toolInvocations;
          outputs = step.toolInvocations.map((inv: any) => inv.result).filter(o => o);
          if (outputs.length > 0) {
            break;
          }
        }
      }
    }

    // If no luck, try other places
    if (outputs.length === 0) {
      if (response.toolInvocations) {
        toolInvocations = response.toolInvocations;
        outputs = toolInvocations.map((inv: any) => inv.result).filter(o => o);
      } else if (response.steps?.[0]?.toolCalls) {
        toolInvocations = response.steps[0].toolCalls;
        outputs = toolInvocations.map((inv: any) => inv.result || inv.output).filter(o => o);
      } else if (response.toolCalls) {
        toolInvocations = response.toolCalls;
        outputs = toolInvocations.map((inv: any) => inv.payload?.output || inv.result).filter(o => o);
      }
    }
    
    // Unwrap outputs that are { type: 'json', value: ... }
    const unwrappedOutputs = outputs.map((o: any) => {
      if (o.type === 'json' && o.value !== undefined) {
        return o.value;
      }
      return o;
    });

    // ALWAYS try to synthesize an answer if we have outputs, even if LLM gave a text answer (to be safe)
    if (unwrappedOutputs.length > 0) {
      try {
        // Helper: sum amounts in a transactions-style output
        const sumTransactions = (txOut: any) => {
          if (!txOut || !Array.isArray(txOut.data)) return 0;
          return txOut.data.reduce((s: number, t: any) => s + (t.amount || 0), 0);
        };

        // Check various types of outputs
        const agg = unwrappedOutputs.find((o: any) => o.type === 'aggregate' && o.metric === 'total_spend');
        if (agg) {
          answer = `Total spend between ${agg.period?.startDate || 'start'} and ${agg.period?.endDate || 'end'}: ${agg.currency || ''} ${agg.value.toFixed(2)}`;
        } else if (unwrappedOutputs.some((o: any) => o.type === 'portfolio_summary')) {
          const summary = unwrappedOutputs.find((o: any) => o.type === 'portfolio_summary');
          answer = `Your portfolio total purchase cost: ${summary.totalPurchaseCost.toFixed(2)}, current value: ${summary.totalCurrentValue.toFixed(2)}, total gain: ${summary.totalGain.toFixed(2)} (${summary.totalReturnPercentage.toFixed(2)}%)`;
        } else if (unwrappedOutputs.some((o: any) => o.type === 'holdings_list')) {
          const list = unwrappedOutputs.find((o: any) => o.type === 'holdings_list');
          answer = `You have ${list.count} holdings in your portfolio.`;
        } else if (unwrappedOutputs.some((o: any) => o.type === 'period_return')) {
          const ret = unwrappedOutputs.find((o: any) => o.type === 'period_return');
          answer = `${ret.fundName} had a ${ret.isPositive ? 'gain' : 'loss'} of ${ret.returnPercentage.toFixed(2)}% between ${ret.period.startDate} and ${ret.period.endDate}`;
        } else if (unwrappedOutputs.some((o: any) => o.type === 'holding_return')) {
          const ret = unwrappedOutputs.find((o: any) => o.type === 'holding_return');
          answer = `Your holding in ${ret.fundName} has a ${ret.isPositive ? 'gain' : 'loss'} of ${ret.returnPercentage.toFixed(2)}%`;
        } else if (unwrappedOutputs.some((o: any) => o.type === 'fund_list')) {
          const list = unwrappedOutputs.find((o: any) => o.type === 'fund_list');
          answer = `There are ${list.count} funds available.`;
        } else {
          // Try transactions/time_series outputs and sum amounts
          let total = 0;
          for (const o of unwrappedOutputs) {
            if (typeof o === 'number') {
              total += o;
            } else if (o.type === 'time_series' && Array.isArray(o.data)) {
              total += o.data.reduce((s: number, p: any) => s + (p.amount || 0), 0);
            } else if (o.type === 'transactions') {
              total += sumTransactions(o);
            } else if (o.type === 'aggregation' && Array.isArray(o.data)) {
              total += o.data.reduce((s: number, r: any) => s + (r.amount || 0), 0);
            } else if (o.value !== undefined && typeof o.value === 'number') {
              total += o.value;
            }
          }
          answer = `Total computed: ${total.toFixed(2)}`;
        }
      } catch (e: any) {
        console.error('Error synthesizing answer:', e);
      }

      if (!answer) {
        answer = "I couldn't find an answer to your question. Please try rephrasing it.";
      }
    }

    const responseToolCalls = toolInvocations
      .map((inv: any) => inv.toolName || inv.name || inv.payload?.toolName).filter(Boolean);

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
