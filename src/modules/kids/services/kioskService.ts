/**
 * The lobby kiosk's only four doors into the database.
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
import type { StationRoom } from "../types";

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

/*
 * NO suggested_room HERE, deliberately. kiosk_find_household_by_phone does not
 * compute one, and the kiosk does not need it: a parent who touches nothing
 * sends a null and church.pick_room_for_child() decides at commit time, which
 * is what keeps two rooms sharing a grade self-balancing instead of taking a
 * morning's families into whichever was emptiest at 9:02. The done screen then
 * names the room each child actually got, from the rows the database returned.
 */

/**
 * One classroom a parent may choose between.
 *
 * NARROWED FROM StationRoom ON ARRIVAL. The desk's row also carries a live
 * headcount and the first names of the room's standing teachers - reasonable
 * for a volunteer behind a desk, and not something an unattended screen in a
 * lobby should be able to reach. Mapping to this shape inside sessionRooms()
 * is what stops it: `is_full` is the whole of what the choice needs, and the
 * whole of what comes back out.
 */
export interface KioskRoom {
  room_id: string;
  room_name: string;
  grade_name: string | null;
  is_full: boolean;
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

  /**
   * The classrooms a parent may choose between.
   *
   * THE DESK'S OWN FUNCTION, not a kiosk twin of it. station_session_rooms
   * already reconciles a session whose rooms were never attached, already
   * orders them Pre-K to Grade 8, and already does the capacity arithmetic the
   * volunteers see every Sunday. A second copy would be a second thing to keep
   * in step, and the desk and the lobby disagreeing about which rooms are open
   * is a worse failure than the one a kiosk-only function would prevent.
   *
   * NO NEW DOOR NEEDED, so the invariant at the top of this file holds
   * unchanged: resolve_actor gives a kiosk can_check_in, which is the only
   * thing that function asks of its caller. Still SECURITY DEFINER, still not
   * a grant.
   *
   * ONE THING A KIOSK-ONLY FUNCTION COULD DO AND THIS CANNOT: it takes no
   * station id, so a revoked tablet is still listed the classrooms. That is
   * not a way in - kiosk_find_household_by_phone finds a revoked tablet no
   * family, so it has nobody to put in a room.
   */
  async sessionRooms(kidsSessionId: string): Promise<KioskRoom[]> {
    const { data, error } = await church().rpc("station_session_rooms", {
      _kids_session_id: kidsSessionId,
      _shift_token: null,
    });
    throwRpc(error);
    const rows = (data ?? []) as unknown as StationRoom[];
    return rows.map((r) => ({
      room_id: r.room_id,
      room_name: r.room_name,
      grade_name: r.grade_name,
      // The same two numbers the desk reads off the same row. A room with no
      // capacity set is never full.
      is_full: r.capacity != null && r.checked_in_count >= r.capacity,
    }));
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
