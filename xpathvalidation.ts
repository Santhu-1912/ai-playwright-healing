// validate-xpaths.ts

import * as fs from "fs";
import { JSDOM } from "jsdom";

// --- Input Section ---

// Path to the failed DOM HTML file
const domHtmlPath = "C:\\project-z\\Playwright__Practise\\failures\\Invoice_creation_UI_2025-08-05T01-17-19-297Z\\faileddom.html";

// Example locator map (replace this with your real locator vars & xpaths)
const locatorMap: Record<string, string> = {
  home: "xpath=//a[@id='pt1:_UIShome' and @title='Home']",
  payables: "xpath=//a[@id='groupNode_payables' and text()='Payables']",
};

// --- Validation Function ---

function validateXPathsInDOM(html: string, locators: Record<string, string>) {
  const dom = new JSDOM(html);
  const document = dom.window.document;

  const results: Record<string, boolean> = {};
  for (const [key, xpath] of Object.entries(locators)) {
    const cleanXpath = xpath.replace(/^xpath=/, "");
    try {
      const res = document.evaluate(
        cleanXpath,
        document,
        null,
        dom.window.XPathResult.ANY_TYPE,
        null
      );
      results[key] = !!res.iterateNext();
    } catch (error) {
      results[key] = false;
    }
  }
  return results;
}

// --- Main ---

function main() {
  if (!fs.existsSync(domHtmlPath)) {
    console.error("DOM HTML file not found:", domHtmlPath);
    process.exit(1);
  }

  const htmlString = fs.readFileSync(domHtmlPath, "utf-8");

  const results = validateXPathsInDOM(htmlString, locatorMap);

  for (const [key, isValid] of Object.entries(results)) {
    if (isValid) {
      console.log(`✅ ${key} is valid.`);
    } else {
      console.log(`❌ ${key} is INVALID.`);
    }
  }
}

main();
