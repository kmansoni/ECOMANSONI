// Полный список стран мира с inline SVG флагами
// SVG флаги для максимального качества и отсутствия 404 ошибок

export interface CountryData {
  code: string;
  name: string;
  nameEn: string;
  dialCode: string;
  flag: string; // inline SVG data URI
}

// Inline SVG флаги стран (оптимизированные, компактные)
// Используем viewBox с правильными пропорциями 3:2
const f = (rects: Array<{ fill: string; w: number }>, aspectRatio: number = 1.5): string => {
  const height = 240 / aspectRatio;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 ${height}">`;
  let x = 0;
  for (const { fill, w } of rects) {
    svg += `<rect x="${x}" width="${w}" height="${height}" fill="${fill}"/>`;
    x += w;
  }
  return svg + "</svg>";
};

// Конвертация вертикальных полос в data URI
const fd = (rects: Array<{ fill: string; w: number }>, aspectRatio: number = 1.5): string =>
  "data:image/svg+xml;utf8," + encodeURIComponent(f(rects, aspectRatio));

// Горизонтальные полосы (Россия, Германия, Беларусь и др.)
const fh = (rows: Array<{ fill: string; h: number }>, aspectRatio: number = 1.5): string => {
  const W = 320;
  const H = Math.round(W / aspectRatio);
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">`;
  let y = 0;
  for (const { fill, h } of rows) {
    svg += `<rect y="${y}" height="${h}" width="${W}" fill="${fill}"/>`;
    y += h;
  }
  return svg + "</svg>";
};

const fdh = (rows: Array<{ fill: string; h: number }>, aspectRatio: number = 1.5): string =>
  "data:image/svg+xml;utf8," + encodeURIComponent(fh(rows, aspectRatio));

