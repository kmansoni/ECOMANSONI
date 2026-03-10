/**
 * src/pages/EmailSettingsPage.tsx
 * Route: /email/settings
 */
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SmtpSettingsPanel } from "@/components/email/SmtpSettingsPanel";

export function EmailSettingsPage() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Mail className="h-5 w-5 text-primary" />
          <span className="font-semibold">Настройки почты</span>
        </div>
      </div>
      <div className="mx-auto max-w-3xl px-4 py-6">
        <SmtpSettingsPanel />
      </div>
    </div>
  );
}

export default EmailSettingsPage;
