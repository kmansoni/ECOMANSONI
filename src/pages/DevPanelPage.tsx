import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  RefreshCw, 
  LogOut, 
  Phone, 
  Video, 
  Bug, 
  Database, 
  Users,
  AlertTriangle,
  CheckCircle,
  Clock,
  Trash2,
  ListTodo
} from "lucide-react";
import { toast } from "sonner";
import BugsTab from "@/components/dev/BugsTab";
import RoadmapTab from "@/components/dev/RoadmapTab";

interface DebugSignal {
  id: string;
  call_id: string;
  signal_type: string;
  signal_data: any;
  created_at: string;
  sender_id: string;
  processed: boolean;
}

interface VideoCallRecord {
  id: string;
  caller_id: string;
  callee_id: string;
  call_type: string;
  status: string;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
}

const DEV_TOKEN_KEY = "dev_panel_token";

export default function DevPanelPage() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  
  // Data states
  const [calls, setCalls] = useState<VideoCallRecord[]>([]);
  const [debugSignals, setDebugSignals] = useState<DebugSignal[]>([]);
  const [allSignals, setAllSignals] = useState<DebugSignal[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // Check existing token on mount
  useEffect(() => {
    void (async () => {
      const token = localStorage.getItem(DEV_TOKEN_KEY);
      if (!token) {
        setAuthChecking(false);
        return;
      }

      try {
        const { data, error } = await supabase.functions.invoke("dev-panel-auth", {
          body: { token },
        });

        if (error) throw error;
        if (data?.success) {
          setIsAuthenticated(true);
        } else {
          localStorage.removeItem(DEV_TOKEN_KEY);
          setIsAuthenticated(false);
        }
      } catch {
        localStorage.removeItem(DEV_TOKEN_KEY);
        setIsAuthenticated(false);
      } finally {
        setAuthChecking(false);
      }
    })();
  }, []);

  // Load data when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      loadData();
    }
  }, [isAuthenticated]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const { data, error } = await supabase.functions.invoke("dev-panel-auth", {
        body: { login, password }
      });
      
      if (error) throw error;
      
      if (data.success && data.token) {
        localStorage.setItem(DEV_TOKEN_KEY, data.token);
        setIsAuthenticated(true);
        toast.success("Добро пожаловать в панель разработчика!");
      } else {
        toast.error(data.error || "Неверные учётные данные");
      }
    } catch (err: any) {
      toast.error(err.message || "Ошибка авторизации");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem(DEV_TOKEN_KEY);
    setIsAuthenticated(false);
    setLogin("");
    setPassword("");
  };

  const loadData = async () => {
    setRefreshing(true);
    
    try {
      // Load video calls
      const { data: callsData } = await supabase
        .from("video_calls")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      setCalls(callsData || []);
      
      // Load debug signals
      const { data: debugData } = await supabase
        .from("video_call_signals")
        .select("*")
        .eq("signal_type", "debug")
        .order("created_at", { ascending: false })
        .limit(100);
      setDebugSignals(debugData || []);
      
      // Load all recent signals
      const { data: signalsData } = await supabase
        .from("video_call_signals")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      setAllSignals(signalsData || []);
      
      // Load profiles
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      setProfiles(profilesData || []);
      
    } catch (err) {
      console.error("Error loading data:", err);
    } finally {
      setRefreshing(false);
    }
  };

  const clearDebugSignals = async () => {
    if (!confirm("Удалить все debug-сигналы?")) return;
    
    try {
      await supabase
        .from("video_call_signals")
        .delete()
        .eq("signal_type", "debug");
      toast.success("Debug-сигналы удалены");
      loadData();
    } catch (err) {
      toast.error("Ошибка удаления");
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "connected": return "bg-green-500";
      case "ringing": return "bg-yellow-500";
      case "ended": return "bg-gray-500";
      case "missed": return "bg-red-500";
      case "declined": return "bg-orange-500";
      default: return "bg-blue-500";
    }
  };

  const formatTime = (date: string) => {
    return new Date(date).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  };

  if (authChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <RefreshCw className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bug className="w-6 h-6" />
              Панель разработчика
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <Input
                placeholder="Логин"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                required
              />
              <Input
                type="password"
                placeholder="Пароль"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Вход..." : "Войти"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Group debug signals by call_id
  const debugByCall = debugSignals.reduce((acc, sig) => {
    if (!acc[sig.call_id]) acc[sig.call_id] = [];
    acc[sig.call_id].push(sig);
    return acc;
  }, {} as Record<string, DebugSignal[]>);

  // Find failed video calls (no started_at)
  const failedVideoCalls = calls.filter(c => c.call_type === "video" && !c.started_at);
  const successfulCalls = calls.filter(c => c.started_at);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b p-4 flex items-center justify-between">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Bug className="w-6 h-6" />
          Dev Panel
        </h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadData} disabled={refreshing}>
            <RefreshCw className={`w-4 h-4 mr-1 ${refreshing ? "animate-spin" : ""}`} />
            Обновить
          </Button>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Phone className="w-8 h-8 text-blue-500" />
            <div>
              <p className="text-2xl font-bold">{calls.length}</p>
              <p className="text-xs text-muted-foreground">Всего звонков</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="w-8 h-8 text-red-500" />
            <div>
              <p className="text-2xl font-bold">{failedVideoCalls.length}</p>
              <p className="text-xs text-muted-foreground">Неудачных видео</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle className="w-8 h-8 text-green-500" />
            <div>
              <p className="text-2xl font-bold">{successfulCalls.length}</p>
              <p className="text-xs text-muted-foreground">Успешных</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Users className="w-8 h-8 text-purple-500" />
            <div>
              <p className="text-2xl font-bold">{profiles.length}</p>
              <p className="text-xs text-muted-foreground">Профилей</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="p-4">
        <Tabs defaultValue="bugs" className="w-full">
          <TabsList className="w-full grid grid-cols-6">
            <TabsTrigger value="bugs">
              <Bug className="w-4 h-4 mr-1" />
              Баги
            </TabsTrigger>
            <TabsTrigger value="roadmap">
              <ListTodo className="w-4 h-4 mr-1" />
              Задачи
            </TabsTrigger>
            <TabsTrigger value="debug">
              <Database className="w-4 h-4 mr-1" />
              Debug
            </TabsTrigger>
            <TabsTrigger value="calls">
              <Video className="w-4 h-4 mr-1" />
              Звонки
            </TabsTrigger>
            <TabsTrigger value="signals">
              <Database className="w-4 h-4 mr-1" />
              Сигналы
            </TabsTrigger>
            <TabsTrigger value="users">
              <Users className="w-4 h-4 mr-1" />
              Юзеры
            </TabsTrigger>
          </TabsList>

          {/* Bugs Tab */}
          <TabsContent value="bugs" className="mt-4">
            <BugsTab />
          </TabsContent>

          {/* Roadmap Tab */}
          <TabsContent value="roadmap" className="mt-4">
            <RoadmapTab />
          </TabsContent>

          {/* Debug Tab */}
          <TabsContent value="debug" className="mt-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-semibold">Debug-события ({debugSignals.length})</h2>
              <Button variant="destructive" size="sm" onClick={clearDebugSignals}>
                <Trash2 className="w-4 h-4 mr-1" />
                Очистить
              </Button>
            </div>
            
            {Object.keys(debugByCall).length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                Нет debug-событий. Попробуй сделать видеозвонок — здесь появятся данные.
              </p>
            ) : (
              <ScrollArea className="h-[500px]">
                <div className="space-y-4">
                  {Object.entries(debugByCall).map(([callId, signals]) => (
                    <Card key={callId}>
                      <CardHeader className="py-3">
                        <CardTitle className="text-sm font-mono">
                          Call: {callId.slice(0, 8)}...
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="py-2">
                        <div className="space-y-2">
                          {signals.sort((a, b) => 
                            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
                          ).map((sig) => (
                            <div key={sig.id} className="text-xs border-l-2 border-primary pl-3 py-1">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-[10px]">
                                  {sig.signal_data?.stage || "unknown"}
                                </Badge>
                                <span className="text-muted-foreground">
                                  {formatTime(sig.created_at)}
                                </span>
                              </div>
                              {sig.signal_data && Object.keys(sig.signal_data).length > 2 && (
                                <pre className="mt-1 text-[10px] bg-muted p-2 rounded overflow-auto max-h-24">
                                  {JSON.stringify(sig.signal_data, null, 2)}
                                </pre>
                              )}
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            )}
          </TabsContent>

          {/* Calls Tab */}
          <TabsContent value="calls" className="mt-4">
            <ScrollArea className="h-[500px]">
              <div className="space-y-2">
                {calls.map((call) => (
                  <Card key={call.id} className={!call.started_at && call.call_type === "video" ? "border-red-500/50" : ""}>
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {call.call_type === "video" ? (
                            <Video className="w-4 h-4" />
                          ) : (
                            <Phone className="w-4 h-4" />
                          )}
                          <Badge className={getStatusColor(call.status)}>
                            {call.status}
                          </Badge>
                          {!call.started_at && (
                            <Badge variant="destructive">НЕ СОЕДИНЁН</Badge>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {formatTime(call.created_at)}
                        </span>
                      </div>
                      <div className="mt-2 text-xs font-mono text-muted-foreground">
                        <p>ID: {call.id.slice(0, 8)}</p>
                        <p>Caller: {call.caller_id.slice(0, 8)}</p>
                        <p>Callee: {call.callee_id.slice(0, 8)}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* Signals Tab */}
          <TabsContent value="signals" className="mt-4">
            <ScrollArea className="h-[500px]">
              <div className="space-y-1">
                {allSignals.filter(s => s.signal_type !== "debug").map((sig) => (
                  <div key={sig.id} className="text-xs p-2 border-b flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{sig.signal_type}</Badge>
                      <span className="font-mono text-muted-foreground">
                        call:{sig.call_id.slice(0, 6)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {sig.processed ? (
                        <CheckCircle className="w-3 h-3 text-green-500" />
                      ) : (
                        <Clock className="w-3 h-3 text-yellow-500" />
                      )}
                      <span className="text-muted-foreground">
                        {formatTime(sig.created_at)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* Users Tab */}
          <TabsContent value="users" className="mt-4">
            <ScrollArea className="h-[500px]">
              <div className="space-y-2">
                {profiles.map((profile) => (
                  <Card key={profile.id}>
                    <CardContent className="p-3 flex items-center gap-3">
                      {profile.avatar_url ? (
                        <img 
                          src={profile.avatar_url} 
                          alt="" 
                          className="w-10 h-10 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                          {(profile.display_name || "?")[0]}
                        </div>
                      )}
                      <div>
                        <p className="font-medium">{profile.display_name || "Без имени"}</p>
                        <p className="text-xs text-muted-foreground font-mono">
                          {profile.user_id.slice(0, 8)}...
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
