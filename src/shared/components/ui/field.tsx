/**
 * A label over a control, which is the whole of it — and yet it earns a file.
 *
 * THE BUG IT EXISTS TO END. Three dialogs had each written this same six-line
 * wrapper INSIDE their component body:
 *
 *     export function ChildDialog() {
 *       const Field = ({ id, label, children }) => ( ... );   // <- here
 *       return <Field id="c-first" label="First name"><Input … /></Field>;
 *     }
 *
 * Declared there, `Field` is a new function — and therefore a new component
 * TYPE — on every single render. React reconciles by type, so on each keystroke
 * it did not update the input: it unmounted the old Field and mounted a fresh
 * one, throwing the <input> DOM node away and building another. A DOM node that
 * no longer exists cannot hold the caret, so focus went back to the document.
 * On a desktop that reads as "the cursor jumps out after one letter". On a
 * phone the on-screen keyboard closes with it, which made the portal's forms
 * essentially untypeable: one character, dismiss, tap, one character.
 *
 * At module scope the type is stable, the input is updated rather than
 * replaced, and the caret stays where the person put it.
 */

import * as React from "react";

import { Label } from "@/shared/components/ui/label";
import { cn } from "@/lib/utils";

interface FieldProps {
  /** Must match the control's own id — this is what makes the label tappable. */
  id: string;
  label: string;
  children: React.ReactNode;
  className?: string;
}

export function Field({ id, label, children, className }: FieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      {children}
    </div>
  );
}
