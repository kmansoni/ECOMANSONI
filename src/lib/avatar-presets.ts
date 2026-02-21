export type AvatarCategory =
  | "animals"
  | "soldiers"
  | "rulers"
  | "kings"
  | "sultans";

export type AvatarGender = "male" | "female";
export type AvatarMotion = "static" | "animated";

export interface AvatarPreset {
  id: string;
  name: string;
  category: AvatarCategory;
  gender: AvatarGender;
  motion: AvatarMotion;
  avatarUrl: string;
}

type Palette = {
  bgA: string;
  bgB: string;
  ring: string;
  fg: string;
};

const CATEGORY_LABELS: Record<AvatarCategory, string> = {
  animals: "Животные",
  soldiers: "Солдаты",
  rulers: "Правители стран",
  kings: "Короли",
  sultans: "Султаны",
};

const GENDER_LABELS: Record<AvatarGender, string> = {
  male: "Мужские",
  female: "Женские",
};

const CATEGORY_PALETTES: Record<AvatarCategory, Palette> = {
  animals: { bgA: "#1f2937", bgB: "#0ea5e9", ring: "#67e8f9", fg: "#f8fafc" },
  soldiers: { bgA: "#1f2937", bgB: "#166534", ring: "#86efac", fg: "#ecfccb" },
  rulers: { bgA: "#111827", bgB: "#0f766e", ring: "#5eead4", fg: "#f0fdfa" },
  kings: { bgA: "#3b0764", bgB: "#7c3aed", ring: "#f59e0b", fg: "#fef9c3" },
  sultans: { bgA: "#1e1b4b", bgB: "#0f766e", ring: "#fbbf24", fg: "#fffbeb" },
};

const CATEGORY_ITEMS: Record<AvatarCategory, string[]> = {
  animals: [
    "Лев",
    "Тигр",
    "Волк",
    "Орел",
    "Пантера",
    "Медведь",
    "Сокол",
    "Рысь",
    "Ягуар",
    "Бизон",
    "Кобра",
    "Фенек",
    "Лис",
    "Барс",
    "Кит",
    "Дельфин",
    "Сова",
    "Ворон",
    "Гепард",
    "Горный козел",
  ],
  soldiers: [
    "Пехотинец",
    "Снайпер",
    "Разведчик",
    "Гвардеец",
    "Командир",
    "Сапер",
    "Связист",
    "Медик",
    "Штурмовик",
    "Офицер",
    "Парашютист",
    "Кавалерист",
    "Морпех",
    "Артиллерист",
    "Тактик",
    "Стратег",
    "Флагман",
    "Щитоносец",
    "Патрульный",
    "Ветеран",
  ],
  rulers: [
    "Президент",
    "Канцлер",
    "Император",
    "Правитель",
    "Регент",
    "Дипломат",
    "Консул",
    "Наместник",
    "Министр",
    "Премьер",
    "Судья",
    "Магистр",
    "Посол",
    "Реформатор",
    "Лидер",
    "Патриарх",
    "Законодатель",
    "Арбитр",
    "Трибун",
    "Губернатор",
  ],
  kings: [
    "Король Севера",
    "Король Пустыни",
    "Король Морей",
    "Король Грома",
    "Король Леса",
    "Король Огня",
    "Король Льда",
    "Король Теней",
    "Король Рассвета",
    "Король Заката",
    "Король Стали",
    "Король Ветра",
    "Король Света",
    "Король Ночи",
    "Король Башен",
    "Король Драконов",
    "Король Молота",
    "Король Звезд",
    "Король Клинка",
    "Король Рун",
  ],
  sultans: [
    "Султан Бури",
    "Султан Оазиса",
    "Султан Полумесяца",
    "Султан Песков",
    "Султан Жемчуга",
    "Султан Торговцев",
    "Султан Дюн",
    "Султан Рассвета",
    "Султан Теней",
    "Султан Ветров",
    "Султан Барханов",
    "Султан Ладана",
    "Султан Крепостей",
    "Султан Караванов",
    "Султан Клинков",
    "Султан Соколов",
    "Султан Неба",
    "Султан Зари",
    "Султан Чести",
    "Султан Легенд",
  ],
};

const CATEGORY_SYMBOLS: Record<AvatarCategory, string> = {
  animals: "A",
  soldiers: "S",
  rulers: "R",
  kings: "K",
  sultans: "U",
};

function encodeSvg(svg: string): string {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function makeAvatarSvg(params: {
  title: string;
  category: AvatarCategory;
  gender: AvatarGender;
  motion: AvatarMotion;
}): string {
  const { title, category, gender, motion } = params;
  const palette = CATEGORY_PALETTES[category];
  const symbol = CATEGORY_SYMBOLS[category];
  const genderMark = gender === "male" ? "M" : "F";
  const ringAnimation =
    motion === "animated"
      ? `<animateTransform attributeName="transform" type="rotate" from="0 64 64" to="360 64 64" dur="8s" repeatCount="indefinite" />`
      : "";
  const pulse =
    motion === "animated"
      ? `<animate attributeName="r" values="34;36;34" dur="2.2s" repeatCount="indefinite" />`
      : "";
  const shimmer =
    motion === "animated"
      ? `<animate attributeName="opacity" values="0.35;0.95;0.35" dur="1.8s" repeatCount="indefinite" />`
      : "";

  const safeTitle = title.replace(/[<>&"]/g, "");

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${palette.bgA}" />
      <stop offset="100%" stop-color="${palette.bgB}" />
    </linearGradient>
  </defs>
  <rect width="128" height="128" rx="64" fill="url(#bg)" />
  <g opacity="0.92" stroke="${palette.ring}" stroke-width="4" fill="none">
    <circle cx="64" cy="64" r="52">${ringAnimation}</circle>
  </g>
  <circle cx="64" cy="56" r="34" fill="${palette.bgA}" stroke="${palette.ring}" stroke-width="2">${pulse}</circle>
  <text x="64" y="62" text-anchor="middle" font-family="Verdana, Arial, sans-serif" font-size="26" font-weight="700" fill="${palette.fg}">${symbol}${genderMark}</text>
  <text x="64" y="106" text-anchor="middle" font-family="Verdana, Arial, sans-serif" font-size="11" fill="${palette.fg}" opacity="0.9">${safeTitle}</text>
  <circle cx="101" cy="27" r="5" fill="${palette.ring}" opacity="0.6">${shimmer}</circle>
</svg>`.trim();
}

function toId(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/^-+|-+$/g, "");
}

function buildPresets(): AvatarPreset[] {
  const all: AvatarPreset[] = [];
  const categories = Object.keys(CATEGORY_ITEMS) as AvatarCategory[];
  const genders: AvatarGender[] = ["male", "female"];

  for (const category of categories) {
    const names = CATEGORY_ITEMS[category];
    for (const gender of genders) {
      names.forEach((name, index) => {
        const motion: AvatarMotion = index < 10 ? "animated" : "static";
        const id = `${category}-${gender}-${toId(name)}-${motion}`;
        const title = `${name}`;
        const svg = makeAvatarSvg({ title, category, gender, motion });
        all.push({
          id,
          name,
          category,
          gender,
          motion,
          avatarUrl: encodeSvg(svg),
        });
      });
    }
  }

  return all;
}

export const avatarPresets: AvatarPreset[] = buildPresets();
export const avatarCategoryLabels = CATEGORY_LABELS;
export const avatarGenderLabels = GENDER_LABELS;
