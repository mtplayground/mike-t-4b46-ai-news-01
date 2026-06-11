import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getObjectStorageEnv } from "@/lib/env";

const SIGNED_READ_TTL_SECONDS = 60 * 60;

let cachedClient: S3Client | null = null;

export type StoredObject = {
  bucket: string;
  contentLength: number;
  contentType: string;
  objectKey: string;
  relativeKey: string;
};

export type UploadObjectInput = {
  body: Buffer;
  contentType: string;
  relativeKey: string;
};

function getObjectStorageClient(): S3Client {
  if (cachedClient) {
    return cachedClient;
  }

  const env = getObjectStorageEnv();

  cachedClient = new S3Client({
    credentials: {
      accessKeyId: env.accessKeyId,
      secretAccessKey: env.secretAccessKey,
    },
    endpoint: env.endpoint,
    forcePathStyle: env.forcePathStyle,
    region: env.region,
    requestChecksumCalculation: "WHEN_REQUIRED",
  });

  return cachedClient;
}

function normalizeRelativeKey(relativeKey: string): string {
  const normalized = relativeKey.replace(/^\/+/, "");

  if (
    normalized.length === 0 ||
    normalized.includes("..") ||
    normalized.includes("\\")
  ) {
    throw new Error("Invalid object storage key");
  }

  return normalized;
}

export function toObjectStorageKey(relativeKey: string): string {
  const env = getObjectStorageEnv();

  return `${env.prefix}${normalizeRelativeKey(relativeKey)}`;
}

export async function uploadObject(
  input: UploadObjectInput,
): Promise<StoredObject> {
  const env = getObjectStorageEnv();
  const objectKey = toObjectStorageKey(input.relativeKey);
  const contentLength = input.body.byteLength;

  await getObjectStorageClient().send(
    new PutObjectCommand({
      Body: input.body,
      Bucket: env.bucket,
      ContentLength: contentLength,
      ContentType: input.contentType,
      Key: objectKey,
    }),
  );

  return {
    bucket: env.bucket,
    contentLength,
    contentType: input.contentType,
    objectKey,
    relativeKey: normalizeRelativeKey(input.relativeKey),
  };
}

export async function getSignedObjectUrl(
  relativeKey: string,
  expiresIn = SIGNED_READ_TTL_SECONDS,
): Promise<string> {
  const env = getObjectStorageEnv();
  const objectKey = toObjectStorageKey(relativeKey);

  return getSignedUrl(
    getObjectStorageClient(),
    new GetObjectCommand({
      Bucket: env.bucket,
      Key: objectKey,
    }),
    {
      expiresIn,
    },
  );
}
