"use server";

import { headers } from "next/headers";
import type {
  Post,
  PostTag,
  Subspace,
  Tag,
  User,
} from "@/generated/prisma/client";
import { Prisma } from "@/generated/prisma/client";
import {
  AuthorizationError,
  canEditOwnedResource,
  getAuthenticatedActorFromCookieHeader,
  requireAuthenticated,
} from "@/lib/authorization";
import { prisma } from "@/lib/db";

type PostField = "bodyMarkdown" | "id" | "subspaceId" | "tagIds";

type PostWithRelations = Post & {
  author: Pick<User, "email" | "name" | "pictureUrl" | "sub">;
  subspace: Pick<Subspace, "id" | "name" | "slug">;
  tags: (PostTag & {
    tag: Tag;
  })[];
};

export type PostInput = {
  bodyMarkdown?: unknown;
  subspaceId?: unknown;
  tagIds?: unknown;
};

export type SerializedPostTag = {
  createdAt: string;
  id: string;
  name: string;
  slug: string;
  updatedAt: string;
};

export type SerializedPost = {
  author: {
    email: string;
    name: string | null;
    pictureUrl: string | null;
    sub: string;
  };
  authorSub: string;
  bodyMarkdown: string;
  createdAt: string;
  id: string;
  subspace: {
    id: string;
    name: string;
    slug: string;
  };
  subspaceId: string;
  tags: SerializedPostTag[];
  updatedAt: string;
};

export type PostActionResult =
  | {
      ok: true;
      post: SerializedPost;
    }
  | {
      error: string;
      fieldErrors?: Partial<Record<PostField, string>>;
      ok: false;
    };

export type DeletePostActionResult =
  | {
      id: string;
      ok: true;
    }
  | {
      error: string;
      fieldErrors?: Partial<Record<PostField, string>>;
      ok: false;
    };

type ValidatedPostInput = {
  bodyMarkdown: string;
  subspaceId: string;
  tagIds: string[];
};

const MAX_BODY_MARKDOWN_LENGTH = 100_000;
const MAX_TAGS_PER_POST = 24;

const postInclude = {
  author: {
    select: {
      email: true,
      name: true,
      pictureUrl: true,
      sub: true,
    },
  },
  subspace: {
    select: {
      id: true,
      name: true,
      slug: true,
    },
  },
  tags: {
    include: {
      tag: true,
    },
    orderBy: {
      tag: {
        name: "asc",
      },
    },
  },
} satisfies Prisma.PostInclude;

function serializePost(post: PostWithRelations): SerializedPost {
  return {
    author: post.author,
    authorSub: post.authorSub,
    bodyMarkdown: post.bodyMarkdown,
    createdAt: post.createdAt.toISOString(),
    id: post.id,
    subspace: post.subspace,
    subspaceId: post.subspaceId,
    tags: post.tags.map(({ tag }) => ({
      createdAt: tag.createdAt.toISOString(),
      id: tag.id,
      name: tag.name,
      slug: tag.slug,
      updatedAt: tag.updatedAt.toISOString(),
    })),
    updatedAt: post.updatedAt.toISOString(),
  };
}

function getStringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function getInputValue(input: FormData | PostInput, field: PostField): unknown {
  if (input instanceof FormData) {
    return input.get(field);
  }

  return input[field as keyof PostInput];
}

function getIdValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function getTagIdValues(input: FormData | PostInput): string[] {
  const values =
    input instanceof FormData
      ? [...input.getAll("tagIds"), ...input.getAll("tagIds[]")]
      : [input.tagIds];

  const splitValues = values.flatMap(
    function collectStringValues(value): string[] {
      if (Array.isArray(value)) {
        return value.flatMap(collectStringValues);
      }

      if (typeof value !== "string") {
        return [];
      }

      return value.split(",");
    },
  );

  return Array.from(
    new Set(
      splitValues
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    ),
  );
}

