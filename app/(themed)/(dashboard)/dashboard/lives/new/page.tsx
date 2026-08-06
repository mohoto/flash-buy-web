import { redirect } from "next/navigation";
import { getOwnShop } from "@/lib/dashboard/get-own-shop";
import { findActiveLiveId, getLastLiveDefaults } from "../actions";
import { NewLiveForm } from "./new-live-form";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export default async function NewLivePage() {
  // Un live scheduled/live existe déjà pour ce shop (ex. onglet dupliqué,
  // retour en arrière du navigateur) — y renvoyer plutôt que de proposer un
  // second formulaire qui créerait un doublon (cf. garde dans
  // createAndStartLive).
  const existingId = await findActiveLiveId();
  if (existingId) {
    redirect(`/dashboard/live/${existingId}`);
  }

  const shop = await getOwnShop();
  const { tiktokUsername, rapidIntentSeq } = await getLastLiveDefaults();

  return (
    <Card className="mx-auto w-full max-w-lg">
      <CardHeader>
        <CardTitle className="text-center">Connexion TikTok LIVE</CardTitle>
      </CardHeader>
      <CardContent>
        <NewLiveForm
          tiktokUsername={tiktokUsername}
          saleKeywords={shop.sale_keywords}
          rapidIntentSeq={rapidIntentSeq}
        />
      </CardContent>
    </Card>
  );
}
