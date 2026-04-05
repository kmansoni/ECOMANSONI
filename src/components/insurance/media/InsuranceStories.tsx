

export interface InsuranceStoryItem {
  id: string;
  imageUrl?: string;
  title: string;
  description: string;
  ctaText?: string;
  ctaLink?: string;
  backgroundColor: string;
  createdAt: string;
  expiresAt: string;
  isSponsored: boolean;
  price?: number;
}

export interface InsuranceStory {
  id: string;
  companyId: string;
  companyName: string;
  companyLogo: string;
  isVerified: boolean;
  type: "company" | "agent" | "broker";
  stories: InsuranceStoryItem[];
  hasUnviewed: boolean;
}

interface InsuranceStoriesProps {
  filterCompanyId?: string;
}

export function InsuranceStories({ filterCompanyId: _filterCompanyId }: InsuranceStoriesProps) {
  // Таблицы insurance_stories в БД нет — скрываем компонент
  return null;
}
