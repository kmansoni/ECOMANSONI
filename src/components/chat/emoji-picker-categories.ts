import { Categories } from "emoji-picker-react";

export const EMOJI_PICKER_CATEGORIES: Array<{ name: string; category: Categories }> = [
  { name: "Недавние", category: Categories.SUGGESTED },
  { name: "Смайлики", category: Categories.SMILEYS_PEOPLE },
  { name: "Животные", category: Categories.ANIMALS_NATURE },
  { name: "Еда", category: Categories.FOOD_DRINK },
  { name: "Путешествия", category: Categories.TRAVEL_PLACES },
  { name: "Активности", category: Categories.ACTIVITIES },
  { name: "Объекты", category: Categories.OBJECTS },
  { name: "Символы", category: Categories.SYMBOLS },
  { name: "Флаги", category: Categories.FLAGS },
];