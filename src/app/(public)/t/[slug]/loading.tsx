import { LoadingPanel } from "@/components/route-state-panel";

export default function LoadingTag() {
  return (
    <LoadingPanel
      description="Fetching the tag details and related post list."
      title="Loading tag"
    />
  );
}
