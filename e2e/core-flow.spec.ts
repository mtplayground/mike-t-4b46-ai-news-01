import { expect, test } from "@playwright/test";

const adminPassword =
  process.env.E2E_ADMIN_PASSWORD ?? "playwright-admin-password";

test("admin can create a tagged media post and view rendered output", async ({
  page,
}) => {
  const uniqueId = Date.now().toString(36);
  const subspaceName = `E2E Robotics ${uniqueId}`;
  const subspaceSlug = `e2e-robotics-${uniqueId}`;
  const postTitle = `E2E Core Flow ${uniqueId}`;
  const uploadUrl = `https://media.example.test/${uniqueId}/flow.png`;

  await page.route("**/api/uploads", async (route) => {
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
  await page.getByRole("button", { name: "Sign in as admin" }).click();
  await page.waitForURL("**/admin");
  await expect(
    page.getByRole("heading", { name: "Manage AI News content." }),
  ).toBeVisible();

  const subspaceEditor = page.getByRole("region", {
    name: "Subspace editor",
  });
  await subspaceEditor.getByLabel("Name").fill(subspaceName);
  await subspaceEditor.getByLabel("Slug").fill(subspaceSlug);
  await subspaceEditor
    .getByLabel("Description")
    .fill("Temporary E2E subspace for the core publishing flow.");
  await subspaceEditor.getByRole("button", { name: "Create" }).click();
  await expect(subspaceEditor.getByText("Subspace created.")).toBeVisible();

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
  await postEditor.getByLabel("Media").setInputFiles({
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
  await expect(postEditor.getByLabel("Markdown")).toHaveValue(
    new RegExp(`!\\[flow\\]\\(${uploadUrl.replaceAll("/", "\\/")}\\)`),
  );

  const tagCheckbox = postEditor.locator('input[name="tagIds"]').first();
  await expect(tagCheckbox).toBeVisible();
  const tagLabel = tagCheckbox.locator("xpath=ancestor::label");
  const tagName = ((await tagLabel.innerText()).split("\n")[0] ?? "").trim();
  await tagCheckbox.check();

  await postEditor.getByRole("button", { name: "Create post" }).click();
  await expect(postEditor.getByText("Post created.")).toBeVisible();

  await page.goto("/");
  const postLink = page
    .getByRole("link", {
      name: new RegExp(postTitle),
    })
    .first();
  await expect(postLink).toBeVisible();
  await postLink.click();
  await expect(page).toHaveURL(new RegExp(`/s/${subspaceSlug}/[^/]+$`));
  await expect(page.getByRole("heading", { name: postTitle })).toBeVisible();
  await expect(
    page.getByText("This rendered post covers media and tags."),
  ).toBeVisible();
  await expect(page.getByRole("img", { name: "flow" })).toHaveAttribute(
    "src",
    uploadUrl,
  );
  await expect(page.getByRole("link", { name: `#${tagName}` })).toBeVisible();
});
