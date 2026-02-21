import * as React from "react";
import { useState, useEffect } from "react";
import { Phone } from "lucide-react";
import { cn } from "@/lib/utils";

interface Country {
  code: string;
  name: string;
  dialCode: string;
  flag: string;
  pattern?: RegExp;
}

const countries: Country[] = [
  { code: "RU", name: "Россия", dialCode: "7", flag: "🇷🇺", pattern: /^7[3-9]/ },
  { code: "KZ", name: "Казахстан", dialCode: "7", flag: "🇰🇿", pattern: /^7[67]/ },
  { code: "BY", name: "Беларусь", dialCode: "375", flag: "🇧🇾" },
  { code: "UA", name: "Украина", dialCode: "380", flag: "🇺🇦" },
  { code: "UZ", name: "Узбекистан", dialCode: "998", flag: "🇺🇿" },
  { code: "KG", name: "Кыргызстан", dialCode: "996", flag: "🇰🇬" },
  { code: "TJ", name: "Таджикистан", dialCode: "992", flag: "🇹🇯" },
  { code: "TM", name: "Туркменистан", dialCode: "993", flag: "🇹🇲" },
  { code: "AZ", name: "Азербайджан", dialCode: "994", flag: "🇦🇿" },
  { code: "AM", name: "Армения", dialCode: "374", flag: "🇦🇲" },
  { code: "GE", name: "Грузия", dialCode: "995", flag: "🇬🇪" },
  { code: "MD", name: "Молдова", dialCode: "373", flag: "🇲🇩" },
  { code: "US", name: "США", dialCode: "1", flag: "🇺🇸" },
  { code: "GB", name: "Великобритания", dialCode: "44", flag: "🇬🇧" },
  { code: "DE", name: "Германия", dialCode: "49", flag: "🇩🇪" },
  { code: "FR", name: "Франция", dialCode: "33", flag: "🇫🇷" },
  { code: "IT", name: "Италия", dialCode: "39", flag: "🇮🇹" },
  { code: "ES", name: "Испания", dialCode: "34", flag: "🇪🇸" },
  { code: "PT", name: "Португалия", dialCode: "351", flag: "🇵🇹" },
  { code: "NL", name: "Нидерланды", dialCode: "31", flag: "🇳🇱" },
  { code: "BE", name: "Бельгия", dialCode: "32", flag: "🇧🇪" },
  { code: "CH", name: "Швейцария", dialCode: "41", flag: "🇨🇭" },
  { code: "AT", name: "Австрия", dialCode: "43", flag: "🇦🇹" },
  { code: "PL", name: "Польша", dialCode: "48", flag: "🇵🇱" },
  { code: "CZ", name: "Чехия", dialCode: "420", flag: "🇨🇿" },
  { code: "SE", name: "Швеция", dialCode: "46", flag: "🇸🇪" },
  { code: "NO", name: "Норвегия", dialCode: "47", flag: "🇳🇴" },
  { code: "FI", name: "Финляндия", dialCode: "358", flag: "🇫🇮" },
  { code: "DK", name: "Дания", dialCode: "45", flag: "🇩🇰" },
  { code: "TR", name: "Турция", dialCode: "90", flag: "🇹🇷" },
  { code: "AE", name: "ОАЭ", dialCode: "971", flag: "🇦🇪" },
  { code: "IL", name: "Израиль", dialCode: "972", flag: "🇮🇱" },
  { code: "CN", name: "Китай", dialCode: "86", flag: "🇨🇳" },
  { code: "JP", name: "Япония", dialCode: "81", flag: "🇯🇵" },
  { code: "KR", name: "Южная Корея", dialCode: "82", flag: "🇰🇷" },
  { code: "IN", name: "Индия", dialCode: "91", flag: "🇮🇳" },
  { code: "TH", name: "Таиланд", dialCode: "66", flag: "🇹🇭" },
  { code: "VN", name: "Вьетнам", dialCode: "84", flag: "🇻🇳" },
  { code: "ID", name: "Индонезия", dialCode: "62", flag: "🇮🇩" },
  { code: "MY", name: "Малайзия", dialCode: "60", flag: "🇲🇾" },
  { code: "SG", name: "Сингапур", dialCode: "65", flag: "🇸🇬" },
  { code: "AU", name: "Австралия", dialCode: "61", flag: "🇦🇺" },
  { code: "NZ", name: "Новая Зеландия", dialCode: "64", flag: "🇳🇿" },
  { code: "BR", name: "Бразилия", dialCode: "55", flag: "🇧🇷" },
  { code: "MX", name: "Мексика", dialCode: "52", flag: "🇲🇽" },
  { code: "AR", name: "Аргентина", dialCode: "54", flag: "🇦🇷" },
  { code: "EG", name: "Египет", dialCode: "20", flag: "🇪🇬" },
  { code: "ZA", name: "ЮАР", dialCode: "27", flag: "🇿🇦" },
];

