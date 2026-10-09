/**
 * The questions on the consent form, as a parent answers them.
 *
 * Shared by the desk (ConsentSheet, the short form) and My Church (the full
 * form), so a question is asked the same way in both places and a fix to one
 * is a fix to both.
 *
 * ONE ANSWER TO ONE QUESTION. Snacks, extra support, off-site trips, photos
 * and the health question are each a single choice: picking one answer clears
 * the other. They were once separate checkboxes, and forms came back saying
 * "may" and "may not" to the same thing. sign_kids_consent refuses that too.
 *
 * Acknowledgments stay as separate ticks: each is a thing the parent agrees
 * to on its own, and four ticks are four things, not one.
 *
 * The words come from the document in the database, never from here.
 */

import { Checkbox } from "@/shared/components/ui/checkbox";
import { Label } from "@/shared/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/shared/components/ui/radio-group";
import { cn } from "@/lib/utils";
import {
  chosenOption,
  choose,
  isPerChild,
  isSingleChoice,
  sectionsForSurface,
  type ConsentDocument,
  type ConsentSection,
  type PerChildAnswers,
} from "../utils/consentDocument";

interface Props {
  doc: Pick<ConsentDocument, "body" | "required_acknowledgments">;
  surface: "kiosk" | "portal";
  /** The children the form covers, for the questions asked per child. */
  childList: { id: string; name: string }[];
  answers: Record<string, boolean>;
  perChild: PerChildAnswers;
  onAnswersChange: (next: Record<string, boolean>) => void;
  onPerChildChange: (next: PerChildAnswers) => void;
  /** Sections still needing an answer, to mark them. */
  unanswered?: ConsentSection[];
}

const NEEDED = "text-amber-700 dark:text-amber-500";

export function ConsentQuestions({
  doc,
  surface,
  childList,
  answers,
  perChild,
  onAnswersChange,
  onPerChildChange,
  unanswered = [],
}: Props) {
  const needs = new Set(unanswered.map((s) => s.key));
  const required = new Set(doc.required_acknowledgments);

  return (
    <div className="space-y-5">
      {sectionsForSurface(doc.body, surface)
        // Who the form covers is shown by the caller, with the children it
        // actually has; the document's own section has nothing to answer.
        .filter((section) => section.kind !== "children")
        .map((section) => (
          <section key={section.key} className="space-y-2" aria-labelledby={`q-${section.key}`}>
            <p id={`q-${section.key}`} className="text-sm font-medium">
              {section.heading}
              {needs.has(section.key) && isSingleChoice(section) && (
                <span className={NEEDED}> (choose one)</span>
              )}
            </p>
            {section.text && (
              <p className="text-xs text-muted-foreground leading-relaxed">{section.text}</p>
            )}

            {isSingleChoice(section) ? (
              isPerChild(section) ? (
                // Photo consent is per child: one answer for one child can be
                // the wrong answer for their brother.
                childList.map((child) => (
                  <div key={child.id} className="rounded-md border p-2.5 space-y-1.5">
                    <p className="text-sm font-medium">{child.name}</p>
                    <Choice
                      section={section}
                      name={`${section.key}-${child.id}`}
                      value={chosenOption(section, perChild[child.id])}
                      onChange={(key) =>
                        onPerChildChange({
                          ...perChild,
                          [child.id]: choose(section, perChild[child.id] ?? {}, key),
                        })
                      }
                    />
                  </div>
                ))
              ) : (
                <Choice
                  section={section}
                  name={section.key}
                  value={chosenOption(section, answers)}
                  onChange={(key) => onAnswersChange(choose(section, answers, key))}
                />
              )
            ) : (
              (section.options ?? []).map((option) => (
                <label key={option.key} className="flex items-start gap-2 text-sm pt-0.5">
                  <Checkbox
                    checked={answers[option.key] === true}
                    onCheckedChange={(v) =>
                      onAnswersChange({ ...answers, [option.key]: v === true })
                    }
                    className="mt-0.5"
                  />
                  <span>
                    {option.text}
                    {required.has(option.key) && answers[option.key] !== true && (
                      <span className={NEEDED}> (needed)</span>
                    )}
                  </span>
                </label>
              ))
            )}
          </section>
        ))}
    </div>
  );
}

function Choice({
  section,
  name,
  value,
  onChange,
}: {
  section: ConsentSection;
  name: string;
  value: string | null;
  onChange: (key: string) => void;
}) {
  return (
    <RadioGroup value={value ?? ""} onValueChange={onChange} className="gap-1.5">
      {(section.options ?? []).map((option) => {
        const id = `${name}-${option.key}`;
        return (
          <div
            key={option.key}
            className={cn(
              "flex items-start gap-2 rounded-md px-2 py-1.5",
              value === option.key && "bg-primary/5",
            )}
          >
            <RadioGroupItem value={option.key} id={id} className="mt-0.5" />
            <Label htmlFor={id} className="text-sm font-normal leading-snug cursor-pointer">
              {option.text}
            </Label>
          </div>
        );
      })}
    </RadioGroup>
  );
}
