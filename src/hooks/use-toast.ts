/**
 * Kept only so older imports of `@/hooks/use-toast` keep working.
 *
 * This file used to hold a second, byte-identical copy of the hook. Because
 * the store lives in module scope, that copy was a SEPARATE store: <Toaster />
 * subscribed to this one while every screen dispatched into
 * @/shared/hooks/use-toast, so toasts raised anywhere in the app — including
 * the error explaining why a registration had just failed — were rendered by
 * nobody. Re-export, never re-implement.
 */
export { useToast, toast, reducer } from "@/shared/hooks/use-toast";
