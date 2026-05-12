import * as React from "react";
import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { PhoneCallIcon } from "@/components/ui/app-icons";

interface Country {
  code: string;
  name: string;
  dialCode: string;
  flagUrl: string;
  pattern?: RegExp;
}

const getFlagUrl = (code: string): string => {
  return `/flags/${code.toLowerCase()}.svg`;
};

const countries: Country[] = [
  { code: "RU", name: "Россия", dialCode: "7", flagUrl: getFlagUrl("ru"), pattern: /^7[3-9]/ },
  { code: "KZ", name: "Казахстан", dialCode: "7", flagUrl: getFlagUrl("kz"), pattern: /^7[67]/ },
  { code: "BY", name: "Беларусь", dialCode: "375", flagUrl: getFlagUrl("by") },
  { code: "UA", name: "Украина", dialCode: "380", flagUrl: getFlagUrl("ua") },
  { code: "UZ", name: "Узбекистан", dialCode: "998", flagUrl: getFlagUrl("uz") },
  { code: "KG", name: "Кыргызстан", dialCode: "996", flagUrl: getFlagUrl("kg") },
  { code: "TJ", name: "Таджикистан", dialCode: "992", flagUrl: getFlagUrl("tj") },
  { code: "TM", name: "Туркменистан", dialCode: "993", flagUrl: getFlagUrl("tm") },
  { code: "AZ", name: "Азербайджан", dialCode: "994", flagUrl: getFlagUrl("az") },
  { code: "AM", name: "Армения", dialCode: "374", flagUrl: getFlagUrl("am") },
  { code: "GE", name: "Грузия", dialCode: "995", flagUrl: getFlagUrl("ge") },
  { code: "MD", name: "Молдова", dialCode: "373", flagUrl: getFlagUrl("md") },
  { code: "US", name: "США", dialCode: "1", flagUrl: getFlagUrl("us") },
  { code: "GB", name: "Великобритания", dialCode: "44", flagUrl: getFlagUrl("gb") },
  { code: "DE", name: "Германия", dialCode: "49", flagUrl: getFlagUrl("de") },
  { code: "FR", name: "Франция", dialCode: "33", flagUrl: getFlagUrl("fr") },
  { code: "IT", name: "Италия", dialCode: "39", flagUrl: getFlagUrl("it") },
  { code: "ES", name: "Испания", dialCode: "34", flagUrl: getFlagUrl("es") },
  { code: "PT", name: "Португалия", dialCode: "351", flagUrl: getFlagUrl("pt") },
  { code: "NL", name: "Нидерланды", dialCode: "31", flagUrl: getFlagUrl("nl") },
  { code: "BE", name: "Бельгия", dialCode: "32", flagUrl: getFlagUrl("be") },
  { code: "CH", name: "Швейцария", dialCode: "41", flagUrl: getFlagUrl("ch") },
  { code: "AT", name: "Австрия", dialCode: "43", flagUrl: getFlagUrl("at") },
  { code: "PL", name: "Польша", dialCode: "48", flagUrl: getFlagUrl("pl") },
  { code: "CZ", name: "Чехия", dialCode: "420", flagUrl: getFlagUrl("cz") },
  { code: "SE", name: "Швеция", dialCode: "46", flagUrl: getFlagUrl("se") },
  { code: "NO", name: "Норвегия", dialCode: "47", flagUrl: getFlagUrl("no") },
  { code: "FI", name: "Финляндия", dialCode: "358", flagUrl: getFlagUrl("fi") },
  { code: "DK", name: "Дания", dialCode: "45", flagUrl: getFlagUrl("dk") },
  { code: "TR", name: "Турция", dialCode: "90", flagUrl: getFlagUrl("tr") },
  { code: "AE", name: "ОАЭ", dialCode: "971", flagUrl: getFlagUrl("ae") },
  { code: "IL", name: "Израиль", dialCode: "972", flagUrl: getFlagUrl("il") },
  { code: "CN", name: "Китай", dialCode: "86", flagUrl: getFlagUrl("cn") },
  { code: "JP", name: "Япония", dialCode: "81", flagUrl: getFlagUrl("jp") },
  { code: "KR", name: "Южная Корея", dialCode: "82", flagUrl: getFlagUrl("kr") },
  { code: "IN", name: "Индия", dialCode: "91", flagUrl: getFlagUrl("in") },
  { code: "TH", name: "Таиланд", dialCode: "66", flagUrl: getFlagUrl("th") },
  { code: "VN", name: "Вьетнам", dialCode: "84", flagUrl: getFlagUrl("vn") },
  { code: "ID", name: "Индонезия", dialCode: "62", flagUrl: getFlagUrl("id") },
  { code: "MY", name: "Малайзия", dialCode: "60", flagUrl: getFlagUrl("my") },
  { code: "SG", name: "Сингапур", dialCode: "65", flagUrl: getFlagUrl("sg") },
  { code: "AU", name: "Австралия", dialCode: "61", flagUrl: getFlagUrl("au") },
  { code: "NZ", name: "Новая Зеландия", dialCode: "64", flagUrl: getFlagUrl("nz") },
  { code: "BR", name: "Бразилия", dialCode: "55", flagUrl: getFlagUrl("br") },
  { code: "MX", name: "Мексика", dialCode: "52", flagUrl: getFlagUrl("mx") },
  { code: "AR", name: "Аргентина", dialCode: "54", flagUrl: getFlagUrl("ar") },
  { code: "EG", name: "Египет", dialCode: "20", flagUrl: getFlagUrl("eg") },
  { code: "ZA", name: "ЮАР", dialCode: "27", flagUrl: getFlagUrl("za") },
];

