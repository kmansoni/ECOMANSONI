import { useState, useCallback, useRef } from 'react';
import { ArrowLeft, Search, X, Plus, Building2, Phone, Globe, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LatLng } from '@/types/taxi';
import type { FiasAddress, POICategory } from '@/types/fias';
import { getPoiCategoryLabel, POI_CATEGORY_ICONS } from '@/types/fias';
import { suggestAddress, suggestOrganization, type OrganizationResult } from '@/lib/navigation/dadata';
import { addPOI } from '@/lib/navigation/places';
import { useUserSettings } from '@/contexts/UserSettingsContext';
import { navText } from '@/lib/navigation/navigationUi';

interface AddPlaceSheetProps {
  userId: string;
  onClose: () => void;
  onAdded?: (poiId: string) => void;
}

type Step = 'search' | 'manual' | 'confirm';

const CATEGORIES: POICategory[] = [
  'shop', 'cafe', 'restaurant', 'pharmacy', 'fuel', 'bank',
  'hospital', 'hotel', 'parking', 'car_wash', 'car_service',
  'beauty', 'gym', 'education', 'office', 'other',
];

export function AddPlaceSheet({ userId, onClose, onAdded }: AddPlaceSheetProps) {
  const { settings } = useUserSettings();
  const languageCode = settings?.language_code ?? null;
  const [step, setStep] = useState<Step>('search');
  const [query, setQuery] = useState('');
  const [orgResults, setOrgResults] = useState<OrganizationResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Manual form state
  const [name, setName] = useState('');
  const [category, setCategory] = useState<POICategory>('shop');
  const [address, setAddress] = useState('');
  const [addressCoords, setAddressCoords] = useState<LatLng | null>(null);
  const [fiasId, setFiasId] = useState<string | null>(null);
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [inn, setInn] = useState<string | null>(null);
  const [ogrn, setOgrn] = useState<string | null>(null);

  // Address suggestions for manual form
  const [addrQuery, setAddrQuery] = useState('');
  const [addrSuggestions, setAddrSuggestions] = useState<FiasAddress[]>([]);
  const [showAddrDropdown, setShowAddrDropdown] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const searchOrgs = useCallback(async (text: string) => {
    if (text.length < 2) {
      setOrgResults([]);
      return;
    }
    setLoading(true);
    try {
      const results = await suggestOrganization(text);
      setOrgResults(results);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleOrgInput = (value: string) => {
    setQuery(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchOrgs(value), 350);
  };

  const handleSelectOrg = (org: OrganizationResult) => {
    setName(org.name);
    setAddress(org.address || '');
    setAddrQuery(org.address || '');
    setPhone(org.phone || '');
    setInn(org.inn);
    setOgrn(org.ogrn);
    if (org.addressData) {
      setFiasId(org.addressData.fiasId);
      if (org.addressData.geoLat && org.addressData.geoLon) {
        setAddressCoords({ lat: org.addressData.geoLat, lng: org.addressData.geoLon });
      }
    }
    setStep('confirm');
  };

  const handleAddrInput = async (text: string) => {
    setAddrQuery(text);
    setAddress(text);
    if (text.length >= 3) {
      const results = await suggestAddress(text, 5);
      setAddrSuggestions(results);
      setShowAddrDropdown(true);
    } else {
      setAddrSuggestions([]);
      setShowAddrDropdown(false);
    }
  };

  const handleSelectAddr = (addr: FiasAddress) => {
    setAddress(addr.value);
    setAddrQuery(addr.value);
    setFiasId(addr.fiasId);
    if (addr.geoLat && addr.geoLon) {
      setAddressCoords({ lat: addr.geoLat, lng: addr.geoLon });
    }
    setShowAddrDropdown(false);
  };

  const handleSave = async () => {
    if (!name.trim() || !addressCoords) return;
    setSaving(true);
    try {
      const poiId = await addPOI({
        name: name.trim(),
        category,
        coordinates: addressCoords,
        address: address || undefined,
        phone: phone || undefined,
        website: website || undefined,
        fiasAddressId: fiasId || undefined,
        inn: inn || undefined,
        ogrn: ogrn || undefined,
        ownerId: userId,
      });
      if (poiId) onAdded?.(poiId);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="absolute inset-0 z-[960] bg-gray-950 flex flex-col">
      {/* Header */}
      <div className="p-3 pt-safe border-b border-white/10 flex items-center gap-2">
        <button onClick={step === 'search' ? onClose : () => setStep('search')} className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-white/5">
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>
        <h2 className="text-white font-semibold text-sm">
          {step === 'search' ? navText('Добавить место', 'Add place', languageCode) : step === 'manual' ? navText('Новое место', 'New place', languageCode) : navText('Подтверждение', 'Confirm', languageCode)}
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Step: Search organization */}
        {step === 'search' && (
          <div className="p-4">
            {/* Search box */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                placeholder={navText('Найти организацию по ИНН или названию...', 'Find a business by tax ID or name...', languageCode)}
                value={query}
                onChange={(e) => handleOrgInput(e.target.value)}
                className={cn(
                  'w-full h-11 pl-10 pr-10 rounded-xl',
                  'bg-gray-800/80 border border-white/10',
                  'text-white placeholder:text-gray-500',
                  'text-sm focus:outline-none focus:border-blue-500/50'
                )}
              />
              {query && (
                <button onClick={() => { setQuery(''); setOrgResults([]); }} className="absolute right-3 top-1/2 -translate-y-1/2">
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              )}
            </div>

            {/* Manual entry button */}
            <button
              onClick={() => setStep('manual')}
              className={cn(
                'w-full flex items-center gap-3 py-3 px-4 rounded-xl mb-4',
                'bg-blue-500/10 border border-blue-500/20',
                'hover:bg-blue-500/20 transition-colors'
              )}
            >
              <Plus className="w-5 h-5 text-blue-400" />
              <div className="text-left">
                <p className="text-sm text-blue-400 font-medium">{navText('Добавить вручную', 'Add manually', languageCode)}</p>
                <p className="text-xs text-gray-500">{navText('Название, категория, адрес', 'Name, category, address', languageCode)}</p>
              </div>
            </button>

            {/* Loading */}
            {loading && (
              <div className="flex items-center justify-center py-6">
                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {/* Org results */}
            {orgResults.map((org, i) => (
              <button
                key={org.inn ?? `org-${i}`}
                onClick={() => handleSelectOrg(org)}
                className="w-full flex items-center gap-3 py-3 px-2 rounded-lg hover:bg-white/5 transition-colors"
              >
                <Building2 className="w-4 h-4 text-purple-400 shrink-0" />
                <div className="min-w-0 text-left flex-1">
                  <p className="text-sm text-white truncate">{org.name}</p>
                  {org.address && <p className="text-xs text-gray-500 truncate">{org.address}</p>}
                  <div className="flex items-center gap-2 mt-0.5">
                    {org.inn && <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">TIN: {org.inn}</span>}
                    {org.phone && <span className="text-[10px] text-gray-500">{org.phone}</span>}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Step: Manual entry */}
        {(step === 'manual' || step === 'confirm') && (
          <div className="p-4 space-y-4">
            {/* Name */}
            <div>
              <label className="text-xs text-gray-400 mb-1 block">{navText('Название', 'Name', languageCode)} *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={navText('Магазин «Продукты»', 'Corner store', languageCode)}
                className={cn(
                  'w-full h-11 px-4 rounded-xl',
                  'bg-gray-800/80 border border-white/10',
                  'text-white placeholder:text-gray-500',
                  'text-sm focus:outline-none focus:border-blue-500/50'
                )}
              />
            </div>

            {/* Category */}
            <div>
              <label className="text-xs text-gray-400 mb-1 block">{navText('Категория', 'Category', languageCode)}</label>
              <div className="grid grid-cols-4 gap-1.5">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setCategory(cat)}
                    className={cn(
                      'flex flex-col items-center gap-1 py-2 px-1 rounded-lg text-[10px] transition-colors',
                      category === cat
                        ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                        : 'bg-gray-800/50 text-gray-400 border border-transparent hover:bg-gray-700/50'
                    )}
                  >
                    <span className="text-base">{POI_CATEGORY_ICONS[cat]}</span>
                    <span className="truncate w-full text-center">{getPoiCategoryLabel(cat, languageCode)}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Address with FIAS autocomplete */}
            <div className="relative">
              <label className="text-xs text-gray-400 mb-1 block">{navText('Адрес', 'Address', languageCode)} *</label>
              <input
                type="text"
                value={addrQuery}
                onChange={(e) => handleAddrInput(e.target.value)}
                onFocus={() => addrSuggestions.length > 0 && setShowAddrDropdown(true)}
                placeholder={navText('Начните вводить адрес...', 'Start typing the address...', languageCode)}
                className={cn(
                  'w-full h-11 px-4 rounded-xl',
                  'bg-gray-800/80 border border-white/10',
                  'text-white placeholder:text-gray-500',
                  'text-sm focus:outline-none focus:border-blue-500/50'
                )}
              />
              {showAddrDropdown && addrSuggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-gray-800 border border-white/10 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                  {addrSuggestions.map((addr, i) => (
                    <button
                      key={addr.fiasId ?? `a-${i}`}
                      onClick={() => handleSelectAddr(addr)}
                      className="w-full text-left px-3 py-2.5 hover:bg-white/5 transition-colors"
                    >
                      <p className="text-sm text-white truncate">{addr.value}</p>
                      {addr.postalCode && <span className="text-[10px] text-gray-500">{addr.postalCode}</span>}
                    </button>
                  ))}
                </div>
              )}
              {addressCoords && (
                <p className="text-[10px] text-green-400 mt-1">
                  {navText('Coordinates', 'Coordinates', languageCode)}: {addressCoords.lat.toFixed(6)}, {addressCoords.lng.toFixed(6)}
                  {fiasId && <span className="text-gray-500 ml-2">FIAS: {fiasId.substring(0, 8)}...</span>}
                </p>
              )}
            </div>

            {/* Phone */}
            <div>
              <label className="text-xs text-gray-400 mb-1 block">{navText('Телефон', 'Phone', languageCode)}</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+7 (999) 123-45-67"
                  className={cn(
                    'w-full h-11 pl-10 pr-4 rounded-xl',
                    'bg-gray-800/80 border border-white/10',
                    'text-white placeholder:text-gray-500',
                    'text-sm focus:outline-none focus:border-blue-500/50'
                  )}
                />
              </div>
            </div>

            {/* Website */}
            <div>
              <label className="text-xs text-gray-400 mb-1 block">{navText('Сайт', 'Website', languageCode)}</label>
              <div className="relative">
                <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <input
                  type="url"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://example.com"
                  className={cn(
                    'w-full h-11 pl-10 pr-4 rounded-xl',
                    'bg-gray-800/80 border border-white/10',
                    'text-white placeholder:text-gray-500',
                    'text-sm focus:outline-none focus:border-blue-500/50'
                  )}
                />
              </div>
            </div>

            {/* INN/OGRN (if from org search) */}
            {(inn || ogrn) && (
              <div className="flex gap-2">
                {inn && (
                  <div className="flex-1 px-3 py-2 bg-gray-800/50 rounded-lg">
                    <p className="text-[10px] text-gray-500">TIN</p>
                    <p className="text-xs text-white">{inn}</p>
                  </div>
                )}
                {ogrn && (
                  <div className="flex-1 px-3 py-2 bg-gray-800/50 rounded-lg">
                    <p className="text-[10px] text-gray-500">OGRN</p>
                    <p className="text-xs text-white">{ogrn}</p>
                  </div>
                )}
              </div>
            )}

            {/* Save button */}
            <button
              onClick={handleSave}
              disabled={!name.trim() || !addressCoords || saving}
              className={cn(
                'w-full h-12 rounded-xl font-bold text-sm',
                'flex items-center justify-center gap-2',
                'transition-all active:scale-[0.98]',
                name.trim() && addressCoords && !saving
                  ? 'bg-green-500 hover:bg-green-600 text-white shadow-lg shadow-green-500/30'
                  : 'bg-gray-700 text-gray-500 cursor-not-allowed'
              )}
            >
              {saving ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Plus className="w-5 h-5" />
                  {navText('Добавить место', 'Add place', languageCode)}
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
