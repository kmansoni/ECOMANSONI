import { useCallback, useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { adminApi } from "@/lib/adminApi";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { CheckCircle2, AlertCircle, EyeOff } from "lucide-react";

type HashtagStatus = "normal" | "restricted" | "hidden";

type HashtagRow = {
  hashtag: string;
  status: HashtagStatus;
  status_updated_at: string | null;
  created_at: string;
  usage_count: number;
};

const STATUS_COLORS: Record<HashtagStatus, string> = {
  normal: "bg-green-100 text-green-800",
  restricted: "bg-yellow-100 text-yellow-800",
  hidden: "bg-red-100 text-red-800",
};

const STATUS_ICONS = {
  normal: <CheckCircle2 className="w-4 h-4" />,
  restricted: <AlertCircle className="w-4 h-4" />,
  hidden: <EyeOff className="w-4 h-4" />,
};

const STATUS_LABELS: Record<HashtagStatus, string> = {
  normal: "Normal",
  restricted: "Restricted",
  hidden: "Hidden",
};

const REASON_CODES = [
  "spam",
  "harassment",
  "hate_speech",
  "misinformation",
  "adult_content",
  "copyright",
  "trademark",
  "policy_violation",
  "other",
];

export function AdminHashtagModerationPage() {
  const [hashtags, setHashtags] = useState<HashtagRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchHashtag, setSearchHashtag] = useState("");

  const [targetHashtag, setTargetHashtag] = useState("");
  const [targetStatus, setTargetStatus] = useState<HashtagStatus>("normal");
  const [reasonCodes, setReasonCodes] = useState<string[]>([]);
  const [reasonCodesInput, setReasonCodesInput] = useState("");
  const [surfacePolicy, setSurfacePolicy] = useState("suppress_for_you");
  const [notes, setNotes] = useState("");

  const [selectedForEdit, setSelectedForEdit] = useState<HashtagRow | null>(null);

  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [bulkTargetStatus, setBulkTargetStatus] = useState<HashtagStatus>("normal");
  const [bulkReasonCodesInput, setBulkReasonCodesInput] = useState("");
  const [bulkSurfacePolicy, setBulkSurfacePolicy] = useState("suppress_for_you");
  const [bulkNotes, setBulkNotes] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminApi<HashtagRow[]>("hashtags.list", {
        limit: 500,
        status: filterStatus === "all" ? undefined : filterStatus,
      });
      setHashtags(data ?? []);
      setSelected({});
    } catch (e) {
      toast.error("Failed to load hashtags", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSelectForEdit = (row: HashtagRow) => {
    setSelectedForEdit(row);
    setTargetHashtag(row.hashtag);
    setTargetStatus(row.status);
    setReasonCodes([]);
    setReasonCodesInput("");
    setSurfacePolicy("suppress_for_you");
    setNotes("");
  };

  const handleUpdateStatus = async () => {
    if (!targetHashtag.trim()) {
      toast.error("Hashtag is required");
      return;
    }

    const finalReasonCodes = reasonCodesInput.trim()
      ? reasonCodesInput.split(",").map(c => c.trim()).filter(Boolean)
      : reasonCodes;

    if (finalReasonCodes.length === 0 && targetStatus !== "normal") {
      toast.error("At least one reason code is required for non-normal status");
      return;
    }

    setSubmitting(true);
    try {
      await adminApi("hashtags.status.set", {
        hashtag: targetHashtag.trim().toLowerCase(),
        to_status: targetStatus,
        reason_codes: finalReasonCodes,
        surface_policy: surfacePolicy,
        notes: notes.trim(),
      });

      toast.success(`Hashtag '${targetHashtag}' status updated to ${targetStatus}`);
      setTargetHashtag("");
      setTargetStatus("normal");
      setReasonCodes([]);
      setReasonCodesInput("");
      setSurfacePolicy("suppress_for_you");
      setNotes("");
      setSelectedForEdit(null);
      await load();
    } catch (e) {
      toast.error("Failed to update hashtag status", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSubmitting(false);
    }
  };

  const filteredHashtags = hashtags.filter((h) =>
    searchHashtag ? h.hashtag.toLowerCase().includes(searchHashtag.toLowerCase()) : true,
  );

  const visibleTags = filteredHashtags.map((h) => h.hashtag);
  const selectedTags = Object.keys(selected).filter((k) => selected[k]);

  const selectedVisibleCount = visibleTags.filter((t) => selected[t]).length;
  const allVisibleSelected = visibleTags.length > 0 && selectedVisibleCount === visibleTags.length;
  const someVisibleSelected = selectedVisibleCount > 0 && !allVisibleSelected;

  const headerCheckboxState: boolean | "indeterminate" = allVisibleSelected
    ? true
    : someVisibleSelected
      ? "indeterminate"
      : false;

  const setAllVisibleSelected = (checked: boolean) => {
    setSelected((prev) => {
      const next = { ...prev };
      for (const t of visibleTags) {
        next[t] = checked;
      }
      return next;
    });
  };

  const toggleSelected = (tag: string, checked: boolean) => {
    setSelected((prev) => ({ ...prev, [tag]: checked }));
  };

  const clearSelection = () => setSelected({});

  const handleBulkUpdateStatus = async () => {
    const tags = selectedTags.map((t) => t.replace(/^#/, "").trim()).filter(Boolean);
    if (tags.length === 0) {
      toast.error("Select at least one hashtag");
      return;
    }

    const finalReasonCodes = bulkReasonCodesInput.trim()
      ? bulkReasonCodesInput.split(",").map((c) => c.trim()).filter(Boolean)
      : [];

    if (bulkTargetStatus !== "normal" && finalReasonCodes.length === 0) {
      toast.error("At least one reason code is required for non-normal status");
      return;
    }

    setSubmitting(true);
    try {
      await adminApi("hashtags.status.bulk_set", {
        hashtags: tags,
        to_status: bulkTargetStatus,
        reason_codes: finalReasonCodes,
        surface_policy: bulkSurfacePolicy,
        notes: bulkNotes.trim(),
      });

      toast.success(`Updated ${tags.length} hashtags to ${bulkTargetStatus}`);
      clearSelection();
      setBulkReasonCodesInput("");
      setBulkTargetStatus("normal");
      setBulkSurfacePolicy("suppress_for_you");
      setBulkNotes("");
      await load();
    } catch (e) {
      toast.error("Bulk update failed", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AdminShell>
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Hashtag Moderation</h1>
          <p className="text-muted-foreground mt-1">Manage hashtag status and visibility</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Update Form */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle>Update Hashtag Status</CardTitle>
              <CardDescription>Change status and add reason</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="target-hashtag">Hashtag</Label>
                <Input
                  id="target-hashtag"
                  value={targetHashtag}
                  onChange={(e) => setTargetHashtag(e.target.value.replace(/^#/, ""))}
                  placeholder="example"
                  disabled={submitting}
                />
              </div>

              <div>
                <Label htmlFor="target-status">Status</Label>
                <Select value={targetStatus} onValueChange={(v) => setTargetStatus(v as HashtagStatus)}>
                  <SelectTrigger id="target-status" disabled={submitting}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["normal", "restricted", "hidden"] as HashtagStatus[]).map(status => (
                      <SelectItem key={status} value={status}>
                        {STATUS_LABELS[status]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {targetStatus !== "normal" && (
                <>
                  <div>
                    <Label htmlFor="reason-codes">Reason Codes (comma-separated)</Label>
                    <Input
                      id="reason-codes"
                      value={reasonCodesInput}
                      onChange={(e) => setReasonCodesInput(e.target.value)}
                      placeholder="spam,hate_speech,misinformation"
                      disabled={submitting}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Valid: {REASON_CODES.join(", ")}
                    </p>
                  </div>

                  <div>
                    <Label htmlFor="surface-policy">Surface Policy</Label>
                    <Select value={surfacePolicy} onValueChange={setSurfacePolicy}>
                      <SelectTrigger id="surface-policy" disabled={submitting}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="suppress_for_you">Suppress For You</SelectItem>
                        <SelectItem value="hide_from_trending">Hide from Trending</SelectItem>
                        <SelectItem value="remove_from_explore">Remove from Explore</SelectItem>
                        <SelectItem value="shadow_ban">Shadow Ban</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="notes">Notes (optional)</Label>
                    <Textarea
                      id="notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Internal notes about this action"
                      disabled={submitting}
                      rows={3}
                    />
                  </div>
                </>
              )}

              <Button
                onClick={handleUpdateStatus}
                disabled={submitting || !targetHashtag.trim()}
                className="w-full"
              >
                {submitting ? "Updating..." : "Update Status"}
              </Button>
              {selectedForEdit && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelectedForEdit(null);
                    setTargetHashtag("");
                    setTargetStatus("normal");
                    setReasonCodes([]);
                    setReasonCodesInput("");
                    setNotes("");
                  }}
                  disabled={submitting}
                  className="w-full"
                >
                  Clear
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Hashtags List */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Hashtags</CardTitle>
              <CardDescription>{filteredHashtags.length} results</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Search hashtag..."
                  value={searchHashtag}
                  onChange={(e) => setSearchHashtag(e.target.value)}
                />
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="restricted">Restricted</SelectItem>
                    <SelectItem value="hidden">Hidden</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-2">
                <div className="text-sm text-muted-foreground">
                  Selected: <span className="font-medium text-foreground">{selectedTags.length}</span>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Select value={bulkTargetStatus} onValueChange={(v) => setBulkTargetStatus(v as HashtagStatus)}>
                    <SelectTrigger className="w-40" disabled={submitting}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(["normal", "restricted", "hidden"] as HashtagStatus[]).map((status) => (
                        <SelectItem key={status} value={status}>
                          {STATUS_LABELS[status]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {bulkTargetStatus !== "normal" && (
                    <Input
                      placeholder="Reason codes (comma-separated)"
                      value={bulkReasonCodesInput}
                      onChange={(e) => setBulkReasonCodesInput(e.target.value)}
                      disabled={submitting}
                      className="min-w-64"
                    />
                  )}

                  {bulkTargetStatus !== "normal" && (
                    <Select value={bulkSurfacePolicy} onValueChange={setBulkSurfacePolicy}>
                      <SelectTrigger className="w-56" disabled={submitting}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="suppress_for_you">Suppress For You</SelectItem>
                        <SelectItem value="hide_from_trending">Hide from Trending</SelectItem>
                        <SelectItem value="remove_from_explore">Remove from Explore</SelectItem>
                        <SelectItem value="shadow_ban">Shadow Ban</SelectItem>
                      </SelectContent>
                    </Select>
                  )}

                  <Button
                    onClick={handleBulkUpdateStatus}
                    disabled={submitting || selectedTags.length === 0}
                  >
                    {submitting ? "Updating..." : "Bulk Update"}
                  </Button>

                  <Button
                    variant="outline"
                    onClick={clearSelection}
                    disabled={submitting || selectedTags.length === 0}
                  >
                    Clear Selection
                  </Button>
                </div>

                {bulkTargetStatus !== "normal" && (
                  <Textarea
                    value={bulkNotes}
                    onChange={(e) => setBulkNotes(e.target.value)}
                    placeholder="Notes (optional)"
                    disabled={submitting}
                    rows={2}
                  />
                )}
              </div>

              <div className="border rounded-lg overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={headerCheckboxState}
                          onCheckedChange={(v) => setAllVisibleSelected(Boolean(v))}
                          aria-label="Select all"
                          disabled={submitting || loading || filteredHashtags.length === 0}
                        />
                      </TableHead>
                      <TableHead className="min-w-40">#Hashtag</TableHead>
                      <TableHead className="min-w-24">Status</TableHead>
                      <TableHead className="text-right">Usage</TableHead>
                      <TableHead className="min-w-24">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8">
                          Loading...
                        </TableCell>
                      </TableRow>
                    ) : filteredHashtags.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          No hashtags found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredHashtags.map(row => (
                        <TableRow key={row.hashtag} className={selectedForEdit?.hashtag === row.hashtag ? "bg-muted" : ""}>
                          <TableCell>
                            <Checkbox
                              checked={!!selected[row.hashtag]}
                              onCheckedChange={(v) => toggleSelected(row.hashtag, Boolean(v))}
                              aria-label={`Select ${row.hashtag}`}
                              disabled={submitting}
                            />
                          </TableCell>
                          <TableCell className="font-mono text-sm">#{row.hashtag}</TableCell>
                          <TableCell>
                            <Badge className={STATUS_COLORS[row.status]} variant="outline">
                              <span className="mr-1">{STATUS_ICONS[row.status]}</span>
                              {STATUS_LABELS[row.status]}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">
                            {row.usage_count.toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleSelectForEdit(row)}
                              disabled={submitting}
                            >
                              Edit
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminShell>
  );
}
