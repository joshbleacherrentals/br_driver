import { observable } from "@legendapp/state";

export const session$ = observable<{
  clerkUserId: string | null;
}>({
  clerkUserId: null,
});

console.log("[session$] module loaded");
