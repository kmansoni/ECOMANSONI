import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ArrowLeft, Camera, Loader2, User } from 'lucide-react';
import { uploadMedia } from '@/lib/mediaUpload';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import { supabase } from '@/integrations/supabase/client';
import { AvatarPresetPicker } from '@/components/profile/AvatarPresetPicker';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';

function normalizeUsernameInput(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^@+/, '')
    .replace(/[^a-z0-9_]/g, '');
}

export function EditProfilePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profile, loading: profileLoading, updateProfile } = useProfile();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [bio, setBio] = useState('');
  const [website, setWebsite] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Initialize form when profile loads
  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name || '');
      setUsername(profile.username || '');
      setBio(profile.bio || '');
      setWebsite(profile.website || '');
      setAvatarUrl(profile.avatar_url || '');
    }
  }, [profile]);

  useEffect(() => {
    const normalizedCurrent = normalizeUsernameInput(username);
    const normalizedOwn = normalizeUsernameInput(profile?.username || '');

    if (!user?.id) {
      setUsernameStatus('idle');
      return;
    }

    if (!normalizedCurrent || normalizedCurrent === normalizedOwn) {
      setUsernameStatus('idle');
      if (usernameError === 'Этот никнейм уже занят') {
        setUsernameError('');
      }
      return;
    }

    if (normalizedCurrent.length < 3 || normalizedCurrent.length > 30 || !/^[a-z0-9_]+$/.test(normalizedCurrent)) {
      setUsernameStatus('idle');
      return;
    }

    const timer = setTimeout(() => {
      const run = async () => {
        try {
          setUsernameStatus('checking');
          const { data: existing, error } = await supabase
            .from('profiles')
            .select('user_id')
            .eq('username', normalizedCurrent)
            .neq('user_id', user.id)
            .limit(1)
            .maybeSingle();

          if (error) throw error;

          if (existing) {
            setUsernameStatus('taken');
            setUsernameError('Этот никнейм уже занят');
          } else {
            setUsernameStatus('available');
            if (usernameError === 'Этот никнейм уже занят') {
              setUsernameError('');
            }
          }
        } catch (err) {
          logger.warn('[EditProfilePage] Username availability check failed', { error: err });
          setUsernameStatus('idle');
        }
      };

      void run();
    }, 300);

    return () => clearTimeout(timer);
  }, [profile?.username, user?.id, username, usernameError]);

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    try {
      setUploading(true);

      // Create unique filename
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}-${Date.now()}.${fileExt}`;
      const filePath = `avatars/${fileName}`;

      // Upload to media server
      const uploadResult = await uploadMedia(file, { bucket: 'post-media' });
      setAvatarUrl(uploadResult.url);
      toast.success('Фото загружено');
    } catch (err) {
      logger.error('[EditProfilePage] Upload error', { error: err });
      toast.error('Не удалось загрузить фото');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    const trimmedUsername = normalizeUsernameInput(username);
    if (trimmedUsername && (trimmedUsername.length < 3 || trimmedUsername.length > 30)) {
      setUsernameError('От 3 до 30 символов');
      return;
    }
    if (trimmedUsername && !/^[a-z0-9_]+$/.test(trimmedUsername)) {
      setUsernameError('Только латинские буквы, цифры и _');
      return;
    }
    if (usernameStatus === 'taken') {
      setUsernameError('Этот никнейм уже занят');
      return;
    }
    setUsernameError('');

    try {
      setSaving(true);

      if (trimmedUsername && trimmedUsername !== profile?.username) {
        const { data: existing } = await supabase
          .from('profiles')
          .select('user_id')
          .eq('username', trimmedUsername)
          .neq('user_id', user!.id)
          .limit(1)
          .maybeSingle();
        if (existing) {
          setUsernameError('Этот никнейм уже занят');
          setSaving(false);
          return;
        }
      }

      await updateProfile({
        display_name: displayName.trim() || null,
        username: trimmedUsername || null,
        bio: bio.trim() || null,
        website: website.trim() || null,
        avatar_url: avatarUrl || null,
      });

      toast.success('Профиль обновлён');
      navigate(-1);
    } catch (err) {
      logger.error('[EditProfilePage] Save error', { error: err });
      toast.error('Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  if (profileLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b border-border" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="flex items-center justify-between px-4 h-14">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-lg font-semibold">Редактировать</h1>
          <Button 
            variant="ghost" 
            onClick={handleSave}
            disabled={saving || uploading}
            className="text-primary font-semibold px-3"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Сохранить'}
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Avatar */}
        <div className="flex justify-center pt-4">
          <div className="relative">
            <Avatar className="w-24 h-24 cursor-pointer" onClick={handleAvatarClick}>
              <AvatarImage src={avatarUrl} alt={displayName} />
              <AvatarFallback className="bg-muted">
                <User className="w-10 h-10 text-muted-foreground" />
              </AvatarFallback>
            </Avatar>
            <button
              onClick={handleAvatarClick}
              disabled={uploading}
              className="absolute bottom-0 right-0 p-2 rounded-full bg-primary text-primary-foreground shadow-lg"
            >
              {uploading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Camera className="w-4 h-4" />
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
        </div>

        <div className="space-y-3 rounded-2xl border border-border p-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Каталог аватаров</h3>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setAvatarUrl('')}
              disabled={uploading || saving}
            >
              Сбросить
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Мужские и женские наборы, включая анимированные варианты.
          </p>
          <AvatarPresetPicker selectedUrl={avatarUrl} onSelect={setAvatarUrl} />
        </div>

        {/* Display Name */}
        <div className="space-y-2">
          <Label htmlFor="displayName">Имя</Label>
          <Input
            id="displayName"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Ваше имя"
            maxLength={50}
            className="h-12 rounded-xl"
          />
        </div>

        {/* Username */}
        <div className="space-y-2">
          <Label htmlFor="username">Имя пользователя</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">@</span>
            <Input
              id="username"
              value={username}
              onChange={(e) => {
                setUsername(normalizeUsernameInput(e.target.value));
                setUsernameError('');
              }}
              placeholder="username"
              maxLength={30}
              className="h-12 rounded-xl pl-8"
            />
          </div>
          {usernameError && <p className="text-xs text-destructive">{usernameError}</p>}
          {!usernameError && usernameStatus === 'checking' && (
            <p className="text-xs text-muted-foreground">Проверяем никнейм...</p>
          )}
          {!usernameError && usernameStatus === 'available' && (
            <p className="text-xs text-green-600">Никнейм свободен</p>
          )}
          {!usernameError && usernameStatus === 'taken' && (
            <p className="text-xs text-destructive">Этот никнейм уже занят</p>
          )}
          <p className="text-xs text-muted-foreground">
            Латинские буквы, цифры и _ (от 3 до 30 символов)
          </p>
        </div>

        {/* Bio */}
        <div className="space-y-2">
          <Label htmlFor="bio">О себе</Label>
          <Textarea
            id="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Расскажите о себе..."
            rows={4}
            maxLength={150}
            className="rounded-xl resize-none"
          />
          <p className="text-xs text-muted-foreground text-right">
            {bio.length}/150
          </p>
        </div>

        {/* Website */}
        <div className="space-y-2">
          <Label htmlFor="website">Сайт</Label>
          <Input
            id="website"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="https://example.com"
            type="url"
            className="h-12 rounded-xl"
          />
        </div>
      </div>
    </div>
  );
}
