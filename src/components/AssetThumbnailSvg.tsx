import React, { useMemo } from 'react';
import { AssetBlueprint } from '../game/hotelData';
import { CompositeSubPart } from '../game/rules';
import { getBlueprint3DPreviewParts } from '../game/procedural3D';

interface AssetThumbnailSvgProps {
  blueprint: AssetBlueprint;
  active?: boolean;
}

type Vec3 = [number, number, number];

interface Face3D {
  points2D: Array<[number, number]>;
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity?: number;
  depth: number;
}

interface PartRenderGroup {
  partIndex: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  cx: number;
  cy: number;
  cz: number;
  volume: number;
  faces: Array<{
    verts3D: Vec3[];
    normal: Vec3;
    fill: string;
    stroke: string;
    strokeWidth: number;
    opacity?: number;
    localDepth: number;
  }>;
}

// Orthographic three-quarter studio camera basis (+Z front-left, +X front-right, +Y up)
const CAM_DIR: Vec3 = [0.46, 0.49, 0.74];
const CAM_RIGHT: Vec3 = [0.849, 0, -0.528];
const CAM_UP: Vec3 = [-0.259, 0.872, -0.416];

const KEY_LIGHT: Vec3 = [-0.22, 0.82, 0.53];
const FILL_LIGHT: Vec3 = [0.68, 0.25, 0.69];

function dot3(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function sub3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross3(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}

function normalize3(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]);
  if (len < 1e-6) return [0, 1, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}

function rotateEulerXYZ(p: Vec3, rot?: [number, number, number]): Vec3 {
  if (!rot) return p;
  const [rx, ry, rz] = rot;
  let [x, y, z] = p;

  if (rx !== 0) {
    const cx = Math.cos(rx);
    const sx = Math.sin(rx);
    const ny = y * cx - z * sx;
    const nz = y * sx + z * cx;
    y = ny;
    z = nz;
  }
  if (ry !== 0) {
    const cy = Math.cos(ry);
    const sy = Math.sin(ry);
    const nx = x * cy + z * sy;
    const nz = -x * sy + z * cy;
    x = nx;
    z = nz;
  }
  if (rz !== 0) {
    const cz = Math.cos(rz);
    const sz = Math.sin(rz);
    const nx = x * cz - y * sz;
    const ny = x * sz + y * cz;
    x = nx;
    y = ny;
  }
  return [x, y, z];
}

function parseHexRgb(hex: string): [number, number, number] {
  const cleaned = (hex || '#78716c').replace('#', '').trim();
  if (cleaned.length === 3) {
    const r = parseInt(cleaned[0] + cleaned[0], 16) || 120;
    const g = parseInt(cleaned[1] + cleaned[1], 16) || 113;
    const b = parseInt(cleaned[2] + cleaned[2], 16) || 108;
    return [r, g, b];
  }
  const num = parseInt(cleaned.slice(0, 6), 16);
  if (Number.isNaN(num)) return [120, 113, 108];
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return `#${[clamp(r), clamp(g), clamp(b)]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')}`;
}

function shadeFaceColor(
  baseHex: string,
  normal: Vec3,
  metalness = 0.2,
  roughness = 0.7,
  emissiveHex?: string
): { fill: string; stroke: string } {
  const [br, bg, bb] = parseHexRgb(baseHex);
  const keyDot = Math.max(0, dot3(normal, KEY_LIGHT));
  const fillDot = Math.max(0, dot3(normal, FILL_LIGHT));
  const specBoost = metalness * (1 - roughness * 0.6) * Math.pow(keyDot, 3) * 55;
  const lightFactor = 0.42 + keyDot * 0.52 + fillDot * 0.22;

  let r = br * lightFactor + specBoost;
  let g = bg * lightFactor + specBoost;
  let b = bb * lightFactor + specBoost;

  if (emissiveHex && emissiveHex !== '#000000') {
    const [er, eg, eb] = parseHexRgb(emissiveHex);
    r = r * 0.55 + er * 0.65 + 22;
    g = g * 0.55 + eg * 0.65 + 22;
    b = b * 0.55 + eb * 0.65 + 22;
  }

  const fill = rgbToHex(r, g, b);
  const stroke = rgbToHex(r * 0.56, g * 0.56, b * 0.56);
  return { fill, stroke };
}

