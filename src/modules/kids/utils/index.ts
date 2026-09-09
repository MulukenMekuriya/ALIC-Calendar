/**
 * Kids module utilities (pure)
 */

export {
  reduce,
  initialContext,
  shouldAutoReset,
  showsFamilyData,
} from "./checkInMachine";
export type {
  StationState,
  MachineContext,
  MachineEvent,
  HouseholdMatch,
  CheckedInChild,
} from "./checkInMachine";

export {
  buildChildLabel,
  buildParentLabel,
  buildLabelDocument,
  LABEL_CSS,
} from "./labelTemplate";
export type { ChildLabelData, ParentLabelData } from "./labelTemplate";

export { formatSessionDate, parseIsoDate, formatClockTime } from "./sessionDate";
