import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { CheckCircle2, AlertTriangle, Ban, Clock, Eye, ExternalLink } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Tables } from "@/integrations/supabase/types";

type QueueItem = Tables<"moderation_queue_items">;
type ModerationStatus = Tables<"content_moderation_status">;

type QueueItemWithContent = QueueItem & {
  content_preview?: string;
  author_id?: string;
  report_count?: number;
};

const CONTENT_TYPE_LABELS: Record<string, string> = {
  reel: "Reel",
  comment: "Comment",
  profile: "Profile",
  message: "Message",
  hashtag: "Hashtag",
};

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-100 text-blue-800",
  in_review: "bg-yellow-100 text-yellow-800",
  resolved: "bg-green-100 text-green-800",
};

const DECISION_ICONS = {
  allow: <CheckCircle2 className="w-4 h-4 text-green-600" />,
  restrict: <AlertTriangle className="w-4 h-4 text-yellow-600" />,
  needs_review: <Clock className="w-4 h-4 text-blue-600" />,
  block: <Ban className="w-4 h-4 text-red-600" />,
};

const REASON_CODES = [
  { value: "spam", label: "Spam" },
  { value: "harassment", label: "Harassment" },
  { value: "hate_speech", label: "Hate Speech" },
  { value: "misinformation", label: "Misinformation" },
  { value: "adult_content", label: "Adult Content" },
  { value: "violence", label: "Violence" },
  { value: "policy_violation", label: "Policy Violation" },
  { value: "copyright", label: "Copyright" },
  { value: "other", label: "Other" },
];

