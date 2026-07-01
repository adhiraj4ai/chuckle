import { describe, it, expect } from "vitest";
import { hasDiagram } from "../src/index.js";

describe("hasDiagram", () => {
  it("matches a mermaid fenced block", () => {
    expect(hasDiagram("intro\n```mermaid\ngraph TD; A-->B\n```\n")).toBe(true);
  });
  it("matches a mermaid fence with leading whitespace and uppercase info", () => {
    expect(hasDiagram("  ```Mermaid\nsequenceDiagram\n```")).toBe(true);
  });
  it("matches a mermaid fence at the very start of the string", () => {
    expect(hasDiagram("```mermaid\nflowchart LR\n```")).toBe(true);
  });
  it("matches a markdown embedded image", () => {
    expect(hasDiagram("see ![architecture](./diagram.png) here")).toBe(true);
  });
  it("does NOT match prose or a plain code fence", () => {
    expect(hasDiagram("# Title\n\nsome prose\n\n```ts\nconst x = 1\n```")).toBe(false);
  });
  it("does NOT match a plantuml fence (v1 scope: mermaid only)", () => {
    expect(hasDiagram("```plantuml\n@startuml\n@enduml\n```")).toBe(false);
  });
  it("does NOT match a plain link (no leading !)", () => {
    expect(hasDiagram("[docs](https://example.com)")).toBe(false);
  });
  it("does NOT match an image with an empty url", () => {
    expect(hasDiagram("![alt]()")).toBe(false);
  });
});
