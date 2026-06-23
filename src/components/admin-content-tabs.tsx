"use client";

import { useState } from "react";
import type {
  SerializedPost,
  SerializedSubspace,
  SerializedTag,
} from "@/lib/admin-api";
import { PostEditorPanel } from "@/components/post-editor-panel";
import { SubspaceAdminPanel } from "@/components/subspace-admin-panel";
import { TagAdminPanel } from "@/components/tag-admin-panel";

type AdminTabId = "posts" | "subspaces" | "tags";

type AdminContentTabsProps = {
  posts: SerializedPost[];
  subspaces: SerializedSubspace[];
  tags: SerializedTag[];
};

type TabDefinition = {
  id: AdminTabId;
  label: string;
};

const TABS: TabDefinition[] = [
  {
    id: "posts",
    label: "Posts",
  },
  {
    id: "subspaces",
    label: "Subspaces",
  },
  {
    id: "tags",
    label: "Tags",
  },
];

const ACTIVE_TAB_CLASS =
  "rounded-md bg-accent px-4 py-2 text-sm font-bold text-white";
const INACTIVE_TAB_CLASS =
  "rounded-md border border-border bg-panel px-4 py-2 text-sm font-bold text-foreground hover:border-accent hover:text-accent-strong";

function tabId(id: AdminTabId): string {
  return `admin-content-tab-${id}`;
}

function panelId(id: AdminTabId): string {
  return `admin-content-panel-${id}`;
}

export function AdminContentTabs({
  posts,
  subspaces,
  tags,
}: AdminContentTabsProps) {
  const [activeTab, setActiveTab] = useState<AdminTabId>("posts");

  return (
    <section aria-label="Admin content management" className="grid gap-4">
      <div
        aria-label="Admin content panels"
        className="flex flex-wrap gap-2"
        role="tablist"
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;

          return (
            <button
              aria-controls={panelId(tab.id)}
              aria-selected={isActive}
              className={isActive ? ACTIVE_TAB_CLASS : INACTIVE_TAB_CLASS}
              id={tabId(tab.id)}
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              role="tab"
              type="button"
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div
        aria-labelledby={tabId("posts")}
        className="rounded-lg border border-border bg-panel p-5"
        hidden={activeTab !== "posts"}
        id={panelId("posts")}
        role="tabpanel"
      >
        <PostEditorPanel
          initialPosts={posts}
          subspaces={subspaces}
          tags={tags}
        />
      </div>

      <div
        aria-labelledby={tabId("subspaces")}
        className="rounded-lg border border-border bg-panel p-5"
        hidden={activeTab !== "subspaces"}
        id={panelId("subspaces")}
        role="tabpanel"
      >
        <SubspaceAdminPanel initialSubspaces={subspaces} />
      </div>

      <div
        aria-labelledby={tabId("tags")}
        className="rounded-lg border border-border bg-panel p-5"
        hidden={activeTab !== "tags"}
        id={panelId("tags")}
        role="tabpanel"
      >
        <TagAdminPanel initialTags={tags} />
      </div>
    </section>
  );
}
