import { RouteStatePanel } from "@/components/route-state-panel";

export default function TagNotFound() {
  return (
    <RouteStatePanel
      description="The requested tag does not exist or is no longer available."
      eyebrow="Tag not found"
      primaryHref="/tags"
      primaryLabel="Browse tags"
      secondaryHref="/"
      secondaryLabel="Go home"
      title="Tag not found"
    />
  );
}
