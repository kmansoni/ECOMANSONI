/**
 * Конфигурация API СК Согласие (Е-ОСАГО)
 * Учётные данные могут поступать из:
 * 1. Переменных окружения (.env) — для серверной части
 * 2. Настроек пользователя (БД) — для админ-панели
 */

import { dbLoose } from "@/lib/supabase";

/**
 * Тип конфигурации Согласие API
 */
export interface SoglasieConfig {
  login: string;
  subUser: string;
  password: string;
  apiUrl: string;
  calcUrl: string;
  tokenUrl: string;
  isTestMode: boolean;
}

/**
 * Получает базовую строку авторизации
 * Формат: base64(Login:SubUser:Password)
 */
export function getSoglasieAuthHeader(config: SoglasieConfig): string {
  const credentials = `${config.login}:${config.subUser}:${config.password}`;
  return `Basic ${btoa(credentials)}`;
}

/**
 * Получает упрощённый заголовок авторизации (только для статуса)
 * Формат: base64(Login:Password)
 */
export function getSoglasieStatusAuthHeader(config: SoglasieConfig): string {
  const credentials = `${config.login}:${config.password}`;
  return `Basic ${btoa(credentials)}`;
}

/**
 * Дефолтная конфигурация из переменных окружения
 */
export function getDefaultSoglasieConfig(): SoglasieConfig {
  return {
    login: import.meta.env.VITE_SOGLASIE_LOGIN || "",
    subUser: import.meta.env.VITE_SOGLASIE_SUBUSER || "",
    password: import.meta.env.VITE_SOGLASIE_PASSWORD || "",
    apiUrl: import.meta.env.VITE_SOGLASIE_API_URL || "https://b2b.soglasie.ru/upload-test/online/api/eosago",
    calcUrl: import.meta.env.VITE_SOGLASIE_CALC_URL || "https://b2b.soglasie.ru/upload-test/CCM/calcService",
    tokenUrl: import.meta.env.VITE_SOGLASIE_TOKEN_URL || "https://b2b.soglasie.ru/diasoft-schema/graphiql/",
    isTestMode: !import.meta.env.VITE_SOGLASIE_API_URL?.includes("/online/api"),
  };
}

/**
 * Загружает конфигурацию из настроек пользователя (админ-панель)
 * Если настройки не найдены — использует дефолтные из .env
 */
export async function getSoglasieConfigFromDb(): Promise<SoglasieConfig> {
  const defaultConfig = getDefaultSoglasieConfig();
  
  // Если есть хоть какие-то данные в .env — используем их
  if (defaultConfig.login && defaultConfig.password) {
    return defaultConfig;
  }

  // Иначе пробуем получить из БД
  try {
    const { data, error } = await dbLoose
      .from("insurance_settings")
      .select("soglasie_config")
      .eq("key", "soglasie_api")
      .single();

    if (error || !data?.soglasie_config) {
      return defaultConfig;
    }

    const dbConfig = data.soglasie_config as Partial<SoglasieConfig>;
    return {
      login: dbConfig.login || defaultConfig.login,
      subUser: dbConfig.subUser || defaultConfig.subUser,
      password: dbConfig.password || defaultConfig.password,
      apiUrl: dbConfig.apiUrl || defaultConfig.apiUrl,
      calcUrl: dbConfig.calcUrl || defaultConfig.calcUrl,
      tokenUrl: dbConfig.tokenUrl || defaultConfig.tokenUrl,
      isTestMode: dbConfig.isTestMode ?? defaultConfig.isTestMode,
    };
  } catch {
    return defaultConfig;
  }
}

/**
 * Сохраняет конфигурацию в БД (только для админа)
 */
export async function saveSoglasieConfigToDb(config: SoglasieConfig): Promise<void> {
  const { error } = await dbLoose
    .from("insurance_settings")
    .upsert({
      key: "soglasie_api",
      value: JSON.stringify(config),
      updated_at: new Date().toISOString(),
    }, { onConflict: "key" });

  if (error) {
    throw new Error(`Не удалось сохранить настройки: ${error.message}`);
  }
}

/**
 * Проверяет, настроены ли учётные данные
 */
export function isSoglasieConfigured(config: SoglasieConfig): boolean {
  return !!(config.login && config.subUser && config.password);
}