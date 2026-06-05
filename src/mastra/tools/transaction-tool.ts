import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import * as queries from '../db/queries.js';

export const transactionTool = createTool({
  id: 'query_transactions',
  description: 'Query transactions with flexible filters for date ranges, categories, merchants, and compute aggregates like totals, averages, and rankings',
  inputSchema: z.object({
    startDate: z.string().optional().describe('Start date in YYYY-MM-DD format'),
    endDate: z.string().optional().describe('End date in YYYY-MM-DD format'),
    category: z.string().optional().describe('Filter by category (e.g., food, travel, health, transfer)'),
    merchant: z.string().optional().describe('Filter by merchant name (supports partial match)'),
    aggregation: z.enum(['sum', 'count', 'avg', 'top_merchants', 'by_category', 'monthly']).optional()
      .describe('Type of aggregation: sum (total spend), count (number of transactions), avg (average amount), top_merchants (ranked merchants), by_category (spend by category), monthly (by month)'),
    limit: z.number().optional().describe('Limit number of results (default 20)'),
    excludeTransfers: z.boolean().optional().describe('Exclude transfer category transactions (default true)'),
  }),
  execute: async (input) => {
    try {
      const limit = input.limit || 20;
      
      // Exclude transfers by default
      const excludeTransfers = input.excludeTransfers !== false;

      if (input.aggregation === 'sum') {
        // Get total spend
        const total = await queries.getNetSpend(input.startDate, input.endDate);
        return {
          type: 'aggregate',
          metric: 'total_spend',
          value: parseFloat(total.toFixed(2)),
          currency: 'INR',
          period: {
            startDate: input.startDate,
            endDate: input.endDate,
          },
        };
      }

      if (input.aggregation === 'by_category') {
        // Get spend by category
        let results = await queries.getTotalSpendByCategory(input.startDate, input.endDate);
        if (excludeTransfers) {
          results = results.filter((r: any) => r.category !== 'transfer');
        }
        return {
          type: 'aggregation',
          metric: 'spend_by_category',
          data: results.slice(0, limit).map((r: any) => ({
            category: r.category,
            amount: parseFloat(r.total.toFixed(2)),
          })),
        };
      }

      if (input.aggregation === 'top_merchants') {
        // Get top merchants
        let results = await queries.getTotalSpendByMerchant(input.startDate, input.endDate);
        if (excludeTransfers) {
          results = results.filter((r: any) => {
            const txns = queries.getTransactionsByMerchant(r.merchant, input.startDate, input.endDate);
            return txns;
          });
        }
        return {
          type: 'ranking',
          metric: 'top_merchants',
          data: results.slice(0, limit).map((r: any, idx: number) => ({
            rank: idx + 1,
            merchant: r.merchant,
            amount: parseFloat(r.total.toFixed(2)),
          })),
        };
      }

      if (input.aggregation === 'monthly') {
        // Get monthly spend
        const month_data: any = {};
        let transactions = await queries.getTransactionsByDateRange(
          input.startDate || '2024-01-01',
          input.endDate || '2025-12-31'
        );

        if (input.category) {
          transactions = transactions.filter((t: any) => t.category === input.category);
        }
        if (input.merchant) {
          transactions = transactions.filter((t: any) =>
            t.merchant.toUpperCase().includes(input.merchant!.toUpperCase())
          );
        }
        if (excludeTransfers) {
          transactions = transactions.filter((t: any) => t.category !== 'transfer');
        }

        for (const txn of transactions) {
          const month = txn.date.substring(0, 7); // YYYY-MM
          if (!month_data[month]) {
            month_data[month] = 0;
          }
          month_data[month] += txn.amount;
        }

        return {
          type: 'time_series',
          metric: 'monthly_spend',
          data: Object.entries(month_data)
            .map(([month, amount]) => ({
              month,
              amount: parseFloat((amount as number).toFixed(2)),
            }))
            .sort((a, b) => a.month.localeCompare(b.month)),
        };
      }

      // Default: return filtered transactions
      let transactions = [];

      if (input.merchant) {
        transactions = await queries.getTransactionsByMerchant(
          input.merchant,
          input.startDate,
          input.endDate
        );
      } else if (input.category) {
        transactions = await queries.getTransactionsByCategory(
          input.category,
          input.startDate,
          input.endDate
        );
      } else {
        transactions = await queries.getTransactionsByDateRange(
          input.startDate || '2024-01-01',
          input.endDate || '2025-12-31'
        );
      }

      if (excludeTransfers) {
        transactions = transactions.filter((t: any) => t.category !== 'transfer');
      }

      return {
        type: 'transactions',
        count: transactions.length,
        data: transactions.slice(0, limit).map((t: any) => ({
          id: t.id,
          date: t.date,
          merchant: t.merchant,
          category: t.category,
          amount: parseFloat(t.amount.toFixed(2)),
          memo: t.memo,
        })),
      };
    } catch (error: any) {
      return {
        type: 'error',
        message: error.message,
        code: 'QUERY_FAILED',
      };
    }
  },
});
