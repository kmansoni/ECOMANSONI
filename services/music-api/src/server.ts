import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';
import * as zod from 'zod';

const envSchema = zod.object({
  SUPABASE_URL: zod.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: zod.string().min(1),
  MANSONI_JWT_SECRET: zod.string().min(1),
  PORT: zod.string().optional(),
  MANSONI_URL: zod.string().optional(),
  MUSIC_FRONTEND_URL: zod.string().optional(),
});

const env = envSchema.parse(process.env);
const app = express();
const PORT = Number(env.PORT || 3080);

type AuthUser = JwtPayload & { id: string };

interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const trackMutationSchema = zod.object({
  track_id: zod.string().uuid(),
});

const playlistSchema = zod.object({
  name: zod.string().min(1).max(200),
  description: zod.string().max(2000).optional(),
  is_public: zod.boolean().default(false),
});

const playlistUpdateSchema = playlistSchema.partial();

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https://*.supabase.co', 'https://*.amazonaws.com'],
        mediaSrc: ["'self'", 'blob:', 'https://*.supabase.co', 'https://*.amazonaws.com'],
      },
    },
  }),
);

app.use(
  cors({
    origin: (origin, callback) => {
      const allowed = [env.MANSONI_URL, env.MUSIC_FRONTEND_URL, 'http://localhost:5173', 'http://localhost:3001'].filter(
        (value): value is string => Boolean(value),
      );
      if (!origin || allowed.some((value) => origin.startsWith(value))) {
        callback(null, true);
        return;
      }

      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  }),
);

app.use(express.json());
app.use(
  '/api/',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 120,
    message: 'Too many requests',
  }),
);

function getTokenFromRequest(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    return header.slice(7);
  }

  if (typeof req.query.token === 'string') {
    return req.query.token;
  }

  return null;
}

function verifyToken(token: string): AuthUser | null {
  try {
    const decoded = jwt.verify(token, env.MANSONI_JWT_SECRET);
    if (typeof decoded === 'string') {
      return null;
    }

    const id = typeof decoded.sub === 'string' ? decoded.sub : typeof decoded.id === 'string' ? decoded.id : null;
    if (!id) {
      return null;
    }

    return { ...decoded, id };
  } catch {
    return null;
  }
}

function optionalAuth(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
  const token = getTokenFromRequest(req);
  if (!token) {
    next();
    return;
  }

  const decoded = verifyToken(token);
  if (decoded) {
    req.user = decoded;
  }

  next();
}

function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  optionalAuth(req, res, () => {
    if (!req.user) {
      res.status(401).json({ error: 'No token provided or token is invalid' });
      return;
    }

    next();
  });
}

function sendError(res: Response, error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : 'Unexpected error';
  res.status(status).json({ error: message });
}

