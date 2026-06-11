"use client";

import { useMemo, useState, useTransition } from "react";
import {
  createPostAction,
  deletePostAction,
  type PostActionResult,
  type SerializedPost,
  updatePostAction,
} from "@/app/actions/posts";
import type { SerializedSubspace } from "@/app/actions/subspaces";
import type { SerializedTag } from "@/app/actions/tags";
import { MarkdownMediaUploader } from "@/components/markdown-media-uploader";

type FieldErrors = NonNullable<
  Extract<PostActionResult, { ok: false }>["fieldErrors"]
>;

type FormState = {
  bodyMarkdown: string;
  subspaceId: string;
  tagIds: string[];
};

type PostEditorPanelProps = {
  initialPosts: SerializedPost[];
  subspaces: Pick<SerializedSubspace, "id" | "name" | "slug">[];
  tags: SerializedTag[];
};

const EMPTY_FORM: FormState = {
  bodyMarkdown: "",
  subspaceId: "",
  tagIds: [],
};

function formStateForPost(post: SerializedPost): FormState {
  return {
    bodyMarkdown: post.bodyMarkdown,
    subspaceId: post.subspaceId,
    tagIds: post.tags.map((tag) => tag.id),
  };
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function getPostSummary(post: SerializedPost): string {
  const firstLine = post.bodyMarkdown
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  if (!firstLine) {
    return "Untitled post";
  }

  return firstLine.length > 90 ? `${firstLine.slice(0, 87)}...` : firstLine;
}

function sortPosts(posts: SerializedPost[]): SerializedPost[] {
  return [...posts].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  );
}

