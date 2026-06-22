import { expect, test } from "@playwright/test";

const adminPassword =
  process.env.E2E_ADMIN_PASSWORD ?? "playwright-admin-password";

function apiResponseFor(path: string, method: string) {
  return (response: { request(): { method(): string }; url(): string }) => {
    const url = new URL(response.url());

    return url.pathname === path && response.request().method() === method;
  };
}

test("admin can create a tagged media post and view rendered output", async ({
  page,
}) => {
  const uniqueId = Date.now().toString(36);
  const subspaceName = `E2E Robotics ${uniqueId}`;
  const subspaceSlug = `e2e-robotics-${uniqueId}`;
  const tagName = `E2E Tag ${uniqueId}`;
  const tagSlug = `e2e-tag-${uniqueId}`;
  const postTitle = `E2E Core Flow ${uniqueId}`;
  const uploadUrl = `https://media.example.test/${uniqueId}/flow.png`;
  let uploadRequests = 0;

  await page.route("**/api/uploads", async (route, request) => {
    expect(request.method()).toBe("POST");
    uploadRequests += 1;

    await route.fulfill({
      body: JSON.stringify({
        contentType: "image/png",
        objectKey: `app_mike_t_4b46_ai_news_01_a92a65/uploads/${uniqueId}/flow.png`,
        relativeKey: `uploads/${uniqueId}/flow.png`,
        size: 68,
        uploadedBy: "admin:password",
        url: uploadUrl,
      }),
      contentType: "application/json",
      status: 201,
    });
  });

  await page.goto("/sign-in?return_to=/admin");
  await page.getByLabel("Admin password").fill(adminPassword);
  const adminLoginResponse = page.waitForResponse(
    apiResponseFor("/api/admin/login", "POST"),
  );
  await page.getByRole("button", { name: "Sign in as admin" }).click();
  expect((await adminLoginResponse).status()).toBe(200);
  await page.waitForURL("**/admin");
  await expect(
    page.getByRole("heading", { name: "Manage AI News content." }),
  ).toBeVisible();

  const tagPayload = await page.evaluate(
    async ({ tagName, tagSlug }) => {
      const response = await fetch("/api/tags", {
        body: JSON.stringify({ name: tagName, slug: tagSlug }),
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      return { body: await response.json(), status: response.status };
    },
    { tagName, tagSlug },
  );
  expect(tagPayload.status).toBe(201);
  expect(tagPayload.body).toMatchObject({
    ok: true,
    tag: {
      name: tagName,
      slug: tagSlug,
    },
  });

  const subspacePayload = await page.evaluate(
    async ({ subspaceName, subspaceSlug }) => {
      const response = await fetch("/api/subspaces", {
        body: JSON.stringify({
          description: "Temporary E2E subspace for the core publishing flow.",
          name: subspaceName,
          slug: subspaceSlug,
        }),
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      return { body: await response.json(), status: response.status };
    },
    { subspaceName, subspaceSlug },
  );
  expect(subspacePayload.status).toBe(201);
  expect(subspacePayload.body).toMatchObject({
    ok: true,
    subspace: {
      name: subspaceName,
      slug: subspaceSlug,
    },
  });

  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Manage AI News content." }),
  ).toBeVisible();

  const postEditor = page.getByRole("region", {
    name: "Post editor",
  });
  await postEditor
    .getByLabel("Subspace")
    .selectOption({ label: `${subspaceName} /${subspaceSlug}` });
  await postEditor
    .getByLabel("Markdown")
    .fill(`# ${postTitle}\n\nThis **rendered** post covers media and tags.`);
  await postEditor.locator('input[type="file"]').setInputFiles({
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+P+/HgAFeAJ5gU4SZQAAAABJRU5ErkJggg==",
      "base64",
    ),
    mimeType: "image/png",
    name: "flow.png",
  });
  await postEditor.getByRole("button", { name: "Upload and insert" }).click();
  await expect(
    postEditor.getByText(`uploads/${uniqueId}/flow.png`),
  ).toBeVisible();
  expect(uploadRequests).toBe(1);
  await expect(postEditor.getByLabel("Markdown")).toHaveValue(
    new RegExp(`!\\[flow\\]\\(${uploadUrl.replaceAll("/", "\\/")}\\)`),
  );

  const tagCheckbox = postEditor
    .getByRole("checkbox", { name: new RegExp(tagName) })
    .first();
  await expect(tagCheckbox).toBeVisible();
  await tagCheckbox.check();

  const createPostResponse = page.waitForResponse(
    apiResponseFor("/api/posts", "POST"),
  );
  await postEditor.getByRole("button", { name: "Create post" }).click();
  const postResponse = await createPostResponse;
  expect(postResponse.status()).toBe(201);
  const postPayload = await postResponse.json();
  expect(postPayload).toMatchObject({ ok: true });
  const createdPostId = postPayload.post.id as string;
  await expect(postEditor.getByText("Post created.")).toBeVisible();

  await page.goto("/");
  const postLink = page
    .getByRole("link", {
      name: new RegExp(postTitle),
    })
    .first();
  await expect(postLink).toBeVisible();
  await page.goto(`/s/${subspaceSlug}/${encodeURIComponent(createdPostId)}`);
  await expect(page).toHaveURL(
    new RegExp(`/s/${subspaceSlug}/${encodeURIComponent(createdPostId)}$`),
  );
  await expect(
    page.getByRole("heading", { name: postTitle }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("This rendered post covers media and tags."),
  ).toBeVisible();
  await expect(page.getByRole("img", { name: "flow" })).toHaveAttribute(
    "src",
    uploadUrl,
  );
  await expect(page.getByRole("link", { name: `#${tagName}` })).toBeVisible();
});
