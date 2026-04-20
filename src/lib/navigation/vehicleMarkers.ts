/**
 * vehicleMarkers.ts — SVG generators for different vehicle types as navigation markers.
 * Each vehicle is rendered as a top-down SVG for the map with 3D-like styling.
 */
import { getVehicleMarkerDefinition } from '@/stores/navigatorSettingsStore';

/** Returns a data URL for a vehicle SVG marker */
export function getVehicleMarkerSVG(vehicleId: string, heading: number = 0): string {
  const vehicle = getVehicleMarkerDefinition(vehicleId);
  if (!vehicle) return getDefaultCarSVG('#3b82f6', heading);

  switch (vehicle.category) {
    case 'car':
    case 'suv':
    case 'sport':
      return getCarSVG(vehicle.color, heading, vehicle.category);
    case 'truck':
      return getTruckSVG(vehicle.color, heading);
    case 'motorcycle':
      return getMotorcycleSVG(vehicle.color, heading);
    case 'bicycle':
      return getBicycleSVG(vehicle.color, heading);
    case 'animal':
      return getAnimalSVG(vehicle.emoji, heading);
    case 'aircraft':
      return getAircraftSVG(vehicle.color, heading);
    case 'custom':
      return getNavigationArrowSVG(vehicle.color, heading);
    default:
      return getDefaultCarSVG(vehicle.color, heading);
  }
}

