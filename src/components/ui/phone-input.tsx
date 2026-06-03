import * as React from "react";
import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, Search } from "lucide-react";
import { countries, sortedCountries, getCountryByCode, type CountryData } from "./countries";

interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
  id?: string;
  hint?: string;
  theme?: "dark" | "light";
  defaultCountry?: string;
}

function guessDeviceCountryCode(): string | null {
  try {
    const locale = (navigator.languages?.[0] || navigator.language || "").trim();
    if (!locale) return null;
    const parts = locale.replace("_", "-").split("-");
    const region = parts.length >= 2 ? parts[1]?.toUpperCase() : "";
    return region || null;
  } catch {
    return null;
  }
}

function getDefaultCountry(): CountryData {
  const region = guessDeviceCountryCode();
  if (region) {
    const found = getCountryByCode(region);
    if (found) return found;
  }
  return countries.find(c => c.code === "RU") ?? countries[0]!;
}

const formatPhone = (digits: string, dialCode: string): string => {
  if (!digits) return '+' + dialCode;

  const local = digits.slice(dialCode.length);
  let formatted = '+' + dialCode;

  // Россия/СНГ формат
  if (dialCode === "7") {
    if (local.length > 0) formatted += ' (' + local.slice(0, 3);
    if (local.length > 3) formatted += ') ' + local.slice(3, 6);
    if (local.length > 6) formatted += '-' + local.slice(6, 8);
    if (local.length > 8) formatted += '-' + local.slice(8, 10);
    return formatted;
  }

  // Простой формат для остальных
  if (local.length > 0) formatted += ' ' + local.slice(0, 3);
  if (local.length > 3) formatted += ' ' + local.slice(3, 6);
  if (local.length > 6) formatted += ' ' + local.slice(6, 10);
  return formatted;
};

const detectCountry = (digits: string): CountryData | null => {
  if (!digits) return null;

  // +1 (США/Канада)
  if (digits.startsWith('1') && !digits.startsWith('7')) {
    return countries.find(c => c.code === 'US') || null;
  }

  // СНГ (+7)
  if (digits.startsWith('7') || (digits.startsWith('8') && digits.length > 1 && digits[1] !== '9')) {
    const secondDigit = digits.length >= 2 ? digits[1] : '';
    if (secondDigit === '6' || secondDigit === '7') {
      return countries.find(c => c.code === 'KZ') || null;
    }
    return countries.find(c => c.code === 'RU') || null;
  }

  // Остальные по коду
  const sorted = [...countries].sort((a, b) => b.dialCode.length - a.dialCode.length);
  for (const country of sorted) {
    if (digits.startsWith(country.dialCode)) {
      return country;
    }
  }
  return null;
};

