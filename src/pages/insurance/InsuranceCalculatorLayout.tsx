import { useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { InsuranceAssistant } from "@/components/insurance/InsuranceAssistant";

export interface FaqItem {
  question: string;
  answer: string;
}

interface InsuranceCalculatorLayoutProps {
  title: string;
  breadcrumb: string;
  calculator: React.ReactNode;
  faqItems: FaqItem[];
}

export function InsuranceCalculatorLayout({
  title,
  breadcrumb,
  calculator,
  faqItems,
}: InsuranceCalculatorLayoutProps) {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-border/50">
        <div className="flex items-center gap-3 px-4 py-3">
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={() => navigate(-1)}
          >
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground">Страхование › {breadcrumb}</p>
            <h1 className="text-base font-semibold truncate">{title}</h1>
          </div>
        </div>
      </div>

      <div className="px-4 pt-4 space-y-6">
        {/* Calculator */}
        <div>{calculator}</div>

        {/* FAQ */}
        {faqItems.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold mb-3">Частые вопросы</h2>
            <Accordion type="single" collapsible className="space-y-2">
              {faqItems.map((item, index) => (
                <AccordionItem
                  key={index}
                  value={`faq-${index}`}
                  className="border border-border/50 rounded-xl px-4 bg-card"
                >
                  <AccordionTrigger className="text-sm font-medium py-3 hover:no-underline">
                    {item.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground pb-3">
                    {item.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </section>
        )}
      </div>

      {/* AI Assistant floating button */}
      <InsuranceAssistant />
    </div>
  );
}

export default InsuranceCalculatorLayout;
