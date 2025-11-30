/**
 * Church Branding Constants
 * Central configuration for church branding across the application
 */

export const CHURCH_BRANDING = {
  // Church Information
  name: "Addis Lidet International Church",
  shortName: "ALIC",
  tagline: "Empowering ministry operations with faith and purpose",

  // Logo Paths
  logo: {
    main: "/alic-logo.png",
    alt: "Addis Lidet International Church Logo",
    favicon: "/favicon.ico",
  },

  // Brand Colors
  colors: {
    primary: "#b22222", // Crimson/Burgundy
    primaryDark: "#8b0000", // Dark Red
    secondary: "#10b981", // Emerald (for success states)
    accent: "#3b82f6", // Blue (for info states)
  },

  // Contact & Social
  contact: {
    website: "https://addislidet.info",
    email: "info@addislidet.info",
    phone: "",
  },

  // App Metadata
  app: {
    title: "Church Management System",
    description:
      "Comprehensive church management solution for events, rooms, budget, and member management",
    version: "1.0.0",
  },
} as const;

// Helper function to get full page title
export const getPageTitle = (pageTitle?: string): string => {
  if (pageTitle) {
    return `${pageTitle} | ${CHURCH_BRANDING.name}`;
  }
  return `${CHURCH_BRANDING.app.title} | ${CHURCH_BRANDING.name}`;
};

// Helper function to get logo with fallback
export const getLogoSrc = (customLogo?: string | null): string => {
  return customLogo || CHURCH_BRANDING.logo.main;
};
