import { useState } from "react";
import { cn } from "@/lib/utils";
import { ServicesMenu } from "@/components/layout/ServicesMenu";

const tabs = [
  { id: "foryou", label: "Рекомендации" },
  { id: "following", label: "Подписки" },
];

export function FeedTabs() {
  const [activeTab, setActiveTab] = useState("foryou");

  return (
    <div className="flex items-center justify-between px-4 py-3">
      <ServicesMenu />
      <div className="flex bg-card/70 backdrop-blur-sm rounded-full p-1 shadow-sm border border-border/60">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "px-4 py-1.5 text-sm font-medium rounded-full transition-all",
              activeTab === tab.id
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}
