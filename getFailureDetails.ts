// getFailureDetails.ts
import type { TestInfo } from "@playwright/test";

/**
 * Extracts complete error messages including Call log from Playwright TestInfo object.
 * @param testInfo The Playwright testInfo/context from afterEach/test hooks.
 * @returns Formatted error details string with complete error information.
 */
export function getFailureDetails(testInfo: TestInfo): string {
  let allErrorDetails: string[] = [];

  // 1. Extract from testInfo.errors (basic timeout info)
  if (testInfo.errors && testInfo.errors.length > 0) {
    testInfo.errors.forEach((err, idx) => {
      allErrorDetails.push(`=== Basic Error ${idx + 1} ===\nMessage: ${err.message}\nStack: ${err.stack || 'N/A'}`);
    });
  }

  // 2. Extract from test results (contains detailed Call log)
  try {
    const results = (testInfo as any).results || [];
    results.forEach((result: any, resultIdx: number) => {
      // From result.errors array
      if (result.errors && result.errors.length > 0) {
        result.errors.forEach((error: any, errorIdx: number) => {
          let detailMessage = `\n=== Detailed Error ${resultIdx + 1}.${errorIdx + 1} ===\n`;
          detailMessage += `Message:\n${error.message || 'N/A'}\n\n`;
          
          if (error.stack && error.stack !== error.message) {
            detailMessage += `Stack Trace:\n${error.stack}\n\n`;
          }
          
          if (error.location) {
            detailMessage += `Location: ${error.location.file}:${error.location.line}:${error.location.column}\n\n`;
          }
          
          if (error.snippet) {
            detailMessage += `Code Snippet:\n${error.snippet}\n\n`;
          }
          
          allErrorDetails.push(detailMessage);
        });
      }
      
      // From result.error object (single error)
      if (result.error) {
        let detailMessage = `\n=== Result Error ${resultIdx + 1} ===\n`;
        detailMessage += `Message:\n${result.error.message || 'N/A'}\n\n`;
        
        if (result.error.stack && result.error.stack !== result.error.message) {
          detailMessage += `Stack Trace:\n${result.error.stack}\n\n`;
        }
        
        if (result.error.location) {
          detailMessage += `Location: ${result.error.location.file}:${result.error.location.line}:${result.error.location.column}\n\n`;
        }
        
        allErrorDetails.push(detailMessage);
      }
      
      // Extract step errors (contains Call log details)
      if (result.steps && result.steps.length > 0) {
        result.steps.forEach((step: any, stepIdx: number) => {
          if (step.error) {
            let stepMessage = `\n=== Step Error ${resultIdx + 1}.${stepIdx + 1}: "${step.title}" ===\n`;
            stepMessage += `Message:\n${step.error.message || 'N/A'}\n\n`;
            
            if (step.error.stack && step.error.stack !== step.error.message) {
              stepMessage += `Stack Trace:\n${step.error.stack}\n\n`;
            }
            
            if (step.error.location) {
              stepMessage += `Location: ${step.error.location.file}:${step.error.location.line}:${step.error.location.column}\n\n`;
            }
            
            if (step.error.snippet) {
              stepMessage += `Code Snippet:\n${step.error.snippet}\n\n`;
            }
            
            allErrorDetails.push(stepMessage);
          }
        });
      }
    });
  } catch (e) {
    allErrorDetails.push(`\n=== Error Extraction Failed ===\n${e}\n`);
  }

  // 3. Extract from stdout/stderr (contains console output)
  try {
    const rawTestInfo = testInfo as any;
    
    if (rawTestInfo.stdout && rawTestInfo.stdout.length > 0) {
      allErrorDetails.push(`\n=== STDOUT ===\n${rawTestInfo.stdout.join('\n')}\n`);
    }
    
    if (rawTestInfo.stderr && rawTestInfo.stderr.length > 0) {
      allErrorDetails.push(`\n=== STDERR ===\n${rawTestInfo.stderr.join('\n')}\n`);
    }
    
    // Try to get the complete test output
    if (rawTestInfo._stdout) {
      allErrorDetails.push(`\n=== Complete STDOUT ===\n${rawTestInfo._stdout}\n`);
    }
    
    if (rawTestInfo._stderr) {
      allErrorDetails.push(`\n=== Complete STDERR ===\n${rawTestInfo._stderr}\n`);
    }
  } catch (e) {
    // Ignore stdout/stderr extraction errors
  }

  // 4. Add attachment information
  if (testInfo.attachments && testInfo.attachments.length > 0) {
    let attachmentInfo = "\n=== Attachments ===\n";
    testInfo.attachments.forEach(attachment => {
      attachmentInfo += `- ${attachment.name} (${attachment.contentType}) at ${attachment.path || "in-memory"}\n`;
      
      if (attachment.name.includes("trace") && attachment.path) {
        attachmentInfo += `  👉 To open trace: npx playwright show-trace "${attachment.path}"\n`;
      }
    });
    allErrorDetails.push(attachmentInfo);
  }

  // 5. Fallback: Try to extract from the raw object structure
  if (allErrorDetails.length === 0 || !allErrorDetails.some(detail => detail.includes('Call log:'))) {
    try {
      const rawData = JSON.stringify(testInfo, null, 2);
      if (rawData.includes('Call log:')) {
        allErrorDetails.push(`\n=== Raw TestInfo (Contains Call log) ===\n${rawData}\n`);
      }
    } catch (e) {
      // Ignore JSON stringify errors
    }
  }

  if (allErrorDetails.length === 0) {
    return "No error details available";
  }

  return allErrorDetails.join('\n');
}

/**
 * Alternative approach: Extract error from the current test context
 */
export function getCompleteErrorFromContext(): string {
  try {
    // Try to access the current test context error
    const currentTest = (global as any).__currentTest;
    if (currentTest && currentTest._errors) {
      return JSON.stringify(currentTest._errors, null, 2);
    }
  } catch (e) {
    return `Could not access current test context: ${e}`;
  }
  return "No context error found";
}

/**
 * Debug function to explore the testInfo structure
 */
export function debugTestInfoStructure(testInfo: TestInfo): string {
  try {
    const keys = Object.keys(testInfo);
    let debug = "=== TestInfo Structure ===\n";
    debug += `Available keys: ${keys.join(', ')}\n\n`;
    
    keys.forEach(key => {
      try {
        const value = (testInfo as any)[key];
        debug += `${key}: ${typeof value} ${Array.isArray(value) ? `(array length: ${value.length})` : ''}\n`;
        
        if (key === 'errors' && Array.isArray(value)) {
          value.forEach((err, idx) => {
            debug += `  Error ${idx}: ${Object.keys(err).join(', ')}\n`;
          });
        }
      } catch (e) {
        debug += `${key}: <could not access>\n`;
      }
    });
    
    return debug;
  } catch (e) {
    return `Debug failed: ${e}`;
  }
}
