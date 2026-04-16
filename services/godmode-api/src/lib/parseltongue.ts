/**
 * Parseltongue — input perturbation engine для red-teaming.
 *
 * 33 триггера, 3 интенсивности, 6 техник обфускации:
 * leetspeak, bubble text, braille, morse, unicode substitution, phonetic.
 */

export type ParseltongueIntensity = 'light' | 'medium' | 'heavy'

export interface ParseltongueResult {
  original: string
  transformed: string
  intensity: ParseltongueIntensity
  techniques_applied: string[]
  triggers_found: string[]
}

// 33 дефолтных триггера
const TRIGGERS = [
  // --- light (11) ---
  'hack', 'exploit', 'bypass', 'jailbreak', 'crack',
  'malware', 'virus', 'phishing', 'attack', 'inject', 'payload',
  // --- standard (+11 = 22) ---
  'bomb', 'weapon', 'drug', 'steal', 'kill', 'murder',
  'fraud', 'counterfeit', 'ransomware', 'ddos', 'rootkit',
  // --- heavy (+11 = 33) ---
  'suicide', 'torture', 'terrorism', 'bioweapon', 'chemical weapon',
  'child', 'abuse', 'trafficking', 'extremism', 'launder', 'detonate',
]

function triggersForIntensity(intensity: ParseltongueIntensity): string[] {
  switch (intensity) {
    case 'light': return TRIGGERS.slice(0, 11)
    case 'medium': return TRIGGERS.slice(0, 22)
    case 'heavy': return TRIGGERS
  }
}

// ── 6 техник обфускации ────────────────────────────

const LEET: Record<string, string> = {
  a: '4', e: '3', i: '1', o: '0', s: '5', t: '7', l: '1', b: '8', g: '9',
}

function leetspeak(word: string): string {
  return [...word].map(c => LEET[c.toLowerCase()] ?? c).join('')
}

const BUBBLE_MAP: Record<string, string> = {
  a: 'ⓐ', b: 'ⓑ', c: 'ⓒ', d: 'ⓓ', e: 'ⓔ', f: 'ⓕ', g: 'ⓖ', h: 'ⓗ',
  i: 'ⓘ', j: 'ⓙ', k: 'ⓚ', l: 'ⓛ', m: 'ⓜ', n: 'ⓝ', o: 'ⓞ', p: 'ⓟ',
  q: 'ⓠ', r: 'ⓡ', s: 'ⓢ', t: 'ⓣ', u: 'ⓤ', v: 'ⓥ', w: 'ⓦ', x: 'ⓧ',
  y: 'ⓨ', z: 'ⓩ',
}

function bubbleText(word: string): string {
  return [...word].map(c => BUBBLE_MAP[c.toLowerCase()] ?? c).join('')
}

const BRAILLE_MAP: Record<string, string> = {
  a: '⠁', b: '⠃', c: '⠉', d: '⠙', e: '⠑', f: '⠋', g: '⠛', h: '⠓',
  i: '⠊', j: '⠚', k: '⠅', l: '⠇', m: '⠍', n: '⠝', o: '⠕', p: '⠏',
  q: '⠟', r: '⠗', s: '⠎', t: '⠞', u: '⠥', v: '⠧', w: '⠺', x: '⠭',
  y: '⠽', z: '⠵',
}

function braille(word: string): string {
  return [...word].map(c => BRAILLE_MAP[c.toLowerCase()] ?? c).join('')
}

const MORSE_MAP: Record<string, string> = {
  a: '.-', b: '-...', c: '-.-.', d: '-..', e: '.', f: '..-.',
  g: '--.', h: '....', i: '..', j: '.---', k: '-.-', l: '.-..',
  m: '--', n: '-.', o: '---', p: '.--.', q: '--.-', r: '.-.',
  s: '...', t: '-', u: '..-', v: '...-', w: '.--', x: '-..-',
  y: '-.--', z: '--..',
}

function morse(word: string): string {
  return [...word].map(c => MORSE_MAP[c.toLowerCase()] ?? c).join(' ')
}

const UNICODE_MAP: Record<string, string> = {
  a: 'а', e: 'е', o: 'о', p: 'р', c: 'с', x: 'х', y: 'у',
  // cyrillic lookalikes
}

function unicodeSub(word: string): string {
  return [...word].map(c => UNICODE_MAP[c.toLowerCase()] ?? c).join('')
}

const PHONETIC_MAP: Record<string, string> = {
  hack: 'h-a-c-k', exploit: 'ex-ploit', bypass: 'by-pass',
  jailbreak: 'jail-br3ak', crack: 'cr-ack', malware: 'mal-ware',
  virus: 'v-irus', phishing: 'ph-ishing', attack: 'at-tack',
  inject: 'in-ject', payload: 'pay-load', bomb: 'b-omb',
  weapon: 'w-eapon', kill: 'k-ill', steal: 'st-eal',
}

function phonetic(word: string): string {
  return PHONETIC_MAP[word.toLowerCase()] ?? word.split('').join('-')
}

// массив техник
type TechniqueFn = (word: string) => string
const TECHNIQUES: { name: string; fn: TechniqueFn }[] = [
  { name: 'leetspeak', fn: leetspeak },
  { name: 'bubble_text', fn: bubbleText },
  { name: 'braille', fn: braille },
  { name: 'morse', fn: morse },
  { name: 'unicode_substitution', fn: unicodeSub },
  { name: 'phonetic', fn: phonetic },
]

function pickTechniques(intensity: ParseltongueIntensity): typeof TECHNIQUES {
  switch (intensity) {
    case 'light': return TECHNIQUES.slice(0, 2)   // leetspeak + bubble
    case 'medium': return TECHNIQUES.slice(0, 4)   // + braille, morse
    case 'heavy': return TECHNIQUES                 // все 6
  }
}

// ── API ────────────────────────────────────────────

export function perturbInput(
  text: string,
  intensity: ParseltongueIntensity = 'medium',
  customTriggers?: string[],
): ParseltongueResult {
  const triggers = customTriggers ?? triggersForIntensity(intensity)
  const techs = pickTechniques(intensity)
  const foundTriggers: string[] = []
  const appliedTechs = new Set<string>()
  let result = text

  for (const trigger of triggers) {
    const regex = new RegExp(`\\b${trigger}\\b`, 'gi')
    if (!regex.test(text)) continue
    foundTriggers.push(trigger)

    const tech = techs[foundTriggers.length % techs.length]
    appliedTechs.add(tech.name)
    result = result.replace(new RegExp(`\\b${trigger}\\b`, 'gi'), match => tech.fn(match))
  }

  return {
    original: text,
    transformed: result,
    intensity,
    techniques_applied: [...appliedTechs],
    triggers_found: foundTriggers,
  }
}

export function listTriggers(intensity: ParseltongueIntensity = 'heavy') {
  return {
    triggers: triggersForIntensity(intensity),
    count: triggersForIntensity(intensity).length,
    intensity,
  }
}

export function listTechniques() {
  return TECHNIQUES.map(t => t.name)
}
