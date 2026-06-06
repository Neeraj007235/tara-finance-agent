import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import * as queries from '../db/queries.js';

export const portfolioTool = createTool({
  id: 'query_portfolio',
  description: 'Query portfolio holdings and compute realized returns on holdings based on current NAV vs purchase cost',
  inputSchema: z.object({
    metric: z.enum(['portfolio_value', 'holding_return', 'all_holdings']).optional()
      .describe('Type of metric: portfolio_value (total worth and gain), holding_return (return on specific fund), all_holdings (list all holdings)'),
    fundId: z.string().optional().describe('Fund ID to calculate return on'),
    fundName: z.string().optional().describe('Fund name to calculate return on'),
  }),
  execute: async (input: any) => {
    try {
      const metric = input.metric || 'portfolio_value';

      if (metric === 'all_holdings') {
        const holdings = await queries.getAllHoldings();
        if (holdings.length === 0) {
          return {
            type: 'no_holdings',
            message: 'No holdings found in portfolio',
            count: 0,
          };
        }

        // Enrich with current NAV
        const enrichedHoldings = await Promise.all(
          holdings.map(async (h: any) => {
            const latestNav = await queries.getLatestFundNav(h.fund_id);
            const currentNav = latestNav ? Number(latestNav.value) : null;
            const units = Number(h.units);
            const purchaseNav = Number(h.purchase_nav);
            const purchaseCost = units * purchaseNav;
            const currentValue = currentNav ? units * currentNav : null;
            const gain = currentValue ? currentValue - purchaseCost : null;
            const returnPercentage = currentValue && purchaseCost 
              ? ((currentValue - purchaseCost) / purchaseCost) * 100 
              : null;

            return {
              fundId: h.fund_id,
              fundName: h.fund_name,
              units: parseFloat(units.toFixed(4)),
              purchaseDate: h.purchase_date,
              purchaseNav: parseFloat(purchaseNav.toFixed(4)),
              purchaseCost: parseFloat(purchaseCost.toFixed(2)),
              currentNav: currentNav ? parseFloat(currentNav.toFixed(4)) : null,
              currentValue: currentValue ? parseFloat(currentValue.toFixed(2)) : null,
              gain: gain ? parseFloat(gain.toFixed(2)) : null,
              returnPercentage: returnPercentage ? parseFloat(returnPercentage.toFixed(2)) : null,
            };
          })
        );

        return {
          type: 'holdings_list',
          count: enrichedHoldings.length,
          holdings: enrichedHoldings,
        };
      }

      if (metric === 'portfolio_value') {
        const holdings = await queries.getAllHoldings();
        if (holdings.length === 0) {
          return {
            type: 'error',
            message: 'No holdings found in portfolio',
            code: 'NO_HOLDINGS',
          };
        }

        let totalPurchaseCost = 0;
        let totalCurrentValue = 0;

        const enrichedHoldings = await Promise.all(
          holdings.map(async (h: any) => {
            const latestNav = await queries.getLatestFundNav(h.fund_id);
            const currentNav = latestNav ? Number(latestNav.value) : 0;
            const units = Number(h.units);
            const purchaseNav = Number(h.purchase_nav);
            const purchaseCost = units * purchaseNav;
            const currentValue = units * currentNav;

            totalPurchaseCost += purchaseCost;
            totalCurrentValue += currentValue;

            return {
              fundName: h.fund_name,
              units: parseFloat(units.toFixed(4)),
              purchaseNav: parseFloat(purchaseNav.toFixed(4)),
              currentNav: parseFloat(currentNav.toFixed(4)),
              purchaseCost: parseFloat(purchaseCost.toFixed(2)),
              currentValue: parseFloat(currentValue.toFixed(2)),
            };
          })
        );

        const totalGain = totalCurrentValue - totalPurchaseCost;
        const totalReturnPercentage = (totalGain / totalPurchaseCost) * 100;

        return {
          type: 'portfolio_summary',
          asOfDate: new Date().toISOString().split('T')[0],
          totalPurchaseCost: parseFloat(totalPurchaseCost.toFixed(2)),
          totalCurrentValue: parseFloat(totalCurrentValue.toFixed(2)),
          totalGain: parseFloat(totalGain.toFixed(2)),
          totalReturnPercentage: parseFloat(totalReturnPercentage.toFixed(2)),
          isPositive: totalGain >= 0,
          holdings: enrichedHoldings,
        };
      }

      if (metric === 'holding_return') {
        // Find the holding
        let holding = null;

        if (input.fundId) {
          holding = await queries.getHolding(input.fundId);
        } else if (input.fundName) {
          const allHoldings = await queries.getAllHoldings();
          holding = allHoldings.find((h: any) =>
            h.fund_name.toUpperCase().includes(input.fundName!.toUpperCase())
          );
        }

        if (!holding) {
          return {
            type: 'error',
            message: 'Holding not found. Please check fund ID or name.',
            code: 'HOLDING_NOT_FOUND',
          };
        }

        const latestNav = await queries.getLatestFundNav(holding.fund_id);
        if (!latestNav) {
          return {
            type: 'error',
            message: `No current NAV data found for ${holding.fund_name}`,
            code: 'NO_NAV_DATA',
          };
        }

        const units = Number(holding.units);
        const purchaseNav = Number(holding.purchase_nav);
        const purchaseCost = units * purchaseNav;
        const currentValue = units * Number(latestNav.value);
        const gain = currentValue - purchaseCost;
        const returnPercentage = (gain / purchaseCost) * 100;

        return {
          type: 'holding_return',
          fundId: holding.fund_id,
          fundName: holding.fund_name,
          purchaseDate: holding.purchase_date,
          purchaseNav: parseFloat(purchaseNav.toFixed(4)),
          currentNav: parseFloat(Number(latestNav.value).toFixed(4)),
          units: parseFloat(units.toFixed(4)),
          purchaseCost: parseFloat(purchaseCost.toFixed(2)),
          currentValue: parseFloat(currentValue.toFixed(2)),
          gain: parseFloat(gain.toFixed(2)),
          returnPercentage: parseFloat(returnPercentage.toFixed(2)),
          isPositive: gain >= 0,
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
