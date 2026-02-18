import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { X, Heart, Share2, ChevronLeft, ChevronRight, MapPin, Phone, MessageCircle, Train, Clock, Eye, CheckCircle, Percent, Copy, Search, Loader2, BedDouble, Square, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { PropertyMap } from "@/components/maps/PropertyMap";
import { supabase } from "@/lib/supabase";
import { Tables } from "@/integrations/supabase/types";

type Property = Tables<"properties"> & {
  property_images?: Tables<"property_images">[];
};

export function PropertyDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [property, setProperty] = useState<Property | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentImage, setCurrentImage] = useState(0);
  const [isFavorite, setIsFavorite] = useState(false);
  const [showGallery, setShowGallery] = useState(false);

  useEffect(() => {
    async function fetchProperty() {
      if (!id) return;
      
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("properties")
          .select(`
            *,
            property_images (*)
          `)
          .eq("id", id)
          .single();

        if (error) throw error;
        setProperty(data);
      } catch (error) {
        console.error("Error fetching property:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchProperty();
  }, [id]);

  const images = property?.property_images?.map(img => img.image_url) || 
    ["https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800&q=80"];

  const nextImage = () => {
    setCurrentImage((prev) => (prev + 1) % images.length);
  };

  const prevImage = () => {
    setCurrentImage((prev) => (prev - 1 + images.length) % images.length);
  };

  const formatPrice = (price: number, dealType: string) => {
    if (dealType === "rent") {
      return `${(price / 1000).toFixed(0)} тыс. ₽/мес`;
    }
    if (dealType === "daily") {
      return `${price.toLocaleString()} ₽/сут`;
    }
    if (price >= 1000000) {
      return `${(price / 1000000).toFixed(1)} млн ₽`;
    }
    return `${price.toLocaleString()} ₽`;
  };

  const getDealTypeLabel = (dealType: string) => {
    const labels: Record<string, string> = {
      sale: "Продажа",
      rent: "Аренда",
      daily: "Посуточно",
    };
    return labels[dealType] || dealType;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!property) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <p className="text-muted-foreground mb-4">Объект не найден</p>
        <Button onClick={() => navigate("/realestate")}>Вернуться к списку</Button>
      </div>
    );
  }

  // Gallery View
  if (showGallery) {
    return (
      <div className="fixed inset-0 z-[100] bg-black flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 safe-area-top">
          <span className="text-white text-lg font-medium">
            {currentImage + 1}/{images.length}
          </span>
          <div className="flex items-center gap-4">
            <button onClick={() => setIsFavorite(!isFavorite)}>
              <Heart className={cn("w-6 h-6", isFavorite ? "fill-red-500 text-red-500" : "text-white")} />
            </button>
            <button onClick={() => setShowGallery(false)}>
              <X className="w-6 h-6 text-white" />
            </button>
          </div>
        </div>

        {/* Image */}
        <div className="flex-1 flex items-center justify-center relative">
          <img
            src={images[currentImage]}
            alt=""
            className="max-w-full max-h-full object-contain"
          />
          {images.length > 1 && (
            <>
              <button
                onClick={prevImage}
                className="absolute left-4 w-10 h-10 bg-white/20 rounded-full flex items-center justify-center"
              >
                <ChevronLeft className="w-6 h-6 text-white" />
              </button>
              <button
                onClick={nextImage}
                className="absolute right-4 w-10 h-10 bg-white/20 rounded-full flex items-center justify-center"
              >
                <ChevronRight className="w-6 h-6 text-white" />
              </button>
            </>
          )}
        </div>

        {/* Bottom */}
        <div className="px-4 py-4 safe-area-bottom">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white font-bold text-lg">
                {formatPrice(Number(property.price), property.deal_type)}
              </p>
              <p className="text-white/70 text-sm">{property.title}</p>
            </div>
            <Button className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-full px-6">
              <Phone className="w-4 h-4 mr-2" />
              Позвонить
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const pricePerMeter = property.area_total 
    ? Math.round(Number(property.price) / Number(property.area_total)).toLocaleString()
    : null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-background border-b border-border">
        <div className="flex items-center justify-between px-4 py-3 safe-area-top">
          <button onClick={() => navigate("/realestate")}>
            <ChevronLeft className="w-6 h-6" />
          </button>
          <span className="font-medium text-sm truncate max-w-[200px]">{property.title}</span>
          <div className="flex items-center gap-3">
            <button>
              <Share2 className="w-5 h-5" />
            </button>
            <button onClick={() => setIsFavorite(!isFavorite)}>
              <Heart className={cn("w-5 h-5", isFavorite ? "fill-red-500 text-red-500" : "")} />
            </button>
          </div>
        </div>
      </div>

      {/* Image Gallery */}
      <div className="relative" onClick={() => setShowGallery(true)}>
        <div className="aspect-[4/3] bg-muted overflow-hidden">
          <img
            src={images[currentImage]}
            alt=""
            className="w-full h-full object-cover"
          />
        </div>
        {images.length > 1 && (
          <>
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
              {images.slice(0, 5).map((_, idx) => (
                <div
                  key={idx}
                  className={cn(
                    "w-2 h-2 rounded-full transition-all",
                    idx === currentImage ? "bg-white w-4" : "bg-white/50"
                  )}
                />
              ))}
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); prevImage(); }}
              className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/30 rounded-full flex items-center justify-center"
            >
              <ChevronLeft className="w-5 h-5 text-white" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); nextImage(); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 bg-black/30 rounded-full flex items-center justify-center"
            >
              <ChevronRight className="w-5 h-5 text-white" />
            </button>
          </>
        )}
      </div>

      {/* Badges */}
      <div className="px-4 py-3">
        <ScrollArea className="w-full">
          <div className="flex gap-2">
            <span className="flex-shrink-0 px-3 py-1.5 bg-primary text-primary-foreground text-sm font-medium rounded-full">
              {getDealTypeLabel(property.deal_type)}
            </span>
            {property.is_verified && (
              <span className="flex-shrink-0 px-3 py-1.5 bg-green-100 text-green-700 text-sm font-medium rounded-full flex items-center gap-1">
                <CheckCircle className="w-3.5 h-3.5" />
                Проверено
              </span>
            )}
            {property.is_from_owner && (
              <span className="flex-shrink-0 px-3 py-1.5 bg-muted text-foreground text-sm font-medium rounded-full">
                От собственника
              </span>
            )}
            {property.is_new_building && (
              <span className="flex-shrink-0 px-3 py-1.5 bg-primary/10 text-primary text-sm font-medium rounded-full">
                Новостройка
              </span>
            )}
          </div>
          <ScrollBar orientation="horizontal" className="invisible" />
        </ScrollArea>
      </div>

      {/* Price */}
      <div className="px-4 py-4 border-b border-border">
        {property.is_verified && (
          <div className="flex items-center gap-2 text-green-600 text-sm mb-2">
            <CheckCircle className="w-4 h-4" />
            <span>Проверенное объявление</span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">
              {formatPrice(Number(property.price), property.deal_type)}
            </h2>
            {pricePerMeter && (
              <p className="text-muted-foreground text-sm">{pricePerMeter} ₽/м²</p>
            )}
          </div>
          <button onClick={() => setIsFavorite(!isFavorite)}>
            <Heart className={cn("w-7 h-7", isFavorite ? "fill-red-500 text-red-500" : "text-muted-foreground")} />
          </button>
        </div>
      </div>

      {/* Specs */}
      <div className="px-4 py-4 border-b border-border">
        <h3 className="font-semibold mb-3">{property.title}</h3>
        <div className="grid grid-cols-3 gap-4">
          {property.area_total && (
            <div>
              <p className="text-xl font-bold">{property.area_total} м²</p>
              <p className="text-sm text-muted-foreground">общая пл.</p>
            </div>
          )}
          {property.area_kitchen && (
            <div>
              <p className="text-xl font-bold">{property.area_kitchen} м²</p>
              <p className="text-sm text-muted-foreground">кухня</p>
            </div>
          )}
          {property.floor && property.total_floors && (
            <div>
              <p className="text-xl font-bold">{property.floor} из {property.total_floors}</p>
              <p className="text-sm text-muted-foreground">этаж</p>
            </div>
          )}
          {property.rooms && (
            <div>
              <p className="text-xl font-bold">{property.rooms}</p>
              <p className="text-sm text-muted-foreground">комнат</p>
            </div>
          )}
        </div>
      </div>

      {/* Description */}
      {property.description && (
        <div className="px-4 py-4 border-b border-border">
          <h3 className="font-semibold mb-2">Описание</h3>
          <p className="text-sm text-muted-foreground">{property.description}</p>
        </div>
      )}

      {/* Features */}
      <div className="px-4 py-4 border-b border-border">
        <h3 className="font-semibold mb-3">Удобства</h3>
        <div className="flex flex-wrap gap-2">
          {property.has_balcony && (
            <span className="px-3 py-1.5 bg-muted rounded-full text-sm">Балкон</span>
          )}
          {property.has_parking && (
            <span className="px-3 py-1.5 bg-muted rounded-full text-sm">Парковка</span>
          )}
          {property.has_furniture && (
            <span className="px-3 py-1.5 bg-muted rounded-full text-sm">Мебель</span>
          )}
        </div>
      </div>

      {/* Location */}
      <div className="px-4 py-4 border-b border-border">
        <h3 className="font-semibold mb-3">Расположение</h3>
        <div className="flex items-start gap-2 mb-3">
          <MapPin className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium">{property.city}</p>
            {property.district && <p className="text-sm text-muted-foreground">{property.district}</p>}
            {property.address && <p className="text-sm text-muted-foreground">{property.address}</p>}
          </div>
          <button className="ml-auto">
            <Copy className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
        
        {/* Metro */}
        {property.metro_station && (
          <div className="flex items-center gap-2 mb-4">
            <div className="w-4 h-4 rounded-full bg-primary" />
            <span className="text-sm">м. {property.metro_station}</span>
          </div>
        )}

        {/* Map */}
        {property.latitude && property.longitude && (
          <>
            <div className="relative rounded-xl overflow-hidden mb-3 h-40">
              <PropertyMap 
                lat={Number(property.latitude)} 
                lng={Number(property.longitude)}
                address={property.title}
              />
            </div>
            <Button 
              variant="outline" 
              className="w-full rounded-xl"
              onClick={() => window.open(`https://yandex.ru/maps/?pt=${property.longitude},${property.latitude}&z=16&l=map`, '_blank')}
            >
              Построить маршрут
            </Button>
          </>
        )}
      </div>

      {/* Stats */}
      <div className="px-4 py-4 border-b border-border">
        <p className="text-sm text-muted-foreground flex items-center gap-1">
          <Eye className="w-4 h-4" />
          {property.views_count || 0} просмотров
        </p>
        <p className="text-sm text-muted-foreground">
          Опубликовано: {new Date(property.created_at).toLocaleDateString('ru-RU')}
        </p>
      </div>

      {/* Spacer so last block doesn't hide behind fixed actions */}
      <div aria-hidden className="h-24" />

      {/* Fixed Bottom Actions - positioned above BottomNav */}
      <div className="fixed bottom-16 left-0 right-0 bg-background border-t border-border px-4 py-3 z-40">
        <div className="flex gap-3">
          <Button className="flex-1 h-12 rounded-xl bg-primary">
            <Phone className="w-5 h-5 mr-2" />
            Позвонить
          </Button>
          <Button variant="outline" size="icon" className="h-12 w-12 rounded-xl">
            <MessageCircle className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
