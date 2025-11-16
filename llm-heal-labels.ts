import * as dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  baseURL: `${process.env.AZURE_OPENAI_ENDPOINT}/openai/deployments/${process.env.AZURE_OPENAI_DEPLOYMENT_NAME}`,
  defaultQuery: { 'api-version': process.env.AZURE_OPENAI_API_VERSION },
  defaultHeaders: { 'api-key': process.env.AZURE_OPENAI_API_KEY },
});

// Oracle-protected canonical field labels — do not suggest replacements for these
const protectedLabels = new Set([
  "Number", "Invoice Number", "Invoice Date", "Invoice Amount", "Invoice Type", "Invoice Status",
  "Supplier Site", "Payment Terms", "Invoice Currency", "Invoice Description", "Invoice Source",
  "Supplier Number", "Supplier Name", "Supplier Type", "Supplier Status", "Supplier Category",
  "Supplier Taxpayer ID", "Supplier Creation Source", "Supplier Contact", "Supplier Address",
  "Payment Number", "Payment Method", "Payment Date", "Payment Status", "Payment Currency",
  "Amount Paid", "Discount Amount", "Tax Amount", "PO Number", "PO Date", "PO Status", "PO Type",
  "Buyer Name", "Requester", "Line Number", "Item Number", "Quantity Ordered", "Document Number",
  "Transaction Number", "Reference Number", "Batch Number", "Sequence Number"
]);

function normalizeLabel(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, ' ');
}

export async function healLabelsWithLLM(
  originalLabels: string[],
  detectedLabels: string[]
): Promise<Record<string, string>> {
  const healedLabels: Record<string, string> = {};

  const normalizedDetectedSet = new Set(detectedLabels.map(normalizeLabel));

  for (const label of originalLabels) {
    const normalized = normalizeLabel(label);

    // If it's protected, skip
    if (protectedLabels.has(label)) continue;

    // If an exact match or fuzzy match exists, skip
    const hasCloseMatch = Array.from(normalizedDetectedSet).some(
      detected => detected === normalized
    );
    if (hasCloseMatch) continue;

    // No match found — now call LLM
    const prompt = `
You are an expert Oracle Cloud ERP label verifier.

We are verifying if a UI field label from our test scripts is still valid.

Given:
- Original label: "${label}"
- A list of current extracted field labels from the latest Oracle Fusion UI.

Step 1:
Check if the original label is still present in the extracted labels with:
- Minor typos (e.g., "Invoce Number" → "Invoice Number")
- Spacing issues (e.g., "SupplierName" → "Supplier Name")

- Casing differences
Step 2:
If no exact match is found, also check for known semantic equivalences. For example:
- [User Name, usr, User ID, user]
- [Password, pwd, pass, passwd]
- [Sign In, Login]

If any of the extracted labels semantically match the original based on these equivalence groups, consider it a match.

Step 3:
If no match, then and only then suggest a likely Oracle rename (e.g., "Business Unit" → "Operating Unit")

❌ Do not guess or hallucinate.
❌ If no match exists, reply with exactly: no match

✅ Respond with:
- The corrected label if found
- Or just: no match

Extracted Labels:
${detectedLabels.map(l => `- ${l}`).join('\n')}
`;

    try {
      const response = await openai.chat.completions.create({
        model: process.env.AZURE_OPENAI_DEPLOYMENT_NAME!,
        messages: [
          {
            role: 'system',
            content: 'You are a strict Oracle UI field label verifier. Never hallucinate.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
      });

      const suggestion = response.choices[0].message?.content?.trim() || '';

      if (suggestion.toLowerCase() !== 'no match') {
        healedLabels[label] = suggestion;
      }
    } catch (err) {
      console.error(`❌ Error healing label "${label}":`, err);
    }
  }

  return healedLabels;
}
