import { useState, useEffect } from "react";
import { Search, MapPin, BedDouble, Bath, Square, Star, Heart, Phone, MessageCircle, ChevronLeft, Building2, Home, Castle, Building, CheckCircle, X, Plus, ShoppingCart, Key, Landmark, TreePine, Store, Calendar, Calculator, Shield, BarChart3, FileCheck, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { useNavigate } from "react-router-dom";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { RealEstateFilters } from "@/components/realestate/RealEstateFilters";
import { PropertyAssistant } from "@/components/realestate/PropertyAssistant";
import { MortgageCalculator } from "@/components/realestate/MortgageCalculator";
import { supabase } from "@/lib/supabase";
import { Tables } from "@/integrations/supabase/types";

type Property = Tables<"properties"> & {
  property_images?: Tables<"property_images">[];
};

// Services horizontal scroll
const services = [
  { id: "newbuilding", label: "Подбор новостройки", icon: Building2 },
  { id: "check", label: "Проверка жилья", icon: FileCheck },
  { id: "mortgage", label: "Ипотечный калькулятор", icon: Calculator },
  { id: "analytics", label: "Аналитика бизнесу", icon: BarChart3 },
  { id: "insurance", label: "Страхование", icon: Shield },
];

const roomOptions = [
  { id: "studio", label: "Студия", value: 0 },
  { id: "1", label: "1", value: 1 },
  { id: "2", label: "2", value: 2 },
  { id: "3", label: "3", value: 3 },
  { id: "4+", label: "4+", value: 4 },
];

export function RealEstatePage() {
  const navigate = useNavigate();
  const [properties, setProperties] = useState<Property[]>([]);
  const [filteredProperties, setFilteredProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [visibleCount, setVisibleCount] = useState(6);
  
  // Filter states from RealEstateFilters
  const [filters, setFilters] = useState({
    propertyType: "apartment",
    dealType: "sale",
    marketType: "all",
    rooms: "",
    price: "",
    city: "Москва",
  });

  // Sheet filter states
  const [priceRange, setPriceRange] = useState([0, 300]);
  const [areaRange, setAreaRange] = useState([0, 500]);
  const [selectedRooms, setSelectedRooms] = useState<string[]>([]);
  const [selectedCity, setSelectedCity] = useState("Москва");
  const [filterOptions, setFilterOptions] = useState({
    verified: false,
    withPhoto: true,
    fromOwner: false,
    newBuilding: false,
    withBalcony: false,
    withParking: false,
    withFurniture: false,
  });

  // Fetch properties from database
  useEffect(() => {
    async function fetchProperties() {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("properties")
          .select(`
            *,
            property_images (*)
          `)
          .eq("status", "active")
          .order("created_at", { ascending: false });

        if (error) throw error;
        setProperties(data || []);
        setFilteredProperties(data || []);
      } catch (error) {
        console.error("Error fetching properties:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchProperties();
  }, []);

  // Apply filters
  useEffect(() => {
    let result = [...properties];

    // Filter by deal type
    if (filters.dealType) {
      const dealTypeMap: Record<string, string> = {
        buy: "sale",
        rent: "rent",
        daily: "daily",
      };
      const dbDealType = dealTypeMap[filters.dealType] || filters.dealType;
      result = result.filter(p => p.deal_type === dbDealType);
    }

    // Filter by property type
    if (filters.propertyType) {
      result = result.filter(p => p.property_type === filters.propertyType);
    }

    // Filter by city
    if (selectedCity && selectedCity !== "Все") {
      result = result.filter(p => 
        p.city.toLowerCase().includes(selectedCity.toLowerCase())
      );
    }

    // Filter by rooms
    if (selectedRooms.length > 0) {
      result = result.filter(p => {
        if (!p.rooms) return selectedRooms.includes("studio");
        if (p.rooms >= 4 && selectedRooms.includes("4+")) return true;
        return selectedRooms.includes(String(p.rooms));
      });
    }

    // Filter by price
    if (filters.price && filters.price !== "any") {
      const priceMap: Record<string, number> = {
        "1m": 1000000,
        "3m": 3000000,
        "5m": 5000000,
        "10m": 10000000,
        "20m": 20000000,
        "50m": 50000000,
      };
      const maxPrice = priceMap[filters.price];
      if (maxPrice) {
        result = result.filter(p => p.price <= maxPrice);
      }
    }

    // Filter by market type
    if (filters.marketType === "new") {
      result = result.filter(p => p.is_new_building);
    } else if (filters.marketType === "secondary") {
      result = result.filter(p => !p.is_new_building);
    }

    // Additional filters
    if (filterOptions.verified) {
      result = result.filter(p => p.is_verified);
    }
    if (filterOptions.fromOwner) {
      result = result.filter(p => p.is_from_owner);
    }
    if (filterOptions.withBalcony) {
      result = result.filter(p => p.has_balcony);
    }
    if (filterOptions.withParking) {
      result = result.filter(p => p.has_parking);
    }
    if (filterOptions.withFurniture) {
      result = result.filter(p => p.has_furniture);
    }

    setFilteredProperties(result);
  }, [properties, filters, selectedCity, selectedRooms, filterOptions]);

  const toggleFavorite = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavorites(prev => 
      prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
    );
  };

  const toggleRoom = (roomId: string) => {
    setSelectedRooms(prev =>
      prev.includes(roomId) ? prev.filter(r => r !== roomId) : [...prev, roomId]
    );
  };

  const resetFilters = () => {
    setPriceRange([0, 300]);
    setAreaRange([0, 500]);
    setSelectedRooms([]);
    setFilterOptions({
      verified: false,
      withPhoto: true,
      fromOwner: false,
      newBuilding: false,
      withBalcony: false,
      withParking: false,
      withFurniture: false,
    });
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

  const getPropertyImage = (property: Property) => {
    const primaryImage = property.property_images?.find(img => img.is_primary);
    return primaryImage?.image_url || property.property_images?.[0]?.image_url || 
      "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=600&q=80";
  };

  const getDealTypeLabel = (dealType: string) => {
    const labels: Record<string, string> = {
      sale: "Продажа",
      rent: "Аренда",
      daily: "Посуточно",
    };
    return labels[dealType] || dealType;
  };

  const handleShowMore = () => {
    setVisibleCount(prev => prev + 6);
  };

  const featuredProperties = filteredProperties.slice(0, 3);
  const visibleProperties = filteredProperties.slice(0, visibleCount);

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Avito-style Filters Header */}
      <RealEstateFilters 
        onShowResults={handleShowMore}
        resultsCount={filteredProperties.length}
        onFiltersChange={setFilters}
      />

      {/* Mortgage Calculator */}
      <div className="px-4 pb-2">
        <MortgageCalculator />
      </div>

      {/* Post Ad Button */}
      <div className="px-4 pb-4">
        <Button 
          variant="outline" 
          className="w-full h-12 rounded-2xl border-2 border-border bg-card text-foreground font-medium hover:bg-muted"
        >
          <Plus className="w-5 h-5 mr-2" />
          Разместить за 0 ₽
        </Button>
      </div>

      {/* Services Scroll */}
      <div className="pb-6">
        <ScrollArea className="w-full">
          <div className="flex gap-3 px-4">
            {services.map((service) => {
              const Icon = service.icon;
              return (
                <button
                  key={service.id}
                  className="flex-shrink-0 flex flex-col items-center w-20 p-3 rounded-2xl bg-muted/50 hover:bg-muted transition-colors"
                >
                  <div className="w-12 h-12 rounded-xl bg-background flex items-center justify-center mb-2 shadow-sm">
                    <Icon className="w-6 h-6 text-primary" />
                  </div>
                  <span className="text-[11px] text-center text-foreground font-medium leading-tight">
                    {service.label}
                  </span>
                </button>
              );
            })}
          </div>
          <ScrollBar orientation="horizontal" className="invisible" />
        </ScrollArea>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
        <>
          {/* Featured Properties */}
          {featuredProperties.length > 0 && (
            <div className="px-4 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-lg">Рекомендуемые</h3>
                <button 
                  className="text-primary text-sm font-medium"
                  onClick={() => setVisibleCount(filteredProperties.length)}
                >
                  Все
                </button>
              </div>
              <ScrollArea className="w-full">
                <div className="flex gap-4">
                  {featuredProperties.map((property) => (
                    <div 
                      key={property.id} 
                      className="flex-shrink-0 w-[260px] cursor-pointer" 
                      onClick={() => navigate(`/realestate/${property.id}`)}
                    >
                      <div className="relative rounded-2xl overflow-hidden mb-3">
                        <img
                          src={getPropertyImage(property)}
                          alt={property.title}
                          className="w-full h-40 object-cover"
                        />
                        <div className="absolute top-3 left-3">
                          <span className="px-3 py-1 bg-primary text-primary-foreground text-xs font-medium rounded-full">
                            {getDealTypeLabel(property.deal_type)}
                          </span>
                        </div>
                        <button 
                          onClick={(e) => toggleFavorite(property.id, e)}
                          className="absolute top-3 right-3 w-8 h-8 bg-white rounded-full flex items-center justify-center"
                        >
                          <Heart className={cn("w-4 h-4", favorites.includes(property.id) ? "fill-red-500 text-red-500" : "text-muted-foreground")} />
                        </button>
                        {property.is_verified && (
                          <div className="absolute bottom-3 left-3 flex items-center gap-1 px-2 py-1 bg-green-500 text-white text-xs rounded-full">
                            <CheckCircle className="w-3 h-3" />
                            <span>Проверено</span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-muted-foreground text-sm mb-1">
                        <MapPin className="w-3.5 h-3.5" />
                        <span>{property.city}</span>
                      </div>
                      <h4 className="font-semibold text-sm mb-2 line-clamp-2">{property.title}</h4>
                      <div className="flex items-center gap-3 text-muted-foreground text-xs mb-2">
                        {property.rooms && (
                          <span className="flex items-center gap-1">
                            <BedDouble className="w-3.5 h-3.5" />
                            {property.rooms}
                          </span>
                        )}
                        {property.area_total && (
                          <span className="flex items-center gap-1">
                            <Square className="w-3.5 h-3.5" />
                            {property.area_total} м²
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-primary">
                          {formatPrice(Number(property.price), property.deal_type)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                <ScrollBar orientation="horizontal" className="invisible" />
              </ScrollArea>
            </div>
          )}

          {/* All Properties */}
          <div className="px-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">{filteredProperties.length} объектов</h3>
              <button className="text-muted-foreground text-sm flex items-center gap-1">
                По популярности
                <ChevronLeft className="w-4 h-4 -rotate-90" />
              </button>
            </div>
            
            {filteredProperties.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">Ничего не найдено по заданным фильтрам</p>
                <Button 
                  variant="outline" 
                  className="mt-4"
                  onClick={resetFilters}
                >
                  Сбросить фильтры
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {visibleProperties.map((property) => (
                  <div 
                    key={property.id} 
                    className="bg-card rounded-2xl overflow-hidden border border-border cursor-pointer" 
                    onClick={() => navigate(`/realestate/${property.id}`)}
                  >
                    <div className="relative">
                      <img
                        src={getPropertyImage(property)}
                        alt={property.title}
                        className="w-full h-48 object-cover"
                      />
                      <div className="absolute top-3 left-3">
                        <span className="px-3 py-1 bg-primary text-primary-foreground text-xs font-medium rounded-full">
                          {getDealTypeLabel(property.deal_type)}
                        </span>
                      </div>
                      <button 
                        onClick={(e) => toggleFavorite(property.id, e)}
                        className="absolute top-3 right-3 w-9 h-9 bg-white rounded-full flex items-center justify-center shadow-lg"
                      >
                        <Heart className={cn("w-5 h-5", favorites.includes(property.id) ? "fill-red-500 text-red-500" : "text-muted-foreground")} />
                      </button>
                      {property.is_verified && (
                        <div className="absolute bottom-3 left-3 flex items-center gap-1 px-2 py-1 bg-green-500 text-white text-xs rounded-full">
                          <CheckCircle className="w-3 h-3" />
                          <span>Проверено</span>
                        </div>
                      )}
                    </div>
                    <div className="p-4">
                      <div className="flex items-center gap-1 text-primary text-sm mb-1">
                        <MapPin className="w-3.5 h-3.5" />
                        <span>{property.address || property.district}, {property.city}</span>
                      </div>
                      <h4 className="font-semibold mb-2">{property.title}</h4>
                      <div className="flex items-center gap-4 text-muted-foreground text-sm mb-3">
                        {property.rooms && (
                          <span className="flex items-center gap-1">
                            <BedDouble className="w-4 h-4" />
                            {property.rooms} комн.
                          </span>
                        )}
                        {property.floor && property.total_floors && (
                          <span className="flex items-center gap-1">
                            {property.floor}/{property.total_floors} эт.
                          </span>
                        )}
                        {property.area_total && (
                          <span className="flex items-center gap-1">
                            <Square className="w-4 h-4" />
                            {property.area_total} м²
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between mb-4">
                        <span className="font-bold text-lg">
                          {formatPrice(Number(property.price), property.deal_type)}
                        </span>
                        {property.metro_station && (
                          <span className="text-sm text-muted-foreground">
                            м. {property.metro_station}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between pt-3 border-t border-border">
                        <div className="flex items-center gap-2 flex-wrap">
                        {property.is_from_owner && (
                            <span className="text-xs bg-muted px-2 py-1 rounded-full">Собственник</span>
                          )}
                          {property.is_new_building && (
                            <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full">Новостройка</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button size="icon" variant="outline" className="rounded-full w-10 h-10">
                            <Phone className="w-4 h-4" />
                          </Button>
                          <Button size="icon" className="rounded-full w-10 h-10">
                            <MessageCircle className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Show More Button */}
                {visibleCount < filteredProperties.length && (
                  <Button 
                    variant="outline" 
                    className="w-full h-12 rounded-xl"
                    onClick={handleShowMore}
                  >
                    Показать ещё {Math.min(6, filteredProperties.length - visibleCount)} из {filteredProperties.length - visibleCount}
                  </Button>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* Filters Sheet */}
      <Sheet open={showFilters} onOpenChange={setShowFilters}>
        <SheetContent side="bottom" className="h-[90vh] rounded-t-3xl p-0" hideCloseButton>
          <div className="flex flex-col h-full">
            {/* Header */}
            <SheetHeader className="px-4 py-4 border-b border-border">
              <div className="flex items-center justify-between">
                <button onClick={() => setShowFilters(false)}>
                  <X className="w-6 h-6" />
                </button>
                <SheetTitle className="text-lg font-semibold">Фильтры</SheetTitle>
                <button 
                  onClick={resetFilters}
                  className="text-primary text-sm font-medium"
                >
                  Сбросить
                </button>
              </div>
            </SheetHeader>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
              {/* City Selection */}
              <div>
                <h3 className="font-semibold mb-3">Город</h3>
                <div className="flex gap-2 flex-wrap">
                  {["Москва", "Санкт-Петербург", "Дубай", "Сочи"].map((city) => (
                    <button
                      key={city}
                      onClick={() => setSelectedCity(city)}
                      className={cn(
                        "px-4 py-2.5 rounded-xl text-sm font-medium transition-all",
                        selectedCity === city
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-foreground"
                      )}
                    >
                      {city}
                    </button>
                  ))}
                </div>
              </div>

              {/* Rooms */}
              <div>
                <h3 className="font-semibold mb-3">Комнаты</h3>
                <div className="flex gap-2">
                  {roomOptions.map((room) => (
                    <button
                      key={room.id}
                      onClick={() => toggleRoom(room.id)}
                      className={cn(
                        "flex-1 py-3 rounded-xl text-sm font-medium transition-all",
                        selectedRooms.includes(room.id)
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-foreground"
                      )}
                    >
                      {room.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Price Range */}
              <div>
                <h3 className="font-semibold mb-3">Цена, млн ₽</h3>
                <div className="flex items-center gap-4 mb-3">
                  <div className="flex-1">
                    <Input 
                      type="number" 
                      placeholder="От" 
                      value={priceRange[0] || ''} 
                      onChange={(e) => setPriceRange([Number(e.target.value), priceRange[1]])}
                      className="h-11 rounded-xl"
                    />
                  </div>
                  <span className="text-muted-foreground">—</span>
                  <div className="flex-1">
                    <Input 
                      type="number" 
                      placeholder="До" 
                      value={priceRange[1] || ''} 
                      onChange={(e) => setPriceRange([priceRange[0], Number(e.target.value)])}
                      className="h-11 rounded-xl"
                    />
                  </div>
                </div>
                <Slider
                  value={priceRange}
                  onValueChange={setPriceRange}
                  max={300}
                  step={1}
                  className="w-full"
                />
              </div>

              {/* Area Range */}
              <div>
                <h3 className="font-semibold mb-3">Площадь, м²</h3>
                <div className="flex items-center gap-4 mb-3">
                  <div className="flex-1">
                    <Input 
                      type="number" 
                      placeholder="От" 
                      value={areaRange[0] || ''} 
                      onChange={(e) => setAreaRange([Number(e.target.value), areaRange[1]])}
                      className="h-11 rounded-xl"
                    />
                  </div>
                  <span className="text-muted-foreground">—</span>
                  <div className="flex-1">
                    <Input 
                      type="number" 
                      placeholder="До" 
                      value={areaRange[1] || ''} 
                      onChange={(e) => setAreaRange([areaRange[0], Number(e.target.value)])}
                      className="h-11 rounded-xl"
                    />
                  </div>
                </div>
                <Slider
                  value={areaRange}
                  onValueChange={setAreaRange}
                  max={500}
                  step={10}
                  className="w-full"
                />
              </div>

              {/* Additional Options */}
              <div>
                <h3 className="font-semibold mb-3">Дополнительно</h3>
                <div className="space-y-3">
                  <label className="flex items-center gap-3 p-3 bg-muted/50 rounded-xl cursor-pointer">
                    <Checkbox 
                      checked={filterOptions.verified}
                      onCheckedChange={(checked) => 
                        setFilterOptions(prev => ({ ...prev, verified: !!checked }))
                      }
                    />
                    <span className="font-medium text-sm">Проверенные объявления</span>
                  </label>

                  <label className="flex items-center gap-3 p-3 bg-muted/50 rounded-xl cursor-pointer">
                    <Checkbox 
                      checked={filterOptions.fromOwner}
                      onCheckedChange={(checked) => 
                        setFilterOptions(prev => ({ ...prev, fromOwner: !!checked }))
                      }
                    />
                    <span className="font-medium text-sm">От собственника</span>
                  </label>

                  <label className="flex items-center gap-3 p-3 bg-muted/50 rounded-xl cursor-pointer">
                    <Checkbox 
                      checked={filterOptions.newBuilding}
                      onCheckedChange={(checked) => 
                        setFilterOptions(prev => ({ ...prev, newBuilding: !!checked }))
                      }
                    />
                    <span className="font-medium text-sm">Новостройка</span>
                  </label>

                  <label className="flex items-center gap-3 p-3 bg-muted/50 rounded-xl cursor-pointer">
                    <Checkbox 
                      checked={filterOptions.withFurniture}
                      onCheckedChange={(checked) => 
                        setFilterOptions(prev => ({ ...prev, withFurniture: !!checked }))
                      }
                    />
                    <span className="font-medium text-sm">С мебелью</span>
                  </label>

                  <label className="flex items-center gap-3 p-3 bg-muted/50 rounded-xl cursor-pointer">
                    <Checkbox 
                      checked={filterOptions.withBalcony}
                      onCheckedChange={(checked) => 
                        setFilterOptions(prev => ({ ...prev, withBalcony: !!checked }))
                      }
                    />
                    <span className="font-medium text-sm">С балконом/лоджией</span>
                  </label>

                  <label className="flex items-center gap-3 p-3 bg-muted/50 rounded-xl cursor-pointer">
                    <Checkbox 
                      checked={filterOptions.withParking}
                      onCheckedChange={(checked) => 
                        setFilterOptions(prev => ({ ...prev, withParking: !!checked }))
                      }
                    />
                    <span className="font-medium text-sm">С парковкой</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-4 py-4 border-t border-border bg-background">
              <Button 
                className="w-full h-12 rounded-xl"
                onClick={() => setShowFilters(false)}
              >
                Показать {filteredProperties.length} объектов
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* AI Property Assistant */}
      <PropertyAssistant />
    </div>
  );
}
