import type { ImagePlacement, UploadedImage, ImageAnalysis } from '../types';
const EDGE_MARGIN = 0.03; const OVERLAP_MAX = 1 / 6;
function is43Horizontal(img: UploadedImage): boolean { const r = img.naturalWidth / img.naturalHeight; return r >= 1.25 && r <= 1.55; }
function rand(min: number, max: number): number { return min + Math.random() * (max - min); }
function overlapRect(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) { const ox = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)); const oy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)); if (ox <= 0 || oy <= 0) return null; return { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y), w: ox, h: oy }; }
function overlapArea(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): number { const r = overlapRect(a, b); return r ? r.w * r.h : 0; }
function isOverlapInEdgeZone(imgR: { x: number; y: number; w: number; h: number }, oR: { x: number; y: number; w: number; h: number }): boolean { const ol = oR.x - imgR.x, ot = oR.y - imgR.y; return oR.x + oR.w <= imgR.w * 0.25 + imgR.x || ol >= imgR.w * 0.75 || oR.y + oR.h <= imgR.h * 0.25 + imgR.y || ot >= imgR.h * 0.75; }
function validateOverlap(x: number, y: number, w: number, h: number, rects: { x: number; y: number; w: number; h: number; isBg: boolean }[]): { valid: boolean; ratio: number } { let maxRatio = 0; for (const r of rects) { const oa = overlapArea({ x, y, w, h }, r); if (oa === 0) continue; const cr = oa / (r.w * r.h); if (cr > maxRatio) maxRatio = cr; if (r.isBg) continue; const oR = overlapRect({ x, y, w, h }, r); if (oR && (!isOverlapInEdgeZone({ x, y, w, h }, oR) || !isOverlapInEdgeZone(r, oR))) return { valid: false, ratio: maxRatio }; } return { valid: maxRatio <= OVERLAP_MAX, ratio: maxRatio }; }
function computeZ(analysis: ImageAnalysis | null): number { let z = 0; if ((analysis?.skyScore ?? 0) > 0.4) z -= 10; if ((analysis?.portraitScore ?? 0) > 0.35) z += 10; z += (analysis?.textureComplexity ?? 0.3) * 5; z += (analysis?.warmthScore ?? 0.3) * 3; return z; }
export interface PlacementResult { placements: ImagePlacement[]; fullBgImageIndex: number; debug: string[]; }

