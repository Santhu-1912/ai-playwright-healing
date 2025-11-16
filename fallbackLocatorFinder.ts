// fallbackLocatorFinder.ts
import fs from 'fs';
import path from 'path';

interface LocatorMapping {
  stepToLocatorMapping: Record<string, string[]>;
  homePageValidationTest?: Record<string, string[]>;
}

interface LocatorFieldLabels {
  [locatorFile: string]: string[];
}

/**
 * Parses attachments from error text to find completed steps
 */
function parseAttachments(errorText: string): string[] {
  const lines = errorText.split('\n');
  const stepNames: string[] = [];
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    if (trimmedLine.startsWith('- Step ')) {
      const idx = trimmedLine.indexOf('(');
      if (idx !== -1) {
        const stepName = trimmedLine.substring(2, idx).trim(); // Remove '- ' prefix
        if (!stepNames.includes(stepName)) {
          stepNames.push(stepName);
        }
      }
    }
  }
  
  return stepNames;
}

/**
 * Extracts field labels from a field-labels.md file
 */
function extractFieldLabelsFromMd(mdPath: string): string[] {
  try {
    if (!fs.existsSync(mdPath)) return [];
    
    const content = fs.readFileSync(mdPath, 'utf-8');
    const labels: string[] = [];
    
    // Extract labels from markdown (assuming they're in list format or comma-separated)
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('-') || trimmed.startsWith('*')) {
        // List format: - Label Name
        labels.push(trimmed.substring(1).trim());
      } else if (trimmed && !trimmed.startsWith('#')) {
        // Plain text or comma-separated
        const commaSplit = trimmed.split(',').map(l => l.trim()).filter(Boolean);
        labels.push(...commaSplit);
      }
    }
    
    return labels.filter(Boolean);
  } catch (error) {
    console.warn('[DEBUG] Failed to extract field labels from MD:', error);
    return [];
  }
}

/**
 * Extracts fieldlabels from locator files
 */
function extractLocatorFieldLabels(locatorFiles: string[], basePath: string): LocatorFieldLabels {
  const result: LocatorFieldLabels = {};
  
  for (const locatorFile of locatorFiles) {
    try {
      const fullPath = path.resolve(basePath, locatorFile);
      if (!fs.existsSync(fullPath)) continue;
      
      const content = fs.readFileSync(fullPath, 'utf-8');
      
      // Extract fieldlabels or feildlabels from the file
      const labelsRegex = /(?:fieldlabels|feildlabels)\s*:\s*['"]([^'"]+)['"]/i;
      const match = content.match(labelsRegex);
      
      if (match && match[1]) {
        const labels = match[1].split(',').map(l => l.trim()).filter(Boolean);
        result[locatorFile] = labels;
      } else {
        result[locatorFile] = [];
      }
    } catch (error) {
      console.warn(`[DEBUG] Failed to extract labels from ${locatorFile}:`, error);
      result[locatorFile] = [];
    }
  }
  
  return result;
}

/**
 * Finds the best matching locator file based on field label overlap
 */
function findBestLocatorMatch(
  candidateFiles: string[],
  fieldLabelsFromPage: string[],
  locatorFieldLabels: LocatorFieldLabels
): string | null {
  if (candidateFiles.length <= 1) return candidateFiles[0] || null;
  
  let bestFile = '';
  let maxOverlap = -1;
  
  for (const locatorFile of candidateFiles) {
    const locatorLabels = locatorFieldLabels[locatorFile] || [];
    const overlap = new Set([...fieldLabelsFromPage]).size > 0 
      ? fieldLabelsFromPage.filter(label => 
          locatorLabels.some(locLabel => 
            locLabel.toLowerCase().includes(label.toLowerCase()) || 
            label.toLowerCase().includes(locLabel.toLowerCase())
          )
        ).length
      : 0;
    
    console.log(`[DEBUG] ${locatorFile}: ${overlap} overlapping labels`);
    
    if (overlap > maxOverlap) {
      maxOverlap = overlap;
      bestFile = locatorFile;
    }
  }
  
  return maxOverlap > 0 ? bestFile : candidateFiles[0]; // Fallback to first if no overlap
}

/**
 * Main function to find error locator files from JSON mapping
 */
