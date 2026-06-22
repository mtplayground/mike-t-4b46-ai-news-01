#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createServer, request as httpRequest } from "node:http";
import { existsSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const PUBLIC_HOST = process.env.HOST ?? "0.0.0.0";
const PUBLIC_PORT = Number.parseInt(process.env.PORT ?? "8080", 10);
const NEXT_HOST = process.env.NEXT_HOST ?? "127.0.0.1";
const NEXT_PORT = Number.parseInt(process.env.NEXT_PORT ?? "3000", 10);
const AXUM_HOST = process.env.AXUM_HOST ?? "127.0.0.1";
const AXUM_PORT = Number.parseInt(process.env.AXUM_PORT ?? "8081", 10);
const MAX_BUFFERED_API_BODY_BYTES = 110 * 1024 * 1024;
const AXUM_BINARY = resolveAxumBinary();
const AXUM_MODE = process.env.AXUM_MODE ?? "binary";
const NEXT_MODE = process.env.NEXT_MODE ?? "start";

validatePort("PORT", PUBLIC_PORT);
validatePort("NEXT_PORT", NEXT_PORT);
validatePort("AXUM_PORT", AXUM_PORT);

const children = [
  spawnManaged(
    "axum-api",
    AXUM_MODE === "cargo" ? "cargo" : AXUM_BINARY,
    AXUM_MODE === "cargo" ? ["run", "--bin", "mike-t-4b46-ai-news-01-api"] : [],
    {
      ...process.env,
      HOST: AXUM_HOST,
      PORT: String(AXUM_PORT),
    },
  ),
  spawnManaged("next", process.execPath, [
    "node_modules/next/dist/bin/next",
    NEXT_MODE === "dev" ? "dev" : "start",
    "-H",
    NEXT_HOST,
    "-p",
    String(NEXT_PORT),
  ]),
];

const server = createServer((clientRequest, clientResponse) => {
  const url = clientRequest.url ?? "/";

  if (url === "/api" || url.startsWith("/api/")) {
    handleApiRequest(clientRequest, clientResponse);
    return;
  }

  proxyStreaming(clientRequest, clientResponse, {
    host: NEXT_HOST,
    port: NEXT_PORT,
    serviceName: "next",
  });
});

server.on("clientError", (error, socket) => {
  console.error("[gateway] client error", error);
  socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
});

server.listen(PUBLIC_PORT, PUBLIC_HOST, () => {
  console.log(
    `[gateway] listening on ${PUBLIC_HOST}:${PUBLIC_PORT}; /api/* -> Axum ${AXUM_HOST}:${AXUM_PORT} with 404 fallback to Next ${NEXT_HOST}:${NEXT_PORT}; pages/assets -> Next (${NEXT_MODE})`,
  );
});

async function handleApiRequest(clientRequest, clientResponse) {
  let body;

  try {
    body = await readBody(clientRequest, MAX_BUFFERED_API_BODY_BYTES);
  } catch (error) {
    console.error("[gateway] failed to read API request body", error);
    clientResponse.writeHead(413, {
      "content-type": "text/plain; charset=utf-8",
    });
    clientResponse.end("API request body is too large");
    return;
  }

  try {
    const axumResponse = await proxyBuffered(clientRequest, body, {
      host: AXUM_HOST,
      port: AXUM_PORT,
      serviceName: "axum-api",
    });

    if (axumResponse.statusCode !== 404) {
      writeBufferedResponse(clientResponse, axumResponse);
      return;
    }
  } catch (error) {
    console.error("[gateway] Axum API proxy failed", error);
    clientResponse.writeHead(502, {
      "content-type": "text/plain; charset=utf-8",
    });
    clientResponse.end("Axum API proxy failed");
    return;
  }

  try {
    const nextResponse = await proxyBuffered(clientRequest, body, {
      host: NEXT_HOST,
      port: NEXT_PORT,
      serviceName: "next-fallback",
    });
    writeBufferedResponse(clientResponse, nextResponse);
  } catch (error) {
    console.error("[gateway] Next API fallback proxy failed", error);
    clientResponse.writeHead(502, {
      "content-type": "text/plain; charset=utf-8",
    });
    clientResponse.end("Next API fallback proxy failed");
  }
}

function resolveAxumBinary() {
  if (process.env.AXUM_BIN) {
    return process.env.AXUM_BIN;
  }

  const releaseBinary = join(
    process.cwd(),
    "target",
    "release",
    "mike-t-4b46-ai-news-01-api",
  );

  if (existsSync(releaseBinary)) {
    return releaseBinary;
  }

  return join(process.cwd(), "target", "debug", "mike-t-4b46-ai-news-01-api");
}

function validatePort(name, port) {
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`${name} must be a valid TCP port`);
  }
}

