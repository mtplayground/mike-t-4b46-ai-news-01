"use client";

import { useMemo, useState, useTransition } from "react";
import {
  createTag,
  deleteTag,
  type SerializedTag,
  type TagActionResult,
  updateTag,
} from "@/lib/admin-api";

type FieldErrors = NonNullable<
  Extract<TagActionResult, { ok: false }>["fieldErrors"]
>;

type FormState = {
  name: string;
  slug: string;
};

type TagAdminPanelProps = {
  initialTags: SerializedTag[];
};

const EMPTY_FORM: FormState = {
  name: "",
  slug: "",
};

function formStateForTag(tag: SerializedTag): FormState {
  return {
    name: tag.name,
    slug: tag.slug,
  };
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function sortTags(tags: SerializedTag[]): SerializedTag[] {
  return [...tags].sort((left, right) => {
    const byName = left.name.localeCompare(right.name);

    if (byName !== 0) {
      return byName;
    }

    return left.createdAt.localeCompare(right.createdAt);
  });
}

export function TagAdminPanel({ initialTags }: TagAdminPanelProps) {
  const [tags, setTags] = useState(() => sortTags(initialTags));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formState, setFormState] = useState<FormState>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();

  const selectedTag = useMemo(
    () => tags.find((tag) => tag.id === selectedId) ?? null,
    [selectedId, tags],
  );
  const deleteCandidate = useMemo(
    () => tags.find((tag) => tag.id === deleteCandidateId) ?? null,
    [deleteCandidateId, tags],
  );
  const mode = selectedTag ? "Edit tag" : "Create tag";

  function updateField(field: keyof FormState, value: string) {
    setFormState((current) => ({
      ...current,
      [field]: value,
    }));
    setFieldErrors((current) => ({
      ...current,
      [field]: undefined,
    }));
  }

  function selectTag(tag: SerializedTag) {
    setSelectedId(tag.id);
    setFormState(formStateForTag(tag));
    setFieldErrors({});
    setMessage(null);
    setDeleteCandidateId(null);
  }

  function resetForm() {
    setSelectedId(null);
    setFormState(EMPTY_FORM);
    setFieldErrors({});
    setMessage(null);
    setDeleteCandidateId(null);
  }

  function submitForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});
    setMessage(null);

    const input = {
      name: formState.name,
      slug: formState.slug,
    };

    startTransition(async () => {
      const result = selectedTag
        ? await updateTag(selectedTag.id, input)
        : await createTag(input);

      if (!result.ok) {
        setFieldErrors(result.fieldErrors ?? {});
        setMessage(result.error);
        return;
      }

      setTags((current) => {
        const withoutCurrent = current.filter(
          (tag) => tag.id !== result.tag.id,
        );

        return sortTags([...withoutCurrent, result.tag]);
      });
      setSelectedId(result.tag.id);
      setFormState(formStateForTag(result.tag));
      setMessage(selectedTag ? "Tag updated." : "Tag created.");
    });
  }

  function confirmDelete() {
    if (!deleteCandidate) {
      return;
    }

    setFieldErrors({});
    setMessage(null);

    startTransition(async () => {
      const result = await deleteTag(deleteCandidate.id);

      if (!result.ok) {
        setFieldErrors(result.fieldErrors ?? {});
        setMessage(result.error);
        return;
      }

      setTags((current) => current.filter((tag) => tag.id !== result.id));
      if (selectedId === result.id) {
        resetForm();
      }
      setDeleteCandidateId(null);
      setMessage("Tag deleted.");
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
      <section aria-label="Tag editor" className="grid gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid gap-1">
            <p className="m-0 text-sm font-bold uppercase text-accent-strong">
              Tags
            </p>
            <h2 className="m-0 text-2xl">{mode}</h2>
          </div>
          {selectedTag ? (
            <button
              className="rounded-md border border-border bg-panel px-3 py-2 text-sm font-bold text-foreground"
              disabled={isPending}
              onClick={resetForm}
              type="button"
            >
              New tag
            </button>
          ) : null}
        </div>

        <form className="grid gap-4" onSubmit={submitForm}>
          <label className="grid gap-2 text-sm font-bold" htmlFor="tag-name">
            Name
            <input
              className="h-11 rounded-md border border-border bg-background px-3 text-base font-normal text-foreground outline-none focus:border-accent"
              disabled={isPending}
              id="tag-name"
              maxLength={80}
              name="name"
              onChange={(event) => updateField("name", event.target.value)}
              required
              type="text"
              value={formState.name}
            />
            {fieldErrors.name ? (
              <span className="text-sm font-normal text-red-700">
                {fieldErrors.name}
              </span>
            ) : null}
          </label>

          <label className="grid gap-2 text-sm font-bold" htmlFor="tag-slug">
            Slug
            <input
              className="h-11 rounded-md border border-border bg-background px-3 font-mono text-base font-normal text-foreground outline-none focus:border-accent"
              disabled={isPending}
              id="tag-slug"
              maxLength={80}
              name="slug"
              onChange={(event) => updateField("slug", event.target.value)}
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              placeholder="generated from name"
              type="text"
              value={formState.slug}
            />
            {fieldErrors.slug ? (
              <span className="text-sm font-normal text-red-700">
                {fieldErrors.slug}
              </span>
            ) : (
              <span className="text-sm font-normal text-muted">
                Leave blank when creating to generate it from the name.
              </span>
            )}
          </label>

          {fieldErrors.id ? (
            <p className="m-0 text-sm text-red-700">{fieldErrors.id}</p>
          ) : null}
          {message ? <p className="m-0 text-sm text-muted">{message}</p> : null}

          <div className="flex flex-wrap gap-3">
            <button
              className="h-11 rounded-md bg-accent px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isPending}
              type="submit"
            >
              {isPending ? "Saving" : selectedTag ? "Save" : "Create"}
            </button>
            {selectedTag ? (
              <button
                className="h-11 rounded-md border border-red-300 bg-panel px-4 text-sm font-bold text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isPending}
                onClick={() => setDeleteCandidateId(selectedTag.id)}
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
              Delete &quot;{deleteCandidate.name}&quot;? This removes the tag
              immediately from any posts using it.
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

      <section aria-label="Existing tags" className="grid content-start gap-3">
        <h2 className="m-0 text-2xl">Existing tags</h2>
        {tags.length > 0 ? (
          <div className="grid gap-3">
            {tags.map((tag) => (
              <button
                className={`grid gap-1 rounded-lg border p-4 text-left ${
                  selectedId === tag.id
                    ? "border-accent bg-background"
                    : "border-border bg-panel"
                }`}
                disabled={isPending}
                key={tag.id}
                onClick={() => selectTag(tag)}
                type="button"
              >
                <span className="text-base font-bold">{tag.name}</span>
                <span className="break-all font-mono text-sm text-accent-strong">
                  #{tag.slug}
                </span>
                <span className="text-xs text-muted">
                  Updated {formatDate(tag.updatedAt)}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="m-0 rounded-lg border border-border bg-panel p-4 text-sm leading-6 text-muted">
            No tags have been created yet.
          </p>
        )}
      </section>
    </div>
  );
}
