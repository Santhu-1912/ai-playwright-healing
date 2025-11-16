// llm-locator.ts
import * as dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  baseURL: `${process.env.AZURE_OPENAI_ENDPOINT}/openai/deployments/${process.env.AZURE_OPENAI_DEPLOYMENT_NAME}`,
  defaultQuery: { 'api-version': process.env.AZURE_OPENAI_API_VERSION },
  defaultHeaders: { 'api-key': process.env.AZURE_OPENAI_API_KEY },
});

export async function extractLocatorViaLLM(errorMessage: string): Promise<string | null> {
  try {
    const res = await openai.chat.completions.create({
      model: process.env.AZURE_OPENAI_DEPLOYMENT_NAME!,
      messages: [
        {
          role: 'system',
          content: 'Extract the raw XPath from this Playwright error. Do not return anything else, only the XPath inside waiting for locator("...").',
        },
        { role: 'user', content: errorMessage },
      ],
      temperature: 0,
    });

    const response = res.choices[0].message?.content?.trim();
    if (response?.startsWith('locator(')) {
      const match = response.match(/locator\(\s*['"](.+?)['"]\s*\)/);
      return match ? match[1] : null;
    }
    return response || null;
  } catch (e) {
    console.error('[LLM Error]', e);
    return null;
  }
}
