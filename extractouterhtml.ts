import * as fs from 'fs';
import * as path from 'path';
import { chromium } from '@playwright/test';

type Match = {
  parent_outerHTML: string;
  element_outerHTML: string;
  child_elements: string[];
};

type OutputItem = {
  label: string;
  matches: Match[];
};

export async function extractAndSaveUiElements(
  htmlPath: string,
  labels: string[],
  outPath: string
): Promise<void> {
  const html = fs.readFileSync(htmlPath, 'utf-8');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'domcontentloaded' });

  const rawMatches: {
    label: string;
    matches: Array<{
      outerHTML: string;
      motherOuterHTML: string | null;
      childOuterHTMLs: string[];
    }>;
  }[] = await page.evaluate((labels: string[]) => {
    const normLabels = labels.map(l => l.trim().toLowerCase());
    const elems = Array.from(document.querySelectorAll('input,textarea,button,label,a,span,aria-label'));
    const results = labels.map(label => ({ label, matches: [] as any[] }));

    function normalize(text: string) {
      return text.trim().toLowerCase();
    }

    function getNextDOMElements(el: Element, count: number): string[] {
      const result: string[] = [];
      let current = el;
      let found = 0;

      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_ELEMENT,
        null
      );

      // Move to the current element in the tree
      while (walker.currentNode !== current && walker.nextNode());

      // Collect next elements in document order
      while (walker.nextNode() && found < count) {
        const nextEl = walker.currentNode as Element;
        result.push(nextEl.outerHTML);
        found++;
      }

      return result;
    }

    function getAllChildElements(el: Element): string[] {
      return Array.from(el.querySelectorAll('*')).map(child => child.outerHTML);
    }

    function getMotherOuterHTML(el: Element): string | null {
      return el.parentElement ? el.parentElement.outerHTML : null;
    }

    for (const el of elems) {
      const text = normalize(el.textContent || '');
      const title = (el.getAttribute('title') || '').trim().toLowerCase();
      const aria = (el.getAttribute('aria-label') || '').trim().toLowerCase();
      const placeholder = (el.getAttribute('placeholder') || '').trim().toLowerCase();

      for (let i = 0; i < labels.length; i++) {
        const label = labels[i];
        const norm = normLabels[i];
        const isSave = norm === 'save';

        const matchesLabel =
          (isSave && text.startsWith('save')) ||
          title === norm ||
          text === norm ||
          aria === norm ||
          placeholder === norm;

        if (matchesLabel) {
          const children = getAllChildElements(el);
          const nextElems = getNextDOMElements(el, 3); // next 3 DOM elements
          results[i].matches.push({
            outerHTML: el.outerHTML,
            motherOuterHTML: getMotherOuterHTML(el),
            childOuterHTMLs: [...children, ...nextElems],
          });
        }
      }
    }

    return results;
  }, labels);

  await browser.close();

  const output: OutputItem[] = rawMatches.map(({ label, matches }) => ({
    label,
    matches: matches.map(m => ({
      parent_outerHTML: m.motherOuterHTML || '',
      element_outerHTML: m.outerHTML,
      child_elements: m.childOuterHTMLs,
    })),
  }));

  const dir = path.dirname(outPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`✅ UI elements extracted and saved to ${outPath}`);
}
