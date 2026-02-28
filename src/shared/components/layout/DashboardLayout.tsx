import { ReactNode, useState, useEffect, useRef } from "react";
import { useAuth } from "@/shared/contexts/AuthContext";
import { useOrganization } from "@/shared/contexts/OrganizationContext";
import { Button } from "@/shared/components/ui/button";
import { Badge } from "@/shared/components/ui/badge";
import { Avatar, AvatarFallback } from "@/shared/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/shared/components/ui/popover";
import { Input } from "@/shared/components/ui/input";
import { useSearch } from "@/shared/contexts/SearchContext";
import { getLogoSrc } from "@/shared/constants/branding";
import {
  LogOut,
  Users,
  Settings,
  DoorOpen,
  Menu,
  ChevronRight,
  ChevronDown,
  Home,
  Bell,
  Search,
  Package,
  DollarSign,
  UserCheck,
  Building,
  X,
  LayoutDashboard,
  ClipboardCheck,
  ArrowRightLeft,
  Trash2,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/shared/lib/utils";

interface DashboardLayoutProps {
  children: ReactNode;
}

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  description?: string;
  comingSoon?: boolean;
  adminOnly?: boolean;
  external?: boolean; // For cross-app navigation
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const DashboardLayout = ({ children }: DashboardLayoutProps) => {
  const { user, isAdmin, signOut } = useAuth();
  const { currentOrganization } = useOrganization();
  const {
    searchQuery,
    setSearchQuery,
    isSearchOpen,
    setIsSearchOpen,
    clearSearch,
  } = useSearch();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // State for collapsible sections - all collapsed by default
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set()
  );

  // Toggle section expansion
  const toggleSection = (title: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(title)) {
        next.delete(title);
      } else {
        next.add(title);
      }
      return next;
    });
  };

  // Dashboard link (standalone, not in a collapsible group)
  const dashboardItem: NavItem = {
    name: "Dashboard",
    href: "/dashboard",
    icon: Home,
    description: "Calendar overview",
  };

  // Navigation configuration - Unified across Calendar and Inventory apps
  const navigationSections: NavSection[] = [
    {
      title: "Calendar",
      items: [
        {
          name: "Event Review",
          href: "/event-reviews",
          icon: Settings,
          description: isAdmin ? "Approve events" : "View my requests",
        },
        ...(isAdmin
          ? [
              {
                name: "Rooms",
                href: "/rooms",
                icon: DoorOpen,
                description: "Manage rooms",
                adminOnly: true,
              },
            ]
          : []),
      ],
    },
    {
      title: "Financial",
      items: [
        {
          name: "Budget",
          href: "/budget",
          icon: DollarSign,
          description: isAdmin ? "Financial management" : "My expenses",
        },
      ],
    },
    {
      title: "Inventory",
      items: [
        {
          name: "Asset Overview",
          href: "/inventory",
          icon: LayoutDashboard,
          description: "Inventory dashboard",
          external: true,
        },
        {
          name: "Assets",
          href: "/inventory/assets",
          icon: Package,
          description: "Manage assets",
          external: true,
        },
        {
          name: "Verifications",
          href: "/inventory/verification",
          icon: ClipboardCheck,
          description: "Verify inventory",
          external: true,
        },
        {
          name: "Transfers",
          href: "/inventory/transfers",
          icon: ArrowRightLeft,
          description: "Asset transfers",
          external: true,
        },
        {
          name: "Disposals",
          href: "/inventory/disposals",
          icon: Trash2,
          description: "Disposed assets",
          external: true,
        },
      ],
    },
    ...(isAdmin
      ? [
          {
            title: "Administration",
            items: [
              {
                name: "Users & Roles",
                href: "/admin/users",
                icon: Users,
                description: "Manage users",
                adminOnly: true,
                external: true,
              },
              {
                name: "Branches",
                href: "/admin/branches",
                icon: Building,
                description: "Manage branches",
                adminOnly: true,
                external: true,
              },
              {
                name: "Ministries",
                href: "/admin/ministries",
                icon: UserCheck,
                description: "Manage ministries",
                adminOnly: true,
                external: true,
              },
            ],
          },
        ]
      : []),
    ...(isAdmin
      ? [
          {
            title: "Coming Soon",
            items: [
              {
                name: "Members",
                href: "/members",
                icon: UserCheck,
                description: "Church membership",
                comingSoon: true,
                adminOnly: true,
              },
            ],
          },
        ]
      : []),
  ];

  // Flatten all navigation items for page title lookup
  const allNavItems = navigationSections.flatMap((section) => section.items);

  // Get user initials for avatar
  const getUserInitials = (name?: string) => {
    if (!name) return user?.email?.charAt(0).toUpperCase() || "U";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  // Get page title based on current route
  const getPageTitle = () => {
    const currentNav = allNavItems.find(
      (nav) => nav.href === location.pathname
    );
    return currentNav?.name || "ALIC Management";
  };

  // Close sidebar and clear search on route change
  useEffect(() => {
    setSidebarOpen(false);
    clearSearch();
    setIsSearchOpen(false);
  }, [location.pathname]);

  // Focus search input when popover opens
  useEffect(() => {
    if (isSearchOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isSearchOpen]);

  // Auto-expand section containing the current route
  useEffect(() => {
    const matchingSection = navigationSections.find((section) =>
      section.items.some((item) => {
        if (item.href === "/dashboard") {
          return location.pathname === item.href;
        }
        return (
          location.pathname === item.href ||
          location.pathname.startsWith(item.href + "/")
        );
      })
    );
    if (matchingSection) {
      setExpandedSections((prev) => {
        if (prev.has(matchingSection.title)) return prev;
        return new Set([...prev, matchingSection.title]);
      });
    }
  }, [location.pathname, isAdmin]); // Re-run when isAdmin changes (auth loads)

  // Check if a path is active (exact match or starts with for nested routes)
  const isPathActive = (href: string) => {
    if (href === "/dashboard") {
      return location.pathname === href;
    }
    return (
      location.pathname === href || location.pathname.startsWith(href + "/")
    );
  };

  const renderNavItem = (item: NavItem) => {
    const Icon = item.icon;
    const isActive = isPathActive(item.href);

    // Handle external navigation (cross-app)
    if (item.external) {
      return (
        <button
          key={item.name}
          type="button"
          onClick={() => {
            window.location.href = item.href;
          }}
          className={cn(
            "flex w-full items-center gap-3 px-3 py-2.5 rounded-lg transition-all group",
            "text-muted-foreground hover:text-foreground hover:bg-secondary"
          )}
        >
          <Icon className="h-5 w-5" />
          <div className="flex-1 text-left">
            <div className="font-medium text-sm flex items-center gap-2">
              {item.name}
            </div>
            {item.description && (
              <div className="text-xs text-muted-foreground">
                {item.description}
              </div>
            )}
          </div>
        </button>
      );
    }

    return (
      <Link
        key={item.name}
        to={item.href}
        className={cn(
          "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all group",
          isActive
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground hover:bg-secondary",
          item.comingSoon && "opacity-75"
        )}
      >
        <Icon className="h-5 w-5" />
        <div className="flex-1">
          <div className="font-medium text-sm flex items-center gap-2">
            {item.name}
            {item.comingSoon && (
              <Badge variant="outline" className="text-[10px] px-1 py-0">
                Soon
              </Badge>
            )}
          </div>
          {item.description && (
            <div
              className={cn(
                "text-xs",
                isActive
                  ? "text-primary-foreground/80"
                  : "text-muted-foreground"
              )}
            >
              {item.description}
            </div>
          )}
        </div>
        {isActive && <ChevronRight className="h-4 w-4" />}
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-[280px] bg-card border-r transform transition-transform duration-200 ease-in-out lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="p-6 border-b">
            <Link to="/dashboard" className="flex items-center gap-3">
              <div className="bg-white dark:bg-slate-800 p-2 rounded-xl border shadow-sm">
                <img
                  src={getLogoSrc(currentOrganization?.logo_url)}
                  alt="ALIC"
                  className="h-10 w-10 object-contain"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = "none";
                  }}
                />
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="font-bold text-lg truncate">ALIC</h1>
                <p className="text-xs text-muted-foreground truncate">
                  Management System
                </p>
              </div>
            </Link>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
            {/* Standalone Dashboard link */}
            <div className="mb-2">{renderNavItem(dashboardItem)}</div>

            {/* Collapsible sections */}
            {navigationSections.map((section) => {
              const isExpanded = expandedSections.has(section.title);
              return (
                <div key={section.title} className="space-y-1">
                  <button
                    type="button"
                    onClick={() => toggleSection(section.title)}
                    className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground hover:bg-secondary/50 rounded-lg transition-colors"
                  >
                    <span>{section.title}</span>
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </button>
                  <div
                    className={cn(
                      "space-y-1 overflow-hidden transition-all duration-200",
                      isExpanded
                        ? "max-h-[500px] opacity-100"
                        : "max-h-0 opacity-0"
                    )}
                  >
                    {section.items.map(renderNavItem)}
                  </div>
                </div>
              );
            })}
          </nav>

          {/* User Profile Section */}
          <div className="p-4 border-t">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="w-full justify-start p-3 h-auto"
                >
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="text-xs">
                      {getUserInitials(user?.email)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="ml-3 text-left flex-1">
                    <div className="text-sm font-medium truncate">
                      {user?.email?.split("@")[0] || "User"}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {user?.email}
                    </div>
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem>
                  <Users className="mr-2 h-4 w-4" />
                  Profile Settings
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Settings className="mr-2 h-4 w-4" />
                  Preferences
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={signOut}
                  className="text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="lg:ml-[280px]">
        {/* Top Header */}
        <header className="sticky top-0 z-30 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
          <div className="flex items-center justify-between px-4 sm:px-6 lg:px-8 h-16">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                className="lg:hidden"
                onClick={() => setSidebarOpen(true)}
              >
                <Menu className="h-5 w-5" />
              </Button>
              <div>
                <h2 className="text-xl font-semibold">{getPageTitle()}</h2>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              <Popover open={isSearchOpen} onOpenChange={setIsSearchOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant={searchQuery ? "default" : "ghost"}
                    size="sm"
                    className="flex"
                  >
                    <Search className="h-4 w-4" />
                    {searchQuery && (
                      <span className="ml-1 max-w-[60px] sm:max-w-[100px] truncate text-xs hidden xs:inline">
                        {searchQuery}
                      </span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-[calc(100vw-2rem)] sm:w-80 p-3"
                  align="end"
                >
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <Input
                        ref={searchInputRef}
                        placeholder="Search events and budget..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="h-8"
                        onKeyDown={(e) => {
                          if (e.key === "Escape") {
                            setIsSearchOpen(false);
                          }
                        }}
                      />
                      {searchQuery && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 flex-shrink-0"
                          onClick={clearSearch}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Search events, expenses, and allocations
                    </p>
                  </div>
                </PopoverContent>
              </Popover>
              <Button variant="ghost" size="sm" className="relative">
                <Bell className="h-4 w-4" />
                <Badge className="absolute -top-1 -right-1 h-4 w-4 p-0 text-xs">
                  3
                </Badge>
              </Button>
              <div className="h-6 w-px bg-border hidden sm:block" />
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="hidden sm:block">
                  {isAdmin && <Badge variant="secondary">Admin</Badge>}
                </div>
                <Avatar className="h-8 w-8 hidden sm:flex">
                  <AvatarFallback className="text-xs">
                    {getUserInitials(user?.email)}
                  </AvatarFallback>
                </Avatar>
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="p-4 sm:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto">{children}</div>
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