function computeFaceOnCanvas(idx: number, px: number, py: number, pw: number, ph: number, images: UploadedImage[], analyses: (ImageAnalysis | null)[]): { fx: number; fy: number } | null {
  const fr = analyses[idx]?.faceRegion; if (!fr) return null;
  const iw = images[idx].naturalWidth, ih = images[idx].naturalHeight, sa = pw / ph, ia = iw / ih;
  let sx = 0, sy = 0, sw = iw, sh = ih;
  if (ia > sa) { sw = Math.round(ih * sa); sx = Math.round((iw - sw) / 2); } else { sh = Math.round(iw / sa); sy = Math.round((ih - sh) / 2); }
  const fsx = fr.cx * iw, fsy = fr.cy * ih;
  if (fsx < sx || fsx > sx + sw || fsy < sy || fsy > sy + sh) return null;
  return { fx: px + (fsx - sx) / sw * pw, fy: py + (fsy - sy) / sh * ph };
}
function isFaceOnCutLine(idx: number, slot: { x: number; y: number; w: number; h: number }, cw: number, ch: number, images: UploadedImage[], analyses: (ImageAnalysis | null)[]): boolean {
  let fr = analyses[idx]?.faceRegion; if (!fr) { const r = images[idx].naturalWidth / images[idx].naturalHeight; if (r < 1) fr = { cx: 0.5, cy: 0.5, r: 0.18 }; }
  if (!fr || !cw) return false;
  const px = slot.x * cw, py = slot.y * ch, pw = slot.w * cw, ph = slot.h * ch;
  const pos = computeFaceOnCanvas(idx, px, py, pw, ph, images, analyses); if (!pos) return true;
  const cappedR = Math.min(fr.r, 0.22); const fR = cappedR * Math.max(pw, ph) + 50;
  for (let b = cw; b < cw * 3; b += cw) if (Math.abs(pos.fx - b) < fR) return true; return false;
}
function swapFacesOffCutLines(assigned: Map<number, number>, slots: { x: number; y: number; w: number; h: number }[], cw: number, ch: number, images: UploadedImage[], analyses: (ImageAnalysis | null)[]): Map<number, number> {
  const bad: { idx: number; si: number }[] = [], good: { idx: number; si: number }[] = [];
  for (const [idx, si] of assigned) { if (isFaceOnCutLine(idx, slots[si], cw, ch, images, analyses)) bad.push({ idx, si }); else good.push({ idx, si }); }
  for (const b of bad) {
    for (let j = 0; j < good.length; j++) {
      const g = good[j];
      assigned.set(b.idx, g.si); assigned.set(g.idx, b.si);
      if (!isFaceOnCutLine(b.idx, slots[g.si], cw, ch, images, analyses) && !isFaceOnCutLine(g.idx, slots[b.si], cw, ch, images, analyses)) {
        good.splice(j, 1); break;
      }
      assigned.set(b.idx, b.si); assigned.set(g.idx, g.si);
    }
  }
  return assigned;
}
function assignSlots(slots: { x: number; y: number; w: number; h: number }[], images: UploadedImage[], indices: number[], analyses?: (ImageAnalysis | null)[], preferNoFace?: boolean[]): Map<number, number> {
  const assigned = new Map<number, number>(); const pool = [...indices];
  function doSlot(si: number) { const sa = slots[si].w / slots[si].h; let best = -1, bestD = Infinity; const pnf = preferNoFace?.[si]; for (const idx of pool) { if (assigned.has(idx)) continue; if (pnf && analyses?.[idx]?.faceRegion) continue; const d = Math.abs((images[idx].naturalWidth / images[idx].naturalHeight) - sa); if (d < bestD) { bestD = d; best = idx; } } if (best < 0 && pnf) { for (const idx of pool) { if (assigned.has(idx)) continue; const d = Math.abs((images[idx].naturalWidth / images[idx].naturalHeight) - sa); if (d < bestD) { bestD = d; best = idx; } } } if (best >= 0) assigned.set(best, si); }
  for (let si = 0; si < slots.length; si++) { if (preferNoFace?.[si]) doSlot(si); } for (let si = 0; si < slots.length; si++) { if (!preferNoFace?.[si]) doSlot(si); } return assigned;
}
function placeSlot(idx: number, slot: { x: number; y: number; w: number; h: number }, cw: number, ch: number, images: UploadedImage[], z: number, placements: ImagePlacement[], rects: { x: number; y: number; w: number; h: number; idx: number; isBg: boolean }[], analyses: (ImageAnalysis | null)[]) {
  const px = Math.round(slot.x * cw), py = Math.round(slot.y * ch), pw = Math.round(slot.w * cw), ph = Math.round(slot.h * ch);
  const iw = images[idx].naturalWidth, ih = images[idx].naturalHeight, sa = pw / ph, ia = iw / ih;
  let sx = 0, sy = 0, sw = iw, sh = ih;
  if (ia > sa) { sw = Math.round(ih * sa); sx = Math.round((iw - sw) / 2); } else { sh = Math.round(iw / sa); sy = Math.round((ih - sh) / 2); }
  placements.push({ imageIndex: idx, x: px, y: py, width: pw, height: ph, zIndex: z, sx, sy, sw, sh }); rects.push({ x: px, y: py, w: pw, h: ph, idx, isBg: false });
}
function faceNearCutLine(x: number, y: number, w: number, h: number, fr: { cx: number; cy: number; r: number } | null | undefined, cw: number | undefined, idx?: number, images?: UploadedImage[], analyses?: (ImageAnalysis | null)[]): boolean {
  if (!cw || cw <= 0) return false; let faceX: number, faceR: number;
  if (idx !== undefined && images && analyses) { const pos = computeFaceOnCanvas(idx, x, y, w, h, images, analyses); if (!pos) return true; faceX = pos.fx; faceR = (fr?.r ?? 0.18) * Math.max(w, h) + 10; }
  else { if (!fr) return false; faceX = x + fr.cx * w; faceR = fr.r * Math.max(w, h) + 10; } return Math.abs(faceX % cw) < faceR || Math.abs(cw - (faceX % cw)) < faceR;
}

