import { RouteStatePanel } from "@/components/route-state-panel";

export default function PostNotFound() {
  return (
    <RouteStatePanel
      description="The requested post does not exist in this subspace or is no longer available."
      eyebrow="Post not found"
      primaryHref="/subspaces"
      primaryLabel="Browse subspaces"
      secondaryHref="/"
      secondaryLabel="Go home"
      title="Post not found"
    />
  );
}