async function resolveAudioUrl(audioUrl: string): Promise<string> {
  if (/^https?:\/\//i.test(audioUrl)) {
    return audioUrl;
  }

  const storagePath = audioUrl.replace(/^music\//, '');
  const { data, error } = await supabase.storage.from('music').createSignedUrl(storagePath, 60 * 60);
  if (error) {
    throw error;
  }

  return data.signedUrl;
}

async function searchTrackRows(query: string, limit: number) {
  const [tracksResult, artistsResult, albumsResult] = await Promise.all([
    supabase
      .from('music_tracks')
      .select(`
        id, title, duration_ms, explicit, play_count, popularity, created_at, preview_url, audio_url,
        artist:music_artists(name, image_url),
        album:music_albums(title, cover_url)
      `)
      .ilike('title', `%${query}%`)
      .limit(limit),
    supabase.from('music_artists').select('id').ilike('name', `%${query}%`).limit(10),
    supabase.from('music_albums').select('id').ilike('title', `%${query}%`).limit(10),
  ]);

  if (tracksResult.error) throw tracksResult.error;
  if (artistsResult.error) throw artistsResult.error;
  if (albumsResult.error) throw albumsResult.error;

  const extraRows: Record<string, unknown>[] = [];
  const artistIds = (artistsResult.data || []).map((artist) => artist.id);
  const albumIds = (albumsResult.data || []).map((album) => album.id);

  if (artistIds.length > 0) {
    const { data, error } = await supabase
      .from('music_tracks')
      .select(`
        id, title, duration_ms, explicit, play_count, popularity, created_at, preview_url, audio_url,
        artist:music_artists(name, image_url),
        album:music_albums(title, cover_url)
      `)
      .in('artist_id', artistIds)
      .limit(limit);

    if (error) throw error;
    extraRows.push(...(data || []));
  }

  if (albumIds.length > 0) {
    const { data, error } = await supabase
      .from('music_tracks')
      .select(`
        id, title, duration_ms, explicit, play_count, popularity, created_at, preview_url, audio_url,
        artist:music_artists(name, image_url),
        album:music_albums(title, cover_url)
      `)
      .in('album_id', albumIds)
      .limit(limit);

    if (error) throw error;
    extraRows.push(...(data || []));
  }

  const deduped = new Map<string, Record<string, unknown>>();
  for (const row of [...(tracksResult.data || []), ...extraRows]) {
    deduped.set(String(row.id), row);
  }

  return Array.from(deduped.values()).slice(0, limit);
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'music-api', timestamp: new Date().toISOString() });
});

app.get('/api/me', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { data, error } = await supabase
      .from('music_subscriptions')
      .select('status, current_period_end')
      .eq('user_id', req.user!.id)
      .maybeSingle();

    if (error) throw error;
    res.json({ data: { userId: req.user!.id, subscription: data } });
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/tracks', async (req, res) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 20);
    let query = supabase
      .from('music_tracks')
      .select(
        `
          id, title, duration_ms, explicit, play_count, popularity, created_at, preview_url, audio_url,
          artist:music_artists(name, image_url),
          album:music_albums(title, cover_url)
        `,
        { count: 'exact' },
      )
      .order('play_count', { ascending: false })
      .order('popularity', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    if (typeof req.query.search === 'string' && req.query.search.trim()) {
      query = query.ilike('title', `%${req.query.search.trim()}%`);
    }

    if (typeof req.query.artist === 'string' && req.query.artist) {
      query = query.eq('artist_id', req.query.artist);
    }

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({ data, pagination: { page, limit, total: count || 0 } });
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/tracks/:id', optionalAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('music_tracks')
      .select(`
        id, title, duration_ms, explicit, preview_url, audio_url, waveform_data,
        artist:music_artists(id, name, image_url, genres),
        album:music_albums(id, title, cover_url, release_date)
      `)
      .eq('id', id)
      .single();

    if (error) throw error;

    if (req.user) {
      await supabase.rpc('record_track_play', {
        p_user_id: req.user.id,
        p_track_id: id,
        p_device: 'web',
      });
    }

    res.json({ data });
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/stream/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { data: track, error } = await supabase.from('music_tracks').select('id, title, audio_url').eq('id', id).single();
    if (error || !track) {
      res.status(404).json({ error: 'Track not found' });
      return;
    }

    const url = await resolveAudioUrl(track.audio_url);
    res.json({ url, track: { id: track.id, title: track.title } });
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/playlists', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { data, error } = await supabase
      .from('music_playlists')
      .select('*')
      .eq('user_id', req.user!.id)
      .order('updated_at', { ascending: false });

    if (error) throw error;
    res.json({ data });
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/playlists/:id', optionalAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { data: playlist, error } = await supabase.from('music_playlists').select('*').eq('id', id).single();
    if (error) throw error;

    const isOwner = req.user?.id === playlist.user_id;
    if (!playlist.is_public && !isOwner) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const { data: tracks, error: tracksError } = await supabase
      .from('music_playlist_tracks')
      .select(`
        id, position, added_at,
        music_tracks(
          id, title, duration_ms, preview_url, audio_url,
          artist:music_artists(name),
          album:music_albums(cover_url, title)
        )
      `)
      .eq('playlist_id', id)
      .order('position', { ascending: true });

    if (tracksError) throw tracksError;
    res.json({ data: { ...playlist, tracks } });
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/playlists', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const validated = playlistSchema.parse(req.body);
    const { data, error } = await supabase
      .from('music_playlists')
      .insert({
        user_id: req.user!.id,
        name: validated.name,
        description: validated.description,
        is_public: validated.is_public,
      })
      .select()
      .single();

    if (error) throw error;
    res.json({ data });
  } catch (error) {
    if (error instanceof zod.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.errors });
      return;
    }
    sendError(res, error);
  }
});

