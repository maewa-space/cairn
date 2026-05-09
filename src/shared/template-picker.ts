// Slimmed-down template descriptor used by the auto-pick flow. Mirrors
// just the fields the LLM needs to make a routing decision; the full
// Template interface (including system prompt + body) lives in types.ts.

export interface TemplateChoice {
  id: string;
  name: string;
  description: string;
}