export const countries: CountryData[] = [
  // СНГ и соседи — горизонтальные полосы через fdh
  { code: "RU", name: "Россия", nameEn: "Russia", dialCode: "7", flag: fdh([{ fill: "#FFF", h: 71 }, { fill: "#003DA5", h: 71 }, { fill: "#CC0000", h: 71 }]) },
  { code: "KZ", name: "Казахстан", nameEn: "Kazakhstan", dialCode: "7", flag: fdh([{ fill: "#00AFCA", h: 107 }, { fill: "#FFDE00", h: 106 }]) },
  { code: "BY", name: "Беларусь", nameEn: "Belarus", dialCode: "375", flag: fdh([{ fill: "#CF101A", h: 143 }, { fill: "#009A44", h: 70 }]) },
  { code: "UA", name: "Украина", nameEn: "Ukraine", dialCode: "380", flag: fdh([{ fill: "#005BBB", h: 107 }, { fill: "#FFD500", h: 106 }]) },
  { code: "UZ", name: "Узбекистан", nameEn: "Uzbekistan", dialCode: "998", flag: fdh([{ fill: "#1EB53A", h: 71 }, { fill: "#FFF", h: 71 }, { fill: "#CE1126", h: 71 }]) },
  { code: "KG", name: "Кыргызстан", nameEn: "Kyrgyzstan", dialCode: "996", flag: fdh([{ fill: "#E8112D", h: 213 }]) },
  { code: "TJ", name: "Таджикистан", nameEn: "Tajikistan", dialCode: "992", flag: fdh([{ fill: "#CC0000", h: 71 }, { fill: "#FFF", h: 71 }, { fill: "#006600", h: 71 }]) },
  { code: "TM", name: "Туркменистан", nameEn: "Turkmenistan", dialCode: "993", flag: fdh([{ fill: "#31A84C", h: 213 }]) },
  { code: "AZ", name: "Азербайджан", nameEn: "Azerbaijan", dialCode: "994", flag: fdh([{ fill: "#0092BC", h: 71 }, { fill: "#E8003A", h: 71 }, { fill: "#00B050", h: 71 }]) },
  { code: "AM", name: "Армения", nameEn: "Armenia", dialCode: "374", flag: fdh([{ fill: "#D90012", h: 71 }, { fill: "#0033A0", h: 71 }, { fill: "#F2A800", h: 71 }]) },
  { code: "GE", name: "Грузия", nameEn: "Georgia", dialCode: "995", flag: fdh([{ fill: "#FFF", h: 213 }]) },
  { code: "MD", name: "Молдова", nameEn: "Moldova", dialCode: "373", flag: fd([{ fill: "#003DA5", w: 106 }, { fill: "#FFD700", w: 106 }, { fill: "#CC0000", w: 108 }], 1.5) },

  // Европа (особые пропорции)
  { code: "US", name: "США", nameEn: "United States", dialCode: "1", flag: fd([{ fill: "#B22234", w: 228 }, { fill: "#FFF", w: 6 }, { fill: "#B22234", w: 6 }], 1.9) },
  { code: "GB", name: "Великобритания", nameEn: "United Kingdom", dialCode: "44", flag: fd([{ fill: "#012169", w: 160 }, { fill: "#FFF", w: 80 }], 2) },
  { code: "DE", name: "Германия", nameEn: "Germany", dialCode: "49", flag: fdh([{ fill: "#000", h: 71 }, { fill: "#DD0000", h: 71 }, { fill: "#FFCC00", h: 71 }]) },
  { code: "FR", name: "Франция", nameEn: "France", dialCode: "33", flag: fd([{ fill: "#002395", w: 106 }, { fill: "#FFF", w: 106 }, { fill: "#ED2939", w: 108 }], 1.5) },
  { code: "IT", name: "Италия", nameEn: "Italy", dialCode: "39", flag: fd([{ fill: "#009246", w: 106 }, { fill: "#FFF", w: 106 }, { fill: "#CE2B37", w: 108 }], 1.5) },
  { code: "ES", name: "Испания", nameEn: "Spain", dialCode: "34", flag: fd([{ fill: "#AA151B", w: 106 }, { fill: "#F1BF00", w: 106 }, { fill: "#AA151B", w: 108 }], 1.5) },
  { code: "PT", name: "Португалия", nameEn: "Portugal", dialCode: "351", flag: fd([{ fill: "#006600", w: 120 }, { fill: "#FF0000", w: 120 }], 1.33) },
  { code: "NL", name: "Нидерланды", nameEn: "Netherlands", dialCode: "31", flag: fdh([{ fill: "#AE1C28", h: 71 }, { fill: "#FFF", h: 71 }, { fill: "#21468B", h: 71 }]) },
  { code: "BE", name: "Бельгия", nameEn: "Belgium", dialCode: "32", flag: fd([{ fill: "#000", w: 106 }, { fill: "#FAE042", w: 106 }, { fill: "#ED2939", w: 108 }], 1.5) },
  { code: "CH", name: "Швейцария", nameEn: "Switzerland", dialCode: "41", flag: fd([{ fill: "#FF0000", w: 106 }, { fill: "#FFF", w: 106 }, { fill: "#FF0000", w: 108 }], 1) },
  { code: "AT", name: "Австрия", nameEn: "Austria", dialCode: "43", flag: fdh([{ fill: "#ED2939", h: 71 }, { fill: "#FFF", h: 71 }, { fill: "#ED2939", h: 71 }]) },
  { code: "PL", name: "Польша", nameEn: "Poland", dialCode: "48", flag: fdh([{ fill: "#FFF", h: 107 }, { fill: "#DC143C", h: 106 }]) },
  { code: "CZ", name: "Чехия", nameEn: "Czech Republic", dialCode: "420", flag: fd([{ fill: "#FFF", w: 106 }, { fill: "#D7141A", w: 106 }, { fill: "#11457E", w: 108 }], 1.5) },
  { code: "SE", name: "Швеция", nameEn: "Sweden", dialCode: "46", flag: fd([{ fill: "#006AA7", w: 106 }, { fill: "#FECC00", w: 106 }, { fill: "#006AA7", w: 108 }], 1) },
  { code: "NO", name: "Норвегия", nameEn: "Norway", dialCode: "47", flag: fd([{ fill: "#EF2B2D", w: 80 }, { fill: "#FFF", w: 80 }, { fill: "#002868", w: 80 }], 1) },
  { code: "FI", name: "Финляндия", nameEn: "Finland", dialCode: "358", flag: fd([{ fill: "#FFF", w: 106 }, { fill: "#003580", w: 106 }, { fill: "#FFF", w: 108 }], 1.5) },
  { code: "DK", name: "Дания", nameEn: "Denmark", dialCode: "45", flag: fd([{ fill: "#C8102E", w: 106 }, { fill: "#FFF", w: 106 }, { fill: "#C8102E", w: 108 }], 1.5) },
  { code: "IE", name: "Ирландия", nameEn: "Ireland", dialCode: "353", flag: fd([{ fill: "#169B62", w: 106 }, { fill: "#FFF", w: 106 }, { fill: "#FF883E", w: 108 }], 1.5) },
  { code: "IS", name: "Исландия", nameEn: "Iceland", dialCode: "354", flag: fd([{ fill: "#003897", w: 106 }, { fill: "#FFF", w: 106 }, { fill: "#D72828", w: 108 }], 1) },
  { code: "GR", name: "Греция", nameEn: "Greece", dialCode: "30", flag: fd([{ fill: "#0D5EAF", w: 80 }, { fill: "#FFF", w: 80 }, { fill: "#0D5EAF", w: 80 }], 1) },
  { code: "HU", name: "Венгрия", nameEn: "Hungary", dialCode: "36", flag: fdh([{ fill: "#CE2939", h: 71 }, { fill: "#FFF", h: 71 }, { fill: "#477050", h: 71 }]) },
  { code: "RO", name: "Румыния", nameEn: "Romania", dialCode: "40", flag: fd([{ fill: "#002B7F", w: 106 }, { fill: "#FCD116", w: 106 }, { fill: "#CE1126", w: 108 }], 1.5) },
  { code: "BG", name: "Болгария", nameEn: "Bulgaria", dialCode: "359", flag: fdh([{ fill: "#FFF", h: 71 }, { fill: "#00966E", h: 71 }, { fill: "#D62612", h: 71 }]) },
  { code: "RS", name: "Сербия", nameEn: "Serbia", dialCode: "381", flag: fdh([{ fill: "#C6363C", h: 71 }, { fill: "#0C4076", h: 71 }, { fill: "#FFF", h: 71 }]) },
  { code: "HR", name: "Хорватия", nameEn: "Croatia", dialCode: "385", flag: fdh([{ fill: "#FF0000", h: 71 }, { fill: "#FFF", h: 71 }, { fill: "#0C4076", h: 71 }]) },
  { code: "SK", name: "Словакия", nameEn: "Slovakia", dialCode: "421", flag: fdh([{ fill: "#FFF", h: 71 }, { fill: "#0C4076", h: 71 }, { fill: "#D62828", h: 71 }]) },
  { code: "SI", name: "Словения", nameEn: "Slovenia", dialCode: "386", flag: fdh([{ fill: "#FFF", h: 71 }, { fill: "#0C4076", h: 71 }, { fill: "#FF0000", h: 71 }]) },
  { code: "AL", name: "Албания", nameEn: "Albania", dialCode: "355", flag: fd([{ fill: "#E41E20", w: 106 }, { fill: "#000", w: 106 }, { fill: "#E41E20", w: 108 }], 1) },
  { code: "MK", name: "Северная Македония", nameEn: "North Macedonia", dialCode: "389", flag: fd([{ fill: "#D20000", w: 106 }, { fill: "#FFEE00", w: 106 }, { fill: "#D20000", w: 108 }], 1) },
  { code: "BA", name: "Босния и Герцеговина", nameEn: "Bosnia", dialCode: "387", flag: fd([{ fill: "#012169", w: 53 }, { fill: "#FCD116", w: 53 }, { fill: "#012169", w: 54 }], 1.5) },
  { code: "ME", name: "Черногория", nameEn: "Montenegro", dialCode: "382", flag: fd([{ fill: "#C6363C", w: 106 }, { fill: "#003087", w: 106 }, { fill: "#D3BC47", w: 108 }], 1.5) },
  { code: "EE", name: "Эстония", nameEn: "Estonia", dialCode: "372", flag: fdh([{ fill: "#0072CE", h: 71 }, { fill: "#000", h: 71 }, { fill: "#FFF", h: 71 }]) },
  { code: "LV", name: "Латвия", nameEn: "Latvia", dialCode: "371", flag: fdh([{ fill: "#9E3039", h: 86 }, { fill: "#FFF", h: 41 }, { fill: "#9E3039", h: 86 }]) },
  { code: "LT", name: "Литва", nameEn: "Lithuania", dialCode: "370", flag: fdh([{ fill: "#FDB913", h: 71 }, { fill: "#006A44", h: 71 }, { fill: "#C1272D", h: 71 }]) },

  // Азия
  { code: "TR", name: "Турция", nameEn: "Turkey", dialCode: "90", flag: fd([{ fill: "#E30A17", w: 160 }, { fill: "#FFF", w: 160 }], 2) },
  { code: "AE", name: "ОАЭ", nameEn: "UAE", dialCode: "971", flag: fd([{ fill: "#00732F", w: 53 }, { fill: "#FFF", w: 53 }, { fill: "#FF0000", w: 54 }], 1) },
  { code: "IL", name: "Израиль", nameEn: "Israel", dialCode: "972", flag: fd([{ fill: "#FFF", w: 80 }, { fill: "#0038B8", w: 80 }, { fill: "#FFF", w: 80 }], 1) },
  { code: "SA", name: "Саудовская Аравия", nameEn: "Saudi Arabia", dialCode: "966", flag: fd([{ fill: "#006C35", w: 160 }, { fill: "#FFF", w: 160 }], 2) },
  { code: "IR", name: "Иран", nameEn: "Iran", dialCode: "98", flag: fd([{ fill: "#DA0000", w: 106 }, { fill: "#239F40", w: 106 }, { fill: "#FFF", w: 108 }]) },
  { code: "IQ", name: "Ирак", nameEn: "Iraq", dialCode: "964", flag: fd([{ fill: "#CC0000", w: 106 }, { fill: "#FFF", w: 106 }, { fill: "#000", w: 108 }]) },
  { code: "SY", name: "Сирия", nameEn: "Syria", dialCode: "963", flag: fd([{ fill: "#E70013", w: 53 }, { fill: "#FFF", w: 53 }, { fill: "#000", w: 54 }]) },
  { code: "JO", name: "Иордания", nameEn: "Jordan", dialCode: "962", flag: fd([{ fill: "#CE1126", w: 53 }, { fill: "#FFF", w: 53 }, { fill: "#000", w: 54 }]) },
  { code: "LB", name: "Ливан", nameEn: "Lebanon", dialCode: "961", flag: fd([{ fill: "#DC143C", w: 106 }, { fill: "#FFF", w: 106 }, { fill: "#DC143C", w: 108 }]) },
  { code: "KW", name: "Кувейт", nameEn: "Kuwait", dialCode: "965", flag: fd([{ fill: "#007A3D", w: 53 }, { fill: "#FFF", w: 53 }, { fill: "#D70000", w: 54 }]) },
  { code: "QA", name: "Катар", nameEn: "Qatar", dialCode: "974", flag: fd([{ fill: "#8D1B3D", w: 106 }, { fill: "#FFF", w: 106 }, { fill: "#8D1B3D", w: 108 }]) },
  { code: "BH", name: "Бахрейн", nameEn: "Bahrain", dialCode: "973", flag: fd([{ fill: "#CE1126", w: 53 }, { fill: "#FFF", w: 53 }, { fill: "#CE1126", w: 54 }]) },
  { code: "OM", name: "Оман", nameEn: "Oman", dialCode: "968", flag: fd([{ fill: "#008000", w: 106 }, { fill: "#FFF", w: 106 }, { fill: "#FF0000", w: 108 }]) },
  { code: "YE", name: "Йемен", nameEn: "Yemen", dialCode: "967", flag: fd([{ fill: "#D70000", w: 106 }, { fill: "#FFF", w: 106 }, { fill: "#000", w: 108 }]) },
  { code: "CN", name: "Китай", nameEn: "China", dialCode: "86", flag: fd([{ fill: "#DE2910", w: 160 }, { fill: "#FFDE00", w: 160 }]) },
  { code: "JP", name: "Япония", nameEn: "Japan", dialCode: "81", flag: fd([{ fill: "#FFF", w: 160 }, { fill: "#BC002D", w: 160 }]) },
  { code: "KR", name: "Южная Корея", nameEn: "South Korea", dialCode: "82", flag: fd([{ fill: "#FFF", w: 106 }, { fill: "#CD2E3A", w: 106 }, { fill: "#0047A0", w: 108 }]) },
  { code: "KP", name: "КНДР", nameEn: "North Korea", dialCode: "850", flag: fd([{ fill: "#024FA2", w: 106 }, { fill: "#FFF", w: 106 }, { fill: "#C60C30", w: 108 }]) },
  { code: "MN", name: "Монголия", nameEn: "Mongolia", dialCode: "976", flag: fd([{ fill: "#CC0000", w: 106 }, { fill: "#FFD500", w: 106 }, { fill: "#0033A0", w: 108 }]) },
  { code: "IN", name: "Индия", nameEn: "India", dialCode: "91", flag: fd([{ fill: "#FF9933", w: 80 }, { fill: "#FFF", w: 80 }, { fill: "#138808", w: 80 }]) },
  { code: "PK", name: "Пакистан", nameEn: "Pakistan", dialCode: "92", flag: fd([{ fill: "#01411C", w: 106 }, { fill: "#FFF", w: 106 }, { fill: "#01411C", w: 108 }]) },
  { code: "BD", name: "Бангладеш", nameEn: "Bangladesh", dialCode: "880", flag: fd([{ fill: "#006A4E", w: 120 }, { fill: "#F42A01", w: 120 }]) },
  { code: "LK", name: "Шри-Ланка", nameEn: "Sri Lanka", dialCode: "94", flag: fd([{ fill: "#8D153A", w: 53 }, { fill: "#EB7400", w: 53 }, { fill: "#5C4095", w: 54 }]) },
  { code: "NP", name: "Непал", nameEn: "Nepal", dialCode: "977", flag: fd([{ fill: "#DC143C", w: 80 }, { fill: "#003893", w: 80 }, { fill: "#003893", w: 80 }]) },
  { code: "BT", name: "Бутан", nameEn: "Bhutan", dialCode: "975", flag: fd([{ fill: "#FFCC00", w: 160 }, { fill: "#FF6600", w: 160 }]) },
  { code: "MV", name: "Мальдивы", nameEn: "Maldives", dialCode: "960", flag: fd([{ fill: "#D21034", w: 160 }, { fill: "#007E3A", w: 160 }]) },
  { code: "AF", name: "Афганистан", nameEn: "Afghanistan", dialCode: "93", flag: fd([{ fill: "#BF0000", w: 106 }, { fill: "#000", w: 106 }, { fill: "#BF0000", w: 108 }]) },
  { code: "MM", name: "Мьянма", nameEn: "Myanmar", dialCode: "95", flag: fd([{ fill: "#FECB00", w: 106 }, { fill: "#34B233", w: 106 }, { fill: "#EA2839", w: 108 }]) },
  { code: "TH", name: "Таиланд", nameEn: "Thailand", dialCode: "66", flag: fd([{ fill: "#A51931", w: 53 }, { fill: "#F4F5F8", w: 53 }, { fill: "#2D2A4A", w: 54 }]) },
  { code: "LA", name: "Лаос", nameEn: "Laos", dialCode: "856", flag: fd([{ fill: "#CE1126", w: 106 }, { fill: "#002868", w: 106 }, { fill: "#CE1126", w: 108 }]) },
  { code: "VN", name: "Вьетнам", nameEn: "Vietnam", dialCode: "84", flag: fd([{ fill: "#DA251D", w: 160 }, { fill: "#FFFF00", w: 160 }]) },
  { code: "KH", name: "Камбоджа", nameEn: "Cambodia", dialCode: "855", flag: fd([{ fill: "#032EA1", w: 106 }, { fill: "#E00025", w: 106 }, { fill: "#E00025", w: 108 }]) },
  { code: "MY", name: "Малайзия", nameEn: "Malaysia", dialCode: "60", flag: fd([{ fill: "#CC0001", w: 53 }, { fill: "#FFF", w: 53 }, { fill: "#010066", w: 54 }]) },
  { code: "SG", name: "Сингапур", nameEn: "Singapore", dialCode: "65", flag: fd([{ fill: "#ED2939", w: 106 }, { fill: "#FFF", w: 106 }, { fill: "#ED2939", w: 108 }]) },
  { code: "ID", name: "Индонезия", nameEn: "Indonesia", dialCode: "62", flag: fd([{ fill: "#FF0000", w: 120 }, { fill: "#FFF", w: 120 }]) },
  { code: "PH", name: "Филиппины", nameEn: "Philippines", dialCode: "63", flag: fd([{ fill: "#0038A8", w: 53 }, { fill: "#CE1126", w: 53 }, { fill: "#FCD116", w: 54 }]) },
  { code: "BN", name: "Бруней", nameEn: "Brunei", dialCode: "673", flag: fd([{ fill: "#F3B031", w: 53 }, { fill: "#FFF", w: 53 }, { fill: "#000", w: 54 }]) },
  { code: "TL", name: "Тимор-Лесте", nameEn: "Timor-Leste", dialCode: "670", flag: fd([{ fill: "#CC0000", w: 106 }, { fill: "#000", w: 106 }, { fill: "#FFC400", w: 108 }]) },

  // Африка
  { code: "EG", name: "Египет", nameEn: "Egypt", dialCode: "20", flag: fd([{ fill: "#CE1126", w: 106 }, { fill: "#FFF", w: 106 }, { fill: "#000", w: 108 }]) },
  { code: "ZA", name: "ЮАР", nameEn: "South Africa", dialCode: "27", flag: fd([{ fill: "#007A4D", w: 80 }, { fill: "#DE3831", w: 80 }, { fill: "#002395", w: 80 }]) },
  { code: "NG", name: "Нигерия", nameEn: "Nigeria", dialCode: "234", flag: fd([{ fill: "#008751", w: 106 }, { fill: "#FFF", w: 106 }, { fill: "#008751", w: 108 }]) },
  { code: "KE", name: "Кения", nameEn: "Kenya", dialCode: "254", flag: fd([{ fill: "#BB0000", w: 53 }, { fill: "#FFF", w: 53 }, { fill: "#006600", w: 54 }]) },
  { code: "GH", name: "Гана", nameEn: "Ghana", dialCode: "233", flag: fd([{ fill: "#CE1126", w: 53 }, { fill: "#FCD116", w: 53 }, { fill: "#006B3F", w: 54 }]) },
  { code: "TZ", name: "Танзания", nameEn: "Tanzania", dialCode: "255", flag: fd([{ fill: "#1EB53A", w: 53 }, { fill: "#00A3DD", w: 53 }, { fill: "#FCD116", w: 54 }]) },
  { code: "UG", name: "Уганда", nameEn: "Uganda", dialCode: "256", flag: fd([{ fill: "#000", w: 53 }, { fill: "#FCDC04", w: 53 }, { fill: "#D90000", w: 54 }]) },
  { code: "ET", name: "Эфиопия", nameEn: "Ethiopia", dialCode: "251", flag: fd([{ fill: "#078930", w: 46 }, { fill: "#FCDD09", w: 46 }, { fill: "#DA121A", w: 48 }]) },
  { code: "MA", name: "Марокко", nameEn: "Morocco", dialCode: "212", flag: fd([{ fill: "#C1272D", w: 160 }, { fill: "#006233", w: 160 }]) },
  { code: "DZ", name: "Алжир", nameEn: "Algeria", dialCode: "213", flag: fd([{ fill: "#006633", w: 106 }, { fill: "#FFF", w: 106 }, { fill: "#D21034", w: 108 }]) },
  { code: "TN", name: "Тунис", nameEn: "Tunisia", dialCode: "216", flag: fd([{ fill: "#E70013", w: 106 }, { fill: "#FFF", w: 106 }, { fill: "#E70013", w: 108 }]) },
  { code: "LY", name: "Ливия", nameEn: "Libya", dialCode: "218", flag: fd([{ fill: "#E70013", w: 106 }, { fill: "#000", w: 106 }, { fill: "#239E3D", w: 108 }]) },
  { code: "SD", name: "Судан", nameEn: "Sudan", dialCode: "249", flag: fd([{ fill: "#D21034", w: 53 }, { fill: "#FFF", w: 53 }, { fill: "#000", w: 54 }]) },
  { code: "AO", name: "Ангола", nameEn: "Angola", dialCode: "244", flag: fd([{ fill: "#DD0000", w: 106 }, { fill: "#000", w: 106 }, { fill: "#FCDD09", w: 108 }]) },
  { code: "MZ", name: "Мозамбик", nameEn: "Mozambique", dialCode: "258", flag: fd([{ fill: "#F3D819", w: 106 }, { fill: "#006B68", w: 106 }, { fill: "#C4161C", w: 108 }]) },
  { code: "ZW", name: "Зимбабве", nameEn: "Zimbabwe", dialCode: "263", flag: fd([{ fill: "#006400", w: 53 }, { fill: "#FFD200", w: 53 }, { fill: "#D40000", w: 54 }]) },
  { code: "BW", name: "Ботсвана", nameEn: "Botswana", dialCode: "267", flag: fd([{ fill: "#00B2E3", w: 53 }, { fill: "#FFF", w: 53 }, { fill: "#000", w: 54 }]) },
  { code: "NA", name: "Намибия", nameEn: "Namibia", dialCode: "264", flag: fd([{ fill: "#D00000", w: 106 }, { fill: "#00008B", w: 106 }, { fill: "#FCDC04", w: 108 }]) },
  { code: "ZM", name: "Замбия", nameEn: "Zambia", dialCode: "260", flag: fd([{ fill: "#007A5E", w: 106 }, { fill: "#000", w: 106 }, { fill: "#E60000", w: 108 }]) },
  { code: "MW", name: "Малави", nameEn: "Malawi", dialCode: "265", flag: fd([{ fill: "#CE1126", w: 106 }, { fill: "#000", w: 106 }, { fill: "#007A5E", w: 108 }]) },
  { code: "MG", name: "Мадагаскар", nameEn: "Madagascar", dialCode: "261", flag: fd([{ fill: "#FC3D32", w: 106 }, { fill: "#007E3A", w: 106 }, { fill: "#FC3D32", w: 108 }]) },
  { code: "MU", name: "Маврикий", nameEn: "Mauritius", dialCode: "230", flag: fd([{ fill: "#FA251B", w: 53 }, { fill: "#00008B", w: 53 }, { fill: "#FCD20D", w: 54 }]) },
  { code: "SC", name: "Сейшелы", nameEn: "Seychelles", dialCode: "248", flag: fd([{ fill: "#FCD856", w: 53 }, { fill: "#003F88", w: 53 }, { fill: "#FFF", w: 54 }]) },
  { code: "MR", name: "Мавритания", nameEn: "Mauritania", dialCode: "222", flag: fd([{ fill: "#D0103A", w: 106 }, { fill: "#228B22", w: 106 }, { fill: "#D0103A", w: 108 }]) },
  { code: "ML", name: "Мали", nameEn: "Mali", dialCode: "223", flag: fd([{ fill: "#D21034", w: 106 }, { fill: "#FCD116", w: 106 }, { fill: "#009E49", w: 108 }]) },
  { code: "NE", name: "Нигер", nameEn: "Niger", dialCode: "227", flag: fd([{ fill: "#E05200", w: 106 }, { fill: "#FFF", w: 106 }, { fill: "#E05200", w: 108 }]) },
  { code: "BF", name: "Буркина-Фасо", nameEn: "Burkina Faso", dialCode: "226", flag: fd([{ fill: "#EF2B2D", w: 106 }, { fill: "#009A44", w: 106 }, { fill: "#EF2B2D", w: 108 }]) },
  { code: "SN", name: "Сенегал", nameEn: "Senegal", dialCode: "221", flag: fd([{ fill: "#00853F", w: 53 }, { fill: "#FDEF42", w: 53 }, { fill: "#E31B23", w: 54 }]) },
  { code: "CI", name: "Кот-д'Ивуар", nameEn: "Ivory Coast", dialCode: "225", flag: fd([{ fill: "#F77F00", w: 106 }, { fill: "#FFF", w: 106 }, { fill: "#009E60", w: 108 }]) },
  { code: "CM", name: "Камерун", nameEn: "Cameroon", dialCode: "237", flag: fd([{ fill: "#007A5E", w: 106 }, { fill: "#CE1126", w: 106 }, { fill: "#FCD116", w: 108 }]) },
  { code: "GA", name: "Габон", nameEn: "Gabon", dialCode: "241", flag: fd([{ fill: "#007A5E", w: 106 }, { fill: "#FCD116", w: 106 }, { fill: "#000", w: 108 }]) },
  { code: "CG", name: "Республика Конго", nameEn: "Congo", dialCode: "242", flag: fd([{ fill: "#D0103A", w: 106 }, { fill: "#FCD116", w: 106 }, { fill: "#009A44", w: 108 }]) },
  { code: "CD", name: "ДР Конго", nameEn: "DR Congo", dialCode: "243", flag: fd([{ fill: "#007FFF", w: 106 }, { fill: "#FCDD09", w: 106 }, { fill: "#CE1126", w: 108 }]) },
  { code: "RW", name: "Руанда", nameEn: "Rwanda", dialCode: "250", flag: fd([{ fill: "#00A1DE", w: 53 }, { fill: "#FAD201", w: 53 }, { fill: "#20603D", w: 54 }]) },
  { code: "BI", name: "Бурунди", nameEn: "Burundi", dialCode: "257", flag: fd([{ fill: "#CF0921", w: 53 }, { fill: "#FFF", w: 53 }, { fill: "#38A22E", w: 54 }]) },
  { code: "SS", name: "Южный Судан", nameEn: "South Sudan", dialCode: "211", flag: fd([{ fill: "#078930", w: 53 }, { fill: "#D0D7D9", w: 53 }, { fill: "#FCDD09", w: 54 }]) },
  { code: "ER", name: "Эритрея", nameEn: "Eritrea", dialCode: "291", flag: fd([{ fill: "#418FDE", w: 106 }, { fill: "#FCDD09", w: 106 }, { fill: "#CE1126", w: 108 }]) },
  { code: "DJ", name: "Джибути", nameEn: "Djibouti", dialCode: "253", flag: fd([{ fill: "#6AB4E8", w: 53 }, { fill: "#FFF", w: 53 }, { fill: "#12AD2B", w: 54 }]) },
  { code: "SO", name: "Сомали", nameEn: "Somalia", dialCode: "252", flag: fd([{ fill: "#4189E6", w: 106 }, { fill: "#FFF", w: 106 }, { fill: "#4189E6", w: 108 }]) },
  { code: "CF", name: "ЦАР", nameEn: "CAR", dialCode: "236", flag: fd([{ fill: "#003876", w: 53 }, { fill: "#FFF", w: 53 }, { fill: "#008F39", w: 54 }]) },
  { code: "TD", name: "Чад", nameEn: "Chad", dialCode: "235", flag: fd([{ fill: "#00008B", w: 106 }, { fill: "#FCDD09", w: 106 }, { fill: "#C81032", w: 108 }]) },

  // Америка
  { code: "CA", name: "Канада", nameEn: "Canada", dialCode: "1", flag: fd([{ fill: "#FF0000", w: 53 }, { fill: "#FFF", w: 53 }, { fill: "#FF0000", w: 54 }]) },
  { code: "MX", name: "Мексика", nameEn: "Mexico", dialCode: "52", flag: fd([{ fill: "#006341", w: 106 }, { fill: "#FFF", w: 106 }, { fill: "#CE1126", w: 108 }]) },
  { code: "GT", name: "Гватемала", nameEn: "Guatemala", dialCode: "502", flag: fd([{ fill: "#4997D0", w: 53 }, { fill: "#FFF", w: 53 }, { fill: "#4997D0", w: 54 }]) },
  { code: "BZ", name: "Белиз", nameEn: "Belize", dialCode: "501", flag: fd([{ fill: "#CE1126", w: 53 }, { fill: "#FFF", w: 53 }, { fill: "#003F8E", w: 54 }]) },
  { code: "HN", name: "Гондурас", nameEn: "Honduras", dialCode: "504", flag: fd([{ fill: "#0073CF", w: 53 }, { fill: "#FFF", w: 53 }, { fill: "#0073CF", w: 54 }]) },
  { code: "SV", name: "Сальвадор", nameEn: "El Salvador", dialCode: "503", flag: fd([{ fill: "#0067A5", w: 53 }, { fill: "#FFF", w: 53 }, { fill: "#0067A5", w: 54 }]) },
  { code: "NI", name: "Никарагуа", nameEn: "Nicaragua", dialCode: "505", flag: fd([{ fill: "#0067A5", w: 53 }, { fill: "#FFF", w: 53 }, { fill: "#0067A5", w: 54 }]) },
  { code: "CR", name: "Коста-Рика", nameEn: "Costa Rica", dialCode: "506", flag: fd([{ fill: "#002B7F", w: 53 }, { fill: "#FFF", w: 53 }, { fill: "#CE1126", w: 54 }]) },
  { code: "PA", name: "Панама", nameEn: "Panama", dialCode: "507", flag: fd([{ fill: "#DA121A", w: 64 }, { fill: "#072357", w: 64 }, { fill: "#FFF", w: 64 }, { fill: "#072357", w: 64 }, { fill: "#DA121A", w: 64 }]) },
  { code: "CO", name: "Колумбия", nameEn: "Colombia", dialCode: "57", flag: fd([{ fill: "#FCD116", w: 106 }, { fill: "#003893", w: 106 }, { fill: "#CE1126", w: 108 }]) },
  { code: "VE", name: "Венесуэла", nameEn: "Venezuela", dialCode: "58", flag: fd([{ fill: "#FFCC00", w: 106 }, { fill: "#00247D", w: 106 }, { fill: "#CF142B", w: 108 }]) },
  { code: "EC", name: "Эквадор", nameEn: "Ecuador", dialCode: "593", flag: fd([{ fill: "#FFDD00", w: 106 }, { fill: "#0033A0", w: 106 }, { fill: "#FF0000", w: 108 }]) },
  { code: "PE", name: "Перу", nameEn: "Peru", dialCode: "51", flag: fd([{ fill: "#D91023", w: 106 }, { fill: "#FFF", w: 106 }, { fill: "#D91023", w: 108 }]) },
  { code: "BO", name: "Боливия", nameEn: "Bolivia", dialCode: "591", flag: fd([{ fill: "#D52B1E", w: 106 }, { fill: "#F9E300", w: 106 }, { fill: "#007934", w: 108 }]) },
  { code: "PY", name: "Парагвай", nameEn: "Paraguay", dialCode: "595", flag: fd([{ fill: "#D52B1E", w: 53 }, { fill: "#FFF", w: 53 }, { fill: "#0038A8", w: 54 }]) },
  { code: "UY", name: "Уругвай", nameEn: "Uruguay", dialCode: "598", flag: fd([{ fill: "#FFF", w: 53 }, { fill: "#0038A8", w: 53 }, { fill: "#FFF", w: 54 }]) },
  { code: "BR", name: "Бразилия", nameEn: "Brazil", dialCode: "55", flag: fd([{ fill: "#009739", w: 106 }, { fill: "#FCD116", w: 106 }, { fill: "#002776", w: 108 }]) },
  { code: "AR", name: "Аргентина", nameEn: "Argentina", dialCode: "54", flag: fd([{ fill: "#74ACDF", w: 106 }, { fill: "#FFF", w: 106 }, { fill: "#74ACDF", w: 108 }]) },
  { code: "CL", name: "Чили", nameEn: "Chile", dialCode: "56", flag: fd([{ fill: "#D52B1E", w: 106 }, { fill: "#FFF", w: 106 }, { fill: "#0039A6", w: 108 }]) },
  { code: "GY", name: "Гайана", nameEn: "Guyana", dialCode: "592", flag: fd([{ fill: "#009E49", w: 53 }, { fill: "#FFF", w: 53 }, { fill: "#FCD116", w: 54 }]) },
  { code: "SR", name: "Суринам", nameEn: "Suriname", dialCode: "597", flag: fd([{ fill: "#377E3F", w: 53 }, { fill: "#FFF", w: 53 }, { fill: "#B40A2D", w: 54 }]) },
  { code: "CU", name: "Куба", nameEn: "Cuba", dialCode: "53", flag: fd([{ fill: "#002A8F", w: 53 }, { fill: "#FFF", w: 53 }, { fill: "#CF142B", w: 54 }]) },
  { code: "JM", name: "Ямайка", nameEn: "Jamaica", dialCode: "1876", flag: fd([{ fill: "#009B3A", w: 106 }, { fill: "#000", w: 106 }, { fill: "#FED100", w: 108 }]) },
  { code: "HT", name: "Гаити", nameEn: "Haiti", dialCode: "509", flag: fd([{ fill: "#00209F", w: 53 }, { fill: "#D21034", w: 53 }, { fill: "#FFF", w: 54 }]) },
  { code: "DO", name: "Доминикана", nameEn: "Dominican Republic", dialCode: "1", flag: fd([{ fill: "#002D62", w: 53 }, { fill: "#FFF", w: 53 }, { fill: "#CE1126", w: 54 }]) },
  { code: "PR", name: "Пуэрто-Рико", nameEn: "Puerto Rico", dialCode: "1", flag: fd([{ fill: "#ED0000", w: 53 }, { fill: "#FFF", w: 53 }, { fill: "#0050FF", w: 54 }]) },
  { code: "TT", name: "Тринидад и Тобаго", nameEn: "Trinidad", dialCode: "1868", flag: fd([{ fill: "#E00000", w: 53 }, { fill: "#FFF", w: 53 }, { fill: "#E00000", w: 54 }]) },
  { code: "BB", name: "Барбадос", nameEn: "Barbados", dialCode: "1246", flag: fd([{ fill: "#00267F", w: 53 }, { fill: "#FCD116", w: 53 }, { fill: "#000", w: 54 }]) },
  { code: "BS", name: "Багамы", nameEn: "Bahamas", dialCode: "1242", flag: fd([{ fill: "#00778B", w: 106 }, { fill: "#FCD116", w: 106 }, { fill: "#00778B", w: 108 }]) },

  // Океания
  { code: "AU", name: "Австралия", nameEn: "Australia", dialCode: "61", flag: fd([{ fill: "#00008B", w: 53 }, { fill: "#FFF", w: 53 }, { fill: "#E4002B", w: 54 }]) },
  { code: "NZ", name: "Новая Зеландия", nameEn: "New Zealand", dialCode: "64", flag: fd([{ fill: "#00247D", w: 53 }, { fill: "#FFF", w: 53 }, { fill: "#E4002B", w: 54 }]) },
  { code: "FJ", name: "Фиджи", nameEn: "Fiji", dialCode: "679", flag: fd([{ fill: "#68BFE5", w: 106 }, { fill: "#FFF", w: 106 }, { fill: "#002868", w: 108 }]) },
  { code: "PG", name: "Папуа-Новая Гвинея", nameEn: "PNG", dialCode: "675", flag: fd([{ fill: "#CE1126", w: 53 }, { fill: "#000", w: 53 }, { fill: "#FCD116", w: 54 }]) },
  { code: "SB", name: "Соломоновы Острова", nameEn: "Solomon Islands", dialCode: "677", flag: fd([{ fill: "#0051D2", w: 53 }, { fill: "#21573D", w: 53 }, { fill: "#FCD116", w: 54 }]) },
  { code: "VU", name: "Вануату", nameEn: "Vanuatu", dialCode: "678", flag: fd([{ fill: "#D21034", w: 53 }, { fill: "#009543", w: 53 }, { fill: "#000", w: 54 }]) },
  { code: "WS", name: "Самоа", nameEn: "Samoa", dialCode: "685", flag: fd([{ fill: "#CE1126", w: 106 }, { fill: "#002868", w: 106 }, { fill: "#002868", w: 108 }]) },
  { code: "KI", name: "Кирибати", nameEn: "Kiribati", dialCode: "686", flag: fd([{ fill: "#CE1126", w: 53 }, { fill: "#003F87", w: 53 }, { fill: "#FFF", w: 54 }]) },
  { code: "FM", name: "Микронезия", nameEn: "Micronesia", dialCode: "691", flag: fd([{ fill: "#75B2DD", w: 53 }, { fill: "#FFF", w: 53 }, { fill: "#7EB0D5", w: 54 }]) },
  { code: "TO", name: "Тонга", nameEn: "Tonga", dialCode: "676", flag: fd([{ fill: "#C10000", w: 106 }, { fill: "#FFF", w: 106 }, { fill: "#C10000", w: 108 }]) },
  { code: "PW", name: "Палау", nameEn: "Palau", dialCode: "680", flag: fd([{ fill: "#4FC3F7", w: 106 }, { fill: "#FCD116", w: 106 }, { fill: "#4FC3F7", w: 108 }]) },
  { code: "MH", name: "Маршалловы Острова", nameEn: "Marshall Islands", dialCode: "692", flag: fd([{ fill: "#003893", w: 53 }, { fill: "#FFF", w: 53 }, { fill: "#ED4012", w: 54 }]) },
];

// Сортированный список для выбора (СНГ сначала)
export const sortedCountries = (() => {
  const cisOrder = ["RU", "KZ", "BY", "UA", "UZ", "KG", "TJ", "TM", "AZ", "AM", "GE", "MD"];
  return [...countries].sort((a, b) => {
    const aCis = cisOrder.indexOf(a.code);
    const bCis = cisOrder.indexOf(b.code);
    if (aCis !== -1 && bCis !== -1) return aCis - bCis;
    if (aCis !== -1) return -1;
    if (bCis !== -1) return 1;
    return a.name.localeCompare(b.name, 'ru');
  });
})();

export const getCountryByCode = (code: string): CountryData | undefined =>
  countries.find(c => c.code.toLowerCase() === code.toLowerCase());

export const getCountryByDialCode = (dialCode: string): CountryData | undefined => {
  const sorted = [...countries].sort((a, b) => b.dialCode.length - a.dialCode.length);
  return sorted.find(c => dialCode.startsWith(c.dialCode));
};