function buildLocalPartFaces(part: CompositeSubPart): Vec3[][] {
  const [sx, sy, sz] = part.size;
  const faces: Vec3[][] = [];

  if (part.shape === 'cylinder') {
    const rx = Math.max(0.015, sx * 0.55);
    const rz = Math.max(0.015, (sz || sx) * 0.55);
    const hy = Math.max(0.01, sy * 0.5);
    const segs = 10;
    const topRing: Vec3[] = [];
    const botRing: Vec3[] = [];
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const x = Math.cos(a) * rx;
      const z = Math.sin(a) * rz;
      topRing.push([x, hy, z]);
      botRing.push([x, -hy, z]);
    }
    for (let i = 0; i < segs; i++) {
      const next = (i + 1) % segs;
      faces.push([botRing[next], botRing[i], topRing[i], topRing[next]]);
    }
    faces.push([...topRing].reverse());
    faces.push(botRing);
    return faces;
  }

  if (part.shape === 'cone') {
    const rx = Math.max(0.015, sx * 0.58);
    const rz = Math.max(0.015, (sz || sx) * 0.58);
    const hy = Math.max(0.015, sy * 0.5);
    const segs = 10;
    const apex: Vec3 = [0, hy, 0];
    const botRing: Vec3[] = [];
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      botRing.push([Math.cos(a) * rx, -hy, Math.sin(a) * rz]);
    }
    for (let i = 0; i < segs; i++) {
      const next = (i + 1) % segs;
      faces.push([botRing[next], botRing[i], apex]);
    }
    faces.push(botRing);
    return faces;
  }

  if (part.shape === 'sphere') {
    const rx = Math.max(0.02, sx * 0.58);
    const ry = Math.max(0.02, (sy || sx) * 0.58);
    const rz = Math.max(0.02, (sz || sx) * 0.58);
    const latSteps = 5;
    const lonSteps = 8;
    for (let lat = 0; lat < latSteps; lat++) {
      const theta1 = (lat / latSteps) * Math.PI;
      const theta2 = ((lat + 1) / latSteps) * Math.PI;
      for (let lon = 0; lon < lonSteps; lon++) {
        const phi1 = (lon / lonSteps) * Math.PI * 2;
        const phi2 = ((lon + 1) / lonSteps) * Math.PI * 2;
        const p1: Vec3 = [
          Math.sin(theta1) * Math.cos(phi1) * rx,
          Math.cos(theta1) * ry,
          Math.sin(theta1) * Math.sin(phi1) * rz
        ];
        const p2: Vec3 = [
          Math.sin(theta1) * Math.cos(phi2) * rx,
          Math.cos(theta1) * ry,
          Math.sin(theta1) * Math.sin(phi2) * rz
        ];
        const p3: Vec3 = [
          Math.sin(theta2) * Math.cos(phi2) * rx,
          Math.cos(theta2) * ry,
          Math.sin(theta2) * Math.sin(phi2) * rz
        ];
        const p4: Vec3 = [
          Math.sin(theta2) * Math.cos(phi1) * rx,
          Math.cos(theta2) * ry,
          Math.sin(theta2) * Math.sin(phi1) * rz
        ];
        faces.push([p1, p2, p3, p4]);
      }
    }
    return faces;
  }

  if (part.shape === 'torus') {
    const majorR = Math.max(0.03, sx * 0.55);
    const tubeR = Math.max(0.012, Math.min(sy * 0.48, majorR * 0.45));
    const uSteps = 10;
    const vSteps = 6;
    for (let u = 0; u < uSteps; u++) {
      const u1 = (u / uSteps) * Math.PI * 2;
      const u2 = ((u + 1) / uSteps) * Math.PI * 2;
      for (let v = 0; v < vSteps; v++) {
        const v1 = (v / vSteps) * Math.PI * 2;
        const v2 = ((v + 1) / vSteps) * Math.PI * 2;
        const pt = (ua: number, va: number): Vec3 => [
          (majorR + tubeR * Math.cos(va)) * Math.cos(ua),
          (majorR + tubeR * Math.cos(va)) * Math.sin(ua),
          tubeR * Math.sin(va)
        ];
        faces.push([pt(u1, v1), pt(u2, v1), pt(u2, v2), pt(u1, v2)]);
      }
    }
    return faces;
  }

  // Default: 'box'
  const hx = Math.max(0.008, sx * 0.5);
  const hy = Math.max(0.008, sy * 0.5);
  const hz = Math.max(0.008, sz * 0.5);

  const v000: Vec3 = [-hx, -hy, -hz];
  const v100: Vec3 = [hx, -hy, -hz];
  const v110: Vec3 = [hx, hy, -hz];
  const v010: Vec3 = [-hx, hy, -hz];
  const v001: Vec3 = [-hx, -hy, hz];
  const v101: Vec3 = [hx, -hy, hz];
  const v111: Vec3 = [hx, hy, hz];
  const v011: Vec3 = [-hx, hy, hz];

  return [
    [v001, v101, v111, v011], // +Z Front
    [v100, v000, v010, v110], // -Z Back
    [v101, v100, v110, v111], // +X Right
    [v000, v001, v011, v010], // -X Left
    [v011, v111, v110, v010], // +Y Top
    [v000, v100, v101, v001]  // -Y Bottom
  ];
}