function svgToDataURL(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function getDefaultCarSVG(color: string, heading: number): string {
  return getCarSVG(color, heading, 'car');
}

function getCarSVG(color: string, heading: number, type: 'car' | 'suv' | 'sport'): string {
  const w = type === 'suv' ? 28 : type === 'sport' ? 24 : 26;
  const h = type === 'suv' ? 48 : type === 'sport' ? 50 : 44;
  const bodyRx = type === 'sport' ? 8 : 10;
  const roofY = type === 'suv' ? 14 : 12;
  const roofH = type === 'suv' ? 20 : type === 'sport' ? 18 : 16;
  
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 60 60">
    <defs>
      <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#000" flood-opacity="0.5"/>
      </filter>
      <linearGradient id="bodyGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${lighten(color, 20)}"/>
        <stop offset="100%" stop-color="${color}"/>
      </linearGradient>
      <linearGradient id="windshield" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#4fc3f7"/>
        <stop offset="100%" stop-color="#0288d1"/>
      </linearGradient>
    </defs>
    <g transform="translate(30,30) rotate(${heading}) translate(-${w/2},-${h/2})" filter="url(#shadow)">
      <rect x="0" y="0" width="${w}" height="${h}" rx="${bodyRx}" fill="url(#bodyGrad)" stroke="${darken(color, 30)}" stroke-width="1"/>
      <rect x="4" y="6" width="${w-8}" height="8" rx="3" fill="url(#windshield)" opacity="0.8"/>
      <rect x="4" y="${h-14}" width="${w-8}" height="7" rx="3" fill="url(#windshield)" opacity="0.6"/>
      <rect x="5" y="${roofY}" width="${w-10}" height="${roofH}" rx="4" fill="${lighten(color, 10)}" opacity="0.5"/>
      <circle cx="5" cy="3" r="2" fill="#ffe082"/>
      <circle cx="${w-5}" cy="3" r="2" fill="#ffe082"/>
      <circle cx="5" cy="${h-3}" r="2" fill="#ef5350"/>
      <circle cx="${w-5}" cy="${h-3}" r="2" fill="#ef5350"/>
      <polygon points="${w/2},0 ${w/2-3},6 ${w/2+3},6" fill="white" opacity="0.9"/>
    </g>
    <circle cx="30" cy="30" r="25" fill="none" stroke="${color}" stroke-width="2" opacity="0.3">
      <animate attributeName="r" from="20" to="30" dur="2s" repeatCount="indefinite"/>
      <animate attributeName="opacity" from="0.5" to="0" dur="2s" repeatCount="indefinite"/>
    </circle>
  </svg>`;
  return svgToDataURL(svg);
}

function getTruckSVG(color: string, heading: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 60 60">
    <defs>
      <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#000" flood-opacity="0.5"/>
      </filter>
    </defs>
    <g transform="translate(30,30) rotate(${heading}) translate(-15,-25)" filter="url(#shadow)">
      <rect x="2" y="0" width="26" height="16" rx="4" fill="${lighten(color, 15)}"/>
      <rect x="5" y="2" width="20" height="8" rx="2" fill="#4fc3f7" opacity="0.7"/>
      <rect x="0" y="16" width="30" height="34" rx="3" fill="${color}" stroke="${darken(color, 30)}" stroke-width="1"/>
      <line x1="0" y1="26" x2="30" y2="26" stroke="${darken(color, 20)}" stroke-width="0.5" opacity="0.5"/>
      <line x1="0" y1="36" x2="30" y2="36" stroke="${darken(color, 20)}" stroke-width="0.5" opacity="0.5"/>
      <rect x="4" y="0" width="3" height="2" rx="1" fill="#ffe082"/>
      <rect x="23" y="0" width="3" height="2" rx="1" fill="#ffe082"/>
      <rect x="3" y="48" width="4" height="2" rx="1" fill="#ef5350"/>
      <rect x="23" y="48" width="4" height="2" rx="1" fill="#ef5350"/>
      <polygon points="15,0 12,5 18,5" fill="white" opacity="0.9"/>
    </g>
  </svg>`;
  return svgToDataURL(svg);
}

function getMotorcycleSVG(color: string, heading: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 60 60">
    <defs>
      <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#000" flood-opacity="0.5"/>
      </filter>
    </defs>
    <g transform="translate(30,30) rotate(${heading}) translate(-6,-18)" filter="url(#shadow)">
      <rect x="2" y="4" width="8" height="28" rx="4" fill="${color}"/>
      <ellipse cx="6" cy="3" rx="5" ry="3" fill="#333" stroke="#555" stroke-width="1"/>
      <ellipse cx="6" cy="33" rx="5" ry="3" fill="#333" stroke="#555" stroke-width="1"/>
      <circle cx="6" cy="1" r="2" fill="#ffe082"/>
      <ellipse cx="6" cy="16" rx="4" ry="5" fill="${darken(color, 20)}" opacity="0.7"/>
      <polygon points="6,0 4,4 8,4" fill="white" opacity="0.9"/>
    </g>
    <circle cx="30" cy="30" r="20" fill="none" stroke="${color}" stroke-width="1.5" opacity="0.3">
      <animate attributeName="r" from="15" to="25" dur="2s" repeatCount="indefinite"/>
      <animate attributeName="opacity" from="0.5" to="0" dur="2s" repeatCount="indefinite"/>
    </circle>
  </svg>`;
  return svgToDataURL(svg);
}

function getBicycleSVG(color: string, heading: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 60 60">
    <defs>
      <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="1" stdDeviation="2" flood-color="#000" flood-opacity="0.4"/>
      </filter>
    </defs>
    <g transform="translate(30,30) rotate(${heading}) translate(-5,-15)" filter="url(#shadow)">
      <line x1="5" y1="5" x2="5" y2="25" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="1" y1="4" x2="9" y2="4" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
      <circle cx="5" cy="2" r="3" fill="none" stroke="#666" stroke-width="1.5"/>
      <circle cx="5" cy="28" r="3" fill="none" stroke="#666" stroke-width="1.5"/>
      <line x1="3" y1="12" x2="7" y2="12" stroke="${darken(color, 20)}" stroke-width="2" stroke-linecap="round"/>
      <circle cx="5" cy="10" r="2.5" fill="${color}" opacity="0.6"/>
      <polygon points="5,0 3,3 7,3" fill="white" opacity="0.8"/>
    </g>
  </svg>`;
  return svgToDataURL(svg);
}

function getAnimalSVG(emoji: string, heading: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 60 60">
    <g transform="translate(30,30) rotate(${heading}) translate(-30,-30)">
      <text x="30" y="38" text-anchor="middle" font-size="32">${emoji}</text>
    </g>
    <circle cx="30" cy="30" r="25" fill="none" stroke="#8bc34a" stroke-width="1.5" opacity="0.3">
      <animate attributeName="r" from="20" to="28" dur="2s" repeatCount="indefinite"/>
      <animate attributeName="opacity" from="0.4" to="0" dur="2s" repeatCount="indefinite"/>
    </circle>
  </svg>`;
  return svgToDataURL(svg);
}

function getAircraftSVG(color: string, heading: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 60 60">
    <defs>
      <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
        <feDropShadow dx="0" dy="3" stdDeviation="4" flood-color="#000" flood-opacity="0.4"/>
      </filter>
    </defs>
    <g transform="translate(30,30) rotate(${heading}) translate(-30,-30)" filter="url(#shadow)">
      <ellipse cx="30" cy="30" rx="5" ry="20" fill="${color}"/>
      <polygon points="30,20 10,32 30,28 50,32" fill="${lighten(color, 15)}" opacity="0.9"/>
      <polygon points="30,48 24,52 30,50 36,52" fill="${lighten(color, 10)}" opacity="0.8"/>
      <ellipse cx="30" cy="14" rx="3" ry="4" fill="#4fc3f7" opacity="0.8"/>
      <polygon points="30,10 28,14 32,14" fill="white" opacity="0.7"/>
    </g>
    <ellipse cx="30" cy="32" rx="22" ry="8" fill="rgba(0,0,0,0.15)"/>
  </svg>`;
  return svgToDataURL(svg);
}

function getNavigationArrowSVG(color: string, heading: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 72 72">
    <defs>
      <filter id="navShadow" x="-40%" y="-40%" width="180%" height="180%">
        <feDropShadow dx="0" dy="4" stdDeviation="4" flood-color="#020617" flood-opacity="0.55"/>
      </filter>
      <linearGradient id="navGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${lighten(color, 24)}"/>
        <stop offset="100%" stop-color="${darken(color, 8)}"/>
      </linearGradient>
    </defs>
    <g transform="translate(36,36) rotate(${heading}) translate(-18,-26)" filter="url(#navShadow)">
      <path d="M18 0L36 36L22 31L18 52L14 31L0 36L18 0Z" fill="url(#navGrad)" stroke="#E2E8F0" stroke-width="1.5"/>
      <path d="M18 7L30 31L21 27L18 42L15 27L6 31L18 7Z" fill="#F8FAFC" opacity="0.38"/>
      <circle cx="18" cy="20" r="3.5" fill="#F8FAFC" opacity="0.95"/>
    </g>
    <circle cx="36" cy="36" r="24" fill="none" stroke="${color}" stroke-width="2" opacity="0.28">
      <animate attributeName="r" from="20" to="28" dur="1.8s" repeatCount="indefinite"/>
      <animate attributeName="opacity" from="0.35" to="0" dur="1.8s" repeatCount="indefinite"/>
    </circle>
  </svg>`;
  return svgToDataURL(svg);
}

function lighten(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, ((num >> 16) & 0xff) + Math.round(255 * percent / 100));
  const g = Math.min(255, ((num >> 8) & 0xff) + Math.round(255 * percent / 100));
  const b = Math.min(255, (num & 0xff) + Math.round(255 * percent / 100));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function darken(hex: string, percent: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, ((num >> 16) & 0xff) - Math.round(255 * percent / 100));
  const g = Math.max(0, ((num >> 8) & 0xff) - Math.round(255 * percent / 100));
  const b = Math.max(0, (num & 0xff) - Math.round(255 * percent / 100));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
