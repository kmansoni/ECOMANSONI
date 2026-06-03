// Полный список стран мира с Unicode flag emoji
// Emoji вычисляются из ISO 3166-1 alpha-2 кода страны

export interface CountryData {
  code: string;
  name: string;
  nameEn: string;
  dialCode: string;
  flag: string;
}

// Unicode regional indicator: 🇦=U+1F1E6 ... 🇿=U+1F1FF
const e = (code: string): string =>
  [...code.toUpperCase()].map(c => String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65)).join('');

export const countries: CountryData[] = [
  // СНГ и соседи
  { code: "RU", name: "Россия",               nameEn: "Russia",              dialCode: "7",    flag: e("RU") },
  { code: "KZ", name: "Казахстан",             nameEn: "Kazakhstan",          dialCode: "7",    flag: e("KZ") },
  { code: "BY", name: "Беларусь",              nameEn: "Belarus",             dialCode: "375",  flag: e("BY") },
  { code: "UA", name: "Украина",               nameEn: "Ukraine",             dialCode: "380",  flag: e("UA") },
  { code: "UZ", name: "Узбекистан",            nameEn: "Uzbekistan",          dialCode: "998",  flag: e("UZ") },
  { code: "KG", name: "Кыргызстан",            nameEn: "Kyrgyzstan",          dialCode: "996",  flag: e("KG") },
  { code: "TJ", name: "Таджикистан",           nameEn: "Tajikistan",          dialCode: "992",  flag: e("TJ") },
  { code: "TM", name: "Туркменистан",          nameEn: "Turkmenistan",        dialCode: "993",  flag: e("TM") },
  { code: "AZ", name: "Азербайджан",           nameEn: "Azerbaijan",          dialCode: "994",  flag: e("AZ") },
  { code: "AM", name: "Армения",               nameEn: "Armenia",             dialCode: "374",  flag: e("AM") },
  { code: "GE", name: "Грузия",                nameEn: "Georgia",             dialCode: "995",  flag: e("GE") },
  { code: "MD", name: "Молдова",               nameEn: "Moldova",             dialCode: "373",  flag: e("MD") },

  // Европа
  { code: "US", name: "США",                   nameEn: "United States",       dialCode: "1",    flag: e("US") },
  { code: "GB", name: "Великобритания",        nameEn: "United Kingdom",      dialCode: "44",   flag: e("GB") },
  { code: "DE", name: "Германия",              nameEn: "Germany",             dialCode: "49",   flag: e("DE") },
  { code: "FR", name: "Франция",               nameEn: "France",              dialCode: "33",   flag: e("FR") },
  { code: "IT", name: "Италия",                nameEn: "Italy",               dialCode: "39",   flag: e("IT") },
  { code: "ES", name: "Испания",               nameEn: "Spain",               dialCode: "34",   flag: e("ES") },
  { code: "PT", name: "Португалия",            nameEn: "Portugal",            dialCode: "351",  flag: e("PT") },
  { code: "NL", name: "Нидерланды",            nameEn: "Netherlands",         dialCode: "31",   flag: e("NL") },
  { code: "BE", name: "Бельгия",               nameEn: "Belgium",             dialCode: "32",   flag: e("BE") },
  { code: "CH", name: "Швейцария",             nameEn: "Switzerland",         dialCode: "41",   flag: e("CH") },
  { code: "AT", name: "Австрия",               nameEn: "Austria",             dialCode: "43",   flag: e("AT") },
  { code: "PL", name: "Польша",                nameEn: "Poland",              dialCode: "48",   flag: e("PL") },
  { code: "CZ", name: "Чехия",                 nameEn: "Czech Republic",      dialCode: "420",  flag: e("CZ") },
  { code: "SE", name: "Швеция",                nameEn: "Sweden",              dialCode: "46",   flag: e("SE") },
  { code: "NO", name: "Норвегия",              nameEn: "Norway",              dialCode: "47",   flag: e("NO") },
  { code: "FI", name: "Финляндия",             nameEn: "Finland",             dialCode: "358",  flag: e("FI") },
  { code: "DK", name: "Дания",                 nameEn: "Denmark",             dialCode: "45",   flag: e("DK") },
  { code: "IE", name: "Ирландия",              nameEn: "Ireland",             dialCode: "353",  flag: e("IE") },
  { code: "IS", name: "Исландия",              nameEn: "Iceland",             dialCode: "354",  flag: e("IS") },
  { code: "GR", name: "Греция",                nameEn: "Greece",              dialCode: "30",   flag: e("GR") },
  { code: "HU", name: "Венгрия",               nameEn: "Hungary",             dialCode: "36",   flag: e("HU") },
  { code: "RO", name: "Румыния",               nameEn: "Romania",             dialCode: "40",   flag: e("RO") },
  { code: "BG", name: "Болгария",              nameEn: "Bulgaria",            dialCode: "359",  flag: e("BG") },
  { code: "RS", name: "Сербия",                nameEn: "Serbia",              dialCode: "381",  flag: e("RS") },
  { code: "HR", name: "Хорватия",              nameEn: "Croatia",             dialCode: "385",  flag: e("HR") },
  { code: "SK", name: "Словакия",              nameEn: "Slovakia",            dialCode: "421",  flag: e("SK") },
  { code: "SI", name: "Словения",              nameEn: "Slovenia",            dialCode: "386",  flag: e("SI") },
  { code: "AL", name: "Албания",               nameEn: "Albania",             dialCode: "355",  flag: e("AL") },
  { code: "MK", name: "Северная Македония",    nameEn: "North Macedonia",     dialCode: "389",  flag: e("MK") },
  { code: "BA", name: "Босния и Герцеговина",  nameEn: "Bosnia",              dialCode: "387",  flag: e("BA") },
  { code: "ME", name: "Черногория",            nameEn: "Montenegro",          dialCode: "382",  flag: e("ME") },
  { code: "EE", name: "Эстония",               nameEn: "Estonia",             dialCode: "372",  flag: e("EE") },
  { code: "LV", name: "Латвия",                nameEn: "Latvia",              dialCode: "371",  flag: e("LV") },
  { code: "LT", name: "Литва",                 nameEn: "Lithuania",           dialCode: "370",  flag: e("LT") },

  // Азия
  { code: "TR", name: "Турция",                nameEn: "Turkey",              dialCode: "90",   flag: e("TR") },
  { code: "AE", name: "ОАЭ",                   nameEn: "UAE",                 dialCode: "971",  flag: e("AE") },
  { code: "IL", name: "Израиль",               nameEn: "Israel",              dialCode: "972",  flag: e("IL") },
  { code: "SA", name: "Саудовская Аравия",     nameEn: "Saudi Arabia",        dialCode: "966",  flag: e("SA") },
  { code: "IR", name: "Иран",                  nameEn: "Iran",                dialCode: "98",   flag: e("IR") },
  { code: "IQ", name: "Ирак",                  nameEn: "Iraq",                dialCode: "964",  flag: e("IQ") },
  { code: "SY", name: "Сирия",                 nameEn: "Syria",               dialCode: "963",  flag: e("SY") },
  { code: "JO", name: "Иордания",              nameEn: "Jordan",              dialCode: "962",  flag: e("JO") },
  { code: "LB", name: "Ливан",                 nameEn: "Lebanon",             dialCode: "961",  flag: e("LB") },
  { code: "KW", name: "Кувейт",                nameEn: "Kuwait",              dialCode: "965",  flag: e("KW") },
  { code: "QA", name: "Катар",                 nameEn: "Qatar",               dialCode: "974",  flag: e("QA") },
  { code: "BH", name: "Бахрейн",               nameEn: "Bahrain",             dialCode: "973",  flag: e("BH") },
  { code: "OM", name: "Оман",                  nameEn: "Oman",                dialCode: "968",  flag: e("OM") },
  { code: "YE", name: "Йемен",                 nameEn: "Yemen",               dialCode: "967",  flag: e("YE") },
  { code: "CN", name: "Китай",                 nameEn: "China",               dialCode: "86",   flag: e("CN") },
  { code: "JP", name: "Япония",                nameEn: "Japan",               dialCode: "81",   flag: e("JP") },
  { code: "KR", name: "Южная Корея",           nameEn: "South Korea",         dialCode: "82",   flag: e("KR") },
  { code: "KP", name: "КНДР",                  nameEn: "North Korea",         dialCode: "850",  flag: e("KP") },
  { code: "MN", name: "Монголия",              nameEn: "Mongolia",            dialCode: "976",  flag: e("MN") },
  { code: "IN", name: "Индия",                 nameEn: "India",               dialCode: "91",   flag: e("IN") },
  { code: "PK", name: "Пакистан",              nameEn: "Pakistan",            dialCode: "92",   flag: e("PK") },
  { code: "BD", name: "Бангладеш",             nameEn: "Bangladesh",          dialCode: "880",  flag: e("BD") },
  { code: "LK", name: "Шри-Ланка",             nameEn: "Sri Lanka",           dialCode: "94",   flag: e("LK") },
  { code: "NP", name: "Непал",                 nameEn: "Nepal",               dialCode: "977",  flag: e("NP") },
  { code: "BT", name: "Бутан",                 nameEn: "Bhutan",              dialCode: "975",  flag: e("BT") },
  { code: "MV", name: "Мальдивы",              nameEn: "Maldives",            dialCode: "960",  flag: e("MV") },
  { code: "AF", name: "Афганистан",            nameEn: "Afghanistan",         dialCode: "93",   flag: e("AF") },
  { code: "MM", name: "Мьянма",                nameEn: "Myanmar",             dialCode: "95",   flag: e("MM") },
  { code: "TH", name: "Таиланд",               nameEn: "Thailand",            dialCode: "66",   flag: e("TH") },
  { code: "LA", name: "Лаос",                  nameEn: "Laos",                dialCode: "856",  flag: e("LA") },
  { code: "VN", name: "Вьетнам",               nameEn: "Vietnam",             dialCode: "84",   flag: e("VN") },
  { code: "KH", name: "Камбоджа",              nameEn: "Cambodia",            dialCode: "855",  flag: e("KH") },
  { code: "MY", name: "Малайзия",              nameEn: "Malaysia",            dialCode: "60",   flag: e("MY") },
  { code: "SG", name: "Сингапур",              nameEn: "Singapore",           dialCode: "65",   flag: e("SG") },
  { code: "ID", name: "Индонезия",             nameEn: "Indonesia",           dialCode: "62",   flag: e("ID") },
  { code: "PH", name: "Филиппины",             nameEn: "Philippines",         dialCode: "63",   flag: e("PH") },
  { code: "BN", name: "Бруней",                nameEn: "Brunei",              dialCode: "673",  flag: e("BN") },
  { code: "TL", name: "Тимор-Лесте",           nameEn: "Timor-Leste",         dialCode: "670",  flag: e("TL") },

  // Африка
  { code: "EG", name: "Египет",                nameEn: "Egypt",               dialCode: "20",   flag: e("EG") },
  { code: "ZA", name: "ЮАР",                   nameEn: "South Africa",        dialCode: "27",   flag: e("ZA") },
  { code: "NG", name: "Нигерия",               nameEn: "Nigeria",             dialCode: "234",  flag: e("NG") },
  { code: "KE", name: "Кения",                 nameEn: "Kenya",               dialCode: "254",  flag: e("KE") },
  { code: "GH", name: "Гана",                  nameEn: "Ghana",               dialCode: "233",  flag: e("GH") },
  { code: "TZ", name: "Танзания",              nameEn: "Tanzania",            dialCode: "255",  flag: e("TZ") },
  { code: "UG", name: "Уганда",                nameEn: "Uganda",              dialCode: "256",  flag: e("UG") },
  { code: "ET", name: "Эфиопия",               nameEn: "Ethiopia",            dialCode: "251",  flag: e("ET") },
  { code: "MA", name: "Марокко",               nameEn: "Morocco",             dialCode: "212",  flag: e("MA") },
  { code: "DZ", name: "Алжир",                 nameEn: "Algeria",             dialCode: "213",  flag: e("DZ") },
  { code: "TN", name: "Тунис",                 nameEn: "Tunisia",             dialCode: "216",  flag: e("TN") },
  { code: "LY", name: "Ливия",                 nameEn: "Libya",               dialCode: "218",  flag: e("LY") },
  { code: "SD", name: "Судан",                 nameEn: "Sudan",               dialCode: "249",  flag: e("SD") },
  { code: "AO", name: "Ангола",                nameEn: "Angola",              dialCode: "244",  flag: e("AO") },
  { code: "MZ", name: "Мозамбик",              nameEn: "Mozambique",          dialCode: "258",  flag: e("MZ") },
  { code: "ZW", name: "Зимбабве",              nameEn: "Zimbabwe",            dialCode: "263",  flag: e("ZW") },
  { code: "BW", name: "Ботсвана",              nameEn: "Botswana",            dialCode: "267",  flag: e("BW") },
  { code: "NA", name: "Намибия",               nameEn: "Namibia",             dialCode: "264",  flag: e("NA") },
  { code: "ZM", name: "Замбия",                nameEn: "Zambia",              dialCode: "260",  flag: e("ZM") },
  { code: "MW", name: "Малави",                nameEn: "Malawi",              dialCode: "265",  flag: e("MW") },
  { code: "MG", name: "Мадагаскар",            nameEn: "Madagascar",          dialCode: "261",  flag: e("MG") },
  { code: "MU", name: "Маврикий",              nameEn: "Mauritius",           dialCode: "230",  flag: e("MU") },
  { code: "SC", name: "Сейшелы",               nameEn: "Seychelles",          dialCode: "248",  flag: e("SC") },
  { code: "MR", name: "Мавритания",            nameEn: "Mauritania",          dialCode: "222",  flag: e("MR") },
  { code: "ML", name: "Мали",                  nameEn: "Mali",                dialCode: "223",  flag: e("ML") },
  { code: "NE", name: "Нигер",                 nameEn: "Niger",               dialCode: "227",  flag: e("NE") },
  { code: "BF", name: "Буркина-Фасо",          nameEn: "Burkina Faso",        dialCode: "226",  flag: e("BF") },
  { code: "SN", name: "Сенегал",               nameEn: "Senegal",             dialCode: "221",  flag: e("SN") },
  { code: "CI", name: "Кот-д'Ивуар",           nameEn: "Ivory Coast",         dialCode: "225",  flag: e("CI") },
  { code: "CM", name: "Камерун",               nameEn: "Cameroon",            dialCode: "237",  flag: e("CM") },
  { code: "GA", name: "Габон",                 nameEn: "Gabon",               dialCode: "241",  flag: e("GA") },
  { code: "CG", name: "Республика Конго",      nameEn: "Congo",               dialCode: "242",  flag: e("CG") },
  { code: "CD", name: "ДР Конго",              nameEn: "DR Congo",            dialCode: "243",  flag: e("CD") },
  { code: "RW", name: "Руанда",                nameEn: "Rwanda",              dialCode: "250",  flag: e("RW") },
  { code: "BI", name: "Бурунди",               nameEn: "Burundi",             dialCode: "257",  flag: e("BI") },
  { code: "SS", name: "Южный Судан",           nameEn: "South Sudan",         dialCode: "211",  flag: e("SS") },
  { code: "ER", name: "Эритрея",               nameEn: "Eritrea",             dialCode: "291",  flag: e("ER") },
  { code: "DJ", name: "Джибути",               nameEn: "Djibouti",            dialCode: "253",  flag: e("DJ") },
  { code: "SO", name: "Сомали",                nameEn: "Somalia",             dialCode: "252",  flag: e("SO") },
  { code: "CF", name: "ЦАР",                   nameEn: "CAR",                 dialCode: "236",  flag: e("CF") },
  { code: "TD", name: "Чад",                   nameEn: "Chad",                dialCode: "235",  flag: e("TD") },

  // Америка
  { code: "CA", name: "Канада",                nameEn: "Canada",              dialCode: "1",    flag: e("CA") },
  { code: "MX", name: "Мексика",               nameEn: "Mexico",              dialCode: "52",   flag: e("MX") },
  { code: "GT", name: "Гватемала",             nameEn: "Guatemala",           dialCode: "502",  flag: e("GT") },
  { code: "BZ", name: "Белиз",                 nameEn: "Belize",              dialCode: "501",  flag: e("BZ") },
  { code: "HN", name: "Гондурас",              nameEn: "Honduras",            dialCode: "504",  flag: e("HN") },
  { code: "SV", name: "Сальвадор",             nameEn: "El Salvador",         dialCode: "503",  flag: e("SV") },
  { code: "NI", name: "Никарагуа",             nameEn: "Nicaragua",           dialCode: "505",  flag: e("NI") },
  { code: "CR", name: "Коста-Рика",            nameEn: "Costa Rica",          dialCode: "506",  flag: e("CR") },
  { code: "PA", name: "Панама",                nameEn: "Panama",              dialCode: "507",  flag: e("PA") },
  { code: "CO", name: "Колумбия",              nameEn: "Colombia",            dialCode: "57",   flag: e("CO") },
  { code: "VE", name: "Венесуэла",             nameEn: "Venezuela",           dialCode: "58",   flag: e("VE") },
  { code: "EC", name: "Эквадор",               nameEn: "Ecuador",             dialCode: "593",  flag: e("EC") },
  { code: "PE", name: "Перу",                  nameEn: "Peru",                dialCode: "51",   flag: e("PE") },
  { code: "BO", name: "Боливия",               nameEn: "Bolivia",             dialCode: "591",  flag: e("BO") },
  { code: "PY", name: "Парагвай",              nameEn: "Paraguay",            dialCode: "595",  flag: e("PY") },
  { code: "UY", name: "Уругвай",               nameEn: "Uruguay",             dialCode: "598",  flag: e("UY") },
  { code: "BR", name: "Бразилия",              nameEn: "Brazil",              dialCode: "55",   flag: e("BR") },
  { code: "AR", name: "Аргентина",             nameEn: "Argentina",           dialCode: "54",   flag: e("AR") },
  { code: "CL", name: "Чили",                  nameEn: "Chile",               dialCode: "56",   flag: e("CL") },
  { code: "GY", name: "Гайана",                nameEn: "Guyana",              dialCode: "592",  flag: e("GY") },
  { code: "SR", name: "Суринам",               nameEn: "Suriname",            dialCode: "597",  flag: e("SR") },
  { code: "CU", name: "Куба",                  nameEn: "Cuba",                dialCode: "53",   flag: e("CU") },
  { code: "JM", name: "Ямайка",                nameEn: "Jamaica",             dialCode: "1876", flag: e("JM") },
  { code: "HT", name: "Гаити",                 nameEn: "Haiti",               dialCode: "509",  flag: e("HT") },
  { code: "DO", name: "Доминикана",            nameEn: "Dominican Republic",  dialCode: "1",    flag: e("DO") },
  { code: "PR", name: "Пуэрто-Рико",           nameEn: "Puerto Rico",         dialCode: "1",    flag: e("PR") },
  { code: "TT", name: "Тринидад и Тобаго",     nameEn: "Trinidad",            dialCode: "1868", flag: e("TT") },
  { code: "BB", name: "Барбадос",              nameEn: "Barbados",            dialCode: "1246", flag: e("BB") },
  { code: "BS", name: "Багамы",                nameEn: "Bahamas",             dialCode: "1242", flag: e("BS") },

  // Океания
  { code: "AU", name: "Австралия",             nameEn: "Australia",           dialCode: "61",   flag: e("AU") },
  { code: "NZ", name: "Новая Зеландия",        nameEn: "New Zealand",         dialCode: "64",   flag: e("NZ") },
  { code: "FJ", name: "Фиджи",                 nameEn: "Fiji",                dialCode: "679",  flag: e("FJ") },
  { code: "PG", name: "Папуа-Новая Гвинея",    nameEn: "PNG",                 dialCode: "675",  flag: e("PG") },
  { code: "SB", name: "Соломоновы Острова",    nameEn: "Solomon Islands",     dialCode: "677",  flag: e("SB") },
  { code: "VU", name: "Вануату",               nameEn: "Vanuatu",             dialCode: "678",  flag: e("VU") },
  { code: "WS", name: "Самоа",                 nameEn: "Samoa",               dialCode: "685",  flag: e("WS") },
  { code: "KI", name: "Кирибати",              nameEn: "Kiribati",            dialCode: "686",  flag: e("KI") },
  { code: "FM", name: "Микронезия",            nameEn: "Micronesia",          dialCode: "691",  flag: e("FM") },
  { code: "TO", name: "Тонга",                 nameEn: "Tonga",               dialCode: "676",  flag: e("TO") },
  { code: "PW", name: "Палау",                 nameEn: "Palau",               dialCode: "680",  flag: e("PW") },
  { code: "MH", name: "Маршалловы Острова",    nameEn: "Marshall Islands",    dialCode: "692",  flag: e("MH") },
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
