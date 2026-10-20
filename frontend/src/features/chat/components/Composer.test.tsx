import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Composer } from "./Composer";

// ── Mocks ──────────────────────────────────────────────────

vi.mock("@/features/suggestions/components/HistoryAutocomplete", () => ({
  HistoryAutocomplete: () => <div data-testid="mock-autocomplete" />,
}));

vi.mock("@/features/suggestions/useQuestionHistory", () => ({
  useQuestionHistory: vi.fn().mockReturnValue({ matches: [], isLoading: false }),
}));

vi.mock("@/features/auth/guest-gate", () => ({
  useGuestGate: vi.fn(),
}));

vi.mock("@/features/auth/store", () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from "@/features/auth/store";
import { useGuestGate } from "@/features/auth/guest-gate";

const mockedUseAuth = vi.mocked(useAuth);
const mockedUseGuestGate = vi.mocked(useGuestGate);

describe("Composer", () => {
  const onRunMock = vi.fn();
  const onCancelMock = vi.fn();

  beforeEach(() => {
    // Default: Auth disabled, no user
    mockedUseAuth.mockImplementation((selector: any) =>
      selector({ enabled: false, config: null, user: null })
    );
    mockedUseGuestGate.mockImplementation((selector: any) =>
      selector({ show: vi.fn() })
    );
  });

  it("renders the textarea and run button", () => {
    render(<Composer onRun={onRunMock} state="idle" />);
    expect(screen.getByPlaceholderText(/Ask your data/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Run/i })).toBeDisabled();
  });

  it("enables the button when text is entered", async () => {
    const user = userEvent.setup();
    render(<Composer onRun={onRunMock} state="idle" />);

    const input = screen.getByPlaceholderText(/Ask your data/i);
    await user.type(input, "Hello world");

    expect(screen.getByRole("button", { name: /Run/i })).toBeEnabled();
  });

  it("calls onRun on Enter key", async () => {
    const user = userEvent.setup();
    render(<Composer onRun={onRunMock} state="idle" />);

    const input = screen.getByPlaceholderText(/Ask your data/i);
    await user.type(input, "Test question{Enter}");

    expect(onRunMock).toHaveBeenCalledWith("Test question");
    expect(input).toHaveValue(""); // Clears after submit
  });

  it("calls onRun on Cmd+Enter key", async () => {
    const user = userEvent.setup();
    render(<Composer onRun={onRunMock} state="idle" />);

    const input = screen.getByPlaceholderText(/Ask your data/i);
    await user.type(input, "Test question{Ctrl>}{Enter}{/Ctrl}");

    expect(onRunMock).toHaveBeenCalledWith("Test question");
  });

  it("shows cancel button and calls onCancel when running", async () => {
    const user = userEvent.setup();
    render(<Composer onRun={onRunMock} onCancel={onCancelMock} state="running" />);

    const cancelBtn = screen.getByRole("button", { name: /Cancel/i });
    expect(cancelBtn).toBeInTheDocument();

    await user.click(cancelBtn);
    expect(onCancelMock).toHaveBeenCalled();
  });

  it("shows 'Sign in to run' when in guest mode and blocks submission", async () => {
    mockedUseAuth.mockImplementation((selector: any) =>
      selector({ enabled: true, config: { guest_mode: true }, user: null })
    );
    const showMock = vi.fn();
    mockedUseGuestGate.mockImplementation((selector: any) =>
      selector({ show: showMock })
    );

    const user = userEvent.setup();
    render(<Composer onRun={onRunMock} state="idle" />);

    const btn = screen.getByRole("button", { name: /Sign in to run/i });
    await user.type(screen.getByPlaceholderText(/Ask your data/i), "Guest question");
    await user.click(btn);

    expect(onRunMock).not.toHaveBeenCalled();
    expect(showMock).toHaveBeenCalledWith(expect.stringContaining("Sign in"));
  });
});