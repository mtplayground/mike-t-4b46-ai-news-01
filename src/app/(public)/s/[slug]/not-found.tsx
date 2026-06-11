import { RouteStatePanel } from "@/components/route-state-panel";

export default function SubspaceNotFound() {
  return (
    <RouteStatePanel
      description="The requested subspace does not exist or is no longer available."
      eyebrow="Subspace not found"
      primaryHref="/subspaces"
      primaryLabel="Browse subspaces"
      secondaryHref="/"
      secondaryLabel="Go home"
      title="Subspace not found"
    />
  );
}
