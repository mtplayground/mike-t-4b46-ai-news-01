"use server";

import { headers } from "next/headers";
import type { Tag } from "@/generated/prisma/client";
import { Prisma } from "@/generated/prisma/client";
import {
  AuthorizationError,
  getAdminActorFromCookieHeader,
  requireAdmin,
} from "@/lib/authorization";
import { prisma } from "@/lib/db";
import { generateSlug, isValidSlug, normalizeSlug } from "@/lib/subspace-slugs";

type TagField = "id" | "name" | "slug";

export type TagInput = {
  name?: unknown;
  slug?: unknown;
};

export type SerializedTag = {
  createdAt: string;
  id: string;
  name: string;
  slug: string;
  updatedAt: string;
};

export type TagActionResult =
  | {
      ok: true;
      tag: SerializedTag;
    }
  | {
      error: string;
      fieldErrors?: Partial<Record<TagField, string>>;
      ok: false;
    };

export type DeleteTagActionResult =
  | {
      id: string;
      ok: true;
    }
  | {
      error: string;
      fieldErrors?: Partial<Record<TagField, string>>;
      ok: false;
    };

type ValidatedTagInput = {
  name: string;
  slug: string;
};

const MAX_NAME_LENGTH = 80;

function serializeTag(tag: Tag): SerializedTag {
  return {
    createdAt: tag.createdAt.toISOString(),
    id: tag.id,
    name: tag.name,
    slug: tag.slug,
    updatedAt: tag.updatedAt.toISOString(),
  };
}

function getStringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function getInputValue(input: FormData | TagInput, field: TagField): unknown {
  if (input instanceof FormData) {
    return input.get(field);
  }

  return input[field as keyof TagInput];
}

function getIdValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function validateTagInput(input: FormData | TagInput):
  | { fieldErrors: Partial<Record<TagField, string>>; ok: false }
  | {
      input: ValidatedTagInput;
      ok: true;
    } {
  const fieldErrors: Partial<Record<TagField, string>> = {};
  const name = getStringValue(getInputValue(input, "name"));
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

  if (Object.keys(fieldErrors).length > 0) {
    return {
      fieldErrors,
      ok: false,
    };
  }

  return {
    input: {
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

function toActionError(error: unknown): TagActionResult {
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
      error: "Tag was not found.",
      fieldErrors: {
        id: "Tag was not found.",
      },
      ok: false,
    };
  }

  console.error("Tag mutation failed", error);
  return {
    error: "Tag mutation failed.",
    ok: false,
  };
}

function toDeleteActionError(error: unknown): DeleteTagActionResult {
  if (error instanceof AuthorizationError) {
    return {
      error: error.message,
      ok: false,
    };
  }

  if (isRecordNotFoundError(error)) {
    return {
      error: "Tag was not found.",
      fieldErrors: {
        id: "Tag was not found.",
      },
      ok: false,
    };
  }

  console.error("Tag delete failed", error);
  return {
    error: "Tag delete failed.",
    ok: false,
  };
}

export async function createTagAction(
  input: FormData | TagInput,
): Promise<TagActionResult> {
  try {
    await assertAdminAccess();
    const validated = validateTagInput(input);

    if (!validated.ok) {
      return {
        error: "Tag input is invalid.",
        fieldErrors: validated.fieldErrors,
        ok: false,
      };
    }

    const tag = await prisma.tag.create({
      data: validated.input,
    });

    return {
      ok: true,
      tag: serializeTag(tag),
    };
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateTagAction(
  id: string,
  input: FormData | TagInput,
): Promise<TagActionResult> {
  try {
    await assertAdminAccess();
    const tagId = getIdValue(id);

    if (!tagId) {
      return {
        error: "Tag id is required.",
        fieldErrors: {
          id: "Tag id is required.",
        },
        ok: false,
      };
    }

    const validated = validateTagInput(input);

    if (!validated.ok) {
      return {
        error: "Tag input is invalid.",
        fieldErrors: validated.fieldErrors,
        ok: false,
      };
    }

    const tag = await prisma.tag.update({
      data: validated.input,
      where: {
        id: tagId,
      },
    });

    return {
      ok: true,
      tag: serializeTag(tag),
    };
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteTagAction(
  id: string | FormData,
): Promise<DeleteTagActionResult> {
  try {
    await assertAdminAccess();
    const tagId =
      id instanceof FormData ? getIdValue(id.get("id")) : getIdValue(id);

    if (!tagId) {
      return {
        error: "Tag id is required.",
        fieldErrors: {
          id: "Tag id is required.",
        },
        ok: false,
      };
    }

    await prisma.tag.delete({
      where: {
        id: tagId,
      },
    });

    return {
      id: tagId,
      ok: true,
    };
  } catch (error) {
    return toDeleteActionError(error);
  }
}
