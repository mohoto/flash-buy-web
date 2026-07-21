import { login } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  missing_fields: "Merci de renseigner ton email et ton mot de passe.",
  invalid_credentials: "Email ou mot de passe incorrect.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; denied?: string }>;
}) {
  const { error, denied } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 dark:bg-black">
      <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">
          Flassh buy
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Connecte-toi avec ton compte vendeur Flassh.
        </p>

        {denied && (
          <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            Ton compte n&apos;a pas encore accès à Flassh buy. Contacte
            l&apos;administrateur.
          </p>
        )}
        {error && ERROR_MESSAGES[error] && (
          <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {ERROR_MESSAGES[error]}
          </p>
        )}

        <form action={login} className="mt-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Mot de passe
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>
          <button
            type="submit"
            className="mt-2 rounded-md bg-zinc-950 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
          >
            Se connecter
          </button>
        </form>
      </div>
    </div>
  );
}