export function PhoneInput({
  value,
  onChange,
  placeholder,
  required,
  className,
  id,
  hint,
  theme = "dark",
  defaultCountry
}: PhoneInputProps) {
  const isLight = theme === "light";
  const defaultC = defaultCountry ? (getCountryByCode(defaultCountry) ?? getDefaultCountry()) : getDefaultCountry();

  const [displayValue, setDisplayValue] = useState(() => '+' + defaultC.dialCode);
  const [selectedCountry, setSelectedCountry] = useState<CountryData>(defaultC);
  const [showDropdown, setShowDropdown] = useState(false);
  const [search, setSearch] = useState('');
  const [focused, setFocused] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Фильтрация стран
  const filteredCountries = search
    ? sortedCountries.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.nameEn.toLowerCase().includes(search.toLowerCase()) ||
        c.dialCode.includes(search) ||
        c.code.toLowerCase().includes(search.toLowerCase())
      )
    : sortedCountries;

  const handleSelect = (country: CountryData) => {
    setSelectedCountry(country);
    setShowDropdown(false);
    setSearch('');
    setDisplayValue('+' + country.dialCode + ' ');
    onChangeRef.current('+' + country.dialCode);
    inputRef.current?.focus();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let inputValue = e.target.value;

    if (!inputValue.startsWith('+')) {
      inputValue = '+' + inputValue.replace(/[^0-9]/g, '');
    }

    const digits = inputValue.replace(/\D/g, '');

    // Если ввод начинается с кода страны
    const country = detectCountry(digits);
    if (country) {
      setSelectedCountry(country);
    }

    const limitedDigits = digits.slice(0, 15);
    const dialCodeLen = selectedCountry.dialCode.length;
    const formatted = formatPhone(limitedDigits, selectedCountry.dialCode);

    setDisplayValue(formatted);
    onChangeRef.current('+' + limitedDigits);
  };

  // Инициализация
  useEffect(() => {
    if (value) {
      const digits = value.replace(/\D/g, '');
      const country = detectCountry(digits) || defaultC;
      setSelectedCountry(country);
      setDisplayValue(formatPhone(digits, country.dialCode));
      return;
    }

    const fallback = defaultCountry ? (getCountryByCode(defaultCountry) ?? getDefaultCountry()) : getDefaultCountry();
    setSelectedCountry(fallback);
    setDisplayValue('+' + fallback.dialCode);
    onChangeRef.current('+' + fallback.dialCode);
  }, []);

  // Закрытие дропдауна
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className={cn("relative", className)}>
      <div className="relative flex items-center">
        {/* Селектор страны */}
        <button
          type="button"
          onClick={() => {
            setShowDropdown(!showDropdown);
            if (!showDropdown) inputRef.current?.focus();
          }}
          className={cn(
            "absolute left-1 z-20 flex items-center gap-1.5 h-12 px-2.5 sm:px-3 rounded-2xl backdrop-blur-xl transition-all cursor-pointer",
            "hover:brightness-110 active:scale-95",
            isLight
              ? "bg-white/60 border border-slate-300"
              : "bg-white/[0.05] border border-white/[0.08]"
          )}
          aria-label="Выбрать страну"
        >
          <span className="text-xl leading-none flex-shrink-0" aria-hidden="true">
            {selectedCountry.flag}
          </span>
          <span className={cn(
            "text-[13px] sm:text-[15px] font-medium",
            isLight ? "text-slate-700" : "text-white/90"
          )}>
            +{selectedCountry.dialCode}
          </span>
          <ChevronDown className={cn(
            "w-3.5 h-3.5 sm:w-4 sm:h-4 transition-transform flex-shrink-0",
            isLight ? "text-slate-500" : "text-white/60",
            showDropdown && "rotate-180"
          )} />
        </button>

        {/* Поле ввода */}
        <input
          ref={inputRef}
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={displayValue}
          onChange={handleChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder || `+${selectedCountry.dialCode} (___) ___-__-__`}
          required={required}
          aria-label="Номер телефона"
          className={cn(
            "w-full pl-[100px] sm:pl-[138px] pr-4 h-14 rounded-2xl border backdrop-blur-xl transition-all text-[15px] outline-none",
            isLight
              ? "bg-white/85 border-slate-300 placeholder:text-slate-400 hover:border-slate-400 focus:border-teal-500 text-slate-900"
              : "bg-white/[0.05] border-white/[0.08] placeholder:text-white/40 hover:border-white/15 focus:border-white/20 text-white"
          )}
        />
      </div>

      {/* Hint */}
      {hint && !focused && (
        <p className={cn(
          "mt-2 text-xs px-1",
          isLight ? "text-slate-500" : "text-white/45"
        )}>
          {hint}
        </p>
      )}

      {/* Dropdown выбора страны */}
      {showDropdown && (
        <div
          ref={dropdownRef}
          className={cn(
            "absolute z-50 mt-2 w-full rounded-2xl border backdrop-blur-2xl overflow-hidden shadow-2xl",
            isLight
              ? "bg-white/95 border-slate-200"
              : "bg-[#0a1628]/95 border-white/10"
          )}
        >
          {/* Поиск */}
          <div className={cn(
            "flex items-center gap-2 px-3 py-2 border-b",
            isLight ? "border-slate-200" : "border-white/10"
          )}>
            <Search className={cn("w-4 h-4", isLight ? "text-slate-400" : "text-white/50")} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Поиск страны..."
              className={cn(
                "flex-1 bg-transparent text-[14px] outline-none placeholder:text-current",
                isLight ? "text-slate-900 placeholder:text-slate-400" : "text-white placeholder:text-white/50"
              )}
              autoFocus
            />
          </div>

          {/* Список */}
          <div className="max-h-[320px] overflow-y-auto">
            {filteredCountries.length === 0 ? (
              <div className={cn(
                "px-4 py-8 text-center text-[13px]",
                isLight ? "text-slate-500" : "text-white/50"
              )}>
                Ничего не найдено
              </div>
            ) : (
              filteredCountries.map(country => (
                <button
                  key={country.code}
                  type="button"
                  onClick={() => handleSelect(country)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
                    "hover:bg-white/5 active:bg-white/10",
                    selectedCountry.code === country.code && (isLight ? "bg-teal-50" : "bg-white/10")
                  )}
                >
                  <span className="text-xl leading-none flex-shrink-0 w-7 text-center" aria-hidden="true">
                    {country.flag}
                  </span>
                  <span className={cn(
                    "flex-1 text-[14px]",
                    isLight ? "text-slate-700" : "text-white"
                  )}>
                    {country.name}
                  </span>
                  <span className={cn(
                    "text-[13px] font-medium",
                    isLight ? "text-slate-500" : "text-white/60"
                  )}>
                    +{country.dialCode}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}