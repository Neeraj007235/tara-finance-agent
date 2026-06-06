import { query, queryOne } from './connection.js';

export async function getTransactionsByDateRange(startDate: string, endDate: string) {
  return query(
    `SELECT * FROM transactions 
     WHERE date >= $1 AND date <= $2 
     ORDER BY date DESC`,
    [startDate, endDate]
  );
}

export async function getTransactionsByCategory(
  category: string,
  startDate?: string,
  endDate?: string
) {
  let sql = `SELECT * FROM transactions WHERE category = $1`;
  const params: any[] = [category];

  if (startDate) {
    sql += ` AND date >= $${params.length + 1}`;
    params.push(startDate);
  }
  if (endDate) {
    sql += ` AND date <= $${params.length + 1}`;
    params.push(endDate);
  }

  sql += ` ORDER BY date DESC`;
  return query(sql, params);
}

export async function getTransactionsByMerchant(
  merchant: string,
  startDate?: string,
  endDate?: string
) {
  let sql = `SELECT * FROM transactions 
             WHERE UPPER(merchant) LIKE UPPER($1)`;
  const params: any[] = [`%${merchant}%`];

  if (startDate) {
    sql += ` AND date >= $${params.length + 1}`;
    params.push(startDate);
  }
  if (endDate) {
    sql += ` AND date <= $${params.length + 1}`;
    params.push(endDate);
  }

  sql += ` ORDER BY date DESC`;
  return query(sql, params);
}

export async function getTotalSpendByCategory(startDate?: string, endDate?: string) {
  let sql = `SELECT category, SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as total
             FROM transactions`;
  const params: any[] = [];

  let whereAdded = false;
  if (startDate) {
    sql += ` WHERE date >= $${params.length + 1}`;
    params.push(startDate);
    whereAdded = true;
  }
  if (endDate) {
    sql += whereAdded ? ` AND date <= $${params.length + 1}` : ` WHERE date <= $${params.length + 1}`;
    params.push(endDate);
  }

  sql += ` GROUP BY category ORDER BY total DESC`;
  return query(sql, params);
}

export async function getTotalSpendByMerchant(startDate?: string, endDate?: string) {
  let sql = `SELECT merchant, SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as total
             FROM transactions`;
  const params: any[] = [];

  let whereAdded = false;
  if (startDate) {
    sql += ` WHERE date >= $${params.length + 1}`;
    params.push(startDate);
    whereAdded = true;
  }
  if (endDate) {
    sql += whereAdded ? ` AND date <= $${params.length + 1}` : ` WHERE date <= $${params.length + 1}`;
    params.push(endDate);
  }

  sql += ` GROUP BY merchant ORDER BY total DESC`;
  return query(sql, params);
}

export async function getNetSpend(
  startDate?: string, 
  endDate?: string, 
  category?: string, 
  merchant?: string, 
  excludeTransfers: boolean = true
) {
  let sql = `SELECT SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as total FROM transactions WHERE 1=1`;
  const params: any[] = [];

  if (startDate) {
    sql += ` AND date >= $${params.length + 1}`;
    params.push(startDate);
  }
  if (endDate) {
    sql += ` AND date <= $${params.length + 1}`;
    params.push(endDate);
  }
  if (category) {
    sql += ` AND category = $${params.length + 1}`;
    params.push(category);
  }
  if (merchant) {
    sql += ` AND UPPER(merchant) LIKE UPPER($${params.length + 1})`;
    params.push(`%${merchant}%`);
  }
  if (excludeTransfers) {
    sql += ` AND category != 'transfer'`;
  }

  const result = await queryOne(sql, params);
  return result?.total || 0;
}

export async function getLatestFundNav(fundId: string) {
  return queryOne(
    `SELECT * FROM fund_navs 
     WHERE fund_id = $1 
     ORDER BY date DESC LIMIT 1`,
    [fundId]
  );
}

export async function getFundNavHistory(fundId: string, startDate: string, endDate: string) {
  return query(
    `SELECT * FROM fund_navs 
     WHERE fund_id = $1 AND date >= $2 AND date <= $3
     ORDER BY date ASC`,
    [fundId, startDate, endDate]
  );
}

export async function getFundPeriodReturn(fundId: string, startDate: string, endDate: string) {
  const navs = await getFundNavHistory(fundId, startDate, endDate);
  if (navs.length < 2) return null;

  const startNav = navs[0].value;
  const endNav = navs[navs.length - 1].value;
  const returnValue = ((endNav - startNav) / startNav) * 100;

  return {
    startDate,
    endDate,
    startNav,
    endNav,
    returnPercentage: returnValue,
  };
}

export async function getAllHoldings() {
  return query(`SELECT * FROM holdings ORDER BY fund_name`);
}

export async function getHolding(fundId: string) {
  return queryOne(
    `SELECT * FROM holdings WHERE fund_id = $1`,
    [fundId]
  );
}

export async function getPortfolioValue() {
  const holdings = await getAllHoldings();
  const result = await query(
    `SELECT h.*, fn.value as current_nav
     FROM holdings h
     LEFT JOIN LATERAL (
       SELECT value FROM fund_navs 
       WHERE fund_id = h.fund_id
       ORDER BY date DESC LIMIT 1
     ) fn ON true`
  );

  return result;
}

export async function getRecurringTransactions(minAmount: number = 100) {
  // Simple heuristic: transactions with same merchant within 30 day windows
  return query(
    `SELECT merchant, 
            COUNT(*) as transaction_count,
            AVG(amount) as avg_amount,
            STDDEV_POP(amount) as stddev_amount
     FROM transactions
     WHERE amount > 0 AND category != 'transfer'
     GROUP BY merchant
     HAVING COUNT(*) >= 2
     ORDER BY transaction_count DESC`
  );
}

export async function getTransactionsByDateRangeAndCategory(
  startDate: string,
  endDate: string,
  category: string
) {
  return query(
    `SELECT * FROM transactions
     WHERE date >= $1 AND date <= $2 AND category = $3
     ORDER BY date DESC`,
    [startDate, endDate, category]
  );
}

export async function getMonthlyCategorySpend(year: number, month: number) {
  return query(
    `SELECT category, SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as total
     FROM transactions
     WHERE EXTRACT(YEAR FROM date) = $1 AND EXTRACT(MONTH FROM date) = $2
     GROUP BY category
     ORDER BY total DESC`,
    [year, month]
  );
}

export async function getCategorySpendComparison(
  category1: string,
  category2: string,
  startDate: string,
  endDate: string
) {
  const results = await query(
    `SELECT category, SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as total
     FROM transactions
     WHERE (category = $1 OR category = $2)
       AND date >= $3 AND date <= $4
     GROUP BY category`,
    [category1, category2, startDate, endDate]
  );

  return results;
}
