/**
 * Every word the kiosk says, in one place.
 *
 * A significant part of this congregation is Amharic-speaking, and
 * retrofitting i18n into a finished kiosk is the expensive version of this
 * job. So the strings go through one module from the day it ships, even
 * though only English is written yet: adding a second language later becomes
 * a second object rather than a hunt through JSX.
 *
 * THE DESIGN RULE FOR EVERY MESSAGE HERE: the kiosk never leaves a family
 * with a dead end. There is no volunteer standing behind it to fill the gap,
 * so every error names the next thing to do, and when there is nothing the
 * screen can do it says "see a Kids Ministry volunteer" in large type rather
 * than showing a spinner or a code.
 */

export const kioskStrings = {
  /** The idle screen. */
  welcome: "Welcome",
  welcomeSub: "Tap to check your children in",
  begin: "Start",

  /** The keypad. */
  enterPhone: "Your mobile number",
  enterPhoneHelp: "The number the church has for you, all ten digits",
  clear: "Clear",
  back: "Back",
  find: "Find my children",
  searching: "Looking…",

  /** Choosing children. */
  whoIsHere: "Who is here this morning?",
  tapToInclude: "Tap a child to include or leave out",
  alreadyIn: "Already checked in",
  checkIn: (n: number) => `Check in ${n} ${n === 1 ? "child" : "children"}`,
  noneSelected: "Tap at least one child",

  /**
   * Choosing a classroom, in the dropdown under each child.
   *
   * The word is "classroom", never "room" — a parent reads "room" as a
   * building, and the printed label says classroom too.
   */
  classroomLabel: "Classroom",
  /**
   * The first option, and the one selected until a parent touches the list.
   *
   * It says how the classroom is decided rather than naming one, because the
   * kiosk is not told the answer: pick_room_for_child decides at commit time
   * and weighs a standing room preference and an age band as well as a grade.
   * The last screen names the classroom each child actually got.
   */
  byGradeOption: "Chosen by their grade",
  /** Listed so a parent can see it exists, but it cannot be picked. */
  fullOption: (name: string) => `${name} — full`,

  /** The result. */
  allDone: "All done",
  yourCode: "Your pick-up code",
  /** Where each child went, on the last screen, so a parent can walk them there. */
  takeThemTo: "Take them to",
  keepCode: "You will need this code to collect them",
  printing: "Printing your labels…",
  startAgain: "Done",

  /** Things that go wrong, each naming the next step. */
  notFound:
    "We could not find that number. Please check it, or see a Kids Ministry volunteer who can look you up.",
  tooManyTries:
    "Please see a Kids Ministry volunteer, who will check you in.",
  needTenDigits: "Please enter all ten digits of your mobile number.",
  noSession:
    "Check-in is not open just now. Please see a Kids Ministry volunteer.",

  /**
   * A full or closed classroom, which a parent can now actually hit because a
   * parent can now actually choose one. Both name the way out — the list under
   * the child's name — because on this screen there is nobody else to name.
   */
  classroomFull:
    "That classroom is full now. Please choose another one from the list under your child's name, or see a Kids Ministry volunteer who can make room.",
  classroomClosed:
    "That classroom has just closed. Please choose another one from the list under your child's name.",
  noClassroom:
    "No classroom is open for your children yet. Please see a Kids Ministry volunteer.",

  /**
   * Offline. A self-service device that cannot reach the database has nothing
   * useful left to offer, and it cannot ask a parent to fill in a paper sheet
   * it does not have. So it says one thing, in large type, and stops.
   */
  offlineTitle: "Please see a Kids Ministry volunteer",
  offlineBody:
    "This screen has lost its connection, so it cannot check anyone in. A volunteer will do it for you.",

  /**
   * The printer failed. The code is the credential, so it stays on screen
   * until somebody dismisses it, and a parent must never walk away from a
   * kiosk holding nothing.
   */
  printFailedTitle: "Please write this code down",
  printFailedBody:
    "The label printer is not responding. Your code is below and it works exactly the same — write it on a paper ticket, or show this screen to a volunteer.",

  /** A device nobody registered, or one that was revoked. */
  deviceUnknownTitle: "This tablet needs setting up",
  deviceUnknownBody:
    "Please see a Kids Ministry leader. Check-in will work again once it is registered.",

  /**
   * The desk's two dialogs, in a parent's words. The desk's buttons say
   * "Visiting family" and "Lost slip" to a volunteer; a parent reads the
   * question they were already asking themselves.
   */
  visiting: "First time here?",
  lostSlip: "Lost your slip?",

  /**
   * A lost slip, replaced with the same code — the one on the children's
   * tags. Said in words, so a parent does not wonder which slip to trust.
   */
  newSlipTitle: "Here is your new slip",
  newSlipBody:
    "It has the same code as before, so it matches your children's tags. You will need this code to collect them.",
} as const;

export type KioskStrings = typeof kioskStrings;
