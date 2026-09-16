/**
 * The published church calendar, as a member sees it.
 *
 * Its own component because it is the one card on the portal that works for a
 * login with NO member record behind it yet. public.events publishes to
 * anonymous visitors — that is what /public is — so an account waiting to be
 * linked can be told what is on at church this week without being told
 * anything about anybody. Showing that account an apology and a blank page,
 * while a stranger on the website reads the same calendar, would be the portal
 * being worse than the front door.
 */

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import { CalendarDays, MapPin } from "lucide-react";
import { describeWhen } from "../utils/whenIsIt";
import type { UpcomingEvent } from "../types";

interface WhatsOnCardProps {
  events: UpcomingEvent[] | undefined;
  now: Date;
  /**
   * The overview shows the soonest event in its own hero card above this one,
   * so it asks this card to skip it rather than print it twice. The unlinked
   * panel has no hero and lists everything.
   */
  skipFirst?: boolean;
}

export function WhatsOnCard({ events, now, skipFirst = false }: WhatsOnCardProps) {
  const all = events ?? [];
  const shown = skipFirst ? all.slice(1) : all;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarDays className="h-4 w-4" />
          What is on
        </CardTitle>
        <CardDescription>
          The published church calendar — the same one on the public site.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {all.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing on the calendar yet. Events appear here once the office
            publishes them.
          </p>
        ) : shown.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {all[0].title} is the only thing currently published.
          </p>
        ) : (
          shown.map((event) => {
            const when = describeWhen(event.starts_at, event.ends_at, now);
            return (
              <div key={event.id} className="flex items-baseline justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{event.title}</p>
                  {event.room_name && (
                    <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                      <MapPin className="h-3 w-3 shrink-0" />
                      {event.room_name}
                    </p>
                  )}
                </div>
                <p
                  className={`text-xs whitespace-nowrap ${
                    when.isNow ? "font-medium text-primary" : "text-muted-foreground"
                  }`}
                >
                  {when.label}
                </p>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
