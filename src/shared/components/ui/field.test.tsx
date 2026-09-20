// @vitest-environment jsdom

/**
 * A field keeps the caret while somebody types into it.
 *
 * This is a regression test for a bug with no error message and no failing
 * request: the portal's "Add a child" form threw away and rebuilt its <input>
 * on every keystroke, because its Field wrapper was declared INSIDE the
 * component body and was therefore a new component type on each render. React
 * reconciles by type, so it unmounted rather than updated, and a DOM node that
 * has been removed cannot hold focus. On a desktop the caret jumped to the
 * document after one letter. On a phone the on-screen keyboard closed with it,
 * so a parent adding their child got one character per tap.
 *
 * The second test is the control: it declares the wrapper the old way and
 * shows the failure is real, so the first test cannot quietly stop testing
 * anything. If the control ever passes, React has changed its reconciliation
 * and the guard above is no longer guarding.
 */

import { useState } from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Field } from "./field";
import { Input } from "./input";
import { Label } from "./label";

afterEach(cleanup);

/** A parent that re-renders on every keystroke, as every real form does. */
function StableForm() {
  const [name, setName] = useState("");
  return (
    <Field id="c-first" label="First name">
      <Input id="c-first" value={name} onChange={(e) => setName(e.target.value)} />
    </Field>
  );
}

function InlineForm() {
  const [name, setName] = useState("");
  // Exactly what the three dialogs used to do.
  const Local = ({ id, label, children }: { id: string; label: string; children: React.ReactNode }) => (
    <div>
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
  return (
    <Local id="c-first" label="First name">
      <Input id="c-first" value={name} onChange={(e) => setName(e.target.value)} />
    </Local>
  );
}

describe("Field", () => {
  it("holds focus and every character typed into it", async () => {
    const user = userEvent.setup();
    render(<StableForm />);

    const input = screen.getByLabelText("First name");
    await user.click(input);
    await user.keyboard("Selam");

    expect((input as HTMLInputElement).value).toBe("Selam");
    // The same node, still focused — not a replacement that happens to look alike.
    expect(document.activeElement).toBe(input);
  });

  it("labels the control, so a tap on the label reaches the input", async () => {
    const user = userEvent.setup();
    render(<StableForm />);

    await user.click(screen.getByText("First name"));
    expect(document.activeElement).toBe(screen.getByLabelText("First name"));
  });

  it("CONTROL: a wrapper declared inside the component loses both", async () => {
    const user = userEvent.setup();
    render(<InlineForm />);

    const input = screen.getByLabelText("First name");
    await user.click(input);
    await user.keyboard("Selam");

    // One character lands, then the input it landed in ceases to exist.
    expect((input as HTMLInputElement).value).not.toBe("Selam");
    expect(document.activeElement).not.toBe(screen.getByLabelText("First name"));
  });
});
