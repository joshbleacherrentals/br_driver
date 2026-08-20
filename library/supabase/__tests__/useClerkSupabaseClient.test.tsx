/**
 * LOCKED CONTRACT — DO NOT MODIFY THIS TEST FILE.
 *
 * This test defines expected behavior for a diagnosed bug/regression in the
 * photo upload queue (see the "Photo Queue Postmortem" plan). It must stay
 * red until the corresponding fix lands, and must not be edited, weakened,
 * skipped, or deleted to make broken implementation code pass. If you are
 * an agent implementing the fix and believe this test is wrong, STOP and
 * ask the user — do not change this file yourself.
 *
 * Seam under test: `library/supabase/useClerkSupabaseClient.ts` — the effects
 * that register the Supabase token getter and subscribe to `AppState`.
 * Currently: RED — both effects depend on Clerk's `getToken`, whose identity is
 * new on every render, so they tear down and re-run on every parent re-render
 * even though the signed-in user has not changed.
 */

import React from "react";
import { AppState } from "react-native";

import { useClerkSupabaseClient } from "@/library/supabase/useClerkSupabaseClient";

/**
 * Clerk hands back a fresh `getToken` closure on every render — that identity
 * churn is the whole subject of this test — while the session itself is
 * unchanged throughout.
 */
const mockUseAuth = () => ({
  isSignedIn: true,
  userId: "user_clerk_1",
  getToken: async () => "jwt-token",
});

jest.mock("@clerk/clerk-expo", () => ({
  __esModule: true,
  useAuth: () => mockUseAuth(),
  isClerkRuntimeError: () => false,
}));

/** Every registration of the token getter — i.e. one effect body run. */
const mockSetTokenGetter = jest.fn();
const mockSetRealtimeAuth = jest.fn();

jest.mock("@/library/supabase/supabaseClient", () => ({
  __esModule: true,
  setSupabaseTokenGetter: (getter: unknown) => mockSetTokenGetter(getter),
  supabase: {
    realtime: { setAuth: (token: unknown) => mockSetRealtimeAuth(token) },
  },
}));

/**
 * `react-test-renderer` ships no type declarations, and
 * `@testing-library/react-native` is not a dependency of this project (see the
 * note in `library/powersync/__tests__/typedQuery.test.ts`), so the renderer is
 * required and given the minimal shape this test uses.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const TestRenderer = require("react-test-renderer") as {
  act: (callback: () => void) => void;
  create: (element: React.ReactElement) => {
    update: (element: React.ReactElement) => void;
    unmount: () => void;
  };
};

function Probe({ tick }: { tick: number }) {
  useClerkSupabaseClient();
  return null;
}

/** Registrations, as opposed to the `null` teardown a cleanup performs. */
const tokenGetterRegistrations = () =>
  mockSetTokenGetter.mock.calls.filter(
    ([getter]) => typeof getter === "function",
  ).length;

describe("useClerkSupabaseClient effect stability", () => {
  it("registers the token getter and the AppState listener once across re-renders with an unchanged session", () => {
    const subscribe = jest
      .spyOn(AppState, "addEventListener")
      .mockReturnValue({ remove: jest.fn() } as never);

    let tree!: ReturnType<typeof TestRenderer.create>;
    TestRenderer.act(() => {
      tree = TestRenderer.create(<Probe tick={0} />);
    });

    // Three ordinary parent re-renders. Nothing about the session changed —
    // only Clerk's `getToken` identity, which changes every single render.
    for (let tick = 1; tick <= 3; tick += 1) {
      TestRenderer.act(() => {
        tree.update(<Probe tick={tick} />);
      });
    }

    TestRenderer.act(() => {
      tree.unmount();
    });

    // Re-running these effects means dropping and rebuilding the Supabase token
    // getter and the AppState subscription on every render of the root layout.
    expect(tokenGetterRegistrations()).toBe(1);
    expect(subscribe).toHaveBeenCalledTimes(1);
  });
});
