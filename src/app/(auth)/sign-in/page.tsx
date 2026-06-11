export default function SignInPage() {
  return (
    <main className="mx-auto w-full max-w-[1080px] px-3 py-8 sm:px-4 sm:py-12">
      <header className="mb-8 grid gap-3">
        <p className="m-0 text-sm font-bold uppercase text-accent-strong">
          Auth route group
        </p>
        <h1 className="m-0 max-w-3xl text-[clamp(2rem,6vw,4.5rem)] leading-none">
          Sign-in route
        </h1>
        <p className="m-0 max-w-2xl text-base leading-7 text-muted">
          This route establishes the authentication URL surface for the
          dedicated sign-in experience.
        </p>
      </header>
    </main>
  );
}
