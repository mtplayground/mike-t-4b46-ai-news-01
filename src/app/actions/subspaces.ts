"use server";

import { headers } from "next/headers";
import type { Subspace } from "@/generated/prisma/client";
import { Prisma } from "@/generated/prisma/client";
import {
  AuthorizationError,
  getAdminActorFromCookieHeader,
  requireAdmin,
} from "@/lib/authorization";
import { prisma } from "@/lib/db";
import { generateSlug, isValidSlug, normalizeSlug } from "@/lib/subspace-slugs";

type SubspaceField = "description" | "id" | "name" | "slug";

export type SubspaceInput = {
  description?: unknown;
  name?: unknown;
  slug?: unknown;
};

export type SubspaceActionResult =
  | {
      ok: true;
      subspace: SerializedSubspace;
    }
  | {
      error: string;
      fieldErrors?: Partial<Record<SubspaceField, string>>;
      ok: false;
    };

export type DeleteSubspaceActionResult =
  | {
      id: string;
      ok: true;
    }
  | {
      error: string;
      fieldErrors?: Partial<Record<SubspaceField, string>>;
      ok: false;
    };

export type SerializedSubspace = {
  createdAt: string;
  description: string;
  id: string;
  name: string;
  slug: string;
  updatedAt: string;
};

type ValidatedSubspaceInput = {
  description: string;
  name: string;
  slug: string;
};

const MAX_DESCRIPTION_LENGTH = 2_000;
const MAX_NAME_LENGTH = 120;

function serializeSubspace(subspace: Subspace): SerializedSubspace {
  return {
    createdAt: subspace.createdAt.toISOString(),
    description: subspace.description,
    id: subspace.id,
    name: subspace.name,
    slug: subspace.slug,
    updatedAt: subspace.updatedAt.toISOString(),
  };
}

function getStringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function getInputValue(
  input: FormData | SubspaceInput,
  field: SubspaceField,
): unknown {
  if (input instanceof FormData) {
    return input.get(field);
  }

  return input[field as keyof SubspaceInput];
}

function getIdValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function validateSubspaceInput(input: FormData | SubspaceInput):
  | { fieldErrors: Partial<Record<SubspaceField, string>>; ok: false }
  | {
      input: ValidatedSubspaceInput;
      ok: true;
    } {
  const fieldErrors: Partial<Record<SubspaceField, string>> = {};
  const name = getStringValue(getInputValue(input, "name"));
  const description = getStringValue(getInputValue(input, "description"));
  const rawSlug = getStringValue(getInputValue(input, "slug"));
  const slug = rawSlug ? normalizeSlug(rawSlug) : generateSlug(name);

  if (!name) {
    fieldErrors.name = "Name is required.";
  } else if (name.length > MAX_NAME_LENGTH) {
    fieldErrors.name = `Name must be ${MAX_NAME_LENGTH} characters or fewer.`;
  }

  if (!slug || !isValidSlug(slug)) {
    fieldErrors.slug =
      "Slug must contain lowercase letters, numbers, and hyphens.";
  }

  if (description.length > MAX_DESCRIPTION_LENGTH) {
    fieldErrors.description = `Description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer.`;
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      fieldErrors,
      ok: false,
    };
  }

  return {
    input: {
      description,
      name,
      slug,
    },
    ok: true,
  };
}

async function assertAdminAccess(): Promise<void> {
  const headerStore = await headers();
  const actor = await getAdminActorFromCookieHeader(headerStore.get("cookie"));

  requireAdmin(actor);
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function isRecordNotFoundError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2025"
  );
}

function toActionError(error: unknown): SubspaceActionResult {
  if (error instanceof AuthorizationError) {
    return {
      error: error.message,
      ok: false,
    };
  }

  if (isUniqueConstraintError(error)) {
    return {
      error: "Slug is already in use.",
      fieldErrors: {
        slug: "Slug is already in use.",
      },
      ok: false,
    };
  }

  if (isRecordNotFoundError(error)) {
    return {
      error: "Subspace was not found.",
      fieldErrors: {
        id: "Subspace was not found.",
      },
      ok: false,
    };
  }

  console.error("Subspace mutation failed", error);
  return {
    error: "Subspace mutation failed.",
    ok: false,
  };
}

function toDeleteActionError(error: unknown): DeleteSubspaceActionResult {
  if (error instanceof AuthorizationError) {
    return {
      error: error.message,
      ok: false,
    };
  }

  if (isRecordNotFoundError(error)) {
    return {
      error: "Subspace was not found.",
      fieldErrors: {
        id: "Subspace was not found.",
      },
      ok: false,
    };
  }

  console.error("Subspace delete failed", error);
  return {
    error: "Subspace delete failed.",
    ok: false,
  };
}

export async function createSubspaceAction(
  input: FormData | SubspaceInput,
): Promise<SubspaceActionResult> {
  try {
    await assertAdminAccess();
    const validated = validateSubspaceInput(input);

    if (!validated.ok) {
      return {
        error: "Subspace input is invalid.",
        fieldErrors: validated.fieldErrors,
        ok: false,
      };
    }

    const subspace = await prisma.subspace.create({
      data: validated.input,
    });

    return {
      ok: true,
      subspace: serializeSubspace(subspace),
    };
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateSubspaceAction(
  id: string,
  input: FormData | SubspaceInput,
): Promise<SubspaceActionResult> {
  try {
    await assertAdminAccess();
    const subspaceId = getIdValue(id);

    if (!subspaceId) {
      return {
        error: "Subspace id is required.",
        fieldErrors: {
          id: "Subspace id is required.",
        },
        ok: false,
      };
    }

    const validated = validateSubspaceInput(input);

    if (!validated.ok) {
      return {
        error: "Subspace input is invalid.",
        fieldErrors: validated.fieldErrors,
        ok: false,
      };
    }

    const subspace = await prisma.subspace.update({
      data: validated.input,
      where: {
        id: subspaceId,
      },
    });

    return {
      ok: true,
      subspace: serializeSubspace(subspace),
    };
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteSubspaceAction(
  id: string | FormData,
): Promise<DeleteSubspaceActionResult> {
  try {
    await assertAdminAccess();
    const subspaceId =
      id instanceof FormData ? getIdValue(id.get("id")) : getIdValue(id);

    if (!subspaceId) {
      return {
        error: "Subspace id is required.",
        fieldErrors: {
          id: "Subspace id is required.",
        },
        ok: false,
      };
    }

    await prisma.subspace.delete({
      where: {
        id: subspaceId,
      },
    });

    return {
      id: subspaceId,
      ok: true,
    };
  } catch (error) {
    return toDeleteActionError(error);
  }
}