function comparePartGroups(a: PartRenderGroup, b: PartRenderGroup): number {
  const eps = 0.025;
  const overlapX = a.minX < b.maxX - eps && b.minX < a.maxX - eps;
  const overlapY = a.minY < b.maxY - eps && b.minY < a.maxY - eps;
  const overlapZ = a.minZ < b.maxZ - eps && b.minZ < a.maxZ - eps;

  // If one part is smaller and attached to or overlapping another larger hull part on its visible side
  if (overlapX && overlapY && overlapZ) {
    if (b.volume < a.volume * 0.72) {
      const bOnVisibleSide =
        b.maxZ >= a.maxZ - 0.06 || b.maxY >= a.maxY - 0.06 || b.maxX >= a.maxX - 0.06;
      if (bOnVisibleSide) return -1;
    }
    if (a.volume < b.volume * 0.72) {
      const aOnVisibleSide =
        a.maxZ >= b.maxZ - 0.06 || a.maxY >= b.maxY - 0.06 || a.maxX >= b.maxX - 0.06;
      if (aOnVisibleSide) return 1;
    }
  }

  // Non-overlapping axis separation along camera octant (+X, +Y, +Z)
  if (overlapX && overlapY && a.maxZ <= b.minZ + eps) return -1;
  if (overlapX && overlapY && b.maxZ <= a.minZ + eps) return 1;

  if (overlapX && overlapZ && a.maxY <= b.minY + eps) return -1;
  if (overlapX && overlapZ && b.maxY <= a.minY + eps) return 1;

  if (overlapY && overlapZ && a.maxX <= b.minX + eps) return -1;
  if (overlapY && overlapZ && b.maxX <= a.minX + eps) return 1;

  const scoreA =
    dot3([a.cx, a.cy, a.cz], CAM_DIR) * 0.55 +
    dot3([a.maxX, a.maxY, a.maxZ], CAM_DIR) * 0.45 +
    a.partIndex * 0.002;
  const scoreB =
    dot3([b.cx, b.cy, b.cz], CAM_DIR) * 0.55 +
    dot3([b.maxX, b.maxY, b.maxZ], CAM_DIR) * 0.45 +
    b.partIndex * 0.002;
  return scoreA - scoreB;
}

