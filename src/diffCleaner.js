export function cleanDiff(rawDiff) {
  if (!rawDiff) return "";

  let cleaned = rawDiff;

  // Convert anchor tags to: text (url)
  cleaned = cleaned.replace(
    /<a\s+[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi,
    (match, url, text) => `${text} (${url})`
  );

  // Remove remaining HTML tags
  cleaned = cleaned.replace(/<[^>]*>/g, " ");

  // Decode basic entities
  cleaned = cleaned
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

  // Normalize whitespace
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  return cleaned;
}
