/**
 * Lighting System — день/ночь освещение.
 *
 * Использует время суток для расчёта позиции солнца (приближённо).
 * Меняет ambient + directional + fog.
 */

import * as THREE from 'three';

export interface LightingConfig {
  ambientIntensity: number;
  sunIntensity: number;
  sunPosition: THREE.Vector3;
  sunColor: THREE.Color;
  ambientColor: THREE.Color;
  fogColor: THREE.Color;
  fogNear: number;
  fogFar: number;
}

/**
 * Вычисляет конфигурацию освещения по времени суток (часы 0-24).
 *
 * Профиль:
 *   00-05: ночь (амбиент 0.05, синий fog 80м)
 *   06-08: рассвет (амбиент 0.2 → 0.5, тёплый sun)
 *   09-17: день (амбиент 0.5, sun 1.0, fog 200м)
 *   18-20: закат (амбиент 0.5 → 0.2, оранжевый)
 *   21-23: сумерки → ночь
 */
export function lightingForHour(hour: number, lat: number = 55): LightingConfig {
  const h = ((hour % 24) + 24) % 24;

  if (h < 5 || h >= 22) {
    // Глубокая ночь
    return {
      ambientIntensity: 0.05,
      sunIntensity: 0.0,
      sunPosition: new THREE.Vector3(0, -1, -0.3).normalize(),
      sunColor: new THREE.Color(0x223355),
      ambientColor: new THREE.Color(0x223355),
      fogColor: new THREE.Color(0x0a0f1a),
      fogNear: 30,
      fogFar: 80,
    };
  }
  if (h < 8) {
    // Рассвет
    const t = (h - 5) / 3; // 0..1
    return {
      ambientIntensity: 0.05 + 0.45 * t,
      sunIntensity: 0.2 + 0.8 * t,
      sunPosition: new THREE.Vector3(-1, 0.3, 0.2 + 0.6 * t).normalize(),
      sunColor: new THREE.Color().lerpColors(
        new THREE.Color(0xffaa66),
        new THREE.Color(0xfff5dc),
        t
      ),
      ambientColor: new THREE.Color(0xffd9b3),
      fogColor: new THREE.Color(0xffcc99),
      fogNear: 50,
      fogFar: 150,
    };
  }
  if (h < 18) {
    // День
    return {
      ambientIntensity: 0.5,
      sunIntensity: 1.0,
      sunPosition: new THREE.Vector3(0.3, 0, 1).normalize(),
      sunColor: new THREE.Color(0xfff5dc),
      ambientColor: new THREE.Color(0xffffff),
      fogColor: new THREE.Color(0xb8d4f0),
      fogNear: 100,
      fogFar: 250,
    };
  }
  if (h < 21) {
    // Закат
    const t = (h - 18) / 3;
    return {
      ambientIntensity: 0.5 - 0.3 * t,
      sunIntensity: 1.0 - 0.8 * t,
      sunPosition: new THREE.Vector3(1, -0.2, 0.5 - 0.4 * t).normalize(),
      sunColor: new THREE.Color().lerpColors(
        new THREE.Color(0xff6633),
        new THREE.Color(0x442266),
        t
      ),
      ambientColor: new THREE.Color(0xcc8866),
      fogColor: new THREE.Color(0x886644),
      fogNear: 50,
      fogFar: 150,
    };
  }
  // Сумерки 21-22
  return {
    ambientIntensity: 0.1,
    sunIntensity: 0.05,
    sunPosition: new THREE.Vector3(0.5, -0.5, 0.1).normalize(),
    sunColor: new THREE.Color(0x6644aa),
    ambientColor: new THREE.Color(0x334466),
    fogColor: new THREE.Color(0x223355),
    fogNear: 40,
    fogFar: 100,
  };
}

/**
 * Применяет конфигурацию освещения к сцене.
 * Создаёт или обновляет AmbientLight + DirectionalLight + Fog.
 */
export function applyLighting(scene: THREE.Scene, cfg: LightingConfig): void {
  // Поиск существующих по name
  let ambient = scene.getObjectByName('lighting-ambient') as THREE.AmbientLight | null;
  let sun = scene.getObjectByName('lighting-sun') as THREE.DirectionalLight | null;

  if (!ambient) {
    ambient = new THREE.AmbientLight(cfg.ambientColor, cfg.ambientIntensity);
    ambient.name = 'lighting-ambient';
    scene.add(ambient);
  } else {
    ambient.color.copy(cfg.ambientColor);
    ambient.intensity = cfg.ambientIntensity;
  }

  if (!sun) {
    sun = new THREE.DirectionalLight(cfg.sunColor, cfg.sunIntensity);
    sun.name = 'lighting-sun';
    scene.add(sun);
  } else {
    sun.color.copy(cfg.sunColor);
    sun.intensity = cfg.sunIntensity;
  }
  sun.position.copy(cfg.sunPosition).multiplyScalar(100);

  scene.fog = new THREE.Fog(cfg.fogColor, cfg.fogNear, cfg.fogFar);
}

/** Удобный шорткат: применить освещение по текущему времени */
export function applyLightingForNow(scene: THREE.Scene, lat: number = 55): void {
  const now = new Date();
  const hour = now.getHours() + now.getMinutes() / 60;
  applyLighting(scene, lightingForHour(hour, lat));
}
