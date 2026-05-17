import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Store, Key, ExternalLink, CheckCircle, AlertCircle } from 'lucide-react';
import { useMarketplace } from '@/hooks/useMarketplace';
import { toast } from 'sonner';

const MARKETPLACES = [
  {
    type: 'ozon',
    name: 'Ozon',
    description: 'Крупнейшая торговая площадка России',
    icon: '🟢',
    color: 'bg-emerald-500',
    apiKeyUrl: 'https://seller.ozon.ru/settings/apikeys',
  },
  {
    type: 'wildberries',
    name: 'Wildberries',
    description: 'Ведущая модная площадка',
    icon: '🔵',
    color: 'bg-blue-500',
    apiKeyUrl: 'https://seller.wildberries.ru/lk/settings/api-keys',
  },
  {
    type: 'amazon',
    name: 'Amazon',
    description: 'Глобальная площадка',
    icon: '🟠',
    color: 'bg-orange-500',
    apiKeyUrl: 'https://sellercentral.amazon.com/gp/settings',
  },
  {
    type: 'yandex',
    name: 'Яндекс Маркет',
    description: 'Поисковая выдача и Маркет',
    icon: '🔴',
    color: 'bg-red-500',
    apiKeyUrl: 'https://partner.market.yandex.ru/',
  },
];

export default function MarketplaceConnectPage() {
  const navigate = useNavigate();
  const { createConnection, connections } = useMarketplace();
  
  const [selectedMarketplace, setSelectedMarketplace] = useState<string | null>(null);
  const [sellerId, setSellerId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [sellerName, setSellerName] = useState('');
  const [apiUrl, setApiUrl] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnect = async () => {
    if (!selectedMarketplace || !apiKey.trim()) {
      toast.error('Заполните все обязательные поля');
      return;
    }

    setIsConnecting(true);
    try {
      const result = await createConnection({
        marketplace_type: selectedMarketplace as any,
        seller_id: sellerId || `seller-${Date.now()}`,
        seller_name: sellerName || selectedMarketplace,
        api_key: apiKey,
        api_url: apiUrl || undefined,
      });

      if (result) {
        toast.success(`${selectedMarketplace} успешно подключён`);
        navigate('/marketplace');
      }
    } catch (error) {
      toast.error('Ошибка подключения к маркетплейсу');
    } finally {
      setIsConnecting(false);
    }
  };

  const isConnected = (type: string) => 
    connections.some(c => c.marketplace_type === type && c.is_active);

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="px-4 py-6 max-w-2xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => navigate('/marketplace')}
            className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            Назад
          </button>
          <h1 className="text-2xl font-bold">Подключение маркетплейса</h1>
        </div>

        <div className="space-y-4 mb-6">
          <h2 className="text-lg font-semibold">Выберите площадку</h2>
          <div className="grid gap-3">
            {MARKETPLACES.map((mp) => {
              const connected = isConnected(mp.type);
              return (
                <motion.button
                  key={mp.type}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setSelectedMarketplace(mp.type)}
                  disabled={connected}
                  className={`flex items-center gap-4 p-4 rounded-2xl border ${
                    selectedMarketplace === mp.type 
                      ? 'border-blue-500 bg-blue-500/10' 
                      : 'border-zinc-800 bg-zinc-900 hover:bg-zinc-800'
                  } transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <div className={`w-12 h-12 ${mp.color} rounded-xl flex items-center justify-center text-xl`}>
                    {mp.icon}
                  </div>
                  <div className="flex-1 text-left">
                    <h3 className="font-semibold">{mp.name}</h3>
                    <p className="text-sm text-zinc-400">{mp.description}</p>
                  </div>
                  {connected && (
                    <CheckCircle className="w-5 h-5 text-green-400" />
                  )}
                </motion.button>
              );
            })}
          </div>
        </div>

        {selectedMarketplace && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <h2 className="text-lg font-semibold">Настройки подключения</h2>
            
            <div className="bg-zinc-900 rounded-2xl p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">API ключ</label>
                <div className="relative">
                  <Key className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Введите API ключ"
                    className="w-full bg-zinc-800 text-white placeholder-zinc-500 rounded-xl pl-10 pr-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">ID продавца</label>
                <input
                  type="text"
                  value={sellerId}
                  onChange={(e) => setSellerId(e.target.value)}
                  placeholder="Оставьте пустым для автоматического определения"
                  className="w-full bg-zinc-800 text-white placeholder-zinc-500 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Название магазина</label>
                <input
                  type="text"
                  value={sellerName}
                  onChange={(e) => setSellerName(e.target.value)}
                  placeholder="Название вашего магазина"
                  className="w-full bg-zinc-800 text-white placeholder-zinc-500 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">URL API (опционально)</label>
                <input
                  type="text"
                  value={apiUrl}
                  onChange={(e) => setApiUrl(e.target.value)}
                  placeholder="https://api.example.com"
                  className="w-full bg-zinc-800 text-white placeholder-zinc-500 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-3">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-blue-400 mt-0.5" />
                  <div className="text-sm text-zinc-300">
                    <p className="mb-1">Где взять API ключ:</p>
                    <a
                      href={MARKETPLACES.find(m => m.type === selectedMarketplace)?.apiKeyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:underline inline-flex items-center gap-1"
                    >
                      Перейти в настройки API
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={handleConnect}
              disabled={isConnecting || !apiKey.trim()}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-2xl font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isConnecting ? 'Подключение...' : 'Подключить маркетплейс'}
            </button>
          </motion.div>
        )}
      </div>
    </div>
  );
}