import { describe, expect, it } from "vitest";
import { sanitizeModelTools } from "@/lib/sanitize";

describe("model tool sanitizer", () => {
  it("removes web and X search tools", () => {
    const tools = sanitizeModelTools([
      { type: "function", function: { name: "website_get_care_state" } },
      { type: "function", function: { name: "web_search" } },
      { type: "function", function: { name: "x_search" } },
    ]);
    expect(tools.map((tool) => tool.function.name)).toEqual(["website_get_care_state"]);
  });
});
