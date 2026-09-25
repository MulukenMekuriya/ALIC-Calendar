/**
 * The order the classrooms appear in on the setup screen.
 *
 * THE BUG THIS EXISTS FOR. `ClassroomForm` has an "Order" field that writes
 * `church.room_kids_config.sort_order`, and `church.kids_live_board` orders by
 * it. The setup screen did not: it mapped straight off the name-ordered
 * `public.rooms` query, so the one screen you set the order on was the one
 * screen that ignored it, and the live board and the setup list disagreed.
 *
 * WHY A CHOICE AND NOT JUST A FIX. "Order" is right for a director checking
 * the Sunday running order, but it is useless for finding one room among
 * eighteen, and it says nothing about which grades are covered. The three
 * modes answer three different questions, so the screen offers all three
 * rather than guessing.
 *
 * NULLS LAST throughout, and always with a deterministic tie-break. A room
 * with no kids config has no order, no grade and no capacity; it sorts to the
 * bottom of whichever list it is in rather than to an arbitrary position that
 * changes between renders.
 */

export type ClassroomSort = "order" | "name" | "grade";

/** Just the shape these comparisons need, so the util does not import the service. */
export interface SortableClassroom {
  room_name: string;
  config: { sort_order?: number | null; school_grade_id?: string | null } | null;
}

export interface SortableGrade {
  id: string;
  sort_order: number;
}

/** Compare two possibly-null numbers, nulls last. 0 when neither decides it. */
function byNullableNumber(a: number | null, b: number | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

/**
 * Sort a copy of `rooms`. Never mutates its argument — the list comes from a
 * React Query cache, and sorting that in place mutates the cached value.
 */
export function sortClassrooms<T extends SortableClassroom>(
  rooms: readonly T[],
  grades: readonly SortableGrade[],
  mode: ClassroomSort
): T[] {
  const gradeOrder = new Map(grades.map((g) => [g.id, g.sort_order]));

  const keyed = rooms.map((room) => ({
    room,
    order: room.config?.sort_order ?? null,
    grade: room.config?.school_grade_id
      ? gradeOrder.get(room.config.school_grade_id) ?? null
      : null,
  }));

  keyed.sort((a, b) => {
    if (mode === "name") {
      return a.room.room_name.localeCompare(b.room.room_name);
    }
    // Grade first, then the ministry's own order, then the name. A room with
    // no grade still has a place rather than floating.
    const primary =
      mode === "grade"
        ? byNullableNumber(a.grade, b.grade)
        : byNullableNumber(a.order, b.order);
    if (primary !== 0) return primary;

    const secondary =
      mode === "grade"
        ? byNullableNumber(a.order, b.order)
        : byNullableNumber(a.grade, b.grade);
    if (secondary !== 0) return secondary;

    return a.room.room_name.localeCompare(b.room.room_name);
  });

  return keyed.map((k) => k.room);
}
