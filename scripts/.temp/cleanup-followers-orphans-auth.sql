WITH deleted AS (
  DELETE FROM public.followers f
  WHERE NOT EXISTS (
      SELECT 1
      FROM auth.users u
      WHERE u.id = f.follower_id
    )
    OR NOT EXISTS (
      SELECT 1
      FROM auth.users u
      WHERE u.id = f.following_id
    )
  RETURNING f.follower_id, f.following_id
),
sample AS (
  SELECT follower_id, following_id
  FROM deleted
  LIMIT 20
)
SELECT
  (SELECT COUNT(*) FROM deleted) AS deleted_rows,
  COALESCE((SELECT json_agg(sample) FROM sample), '[]'::json) AS sample_deleted_pairs;
