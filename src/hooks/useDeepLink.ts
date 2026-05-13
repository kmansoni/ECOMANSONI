import { parseStartApp, parseTelegramLink, buildDeepLink } from "@/lib/telegram/deeplinks";

export function useDeepLink() {
  const parseLink = (url: string) => {
    const parsed = parseTelegramLink(url);
    const params = parsed.startApp ? parseStartApp(parsed.startApp) : {};
    
    return {
      ...parsed,
      params,
    };
  };

  const buildLink = buildDeepLink;

  const getStartAppParams = (startapp?: string) => {
    return parseStartApp(startapp);
  };

  return {
    parseLink,
    buildLink,
    getStartAppParams,
  };
}

export function useStartApp() {
  return (startapp?: string) => parseStartApp(startapp);
}