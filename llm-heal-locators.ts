import * as fs from 'fs';
import * as path from 'path';
import OpenAI from 'openai';
import * as dotenv from 'dotenv';
import { JSDOM } from 'jsdom';

dotenv.config();

// Setup OpenAI client
const openai = new OpenAI({
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  baseURL: `${process.env.AZURE_OPENAI_ENDPOINT}/openai/deployments/${process.env.AZURE_OPENAI_DEPLOYMENT_NAME}`,
  defaultQuery: { 'api-version': process.env.AZURE_OPENAI_API_VERSION },
  defaultHeaders: { 'api-key': process.env.AZURE_OPENAI_API_KEY },
});

// Type for locator map
type LocatorMap = Record<string, string>;

// 1. Parse all XPaths from locator file
function extractAllXpathLocators(locatorFilePath: string): LocatorMap {
  const fileContent = fs.readFileSync(locatorFilePath, 'utf-8');
  const xpathRegex = /^\s*(\w+)\s*:\s*"(xpath=[^"]*)"/gm;
  const result: LocatorMap = {};
  let match: RegExpExecArray | null;
  while ((match = xpathRegex.exec(fileContent)) !== null) {
    const [, key, xpath] = match;
    result[key] = xpath;
  }
  return result;
}

// 2. Replace XPaths in locator file with healed ones
function replaceLocatorsInFile(locatorFilePath: string, healedLocators: LocatorMap, fieldLabels?: string[]) {
  let content = fs.readFileSync(locatorFilePath, 'utf-8');
  for (const [key, healedXpath] of Object.entries(healedLocators)) {
    const re = new RegExp(`(${key}\\s*:\\s*")xpath=[^"]*(")`);
    content = content.replace(re, `$1${healedXpath}$2`);
  }
  if (fieldLabels && fieldLabels.length) {
    content = content.replace(
      /(f(ie|ei)ldlabels\s*:\s*['"])[^'"]*(['"])/i,
      `$1${fieldLabels.join(',')}$3`
    );
  }
  fs.writeFileSync(locatorFilePath, content);
}


// 3. Validate XPaths in DOM
function validateXPathsInDOM(html: string, locators: LocatorMap): { valid: string[]; invalid: string[] } {
  const dom = new JSDOM(html);
  const document = dom.window.document;
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const [key, xpath] of Object.entries(locators)) {
    const cleanXpath = xpath.replace(/^xpath=/, '');
    try {
      const res = document.evaluate(cleanXpath, document, null, dom.window.XPathResult.ANY_TYPE, null);
      if (res.iterateNext()) {
        valid.push(key);
      } else {
        invalid.push(key);
      }
    } catch {
      invalid.push(key);
    }
  }
  return { valid, invalid };
}

// 4. Main healing and validation loop
export async function healLocatorWithUIReference(
  locatorFilePath: string,
  uiElementsPath: string,
  domHtmlPath: string,
  fieldLabels: string[],
  maxRetries = 4
): Promise<void> {
  // Load input files
  const genericXPathPath = path.resolve(__dirname, 'genericpaths.txt');
  if (!fs.existsSync(genericXPathPath)) {
    throw new Error(`[healLocatorWithUIReference] generic_xpath.txt NOT found at: ${genericXPathPath}`);
  }
  const domHtml = fs.readFileSync(domHtmlPath, 'utf-8');
  let allLocators = extractAllXpathLocators(locatorFilePath);
  const uiElements = JSON.parse(fs.readFileSync(uiElementsPath, 'utf-8'));
  const genericXPathReference = fs.readFileSync(genericXPathPath, 'utf-8');

  let retryCount = 0;
  const fieldLabelsSection = fieldLabels && fieldLabels.length
  ? `\nField labels for this page/module are: ${JSON.stringify(fieldLabels)}\n`
  : '';
  while (retryCount < maxRetries) {
    // --------------- LLM Healing Stage ---------------
    const systemPrompt = `
You are an expert Oracle Cloud web automation engineer.
Your job: Review and repair a map of locators using current UI HTML and generic patterns.
NEVER give explanations. Only output a JSON object (not an array) that directly maps locator keys to healed XPath strings.
NEVER change keys or add new ones. Maintain exact formatting. Do NOT add or remove fields.
Refer to these best practices:
${genericXPathReference}
`.trim();

    // If not first attempt, restrict only to failed keys
    let useLocators = allLocators;
    let contextMsg = '';
    if (retryCount > 0 && typeof ALL_FAILED_KEYS !== 'undefined' && ALL_FAILED_KEYS.length) {
      // Only try to heal failed ones in this loop
      useLocators = Object.fromEntries(Object.entries(allLocators).filter(([k]) => ALL_FAILED_KEYS.includes(k)));
      contextMsg = `The following locators failed DOM validation and need to be fixed again.`;
    }

    const userPrompt = `
${contextMsg}
Here is the locator map (key-value of locator variable names to XPath strings in "xpath=..." format):
${JSON.stringify(useLocators, null, 2)}
Here is a sample of current UI HTML elements (Playwright DOM snapshot):
${JSON.stringify(uiElements, null, 2)}
If any XPath value is incorrect or outdated, repair it using best practices.
Your response MUST be a JSON object with the SAME KEYS and new XPath strings as values (in "xpath=..." format).
DO NOT overwrite files—just return the JSON object of fixed locators.You must use feildlabels while healing xpaths.
`.trim();

    const completion = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.2,
    });

    let healedLocators: LocatorMap = { ...allLocators };
    try {
      let raw = completion.choices[0].message.content?.trim() || '';
       raw = raw
        .replace(/^```json/i, '') // Removes starting ```
        .replace(/^```/, '')      // Removes starting ```
        .replace(/```$/, '')      // Removes ending ```
        .trim();
      const newHealed = JSON.parse(raw);
      // Update only the keys that were just healed (failed ones, or all on first loop)
      for (const key of Object.keys(newHealed)) {
        healedLocators[key] = newHealed[key];
      }
    } catch (err) {
      throw new Error(`Invalid JSON from LLM: ${err}`);
    }

    // --------------- Validation Stage ---------------
    const { valid, invalid } = validateXPathsInDOM(domHtml, healedLocators);
    if (invalid.length === 0) {
      // All are valid: Update file and exit
      replaceLocatorsInFile(locatorFilePath, healedLocators,fieldLabels);
      console.log('✅ All locators validated and updated!');
      return;
    }
    // Prepare for next retry loop
    console.warn(`❌ These XPaths are still invalid after attempt ${retryCount + 1}: ${invalid.join(', ')}`);
    var ALL_FAILED_KEYS = invalid;
    allLocators = healedLocators;
    retryCount++;
  }
  throw new Error(`Failed to heal all locators after ${maxRetries} attempts.`);
}

// ----------- Example Usage ------------

// (uncomment and set filenames accordingly)
// (async () => {
//   await healLocatorWithUIReference(
//     "src/locators/loginlocator.ts",
//     "failures/some-ui-elements.json",
//     "failures/DOM_FILENAME.html" // your domHtmlPath here
//   );
// })();

