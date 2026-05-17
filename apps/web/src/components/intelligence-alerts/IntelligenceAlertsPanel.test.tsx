import { describe, it, expect, vi, afterEach } from "vitest";
import { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { NewsSignal } from "../../api/engine";
import { IntelligenceAlertsPanel } from "./IntelligenceAlertsPanel";
import type { IntelligenceAlertsPanelProps } from "./IntelligenceAlertsPanel";

afterEach(() => {
  cleanup();
});

function baseProps(
  overrides: Partial<IntelligenceAlertsPanelProps> = {},
): IntelligenceAlertsPanelProps {
  return {
    open: true,
    onRequestClose: vi.fn(),
    alertFilter: "all",
    onAlertFilterChange: vi.fn(),
    signals: [],
    loading: false,
    error: null,
    webhookPings: [],
    boardValuationAlerts: [],
    newsSocketDisconnected: false,
    ...overrides,
  };
}

function BellHarness(
  overrides: Partial<IntelligenceAlertsPanelProps> = {},
) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        data-testid="nb-alerts-bell"
        onClick={() => setOpen(true)}
      >
        Alerts
      </button>
      <IntelligenceAlertsPanel
        {...baseProps({
          ...overrides,
          open,
          onRequestClose: () => setOpen(false),
        })}
      />
    </>
  );
}

describe("IntelligenceAlertsPanel", () => {
  it("opens from bell", async () => {
    const user = userEvent.setup();
    render(<BellHarness />);
    expect(screen.queryByTestId("nb-alerts-panel")).toBeNull();
    await user.click(screen.getByTestId("nb-alerts-bell"));
    expect(screen.getByTestId("nb-alerts-panel")).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Intelligence Alerts" }),
    ).toBeTruthy();
  });

  it("does not render portal content when closed", () => {
    render(<IntelligenceAlertsPanel {...baseProps({ open: false })} />);
    expect(screen.queryByTestId("nb-alerts-panel")).toBeNull();
    expect(screen.queryByTestId("nb-alerts-bell")).toBeNull();
  });

  it("renders Intelligence Alerts heading when open", () => {
    render(<IntelligenceAlertsPanel {...baseProps()} />);
    expect(screen.getByRole("heading", { name: "Intelligence Alerts" })).toBeTruthy();
    expect(screen.getByTestId("nb-alerts-panel")).toBeTruthy();
  });

  it("filter pill changes invoke callback with correct signal type", async () => {
    const user = userEvent.setup();
    const onAlertFilterChange = vi.fn();
    render(
      <IntelligenceAlertsPanel
        {...baseProps({ onAlertFilterChange, alertFilter: "all" })}
      />,
    );
    await user.click(screen.getByTestId("nb-alert-filter-injury"));
    expect(onAlertFilterChange).toHaveBeenCalledWith("injury");
  });

  it("shows empty state when there are no alerts for the filter", () => {
    render(<IntelligenceAlertsPanel {...baseProps()} />);
    expect(screen.getByTestId("nb-alerts-empty").textContent ?? "").toContain(
      "No alerts for this filter.",
    );
  });

  it("shows inline empty state when webhooks exist but MLB signals are empty", () => {
    render(
      <IntelligenceAlertsPanel
        {...baseProps({
          webhookPings: [
            { id: "w1", message: "ping", at: Date.now() },
          ],
        })}
      />,
    );
    expect(
      screen.getByTestId("nb-alerts-empty-inline").textContent ?? "",
    ).toContain("No alerts for this filter.");
  });

  it("does not render raw JSON / serialized objects as alert body text", () => {
    const signals: NewsSignal[] = [
      {
        player_name: "Test Player",
        signal_type: "injury",
        severity: "medium",
        description: "Left hamstring tightness",
        effective_date: new Date().toISOString(),
        source: "club report",
      },
    ];
    render(<IntelligenceAlertsPanel {...baseProps({ signals })} />);
    expect(screen.getByText("Test Player")).toBeTruthy();
    expect(screen.getByText(/Left hamstring tightness/)).toBeTruthy();
    expect(document.body.innerHTML).not.toMatch(/\{"signals"\s*:/);
    expect(document.body.innerHTML).not.toMatch(/\[object Object\]/);
  });
});
