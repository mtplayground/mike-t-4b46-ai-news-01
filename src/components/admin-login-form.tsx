type AdminLoginFormProps = {
  returnTo: string;
};

function getSafeReturnTo(returnTo: string): string {
  if (!returnTo.startsWith("/") || returnTo.startsWith("/api/")) {
    return "/admin";
  }

  return returnTo;
}

export function AdminLoginForm({ returnTo }: AdminLoginFormProps) {
  const safeReturnTo = getSafeReturnTo(returnTo);
  const action = `/api/admin/login?return_to=${encodeURIComponent(safeReturnTo)}`;

  return (
    <form action={action} className="grid gap-3" method="post">
      <label className="grid gap-2 text-sm font-bold" htmlFor="admin-password">
        Admin password
        <input
          autoComplete="current-password"
          className="h-11 rounded-md border border-border bg-background px-3 text-base font-normal text-foreground outline-none focus:border-accent"
          id="admin-password"
          name="password"
          required
          type="password"
        />
      </label>
      <button
        className="h-11 rounded-md border border-border bg-panel px-4 text-sm font-bold text-foreground"
        type="submit"
      >
        Sign in as admin
      </button>
    </form>
  );
}
