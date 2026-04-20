import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import * as zod from 'zod';

const app = express();
const PORT = process.env.PORT || 3080;

// ============ MIDDLEWARE ============

// Security
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https://*.supabase.co", "https://*.amazonaws.com"],
    },
  },
}));

// CORS — allow Mansoni frontend and music-frontend dev
app.use(cors({
  origin: (origin, callback) => {
    const allowed = [
      process.env.MANSONI_URL,
      process.env.MUSIC_FRONTEND_URL,
      'http://localhost:5173',
      'http://localhost:3001',
    ].filter(Boolean);
    
    if (!origin || allowed.some(a => origin.startsWith(a))) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests',
});
app.use('/api/', limiter);

// ============ SUPABASE ============

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ============ JWT AUTH MIDDLEWARE ============

// Verify Mansoni JWT (shared secret)
function verifyMansoniToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  
  if (!token) {
    // Try from query param (for iframe)
    const tokenFromQuery = req.query.token as string;
    if (tokenFromQuery) {
      req.user = verifyToken(tokenFromQuery);
      return next();
    }
    
    return res.status(401).json({ error: 'No token provided' });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  req.user = decoded;
  next();
}

function verifyToken(token: string): any {
  try {
    return jwt.verify(token, process.env.MANSONI_JWT_SECRET!);
  } catch {
    return null;
  }
}

// ============ ROUTES ============

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'music-api', timestamp: new Date().toISOString() });
});

// ============ TRACKS ============

