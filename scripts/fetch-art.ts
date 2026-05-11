// Fetches the Iron & Ash art pack from pollinations.ai (free, keyless).
// Idempotent: skips files that already exist. Pass --force to refetch.

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const FORCE = process.argv.includes('--force');
const ONLY = process.argv.find((a) => a.startsWith('--only='))?.slice('--only='.length);

// Common style skeleton so the asset pack feels coherent.
const STYLE = [
  'medieval fantasy heraldic emblem',
  'dark obsidian background',
  'silver and steel metalwork with subtle iron-red accents',
  'stylized iconic symbol',
  'centered minimal composition',
  'high contrast',
  'game asset icon',
  'no text no letters',
].join(', ');

interface Asset {
  group: string;
  id: string;
  subject: string;
  width: number;
  height: number;
  seed: number;
}

const ASSETS: Asset[] = [
  // Faction emblems
  { group: 'factions', id: 'warriors', subject: 'crossed great swords with an iron shield', width: 256, height: 256, seed: 11 },
  { group: 'factions', id: 'assassins', subject: 'twin curved daggers and a shadowy hood', width: 256, height: 256, seed: 22 },
  { group: 'factions', id: 'mages', subject: 'arcane staff with a glowing purple crystal orb', width: 256, height: 256, seed: 33 },
  { group: 'factions', id: 'necromancers', subject: 'horned skull with a bone crown and dark tendrils', width: 256, height: 256, seed: 44 },
  { group: 'factions', id: 'merchants', subject: 'stacked gold coins with balance scales', width: 256, height: 256, seed: 55 },
  { group: 'factions', id: 'rangers', subject: 'longbow with three oak leaves and a feathered arrow', width: 256, height: 256, seed: 66 },
  { group: 'factions', id: 'paladins', subject: 'winged great sword crowned with a radiant sun', width: 256, height: 256, seed: 77 },
  { group: 'factions', id: 'beastmasters', subject: 'snarling wolf head with three diagonal claw marks', width: 256, height: 256, seed: 88 },
  // Terrain badges
  { group: 'terrains', id: 'fortress', subject: 'stone fortress turret silhouette with battlements', width: 256, height: 256, seed: 110 },
  { group: 'terrains', id: 'forest', subject: 'three pine trees with intertwined roots', width: 256, height: 256, seed: 111 },
  { group: 'terrains', id: 'mountain', subject: 'jagged mountain peaks with snowy caps', width: 256, height: 256, seed: 112 },
  { group: 'terrains', id: 'swamp', subject: 'twisted dead tree rising from murky water', width: 256, height: 256, seed: 113 },
  { group: 'terrains', id: 'plains', subject: 'open grassland horizon with wind-bent grass', width: 256, height: 256, seed: 114 },
  { group: 'terrains', id: 'ruins', subject: 'broken stone arch and toppled column', width: 256, height: 256, seed: 115 },
  // Resource icons (smaller, simpler)
  { group: 'resources', id: 'iron', subject: 'single iron ingot bar', width: 192, height: 192, seed: 210 },
  { group: 'resources', id: 'gold', subject: 'single gold coin with raised stamp', width: 192, height: 192, seed: 211 },
  { group: 'resources', id: 'essence', subject: 'glowing purple orb of arcane essence', width: 192, height: 192, seed: 212 },
  // Mercenary portraits
  { group: 'mercs', id: 'low', subject: 'cloaked rogue mercenary with hidden face, dagger drawn', width: 256, height: 256, seed: 310 },
  { group: 'mercs', id: 'high', subject: 'armored veteran mercenary with greatsword over shoulder', width: 256, height: 256, seed: 311 },
  { group: 'mercs', id: 'specialist', subject: 'mysterious masked mercenary specialist with rune-etched weapon', width: 256, height: 256, seed: 312 },
];

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, '..');

async function fetchOne(asset: Asset): Promise<void> {
  if (ONLY && asset.group !== ONLY) return;
  const outDir = resolve(projectRoot, 'public', 'art', asset.group);
  mkdirSync(outDir, { recursive: true });
  const out = resolve(outDir, `${asset.id}.jpg`);
  if (existsSync(out) && !FORCE) {
    console.log(`[skip] ${asset.group}/${asset.id}`);
    return;
  }
  const prompt = `${asset.subject}, ${STYLE}`;
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${asset.width}&height=${asset.height}&model=flux&nologo=true&seed=${asset.seed}`;
  process.stdout.write(`[fetch] ${asset.group}/${asset.id} ... `);
  const t0 = Date.now();
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.log(`FAILED HTTP ${res.status}`);
      return;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(out, buf);
    console.log(`${(buf.length / 1024).toFixed(1)}KB in ${Date.now() - t0}ms`);
  } catch (e) {
    console.log(`ERROR ${e instanceof Error ? e.message : String(e)}`);
  }
}

for (const asset of ASSETS) await fetchOne(asset);
console.log('\nDone.');
