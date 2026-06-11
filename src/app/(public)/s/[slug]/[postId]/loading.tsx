import { LoadingPanel } from "@/components/route-state-panel";

export default function LoadingPost() {
  return (
    <LoadingPanel
      description="Fetching the post, author, rendered body, and tags."
      title="Loading post"
    />
  );
}
