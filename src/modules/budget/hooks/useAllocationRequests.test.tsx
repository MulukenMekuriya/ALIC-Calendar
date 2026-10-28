// @vitest-environment jsdom

/**
 * useAllocationRequests used to take only a fiscal year id and add the filter
 * only when it had one. With no year worked out it fetched every request the
 * user could read, across branches, so a Board login opening on VA was shown
 * MD's requests under VA's name. Both ids are now required.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const eqCalls: Array<[string, unknown]> = [];
const fromSpy = vi.fn();

vi.mock("@/integrations/supabase/client", () => {
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: (column: string, value: unknown) => {
      eqCalls.push([column, value]);
      return builder;
    },
    order: () => Promise.resolve({ data: [{ id: "r1" }], error: null }),
  };
  return {
    supabase: {
      schema: () => ({
        from: (table: string) => {
          fromSpy(table);
          return builder;
        },
      }),
    },
  };
});

import { useAllocationRequests } from "./useAllocationRequests";

const wrapper = ({ children }: { children: ReactNode }) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

beforeEach(() => {
  eqCalls.length = 0;
  fromSpy.mockClear();
});

afterEach(cleanup);

describe("useAllocationRequests", () => {
  it("asks for one branch's one year, and nothing wider", async () => {
    const { result } = renderHook(() => useAllocationRequests("org-md", "fy-2027"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(eqCalls).toEqual([
      ["organization_id", "org-md"],
      ["fiscal_year_id", "fy-2027"],
    ]);
  });

  it("does not query at all while there is no fiscal year", async () => {
    const { result } = renderHook(() => useAllocationRequests("org-va", undefined), { wrapper });

    await new Promise((r) => setTimeout(r, 30));

    expect(fromSpy).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.data).toBeUndefined();
  });

  it("does not query without a branch either", async () => {
    renderHook(() => useAllocationRequests(undefined, "fy-2027"), { wrapper });

    await new Promise((r) => setTimeout(r, 30));

    expect(fromSpy).not.toHaveBeenCalled();
  });

  it("still honours enabled: false", async () => {
    renderHook(() => useAllocationRequests("org-md", "fy-2027", { enabled: false }), { wrapper });

    await new Promise((r) => setTimeout(r, 30));

    expect(fromSpy).not.toHaveBeenCalled();
  });

  it("keeps two branches' requests apart in the cache", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const shared = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const md = renderHook(() => useAllocationRequests("org-md", "fy-1"), { wrapper: shared });
    const va = renderHook(() => useAllocationRequests("org-va", "fy-1"), { wrapper: shared });

    await waitFor(() => {
      expect(md.result.current.isSuccess).toBe(true);
      expect(va.result.current.isSuccess).toBe(true);
    });

    expect(fromSpy).toHaveBeenCalledTimes(2);
  });
});
