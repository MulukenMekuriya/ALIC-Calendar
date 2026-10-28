// @vitest-environment jsdom

/**
 * The fold button on "All Expense Requests".
 *
 * The one that matters most is the first of the visibility tests. Radix keeps a
 * force-mounted collapsible open, so a section built on `forceMount` without
 * hiding the content itself shows the new button, changes its label, writes
 * the summary line, and leaves all 185 rows on screen. Every other assertion
 * here passes against that version; "is not visible" is the one that does not.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CollapsibleListSection } from "./CollapsibleListSection";

const TITLE = "All Expense Requests";
const KEY = "alic.collapsed.test-section";

/**
 * Not jsdom's: on this Node, the runtime's own half-implemented localStorage
 * shadows it and reads as undefined. A real one is what these need.
 */
class MemoryStorage {
  private items = new Map<string, string>();
  get length() {
    return this.items.size;
  }
  clear() {
    this.items.clear();
  }
  getItem(key: string) {
    return this.items.has(key) ? (this.items.get(key) as string) : null;
  }
  removeItem(key: string) {
    this.items.delete(key);
  }
  setItem(key: string, value: string) {
    this.items.set(key, String(value));
  }
}

/** Stands in for a browser whose storage refuses everything. */
const blockedStorage = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
  removeItem: () => {
    throw new Error("blocked");
  },
};

const renderSection = (
  props: Partial<React.ComponentProps<typeof CollapsibleListSection>> = {},
  list: React.ReactNode = <p>the list</p>,
) =>
  render(
    <CollapsibleListSection
      title={TITLE}
      summary="185 requests · $156,200.82"
      storageKey="test-section"
      {...props}
    >
      {list}
    </CollapsibleListSection>,
  );

const foldButton = () =>
  screen.getByRole("button", { name: /^(Collapse|Expand) All Expense Requests$/ });

beforeEach(() => {
  vi.stubGlobal("localStorage", new MemoryStorage());
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("CollapsibleListSection, folding", () => {
  it("starts open, with the list showing", () => {
    renderSection();

    expect(foldButton()).toHaveAccessibleName("Collapse All Expense Requests");
    expect(foldButton()).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("the list")).toBeVisible();
  });

  it("hides the list when collapsed, and says what was folded away", async () => {
    renderSection();

    await userEvent.click(foldButton());

    expect(screen.getByText("the list")).not.toBeVisible();
    expect(foldButton()).toHaveAccessibleName("Expand All Expense Requests");
    expect(foldButton()).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("185 requests · $156,200.82")).toBeVisible();
  });

  it("shows the list again, and drops the summary, when expanded", async () => {
    renderSection();

    await userEvent.click(foldButton());
    await userEvent.click(foldButton());

    expect(screen.getByText("the list")).toBeVisible();
    expect(screen.queryByText("185 requests · $156,200.82")).toBeNull();
  });

  it("points the button at content that exists", () => {
    renderSection();

    const controls = foldButton().getAttribute("aria-controls");
    expect(controls).toBeTruthy();
    expect(document.getElementById(controls!)).toContainElement(
      screen.getByText("the list"),
    );
  });

  it("keeps what was typed inside the list across a fold", async () => {
    // The status filter lives in the list. Unmounting on fold would reset it.
    renderSection({}, <input aria-label="inside the list" />);

    await userEvent.type(screen.getByLabelText("inside the list"), "Treasury");
    await userEvent.click(foldButton());
    await userEvent.click(foldButton());

    expect(screen.getByLabelText("inside the list")).toHaveValue("Treasury");
  });
});

describe("CollapsibleListSection, not rendering what nobody opened", () => {
  it("does not render a list that starts folded until it is first opened", async () => {
    localStorage.setItem(KEY, "1");
    const List = vi.fn(() => <p>the list</p>);

    renderSection({}, <List />);

    expect(List).not.toHaveBeenCalled();
    expect(screen.queryByText("the list")).toBeNull();

    await userEvent.click(foldButton());

    expect(List).toHaveBeenCalled();
    expect(screen.getByText("the list")).toBeVisible();
  });
});

describe("CollapsibleListSection, remembering", () => {
  it("remembers a folded section, and forgets it once expanded", async () => {
    const first = renderSection();

    await userEvent.click(foldButton());
    expect(localStorage.getItem(KEY)).toBe("1");

    first.unmount();
    renderSection();
    expect(foldButton()).toHaveAccessibleName("Expand All Expense Requests");
    expect(screen.queryByText("the list")).toBeNull();

    await userEvent.click(foldButton());
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("remembers nothing without a storageKey", async () => {
    renderSection({ storageKey: undefined });

    await userEvent.click(foldButton());

    expect(localStorage.length).toBe(0);
  });

  it.each([
    // Private windows and blocked site data throw on every access...
    ["throws", blockedStorage],
    // ...and some environments have no storage object at all.
    ["is missing", undefined],
  ])("still folds when storage %s", async (_case, storage) => {
    vi.stubGlobal("localStorage", storage);

    renderSection();
    expect(screen.getByText("the list")).toBeVisible();

    await userEvent.click(foldButton());
    expect(screen.getByText("the list")).not.toBeVisible();

    await userEvent.click(foldButton());
    expect(screen.getByText("the list")).toBeVisible();
  });
});

describe("CollapsibleListSection, held open for a search", () => {
  it("opens a folded section while forced, says why, and cannot be folded", () => {
    localStorage.setItem(KEY, "1");

    renderSection({ forceOpen: true });

    expect(screen.getByText("the list")).toBeVisible();
    expect(foldButton()).toBeDisabled();
    expect(foldButton()).toHaveAccessibleDescription("Held open while you search");
    // Holding it open is not choosing to open it.
    expect(localStorage.getItem(KEY)).toBe("1");
  });

  it("goes back to what was chosen when the hold is released", () => {
    localStorage.setItem(KEY, "1");
    const view = renderSection({ forceOpen: true });
    expect(screen.getByText("the list")).toBeVisible();

    view.rerender(
      <CollapsibleListSection
        title={TITLE}
        summary="185 requests · $156,200.82"
        storageKey="test-section"
        forceOpen={false}
      >
        <p>the list</p>
      </CollapsibleListSection>,
    );

    expect(screen.getByText("the list")).not.toBeVisible();
    expect(foldButton()).toBeEnabled();
    expect(foldButton()).toHaveAccessibleName("Expand All Expense Requests");
  });
});

describe("CollapsibleListSection, not stranding the reader", () => {
  const scrollIntoView = vi.fn();

  beforeEach(() => {
    scrollIntoView.mockClear();
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView;
  });

  const sectionTop = (top: number) =>
    vi
      .spyOn(window.HTMLElement.prototype, "getBoundingClientRect")
      .mockReturnValue({ top, bottom: top + 100, left: 0, right: 0, width: 0, height: 100, x: 0, y: top, toJSON: () => ({}) });

  it("brings the header back when folding from far down the list", async () => {
    renderSection();
    sectionTop(-4000);

    await userEvent.click(foldButton());

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" });
  });

  it("does not move the page when the header is already in view", async () => {
    renderSection();
    sectionTop(300);

    await userEvent.click(foldButton());

    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("does not move the page when expanding", async () => {
    localStorage.setItem(KEY, "1");
    renderSection();
    sectionTop(-4000);

    await userEvent.click(foldButton());

    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});