app.put('/api/playlists/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const validated = playlistUpdateSchema.parse(req.body);
    const { data: playlist, error: fetchError } = await supabase.from('music_playlists').select('user_id').eq('id', id).single();
    if (fetchError || playlist.user_id !== req.user!.id) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const { data, error } = await supabase.from('music_playlists').update(validated).eq('id', id).select().single();
    if (error) throw error;
    res.json({ data });
  } catch (error) {
    if (error instanceof zod.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.errors });
      return;
    }
    sendError(res, error);
  }
});

app.delete('/api/playlists/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { data: playlist, error: fetchError } = await supabase.from('music_playlists').select('user_id').eq('id', id).single();
    if (fetchError || playlist.user_id !== req.user!.id) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const { error } = await supabase.from('music_playlists').delete().eq('id', id);
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/playlists/:id/tracks', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = req.params;
    const { track_id } = trackMutationSchema.parse(req.body);
    const { data: playlist, error: fetchError } = await supabase
      .from('music_playlists')
      .select('user_id, tracks_count')
      .eq('id', id)
      .single();

    if (fetchError || playlist.user_id !== req.user!.id) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const { data: maxPosition } = await supabase
      .from('music_playlist_tracks')
      .select('position')
      .eq('playlist_id', id)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data, error } = await supabase
      .from('music_playlist_tracks')
      .insert({
        playlist_id: id,
        track_id,
        user_id: req.user!.id,
        position: (maxPosition?.position || 0) + 1,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        res.status(400).json({ error: 'Track already in playlist' });
        return;
      }
      throw error;
    }

    await supabase.from('music_playlists').update({ tracks_count: (playlist.tracks_count || 0) + 1 }).eq('id', id);
    res.json({ data });
  } catch (error) {
    if (error instanceof zod.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.errors });
      return;
    }
    sendError(res, error);
  }
});

app.delete('/api/playlists/:id/tracks/:trackId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { id, trackId } = req.params;
    const { data: playlist, error: fetchError } = await supabase
      .from('music_playlists')
      .select('user_id, tracks_count')
      .eq('id', id)
      .single();

    if (fetchError || playlist.user_id !== req.user!.id) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const { error } = await supabase.from('music_playlist_tracks').delete().eq('playlist_id', id).eq('track_id', trackId);
    if (error) throw error;

    await supabase.rpc('reorder_playlist_tracks', { p_playlist_id: id });
    await supabase.from('music_playlists').update({ tracks_count: Math.max(0, (playlist.tracks_count || 1) - 1) }).eq('id', id);
    res.json({ success: true });
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/likes', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { data, error } = await supabase
      .from('music_likes')
      .select(`
        id, created_at,
        music_tracks(
          id, title, duration_ms, preview_url, audio_url,
          artist:music_artists(name),
          album:music_albums(cover_url, title)
        )
      `)
      .eq('user_id', req.user!.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ data });
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/likes', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { track_id } = trackMutationSchema.parse(req.body);
    const { data, error } = await supabase.from('music_likes').insert({ user_id: req.user!.id, track_id }).select().single();

    if (error) {
      if (error.code === '23505') {
        res.status(400).json({ error: 'Already liked' });
        return;
      }
      throw error;
    }

    res.json({ data });
  } catch (error) {
    if (error instanceof zod.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.errors });
      return;
    }
    sendError(res, error);
  }
});

