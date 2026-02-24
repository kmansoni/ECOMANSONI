import { useState, useEffect } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, Clock } from "lucide-react";

interface KpiSnapshot {
  snapshot_date: string;
  dau: number;
  wau: number;
  mau: number;
  retention_7d: number;
  retention_30d: number;
  avg_session_duration_seconds: number;
  session_count: number;
  content_completion_rate: number;
  report_rate_per_1k: number;
  moderation_queue_age_hours: number;
  creator_return_rate_7d: number;
  new_creators_count: number;
  active_creators_count: number;
}

interface GuardrailAlert {
  id: number;
  metric_name: string;
  current_value: number;
  threshold: number;
  severity: "info" | "warning" | "critical";
  status: "active" | "resolved" | "ignored";
  affected_feature: string;
  created_at: string;
}

export function KpiDashboardPage() {
  const [kpiData, setKpiData] = useState<KpiSnapshot | null>(null);
  const [alerts, setAlerts] = useState<GuardrailAlert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
    const interval = setInterval(loadDashboardData, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, []);

  async function loadDashboardData() {
    try {
      // Load latest KPI snapshot
      const { data: snapshots, error: snapshotError } = await supabase
        .from("kpi_daily_snapshots")
        .select("*")
        .order("snapshot_date", { ascending: false })
        .limit(1);

      if (snapshotError) throw snapshotError;
      if (snapshots && snapshots.length > 0) {
        setKpiData(snapshots[0]);
      }

      // Load active guardrail alerts
      const { data: alertData, error: alertError } = await supabase
        .from("guardrail_alerts")
        .select("*")
        .eq("status", "active")
        .order("created_at", { ascending: false });

      if (alertError) throw alertError;
      setAlerts(alertData || []);
    } catch (error) {
      console.error("Failed to load KPI data:", error);
      toast.error("Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  }

  function getMetricStatus(value: number, threshold: number, inverted = false): "green" | "yellow" | "red" {
    if (inverted) {
      // For metrics where lower is better (e.g., report_rate)
      if (value >= threshold * 1.2) return "red";
      if (value >= threshold) return "yellow";
      return "green";
    } else {
      // For metrics where higher is better (e.g., retention)
      if (value <= threshold * 0.8) return "red";
      if (value <= threshold) return "yellow";
      return "green";
    }
  }

  function formatDuration(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}m ${secs}s`;
  }

  if (loading) {
    return (
      <AdminShell>
        <div className="max-w-6xl mx-auto p-4">
          <div className="animate-pulse">Loading KPI Dashboard...</div>
        </div>
      </AdminShell>
    );
  }

  if (!kpiData) {
    return (
      <AdminShell>
        <div className="max-w-6xl mx-auto p-4">
          <Card>
            <CardHeader>
              <CardTitle>No KPI Data</CardTitle>
              <CardDescription>No snapshots available. Run daily aggregation job.</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </AdminShell>
    );
  }

  const retentionStatus = getMetricStatus(kpiData.retention_7d, 35);
  const reportRateStatus = getMetricStatus(kpiData.report_rate_per_1k, 5, true);
  const creatorReturnStatus = getMetricStatus(kpiData.creator_return_rate_7d, 40);

  return (
    <AdminShell>
      <div className="max-w-6xl mx-auto p-4 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold">Phase 1 KPI Dashboard</h1>
          <p className="text-muted-foreground">
            Last updated: {new Date(kpiData.snapshot_date).toLocaleDateString()} · Auto-refresh every 60s
          </p>
        </div>

        {/* Guardrail Alerts */}
        {alerts.length > 0 && (
          <Card className="border-destructive">
            <CardHeader>
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                <CardTitle>Active Guardrail Breaches ({alerts.length})</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {alerts.map((alert) => (
                <div key={alert.id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div className="space-y-1">
                    <div className="font-medium">{alert.metric_name}</div>
                    <div className="text-sm text-muted-foreground">
                      Current: {alert.current_value.toFixed(2)} · Threshold: {alert.threshold.toFixed(2)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Affects: {alert.affected_feature} · {new Date(alert.created_at).toLocaleString()}
                    </div>
                  </div>
                  <Badge variant={alert.severity === "critical" ? "destructive" : "secondary"}>
                    {alert.severity}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* User Engagement Metrics */}
        <div>
          <h2 className="text-xl font-semibold mb-3">User Engagement</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">Daily Active Users</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{kpiData.dau.toLocaleString()}</div>
                <div className="text-sm text-muted-foreground mt-1">
                  WAU: {kpiData.wau.toLocaleString()} · MAU: {kpiData.mau.toLocaleString()}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">Retention (7d)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <div className="text-3xl font-bold">{kpiData.retention_7d.toFixed(1)}%</div>
                  {retentionStatus === "green" && <TrendingUp className="h-5 w-5 text-green-500" />}
                  {retentionStatus === "yellow" && <Clock className="h-5 w-5 text-yellow-500" />}
                  {retentionStatus === "red" && <TrendingDown className="h-5 w-5 text-destructive" />}
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  30d: {kpiData.retention_30d.toFixed(1)}% · Target: &gt;35%
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">Avg Session Duration</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{formatDuration(kpiData.avg_session_duration_seconds)}</div>
                <div className="text-sm text-muted-foreground mt-1">
                  {kpiData.session_count.toLocaleString()} sessions · {kpiData.content_completion_rate.toFixed(1)}%
                  completion
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Creator Metrics */}
        <div>
          <h2 className="text-xl font-semibold mb-3">Creator Health</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">Active Creators</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{kpiData.active_creators_count.toLocaleString()}</div>
                <div className="text-sm text-muted-foreground mt-1">
                  New (7d): {kpiData.new_creators_count.toLocaleString()}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">Creator Return Rate (7d)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <div className="text-3xl font-bold">{kpiData.creator_return_rate_7d.toFixed(1)}%</div>
                  {creatorReturnStatus === "green" && <CheckCircle2 className="h-5 w-5 text-green-500" />}
                  {creatorReturnStatus === "yellow" && <Clock className="h-5 w-5 text-yellow-500" />}
                  {creatorReturnStatus === "red" && <AlertTriangle className="h-5 w-5 text-destructive" />}
                </div>
                <div className="text-sm text-muted-foreground mt-1">Target: &gt;40%</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">Safety Metrics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Report Rate</span>
                    <div className="flex items-center gap-2">
                      <Badge variant={reportRateStatus === "green" ? "secondary" : "destructive"}>
                        {kpiData.report_rate_per_1k.toFixed(2)} per 1k
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Queue Age</span>
                    <Badge variant={kpiData.moderation_queue_age_hours > 24 ? "destructive" : "secondary"}>
                      {kpiData.moderation_queue_age_hours.toFixed(1)}h
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <Separator />

        {/* Guardrail Status Overview */}
        <div>
          <h2 className="text-xl font-semibold mb-3">Guardrail Status</h2>
          <Card>
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <GuardrailRow
                  name="Feed Latency P95"
                  value={450}
                  threshold={500}
                  unit="ms"
                  inverted={true}
                  status="green"
                />
                <GuardrailRow
                  name="Retention 7d"
                  value={kpiData.retention_7d}
                  threshold={35}
                  unit="%"
                  status={retentionStatus}
                />
                <GuardrailRow
                  name="Report Rate per 1k"
                  value={kpiData.report_rate_per_1k}
                  threshold={5}
                  unit=""
                  inverted={true}
                  status={reportRateStatus}
                />
                <GuardrailRow
                  name="Queue Age"
                  value={kpiData.moderation_queue_age_hours}
                  threshold={24}
                  unit="h"
                  inverted={true}
                  status={kpiData.moderation_queue_age_hours > 24 ? "red" : "green"}
                />
                <GuardrailRow
                  name="Creator Return Rate"
                  value={kpiData.creator_return_rate_7d}
                  threshold={40}
                  unit="%"
                  status={creatorReturnStatus}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminShell>
  );
}

function GuardrailRow({
  name,
  value,
  threshold,
  unit,
  inverted = false,
  status,
}: {
  name: string;
  value: number;
  threshold: number;
  unit: string;
  inverted?: boolean;
  status: "green" | "yellow" | "red";
}) {
  const statusColors = {
    green: "text-green-500",
    yellow: "text-yellow-500",
    red: "text-destructive",
  };

  const statusIcons = {
    green: <CheckCircle2 className="h-4 w-4" />,
    yellow: <Clock className="h-4 w-4" />,
    red: <AlertTriangle className="h-4 w-4" />,
  };

  return (
    <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
      <div className="space-y-1">
        <div className="font-medium">{name}</div>
        <div className="text-sm text-muted-foreground">
          Threshold: {inverted ? "<" : ">"} {threshold}
          {unit}
        </div>
      </div>
      <div className={`flex items-center gap-2 ${statusColors[status]}`}>
        <div className="font-bold">
          {value.toFixed(value < 10 ? 2 : 1)}
          {unit}
        </div>
        {statusIcons[status]}
      </div>
    </div>
  );
}
