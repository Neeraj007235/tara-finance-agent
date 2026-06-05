import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const API_URL = process.env.API_URL || 'http://localhost:3000';

interface TestCase {
  name: string;
  question: string;
  expectedKeywords?: string[];
  checkFunction?: (answer: string) => boolean;
}

const testCases: TestCase[] = [
  {
    name: 'Single lookup - Spend on food',
    question: 'How much did I spend on food last month?',
    expectedKeywords: ['food', 'INR'],
  },
  {
    name: 'Date filtering - Spend in Q1 2025',
    question: 'What was my total spending in Q1 2025?',
    expectedKeywords: ['2025', 'INR'],
  },
  {
    name: 'Refunds handling - Spend after refunds',
    question: 'How much did I spend on groceries after refunds in February 2025?',
    expectedKeywords: ['groceries', 'February', 'INR'],
  },
  {
    name: 'Merchant aliases - Spending on Swiggy',
    question: 'How much did I spend on Swiggy, including Swiggy Instamart and SWIGGY orders?',
    expectedKeywords: ['Swiggy', 'INR'],
  },
  {
    name: 'Transfers exclusion - Actual spending Q1',
    question: 'Ignore transfers. What was my total actual spending in Q1 2025?',
    expectedKeywords: ['2025', 'INR'],
  },
  {
    name: 'Recurring subscriptions - Identify patterns',
    question: 'Which transactions look like recurring subscriptions?',
    expectedKeywords: ['recurring', 'subscription'],
  },
  {
    name: 'Category comparison - Food vs Travel',
    question: 'Compare my spending on food versus travel. Which grew faster?',
    expectedKeywords: ['food', 'travel', 'grew'],
  },
  {
    name: 'Ranking - Top merchants',
    question: 'What were my top 5 merchants by spending?',
    expectedKeywords: ['merchant', 'INR'],
  },
  {
    name: 'No data case - April 2025 rent',
    question: 'Do I have any data for rent in April 2025?',
    checkFunction: (answer) =>
      answer.toLowerCase().includes('no data') ||
      answer.toLowerCase().includes('not found') ||
      answer.toLowerCase().includes('no rent'),
  },
  {
    name: 'Fund period return - Single fund',
    question: 'What was Saffron Bluechip Equity Fund return from 2024-01-01 to 2025-01-01?',
    expectedKeywords: ['Saffron', 'return', '%'],
  },
  {
    name: 'Portfolio value - Holdings worth and returns',
    question: 'What is my portfolio worth today, and how much have I made on it?',
    expectedKeywords: ['portfolio', 'worth', 'INR'],
  },
  {
    name: 'Realized return on holding - Specific fund',
    question: 'What is my realized return on my Saffron Bluechip Equity Fund holding?',
    expectedKeywords: ['return', 'Saffron', 'gain'],
  },
];

async function runTests() {
  console.log('🧪 Running Tara Finance Agent Evaluation Tests\n');
  console.log(`Testing against: ${API_URL}\n`);

  let passed = 0;
  let failed = 0;
  const failedTests: string[] = [];

  for (const testCase of testCases) {
    try {
      console.log(`Testing: ${testCase.name}`);
      console.log(`Question: "${testCase.question}"`);

      const response = await axios.post(`${API_URL}/ask`, {
        question: testCase.question,
      });

      const answer = response.data.answer;

      if (!answer) {
        console.log(`❌ FAILED: No answer received\n`);
        failed++;
        failedTests.push(testCase.name);
        continue;
      }

      // Check response
      let testPassed = false;

      if (testCase.checkFunction) {
        testPassed = testCase.checkFunction(answer);
      } else if (testCase.expectedKeywords) {
        testPassed = testCase.expectedKeywords.every((keyword) =>
          answer.toLowerCase().includes(keyword.toLowerCase())
        );
      } else {
        testPassed = answer.length > 10; // Basic check: answer is substantial
      }

      if (testPassed) {
        console.log(`✅ PASSED`);
        console.log(`Answer: ${answer.substring(0, 100)}...\n`);
        passed++;
      } else {
        console.log(`❌ FAILED: Answer doesn't match expected criteria`);
        console.log(`Answer: ${answer}\n`);
        failed++;
        failedTests.push(testCase.name);
      }
    } catch (error: any) {
      console.log(`❌ FAILED: ${error.message}\n`);
      failed++;
      failedTests.push(testCase.name);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total Tests: ${testCases.length}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`Success Rate: ${((passed / testCases.length) * 100).toFixed(1)}%\n`);

  if (failedTests.length > 0) {
    console.log('Failed tests:');
    failedTests.forEach((name) => console.log(`  - ${name}`));
  }

  process.exit(failed > 0 ? 1 : 0);
}

// Check if server is reachable
async function checkServer() {
  try {
    await axios.get(`${API_URL}/health`, { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const serverReachable = await checkServer();
  if (!serverReachable) {
    console.error(`❌ Cannot reach server at ${API_URL}`);
    console.error('Please ensure the server is running: npm run dev or npm start');
    process.exit(1);
  }

  await runTests();
}

main();