const detectCountry = (digits: string): Country | null => {
  if (!digits || digits.length === 0) return null;
  
  if (digits.startsWith('7')) {
    if (digits.length >= 2) {
      const secondDigit = digits[1];
      if (secondDigit === '6' || secondDigit === '7') {
        return countries.find(c => c.code === 'KZ') || null;
      }
    }
    return countries.find(c => c.code === 'RU') || null;
  }
  
  const sortedCountries = [...countries].sort((a, b) => b.dialCode.length - a.dialCode.length);
  
  for (const country of sortedCountries) {
    if (digits.startsWith(country.dialCode)) {
      return country;
    }
  }
  
  return null;
};

const formatPhoneNumber = (digits: string): string => {
  if (!digits) return '+';
  
  if (digits.startsWith('7') || digits.startsWith('8')) {
    const normalized = '7' + digits.slice(1);
    let formatted = '+7';
    if (normalized.length > 1) formatted += ' (' + normalized.slice(1, 4);
    if (normalized.length > 4) formatted += ') ' + normalized.slice(4, 7);
    if (normalized.length > 7) formatted += '-' + normalized.slice(7, 9);
    if (normalized.length > 9) formatted += '-' + normalized.slice(9, 11);
    return formatted;
  }
  
  const country = detectCountry(digits);
  if (country) {
    const dialCodeLen = country.dialCode.length;
    const localNumber = digits.slice(dialCodeLen);
    let formatted = '+' + country.dialCode;
    if (localNumber.length > 0) formatted += ' ' + localNumber.slice(0, 3);
    if (localNumber.length > 3) formatted += ' ' + localNumber.slice(3, 6);
    if (localNumber.length > 6) formatted += ' ' + localNumber.slice(6, 10);
    return formatted;
  }
  
  return '+' + digits;
};

interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
  id?: string;
}

function guessDeviceCountryCode(): string | null {
  try {
    const locale = (navigator.languages?.[0] || navigator.language || "").trim();
    if (!locale) return null;

    const parts = locale.replace("_", "-").split("-");
    const region = parts.length >= 2 ? parts[1]?.toUpperCase() : "";
    if (!region) return null;
    return region;
  } catch {
    return null;
  }
}

function guessDefaultCountry(): Country {
  const region = guessDeviceCountryCode();
  if (region) {
    const byRegion = countries.find((c) => c.code === region);
    if (byRegion) return byRegion;
  }
  return countries.find((c) => c.code === "RU") ?? countries[0]!;
}

export function PhoneInput({ value, onChange, placeholder, required, className, id }: PhoneInputProps) {
  const defaultCountry = guessDefaultCountry();
  const [displayValue, setDisplayValue] = useState(() => '+' + defaultCountry.dialCode);
  const [detectedCountry, setDetectedCountry] = useState<Country | null>(defaultCountry);
  // Стабильная ссылка на onChange — предотвращает re-trigger useEffect при нестабильном callback
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let inputValue = e.target.value;
    
    if (!inputValue.startsWith('+')) {
      inputValue = '+' + inputValue.replace(/[^0-9]/g, '');
    }
    
    const digits = inputValue.replace(/\D/g, '');
    const normalizedDigits = digits.startsWith('8') ? '7' + digits.slice(1) : digits;
    const limitedDigits = normalizedDigits.slice(0, 15);
    
    const country = detectCountry(limitedDigits);
    setDetectedCountry(country);
    
    const formatted = formatPhoneNumber(limitedDigits);
    setDisplayValue(formatted);
    onChangeRef.current('+' + limitedDigits);
  };

  // Инициализация при маунте или изменении value
  useEffect(() => {
    if (value) {
      const digits = value.replace(/\D/g, '');
      setDisplayValue(formatPhoneNumber(digits));
      setDetectedCountry(detectCountry(digits));
      return;
    }

    const fallback = guessDefaultCountry();
    const digits = fallback.dialCode;
    setDetectedCountry(fallback);
    setDisplayValue('+' + digits);
    onChangeRef.current('+' + digits);
  }, [value]);

  return (
    <div className={cn("relative", className)}>
      <div className="relative flex items-center">
        <div className="absolute left-4 flex items-center justify-center pointer-events-none h-full">
          {detectedCountry ? (
            <img
              src={detectedCountry.flagUrl}
              alt={detectedCountry.name}
              className="w-7 h-5 rounded-sm object-cover"
              style={{ imageRendering: 'auto' }}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <PhoneCallIcon size={20} noAnimate className="text-white/50" aria-hidden="true" />
          )}
        </div>

        <input
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={displayValue}
          onChange={handleChange}
          placeholder={placeholder || (detectedCountry ? `+${detectedCountry.dialCode} (___) ___-__-__` : "+7 (___) ___-__-__")}
          required={required}
          aria-label="Номер телефона"
          className="w-full pl-14 pr-4 h-14 bg-transparent border border-white/20 rounded-2xl text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none focus:ring-0"
        />
      </div>
    </div>
  );
}