// GET /api/tracks — list all tracks (public)
app.get('/api/tracks', async (req, res) => {
  try {
    const { page = 1, limit = 20, artist, search } = req.query;
    
    let query = supabase
      .from('music_tracks')
      .select(`
        id, title, duration_ms, explicit, play_count, created_at,
        music_artists(name, image_url),
        music_albums(title, cover_url)
      `, { count: 'exact' })
      .order('play_count', { ascending: false })
      .range((Number(page) - 1) * Number(limit), Number(page) * Number(limit) - 1);

    if (search) {
      query = query.ilike('title', `%${search}%`);
    }
    if (artist) {
      query = query.eq('artist_id', artist);
    }

    const { data, error, count } = await query;

    if (error) throw error;
    res.json({ 
      data, 
      pagination: { page: Number(page), limit: Number(limit), total: count || 0 }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/tracks/:id — single track
app.get('/api/tracks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const { data, error } = await supabase
      .from('music_tracks')
      .select(`
        id, title, duration_ms, explicit, preview_url, audio_url, waveform_data,
        music_artists(id, name, image_url, genres),
        music_albums(id, title, cover_url, release_date)
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    
    // Record play if user is authenticated
    if (req.user) {
      await supabase.rpc('record_track_play', {
        p_user_id: req.user.id,
        p_track_id: id,
        p_device: 'web',
      });
    }

    res.json({ data });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============ STREAMING ============

// GET /api/stream/:id — get streaming URL (signed)
app.get('/api/stream/:id', verifyMansoniToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get track
    const { data: track, error } = await supabase
      .from('music_tracks')
      .select('id, title, audio_url')
      .eq('id', id)
      .single();

    if (error || !track) {
      return res.status(404).json({ error: 'Track not found' });
    }

    // Generate signed URL (if using Supabase Storage)
    // For now, return public URL (configure signed URLs in production)
    res.json({ 
      url: track.audio_url,
      track: { id: track.id, title: track.title }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============ PLAYLISTS ============

// GET /api/playlists — user's playlists
app.get('/api/playlists', verifyMansoniToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('music_playlists')
      .select('*')
      .eq('user_id', req.user.id)
      .order('updated_at', { ascending: false });

    if (error) throw error;
    res.json({ data });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/playlists/:id — playlist with tracks
app.get('/api/playlists/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const { data: playlist, error } = await supabase
      .from('music_playlists')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;

    // Check if user owns playlist or it's public
    const isOwner = req.user && playlist.user_id === req.user.id;
    if (!playlist.is_public && !isOwner) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get tracks with positions
    const { data: tracks, error: tracksError } = await supabase
      .from('music_playlist_tracks')
      .select(`
        id, position, added_at,
        music_tracks(
          id, title, duration_ms,
          music_artists(name),
          music_albums(cover_url)
        )
      `)
      .eq('playlist_id', id)
      .order('position', { ascending: true });

    if (tracksError) throw tracksError;

    res.json({ 
      data: { ...playlist, tracks: tracks?.map(t => ({
        id: t.id,
        position: t.position,
        added_at: t.added_at,
        track: t.music_tracks
      })) }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/playlists — create playlist
app.post('/api/playlists', verifyMansoniToken, async (req, res) => {
  try {
    const schema = zod.object({
      name: zod.string().min(1).max(200),
      description: zod.string().optional(),
      is_public: zod.boolean().default(false),
    });

    const validated = schema.parse(req.body);

    const { data, error } = await supabase
      .from('music_playlists')
      .insert({
        user_id: req.user.id,
        name: validated.name,
        description: validated.description,
        is_public: validated.is_public,
      })
      .select()
      .single();

    if (error) throw error;
    res.json({ data });
  } catch (error: any) {
    if (error instanceof zod.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/playlists/:id — update playlist
app.put('/api/playlists/:id', verifyMansoniToken, async (req, res) => {
  try {
    const { id } = req.params;
    const schema = zod.object({
      name: zod.string().min(1).max(200).optional(),
      description: zod.string().optional(),
      is_public: zod.boolean().optional(),
    });

    const validated = schema.parse(req.body);

    // Check ownership
    const { data: playlist, error: fetchError } = await supabase
      .from('music_playlists')
      .select('user_id')
      .eq('id', id)
      .single();

    if (fetchError || playlist.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { data, error } = await supabase
      .from('music_playlists')
      .update(validated)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json({ data });
  } catch (error: any) {
    if (error instanceof zod.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/playlists/:id
app.delete('/api/playlists/:id', verifyMansoniToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Check ownership
    const { data: playlist, error: fetchError } = await supabase
      .from('music_playlists')
      .select('user_id')
      .eq('id', id)
      .single();

    if (fetchError || playlist.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Delete playlist (cascade will remove tracks)
    const { error } = await supabase
      .from('music_playlists')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/playlists/:id/tracks — add track to playlist
app.post('/api/playlists/:id/tracks', verifyMansoniToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { track_id } = req.body;

    // Check playlist ownership
    const { data: playlist, error: fetchError } = await supabase
      .from('music_playlists')
      .select('user_id, tracks_count')
      .eq('id', id)
      .single();

    if (fetchError || playlist.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Find max position
    const { data: maxPos } = await supabase
      .from('music_playlist_tracks')
      .select('position')
      .eq('playlist_id', id)
      .order('position', { ascending: false })
      .limit(1)
      .single();

    const position = (maxPos?.position || 0) + 1;

    // Insert
    const { data, error } = await supabase
      .from('music_playlist_tracks')
      .insert({
        playlist_id: id,
        track_id,
        user_id: req.user.id,
        position,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') { // unique violation
        return res.status(400).json({ error: 'Track already in playlist' });
      }
      throw error;
    }

    // Update playlist track count
    await supabase
      .from('music_playlists')
      .update({ tracks_count: (playlist.tracks_count || 0) + 1 })
      .eq('id', id);

    res.json({ data });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/playlists/:id/tracks/:trackId
app.delete('/api/playlists/:id/tracks/:trackId', verifyMansoniToken, async (req, res) => {
  try {
    const { id, trackId } = req.params;

    // Check ownership
    const { data: playlist, error: fetchError } = await supabase
      .from('music_playlists')
      .select('user_id, tracks_count')
      .eq('id', id)
      .single();

    if (fetchError || playlist.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Delete track from playlist
    const { error } = await supabase
      .from('music_playlist_tracks')
      .delete()
      .eq('playlist_id', id)
      .eq('track_id', trackId);

    if (error) throw error;

    // Reorder positions
    await supabase.rpc('reorder_playlist_tracks', { playlist_id: id });

    // Update count
    await supabase
      .from('music_playlists')
      .update({ tracks_count: Math.max(0, (playlist.tracks_count || 1) - 1) })
      .eq('id', id);

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============ LIKES ============

// POST /api/likes — like a track
app.post('/api/likes', verifyMansoniToken, async (req, res) => {
  try {
    const { track_id } = req.body;
    
    const { data, error } = await supabase
      .from('music_likes')
      .insert({
        user_id: req.user.id,
        track_id,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return res.status(400).json({ error: 'Already liked' });
      }
      throw error;
    }

    res.json({ data });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/likes/:trackId — unlike
app.delete('/api/likes/:trackId', verifyMansoniToken, async (req, res) => {
  try {
    const { trackId } = req.params;
    
    const { error } = await supabase
      .from('music_likes')
      .delete()
      .eq('user_id', req.user.id)
      .eq('track_id', trackId);

    if (error) throw error;
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/likes — user's liked tracks
app.get('/api/likes', verifyMansoniToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('music_likes')
      .select(`
        id, created_at,
        music_tracks(
          id, title, duration_ms,
          music_artists(name),
          music_albums(cover_url)
        )
      `)
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ data });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============ ARTISTS & ALBUMS ============

// GET /api/artists — list artists
app.get('/api/artists', async (req, res) => {
  try {
    const { limit = 20, page = 1 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    const { data, count } = await supabase
      .from('music_artists')
      .select('*', { count: 'exact' })
      .order('followers_count', { ascending: false })
      .range(offset, offset + Number(limit) - 1);

    res.json({ data, pagination: { page: Number(page), limit: Number(limit), total: count || 0 } });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/albums — list albums
app.get('/api/albums', async (req, res) => {
  try {
    const { artist, limit = 20 } = req.query;
    let query = supabase
      .from('music_albums')
      .select(`
        id, title, cover_url, release_date, album_type,
        music_artists(name)
      `)
      .order('release_date', { ascending: false })
      .limit(Number(limit));

    if (artist) query = query.eq('artist_id', artist);

    const { data, error } = await query;
    if (error) throw error;
    res.json({ data });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============ RECOMMENDATIONS ============

// GET /api/recommendations — personalized (using RLS)
app.get('/api/recommendations', verifyMansoniToken, async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    
    // Call the database function
    const { data, error } = await supabase.rpc('get_music_recommendations', {
      p_user_id: req.user.id,
      p_limit: Number(limit),
    });

    if (error) throw error;
    res.json({ data });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============ SEARCH ============

// GET /api/search — search across tracks, artists, albums
app.get('/api/search', async (req, res) => {
  try {
    const { q, type = 'track', limit = 20 } = req.query;
    
    if (!q) {
      return res.status(400).json({ error: 'Query parameter "q" is required' });
    }

    if (type === 'track') {
      const { data, error } = await supabase
        .from('music_tracks')
        .select(`
          id, title, duration_ms,
          music_artists(name),
          music_albums(cover_url)
        `)
        .or(`title.ilike.%${q}%,music_artists.name.ilike.%${q}%`)
        .limit(Number(limit));

      if (error) throw error;
      res.json({ data });
    } else if (type === 'artist') {
      const { data, error } = await supabase
        .from('music_artists')
        .select('*')
        .ilike('name', `%${q}%`)
        .limit(Number(limit));

      if (error) throw error;
      res.json({ data });
    } else {
      res.status(400).json({ error: 'Invalid search type' });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============ START SERVER ============

app.listen(PORT, () => {
  console.log(`🎵 Music API running on port ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  if (process.env.NODE_ENV === 'development') {
    console.log(`   CORS allowed: http://localhost:5173, http://localhost:3001`);
  }
});

export default app;