function spawnManaged(name, command, args, env = process.env) {
  const child = spawn(command, args, {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk) =>
    process.stdout.write(prefixLines(name, chunk)),
  );
  child.stderr.on("data", (chunk) =>
    process.stderr.write(prefixLines(name, chunk)),
  );
  child.on("exit", (code, signal) => {
    console.error(
      `[${name}] exited code=${code ?? "null"} signal=${signal ?? "null"}`,
    );
    shutdown(code === 0 ? 0 : 1);
  });
  child.on("error", (error) => {
    console.error(`[${name}] failed to start`, error);
    shutdown(1);
  });

  return child;
}

function prefixLines(name, chunk) {
  return chunk
    .toString()
    .split(/(?<=\n)/)
    .map((line) => (line.length > 0 ? `[${name}] ${line}` : line))
    .join("");
}

function copyHeaders(sourceHeaders, targetHost, targetPort) {
  const headers = { ...sourceHeaders };
  headers.host = `${targetHost}:${targetPort}`;
  headers["x-forwarded-host"] = sourceHeaders.host ?? headers.host;
  headers["x-forwarded-proto"] = process.env.FORWARDED_PROTO ?? "https";
  headers["x-forwarded-port"] = String(PUBLIC_PORT);
  return headers;
}

function proxyStreaming(clientRequest, clientResponse, target) {
  const upstream = httpRequest(
    {
      hostname: target.host,
      port: target.port,
      method: clientRequest.method,
      path: clientRequest.url,
      headers: copyHeaders(clientRequest.headers, target.host, target.port),
    },
    (upstreamResponse) => {
      clientResponse.writeHead(
        upstreamResponse.statusCode ?? 502,
        upstreamResponse.statusMessage,
        upstreamResponse.headers,
      );
      upstreamResponse.pipe(clientResponse);
    },
  );

  upstream.on("error", (error) => {
    console.error(`[gateway] ${target.serviceName} proxy failed`, error);
    if (!clientResponse.headersSent) {
      clientResponse.writeHead(502, {
        "content-type": "text/plain; charset=utf-8",
      });
    }
    clientResponse.end(`${target.serviceName} proxy failed`);
  });

  clientRequest.pipe(upstream);
}

function proxyBuffered(clientRequest, body, target) {
  return new Promise((resolve, reject) => {
    const headers = copyHeaders(
      clientRequest.headers,
      target.host,
      target.port,
    );
    delete headers["transfer-encoding"];
    headers["content-length"] = String(body.byteLength);

    const upstream = httpRequest(
      {
        hostname: target.host,
        port: target.port,
        method: clientRequest.method,
        path: clientRequest.url,
        headers,
      },
      (upstreamResponse) => {
        const chunks = [];
        upstreamResponse.on("data", (chunk) => chunks.push(chunk));
        upstreamResponse.on("end", () => {
          resolve({
            body: Buffer.concat(chunks),
            headers: upstreamResponse.headers,
            statusCode: upstreamResponse.statusCode ?? 502,
            statusMessage: upstreamResponse.statusMessage,
          });
        });
      },
    );

    upstream.on("error", reject);
    upstream.end(body);
  });
}

function writeBufferedResponse(clientResponse, upstreamResponse) {
  clientResponse.writeHead(
    upstreamResponse.statusCode,
    upstreamResponse.statusMessage,
    upstreamResponse.headers,
  );
  clientResponse.end(upstreamResponse.body);
}

function readBody(request, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;

    request.on("data", (chunk) => {
      totalBytes += chunk.byteLength;

      if (totalBytes > maxBytes) {
        reject(new Error(`request exceeded ${maxBytes} bytes`));
        request.destroy();
        return;
      }

      chunks.push(chunk);
    });

    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

function shutdown(exitCode) {
  server.close();

  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }

  setTimeout(() => process.exit(exitCode), 500).unref();
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
