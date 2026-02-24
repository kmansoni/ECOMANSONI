import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

// Type definitions
interface SessionCreateResult {
  session_id: number;
  error: string | null;
}
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";

const CATEGORIES = ["music", "gaming", "chat", "performance", "other"];

/**
 * LiveSetupSheet
 * Step 2: Configure broadcast title, category, description
 * Submits to broadcast_create_session_v1
 */
export function LiveSetupSheet() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("chat");
  const [submitting, setSubmitting] = useState(false);

  async function handleStartBroadcast() {
    if (!title.trim()) {
      toast.error("Title is required");
      return;
    }

    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await (supabase.rpc("broadcast_create_session_v1", {
        p_creator_id: user.id,
        p_title: title,
        p_description: description,
        p_category: category,
        p_thumbnail_url: null,
      }) as any);

      if (error) throw error;

      if (data && data.length > 0 && data[0].session_id) {
        toast.success("Live session created!");
        navigate(`/live/${data[0].session_id}`);
      } else if (data && data[0].error) {
        toast.error(data[0].error);
      }
    } catch (error: any) {
      console.error("Failed to create session:", error);
      toast.error(error.message || "Failed to start broadcast");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Set Up Your Broadcast</CardTitle>
          <CardDescription>Configure title, category, and description</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Title */}
          <div>
            <Label htmlFor="title">Broadcast Title *</Label>
            <Input
              id="title"
              placeholder="What are you streaming about?"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={50}
              className="mt-2"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {title.length}/50 characters
            </p>
          </div>

          {/* Category */}
          <div>
            <Label htmlFor="category">Category *</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="category" className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat.charAt(0).toUpperCase() + cat.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Description */}
          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Add details about your stream (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={200}
              className="mt-2 resize-none h-20"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {description.length}/200 characters
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <Button variant="outline" onClick={() => navigate(-1)}>
              Cancel
            </Button>
            <Button
              onClick={handleStartBroadcast}
              disabled={submitting || !title.trim()}
              className="flex-1"
            >
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {submitting ? "Starting..." : "Go Live"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