export function findErrorLocatorFromMapping(
  errorText: string,
  testTitle: string,
  artifactsFolder: string,
  basePath: string = process.cwd()
): string[] {
  console.log('[DEBUG] Starting fallback locator finder from JSON mapping...');
  
  try {
    // 1. Load locator mapping JSON
    const jsonPath = path.resolve(basePath, 'locatorFinder.json');
    if (!fs.existsSync(jsonPath)) {
      console.error('[ERROR] locatorFinder.json not found at:', jsonPath);
      return [];
    }
    
    const mappingData: LocatorMapping = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    console.log('[DEBUG] Loaded locator mapping JSON');
    
    // 2. Determine which test mapping to use
    let stepMapping: Record<string, string[]>;
    if (testTitle.includes('Home Page validation')) {
      stepMapping = mappingData.homePageValidationTest || mappingData.stepToLocatorMapping;
    } else {
      stepMapping = mappingData.stepToLocatorMapping;
    }
    
    // 3. Parse attachments to find last successful step
    const completedSteps = parseAttachments(errorText);
    console.log('[DEBUG] Completed steps found:', completedSteps);
    
    if (completedSteps.length === 0) {
      console.warn('[WARN] No completed steps found in error text');
      return [];
    }
    
    const lastSuccessStep = completedSteps[completedSteps.length - 1];
    console.log('[DEBUG] Last successful step:', lastSuccessStep);
    
    // 4. Find next step(s) where error likely occurred
    const stepKeys = Object.keys(stepMapping);
    const lastIndex = stepKeys.indexOf(lastSuccessStep);
    
    if (lastIndex === -1) {
      console.warn('[WARN] Last successful step not found in mapping');
      return [];
    }
    
    if (lastIndex + 1 >= stepKeys.length) {
      console.warn('[WARN] No next step found after last successful step');
      return [];
    }
    
    const errorStep = stepKeys[lastIndex + 1];
    const candidateLocators = stepMapping[errorStep] || [];
    console.log('[DEBUG] Error likely in step:', errorStep);
    console.log('[DEBUG] Candidate locator files:', candidateLocators);
    
    // 5. If multiple locator files, use field labels to find best match
    if (candidateLocators.length > 1) {
      console.log('[DEBUG] Multiple locator files found, using field label matching...');
      
      // Extract field labels from page
      const fieldLabelsPath = path.join(artifactsFolder, 'field-labels.md');
      const fieldLabelsFromPage = extractFieldLabelsFromMd(fieldLabelsPath);
      console.log('[DEBUG] Field labels from page:', fieldLabelsFromPage);
      
      // Extract field labels from locator files
      const locatorFieldLabels = extractLocatorFieldLabels(candidateLocators, basePath);
      console.log('[DEBUG] Locator field labels:', locatorFieldLabels);
      
      // Find best match
      const bestMatch = findBestLocatorMatch(candidateLocators, fieldLabelsFromPage, locatorFieldLabels);
      if (bestMatch) {
        console.log('[INFO] ✅ Best matching locator file:', bestMatch);
        return [bestMatch];
      }
    }
    
    console.log('[INFO] ✅ Locator files from JSON mapping:', candidateLocators);
    return candidateLocators;
    
  } catch (error) {
    console.error('[ERROR] Fallback locator finder failed:', error);
    return [];
  }
}

/**
 * Integration function for setup.ts
 */
export function tryFallbackLocatorFinder(
  testInfo: any,
  artifactsFolder: string,
  basePath: string
): string | null {
  try {
    // Read error text
    const errorTextPath = path.join(artifactsFolder, 'full-error.txt');
    if (!fs.existsSync(errorTextPath)) {
      console.warn('[WARN] full-error.txt not found for fallback search');
      return null;
    }
    
    const errorText = fs.readFileSync(errorTextPath, 'utf-8');
    const locatorFiles = findErrorLocatorFromMapping(errorText, testInfo.title, artifactsFolder, basePath);
    
    if (locatorFiles.length > 0) {
      const selectedFile = locatorFiles[0]; // Use first/best match
      const fullPath = path.resolve(basePath, selectedFile);
      console.log('[INFO] ✅ Fallback found locator file:', fullPath);
      return fullPath;
    }
    
    return null;
  } catch (error) {
    console.error('[ERROR] Fallback locator finder integration failed:', error);
    return null;
  }
}
