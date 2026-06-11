type RequiredEnvName =
  | "ADMIN_PASSWORD"
  | "DATABASE_URL"
  | "MCTAI_AUTH_APP_TOKEN"
  | "MCTAI_AUTH_JWKS_URL"
  | "MCTAI_AUTH_URL"
  | "OBJECT_STORAGE_ACCESS_KEY_ID"
  | "OBJECT_STORAGE_BUCKET"
  | "OBJECT_STORAGE_ENDPOINT"
  | "OBJECT_STORAGE_FORCE_PATH_STYLE"
  | "OBJECT_STORAGE_PREFIX"
  | "OBJECT_STORAGE_REGION"
  | "OBJECT_STORAGE_SECRET_ACCESS_KEY"
  | "SELF_URL";

export type AuthEnv = {
  appToken: string;
  jwksUrl: string;
  url: string;
};

export type ObjectStorageEnv = {
  accessKeyId: string;
  bucket: string;
  endpoint: string;
  forcePathStyle: boolean;
  prefix: string;
  region: string;
  secretAccessKey: string;
};

export type ServerEnv = {
  adminPassword: string;
  auth: AuthEnv;
  databaseUrl: string;
  objectStorage: ObjectStorageEnv;
  selfUrl: string;
};

function requireEnv(name: RequiredEnvName): string {
  const value = process.env[name];

  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function requireBooleanEnv(name: RequiredEnvName): boolean {
  const value = requireEnv(name).toLowerCase();

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  throw new Error(`Environment variable ${name} must be "true" or "false"`);
}

export function getDatabaseUrl(): string {
  return requireEnv("DATABASE_URL");
}

export function getAuthEnv(): AuthEnv {
  return {
    appToken: requireEnv("MCTAI_AUTH_APP_TOKEN"),
    jwksUrl: requireEnv("MCTAI_AUTH_JWKS_URL"),
    url: requireEnv("MCTAI_AUTH_URL"),
  };
}

export function getAdminPassword(): string {
  return requireEnv("ADMIN_PASSWORD");
}

export function getObjectStorageEnv(): ObjectStorageEnv {
  const prefix = requireEnv("OBJECT_STORAGE_PREFIX");

  if (!prefix.endsWith("/")) {
    throw new Error(
      'Environment variable OBJECT_STORAGE_PREFIX must end with "/"',
    );
  }

  return {
    accessKeyId: requireEnv("OBJECT_STORAGE_ACCESS_KEY_ID"),
    bucket: requireEnv("OBJECT_STORAGE_BUCKET"),
    endpoint: requireEnv("OBJECT_STORAGE_ENDPOINT"),
    forcePathStyle: requireBooleanEnv("OBJECT_STORAGE_FORCE_PATH_STYLE"),
    prefix,
    region: requireEnv("OBJECT_STORAGE_REGION"),
    secretAccessKey: requireEnv("OBJECT_STORAGE_SECRET_ACCESS_KEY"),
  };
}

export function getSelfUrl(): string {
  return requireEnv("SELF_URL");
}

export function getServerEnv(): ServerEnv {
  return {
    adminPassword: getAdminPassword(),
    auth: getAuthEnv(),
    databaseUrl: getDatabaseUrl(),
    objectStorage: getObjectStorageEnv(),
    selfUrl: getSelfUrl(),
  };
}