function validatePostInput(input: FormData | PostInput):
  | { fieldErrors: Partial<Record<PostField, string>>; ok: false }
  | {
      input: ValidatedPostInput;
      ok: true;
    } {
  const fieldErrors: Partial<Record<PostField, string>> = {};
  const bodyMarkdown = getStringValue(getInputValue(input, "bodyMarkdown"));
  const subspaceId = getStringValue(getInputValue(input, "subspaceId"));
  const tagIds = getTagIdValues(input);

  if (!bodyMarkdown) {
    fieldErrors.bodyMarkdown = "Post body is required.";
  } else if (bodyMarkdown.length > MAX_BODY_MARKDOWN_LENGTH) {
    fieldErrors.bodyMarkdown = `Post body must be ${MAX_BODY_MARKDOWN_LENGTH} characters or fewer.`;
  }

  if (!subspaceId) {
    fieldErrors.subspaceId = "Subspace is required.";
  }

  if (tagIds.length > MAX_TAGS_PER_POST) {
    fieldErrors.tagIds = `Posts can have at most ${MAX_TAGS_PER_POST} tags.`;
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      fieldErrors,
      ok: false,
    };
  }

  return {
    input: {
      bodyMarkdown,
      subspaceId,
      tagIds,
    },
    ok: true,
  };
}

async function getAuthenticatedActor() {
  const headerStore = await headers();
  const actor = await getAuthenticatedActorFromCookieHeader(
    headerStore.get("cookie"),
  );

  requireAuthenticated(actor);

  return actor;
}

function isRecordNotFoundError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2025"
  );
}

function isForeignKeyError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2003"
  );
}

async function validateReferences(
  input: ValidatedPostInput,
): Promise<Partial<Record<PostField, string>>> {
  const [subspace, tags] = await Promise.all([
    prisma.subspace.findUnique({
      select: {
        id: true,
      },
      where: {
        id: input.subspaceId,
      },
    }),
    input.tagIds.length > 0
      ? prisma.tag.findMany({
          select: {
            id: true,
          },
          where: {
            id: {
              in: input.tagIds,
            },
          },
        })
      : Promise.resolve([]),
  ]);

  const fieldErrors: Partial<Record<PostField, string>> = {};

  if (!subspace) {
    fieldErrors.subspaceId = "Subspace was not found.";
  }

  if (tags.length !== input.tagIds.length) {
    fieldErrors.tagIds = "One or more selected tags were not found.";
  }

  return fieldErrors;
}

function toActionError(error: unknown): PostActionResult {
  if (error instanceof AuthorizationError) {
    return {
      error: error.message,
      ok: false,
    };
  }

  if (isRecordNotFoundError(error)) {
    return {
      error: "Post was not found.",
      fieldErrors: {
        id: "Post was not found.",
      },
      ok: false,
    };
  }

  if (isForeignKeyError(error)) {
    return {
      error: "Post references an invalid subspace, author, or tag.",
      ok: false,
    };
  }

  console.error("Post mutation failed", error);
  return {
    error: "Post mutation failed.",
    ok: false,
  };
}

function toDeleteActionError(error: unknown): DeletePostActionResult {
  if (error instanceof AuthorizationError) {
    return {
      error: error.message,
      ok: false,
    };
  }

  if (isRecordNotFoundError(error)) {
    return {
      error: "Post was not found.",
      fieldErrors: {
        id: "Post was not found.",
      },
      ok: false,
    };
  }

  console.error("Post delete failed", error);
  return {
    error: "Post delete failed.",
    ok: false,
  };
}