// Detect country from phone number
const detectCountry = (digits: string): Country | null => {
  if (!digits || digits.length === 0) return null;
  
  // Check for special patterns first (Kazakhstan vs Russia)
  if (digits.startsWith('7')) {
    if (digits.length >= 2) {
      const secondDigit = digits[1];
      // Kazakhstan: +7 6XX, +7 7XX
      if (secondDigit === '6' || secondDigit === '7') {
        return countries.find(c => c.code === 'KZ') || null;
      }
    }
    // Default to Russia for +7
    return countries.find(c => c.code === 'RU') || null;
  }
  
  // Sort by dialCode length (longest first) to match more specific codes first
  const sortedCountries = [...countries].sort((a, b) => b.dialCode.length - a.dialCode.length);
  
  for (const country of sortedCountries) {
    if (digits.startsWith(country.dialCode)) {
      return country;
    }
  }
  
  return null;
};

// Format phone number with proper spacing
const formatPhoneNumber = (digits: string): string => {
  if (!digits) return '+';
  
  // Handle Russian/Kazakh numbers
  if (digits.startsWith('7') || digits.startsWith('8')) {
    const normalized = '7' + digits.slice(1);
    let formatted = '+7';
    if (normalized.length > 1) formatted += ' (' + normalized.slice(1, 4);
    if (normalized.length > 4) formatted += ') ' + normalized.slice(4, 7);
    if (normalized.length > 7) formatted += '-' + normalized.slice(7, 9);
    if (normalized.length > 9) formatted += '-' + normalized.slice(9, 11);
    return formatted;
  }
  
  // Handle other countries - generic format
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
}

function guessDeviceCountryCode(): string | null {
  try {
    const locale = (navigator.languages?.[0] || navigator.language || "").trim();
    if (!locale) return null;

    // Examples: "ru-RU", "en-US", "pt-BR"
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

export function PhoneInput({ value, onChange, placeholder, required, className }: PhoneInputProps) {
  const [displayValue, setDisplayValue] = useState('+');
  const [detectedCountry, setDetectedCountry] = useState<Country | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let inputValue = e.target.value;
    
    // Ensure it starts with +
    if (!inputValue.startsWith('+')) {
      inputValue = '+' + inputValue.replace(/[^0-9]/g, '');
    }
    
    // Extract digits only
    const digits = inputValue.replace(/\D/g, '');
    
    // Normalize 8 to 7 for Russian numbers
    const normalizedDigits = digits.startsWith('8') ? '7' + digits.slice(1) : digits;
    
    // Limit to 15 digits (max international phone number length)
    const limitedDigits = normalizedDigits.slice(0, 15);
    
    // Detect country
    const country = detectCountry(limitedDigits);
    setDetectedCountry(country);
    
    // Format and display
    const formatted = formatPhoneNumber(limitedDigits);
    setDisplayValue(formatted);
    onChange('+' + limitedDigits);
  };

  // Initialize with + on mount
  useEffect(() => {
    if (value) {
      const digits = value.replace(/\D/g, '');
      setDisplayValue(formatPhoneNumber(digits));
      setDetectedCountry(detectCountry(digits));
      return;
    }

    // Device-based default: prefill with dial code (so user doesn't have to type it).
    const fallback = guessDefaultCountry();
    const digits = fallback.dialCode;
    setDetectedCountry(fallback);
    setDisplayValue('+' + digits);
    onChange('+' + digits);
  }, [value, onChange]);

  return (
    <div className={cn("relative", className)}>
      <div className="relative flex items-center">
        {/* Flag indicator */}
        <div className="absolute left-4 flex items-center justify-center pointer-events-none h-full">
          {detectedCountry ? (
            <span 
              className="text-lg leading-none text-white flex items-center" 
              style={{ fontFamily: "'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif" }}
            >
              {detectedCountry.flag}
            </span>
          ) : (
            <Phone className="w-5 h-5 text-white/50" />
          )}
        </div>

        {/* Phone input */}
        <input
          type="tel"
          value={displayValue}
          onChange={handleChange}
          placeholder={placeholder || "+7 (___) ___-__-__"}
          required={required}
          className="w-full pl-14 pr-4 h-14 bg-transparent border border-white/20 rounded-2xl text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none focus:ring-0"
        />
      </div>
    </div>
  );
}
