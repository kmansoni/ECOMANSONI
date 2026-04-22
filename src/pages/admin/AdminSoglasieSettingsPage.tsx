import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { adminApi, InsuranceSettings, isOwner } from "@/lib/adminApi";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useAdminMe } from "@/hooks/useAdminMe";

interface SoglasieConfig {
  login: string;
  subUser: string;
  password: string;
  apiUrl: string;
  calcUrl: string;
  tokenUrl: string;
  isTestMode: boolean;
}

export function AdminSoglasieSettingsPage() {
  const { me } = useAdminMe();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Форма
  const [login, setLogin] = useState("");
  const [subUser, setSubUser] = useState("");
  const [password, setPassword] = useState("");
  const [apiUrl, setApiUrl] = useState("");
  const [calcUrl, setCalcUrl] = useState("");
  const [tokenUrl, setTokenUrl] = useState("");
  const [isTestMode, setIsTestMode] = useState(true);
  const [isActive, setIsActive] = useState(true);

  const canManage = useMemo(() => isOwner(me), [me]);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const settings = await adminApi<InsuranceSettings | null>("insurance_settings.get", {
        key: "soglasie_api",
      });

      if (settings?.value) {
        const config = settings.value as unknown as SoglasieConfig;
        setLogin(config.login || "");
        setSubUser(config.subUser || "");
        setPassword(config.password || "");
        setApiUrl(config.apiUrl || "");
        setCalcUrl(config.calcUrl || "");
        setTokenUrl(config.tokenUrl || "");
        setIsTestMode(config.isTestMode ?? true);
        setIsActive(settings.is_active ?? true);
      }
    } catch (e) {
      console.error("Failed to load settings:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const saveSettings = async () => {
    if (!canManage) {
      toast.error("Нет доступа");
      return;
    }

    setSaving(true);
    try {
      const config: SoglasieConfig = {
        login,
        subUser,
        password,
        apiUrl,
        calcUrl,
        tokenUrl,
        isTestMode,
      };

      await adminApi("insurance_settings.set", {
        key: "soglasie_api",
        value: config,
        description: "Настройки API СК Согласие (Е-ОСАГО)",
        is_active: isActive,
      });

      toast.success("Настройки сохранены");
    } catch (e) {
      toast.error("Ошибка сохранения", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setSaving(false);
    }
  };

  const testEndpoints = async () => {
    toast.info("Тестирование API...", { duration: 2000 });
    
    // Проверяем базовые URL
    const urls = [
      { name: "API", url: apiUrl },
      { name: "Calc", url: calcUrl },
      { name: "Token", url: tokenUrl },
    ];

    const results: string[] = [];
    for (const { name, url } of urls) {
      if (!url) {
        results.push(`${name}: ❌ не задан`);
        continue;
      }
      try {
        const response = await fetch(url, { method: "HEAD" });
        results.push(`${name}: ${response.ok ? "✅" : "⚠️"} ${response.status}`);
      } catch {
        results.push(`${name}: ❌ ошибка`);
      }
    }

    toast.info(results.join(", "), { duration: 5000 });
  };

  return (
    <AdminShell>
      <div className="container max-w-4xl py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Настройки СК Согласие</h1>
            <p className="text-muted-foreground">Конфигурация API Е-ОСАГО</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch
                id="isActive"
                checked={isActive}
                onCheckedChange={setIsActive}
                disabled={!canManage}
              />
              <Label htmlFor="isActive">Активно</Label>
            </div>
            <Button variant="outline" onClick={testEndpoints}>
              Проверить
            </Button>
            <Button onClick={saveSettings} disabled={saving || !canManage}>
              {saving ? "Сохранение..." : "Сохранить"}
            </Button>
          </div>
        </div>

        {!canManage && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <p className="text-yellow-800">
              ⚠️ У вас нет прав на изменение настроек. Обратитесь к владельцу.
            </p>
          </div>
        )}

        <div className="grid gap-6">
          {/* Учётные данные */}
          <Card>
            <CardHeader>
              <CardTitle>Учётные данные</CardTitle>
              <CardDescription>
                Данные для авторизации в API СК Согласие
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="login">Логин</Label>
                  <Input
                    id="login"
                    value={login}
                    onChange={(e) => setLogin(e.target.value)}
                    disabled={!canManage}
                    placeholder="partner_login"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="subUser">Субпользователь</Label>
                  <Input
                    id="subUser"
                    value={subUser}
                    onChange={(e) => setSubUser(e.target.value)}
                    disabled={!canManage}
                    placeholder="sub_user"
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password">Пароль</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={!canManage}
                  placeholder="••••••••"
                />
              </div>
            </CardContent>
          </Card>

          {/* API Endpoints */}
          <Card>
            <CardHeader>
              <CardTitle>API Endpoints</CardTitle>
              <CardDescription>
                URL-адреса для подключения к API Согласия
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="apiUrl">Основной API</Label>
                <Input
                  id="apiUrl"
                  value={apiUrl}
                  onChange={(e) => setApiUrl(e.target.value)}
                  disabled={!canManage}
                  placeholder="https://b2b.soglasie.ru/..."
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="calcUrl">Расчёт премии (SOAP)</Label>
                <Input
                  id="calcUrl"
                  value={calcUrl}
                  onChange={(e) => setCalcUrl(e.target.value)}
                  disabled={!canManage}
                  placeholder="https://b2b.soglasie.ru/..."
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="tokenUrl">Пролонгация (GraphQL)</Label>
                <Input
                  id="tokenUrl"
                  value={tokenUrl}
                  onChange={(e) => setTokenUrl(e.target.value)}
                  disabled={!canManage}
                  placeholder="https://b2b.soglasie.ru/..."
                />
              </div>
            </CardContent>
          </Card>

          {/* Режим работы */}
          <Card>
            <CardHeader>
              <CardTitle>Режим работы</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Switch
                  id="isTestMode"
                  checked={isTestMode}
                  onCheckedChange={setIsTestMode}
                  disabled={!canManage}
                />
                <Label htmlFor="isTestMode">
                  Тестовый режим
                  {isTestMode ? " (используются тестовые endpoints)" : " (используются продакшн-endpoints)"}
                </Label>
              </div>
            </CardContent>
          </Card>

          {/* Справка */}
          <Card className="bg-muted/50">
            <CardHeader>
              <CardTitle>Справка</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground space-y-2">
              <p>
                <strong>Тестовые URL:</strong>
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>API: https://b2b.soglasie.ru/upload-test/online/api/eosago</li>
                <li>Calc: https://b2b.soglasie.ru/upload-test/CCM/calcService</li>
                <li>Token: https://b2b.soglasie.ru/diasoft-schema/graphiql/</li>
              </ul>
              <p>
                <strong>Продакшн URL:</strong>
              </p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>API: https://b2b.soglasie.ru/online/api/eosago</li>
                <li>Calc: https://b2b.soglasie.ru:443/CCM/CCMService</li>
                <li>Token: https://b2b.soglasie.ru/diasoft-schema/graphiql/</li>
              </ul>
              <p className="mt-2">
                Получите учётные данные у куратора СК «Согласие».
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminShell>
  );
}