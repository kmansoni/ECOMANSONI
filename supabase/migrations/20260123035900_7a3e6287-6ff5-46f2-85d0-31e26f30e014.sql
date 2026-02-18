-- Create storage bucket for reels media
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'reels-media', 
  'reels-media', 
  true,
  104857600, -- 100MB
  ARRAY['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo']::text[]
)
ON CONFLICT (id) DO NOTHING;

-- Policy: Anyone can view reel videos
CREATE POLICY "Anyone can view reel videos"
ON storage.objects FOR SELECT
USING (bucket_id = 'reels-media');

-- Policy: Authenticated users can upload their own reels
CREATE POLICY "Users can upload their own reels"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'reels-media' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy: Users can update their own reels
CREATE POLICY "Users can update their own reels"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'reels-media' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy: Users can delete their own reels
CREATE POLICY "Users can delete their own reels"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'reels-media' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);