export function ModerationQueuePage() {
  const [queueItems, setQueueItems] = useState<QueueItemWithContent[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Filters
  const [filterContentType, setFilterContentType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("open");
  const [searchQuery, setSearchQuery] = useState("");

  // Moderation dialog
  const [selectedItem, setSelectedItem] = useState<QueueItemWithContent | null>(null);
  const [decision, setDecision] = useState<"allow" | "restrict" | "needs_review" | "block">("allow");
  const [reasonCode, setReasonCode] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    loadQueue();
  }, [filterContentType, filterStatus]);

  const loadQueue = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("moderation_queue_items")
        .select("*")
        .order("priority", { ascending: false })
        .order("last_reported_at", { ascending: false })
        .limit(50);

      if (filterContentType !== "all") {
        query = query.eq("content_type", filterContentType);
      }

      if (filterStatus !== "all") {
        query = query.eq("status", filterStatus);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Enrich with content preview and report counts
      const enriched = await Promise.all(
        (data || []).map(async (item) => {
          let preview = "";
          let authorId = "";

          // Get content preview based on type
          if (item.content_type === "reel") {
            const { data: reel } = await supabase
              .from("reels")
              .select("description, author_id")
              .eq("id", item.content_id)
              .single();

            if (reel) {
              preview = reel.description || "";
              authorId = reel.author_id;
            }
          }

          // Get report count
          const { count } = await supabase
            .from("content_reports_v1")
            .select("*", { count: "exact", head: true })
            .eq("content_type", item.content_type)
            .eq("content_id", item.content_id);

          return {
            ...item,
            content_preview: preview,
            author_id: authorId,
            report_count: count || 0,
          };
        })
      );

      setQueueItems(enriched);
    } catch (error) {
      console.error("Failed to load moderation queue:", error);
      toast.error("Failed to load moderation queue");
    } finally {
      setLoading(false);
    }
  };

  const openModerationDialog = (item: QueueItemWithContent) => {
    setSelectedItem(item);
    setDecision("allow");
    setReasonCode("");
    setNotes("");
  };

  const submitModeration = async () => {
    if (!selectedItem) return;

    setSubmitting(true);
    try {
      // Call RPC function to set moderation decision
      const { data, error } = await supabase.rpc("set_content_moderation_decision_v1", {
        p_content_type: selectedItem.content_type,
        p_content_id: selectedItem.content_id,
        p_new_decision: decision,
        p_reason_code: reasonCode || null,
        p_actor_type: "human",
        p_actor_id: null, // TODO: Get current admin user ID
        p_notes: notes || null,
      });

      if (error) throw error;

      toast.success(`Content ${decision === "allow" ? "approved" : decision === "block" ? "blocked" : "marked as " + decision}`);
      
      setSelectedItem(null);
      loadQueue();
    } catch (error: any) {
      console.error("Moderation decision failed:", error);
      toast.error(error.message || "Failed to submit moderation decision");
    } finally {
      setSubmitting(false);
    }
  };

  const viewContent = (item: QueueItemWithContent) => {
    // Open content in new tab
    if (item.content_type === "reel") {
      window.open(`/admin/content/reel/${item.content_id}`, "_blank");
    }
  };

  const filteredItems = queueItems.filter((item) => {
    if (searchQuery && item.content_preview) {
      return item.content_preview.toLowerCase().includes(searchQuery.toLowerCase());
    }
    return true;
  });

  const getStatusBadge = (status: string) => {
    const colors = STATUS_COLORS[status] || "bg-gray-100 text-gray-800";
    return <Badge className={colors}>{status.replace("_", " ")}</Badge>;
  };

  const getPriorityBadge = (priority: number) => {
    if (priority >= 90) return <Badge variant="destructive">Critical</Badge>;
    if (priority >= 70) return <Badge variant="secondary">High</Badge>;
    return <Badge variant="outline">Normal</Badge>;
  };

  const getTimeSince = (timestamp: string) => {
    const diff = Date.now() - new Date(timestamp).getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  return (
    <AdminShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Moderation Queue</h1>
          <Button onClick={loadQueue} disabled={loading}>
            {loading ? "Loading..." : "Refresh"}
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="in_review">In Review</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Search</Label>
                <Input
                  placeholder="Search content..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Queue Table */}
        <Card>
          <CardHeader>
            <CardTitle>Queue Items ({filteredItems.length})</CardTitle>
            <CardDescription>
              Items requiring moderation review
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Content</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Reports</TableHead>
                  <TableHead>Weight</TableHead>
                  <TableHead>Age</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground">
                      Loading moderation queue...
                    </TableCell>
                  </TableRow>
                )}

                {!loading && filteredItems.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground">
                      No items in queue
                    </TableCell>
                  </TableRow>
                )}

                {!loading &&
                  filteredItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <Badge variant="outline">
                          {CONTENT_TYPE_LABELS[item.content_type]}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <div className="truncate text-sm">
                          {item.content_preview || <span className="text-muted-foreground italic">No preview</span>}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          ID: {item.content_id.slice(0, 8)}...
                        </div>
                      </TableCell>
                      <TableCell>{getPriorityBadge(item.priority)}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{item.report_count}</Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm font-mono">
                          {item.report_weight_sum?.toFixed(1) || "0.0"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {getTimeSince(item.last_reported_at || item.created_at)}
                        </span>
                      </TableCell>
                      <TableCell>{getStatusBadge(item.status)}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => viewContent(item)}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => openModerationDialog(item)}
                            disabled={item.status === "resolved"}
                          >
                            Review
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Moderation Decision Dialog */}
        <Dialog open={!!selectedItem} onOpenChange={(open) => !open && setSelectedItem(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Moderate Content</DialogTitle>
              <DialogDescription>
                Make a moderation decision for this {selectedItem?.content_type}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Content Info */}
              <Card>
                <CardContent className="pt-4">
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Content Type:</span>
                      <Badge>{CONTENT_TYPE_LABELS[selectedItem?.content_type || ""]}</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Reports:</span>
                      <span className="font-medium">{selectedItem?.report_count}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Weight Sum:</span>
                      <span className="font-medium">{selectedItem?.report_weight_sum?.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Burst Pattern:</span>
                      <span className="font-medium">{selectedItem?.burst_suspected ? "Yes" : "No"}</span>
                    </div>
                    {selectedItem?.content_preview && (
                      <div className="pt-2 border-t">
                        <span className="text-muted-foreground">Preview:</span>
                        <p className="mt-1">{selectedItem.content_preview}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Decision */}
              <div className="space-y-2">
                <Label>Decision</Label>
                <Select value={decision} onValueChange={(v: any) => setDecision(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="allow">
                      <div className="flex items-center gap-2">
                        {DECISION_ICONS.allow}
                        <span>Allow (Green - Full distribution)</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="restrict">
                      <div className="flex items-center gap-2">
                        {DECISION_ICONS.restrict}
                        <span>Restrict (Borderline - No recommendations)</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="needs_review">
                      <div className="flex items-center gap-2">
                        {DECISION_ICONS.needs_review}
                        <span>Needs Review (Borderline temp)</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="block">
                      <div className="flex items-center gap-2">
                        {DECISION_ICONS.block}
                        <span>Block (Red - Completely hidden)</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Reason Code */}
              <div className="space-y-2">
                <Label>Reason Code</Label>
                <Select value={reasonCode} onValueChange={setReasonCode}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select reason..." />
                  </SelectTrigger>
                  <SelectContent>
                    {REASON_CODES.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label>Notes (optional)</Label>
                <Textarea
                  placeholder="Add internal notes about this decision..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedItem(null)} disabled={submitting}>
                Cancel
              </Button>
              <Button onClick={submitModeration} disabled={submitting || !reasonCode}>
                {submitting ? "Submitting..." : "Submit Decision"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminShell>
  );
}
