/**
 * Incident reports — a door of its own, for two different people.
 *
 * WHY IT IS A ROUTE AND NOT A TAB ON /kids. Teachers hold kids_volunteer,
 * which grants kids.checkin and deliberately NOT kids.read, so they cannot
 * open the Kids Ministry dashboard at all. A tab there would be invisible to
 * exactly the people who write these reports. Its own capability-gated route
 * puts it within a teacher's reach without handing them the admin board.
 *
 * So one page, two faces: a teacher gets a form and their own history; a
 * leader gets the review queue. A leader holds both capabilities and sees
 * both.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "@/shared/components/layout/DashboardLayout";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { ArrowLeft } from "lucide-react";
import { useOrganization } from "@/shared/contexts/OrganizationContext";
import { useCapabilities } from "@/shared/hooks/useCapabilities";
import { IncidentsTab } from "../components/IncidentsTab";
import { RaiseIncidentCard } from "../components/RaiseIncidentCard";

export default function IncidentsPage() {
  const navigate = useNavigate();
  const { currentOrganization } = useOrganization();
  const { can } = useCapabilities();
  const orgId = currentOrganization?.id;

  const isLeader = can("kids.write");
  const [tab, setTab] = useState<"mine" | "queue">(isLeader ? "queue" : "mine");

  return (
    <DashboardLayout>
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        {isLeader && (
          <Button variant="ghost" size="sm" onClick={() => navigate("/kids")}>
            <ArrowLeft className="h-4 w-4" />
            Kids Ministry
          </Button>
        )}
        <h1 className="text-xl font-semibold">Incident reports</h1>
      </div>

      {isLeader && (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={tab === "queue" ? "default" : "outline"}
            onClick={() => setTab("queue")}
          >
            To review
          </Button>
          <Button
            size="sm"
            variant={tab === "mine" ? "default" : "outline"}
            onClick={() => setTab("mine")}
          >
            Raise one
          </Button>
        </div>
      )}

      {tab === "queue" && isLeader ? (
        <IncidentsTab organizationId={orgId} />
      ) : (
        <RaiseIncidentCard organizationId={orgId} />
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">What happens next</CardTitle>
          <CardDescription>
            A Kids Ministry leader reads every report. They decide whether the
            family is told — and for anything about a child's safety, whether
            it goes further.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            <Badge variant="secondary" className="mr-1.5">
              Behaviour
            </Badge>
            Something that happened in the room. A leader decides whether to
            write to the family.
          </p>
          <p>
            <Badge variant="destructive" className="mr-1.5">
              Injury
            </Badge>
            Somebody was hurt. Leaders are told straight away, and the family
            is normally told too.
          </p>
          <p>
            <Badge variant="destructive" className="mr-1.5">
              Safeguarding
            </Badge>
            About a child's safety or wellbeing. Leaders only. This is never
            emailed to a family — and reporting it to the authorities is not
            something this form does for you, nor something you need permission
            for.
          </p>
        </CardContent>
      </Card>
    </div>
    </DashboardLayout>
  );
}
