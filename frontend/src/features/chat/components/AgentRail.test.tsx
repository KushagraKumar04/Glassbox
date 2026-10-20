import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AgentRail } from "./AgentRail";
import type { AgentStep } from "../types";

const mockSteps: AgentStep[] = [
  { stage: "planning", status: "done", detail: "plan ready", ts: 10 },
  { stage: "schema", status: "running", ts: 20 },
];

describe("AgentRail", () => {
  it("returns null if steps array is empty", () => {
    const { container } = render(<AgentRail steps={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders step chips and elapsed time", () => {
    render(<AgentRail steps={mockSteps} elapsedMs={1200} state="running" />);

    expect(screen.getByText("Agent activity")).toBeInTheDocument();
    expect(screen.getByText("1.2s")).toBeInTheDocument();
    
    // "Planning" appears twice (chip + detailed row)
    const planningElements = screen.getAllByText("Planning");
    expect(planningElements.length).toBeGreaterThan(0);
    
    expect(screen.getAllByText("Inspecting schema").length).toBeGreaterThan(0);
  });

  it("toggles between collapsed and expanded states via aria", async () => {
    const user = userEvent.setup();
    render(<AgentRail steps={mockSteps} state="done" />);

    // Defaults to collapsed. Button aria-label should be "Expand"
    const toggleBtn = screen.getByRole("button", { name: "Expand" });
    expect(toggleBtn).toHaveAttribute("aria-expanded", "false");

    await user.click(toggleBtn);

    // Now expanded. Button aria-label updates to "Collapse"
    const collapseBtn = screen.getByRole("button", { name: "Collapse" });
    expect(collapseBtn).toHaveAttribute("aria-expanded", "true");

    // Verify detailed rows are present in DOM (they were always there,
    // but RTL doesn't compute CSS Grid visibility, so we assert on aria)
    expect(screen.getAllByText(/10\s*ms/).length).toBeGreaterThan(0);
  });

  it("renders error states correctly", () => {
    const errSteps: AgentStep[] = [
      { stage: "planning", status: "done", ts: 5 },
      { stage: "query", status: "error", detail: "Syntax error", ts: 50 },
    ];
    render(<AgentRail steps={errSteps} state="error" />);
    
    // The error chip uses the exact detail as a title attribute
    expect(screen.getByTitle("Syntax error")).toBeInTheDocument();
  });
});