import { test } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { extractLocatorViaLLM } from './llm-locator';
import { extractAndSaveUiElements } from './extractouterhtml';
import { extractFieldLabelsFromPageAndSaveMd } from './extract-field-labels';
import { healLabelsWithLLM } from './llm-heal-labels';
import { extractLocatorDetailsFromStack } from './extract_locator';
import { searchLocatorInLocatorFiles } from './searchLocatorInLocatorFiles';
import { getFailureDetails } from './getFailureDetails';
import { healLocatorWithUIReference } from './llm-heal-locators';
import { tryFallbackLocatorFinder } from './fallbackLocatorFinder';
//import prettier from 'prettier';
const path1 = require('path');
const basePath = path1.resolve(__dirname, '../');
console.log('🧭 [DEBUG] Base path1:', basePath);

require('dotenv').config();
let fieldLabels: string[] = [];

function safeFilename(title: string) {
  return title.replace(/[^\w\d-_]/g, '_');
}

test.afterEach(async ({ page }, testInfo) => {
  console.log('🧪 [DEBUG] afterEach triggered for test:', testInfo.title);

  if (testInfo.status !== 'failed' && testInfo.status !== 'timedOut') {
    console.log('✅ [DEBUG] Test passed, skipping failure handling.');
    return;
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const testName = safeFilename(testInfo.title);
  const artifactsFolder = path.resolve('failures', `${testName}_${timestamp}`);

  console.log('📁 [DEBUG] Artifacts folder path:', artifactsFolder);

  if (!fs.existsSync(artifactsFolder)) {
    fs.mkdirSync(artifactsFolder, { recursive: true });
    console.log('📁 [DEBUG] Created artifacts folder');
  }

  // Save error info
  console.log("test info details:" + testInfo.title)
  const fullErrorText = getFailureDetails(testInfo);
  fs.writeFileSync(path.join(artifactsFolder, 'full-error.txt'), fullErrorText, 'utf-8');
  console.log('📝 [DEBUG] Saved full error info to full-error.txt');



  // Save DOM snapshot
  let dom = '';
  try {
    await page.waitForLoadState('load');
    const rawDom = await page.content();
    const meta = `<!--\nURL: ${page.url()}\nTitle: ${await page.title()}\nCaptured: ${new Date().toISOString()}\n-->`;
    dom = meta + '\n' + rawDom;
    console.log('🌐 [DEBUG] Successfully captured DOM');
  } catch (error) {
    dom = `<!-- Could not capture DOM: ${(error as Error).message} -->`;
    console.warn('⚠️ [DEBUG] Failed to capture DOM:', (error as Error).message);
  }

  fs.writeFileSync(path.join(artifactsFolder, 'faileddom.html'), dom, 'utf-8');
  console.log('💾 [DEBUG] Saved faileddom.html');

  // Try static extraction first
  console.log('🧠 [DEBUG] Starting static locator extraction...');
  const errorStack = fs.readFileSync(path.join(artifactsFolder, 'full-error.txt'), 'utf-8');
  const locatorInfo = extractLocatorDetailsFromStack(errorStack);
  console.log('📌 [DEBUG] Static extraction result:', locatorInfo);

  let locatorFilePath: string | null = null;
  if (locatorInfo && locatorInfo.locatorFile) {
    locatorFilePath = locatorInfo.locatorFile;
    console.log('📄 [DEBUG] Matched Locator file path (static):', locatorFilePath);
  } else {
    console.log('🧠 [DEBUG] Static extraction failed. Trying LLM-based locator extraction...');
    const locator = await extractLocatorViaLLM(fullErrorText);
    console.log('🤖 [DEBUG] Extracted locator (LLM):', locator);

    if (locator) {
      const matchedFile = searchLocatorInLocatorFiles(locator);
      console.log('🔍 [DEBUG] Locator match from codebase:', matchedFile);
      if (matchedFile) {
        locatorFilePath = path.join(basePath, matchedFile);
        console.log('✅ [DEBUG] Matched locator file path (LLM):', locatorFilePath);
      } else {
        console.warn('❌ [DEBUG] Locator file not found in codebase via LLM-extracted locator.');
      }
    } else {
      console.warn('❌ [DEBUG] Locator could not be extracted via LLM.');
    }
    console.log('🔍 [DEBUG] Trying JSON mapping fallback...');
    const fallbackFile = tryFallbackLocatorFinder(testInfo, artifactsFolder, basePath);

    if (fallbackFile) {
      locatorFilePath = fallbackFile;
      console.log('✅ [DEBUG] Matched locator file path (JSON fallback):', locatorFilePath);
    } else {
      console.warn('⚠️ [DEBUG] JSON mapping fallback also failed');
    }

  }

  // Extract field labels from current page
  console.log('🏷️ [DEBUG] Starting field label extraction from page...');
  const mdPath = path.join(artifactsFolder, 'field-labels.md');
  const detectedLabels = await extractFieldLabelsFromPageAndSaveMd(page, mdPath);
  console.log('📋 [DEBUG] Extracted field labels from page:', detectedLabels);

  // Screenshot for debugging
  try {
    if (!page.isClosed()) {
      await page.screenshot({
        path: path.join(artifactsFolder, 'failedscreenshot.png'),
        fullPage: true,
      });
      console.log('📷 [DEBUG] Saved full-page screenshot');
    }
  } catch {
    fs.writeFileSync(path.join(artifactsFolder, 'failedscreenshot.png'), '', 'utf-8');
    console.warn('⚠️ [DEBUG] Screenshot capture failed, wrote empty file');
  }

  // Label healing and UI element extraction
  if (locatorFilePath) {
    console.log('🔧 [DEBUG] Beginning label healing using locatorFilePath:', locatorFilePath);

    try {
      const uiElementsJsonPath = path.join(artifactsFolder, 'ui-elements.json');
      const fileContent = fs.readFileSync(locatorFilePath, 'utf-8');
      console.log('📄 [DEBUG] Loaded content from locator file');

      const labelsRegex = /fieldlabels\s*:\s*['"]([^'"]+)['"]|feildlabels\s*:\s*['"]([^'"]+)['"]/i;
      const labelsMatch = labelsRegex.exec(fileContent);
      console.log('🔍 [DEBUG] Regex match for field labels:', labelsMatch);

      const rawLabels = labelsMatch ? (labelsMatch[1] || labelsMatch[2]) : '';
      fieldLabels = rawLabels.split(',').map(label => label.trim()).filter(Boolean);
      console.log('🧾 [DEBUG] Raw field labels:', fieldLabels);

      const healed = await healLabelsWithLLM(fieldLabels, detectedLabels);
      console.log('🛠️ [DEBUG] Healed labels result:', healed);

      if (Object.keys(healed).length > 0) {
        fieldLabels = fieldLabels.map(l => healed[l] || l);
        console.log('✅ [DEBUG] Updated field labels after healing:', fieldLabels);
      } else {
        console.log('ℹ️ [DEBUG] No label healing applied.');
      }

      await extractAndSaveUiElements(
        path.join(artifactsFolder, 'faileddom.html'),
        fieldLabels,
        uiElementsJsonPath
      );
      console.log('📤 [DEBUG] Extracted and saved ui-elements.json');
    } catch (err) {
      console.error('❌ [DEBUG] Error in label healing or UI extraction:', err);
    }

    // Uncomment when healing locator:
    await healLocatorWithUIReference(locatorFilePath, path.join(artifactsFolder, 'ui-elements.json'), path.join(artifactsFolder, 'faileddom.html'), fieldLabels);
  } else {
    console.warn('⚠️ [DEBUG] No locator file path found; skipped label healing and UI extraction.');
  }

  console.error(`🚨 Test failed. Artifacts saved in: ${artifactsFolder}`);
});
