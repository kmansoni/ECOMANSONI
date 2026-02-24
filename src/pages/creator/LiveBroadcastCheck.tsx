import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

/**
 * LiveBroadcastCheck
 * Step 1: Check creator eligibility and session limits
 * Shows reason for ineligibility or allows proceeding to setup
 */
export function LiveBroadcastCheck() {
  const navigate = useNavigate();
  const [eligible, setEligible] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [sessionsToday, setSessionsToday] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkEligibility();
  }, []);

  async function checkEligibility() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setReason("Not authenticated");
        return;
      }

      // Call eligibility RPC
      const { data, error } = await supabase.rpc("is_eligible_for_live_v1", {
        p_creator_id: user.id,
      });

      if (error) throw error;

      if (data && data.length > 0) {
        const result = data[0];
        setEligible(result.eligible);
        setReason(result.reason);
      }

      // Get today's session count
      const { data: sessions } = await supabase
        .from("live_sessions")
        .select("id")
        .eq("creator_id", user.id)
        .gte("started_at", new Date(new Date().setHours(0, 0, 0, 0)).toISOString())
        .in("status", ["live", "ended", "preparing"]);

      setSessionsToday(sessions?.length || 0);
    } catch (error: any) {
      console.error("Eligibility check failed:", error);
      toast.error("Failed to check eligibility");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto p-4 py-20">
        <Card>
          <CardContent className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="text-2xl">🎬</span> Go Live
          </CardTitle>
          <CardDescription>Start a live broadcast with your audience</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!eligible ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{reason}</AlertDescription>
            </Alert>
          ) : (
            <>
              <Alert className="border-green-500 bg-green-50">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  You're eligible to go live!
                </AlertDescription>
              </Alert>

              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <span className="font-medium">Broadcasts today</span>
                  <Badge variant="outline">{sessionsToday}/3</Badge>
                </div>

                <div className="text-sm text-muted-foreground space-y-1">
                  <p>• Max 3 live streams per day</p>
                  <p>• Max 4 hours per stream</p>
                  <p>• Max 100 concurrent viewers</p>
                </div>
              </div>

              <Button
                size="lg"
                className="w-full"
                onClick={() => navigate("/creator/live/setup")}
              >
                Start Live Session
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
