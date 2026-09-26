/**
 * The lobby kiosk's only three doors into the database.
 *
 * THE KIOSK READS NOTHING DIRECTLY, and that is an invariant rather than a
 * habit. It holds no module grant — deliberately, because any grant lifts the
 * RESTRICTIVE policy on public.profiles and hands an unattended tablet the
 * name and email of every user in the branch — so a plain PostgREST read
 * returns it zero rows. Everything here is a SECURITY DEFINER function that
 * returns the narrowest thing one screen needs.
 *
 * If a future kiosk screen needs more, it gets another function. Not a grant.
 */

import { supabase } from "@/integrations/supabase/client";
import { throwRpc } from "./rpcError";

const church = () => supabase.schema("church");

export interface KioskBootstrap {
  kids_session_id: string;
  session_label: string;
  session_date: string;
  status: string;
  station_name: string | null;
  /** False when this tablet's registration is unknown or has been revoked. */
  station_known: boolean;
  open_room_count: number;
}

export interface KioskChild {
  household_id: string;
  household_name: string;
  child_person_id: string;
  child_name: string;
  photo_path: string | null;
  grade_name: string | null;
  already_checked_in: boolean;
}

export const kioskService = {
  /**
   * What is running this morning, and whether this tablet is still trusted.
   *
   * Also the heartbeat: the office gets a "which kiosks are alive" view at
   * 8:55 on a Sunday, which is the thing somebody actually wants.
   */
  async bootstrap(stationId: string | null): Promise<KioskBootstrap | null> {
    // The tablet's OWN date, not the database's. current_date in Postgres is
    // UTC, so at 9pm Eastern on a Sunday it is already Monday there and a
    // session dated Sunday matched nothing - which told a parent standing at
    // the tablet to go and find a volunteer.
    const now = new Date();
    const today = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
    ].join("-");

    const { data, error } = await church().rpc("kiosk_session_bootstrap", {
      _station_id: stationId,
      _today: today,
    });
    throwRpc(error);
    return (data as unknown as KioskBootstrap[] | null)?.[0] ?? null;
  },

  /**
   * Find my children, by the full phone number and nothing else.
   *
   * Ten digits or it refuses. No name search, no prefix match, no search on
   * three characters as the staffed desk does — on an unattended lobby device
   * that would be a browsable directory of the congregation's children.
   */
  async findByPhone(
    kidsSessionId: string,
    phone: string,
    stationId: string | null,
  ): Promise<KioskChild[]> {
    const { data, error } = await church().rpc("kiosk_find_household_by_phone", {
      _kids_session_id: kidsSessionId,
      _phone: phone,
      _station_id: stationId,
    });
    throwRpc(error);
    return (data ?? []) as unknown as KioskChild[];
  },

  /** Registers this device once, on first setup. */
  async registerStation(v: {
    code: string;
    name: string;
    deviceType?: string;
    locationNote?: string | null;
  }): Promise<{ station_id: string; station_name: string } | null> {
    const { data, error } = await church().rpc("kiosk_register_station", {
      _code: v.code,
      _name: v.name,
      _device_type: v.deviceType ?? "tablet",
      _location_note: v.locationNote ?? null,
    });
    throwRpc(error);
    return (
      (data as unknown as { station_id: string; station_name: string }[] | null)?.[0] ??
      null
    );
  },
};
