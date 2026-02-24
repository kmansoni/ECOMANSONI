import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Clock, AlertTriangle } from "lucide-react";
import { useAdminMe } from "@/hooks/useAdminMe";
import { supabase } from "@/lib/supabase";
import { Tables } from "@/integrations/supabase/types";

type Appeal = Tables<"moderation_appeals">;

type AppealWithDetails = Appeal & {
  content_preview?: string;
  reporter_count?: number;
};

const APPEAL_STATUS_COLORS: Record<string, string> = {
  submitted: "bg-blue-100 text-blue-800",
  in_review: "bg-yellow-100 text-yellow-800",
  accepted: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
};

const APPEAL_REASON_LABELS: Record<string, string> = {
  false_positive: "False Positive",
  context_missing: "Context Missing",
  policy_unclear: "Policy Unclear",
  technical_error: "Technical Error",
  other: "Other",
};

const CONTENT_TYPE_LABELS: Record<string, string> = {
  reel: "Reel",
  comment: "Comment",
  profile: "Profile",
  message: "Message",
  hashtag: "Hashtag",
};

export function AppealsPage() {
  const { me: adminMe } = useAdminMe();
  const [appeals, setAppeals] = useState<AppealWithDetails[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Filters
  const [filterStatus, setFilterStatus] = useState<string>("submitted");
  const [filterContentType, setFilterContentType] = useState<string>("all");

  // Review dialog
  const [selectedAppeal, setSelectedAppeal] = useState<AppealWithDetails | null>(null);
  const [reviewDecision, setReviewDecision] = useState<"accept" | "reject">("accept");
  const [newDecision, setNewDecision] = useState<"allow" | "restrict" | "needs_review" | "block">("allow");
  const [reasonCode, setReasonCode] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    loadAppeals();
  }, [filterStatus, filterContentType]);

  const loadAppeals = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("moderation_appeals")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);

      if (filterStatus !== "all") {
        query = query.eq("status", filterStatus as any);
      }

      if (filterContentType !== "all") {
        query = query.eq("content_type", filterContentType);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Enrich with content preview and moderation info
      const enriched = await Promise.all(
        (data || []).map(async (appeal) => {
          let preview = "";

          // Get content preview based on type
          try {
            if (appeal.content_type === "reel") {
              const { data: reel } = await supabase
                .from("reels")
                .select("description")
                .eq("id", appeal.content_id)
                .single();
              if (reel) {
                preview = (reel.description || "").substring(0, 150);
              }
            } else if (appeal.content_type === "comment") {
              const { data: comment } = await supabase
                .from("comments")
                .select("content")
                .eq("id", appeal.content_id)
                .single();
              if (comment) {
                preview = (comment.content || "").substring(0, 150);
              }
            } else if (appeal.content_type === "message") {
              const { data: message } = await supabase
                .from("direct_messages")
                .select("content")
                .eq("id", appeal.content_id)
                .single();
              if (message) {
                preview = (message.content || "").substring(0, 150);
              }
            } else if (appeal.content_type === "profile") {
              const { data: profile } = await supabase
                .from("profiles")
                .select("display_name, bio")
                .eq("id", appeal.content_id)
                .single();
              if (profile) {
                preview = `${profile.display_name || ""}${profile.bio ? " - " + profile.bio : ""}`.substring(0, 150);
              }
            } else if (appeal.content_type === "hashtag") {
              const { data: hashtag } = await supabase
                .from("hashtags")
                .select("canonical_form")
                .eq("id", appeal.content_id)
                .single();
              if (hashtag) {
                preview = `#${hashtag.canonical_form || ""}`;
              }
            }
          } catch (previewError) {
            // Silently fail on preview fetch, show empty preview
            preview = "[Content not found]";
          }

          return {
            ...appeal,
            content_preview: preview,
          };
        })
      );

      setAppeals(enriched);
    } catch (error) {
      console.error("Failed to load appeals:", error);
      toast.error("Failed to load appeals");
    } finally {
      setLoading(false);
    }
  };

  const openReviewDialog = (appeal: AppealWithDetails) => {
    setSelectedAppeal(appeal);
    setReviewDecision("accept");
    setNewDecision("allow");
    setReasonCode("");
    setNotes("");
  };

  const submitReview = async () => {
    if (!selectedAppeal) return;

    setSubmitting(true);
    try {
      // Call RPC function to review appeal
      const { data, error } = await supabase.rpc("review_appeal_v1", {
        p_appeal_id: selectedAppeal.id,
        p_moderator_admin_id: adminMe?.admin_user_id || null,
        p_decision: reviewDecision,
        p_new_moderation_decision: reviewDecision === "accept" ? newDecision : null,
        p_notes: notes || null,
      });

      if (error) throw error;

      toast.success(`Appeal ${reviewDecision === "accept" ? "accepted" : "rejected"}`);
      
      setSelectedAppeal(null);
      loadAppeals();
    } catch (error: any) {
      console.error("Appeal review failed:", error);
      toast.error(error.message || "Failed to submit appeal review");
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const colors = APPEAL_STATUS_COLORS[status] || "bg-gray-100 text-gray-800";
    return <Badge className={colors}>{status.replace("_", " ")}</Badge>;
  };

  const getTimeSince = (timestamp: string) => {
    const diff = Date.now() - new Date(timestamp).getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    
    if (hours > 48) {
      return <span className="text-red-600 font-medium">{Math.floor(hours / 24)}d {hours % 24}h (SLA BREACH)</span>;
    }
    if (hours > 24) {
      return <span className="text-yellow-600 font-medium">{Math.floor(hours / 24)}d {hours % 24}h (WARNING)</span>;
    }
    return <span>{hours}h {Math.floor(((diff % (1000 * 60 * 60)) / (1000 * 60)))}m</span>;
  };

  return (
    <AdminShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Content Appeals</h1>
          <Button onClick={loadAppeals} disabled={loading}>
            {loading ? "Loading..." : "Refresh"}
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="submitted">Submitted</SelectItem>
                    <SelectItem value="in_review">In Review</SelectItem>
                    <SelectItem value="accepted">Accepted</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Content Type</Label>
                <Select value={filterContentType} onValueChange={setFilterContentType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="reel">Reels</SelectItem>
                    <SelectItem value="comment">Comments</SelectItem>
                    <SelectItem value="profile">Profiles</SelectItem>
                    <SelectItem value="message">Messages</SelectItem>
                    <SelectItem value="hashtag">Hashtags</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Appeals Table */}
        <Card>
          <CardHeader>
            <CardTitle>Appeals ({appeals.length})</CardTitle>
            <CardDescription>
              User appeals of moderation decisions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Content</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Original Decision</TableHead>
                  <TableHead>Age</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      Loading appeals...
                    </TableCell>
                  </TableRow>
                )}

                {!loading && appeals.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      No appeals found
                    </TableCell>
                  </TableRow>
                )}

                {!loading &&
                  appeals.map((appeal) => (
                    <TableRow key={appeal.id}>
                      <TableCell>
                        <Badge variant="outline">
                          {CONTENT_TYPE_LABELS[appeal.content_type]}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <div className="truncate text-sm">
                          {appeal.content_preview || <span className="text-muted-foreground italic">No preview</span>}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          ID: {appeal.content_id.slice(0, 8)}...
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {APPEAL_REASON_LABELS[appeal.reason]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {appeal.original_decision || "unknown"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {getTimeSince(appeal.created_at)}
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(appeal.status)}</TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          onClick={() => openReviewDialog(appeal)}
                          disabled={appeal.status !== "submitted"}
                        >
                          Review
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Review Dialog */}
        <Dialog open={!!selectedAppeal} onOpenChange={(open) => !open && setSelectedAppeal(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Review Appeal</DialogTitle>
              <DialogDescription>
                Review user appeal for {selectedAppeal?.content_type}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Appeal Info */}
              <Card>
                <CardContent className="pt-4">
                  <div className="space-y-3 text-sm">
                    <div>
                      <span className="text-muted-foreground">Reason:</span>
                      <p className="mt-1 font-medium">
                        {selectedAppeal && APPEAL_REASON_LABELS[selectedAppeal.reason]}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">User Message:</span>
                      <p className="mt-1 bg-muted p-3 rounded">
                        {selectedAppeal?.user_explanation || <span className="italic text-muted-foreground">No message provided</span>}
                      </p>
                    </div>
                    <div className="pt-2 border-t">
                      <span className="text-muted-foreground">Original Decision:</span>
                      <Badge className="ml-2" variant="outline">
                        {selectedAppeal?.original_decision}
                      </Badge>
                    </div>
                    {selectedAppeal?.content_preview && (
                      <div className="pt-2 border-t">
                        <span className="text-muted-foreground">Content Preview:</span>
                        <p className="mt-1">{selectedAppeal.content_preview}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Review Decision */}
              <div className="space-y-2">
                <Label>Review Decision</Label>
                <Select value={reviewDecision} onValueChange={(v: any) => setReviewDecision(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="accept">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-600" />
                        <span>Accept Appeal</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="reject">
                      <div className="flex items-center gap-2">
                        <XCircle className="w-4 h-4 text-red-600" />
                        <span>Reject Appeal</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* New Decision (if accepting) */}
              {reviewDecision === "accept" && (
                <div className="space-y-2">
                  <Label>New Moderation Decision</Label>
                  <Select value={newDecision} onValueChange={(v: any) => setNewDecision(v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="allow">Allow (Green)</SelectItem>
                      <SelectItem value="restrict">Restrict (Borderline)</SelectItem>
                      <SelectItem value="needs_review">Needs Review</SelectItem>
                      <SelectItem value="block">Block (Red)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Reason Code (if accepting) */}
              {reviewDecision === "accept" && (
                <div className="space-y-2">
                  <Label>Reason Code</Label>
                  <Select value={reasonCode} onValueChange={setReasonCode}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select reason..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="appeal_accepted">Appeal Accepted</SelectItem>
                      <SelectItem value="false_positive">False Positive</SelectItem>
                      <SelectItem value="context_restored">Context Restored</SelectItem>
                      <SelectItem value="policy_clarified">Policy Clarified</SelectItem>
                      <SelectItem value="technical_fixed">Technical Issue Fixed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Notes */}
              <div className="space-y-2">
                <Label>Internal Notes</Label>
                <Textarea
                  placeholder="Add notes about this review..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedAppeal(null)} disabled={submitting}>
                Cancel
              </Button>
              <Button 
                onClick={submitReview} 
                disabled={submitting || (reviewDecision === "accept" && !reasonCode)}
              >
                {submitting ? "Submitting..." : `${reviewDecision === "accept" ? "Accept" : "Reject"} Appeal`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminShell>
  );
}
