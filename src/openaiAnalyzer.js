import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 30000
});

const MAX_DIFF_CHARS = 15000;
const MAX_RETRIES = 3;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function truncateIfNeeded(text) {
  if (!text) return "";
  if (text.length <= MAX_DIFF_CHARS) return text;

  return text.slice(0, MAX_DIFF_CHARS) + "\n\n[TRUNCATED DUE TO LENGTH]";
}

function processSummary(text) {
  if (!text) return "";

  return text
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function summarizeDiff(url, cleanedDiff) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not set");
  }

  const truncatedDiff = truncateIfNeeded(cleanedDiff);

  const prompt = `
You are analyzing a website change.

URL: ${url}

Below is a cleaned textual diff of the webpage change.

Return a concise summary of what changed. Return only what's new, not what was replaced. No need to describe the whole change, just the new values.

Formatting rules:
- Use a line break before starting the list
- Prefer a short bullet list.
- Keep bullets short and precise.
- If there is truly only one minor change, return a single short sentence instead of a list.
- Use standard Markdown bullet format: "- ".

Content rules:
- Focus ONLY on meaningful content changes.
- Ignore formatting or whitespace differences.
- If numbers changed (prices, counts, dates, versions, stock levels, etc), explicitly state the previous value and the new value.
- Do not speculate.
- Do not repeat unchanged content.

Diff:
${truncatedDiff}
`;

  let attempt = 0;
  let lastError = null;

  while (attempt < MAX_RETRIES) {
    try {
      const response = await client.responses.create({
        model: "gpt-5.2-chat-latest",
        input: prompt
      });

      const summary = response.output_text;
      const processedSummary = processSummary(summary);

      return {
        summary,
        processedSummary,
        rawResponse: response,
        truncated: truncatedDiff.length !== cleanedDiff.length,
        attempts: attempt + 1
      };
    } catch (err) {
      lastError = err;
      attempt++;

      const status = err.status || 0;

      if (
        attempt < MAX_RETRIES &&
        (status === 429 || status >= 500 || err.code === "ECONNRESET")
      ) {
        const backoff = 1000 * Math.pow(2, attempt);
        await sleep(backoff);
        continue;
      }

      break;
    }
  }

  throw new Error(
    `OpenAI failed after ${attempt} attempts: ${lastError?.message}`
  );
}