export async function createPostAction(
  input: FormData | PostInput,
): Promise<PostActionResult> {
  try {
    const actor = await getAuthenticatedActor();
    const validated = validatePostInput(input);

    if (!validated.ok) {
      return {
        error: "Post input is invalid.",
        fieldErrors: validated.fieldErrors,
        ok: false,
      };
    }

    const referenceErrors = await validateReferences(validated.input);

    if (Object.keys(referenceErrors).length > 0) {
      return {
        error: "Post input is invalid.",
        fieldErrors: referenceErrors,
        ok: false,
      };
    }

    const post = await prisma.$transaction(async (tx) => {
      const createdPost = await tx.post.create({
        data: {
          authorSub: actor.sub,
          bodyMarkdown: validated.input.bodyMarkdown,
          subspaceId: validated.input.subspaceId,
        },
        select: {
          id: true,
        },
      });

      if (validated.input.tagIds.length > 0) {
        await tx.postTag.createMany({
          data: validated.input.tagIds.map((tagId) => ({
            postId: createdPost.id,
            tagId,
          })),
        });
      }

      return tx.post.findUniqueOrThrow({
        include: postInclude,
        where: {
          id: createdPost.id,
        },
      });
    });

    return {
      ok: true,
      post: serializePost(post),
    };
  } catch (error) {
    return toActionError(error);
  }
}

export async function updatePostAction(
  id: string,
  input: FormData | PostInput,
): Promise<PostActionResult> {
  try {
    const actor = await getAuthenticatedActor();
    const postId = getIdValue(id);

    if (!postId) {
      return {
        error: "Post id is required.",
        fieldErrors: {
          id: "Post id is required.",
        },
        ok: false,
      };
    }

    const existingPost = await prisma.post.findUnique({
      select: {
        authorSub: true,
      },
      where: {
        id: postId,
      },
    });

    if (!existingPost) {
      return {
        error: "Post was not found.",
        fieldErrors: {
          id: "Post was not found.",
        },
        ok: false,
      };
    }

    if (!canEditOwnedResource(actor, existingPost.authorSub)) {
      throw new AuthorizationError("Post owner or admin access required", 403);
    }

    const validated = validatePostInput(input);

    if (!validated.ok) {
      return {
        error: "Post input is invalid.",
        fieldErrors: validated.fieldErrors,
        ok: false,
      };
    }

    const referenceErrors = await validateReferences(validated.input);

    if (Object.keys(referenceErrors).length > 0) {
      return {
        error: "Post input is invalid.",
        fieldErrors: referenceErrors,
        ok: false,
      };
    }

    const post = await prisma.$transaction(async (tx) => {
      await tx.post.update({
        data: {
          bodyMarkdown: validated.input.bodyMarkdown,
          subspaceId: validated.input.subspaceId,
        },
        where: {
          id: postId,
        },
      });

      await tx.postTag.deleteMany({
        where: {
          postId,
        },
      });

      if (validated.input.tagIds.length > 0) {
        await tx.postTag.createMany({
          data: validated.input.tagIds.map((tagId) => ({
            postId,
            tagId,
          })),
        });
      }

      return tx.post.findUniqueOrThrow({
        include: postInclude,
        where: {
          id: postId,
        },
      });
    });

    return {
      ok: true,
      post: serializePost(post),
    };
  } catch (error) {
    return toActionError(error);
  }
}

export async function deletePostAction(
  id: string | FormData,
): Promise<DeletePostActionResult> {
  try {
    const actor = await getAuthenticatedActor();
    const postId =
      id instanceof FormData ? getIdValue(id.get("id")) : getIdValue(id);

    if (!postId) {
      return {
        error: "Post id is required.",
        fieldErrors: {
          id: "Post id is required.",
        },
        ok: false,
      };
    }

    const existingPost = await prisma.post.findUnique({
      select: {
        authorSub: true,
      },
      where: {
        id: postId,
      },
    });

    if (!existingPost) {
      return {
        error: "Post was not found.",
        fieldErrors: {
          id: "Post was not found.",
        },
        ok: false,
      };
    }

    if (!canEditOwnedResource(actor, existingPost.authorSub)) {
      throw new AuthorizationError("Post owner or admin access required", 403);
    }

    await prisma.post.delete({
      where: {
        id: postId,
      },
    });

    return {
      id: postId,
      ok: true,
    };
  } catch (error) {
    return toDeleteActionError(error);
  }
}
