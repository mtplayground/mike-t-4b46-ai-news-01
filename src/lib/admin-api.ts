type ApiErrorPayload<TFields extends string> = {
  error?: string;
  fieldErrors?: Partial<Record<TFields, string>>;
  ok?: false;
};

export type SerializedSubspace = {
  createdAt: string;
  description: string;
  id: string;
  name: string;
  slug: string;
  updatedAt: string;
};

export type SerializedTag = {
  createdAt: string;
  id: string;
  name: string;
  slug: string;
  updatedAt: string;
};

export type SerializedPostTag = SerializedTag;

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

export type SubspaceInput = {
  description: string;
  name: string;
  slug: string;
};

type SubspaceField = "description" | "id" | "name" | "slug";

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

export type PostInput = {
  bodyMarkdown: string;
  subspaceId: string;
  tagIds: string[];
};

type PostField = "bodyMarkdown" | "id" | "subspaceId" | "tagIds";

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

export type UploadResponse = {
  contentType: string;
  objectKey: string;
  relativeKey: string;
  size: number;
  uploadedBy: string;
  url: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function readJson(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

function errorResult<TFields extends string>(
  payload: unknown,
  fallback: string,
): {
  error: string;
  fieldErrors?: Partial<Record<TFields, string>>;
  ok: false;
} {
  const errorPayload = isRecord(payload)
    ? (payload as ApiErrorPayload<TFields>)
    : null;

  return {
    error:
      typeof errorPayload?.error === "string" ? errorPayload.error : fallback,
    fieldErrors: errorPayload?.fieldErrors,
    ok: false,
  };
}

async function fetchJson<TSuccess, TFields extends string>(
  endpoint: string,
  init: RequestInit,
  fallbackError: string,
): Promise<
  | (TSuccess & { ok: true })
  | {
      error: string;
      fieldErrors?: Partial<Record<TFields, string>>;
      ok: false;
    }
> {
  try {
    const headers = new Headers(init.headers);

    if (!(init.body instanceof FormData) && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const response = await fetch(endpoint, {
      ...init,
      credentials: "same-origin",
      headers,
    });
    const payload = await readJson(response);

    if (!response.ok) {
      return errorResult<TFields>(payload, fallbackError);
    }

    if (!isRecord(payload) || payload.ok !== true) {
      return {
        error: fallbackError,
        ok: false,
      };
    }

    return payload as TSuccess & { ok: true };
  } catch (error) {
    console.error(`Axum request failed for ${endpoint}`, error);
    return {
      error: fallbackError,
      ok: false,
    };
  }
}

export function createSubspace(
  input: SubspaceInput,
): Promise<SubspaceActionResult> {
  return fetchJson<{ subspace: SerializedSubspace }, SubspaceField>(
    "/api/subspaces",
    {
      body: JSON.stringify(input),
      method: "POST",
    },
    "Subspace mutation failed.",
  );
}

export function updateSubspace(
  id: string,
  input: SubspaceInput,
): Promise<SubspaceActionResult> {
  return fetchJson<{ subspace: SerializedSubspace }, SubspaceField>(
    `/api/subspaces/${encodeURIComponent(id)}`,
    {
      body: JSON.stringify(input),
      method: "PATCH",
    },
    "Subspace mutation failed.",
  );
}

export function deleteSubspace(
  id: string,
): Promise<DeleteSubspaceActionResult> {
  return fetchJson<{ id: string }, SubspaceField>(
    `/api/subspaces/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
    },
    "Subspace mutation failed.",
  );
}

export function createPost(input: PostInput): Promise<PostActionResult> {
  return fetchJson<{ post: SerializedPost }, PostField>(
    "/api/posts",
    {
      body: JSON.stringify(input),
      method: "POST",
    },
    "Post mutation failed.",
  );
}

export function updatePost(
  id: string,
  input: PostInput,
): Promise<PostActionResult> {
  return fetchJson<{ post: SerializedPost }, PostField>(
    `/api/posts/${encodeURIComponent(id)}`,
    {
      body: JSON.stringify(input),
      method: "PATCH",
    },
    "Post mutation failed.",
  );
}

export function deletePost(id: string): Promise<DeletePostActionResult> {
  return fetchJson<{ id: string }, PostField>(
    `/api/posts/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
    },
    "Post mutation failed.",
  );
}

export async function uploadMediaFile(file: File): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/api/uploads", {
    body: formData,
    credentials: "same-origin",
    method: "POST",
  });
  const payload = (await readJson(response)) as
    | { error?: string }
    | UploadResponse
    | null;

  if (!response.ok) {
    const message =
      payload && "error" in payload && payload.error
        ? payload.error
        : "Upload failed";
    throw new Error(message);
  }

  if (!payload || !("url" in payload)) {
    throw new Error("Upload response was invalid");
  }

  return payload;
}
