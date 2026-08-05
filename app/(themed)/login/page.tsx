import { login } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";

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
    <div className="relative flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <Card className="w-full max-w-md">
        <CardContent className="p-8">
          <h1 className="text-2xl font-semibold text-foreground">Flassh buy</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Connecte-toi avec ton compte vendeur Flassh.
          </p>

          {denied && (
            <Alert variant="warning" className="mt-4">
              <AlertDescription>
                Ton compte n&apos;a pas encore accès à Flassh buy. Contacte l&apos;administrateur.
              </AlertDescription>
            </Alert>
          )}
          {error && ERROR_MESSAGES[error] && (
            <Alert variant="error" className="mt-4">
              <AlertDescription>{ERROR_MESSAGES[error]}</AlertDescription>
            </Alert>
          )}

          <form action={login} className="mt-7 flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                size="lg"
                className="**:data-[slot=input]:h-12 **:data-[slot=input]:text-base **:data-[slot=input]:leading-12"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Mot de passe</Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                size="lg"
                className="**:data-[slot=input]:h-12 **:data-[slot=input]:text-base **:data-[slot=input]:leading-12"
              />
            </div>
            <Button
              type="submit"
              size="xl"
              className="mt-2 h-12 w-full border-[#00F2EA] bg-[#00F2EA] text-black shadow-[#00F2EA]/24 hover:bg-[#00F2EA]/90 data-pressed:bg-[#00F2EA]/90"
            >
              Se connecter
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
