import { CreditCard } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";

export default function PaymentSettingsPage() {
  return (
    <Card>
      <CardContent className="p-5">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CreditCard />
            </EmptyMedia>
            <EmptyTitle>Bientôt disponible</EmptyTitle>
            <EmptyDescription>
              Le paiement en ligne (Stripe) arrive dans une prochaine mise à jour.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </CardContent>
    </Card>
  );
}