export function PostEditorPanel({
  initialPosts,
  subspaces,
  tags,
}: PostEditorPanelProps) {
  const [posts, setPosts] = useState(() => sortPosts(initialPosts));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formState, setFormState] = useState<FormState>({
    ...EMPTY_FORM,
    subspaceId: subspaces[0]?.id ?? "",
  });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();

  const selectedPost = useMemo(
    () => posts.find((post) => post.id === selectedId) ?? null,
    [posts, selectedId],
  );
  const deleteCandidate = useMemo(
    () => posts.find((post) => post.id === deleteCandidateId) ?? null,
    [deleteCandidateId, posts],
  );
  const mode = selectedPost ? "Edit post" : "Create post";
  const canSubmit = subspaces.length > 0 && !isPending;

  function updateField(field: keyof FormState, value: string | string[]) {
    setFormState((current) => ({
      ...current,
      [field]: value,
    }));
    setFieldErrors((current) => ({
      ...current,
      [field]: undefined,
    }));
  }

  function toggleTag(tagId: string) {
    setFormState((current) => {
      const tagIds = current.tagIds.includes(tagId)
        ? current.tagIds.filter((currentTagId) => currentTagId !== tagId)
        : [...current.tagIds, tagId];

      return {
        ...current,
        tagIds,
      };
    });
    setFieldErrors((current) => ({
      ...current,
      tagIds: undefined,
    }));
  }

  function selectPost(post: SerializedPost) {
    setSelectedId(post.id);
    setFormState(formStateForPost(post));
    setFieldErrors({});
    setMessage(null);
    setDeleteCandidateId(null);
  }

  function resetForm() {
    setSelectedId(null);
    setFormState({
      ...EMPTY_FORM,
      subspaceId: subspaces[0]?.id ?? "",
    });
    setFieldErrors({});
    setMessage(null);
    setDeleteCandidateId(null);
  }

  function submitForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});
    setMessage(null);

    const input = {
      bodyMarkdown: formState.bodyMarkdown,
      subspaceId: formState.subspaceId,
      tagIds: formState.tagIds,
    };

    startTransition(async () => {
      const result = selectedPost
        ? await updatePostAction(selectedPost.id, input)
        : await createPostAction(input);

      if (!result.ok) {
        setFieldErrors(result.fieldErrors ?? {});
        setMessage(result.error);
        return;
      }

      setPosts((current) => {
        const withoutCurrent = current.filter(
          (post) => post.id !== result.post.id,
        );

        return sortPosts([...withoutCurrent, result.post]);
      });
      setSelectedId(result.post.id);
      setFormState(formStateForPost(result.post));
      setMessage(selectedPost ? "Post updated." : "Post created.");
    });
  }

  function confirmDelete() {
    if (!deleteCandidate) {
      return;
    }

    setFieldErrors({});
    setMessage(null);

    startTransition(async () => {
      const result = await deletePostAction(deleteCandidate.id);

      if (!result.ok) {
        setFieldErrors(result.fieldErrors ?? {});
        setMessage(result.error);
        return;
      }

      setPosts((current) => current.filter((post) => post.id !== result.id));
      if (selectedId === result.id) {
        resetForm();
      }
      setDeleteCandidateId(null);
      setMessage("Post deleted.");
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
      <section aria-label="Post editor" className="grid gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid gap-1">
            <p className="m-0 text-sm font-bold uppercase text-accent-strong">
              Posts
            </p>
            <h2 className="m-0 text-2xl">{mode}</h2>
          </div>
          {selectedPost ? (
            <button
              className="rounded-md border border-border bg-panel px-3 py-2 text-sm font-bold text-foreground"
              disabled={isPending}
              onClick={resetForm}
              type="button"
            >
              New post
            </button>
          ) : null}
        </div>

        <form className="grid gap-4" onSubmit={submitForm}>
          <label className="grid gap-2 text-sm font-bold" htmlFor="subspaceId">
            Subspace
            <select
              className="h-11 rounded-md border border-border bg-background px-3 text-base font-normal text-foreground outline-none focus:border-accent"
              disabled={isPending || subspaces.length === 0}
              id="subspaceId"
              name="subspaceId"
              onChange={(event) =>
                updateField("subspaceId", event.target.value)
              }
              required
              value={formState.subspaceId}
            >
              {subspaces.length > 0 ? null : (
                <option value="">Create a subspace first</option>
              )}
              {subspaces.map((subspace) => (
                <option key={subspace.id} value={subspace.id}>
                  {subspace.name} /{subspace.slug}
                </option>
              ))}
            </select>
            {fieldErrors.subspaceId ? (
              <span className="text-sm font-normal text-red-700">
                {fieldErrors.subspaceId}
              </span>
            ) : null}
          </label>

          <div className="grid gap-2">
            <MarkdownMediaUploader
              name="bodyMarkdown"
              onChange={(value) => updateField("bodyMarkdown", value)}
              rows={16}
              value={formState.bodyMarkdown}
            />
            {fieldErrors.bodyMarkdown ? (
              <span className="text-sm font-normal text-red-700">
                {fieldErrors.bodyMarkdown}
              </span>
            ) : null}
          </div>

          <fieldset className="grid gap-3 rounded-lg border border-border bg-background p-4">
            <legend className="px-1 text-sm font-bold">Tags</legend>
            {tags.length > 0 ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {tags.map((tag) => (
                  <label
                    className="flex items-center gap-2 rounded-md border border-border bg-panel px-3 py-2 text-sm font-bold"
                    key={tag.id}
                  >
                    <input
                      checked={formState.tagIds.includes(tag.id)}
                      className="h-4 w-4 accent-[var(--accent)]"
                      disabled={isPending}
                      name="tagIds"
                      onChange={() => toggleTag(tag.id)}
                      type="checkbox"
                      value={tag.id}
                    />
                    <span className="grid gap-0.5">
                      <span>{tag.name}</span>
                      <span className="break-all font-mono text-xs font-normal text-accent-strong">
                        #{tag.slug}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="m-0 text-sm leading-6 text-muted">
                No tags have been created yet.
              </p>
            )}
            {fieldErrors.tagIds ? (
              <span className="text-sm font-normal text-red-700">
                {fieldErrors.tagIds}
              </span>
            ) : null}
          </fieldset>

          {fieldErrors.id ? (
            <p className="m-0 text-sm text-red-700">{fieldErrors.id}</p>
          ) : null}
          {message ? <p className="m-0 text-sm text-muted">{message}</p> : null}

          <div className="flex flex-wrap gap-3">
            <button
              className="h-11 rounded-md bg-accent px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!canSubmit}
              type="submit"
            >
              {isPending
                ? "Saving"
                : selectedPost
                  ? "Save post"
                  : "Create post"}
            </button>
            {selectedPost ? (
              <button
                className="h-11 rounded-md border border-red-300 bg-panel px-4 text-sm font-bold text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isPending}
                onClick={() => setDeleteCandidateId(selectedPost.id)}
                type="button"
              >
                Delete
              </button>
            ) : null}
          </div>
        </form>

        {deleteCandidate ? (
          <div
            aria-live="polite"
            className="grid gap-3 rounded-lg border border-red-300 bg-red-50 p-4"
          >
            <p className="m-0 text-sm leading-6 text-red-900">
              Delete this post from /{deleteCandidate.subspace.slug}? This
              removes the post immediately.
            </p>
            <p className="m-0 line-clamp-3 text-sm leading-6 text-red-900">
              {getPostSummary(deleteCandidate)}
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                className="h-10 rounded-md bg-red-700 px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isPending}
                onClick={() => void confirmDelete()}
                type="button"
              >
                Confirm delete
              </button>
              <button
                className="h-10 rounded-md border border-border bg-panel px-4 text-sm font-bold text-foreground"
                disabled={isPending}
                onClick={() => setDeleteCandidateId(null)}
                type="button"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section aria-label="Existing posts" className="grid content-start gap-3">
        <h2 className="m-0 text-2xl">Existing posts</h2>
        {posts.length > 0 ? (
          <div className="grid gap-3">
            {posts.map((post) => (
              <button
                className={`grid gap-2 rounded-lg border p-4 text-left ${
                  selectedId === post.id
                    ? "border-accent bg-background"
                    : "border-border bg-panel"
                }`}
                disabled={isPending}
                key={post.id}
                onClick={() => selectPost(post)}
                type="button"
              >
                <span className="line-clamp-3 text-sm font-bold leading-6">
                  {getPostSummary(post)}
                </span>
                <span className="break-all text-xs text-accent-strong">
                  /{post.subspace.slug}
                </span>
                <span className="text-xs text-muted">
                  Updated {formatDate(post.updatedAt)}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="m-0 rounded-lg border border-border bg-panel p-4 text-sm leading-6 text-muted">
            No posts have been created yet.
          </p>
        )}
      </section>
    </div>
  );
}