app.delete('/api/likes/:trackId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { trackId } = req.params;
    const { error } = await supabase.from('music_likes').delete().eq('user_id', req.user!.id).eq('track_id', trackId);
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/downloads', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { data, error } = await supabase
      .from('music_downloads')
      .select('id, track_id, downloaded_at, file_path, expires_at')
      .eq('user_id', req.user!.id)
      .order('downloaded_at', { ascending: false });

    if (error) throw error;
    res.json({ data });
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/downloads', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { track_id } = trackMutationSchema.parse(req.body);
    const { data, error } = await supabase
      .from('music_downloads')
      .upsert({
        user_id: req.user!.id,
        track_id,
        file_path: `cache:${track_id}`,
        downloaded_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    res.json({ data });
  } catch (error) {
    if (error instanceof zod.ZodError) {
      res.status(400).json({ error: 'Validation failed', details: error.errors });
      return;
    }
    sendError(res, error);
  }
});

app.delete('/api/downloads/:trackId', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { trackId } = req.params;
    const { error } = await supabase.from('music_downloads').delete().eq('user_id', req.user!.id).eq('track_id', trackId);
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/subscription', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { data, error } = await supabase
      .from('music_subscriptions')
      .select('*')
      .eq('user_id', req.user!.id)
      .order('created_at', { ascending: false })
      .maybeSingle();

    if (error) throw error;
    res.json({ data });
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/artists', async (req, res) => {
  try {
    const limit = Number(req.query.limit || 20);
    const page = Number(req.query.page || 1);
    const offset = (page - 1) * limit;
    const { data, count, error } = await supabase
      .from('music_artists')
      .select('*', { count: 'exact' })
      .order('followers_count', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    res.json({ data, pagination: { page, limit, total: count || 0 } });
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/albums', async (req, res) => {
  try {
    const limit = Number(req.query.limit || 20);
    let query = supabase
      .from('music_albums')
      .select(`
        id, title, cover_url, release_date, album_type,
        artist:music_artists(name)
      `)
      .order('release_date', { ascending: false })
      .limit(limit);

    if (typeof req.query.artist === 'string' && req.query.artist) {
      query = query.eq('artist_id', req.query.artist);
    }

    const { data, error } = await query;
    if (error) throw error;
    res.json({ data });
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/recommendations', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const limit = Number(req.query.limit || 20);
    const { data, error } = await supabase.rpc('get_music_recommendations', {
      p_user_id: req.user!.id,
      p_limit: limit,
    });

    if (error) throw error;
    res.json({ data });
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/search', async (req, res) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const type = typeof req.query.type === 'string' ? req.query.type : 'track';
    const limit = Number(req.query.limit || 20);

    if (!q) {
      res.status(400).json({ error: 'Query parameter "q" is required' });
      return;
    }

    if (type === 'track') {
      res.json({ data: await searchTrackRows(q, limit) });
      return;
    }

    if (type === 'artist') {
      const { data, error } = await supabase.from('music_artists').select('*').ilike('name', `%${q}%`).limit(limit);
      if (error) throw error;
      res.json({ data });
      return;
    }

    if (type === 'album') {
      const { data, error } = await supabase.from('music_albums').select('*').ilike('title', `%${q}%`).limit(limit);
      if (error) throw error;
      res.json({ data });
      return;
    }

    res.status(400).json({ error: 'Invalid search type' });
  } catch (error) {
    sendError(res, error);
  }
});

app.listen(PORT, () => {
  console.log(`Music API running on port ${PORT}`);
  console.log(`Health: http://localhost:${PORT}/health`);
});

export default app;
