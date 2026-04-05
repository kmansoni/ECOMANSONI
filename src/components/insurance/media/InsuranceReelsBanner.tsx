

export interface InsuranceReel {
  id: string;
  companyId: string;
  companyName: string;
  companyLogo: string;
  isVerified: boolean;
  thumbnailUrl: string;
  title: string;
  views: number;
  likes: number;
  duration: number;
  isSponsored: boolean;
  sponsorPrice?: number;
  createdAt: string;
}

interface InsuranceReelsBannerProps {
  filterCompanyId?: string;
}

export function InsuranceReelsBanner({ filterCompanyId: _filterCompanyId }: InsuranceReelsBannerProps) {
  // Таблицы insurance_reels в БД нет — скрываем
  return null;
}
