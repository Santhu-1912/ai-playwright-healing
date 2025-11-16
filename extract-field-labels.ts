// extractFieldLabelsFromPage.ts

import { Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Extracts visible field labels/texts from a Playwright Page context (post-JS render)
 * and writes them to a Markdown (.md) file.
 *
 * @param page - The Playwright Page instance (already loaded and rendered)
 * @param mdFilePath - Absolute or relative path where the .md output should be saved
 * @returns string[] - Array of extracted field-like labels (also written to .md file)
 */
export async function extractFieldLabelsFromPageAndSaveMd(
  page: Page,
  mdFilePath: string
): Promise<string[]> {
  // Extract candidate field labels in browser context
  const fieldLabels: string[] = await page.evaluate(() => {
    const labels = new Set<string>();

    // 1. <label> elements (classic/semantic)
    document.querySelectorAll('label').forEach(el => {
      const t = el.innerText.trim();
      if (t) labels.add(t);
    });

    // 2. Inputs/selects/textareas: placeholder, title, aria-label
    document.querySelectorAll('input, textarea, select').forEach(el => {
      ['placeholder', 'title', 'aria-label'].forEach(attr => {
        const val = el.getAttribute(attr);
        if (val && val.trim()) labels.add(val.trim());
      });
    });

    // 3. Buttons: visible text, title, aria-label
    document.querySelectorAll('button').forEach(el => {
      const t = el.innerText.trim();
      if (t) labels.add(t);
      ['title', 'aria-label'].forEach(attr => {
        const val = el.getAttribute(attr);
        if (val && val.trim()) labels.add(val.trim());
      });
    });

    // 4. Table headers
    document.querySelectorAll('th').forEach(el => {
      const t = el.innerText.trim();
      if (t) labels.add(t);
    });

    // 5. Standalone text nodes (for plain div/span-heavy layouts)
    document.querySelectorAll('body *').forEach(el => {
      Array.from(el.childNodes).forEach(node => {
        if (node.nodeType === Node.TEXT_NODE) {
          const txt = node.textContent?.trim();
          if (txt && txt.length > 2 && txt.length < 48) { // Tune range as needed
            labels.add(txt);
          }
        }
      });
    });

    return Array.from(labels);
  });

  // Write to MD file (with basic formatting)
  const mdContent = [
    '# Extracted Field Labels',
    '',
    ...fieldLabels.map(l => `- ${l}`),
    '',
  ].join('\n');
  fs.writeFileSync(mdFilePath, mdContent, 'utf-8');

  console.log(`[extractFieldLabelsFromPageAndSaveMd] Field labels extracted and saved to: ${mdFilePath}`);

  return fieldLabels;
}