export const AssetThumbnailSvg: React.FC<AssetThumbnailSvgProps> = ({ blueprint, active }) => {
  if (!blueprint) {
    return <div className="relative w-full h-16 rounded-xl bg-stone-900/60" />;
  }

  const defaultColor = blueprint.defaultColor || '#592820';
  const safeDims: [number, number, number] =
    Array.isArray(blueprint.defaultDimensions) && blueprint.defaultDimensions.length >= 2
      ? [
          Number(blueprint.defaultDimensions[0]) || 1,
          Number(blueprint.defaultDimensions[1]) || 1,
          Number(blueprint.defaultDimensions[2]) || 1
        ]
      : [1, 1, 1];

  const { renderedFaces, pedestalPoints } = useMemo(() => {
    const parts = getBlueprint3DPreviewParts(blueprint);
    const partGroups: PartRenderGroup[] = [];

    let globalMinU = Infinity;
    let globalMaxU = -Infinity;
    let globalMinV = Infinity;
    let globalMaxV = -Infinity;
    let worldMinX = Infinity;
    let worldMaxX = -Infinity;
    let worldMinY = Infinity;
    let worldMinZ = Infinity;
    let worldMaxZ = -Infinity;

    parts.forEach((part, partIndex) => {
      const localFaces = buildLocalPartFaces(part);
      const [ox, oy, oz] = part.offset;

      let pMinX = Infinity;
      let pMaxX = -Infinity;
      let pMinY = Infinity;
      let pMaxY = -Infinity;
      let pMinZ = Infinity;
      let pMaxZ = -Infinity;

      const visibleFaces: PartRenderGroup['faces'] = [];

      for (const localVerts of localFaces) {
        const worldVerts: Vec3[] = localVerts.map((lv) => {
          const rotV = rotateEulerXYZ(lv, part.rotation);
          const wx = rotV[0] + ox;
          const wy = rotV[1] + oy;
          const wz = rotV[2] + oz;

          if (wx < pMinX) pMinX = wx;
          if (wx > pMaxX) pMaxX = wx;
          if (wy < pMinY) pMinY = wy;
          if (wy > pMaxY) pMaxY = wy;
          if (wz < pMinZ) pMinZ = wz;
          if (wz > pMaxZ) pMaxZ = wz;

          if (wx < worldMinX) worldMinX = wx;
          if (wx > worldMaxX) worldMaxX = wx;
          if (wy < worldMinY) worldMinY = wy;
          if (wz < worldMinZ) worldMinZ = wz;
          if (wz > worldMaxZ) worldMaxZ = wz;

          const u = dot3([wx, wy, wz], CAM_RIGHT);
          const v = -dot3([wx, wy, wz], CAM_UP);
          if (u < globalMinU) globalMinU = u;
          if (u > globalMaxU) globalMaxU = u;
          if (v < globalMinV) globalMinV = v;
          if (v > globalMaxV) globalMaxV = v;

          return [wx, wy, wz];
        });

        if (worldVerts.length >= 3) {
          const e1 = sub3(worldVerts[1], worldVerts[0]);
          const e2 = sub3(worldVerts[2], worldVerts[0]);
          const normal = normalize3(cross3(e1, e2));
          if (dot3(normal, CAM_DIR) > -0.03) {
            const centroid: Vec3 = [
              worldVerts.reduce((s, p) => s + p[0], 0) / worldVerts.length,
              worldVerts.reduce((s, p) => s + p[1], 0) / worldVerts.length,
              worldVerts.reduce((s, p) => s + p[2], 0) / worldVerts.length
            ];
            const { fill, stroke } = shadeFaceColor(
              part.color || defaultColor,
              normal,
              part.metalness ?? 0.2,
              part.roughness ?? 0.7,
              part.emissive
            );
            visibleFaces.push({
              verts3D: worldVerts,
              normal,
              fill,
              stroke,
              strokeWidth: part.shape === 'sphere' || part.shape === 'torus' ? 0.35 : 0.65,
              localDepth: dot3(centroid, CAM_DIR)
            });
          }
        }
      }

      if (visibleFaces.length > 0) {
        visibleFaces.sort((a, b) => a.localDepth - b.localDepth);
        const dx = Math.max(0.01, pMaxX - pMinX);
        const dy = Math.max(0.01, pMaxY - pMinY);
        const dz = Math.max(0.01, pMaxZ - pMinZ);
        partGroups.push({
          partIndex,
          minX: pMinX,
          maxX: pMaxX,
          minY: pMinY,
          maxY: pMaxY,
          minZ: pMinZ,
          maxZ: pMaxZ,
          cx: (pMinX + pMaxX) * 0.5,
          cy: (pMinY + pMaxY) * 0.5,
          cz: (pMinZ + pMaxZ) * 0.5,
          volume: dx * dy * dz,
          faces: visibleFaces
        });
      }
    });

    // Order parts from back/bottom/hull to front/top/detail
    partGroups.sort(comparePartGroups);

    const spanU = Math.max(0.18, globalMaxU - globalMinU);
    const spanV = Math.max(0.18, globalMaxV - globalMinV);
    const scale = Math.min(74 / spanU, 52 / spanV);
    const centerU = (globalMinU + globalMaxU) * 0.5;
    const centerV = (globalMinV + globalMaxV) * 0.5;

    const projectToSvg = (pt: Vec3): [number, number] => {
      const u = dot3(pt, CAM_RIGHT);
      const v = -dot3(pt, CAM_UP);
      const sx = Number((60 + (u - centerU) * scale).toFixed(1));
      const sy = Number((39 + (v - centerV) * scale).toFixed(1));
      return [sx, sy];
    };

    const facesOut: Face3D[] = [];
    partGroups.forEach((grp) => {
      grp.faces.forEach((f) => {
        facesOut.push({
          points2D: f.verts3D.map(projectToSvg),
          fill: f.fill,
          stroke: f.stroke,
          strokeWidth: f.strokeWidth,
          opacity: f.opacity,
          depth: f.localDepth
        });
      });
    });

    // Project studio floor pedestal beneath the 3D bounding footprint
    const padX = Math.max(0.15, (worldMaxX - worldMinX) * 0.18);
    const padZ = Math.max(0.15, (worldMaxZ - worldMinZ) * 0.18);
    const py = Number.isFinite(worldMinY) ? worldMinY - 0.01 : 0;
    const pedCorners: Vec3[] = [
      [worldMinX - padX, py, worldMinZ - padZ],
      [worldMaxX + padX, py, worldMinZ - padZ],
      [worldMaxX + padX, py, worldMaxZ + padZ],
      [worldMinX - padX, py, worldMaxZ + padZ]
    ];
    const pedPts = Number.isFinite(worldMinX)
      ? pedCorners.map(projectToSvg).map(([x, y]) => `${x},${y}`).join(' ')
      : '60,52 96,65 60,76 24,65';

    return { renderedFaces: facesOut, pedestalPoints: pedPts };
  }, [blueprint, defaultColor]);

  const swatchColors = useMemo(() => {
    const parts = getBlueprint3DPreviewParts(blueprint);
    const unique: string[] = [];
    if (defaultColor) unique.push(defaultColor);
    for (const p of parts) {
      if (p.color && !unique.includes(p.color)) {
        unique.push(p.color);
      }
      if (unique.length >= 3) break;
    }
    while (unique.length < 3) {
      unique.push(unique.length === 1 ? '#8a8170' : '#3b2314');
    }
    return unique.slice(0, 3);
  }, [blueprint, defaultColor]);

  return (
    <div
      className={`relative w-full h-16 rounded-xl overflow-hidden flex items-center justify-center transition-all ${
        active
          ? 'bg-gradient-to-b from-[#2b241d] via-[#362c22] to-[#1f1a15] ring-2 ring-[#b45309]'
          : 'bg-gradient-to-b from-[#1c1a18] via-[#262320] to-[#171513] group-hover:from-[#262320] group-hover:to-[#302b25]'
      }`}
    >
      <svg
        viewBox="0 0 120 80"
        className="w-full h-full object-contain drop-shadow-sm"
        aria-hidden="true"
      >
        {/* Isometric studio pedestal grid under the 3D model */}
        <polygon
          points={pedestalPoints}
          fill="#26211d"
          fillOpacity="0.72"
          stroke="#574c3f"
          strokeWidth="0.6"
        />

        {/* Shaded 3D Orthographic Projection of Actual In-Game Model Parts */}
        <g>
          {renderedFaces.map((face, idx) => (
            <polygon
              key={idx}
              points={face.points2D.map(([x, y]) => `${x},${y}`).join(' ')}
              fill={face.fill}
              stroke={face.stroke}
              strokeWidth={face.strokeWidth}
              strokeLinejoin="round"
              fillOpacity={face.opacity ?? 1}
            />
          ))}
        </g>
      </svg>

      {/* Actual Model Swatch Dots in Top-Left Corner */}
      <div className="absolute top-1.5 left-1.5 flex items-center gap-0.5 bg-stone-900/80 backdrop-blur-xs px-1 py-0.5 rounded-full shadow-2xs border border-stone-700">
        {swatchColors.map((hex, idx) => (
          <span
            key={idx}
            className="w-2 h-2 rounded-full border border-stone-500"
            style={{ backgroundColor: hex }}
          />
        ))}
      </div>

      {/* Animation / Sound Capability Badge in Top-Right Corner */}
      {(blueprint.animationSpec || blueprint.soundPresetId) && (
        <span
          title={`${blueprint.animationSpec ? `Anim: ${blueprint.animationSpec}` : ''}${
            blueprint.soundPresetId ? ` · SFX: ${blueprint.soundPresetId}` : ''
          }`}
          className="absolute top-1 right-1.5 px-1 py-0.2 bg-amber-950/90 text-amber-300 text-[8px] font-bold rounded-full border border-amber-700/70"
        >
          {blueprint.animationSpec ? '🎞️' : ''}
          {blueprint.soundPresetId ? '🔊' : ''}
        </span>
      )}

      {/* Dimensions Pill in Bottom-Right Corner */}
      <span className="absolute bottom-1 right-1.5 px-1.5 py-0.2 bg-stone-950/85 text-amber-200/90 text-[9px] font-mono rounded-full border border-stone-700/80">
        {safeDims[0]}×{safeDims[1]}m
      </span>
    </div>
  );
};
