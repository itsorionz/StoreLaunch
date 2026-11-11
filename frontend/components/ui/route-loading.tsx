import { Spinner } from "./spinner";

type RouteLoadingProps = {
  className?: string;
};

/**
 * Fallback UI for route segments (`loading.tsx`) and section-level Suspense
 * boundaries. Server-rendered, so it appears instantly on navigation.
 */
export function RouteLoading({ className = "min-h-[60vh]" }: RouteLoadingProps) {
  return (
    <div role="status" className={`flex items-center justify-center ${className}`}>
      <Spinner className="h-7 w-7 text-primary" />
      <span className="sr-only">Loading</span>
    </div>
  );
}
