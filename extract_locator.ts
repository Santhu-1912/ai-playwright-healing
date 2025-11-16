import fs from 'fs';
import path from 'path';

/**
 * Extracts the locator key and locator .ts file used by a PageObject variable assignment,
 * given an error stacktrace from Playwright.
 *
 * @param stackTrace The string contents of a Playwright error or full-error.txt
 * @param rootDir The root directory for your repo (default: process.cwd())
 * @returns { locatorKey: string, locatorFile: string } or null if not found
 */
export function extractLocatorDetailsFromStack(stackTrace: string, rootDir: string = process.cwd()) {
  // 1. Find a page.ts reference from stack trace
  const pageObjRegex = /at [\w.<>\s]+ \((.*pages[\\/].*\.page\.ts):(\d+):(\d+)\)/;
  const match = stackTrace.match(pageObjRegex);

  //console.log('[DEBUG] pageObjRegex:', pageObjRegex);
  //console.log('[DEBUG] stackTrace (start snippet):', stackTrace.slice(0, 500));
  //console.log('[DEBUG] match:', match);

  if (!match) {
    //console.warn('No Page Object (.page.ts) reference found in stack trace');
    return null;
  }

  const pageFilePath = path.isAbsolute(match[1].trim())
    ? match[1].trim()
    : path.resolve(rootDir, match[1].trim());
  const errorLineNumber = parseInt(match[2], 10);

  //console.log('[DEBUG] pageFilePath:', pageFilePath, '| errorLineNumber:', errorLineNumber);

  if (!fs.existsSync(pageFilePath)) {
    //console.warn('Page file does not exist:', pageFilePath);
    return null;
  }

  const pageSource = fs.readFileSync(pageFilePath, 'utf-8').split('\n');
  const errorLine = pageSource[errorLineNumber - 1];
  //console.log('[DEBUG] errorLine:', errorLine);

  // 2. Find variable on this line: (e.g., this.submitBtn, this.payableLinks)
  const locatorVarMatch = errorLine.match(/this\.(\w+)/);
  //console.log('[DEBUG] locatorVarMatch:', locatorVarMatch);

  if (!locatorVarMatch) {
    //console.warn('No locator variable found in line:', errorLine);
    return null;
  }
  const locatorVar = locatorVarMatch[1];
  //console.log('[DEBUG] locatorVar:', locatorVar);

  // 3. Find the assignment to this variable inside the constructor
  const ctorStart = pageSource.findIndex(line => line.includes('constructor('));
  //console.log('[DEBUG] ctorStart:', ctorStart);

  if (ctorStart === -1) {
    //console.warn('No constructor found in file.');
    return null;
  }

  // Only analyze lines up to the failing line for assignment
  const assignments = pageSource.slice(ctorStart, errorLineNumber);
  //console.log('[DEBUG] assignments (snippet):', assignments.slice(0, 10));

  const assignmentPatterns = [
    new RegExp(
      `this\\.${locatorVar}\\s*=\\s*page\\.locator\\((\\w+)\\.([\\w$]+)\\)`, 'i'
    ),
    new RegExp(
      `this\\.${locatorVar}\\s*=\\s*this\\.page\\.locator\\((\\w+)\\.([\\w$]+)\\)`, 'i'
    )
  ];

  let assignMatch: RegExpMatchArray | null = null;
  let locatorImport: string = '';
  let locatorKey: string = '';

  for (const line of assignments) {
    for (const pattern of assignmentPatterns) {
      //console.log('[DEBUG] Testing line:', line, '| with pattern:', pattern);
      assignMatch = line.match(pattern);
      if (assignMatch) {
        locatorImport = assignMatch[1];
        locatorKey = assignMatch[2];
        //console.log('[DEBUG] assignMatch:', assignMatch);
        break;
      }
    }
    if (assignMatch) break;
  }

  if (!assignMatch) {
    //console.warn(`No locator assignment found for ${locatorVar}`);
    return null;
  }

  // 4. Find import for alias (e.g., import homepageLocatorX from "...")
  const importRegex =
    new RegExp(`import\\s+${locatorImport}\\s+from\\s+['"](.*)['"]`);
  const importRegexStar =
    new RegExp(`import\\s+\\*\\s+as\\s+${locatorImport}\\s+from\\s+['"](.*)['"]`);

  const importLine = pageSource.find(line =>
    importRegex.test(line) || importRegexStar.test(line)
  );
  //console.log('[DEBUG] importLine:', importLine);

  if (!importLine) {
    //console.warn(`No import statement found for '${locatorImport}'`);
    return null;
  }

  let locatorRelPath =
    importLine.match(importRegex)?.[1] ||
    importLine.match(importRegexStar)?.[1];

  //console.log('[DEBUG] locatorRelPath:', locatorRelPath);

  if (!locatorRelPath) {
    //console.warn(`Import line did not contain a valid path for '${locatorImport}'`);
    return null;
  }

  // Add '.ts' if needed.
  if (!locatorRelPath.endsWith('.ts') && !locatorRelPath.endsWith('.js')) {
    locatorRelPath += '.ts';
  }
  const locatorFullPath = path.resolve(path.dirname(pageFilePath), locatorRelPath);
  const locatorFileRelative = path.relative(rootDir, locatorFullPath).replace(/\\/g, '/');

  //console.log('[DEBUG] locatorfileRelativepath :', locatorFileRelative)
  // 5. Return locatorKey and locator .ts file
  return {
    locatorKey,
    locatorFile: locatorFileRelative
  };
}
