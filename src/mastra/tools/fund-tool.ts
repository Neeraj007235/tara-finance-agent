import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { query, queryOne } from '../db/connection.js';
import * as queries from '../db/queries.js';

export const fundTool = createTool({
  id: 'query_funds',
  description: 'Query fund information, NAV history, and compute period returns between two dates',
  inputSchema: z.object({
    fundId: z.string().optional().describe('Fund ID to query'),
    fundName: z.string().optional().describe('Fund name pattern to search'),
    startDate: z.string().describe('Start date in YYYY-MM-DD format for period return calculation'),
    endDate: z.string().describe('End date in YYYY-MM-DD format for period return calculation'),
    metric: z.enum(['period_return', 'nav_history', 'current_nav', 'all_funds']).optional()
      .describe('Type of metric: period_return (NAV change %), nav_history (historical NAV), current_nav (latest NAV), all_funds (list all funds)'),
  }),
  execute: async (input) => {
    try {
      // Get all funds to search if needed
      const allFunds = await query('SELECT * FROM funds ORDER BY name');

      let targetFund = null;

      if (input.fundId) {
        targetFund = await queryOne('SELECT * FROM funds WHERE id = $1', [input.fundId]);
        if (!targetFund) {
          return {
            type: 'error',
            message: `Fund with ID ${input.fundId} not found`,
            code: 'FUND_NOT_FOUND',
          };
        }
      } else if (input.fundName) {
        // Search by name
        const matching = allFunds.filter((f: any) =>
          f.name.toUpperCase().includes(input.fundName!.toUpperCase())
        );
        if (matching.length === 0) {
          return {
            type: 'error',
            message: `No funds found matching "${input.fundName}"`,
            code: 'FUND_NOT_FOUND',
          };
        }
        if (matching.length > 1) {
          return {
            type: 'ambiguous',
            message: 'Multiple funds match this name. Please specify fund ID.',
            matches: matching.map((f: any) => ({ id: f.id, name: f.name })),
          };
        }
        targetFund = matching[0];
      }

      // If no metric specified and we have a fund, calculate period return
      const metric = input.metric || (targetFund ? 'period_return' : 'all_funds');

      if (metric === 'all_funds') {
        return {
          type: 'fund_list',
          count: allFunds.length,
          funds: allFunds.map((f: any) => ({
            id: f.id,
            name: f.name,
            category: f.category,
          })),
        };
      }

      if (metric === 'current_nav') {
        if (!targetFund) {
          return {
            type: 'error',
            message: 'Please specify fundId or fundName to get current NAV',
            code: 'MISSING_PARAM',
          };
        }

        const latestNav = await queries.getLatestFundNav(targetFund.id);
        if (!latestNav) {
          return {
            type: 'error',
            message: `No NAV data found for fund ${targetFund.name}`,
            code: 'NO_DATA',
          };
        }

        return {
          type: 'current_nav',
          fundId: targetFund.id,
          fundName: targetFund.name,
          asOfDate: latestNav.date,
          nav: parseFloat(latestNav.value.toFixed(4)),
        };
      }

      if (metric === 'nav_history') {
        if (!targetFund) {
          return {
            type: 'error',
            message: 'Please specify fundId or fundName to get NAV history',
            code: 'MISSING_PARAM',
          };
        }

        const navHistory = await queries.getFundNavHistory(
          targetFund.id,
          input.startDate,
          input.endDate
        );

        if (navHistory.length === 0) {
          return {
            type: 'error',
            message: `No NAV data found for ${targetFund.name} in the specified period`,
            code: 'NO_DATA',
          };
        }

        return {
          type: 'nav_history',
          fundId: targetFund.id,
          fundName: targetFund.name,
          period: { startDate: input.startDate, endDate: input.endDate },
          navPoints: navHistory.map((nav: any) => ({
            date: nav.date,
            value: parseFloat(nav.value.toFixed(4)),
          })),
        };
      }

      if (metric === 'period_return') {
        if (!targetFund) {
          return {
            type: 'error',
            message: 'Please specify fundId or fundName to calculate period return',
            code: 'MISSING_PARAM',
          };
        }

        const periodReturn = await queries.getFundPeriodReturn(
          targetFund.id,
          input.startDate,
          input.endDate
        );

        if (!periodReturn) {
          return {
            type: 'error',
            message: `Insufficient NAV data for ${targetFund.name} in the specified period`,
            code: 'NO_DATA',
          };
        }

        return {
          type: 'period_return',
          fundId: targetFund.id,
          fundName: targetFund.name,
          category: targetFund.category,
          period: { startDate: input.startDate, endDate: input.endDate },
          startNav: parseFloat(periodReturn.startNav.toFixed(4)),
          endNav: parseFloat(periodReturn.endNav.toFixed(4)),
          returnPercentage: parseFloat(periodReturn.returnPercentage.toFixed(2)),
          isPositive: periodReturn.returnPercentage >= 0,
        };
      }

      return {
        type: 'error',
        message: 'Invalid metric type',
        code: 'INVALID_METRIC',
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
