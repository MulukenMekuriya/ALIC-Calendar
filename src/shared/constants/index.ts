/**
 * Shared constants used across all modules
 */

export { STRIPE_GIVING_URL, GIVING_METHODS_SUMMARY } from "./giving";

// Application-wide constants
export const APP_NAME = "Church Management System";
export const APP_SHORT_NAME = "CMS";

// Pagination defaults
export const DEFAULT_PAGE_SIZE = 10;
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

// Date/Time formats
export const DATE_FORMAT = "yyyy-MM-dd";
export const TIME_FORMAT = "HH:mm";
export const DATETIME_FORMAT = "yyyy-MM-dd HH:mm";
export const DISPLAY_DATE_FORMAT = "MMM d, yyyy";
export const DISPLAY_TIME_FORMAT = "h:mm a";
export const DISPLAY_DATETIME_FORMAT = "MMM d, yyyy h:mm a";

// Status colors (for badges, etc.)
export const STATUS_COLORS = {
  draft: "bg-gray-100 text-gray-800",
  pending_review: "bg-yellow-100 text-yellow-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  published: "bg-blue-100 text-blue-800",
  active: "bg-green-100 text-green-800",
  inactive: "bg-gray-100 text-gray-800",
} as const;

// Role labels
export const ROLE_LABELS: Record<string, string> = {
  admin: "Administrator",
  contributor: "Contributor",
};

// Navigation structure (for sidebar)
export const NAVIGATION_ITEMS = {
  calendar: {
    label: "Calendar",
    icon: "Calendar",
    href: "/dashboard",
    module: "calendar",
  },
  admin: {
    label: "Event Review",
    icon: "Shield",
    href: "/admin",
    module: "admin",
    adminOnly: true,
  },
  rooms: {
    label: "Rooms",
    icon: "DoorOpen",
    href: "/rooms",
    module: "rooms",
    adminOnly: true,
  },
  users: {
    label: "Users",
    icon: "Users",
    href: "/users",
    module: "users",
    adminOnly: true,
  },
  inventory: {
    label: "Inventory",
    icon: "Package",
    href: "/inventory",
    module: "inventory",
    adminOnly: true,
    comingSoon: true,
  },
  budget: {
    label: "Budget",
    icon: "DollarSign",
    href: "/budget",
    module: "budget",
    adminOnly: true,
    comingSoon: true,
  },
  members: {
    label: "Members",
    icon: "UserCheck",
    href: "/members",
    module: "members",
    adminOnly: true,
    comingSoon: true,
  },
} as const;

// API endpoints
export const API_ENDPOINTS = {
  EVENTS: "/events",
  ROOMS: "/rooms",
  USERS: "/users",
  ORGANIZATIONS: "/organizations",
  INVENTORY: "/inventory",
  BUDGET: "/budget",
  MEMBERS: "/members",
} as const;

// Local storage keys
export const STORAGE_KEYS = {
  THEME: "cms-theme",
  SIDEBAR_STATE: "cms-sidebar-state",
  CALENDAR_VIEW: "cms-calendar-view",
  SELECTED_ORG: "cms-selected-org",
} as const;
