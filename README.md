Playwright Auto-Healing Test Framework

A powerful, AI-assisted Playwright automation framework designed to automatically heal broken locators when UI changes occur. The system analyzes the DOM, extracts contextual field labels, and generates corrected locators using Azure OpenAI. This reduces test maintenance, improves reliability, and enables resilient end-to-end testing at scale.

Key Features

AI-Powered Locator Healing
Uses Azure OpenAI to automatically fix broken XPath selectors.

Field Label Detection
Extracts and maps field labels from the DOM for more accurate healing.

Multi-Strategy Locator Extraction
Static stack-trace parsing, LLM-based extraction, and JSON mapping fallbacks.

Failure Artifacts Capture
DOM snapshots, error traces, screenshots, field labels, and UI mappings stored for debugging.

Zero Additional Configuration
Simply import the setup file; auto-healing integrates seamlessly with existing Playwright tests.

Self-Learning Pattern Recognition
Framework improves locator accuracy by analyzing UI structures over multiple runs.

Prerequisites

Node.js v16+

Playwright v1.40+

Azure OpenAI credentials

Installation
git clone <your-repo-url>
cd TestOps_AgentHub
npm install


Create a .env file in the root directory:

AZURE_OPENAI_API_KEY=<your-key>
AZURE_OPENAI_ENDPOINT=<endpoint-url>
AZURE_OPENAI_DEPLOYMENT_NAME=<model-name>
AZURE_OPENAI_API_VERSION=2024-02-15-preview

Usage

Enable auto-healing by importing the setup script:

import './utils/setup';
import { test, expect } from '@playwright/test';

test('Example test', async ({ page }) => {
  await page.goto('https://example.com');
  // Locators will self-heal if broken
});

How It Works

Test Execution
Tests run normally.

Failure Interception
On failure, the framework captures:

Error logs

DOM snapshot

Screenshots

Field labels

Locator Extraction
Determined through:

Static parsing

LLM interpretation

JSON reference mapping

Healing Process

UI elements parsed from the DOM

Field labels mapped using Azure OpenAI

New locators generated and validated

Locator file automatically updated

Developer Review (Optional)
Failure artifacts stored for inspection.

Project Structure
TestOps_AgentHub/
│
├── utils/
│   ├── setup.ts
│   ├── llm-heal-locators.ts
│   ├── llm-heal-labels.ts
│   ├── extract_locator.ts
│   ├── extractouterhtml.ts
│   ├── extract-field-labels.ts
│   ├── fallbackLocatorFinder.ts
│   ├── getFailureDetails.ts
│   ├── llm-locator.ts
│   └── searchLocatorInLocatorFiles.ts
│
├── tests/
│   └── *.spec.ts
│
├── pages/
│   └── *.page.ts
│
├── failures/          # Auto-generated artifacts
├── .env
├── .env.example
├── .gitignore
└── package.json

Sample Test
import '../utils/setup';
import { test, expect } from '@playwright/test';

test('Login workflow with auto-healing', async ({ page }) => {
  await page.goto('https://your-app.com/login');
  await page.locator('xpath=//input[@id="username"]').fill('testuser');
  await page.locator('xpath=//input[@id="password"]').fill('password123');
  await page.locator('xpath=//button[@type="submit"]').click();
  await expect(page).toHaveURL(/.*dashboard/);
});

Page Object Example
export const LoginPage = {
  fieldlabels: "Username, Password, Login Button, Remember Me",
  usernameInput: 'xpath=//input[@id="username"]',
  passwordInput: 'xpath=//input[@id="password"]',
  submitButton: 'xpath=//button[@type="submit"]',
  rememberCheckbox: 'xpath=//input[@type="checkbox"]'
};

Troubleshooting

Auto-healing not running?

Ensure .env is configured correctly

Ensure import './utils/setup' is at the top of the test

Check console logs for healing steps

Inspect the failures/ folder

Locator still fails after healing?

Confirm field labels match UI

Review ui-elements.json for DOM extraction accuracy

Validate healed XPath manually if needed

Test Commands
npx playwright test
npx playwright test --headed
npx playwright show-report

Roadmap

Support for CSS, ID, and text-based selector healing

Full CI/CD integration templates

Visual regression healing

Analytics dashboard for healing success rates

Multi-provider LLM support (OpenAI, Claude, Gemini)

Contributing

Fork the repo

Create a feature branch

Commit changes with clear messages

Submit a pull request

All enhancements are welcome.

If you'd like, I can also generate:
