export interface ParsedTemplate {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  body: string;
}

export function parseTemplate(raw: string): ParsedTemplate {
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!fmMatch) {
    throw new Error('Template missing front-matter');
  }
  const fm = Object.fromEntries(
    fmMatch[1]
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const idx = line.indexOf(':');
        return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()];
      }),
  );
  const body = fmMatch[2].trim();

  const systemMatch = body.match(/# System\s*\n([\s\S]*?)(?:\n# |$)/);
  const systemPrompt = systemMatch ? systemMatch[1].trim() : '';
  const outputMatch = body.match(/# Output structure\s*\n([\s\S]*)$/);
  const outputBody = outputMatch ? outputMatch[1].trim() : body;

  return {
    id: fm.id,
    name: fm.name,
    description: fm.description,
    systemPrompt,
    body: outputBody,
  };
}