export function placeImages(canvasW: number, canvasH: number, images: UploadedImage[], analyses: (ImageAnalysis | null)[], imageIndices: number[], manualGroups?: number[][], cellWidth?: number, layoutVariant?: number): PlacementResult {
  const placements: ImagePlacement[] = [], rects: { x: number; y: number; w: number; h: number; idx: number; isBg: boolean }[] = [], debug: string[] = [];
  const gm = new Set<number>(); if (manualGroups) for (const g of manualGroups) for (const idx of g) gm.add(idx);
  const remaining = [...imageIndices]; const edge43 = new Set<number>(); for (const idx of remaining) { if (is43Horizontal(images[idx])) edge43.add(idx); }
  const goc: number[][] = []; if (manualGroups) { for (const g of manualGroups) { const v = g.filter(idx => remaining.includes(idx)); if (v.length >= 2) goc.push(v); } }
  const gis = new Set<number>(); for (const g of goc) for (const idx of g) gis.add(idx);
  const soloIndices = remaining.filter(i => !gis.has(i));
  const orderedSolo = [...soloIndices].sort((a, b) => computeZ(analyses[a]) - computeZ(analyses[b]));
  debug.push(`canvas: ${remaining.join(',')} | groups: ${goc.map(g => '[' + g.join(',') + ']').join(' ')}`);
  const specialPlaced = new Set<number>();
  const is2cell = cellWidth && Math.abs(canvasW - cellWidth * 2) < 10, is3cell = cellWidth && Math.abs(canvasW - cellWidth * 3) < 10;
  const T = (k: string) => typeof window !== 'undefined' && new URLSearchParams(window.location.search).has(k);
  const tL0 = T('layout0_1'), tL02 = T('layout0_2'), tL1 = T('layout1_1'), tL12 = T('layout1_2'), tL13 = T('layout1_3');
  const tL2 = T('layout2_1'), tL22 = T('layout2_2'), tL23 = T('layout2_3'), tL24 = T('layout2_4'), tL25 = T('layout2_5'), tL3 = T('layout3_1'), tL32 = T('layout3_2'), tL33 = T('layout3_3'), tL34 = T('layout3_4');
  const tL4 = T('layout4_1'), tL42 = T('layout4_2'), tL43 = T('layout4_3'), tL44 = T('layout4_4'), tL5 = T('layout5_1'), tL52 = T('layout5_2'), tL53 = T('layout5_3');
  const IC = soloIndices.length;

  function doLayout(slots: { x: number; y: number; w: number; h: number }[], zMap?: ((si: number) => number), prefNoFace?: boolean[], name?: string, noShiftSlots?: Set<number>) {
    debug.push(`  faces: ${soloIndices.map(i => { const fr = analyses[i]?.faceRegion; const r = images[i].naturalWidth / images[i].naturalHeight; const fb = !fr && r < 1; return `#${i}:${!!fr}${fr?`(${fr.cx.toFixed(1)},${fr.cy.toFixed(1)})`:fb?'(fb)':''}`; }).join(' ')}`);
    let a = assignSlots(slots, images, soloIndices, analyses, prefNoFace); if (a.size < slots.length) return;
    a = swapFacesOffCutLines(a, slots, cellWidth!, canvasH, images, analyses);
    debug.push('  swap: ' + [...a.entries()].map(([id2,si2]) => `#${id2}@s${si2}:${isFaceOnCutLine(id2, slots[si2], cellWidth!, canvasH, images, analyses)}`).join(' '));
    const si0 = placements.length;
    for (const [idx, si] of a) { debug.push(`  SLOT #${idx} -> s${si}`); const z = zMap ? zMap(si) : 1; placeSlot(idx, slots[si], cellWidth!, canvasH, images, z, placements, rects, analyses); specialPlaced.add(idx); }
    for (let i = si0; i < placements.length; i++) {
      const p = placements[i]; const id = p.imageIndex; const ms = [...a.entries()].find(([k]) => k === id)?.[1];
      if (noShiftSlots && ms !== undefined && noShiftSlots.has(ms)) continue;
      const slot = slots[ms ?? 0]; if (!slot) continue;
      const sw2 = Math.round(slot.w * cellWidth!), sh2 = Math.round(slot.h * canvasH);
      const pos = computeFaceOnCanvas(id, p.x, p.y, sw2, sh2, images, analyses); if (!pos) continue;
      const cw = cellWidth!; const cappedR = Math.min(analyses[id]?.faceRegion?.r ?? 0.18, 0.22);
      for (let b = cw; b < cw * 3; b += cw) { const margin = cappedR * Math.max(sw2, sh2) + 50; if (Math.abs(pos.fx - b) < margin) { const shift = pos.fx < b ? -(margin - (b - pos.fx)) : (margin - (pos.fx - b)); p.x = p.x + Math.max(-100, Math.min(100, shift)); let ov: ImagePlacement | null = null; for (let j = si0; j < placements.length; j++) { if (j === i) continue; const q = placements[j]; const ox = Math.max(0, Math.min(p.x + p.width, q.x + q.width) - Math.max(p.x, q.x)); const oy = Math.max(0, Math.min(p.y + p.height, q.y + q.height) - Math.max(p.y, q.y)); if (ox * oy > 0) { ov = q; break; } } if (ov) { p.zIndex = (p.width * p.height) < (ov.width * ov.height) ? p.zIndex + 10 : p.zIndex - 1; } break; } }
    }
    debug.push(`${name}: ${a.size} images`);
  }

  if (is2cell && (tL0 || tL02 || IC === 3)) {
    const is02 = tL02 || (!tL0 && (layoutVariant === 2 || (layoutVariant !== 1 && Math.random() > 0.5)));
    const s0 = is02 ? [{x:0,y:0,w:1.332,h:1.0},{x:1.265,y:0.151,w:0.472,h:0.321},{x:1.265,y:0.528,w:0.472,h:0.321}] : [{x:0.134,y:0.394,w:0.464,h:0.578},{x:0.425,y:0,w:1.151,h:1.0},{x:1.363,y:0.056,w:0.595,h:0.397}];
    doLayout(s0, is02 ? (si => (si === 1 || si === 2) ? 5 : 0) : (si => (si === 0 || si === 2) ? 5 : 0), undefined, `LAYOUT0_${is02?'2':'1'}`);
  }

  if (is3cell) {
    const allL = [tL0,tL02,tL1,tL12,tL13,tL2,tL22,tL23,tL24,tL25,tL3,tL32,tL33,tL34,tL4,tL42,tL43,tL44,tL5,tL52,tL53]; const anyT = allL.some(x=>x);
    const u1 = tL1 || tL12 || tL13 || (!anyT && IC === 4);
    const u5 = tL5 || tL52 || tL53 || (!anyT && IC === 8);
    const u4 = tL4 || tL42 || tL43 || tL44 || (!anyT && IC === 7);
    const u3 = tL3 || tL32 || tL33 || tL34 || (!anyT && IC === 6);
    const u2 = tL2 || tL22 || tL23 || tL24 || tL25 || (!anyT && IC >= 5 && IC < 6);
    let fired = false;

    if (u1 && !fired) { let v=1; if(tL13)v=3;else if(tL12)v=2;else if(tL1)v=1;else if(layoutVariant)v=layoutVariant;else v=Math.floor(Math.random()*3)+1; const s3=[{x:0.117,y:0.358,w:0.763,h:0.573},{x:0.827,y:0.070,w:0.620,h:0.930},{x:1.581,y:0.025,w:0.763,h:0.573},{x:2.123,y:0.411,w:0.763,h:0.573}]; const s2=[{x:0.117,y:0.159,w:0.511,h:0.679},{x:0.757,y:0,w:0.810,h:0.444},{x:0.757,y:0.556,w:0.810,h:0.444},{x:1.774,y:0.106,w:1.067,h:0.791}]; const s1=[{x:0,y:0,w:1.332,h:1.0},{x:1.265,y:0.151,w:0.472,h:0.321},{x:1.265,y:0.528,w:0.472,h:0.321},{x:2.103,y:0.115,w:0.791,h:0.592}]; const s=v===3?s3:(v===2?s2:s1); const z=v===3?(si=>si===0?5:si===1?0:si===3?5:si===2?0:1):v===1?(si=>si===0?0:1):undefined; doLayout(s,z,undefined,`LAYOUT1_${v===3?'3':v===2?'2':'1'}`); fired=specialPlaced.size>0; }
    if (u3 && !fired) { let v=1; if(tL34)v=4;else if(tL33)v=3;else if(tL32)v=2;else if(tL3)v=1;else if(layoutVariant)v=layoutVariant;else v=Math.floor(Math.random()*4)+1; const s4=[{x:0.117,y:0.131,w:0.511,h:0.679},{x:0.550,y:0.520,w:0.810,h:0.444},{x:0.788,y:0.056,w:0.545,h:0.363},{x:1.397,y:0.168,w:0.469,h:0.626},{x:1.913,y:0.042,w:0.682,h:0.506},{x:2.411,y:0.458,w:0.506,h:0.506}]; const s3=[{x:0.084,y:0.042,w:0.416,h:0.313},{x:0.268,y:0.427,w:0.466,h:0.466},{x:0.804,y:0.034,w:0.436,h:0.578},{x:1.285,y:0.472,w:0.458,h:0.304},{x:1.612,y:0.285,w:0.888,h:0.668},{x:2.561,y:0.081,w:0.377,h:0.503}]; const s2=[{x:0.101,y:0.182,w:0.416,h:0.313},{x:0.254,y:0.550,w:0.503,h:0.377},{x:0.707,y:0,w:0.751,h:1.0},{x:1.500,y:0.556,w:0.458,h:0.304},{x:1.891,y:0.042,w:0.344,h:0.458},{x:2.355,y:0.159,w:0.598,h:0.793}]; const s1=[{x:0.050,y:0.159,w:0.511,h:0.679},{x:0.682,y:0.042,w:0.416,h:0.553},{x:1.117,y:0.556,w:0.304,h:0.458},{x:1.542,y:0,w:0.751,h:1.0},{x:2.363,y:0.466,w:0.310,h:0.464},{x:2.721,y:0.059,w:0.279,h:0.497}]; const s=v===4?s4:(v===3?s3:(v===2?s2:s1)); const z=v===4?(si=>si===1?5:si===0?0:si===5?5:si===4?0:1):v===3?(si=>si===3?5:si===4?0:undefined):v===2?(si=>si===1?5:si===2?0:1):undefined; doLayout(s,z,undefined,`LAYOUT3_${v===4?'4':v===3?'3':v===2?'2':'1'}`); fired=specialPlaced.size>0; }
    if (u5 && !fired) { let v=1; if(tL53)v=3;else if(tL52)v=2;else if(tL5)v=1;else if(layoutVariant)v=layoutVariant;else v=Math.floor(Math.random()*3)+1; if(v===3){doLayout([{x:0.031,y:0.453,w:0.531,h:0.475},{x:0.344,y:0.047,w:0.623,h:0.466},{x:0.777,y:0.620,w:0.464,h:0.307},{x:1.101,y:0.031,w:0.402,h:0.539},{x:1.500,y:0.626,w:0.461,h:0.335},{x:1.603,y:0.142,w:0.469,h:0.318},{x:2.137,y:0.028,w:0.358,h:0.511},{x:2.456,y:0.260,w:0.489,h:0.701}],si=>si===7?0:si===6?5:1,undefined,'LAYOUT5_3');}else if(v===2){doLayout([{x:0.020,y:0.014,w:0.480,h:0.321},{x:0.020,y:0.358,w:0.480,h:0.321},{x:0.209,y:0,w:0.751,h:1.0},{x:1.034,y:0.028,w:0.620,h:0.466},{x:1.173,y:0.542,w:0.480,h:0.360},{x:1.701,y:0.087,w:0.704,h:0.939},{x:2.151,y:0,w:0.662,h:0.497},{x:2.500,y:0.556,w:0.480,h:0.360}],si=>si<=1?5:si===2?0:si===6?3:1,[false,false,true,false,false,true,false,false],'LAYOUT5_2');}else{doLayout([{x:0.089,y:0.061,w:0.413,h:0.310},{x:0.089,y:0.461,w:0.363,h:0.483},{x:0.383,y:0.282,w:0.274,h:0.363},{x:0.712,y:0,w:0.751,h:1.0},{x:1.500,y:0.567,w:0.265,h:0.352},{x:1.578,y:0.081,w:0.606,h:0.405},{x:1.807,y:0.427,w:0.615,h:0.411},{x:2.478,y:0.140,w:0.500,h:0.665}],si=>si===2?5:si===5?5:si===0||si===1||si===6?0:1,undefined,'LAYOUT5_1');} fired=specialPlaced.size>0; }
    if (u4 && !fired) { let v=1; if(tL44)v=4;else if(tL43)v=3;else if(tL42)v=2;else if(tL4)v=1;else if(layoutVariant)v=layoutVariant;else v=Math.floor(Math.random()*4)+1; const s4=[{x:0.047,y:0,w:0.732,h:0.475},{x:0.131,y:0.556,w:0.735,h:0.444},{x:0.679,y:0.154,w:0.793,h:0.693},{x:1.562,y:0,w:0.729,h:0.444},{x:1.525,y:0.520,w:0.425,h:0.425},{x:2.411,y:0.022,w:0.279,h:0.399},{x:2.182,y:0.556,w:0.735,h:0.444}]; const s3=[{x:0.117,y:0.050,w:0.472,h:0.321},{x:0.117,y:0.413,w:0.472,h:0.321},{x:0.570,y:0.031,w:1.402,h:0.936},{x:2.014,y:0.031,w:0.978,h:0.623},{x:2.025,y:0.626,w:0.293,h:0.293},{x:2.355,y:0.626,w:0.293,h:0.293},{x:2.684,y:0.626,w:0.293,h:0.293}]; const s2=[{x:0.031,y:0.453,w:0.531,h:0.475},{x:0.344,y:0.047,w:0.623,h:0.466},{x:0.777,y:0.620,w:0.464,h:0.307},{x:1.101,y:0.031,w:0.402,h:0.539},{x:1.500,y:0.626,w:0.461,h:0.335},{x:1.704,y:0,w:0.581,h:0.394},{x:2.349,y:0.151,w:0.592,h:0.849}]; const s1=[{x:0,y:0.102,w:0.430,h:0.796},{x:0.522,y:0.223,w:0.358,h:0.542},{x:0.950,y:0,w:0.349,h:0.500},{x:1.145,y:0.542,w:0.304,h:0.458},{x:1.542,y:0,w:0.751,h:1.0},{x:2.363,y:0.466,w:0.310,h:0.464},{x:2.721,y:0.059,w:0.279,h:0.497}]; const s=v===4?s4:(v===3?s3:(v===2?s2:s1)); const z=v===3?(si=>si<=1?5:si===2?0:si>=4&&si<=6?5:si===3?0:1):v===4?(si=>si===2?0:si<=1?5:1):undefined; const ns=v===3?new Set([2]):undefined; doLayout(s,z,undefined,`LAYOUT4_${v===4?'4':v===3?'3':v===2?'2':'1'}`,ns); fired=specialPlaced.size>0; }
    if (u2 && !fired) { let v=1; if(tL25)v=5;else if(tL24)v=4;else if(tL23)v=3;else if(tL22)v=2;else if(tL2)v=1;else if(layoutVariant)v=layoutVariant;else v=Math.floor(Math.random()*5)+1; const s5=[{x:0.070,y:0.444,w:0.905,h:0.497},{x:0.866,y:0.078,w:0.634,h:0.425},{x:1.553,y:0.383,w:0.419,h:0.559},{x:1.858,y:0.078,w:0.911,h:0.511},{x:2.313,y:0.517,w:0.634,h:0.425}]; const s4=[{x:0.050,y:0.042,w:0.606,h:0.804},{x:0.601,y:0.444,w:0.897,h:0.503},{x:1.045,y:0.042,w:0.911,h:0.511},{x:2.078,y:0.042,w:0.413,h:0.735},{x:2.514,y:0.212,w:0.413,h:0.735}]; const s3=[{x:0.050,y:0.159,w:0.598,h:0.793},{x:0.749,y:0.095,w:0.693,h:0.461},{x:1.542,y:0,w:0.751,h:1.0},{x:2.547,y:0.187,w:0.416,h:0.313},{x:2.391,y:0.556,w:0.503,h:0.377}]; const s2=[{x:0.134,y:0.394,w:0.464,h:0.578},{x:0.425,y:0,w:1.151,h:1.0},{x:1.411,y:0.246,w:0.687,h:0.508},{x:2.176,y:0.025,w:0.648,h:0.433},{x:2.176,y:0.539,w:0.648,h:0.433}]; const s1=[{x:0,y:0,w:0.855,h:1.0},{x:0.944,y:0.063,w:0.682,h:0.874},{x:1.724,y:0,w:0.581,h:0.394},{x:2.464,y:0,w:0.399,h:0.327},{x:2.156,y:0.466,w:0.757,h:0.534}]; const s=v===5?s5:(v===4?s4:(v===3?s3:(v===2?s2:s1))); const z=v===5?(si=>si===4?6:si===3?5:si===2?0:1):v===4?(si=>si===2?6:si===1?5:si===0?0:1):v===2?(si=>si===0||si===2?5:si===1?0:1):undefined; doLayout(s,z,undefined,`LAYOUT2_${v===5?'5':v===4?'4':v===3?'3':v===2?'2':'1'}`); fired=specialPlaced.size>0; }
  }

  const heroPool = orderedSolo.filter(i => !specialPlaced.has(i)); const heroCount = specialPlaced.size > 0 ? 0 : Math.min(2, heroPool.length);
  for (let hi = 0; hi < heroCount; hi++) { const idx = heroPool[hi], img = images[idx]; if (!img) continue; const ia = img.naturalWidth / img.naturalHeight; let th = canvasH * rand(0.45, 0.65), tw = th * ia; if (tw > canvasW * 0.7) { tw = canvasW * 0.7; th = tw / ia; } const w = Math.round(tw), h = Math.round(th), M = Math.round(canvasW * EDGE_MARGIN); const mx = edge43.has(idx) ? 0 : M, maxX = Math.max(mx, canvasW - w - (edge43.has(idx) ? 0 : M)); placements.push({ imageIndex: idx, x: Math.max(mx, Math.min(maxX, hi === 0 ? mx : maxX)), y: M, width: w, height: h, zIndex: computeZ(analyses[idx]) }); rects.push({ x: Math.max(mx, Math.min(maxX, hi === 0 ? mx : maxX)), y: M, w, h, idx, isBg: false }); }
  const remainingSolo = orderedSolo.filter(i => !heroPool.slice(0, heroCount).includes(i) && !specialPlaced.has(i)); const placed = new Set<number>(specialPlaced);
  for (const group of goc) { const m = group.filter(i => !specialPlaced.has(i)); if (m.length < 2) continue; const aspects = m.map(i => images[i].naturalWidth / images[i].naturalHeight), gap = 24; const sumInv = aspects.reduce((s, a) => s + 1 / a, 0), availH = Math.round(canvasH * 0.84) - gap * (m.length - 1); let gw = Math.round(availH / sumInv); gw = Math.min(gw, Math.round(canvasW * 0.75)); const fh = aspects.map(a => Math.round(gw / a)), totalH = fh.reduce((s, h) => s + h, 0) + gap * (m.length - 1); const maxH = Math.round(canvasH * 0.88); let fw = gw, fhs = fh; if (totalH > maxH) { const s = maxH / totalH; fw = Math.round(gw * s); fhs = aspects.map(a => Math.round(fw / a)); } const finalTH = fhs.reduce((s, h) => s + h, 0) + gap * (m.length - 1); const M = Math.round(canvasW * EDGE_MARGIN), mX = M, mY = M, xX = Math.max(mX, canvasW - fw - M), xY = Math.max(mY, canvasH - finalTH - M); let ok = false; for (let a = 0; a < 300; a++) { const x = Math.round(rand(mX, xX)), y = Math.round(rand(mY, xY)); let cy = y, allOk = true; for (let mm = 0; mm < m.length; mm++) { const v = validateOverlap(x, cy, fw, fhs[mm], rects); if (!v.valid) { allOk = false; break; } if (faceNearCutLine(x, cy, fw, fhs[mm], analyses[m[mm]]?.faceRegion, cellWidth, m[mm], images, analyses)) { allOk = false; break; } cy += fhs[mm] + gap; } if (!allOk) continue; cy = y; for (let mm = 0; mm < m.length; mm++) { placements.push({ imageIndex: m[mm], x, y: cy, width: fw, height: fhs[mm], zIndex: computeZ(analyses[m[mm]]) }); rects.push({ x, y: cy, w: fw, h: fhs[mm], idx: m[mm], isBg: false }); placed.add(m[mm]); cy += fhs[mm] + gap; } ok = true; break; } if (!ok) { const x = rand(mX, xX); let cy = rand(mY, xY); for (let mm = 0; mm < m.length; mm++) { placements.push({ imageIndex: m[mm], x, y: cy, width: fw, height: fhs[mm], zIndex: computeZ(analyses[m[mm]]) }); rects.push({ x, y: cy, w: fw, h: fhs[mm], idx: m[mm], isBg: false }); placed.add(m[mm]); cy += fhs[mm] + gap; } } }
  for (const idx of remainingSolo) { if (placed.has(idx)) continue; const img = images[idx]; if (!img) continue; const ia = img.naturalWidth / img.naturalHeight; let th = canvasH * rand(0.18, 0.35), tw = th * ia; if (tw > canvasW * 0.7) { tw = canvasW * 0.7; th = tw / ia; } const w = Math.round(tw), h = Math.round(th), M = Math.round(canvasW * EDGE_MARGIN), isE = edge43.has(idx); let mX = isE ? 0 : M, mY = M, xX = Math.max(mX, canvasW - w - (isE ? 0 : M)), xY = Math.max(mY, canvasH - h - M); let bX = 0, bY = 0, bS = -Infinity; for (let a = 0; a < 120; a++) { const x = Math.round(rand(mX, xX)), y = Math.round(rand(mY, xY)); const v = validateOverlap(x, y, w, h, rects); if (!v.valid || faceNearCutLine(x, y, w, h, analyses[idx]?.faceRegion, cellWidth, idx, images, analyses)) continue; let s = v.ratio === 0 ? 15 : (v.ratio > 0.05 ? -10 : 2); s += Math.random() * 2; if (s > bS) { bS = s; bX = x; bY = y; } } if (bS === -Infinity) { for (let a = 0; a < 200; a++) { const x = Math.round(rand(mX, xX)), y = Math.round(rand(mY, xY)); const v = validateOverlap(x, y, w, h, rects); if (v.ratio <= OVERLAP_MAX && !faceNearCutLine(x, y, w, h, analyses[idx]?.faceRegion, cellWidth, idx, images, analyses)) { bX = x; bY = y; break; } } } if (bS === -Infinity) { let bf = Infinity; for (let a = 0; a < 200; a++) { const x = Math.round(rand(mX, xX)), y = Math.round(rand(mY, xY)); const r = validateOverlap(x, y, w, h, rects).ratio; if (r < bf && !faceNearCutLine(x, y, w, h, analyses[idx]?.faceRegion, cellWidth, idx, images, analyses)) { bf = r; bX = x; bY = y; } } } if (bS === -Infinity) { for (let a = 0; a < 100; a++) { const x = Math.round(rand(mX, xX)), y = Math.round(rand(mY, xY)); if (validateOverlap(x, y, w, h, rects).ratio <= 0.35) { bX = x; bY = y; break; } } } placements.push({ imageIndex: idx, x: bX, y: bY, width: w, height: h, zIndex: computeZ(analyses[idx]) }); rects.push({ x: bX, y: bY, w, h, idx, isBg: false }); placed.add(idx); }
  return { placements, fullBgImageIndex: -1, debug };
}
