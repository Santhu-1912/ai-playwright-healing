// searchLocatorInLocatorFiles.ts
import fs from 'fs';
import path from 'path';
import { glob } from 'glob';

/**
 * Searches all locator .ts files for a given XPath (normalized from Playwright error output).
 * Returns the first relative locator file (to project root) that contains the XPath.
 *
 * @param locator The XPath string or Playwright locator('...') string.
 * @returns The relative path to the matching locator file, or null if not found.
 */
export function searchLocatorInLocatorFiles(locator: string): string | null {
  console.log('[searchLocatorInLocatorFiles] Starting search for locator:', locator);
  const locatorDir = path.resolve(__dirname, '../locators');
  const tsFiles = glob.sync(`${locatorDir}/**/*.ts`);
  console.log('[searchLocatorInLocatorFiles] locatorDir =', locatorDir);
  console.log(`[searchLocatorInLocatorFiles] Searching in ${tsFiles.length} files`);

  for (const filePath of tsFiles) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const xpathRegex = /"xpath=([^"]+)"/g;
    let match: RegExpExecArray | null;
    while ((match = xpathRegex.exec(content)) !== null) {
      if (match[1] === locator) {
        const relativePath = path.relative(path.resolve(__dirname, '../'), filePath).replace(/\\/g, '/');
        console.log(`[searchLocatorInLocatorFiles] MATCH in file: ${relativePath}`);
        return relativePath;
        
      }
    }
    
  }
  
  console.log('[searchLocatorInLocatorFiles] No match found for locator.');
  return null;
}
