import { createContext, useContext } from "react";
import type { CreateMode, CreateSession } from "./session/types";

export type CreateStudioTab = "publications" | "stories" | "reels" | "live";

export type CreateStudioOpenOptions = {
  tab?: CreateStudioTab;
  closeTo?: string | number;
  successTo?: string;
};

export type CreateStudioContextValue = {
  isOpen: boolean;
  initialTab: CreateStudioTab;
  closeTo?: string | number;
  successTo?: string;
  session: CreateSession;
  openCreateStudio: (options?: CreateStudioOpenOptions) => void;
  closeCreateStudio: () => void;
};

export const CreateStudioContext = createContext<CreateStudioContextValue | null>(null);

export function useCreateStudio() {
  const context = useContext(CreateStudioContext);
  if (!context) {
    throw new Error("useCreateStudio must be used within CreateStudioProvider");
  }
  return context;
}

export function mapCreateQueryTab(value: string | null): CreateStudioTab {
  const tab = String(value || "").toLowerCase();
  if (tab === "story" || tab === "stories") return "stories";
  if (tab === "reel" || tab === "reels") return "reels";
  if (tab === "live") return "live";
  return "publications";
}

export function mapCreateTabToMode(tab: CreateStudioTab): CreateMode {
  if (tab === "stories") return "story";
  if (tab === "reels") return "reels";
  if (tab === "live") return "live";
  return "post";
}
