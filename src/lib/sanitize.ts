const BLOCKED_TOOL = /search|browse_page|web_search|x_search|xai_search/i;

export type ToolSpec = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: unknown;
  };
};

export function sanitizeModelTools(tools: ToolSpec[]): ToolSpec[] {
  return tools.filter((tool) => !BLOCKED_TOOL.test(tool.function.name));
}

export function assertNoSearch(body: unknown): void {
  const serialized = JSON.stringify(body);
  if (/"tools"\s*:/.test(serialized) && /web_search|x_search/.test(serialized)) {
    throw new Error("Refusing a request that enables web or X search.");
  }
  if (/"web_search"|"x_search"/.test(serialized)) {
    throw new Error("Refusing a request that names web or X search.");
  }
}
