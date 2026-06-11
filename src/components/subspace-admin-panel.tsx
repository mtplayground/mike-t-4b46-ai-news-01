"use client";

import { useMemo, useState, useTransition } from "react";
import {
  createSubspaceAction,
  deleteSubspaceAction,
  type SerializedSubspace,
  type SubspaceActionResult,
  updateSubspaceAction,
} from "@/app/actions/subspaces";

type FieldErrors = NonNullable<
  Extract<SubspaceActionResult, { ok: false }>["fieldErrors"]
>;

type FormState = {
  description: string;
  name: string;
  slug: string;
};

type SubspaceAdminPanelProps = {
  initialSubspaces: SerializedSubspace[];
};

const EMPTY_FORM: FormState = {
  description: "",
  name: "",
  slug: "",
};

function formStateForSubspace(subspace: SerializedSubspace): FormState {
  return {
    description: subspace.description,
    name: subspace.name,
    slug: subspace.slug,
  };
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function sortSubspaces(subspaces: SerializedSubspace[]): SerializedSubspace[] {
  return [...subspaces].sort((left, right) => {
    const byName = left.name.localeCompare(right.name);

    if (byName !== 0) {
      return byName;
    }

    return left.createdAt.localeCompare(right.createdAt);
  });
}

export function SubspaceAdminPanel({
  initialSubspaces,
}: SubspaceAdminPanelProps) {
  const [subspaces, setSubspaces] = useState(() =>
    sortSubspaces(initialSubspaces),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formState, setFormState] = useState<FormState>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();

  const selectedSubspace = useMemo(
    () => subspaces.find((subspace) => subspace.id === selectedId) ?? null,
    [selectedId, subspaces],
  );
  const deleteCandidate = useMemo(
    () =>
      subspaces.find((subspace) => subspace.id === deleteCandidateId) ?? null,
    [deleteCandidateId, subspaces],
  );
  const mode = selectedSubspace ? "Edit subspace" : "Create subspace";

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

  function selectSubspace(subspace: SerializedSubspace) {
    setSelectedId(subspace.id);
    setFormState(formStateForSubspace(subspace));
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
      description: formState.description,
      name: formState.name,
      slug: formState.slug,
    };

    startTransition(async () => {
      const result = selectedSubspace
        ? await updateSubspaceAction(selectedSubspace.id, input)
        : await createSubspaceAction(input);

      if (!result.ok) {
        setFieldErrors(result.fieldErrors ?? {});
        setMessage(result.error);
        return;
      }

      setSubspaces((current) => {
        const withoutCurrent = current.filter(
          (subspace) => subspace.id !== result.subspace.id,
        );

        return sortSubspaces([...withoutCurrent, result.subspace]);
      });
      setSelectedId(result.subspace.id);
      setFormState(formStateForSubspace(result.subspace));
      setMessage(selectedSubspace ? "Subspace updated." : "Subspace created.");
    });
  }

  function confirmDelete() {
    if (!deleteCandidate) {
      return;
    }

    setFieldErrors({});
    setMessage(null);

    startTransition(async () => {
      const result = await deleteSubspaceAction(deleteCandidate.id);

      if (!result.ok) {
        setFieldErrors(result.fieldErrors ?? {});
        setMessage(result.error);
        return;
      }

      setSubspaces((current) =>
        current.filter((subspace) => subspace.id !== result.id),
      );
      if (selectedId === result.id) {
        resetForm();
      }
      setDeleteCandidateId(null);
      setMessage("Subspace deleted.");
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
      <section aria-label="Subspace editor" className="grid gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="grid gap-1">
            <p className="m-0 text-sm font-bold uppercase text-accent-strong">
              Subspaces
            </p>
            <h2 className="m-0 text-2xl">{mode}</h2>
          </div>
          {selectedSubspace ? (
            <button
              className="rounded-md border border-border bg-panel px-3 py-2 text-sm font-bold text-foreground"
              disabled={isPending}
              onClick={resetForm}
              type="button"
            >
              New subspace
            </button>
          ) : null}
        </div>

        <form className="grid gap-4" onSubmit={submitForm}>
          <label className="grid gap-2 text-sm font-bold" htmlFor="name">
            Name
            <input
              className="h-11 rounded-md border border-border bg-background px-3 text-base font-normal text-foreground outline-none focus:border-accent"
              disabled={isPending}
              id="name"
              maxLength={120}
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

          <label className="grid gap-2 text-sm font-bold" htmlFor="slug">
            Slug
            <input
              className="h-11 rounded-md border border-border bg-background px-3 font-mono text-base font-normal text-foreground outline-none focus:border-accent"
              disabled={isPending}
              id="slug"
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

          <label className="grid gap-2 text-sm font-bold" htmlFor="description">
            Description
            <textarea
              className="min-h-32 rounded-md border border-border bg-background px-3 py-3 text-base font-normal leading-6 text-foreground outline-none focus:border-accent"
              disabled={isPending}
              id="description"
              maxLength={2000}
              name="description"
              onChange={(event) =>
                updateField("description", event.target.value)
              }
              value={formState.description}
            />
            {fieldErrors.description ? (
              <span className="text-sm font-normal text-red-700">
                {fieldErrors.description}
              </span>
            ) : null}
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
              {isPending ? "Saving" : selectedSubspace ? "Save" : "Create"}
            </button>
            {selectedSubspace ? (
              <button
                className="h-11 rounded-md border border-red-300 bg-panel px-4 text-sm font-bold text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isPending}
                onClick={() => setDeleteCandidateId(selectedSubspace.id)}
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
              Delete &quot;{deleteCandidate.name}&quot;? This removes the
              subspace immediately.
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

      <section
        aria-label="Existing subspaces"
        className="grid content-start gap-3"
      >
        <h2 className="m-0 text-2xl">Existing subspaces</h2>
        {subspaces.length > 0 ? (
          <div className="grid gap-3">
            {subspaces.map((subspace) => (
              <button
                className={`grid gap-1 rounded-lg border p-4 text-left ${
                  selectedId === subspace.id
                    ? "border-accent bg-background"
                    : "border-border bg-panel"
                }`}
                disabled={isPending}
                key={subspace.id}
                onClick={() => selectSubspace(subspace)}
                type="button"
              >
                <span className="text-base font-bold">{subspace.name}</span>
                <span className="break-all font-mono text-sm text-accent-strong">
                  /{subspace.slug}
                </span>
                <span className="text-xs text-muted">
                  Updated {formatDate(subspace.updatedAt)}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="m-0 rounded-lg border border-border bg-panel p-4 text-sm leading-6 text-muted">
            No subspaces have been created yet.
          </p>
        )}
      </section>
    </div>
  );
}
