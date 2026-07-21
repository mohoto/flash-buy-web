import { getOwnShop } from "@/lib/dashboard/get-own-shop";
import { updateLiveSettings } from "./actions";
import { CopyLinkButton } from "./copy-link-button";

const ERROR_MESSAGES: Record<string, string> = {
  invalid_slug: "Le lien ne peut contenir que des lettres minuscules, chiffres et tirets.",
  slug_taken: "Ce lien est déjà utilisé par une autre boutique.",
  update_failed: "La mise à jour a échoué, réessaie.",
};

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const shop = await getOwnShop();
  const { saved, error } = await searchParams;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const liveLink = shop.cart_slug ? `${appUrl}/live/${shop.cart_slug}` : null;

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
        Réglages
      </h1>

      {saved && (
        <p className="mt-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
          Réglages enregistrés.
        </p>
      )}
      {error && ERROR_MESSAGES[error] && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {ERROR_MESSAGES[error]}
        </p>
      )}

      <form action={updateLiveSettings} className="mt-6 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="tiktok_username" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Pseudo TikTok
          </label>
          <input
            id="tiktok_username"
            name="tiktok_username"
            defaultValue={shop.tiktok_username ?? ""}
            placeholder="@monshop"
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="cart_slug" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Lien de panier (fixe)
          </label>
          <input
            id="cart_slug"
            name="cart_slug"
            defaultValue={shop.cart_slug ?? ""}
            placeholder="boutique-julie"
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <p className="text-xs text-zinc-500">
            C&apos;est le seul lien à mettre en bio TikTok. Il ne change pas
            entre les lives.
          </p>
        </div>
        <button
          type="submit"
          className="mt-2 self-start rounded-md bg-zinc-950 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950"
        >
          Enregistrer
        </button>
      </form>

      {liveLink && (
        <div className="mt-8 flex items-center justify-between rounded-md border border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <code className="text-sm text-zinc-700 dark:text-zinc-300">{liveLink}</code>
          <CopyLinkButton link={liveLink} />
        </div>
      )}
    </div>
  );
}
