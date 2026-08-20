import { useCallback, useLayoutEffect, useRef } from "react";

/**
 * Identity-stable wrapper around a callback that changes every render.
 *
 * Needed here because `@clerk/clerk-expo`'s `useAuth` mints a NEW `getToken`
 * closure on every single hook call — see
 * `node_modules/@clerk/clerk-expo/dist/hooks/useAuth.js`, where `getToken` is a
 * fresh arrow function wrapping `getTokenBase` — which makes any
 * `useMemo(..., [getToken])` memoize nothing. `SystemProvider` used that memo to
 * own the Supabase client, the `BackendConnector` and the photo upload queue's
 * service, so "memoizes nothing" meant a whole new upload service (and its
 * lanes, its timers and its retained graph) on every render of the provider.
 *
 * The returned function never changes identity, and always calls the most
 * recently rendered `fn`. The write happens in `useLayoutEffect` rather than
 * during render so a concurrent render that is thrown away cannot leave the ref
 * pointing at a callback that was never committed.
 */
export function useStableCallback<A extends unknown[], R>(
  fn: (...args: A) => R,
): (...args: A) => R {
  const ref = useRef(fn);

  useLayoutEffect(() => {
    ref.current = fn;
  });

  return useCallback((...args: A) => ref.current(...args), []);
}
