import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ResearchDraftedPaidCell } from "./ResearchDraftedPaidCell";

afterEach(() => {
  cleanup();
});

describe("ResearchDraftedPaidCell", () => {
  it("shows drafted sale as historical context, not a live recommendation", () => {
    render(
      <ResearchDraftedPaidCell
        display={{
          teamName: "Team H",
          formattedPrice: "$15",
          title: "Drafted by Team H for $15 (not our valuation)",
        }}
      />,
    );

    expect(screen.queryByText("Drafted")).toBeNull();
    const result = document.querySelector(".pt-research-draft-result");
    expect(result?.textContent).toContain("Team H");
    expect(result?.textContent).toContain("$15");
    expect(document.querySelector(".pt-research-draft-result")).toBeTruthy();
    expect(document.querySelector(".pt-research-draft-paid")).toBeNull();
  });
});
