import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getAuthenticatedActorFromCookieHeader } from "@/lib/authorization";
import { getSignedObjectUrl, uploadObject } from "@/lib/object-storage";

export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const SUPPORTED_MEDIA_PREFIXES = ["image/", "video/"] as const;

function errorJson(message: string, status: number) {
  return NextResponse.json(
    {
      error: message,
    },
    {
      status,
    },
  );
}

function isSupportedMediaType(contentType: string): boolean {
  return SUPPORTED_MEDIA_PREFIXES.some((prefix) =>
    contentType.startsWith(prefix),
  );
}

function safeFilename(filename: string): string {
  const normalized = filename
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized.length > 0 ? normalized : "upload";
}

function buildRelativeKey(filename: string): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");

  return `uploads/${year}/${month}/${randomUUID()}-${safeFilename(filename)}`;
}

function getUploadFile(formData: FormData): File | null {
  const file = formData.get("file");

  return file instanceof File ? file : null;
}

export async function POST(request: NextRequest) {
  const actor = await getAuthenticatedActorFromCookieHeader(
    request.headers.get("cookie"),
  );

  if (!actor) {
    return errorJson("Authentication required", 401);
  }

  try {
    const formData = await request.formData();
    const file = getUploadFile(formData);

    if (!file) {
      return errorJson('Upload field "file" is required', 400);
    }

    if (!isSupportedMediaType(file.type)) {
      return errorJson("Only image and video uploads are supported", 415);
    }

    if (file.size <= 0) {
      return errorJson("Uploaded file is empty", 400);
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return errorJson("Uploaded file is larger than 100 MB", 413);
    }

    const body = Buffer.from(await file.arrayBuffer());
    const relativeKey = buildRelativeKey(file.name);
    const storedObject = await uploadObject({
      body,
      contentType: file.type,
      relativeKey,
    });
    const url = await getSignedObjectUrl(storedObject.relativeKey);

    return NextResponse.json(
      {
        contentType: storedObject.contentType,
        objectKey: storedObject.objectKey,
        relativeKey: storedObject.relativeKey,
        size: storedObject.contentLength,
        uploadedBy: actor.sub,
        url,
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    console.error("Upload failed", error);
    return errorJson("Upload failed", 500);
  }
}
