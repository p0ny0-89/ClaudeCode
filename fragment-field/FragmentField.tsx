import { addPropertyControls, ControlType } from "framer"
import React, {
    useRef,
    useState,
    useEffect,
    useCallback,
    useMemo,
} from "react"

/*
 * FragmentField — Editorial image fragmentation
 *
 * A portrait-grade distortion field that decomposes an image into
 * displaced sample fragments. The effect reads as systematic image
 * fragmentation, not a filter or tile grid.
 *
 * Three cell tiers create intentional hierarchy:
 *   - Block samples: few large anchor pieces at medium distance
 *   - Fragment cells: main body of displaced image samples
 *   - Debris: small scattered fragments at edges and core
 *
 * Anchor zones suppress cells around key portrait areas (eyes,
 * ear, hairline) so the viewer has legible reference points.
 *
 * Primary distortion is sample displacement (background-position
 * offset), not visible rotation. Cells show image content from
 * shifted positions, creating duplicated/dragged image samples.
 * Rotation is secondary — subtle, small angles only.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

type Direction =
    | "left" | "right" | "top" | "bottom"
    | "top-left" | "top-right" | "bottom-left" | "bottom-right"

interface Attractor {
    cx: number; cy: number
    strength: number; radius: number; spin: number
}

interface AnchorZone {
    cx: number; cy: number; radius: number
}

interface CellData {
    id: number
    x: number; y: number; w: number; h: number
    nx: number; ny: number
    dispX: number; dispY: number   // sample displacement in px
    angle: number                  // subtle rotation (radians)
    zone: "core" | "falloff" | "island"
    activity: number
    tier: "block" | "fragment" | "debris"
    fieldDist: number              // 0=deep in field, 1=edge
    phase: number
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function sr(seed: number): number {
    const x = Math.sin(seed * 127.1 + seed * 311.7) * 43758.5453
    return x - Math.floor(x)
}
function sr2(a: number, b: number): number {
    const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453
    return x - Math.floor(x)
}
function sr3(a: number, b: number, c: number): number {
    const x = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453
    return x - Math.floor(x)
}
function smoothstep(e0: number, e1: number, x: number): number {
    const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)
}
function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t
}

// ─── Directional field ──────────────────────────────────────────────────────

function getDistance(nx: number, ny: number, dir: Direction): number {
    switch (dir) {
        case "left": return nx
        case "right": return 1 - nx
        case "top": return ny
        case "bottom": return 1 - ny
        case "top-left": return Math.sqrt(nx * nx + ny * ny) / Math.SQRT2
        case "top-right": return Math.sqrt((1 - nx) ** 2 + ny ** 2) / Math.SQRT2
        case "bottom-left": return Math.sqrt(nx ** 2 + (1 - ny) ** 2) / Math.SQRT2
        case "bottom-right": return Math.sqrt((1 - nx) ** 2 + (1 - ny) ** 2) / Math.SQRT2
    }
}

// Displacement direction vector (normalized) for the field direction
function getFieldVector(dir: Direction): { dx: number; dy: number } {
    switch (dir) {
        case "left": return { dx: -1, dy: 0 }
        case "right": return { dx: 1, dy: 0 }
        case "top": return { dx: 0, dy: -1 }
        case "bottom": return { dx: 0, dy: 1 }
        case "top-left": return { dx: -0.707, dy: -0.707 }
        case "top-right": return { dx: 0.707, dy: -0.707 }
        case "bottom-left": return { dx: -0.707, dy: 0.707 }
        case "bottom-right": return { dx: 0.707, dy: 0.707 }
    }
}

// ─── Cover computation ──────────────────────────────────────────────────────

function computeCoverSize(
    imgW: number, imgH: number,
    contW: number, contH: number,
    posX: number, posY: number
): { bgW: number; bgH: number; cropX: number; cropY: number } {
    const imgA = imgW / imgH, contA = contW / contH
    let bgW: number, bgH: number
    if (imgA > contA) { bgH = contH; bgW = contH * imgA }
    else { bgW = contW; bgH = contW / imgA }
    return {
        bgW, bgH,
        cropX: (bgW - contW) * (posX / 100),
        cropY: (bgH - contH) * (posY / 100),
    }
}

// ─── Attractors ─────────────────────────────────────────────────────────────

function makeAttractors(
    dir: Direction, coverage: number, falloffWidth: number, rotStr: number
): Attractor[] {
    const covN = coverage / 100
    const fallEnd = covN + falloffWidth / 100

    function placeInField(
        depthFrac: number, lateralFrac: number
    ): { cx: number; cy: number } {
        const d = depthFrac * fallEnd
        switch (dir) {
            case "left": return { cx: d, cy: lateralFrac }
            case "right": return { cx: 1 - d, cy: lateralFrac }
            case "top": return { cx: lateralFrac, cy: d }
            case "bottom": return { cx: lateralFrac, cy: 1 - d }
            case "top-left": return { cx: d * 0.8, cy: d * 0.8 + lateralFrac * (1 - d) }
            case "top-right": return { cx: 1 - d * 0.8, cy: d * 0.8 + lateralFrac * (1 - d) }
            case "bottom-left": return { cx: d * 0.8 + lateralFrac * (1 - d), cy: 1 - d * 0.8 }
            case "bottom-right": return { cx: 1 - d * 0.8, cy: 1 - d * 0.8 }
        }
    }

    const s1 = sr(42), s2 = sr(137)
    const p1 = placeInField(0.25, 0.35 + s1 * 0.3)
    const p2 = placeInField(0.55, 0.25 + s2 * 0.5)
    const baseRad = rotStr * (Math.PI / 180)

    return [
        { cx: p1.cx, cy: p1.cy, strength: baseRad * 1.2, radius: 0.28 + covN * 0.18, spin: 1 },
        { cx: p2.cx, cy: p2.cy, strength: baseRad * 0.7, radius: 0.20 + covN * 0.12, spin: -1 },
    ]
}

// ─── Anchor Zones ───────────────────────────────────────────────────────────
// Areas where cells are suppressed so the portrait remains legible.
// Placed at positions that typically correspond to key facial features
// in a centered portrait (eyes, lower face).

function makeAnchors(dir: Direction, coverage: number): AnchorZone[] {
    const covN = coverage / 100

    // Anchor 1: eye/upper face region — always partially in field
    // Anchor 2: lower face / chin — smaller, further from field origin
    // Positions adjust based on field direction so anchors
    // sit inside the active zone regardless of direction

    const anchors: AnchorZone[] = []

    // Portrait center is roughly (0.5, 0.42) for eyes, (0.5, 0.62) for chin
    // Adjust for direction so anchors sit inside active area
    const dist1 = getDistance(0.48, 0.38, dir)
    const dist2 = getDistance(0.52, 0.58, dir)

    // Only create anchors if they're inside the active zone
    if (dist1 < covN * 1.3) {
        anchors.push({ cx: 0.48, cy: 0.38, radius: 0.08 + covN * 0.04 })
    }
    if (dist2 < covN * 1.3) {
        anchors.push({ cx: 0.52, cy: 0.58, radius: 0.06 + covN * 0.03 })
    }

    return anchors
}

// ─── Cell Generation ────────────────────────────────────────────────────────

function makeCells(
    contW: number, contH: number,
    attractors: Attractor[],
    anchors: AnchorZone[],
    dir: Direction,
    coverage: number, falloffWidth: number,
    edgeStepping: number, randomness: number,
    cellSize: number, density: number,
    islandDensity: number, islandScatter: number, islandFade: number,
    distStr: number
): CellData[] {
    if (contW <= 0 || contH <= 0) return []

    const covN = coverage / 100
    const fallN = falloffWidth / 100
    const fallEnd = covN + fallN
    const steps = Math.max(1, edgeStepping)
    const scale = Math.max(contW, contH)
    const fieldVec = getFieldVector(dir)

    // Zone classification
    function getZone(nx: number, ny: number): {
        zone: "core" | "falloff" | "island" | "clean"
        activity: number
    } {
        const dist = getDistance(nx, ny, dir)
        const seed = sr2(nx * 10.7, ny * 10.7)
        const jit = (seed - 0.5) * randomness * 0.08

        if (dist < covN + jit) return { zone: "core", activity: 1 }
        if (dist < fallEnd + jit) {
            const t = (dist - covN) / Math.max(0.001, fallN)
            const stepped = Math.floor(t * steps) / steps
            const act = Math.max(0, 1 - stepped)
            if (seed > density * act) return { zone: "clean", activity: 0 }
            return { zone: "falloff", activity: act }
        }
        if (dist < fallEnd + islandScatter / 100) {
            const thresh = 1 - (islandDensity / 100) * 0.18
            const phase = sr3(nx * 10.7, ny * 10.7, 17)
            if (phase > thresh) {
                const id2 = (dist - fallEnd) / (islandScatter / 100)
                const act = Math.max(0, 1 - id2) * (1 - islandFade) * 0.45
                if (act > 0.02) return { zone: "island", activity: act }
            }
        }
        return { zone: "clean", activity: 0 }
    }

    // Anchor suppression: how much to suppress cells near anchors (0=full suppress, 1=no effect)
    function anchorAllow(nx: number, ny: number): number {
        let allow = 1
        for (const a of anchors) {
            const d = Math.sqrt((nx - a.cx) ** 2 + (ny - a.cy) ** 2)
            if (d < a.radius) {
                // Hard suppression in inner 60%, soft falloff in outer 40%
                const inner = a.radius * 0.6
                if (d < inner) return 0
                allow *= smoothstep(inner, a.radius, d)
            }
        }
        return allow
    }

    // Attractor-based subtle rotation
    function getSubtleAngle(nx: number, ny: number): number {
        let angle = 0
        for (const a of attractors) {
            const dx = nx - a.cx, dy = ny - a.cy
            const d = Math.sqrt(dx * dx + dy * dy)
            if (d > a.radius * 2) continue
            const influence = smoothstep(a.radius * 2, 0, d)
            // Much subtler than before — rotation is secondary
            angle += a.strength * a.spin * influence * 0.3
        }
        return angle
    }

    // Displacement vector: directional pull along field direction,
    // with attractor-based tangential component
    function getDisplacement(
        nx: number, ny: number, activity: number, dim: number
    ): { dx: number; dy: number } {
        // Base displacement follows field direction
        const baseMag = dim * distStr * activity * 1.2

        // Attractor tangential component
        let tangX = 0, tangY = 0
        for (const a of attractors) {
            const adx = nx - a.cx, ady = ny - a.cy
            const d = Math.sqrt(adx * adx + ady * ady)
            if (d > a.radius * 2 || d < 0.001) continue
            const inf = smoothstep(a.radius * 2, 0, d)
            // Tangential = perpendicular to radius
            tangX += (-ady / d) * a.spin * inf * dim * 0.4
            tangY += (adx / d) * a.spin * inf * dim * 0.4
        }

        // Seed-based variation so neighboring cells don't all displace identically
        const s1 = sr2(nx * 17.3, ny * 13.1)
        const s2 = sr2(nx * 13.1, ny * 17.3)
        const variation = 0.3 + s1 * 0.7

        return {
            dx: fieldVec.dx * baseMag * variation + tangX + (s2 - 0.5) * dim * 0.15,
            dy: fieldVec.dy * baseMag * variation + tangY + (s1 - 0.5) * dim * 0.15,
        }
    }

    const cells: CellData[] = []
    let cid = 0
    const occupied = new Set<string>()
    function gridKey(x: number, y: number, step: number): string {
        return `${Math.floor(x / step)},${Math.floor(y / step)}`
    }

    // ── TIER 1: Block samples ──
    // Few large cells placed deliberately at medium distance from attractors.
    // These are the "anchor" fragments — large displaced image pieces.
    const blockSize = cellSize * 3.5
    const blockCols = Math.ceil(contW / (blockSize * 1.5))
    const blockRows = Math.ceil(contH / (blockSize * 1.5))

    for (let r = 0; r < blockRows; r++) {
        for (let c = 0; c < blockCols; c++) {
            const baseX = (c + 0.5) * (contW / blockCols)
            const baseY = (r + 0.5) * (contH / blockRows)
            const jx = (sr3(c + 0.1, r + 0.1, 77) - 0.5) * blockSize * 0.8
            const jy = (sr3(c + 0.1, r + 0.1, 88) - 0.5) * blockSize * 0.8
            const px = baseX + jx
            const py = baseY + jy
            const nx = px / contW, ny = py / contH
            if (nx < -0.02 || nx > 1.02 || ny < -0.02 || ny > 1.02) continue

            const { zone, activity } = getZone(nx, ny)
            if (zone === "clean" || activity < 0.15) continue

            const allow = anchorAllow(nx, ny)
            if (allow < 0.3) continue

            // Blocks work best at medium field depth (not deepest core, not outer edge)
            const dist = getDistance(nx, ny, dir)
            const fieldNorm = dist / Math.max(0.01, fallEnd)
            if (fieldNorm < 0.15 || fieldNorm > 0.85) continue

            // Only ~40% of positions become blocks
            const placeSeed = sr3(c * 3.1, r * 5.7, 99)
            if (placeSeed > 0.4 * density) continue

            // Aspect variation
            const aspect = 0.6 + sr3(c + 0.1, r + 0.1, 55) * 0.8
            const w = blockSize * Math.sqrt(aspect)
            const h = blockSize / Math.sqrt(aspect)

            const disp = getDisplacement(nx, ny, activity * 0.7, blockSize)
            const angle = getSubtleAngle(nx, ny) * activity * 0.4

            const gk = gridKey(px, py, blockSize * 0.5)
            if (occupied.has(gk)) continue
            occupied.add(gk)
            // Also mark surrounding grid cells for blocks
            for (let di = -1; di <= 1; di++) {
                for (let dj = -1; dj <= 1; dj++) {
                    occupied.add(gridKey(px + di * blockSize * 0.3, py + dj * blockSize * 0.3, blockSize * 0.5))
                }
            }

            cells.push({
                id: cid++,
                x: px - w / 2, y: py - h / 2, w, h,
                nx, ny,
                dispX: disp.dx, dispY: disp.dy,
                angle,
                zone: zone as CellData["zone"],
                activity: activity * allow,
                tier: "block",
                fieldDist: fieldNorm,
                phase: sr3(px * 0.1, py * 0.1, 17),
            })
        }
    }

    // ── TIER 2: Fragment cells (radial rings around attractors) ──
    for (let ai = 0; ai < attractors.length; ai++) {
        const att = attractors[ai]
        const attPxX = att.cx * contW
        const attPxY = att.cy * contH
        const maxR = att.radius * scale * 1.6

        const minDim = Math.max(8, cellSize * 0.55)
        const maxDim = cellSize * 2.2

        let ringR = minDim * 0.8
        let ringIdx = 0

        while (ringR < maxR) {
            const t = Math.min(1, ringR / maxR)
            const dim = lerp(minDim, maxDim, Math.pow(t, 0.5))

            const circ = 2 * Math.PI * ringR
            const spacedDim = dim * (1.3 + (1 - density) * 1.0)
            const nCells = Math.max(3, Math.floor(circ / spacedDim))
            const angStep = (2 * Math.PI) / nCells
            const ringOffset = sr(ringIdx * 31 + ai * 97) * angStep * 0.7

            for (let ci = 0; ci < nCells; ci++) {
                // Skip for breathing room — more aggressive than before
                const skipSeed = sr3(ringIdx + 0.1, ci + 0.1, ai * 13 + 0.1)
                const keepProb = lerp(0.85, 0.35, Math.pow(t, 1.2)) * density
                if (skipSeed > keepProb) continue

                const theta = ci * angStep + ringOffset
                const jitR = (sr3(ringR * 0.1, theta * 10, ai * 7 + 1) - 0.5) * dim * 0.4 * randomness
                const jitT = (sr3(ringR * 0.1, theta * 10, ai * 7 + 2) - 0.5) * angStep * 0.35 * randomness
                const finalR = ringR + jitR
                const finalTheta = theta + jitT

                const px = attPxX + finalR * Math.cos(finalTheta)
                const py = attPxY + finalR * Math.sin(finalTheta)
                const nx = px / contW, ny = py / contH
                if (nx < -0.02 || nx > 1.02 || ny < -0.02 || ny > 1.02) continue

                const { zone, activity } = getZone(nx, ny)
                if (zone === "clean" || activity < 0.02) continue

                const allow = anchorAllow(nx, ny)
                if (allow < 0.15) continue

                const gStep = dim * 0.55
                const gk = gridKey(px, py, gStep)
                if (occupied.has(gk)) continue
                occupied.add(gk)

                // Aspect ratio variation
                const aspectSeed = sr(ringIdx * 47 + ci * 13 + ai * 200)
                const aspect = 0.7 + aspectSeed * 0.6
                const cellW = dim * Math.sqrt(aspect)
                const cellH = dim / Math.sqrt(aspect)

                const disp = getDisplacement(nx, ny, activity, dim)
                const angle = getSubtleAngle(nx, ny) * activity

                const dist = getDistance(nx, ny, dir)
                const fieldNorm = dist / Math.max(0.01, fallEnd)

                cells.push({
                    id: cid++,
                    x: px - cellW / 2, y: py - cellH / 2,
                    w: cellW, h: cellH,
                    nx, ny,
                    dispX: disp.dx, dispY: disp.dy,
                    angle,
                    zone: zone as CellData["zone"],
                    activity: activity * allow,
                    tier: "fragment",
                    fieldDist: fieldNorm,
                    phase: sr3(px * 0.1, py * 0.1, 17),
                })
            }

            ringR += dim * (0.7 + (1 - density) * 0.5)
            ringIdx++
        }
    }

    // ── TIER 3: Debris cells ──
    // Small scattered fragments near core edges and at falloff boundary.
    // These fill the space between blocks and fragments organically.
    const debrisSize = cellSize * 0.65
    const debrisCols = Math.ceil(contW / debrisSize)
    const debrisRows = Math.ceil(contH / debrisSize)

    for (let r = 0; r < debrisRows; r++) {
        for (let c = 0; c < debrisCols; c++) {
            // Only ~15% of grid positions become debris
            const placeSeed = sr3(c * 2.3 + 0.1, r * 3.7 + 0.1, 44)
            if (placeSeed > 0.15 * density) continue

            const baseX = (c + 0.5) * debrisSize
            const baseY = (r + 0.5) * debrisSize
            const jx = (sr2(c * 5.3, r * 9.1) - 0.5) * debrisSize * 0.9
            const jy = (sr2(c * 9.1, r * 5.3) - 0.5) * debrisSize * 0.9
            const px = baseX + jx, py = baseY + jy
            const nx = px / contW, ny = py / contH
            if (nx < -0.02 || nx > 1.02 || ny < -0.02 || ny > 1.02) continue

            const { zone, activity } = getZone(nx, ny)
            if (zone === "clean" || activity < 0.05) continue

            const allow = anchorAllow(nx, ny)
            if (allow < 0.2) continue

            // Debris prefers transition zones (core edges and falloff)
            const dist = getDistance(nx, ny, dir)
            const fieldNorm = dist / Math.max(0.01, fallEnd)
            const transitionBoost = 1 - Math.abs(fieldNorm - 0.5) * 1.5
            if (sr3(c + 0.1, r + 0.1, 66) > Math.max(0.3, transitionBoost) * density) continue

            const gStep = debrisSize * 0.5
            const gk = gridKey(px, py, gStep)
            if (occupied.has(gk)) continue
            occupied.add(gk)

            const dim = debrisSize * (0.5 + sr3(c + 0.1, r + 0.1, 22) * 0.8)
            const disp = getDisplacement(nx, ny, activity, dim)
            const angle = getSubtleAngle(nx, ny) * activity * 0.6

            cells.push({
                id: cid++,
                x: px - dim / 2, y: py - dim / 2, w: dim, h: dim,
                nx, ny,
                dispX: disp.dx * 1.3, dispY: disp.dy * 1.3,
                angle,
                zone: zone as CellData["zone"],
                activity: activity * allow,
                tier: "debris",
                fieldDist: fieldNorm,
                phase: sr3(px * 0.1, py * 0.1, 17),
            })
        }
    }

    // Sort: blocks first (bottom), then fragments, then debris on top
    // Within each tier, outer cells paint first
    const tierOrder = { block: 0, fragment: 1, debris: 2 }
    cells.sort((a, b) => {
        const to = tierOrder[a.tier] - tierOrder[b.tier]
        if (to !== 0) return to
        return b.fieldDist - a.fieldDist
    })

    return cells
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface Props {
    source: string
    mediaType: "image" | "video"
    objectFit: "cover" | "contain" | "fill"
    positionX: number
    positionY: number
    borderRadius: number
    direction: Direction
    coverage: number
    falloffWidth: number
    edgeStepping: number
    randomness: number
    cellSize: number
    density: number
    distortionStrength: number
    cellOpacity: number
    islandDensity: number
    islandScatter: number
    islandFade: number
    ambientMotion: boolean
    motionAmount: number
    drift: number
    flicker: number
    rotationEnabled: boolean
    rotationStrength: number
    hoverEnabled: boolean
    hoverRadius: number
    hoverIntensity: number
    hoverRecovery: number
    contrast: number
    blur: number
    grain: boolean
    width: number
    height: number
}

const defaults: Partial<Props> = {
    source: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=1200&q=80",
    mediaType: "image",
    objectFit: "cover",
    positionX: 50,
    positionY: 50,
    borderRadius: 0,
    direction: "top-right",
    coverage: 42,
    falloffWidth: 24,
    edgeStepping: 5,
    randomness: 0.45,
    cellSize: 30,
    density: 0.75,
    distortionStrength: 1.3,
    cellOpacity: 1,
    islandDensity: 20,
    islandScatter: 14,
    islandFade: 0.4,
    ambientMotion: true,
    motionAmount: 0.25,
    drift: 0.12,
    flicker: 0.03,
    rotationEnabled: true,
    rotationStrength: 8,
    hoverEnabled: true,
    hoverRadius: 110,
    hoverIntensity: 0.5,
    hoverRecovery: 0.05,
    contrast: 0,
    blur: 0,
    grain: false,
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function FragmentField(rawProps: Partial<Props>) {
    const p = { ...defaults, ...rawProps } as Props

    if (!p.source) {
        return (
            <div style={{
                width: "100%", height: "100%",
                display: "flex", alignItems: "center", justifyContent: "center",
                background: "#1a1a1a", color: "#666",
                fontFamily: "Inter, system-ui, sans-serif", fontSize: 14,
                borderRadius: p.borderRadius,
            }}>
                Add an image to begin
            </div>
        )
    }

    const containerRef = useRef<HTMLDivElement>(null)
    const [size, setSize] = useState({ w: 0, h: 0 })
    const [imgDims, setImgDims] = useState({ w: 0, h: 0 })
    const mouseRef = useRef({ x: -9999, y: -9999, on: false })
    const hoverRef = useRef<Map<number, number>>(new Map())
    const tRef = useRef(0)
    const rafRef = useRef(0)
    const [tick, setTick] = useState(0)

    useEffect(() => {
        if (p.mediaType !== "image") return
        const img = new Image()
        img.onload = () => setImgDims({ w: img.naturalWidth, h: img.naturalHeight })
        img.src = p.source
    }, [p.source, p.mediaType])

    useEffect(() => {
        const el = containerRef.current
        if (!el) return
        const obs = new ResizeObserver((e) => {
            const { width, height } = e[0].contentRect
            if (width > 0 && height > 0) setSize({ w: width, h: height })
        })
        obs.observe(el)
        return () => obs.disconnect()
    }, [])

    const cover = useMemo(() => {
        if (imgDims.w <= 0 || imgDims.h <= 0 || size.w <= 0 || size.h <= 0)
            return { bgW: size.w, bgH: size.h, cropX: 0, cropY: 0 }
        return computeCoverSize(imgDims.w, imgDims.h, size.w, size.h, p.positionX, p.positionY)
    }, [imgDims.w, imgDims.h, size.w, size.h, p.positionX, p.positionY])

    const attractors = useMemo(
        () => makeAttractors(p.direction, p.coverage, p.falloffWidth, p.rotationStrength),
        [p.direction, p.coverage, p.falloffWidth, p.rotationStrength]
    )

    const anchors = useMemo(
        () => makeAnchors(p.direction, p.coverage),
        [p.direction, p.coverage]
    )

    const cells = useMemo(
        () => makeCells(
            size.w, size.h, attractors, anchors, p.direction,
            p.coverage, p.falloffWidth, p.edgeStepping, p.randomness,
            p.cellSize, p.density,
            p.islandDensity, p.islandScatter, p.islandFade,
            p.distortionStrength
        ),
        [size.w, size.h, attractors, anchors, p.direction, p.coverage, p.falloffWidth,
         p.edgeStepping, p.randomness, p.cellSize, p.density,
         p.islandDensity, p.islandScatter, p.islandFade, p.distortionStrength]
    )

    const onMM = useCallback((e: React.MouseEvent) => {
        if (!p.hoverEnabled) return
        const r = containerRef.current?.getBoundingClientRect()
        if (!r) return
        mouseRef.current = { x: e.clientX - r.left, y: e.clientY - r.top, on: true }
    }, [p.hoverEnabled])

    const onML = useCallback(() => {
        mouseRef.current = { ...mouseRef.current, on: false }
    }, [])

    useEffect(() => {
        if (!p.ambientMotion && !p.hoverEnabled) return
        let last = performance.now()
        const loop = (now: number) => {
            const dt = Math.min((now - last) / 1000, 0.1)
            last = now
            tRef.current += dt
            if (p.hoverEnabled) {
                const m = hoverRef.current
                for (const [k, v] of m.entries()) {
                    if (!mouseRef.current.on) {
                        const nv = v * (1 - p.hoverRecovery)
                        if (nv < 0.01) m.delete(k); else m.set(k, nv)
                    }
                }
            }
            setTick((t) => t + 1)
            rafRef.current = requestAnimationFrame(loop)
        }
        rafRef.current = requestAnimationFrame(loop)
        return () => cancelAnimationFrame(rafRef.current)
    }, [p.ambientMotion, p.hoverEnabled, p.hoverRecovery])

    if (p.hoverEnabled && mouseRef.current.on && size.w > 0) {
        const mx = mouseRef.current.x, my = mouseRef.current.y, r = p.hoverRadius
        for (const c of cells) {
            const cx = c.x + c.w / 2, cy = c.y + c.h / 2
            const d = Math.sqrt((mx - cx) ** 2 + (my - cy) ** 2)
            if (d < r) {
                const inf = smoothstep(r, r * 0.15, d) * p.hoverIntensity
                const cur = hoverRef.current.get(c.id) || 0
                hoverRef.current.set(c.id, Math.max(cur, inf))
            }
        }
    }

    const time = tRef.current
    const cW = size.w, cH = size.h
    const { bgW, bgH, cropX, cropY } = cover

    const renderData = useMemo(() => {
        if (cW <= 0 || cH <= 0) return []

        return cells.map((c) => {
            const hInf = hoverRef.current.get(c.id) || 0
            const act = Math.min(1, c.activity + hInf * 0.5)

            // ── Displacement ──
            // Primary distortion: background-position offset
            let dispX = c.dispX * act
            let dispY = c.dispY * act

            // ── Subtle rotation ── (secondary, subdued)
            let angle = p.rotationEnabled ? c.angle : 0

            // Ambient motion
            if (p.ambientMotion && act > 0.05) {
                const a = p.motionAmount * act
                const s = p.drift
                const wave = Math.sin(
                    time * s * 0.3 + c.fieldDist * Math.PI * 2 + c.phase * 1.5
                )
                // Ambient affects displacement more than rotation
                dispX += wave * a * c.w * 0.06 * p.distortionStrength
                dispY += Math.cos(
                    time * s * 0.25 + c.phase * 3
                ) * a * c.h * 0.04 * p.distortionStrength
                // Very subtle angular drift
                angle += wave * a * 0.015 * p.distortionStrength
            }

            // Hover intensifies displacement
            if (hInf > 0) {
                dispX *= 1 + hInf * 0.5
                dispY *= 1 + hInf * 0.5
                angle *= 1 + hInf * 0.3
            }

            const angleDeg = angle * (180 / Math.PI)

            // ── Background position: cover-correct + displacement ──
            const bgX = -(c.x + cropX) + dispX
            const bgY = -(c.y + cropY) + dispY

            // ── Expansion for subtle rotation ──
            const absAngle = Math.abs(angle)
            const sinA = Math.sin(absAngle), cosA = Math.cos(absAngle)
            const expandX = (c.w * cosA + c.h * sinA - c.w) / 2 + 1
            const expandY = (c.w * sinA + c.h * cosA - c.h) / 2 + 1

            // ── Opacity with tonal hierarchy ──
            let op = p.cellOpacity
            // Blocks: slightly more transparent to feel like large displaced pieces
            if (c.tier === "block") op *= 0.92
            // Debris: varied opacity for tonal richness
            if (c.tier === "debris") op *= 0.7 + c.phase * 0.3
            // Islands: subtle
            if (c.zone === "island") op *= 0.55 * act
            // Field depth: cells deeper in field are slightly more opaque
            op *= lerp(0.85, 1, 1 - c.fieldDist)
            // Flicker
            if (p.ambientMotion && p.flicker > 0) {
                op += Math.sin(time * 1.5 + c.phase * Math.PI * 6) * p.flicker * 0.04
            }
            op = Math.max(0.1, Math.min(1, op))

            // Filters
            let filter: string | undefined
            const fl: string[] = []
            if (p.contrast !== 0) fl.push(`contrast(${1 + p.contrast * act * 0.01})`)
            if (p.blur > 0) fl.push(`blur(${p.blur * act * 0.25}px)`)
            if (fl.length) filter = fl.join(" ")

            return { c, bgX, bgY, angleDeg, expandX, expandY, op, filter }
        })
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cells, tick, p, cW, cH, bgW, bgH, cropX, cropY])

    const objPos = `${p.positionX}% ${p.positionY}%`

    return (
        <div
            ref={containerRef}
            onMouseMove={onMM}
            onMouseLeave={onML}
            style={{
                position: "relative",
                width: "100%",
                height: "100%",
                overflow: "hidden",
                borderRadius: p.borderRadius,
            }}
        >
            {/* Base media */}
            {p.mediaType === "image" ? (
                <img src={p.source} alt="" style={{
                    position: "absolute", inset: 0,
                    width: "100%", height: "100%",
                    objectFit: p.objectFit, objectPosition: objPos,
                    display: "block",
                }} />
            ) : (
                <video src={p.source} autoPlay loop muted playsInline style={{
                    position: "absolute", inset: 0,
                    width: "100%", height: "100%",
                    objectFit: p.objectFit, objectPosition: objPos,
                    display: "block",
                }} />
            )}

            {/* Fragment field */}
            <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                {renderData.map((d) => (
                    <div
                        key={d.c.id}
                        style={{
                            position: "absolute",
                            left: d.c.x,
                            top: d.c.y,
                            width: d.c.w,
                            height: d.c.h,
                            overflow: "hidden",
                            opacity: d.op,
                        }}
                    >
                        <div style={{
                            position: "absolute",
                            left: -d.expandX,
                            top: -d.expandY,
                            width: d.c.w + d.expandX * 2,
                            height: d.c.h + d.expandY * 2,
                            backgroundImage: `url(${p.source})`,
                            backgroundSize: `${bgW}px ${bgH}px`,
                            backgroundPosition: `${d.bgX - d.expandX}px ${d.bgY - d.expandY}px`,
                            backgroundRepeat: "no-repeat",
                            transform: d.angleDeg !== 0 ? `rotate(${d.angleDeg}deg)` : undefined,
                            transformOrigin: "center center",
                            filter: d.filter,
                        }} />
                    </div>
                ))}
            </div>

            {/* Grain */}
            {p.grain && (
                <div style={{
                    position: "absolute", inset: 0, pointerEvents: "none",
                    opacity: 0.05, mixBlendMode: "overlay",
                    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
                    backgroundRepeat: "repeat",
                }} />
            )}
        </div>
    )
}

// ─── Property Controls ───────────────────────────────────────────────────────

addPropertyControls(FragmentField, {
    source: { type: ControlType.Image, title: "Source" },
    mediaType: {
        type: ControlType.Enum, title: "Media Type",
        options: ["image", "video"], optionTitles: ["Image", "Video"],
        defaultValue: "image",
    },
    objectFit: {
        type: ControlType.Enum, title: "Object Fit",
        options: ["cover", "contain", "fill"],
        optionTitles: ["Cover", "Contain", "Fill"],
        defaultValue: "cover",
    },
    positionX: {
        type: ControlType.Number, title: "Position X",
        min: 0, max: 100, unit: "%", defaultValue: 50,
    },
    positionY: {
        type: ControlType.Number, title: "Position Y",
        min: 0, max: 100, unit: "%", defaultValue: 50,
    },
    borderRadius: {
        type: ControlType.Number, title: "Border Radius",
        min: 0, max: 100, defaultValue: 0,
    },
    direction: {
        type: ControlType.Enum, title: "Direction",
        options: ["left", "right", "top", "bottom", "top-left", "top-right", "bottom-left", "bottom-right"],
        optionTitles: ["Left", "Right", "Top", "Bottom", "Top-Left", "Top-Right", "Bottom-Left", "Bottom-Right"],
        defaultValue: "top-right",
    },
    coverage: {
        type: ControlType.Number, title: "Coverage",
        min: 5, max: 85, step: 1, unit: "%", defaultValue: 42,
    },
    falloffWidth: {
        type: ControlType.Number, title: "Falloff Width",
        min: 0, max: 50, step: 1, unit: "%", defaultValue: 24,
    },
    edgeStepping: {
        type: ControlType.Number, title: "Edge Stepping",
        min: 2, max: 12, step: 1, defaultValue: 5,
    },
    randomness: {
        type: ControlType.Number, title: "Randomness",
        min: 0, max: 1, step: 0.05, defaultValue: 0.45,
    },
    cellSize: {
        type: ControlType.Number, title: "Cell Size",
        min: 12, max: 80, step: 2, unit: "px", defaultValue: 30,
    },
    density: {
        type: ControlType.Number, title: "Density",
        min: 0.2, max: 1, step: 0.05, defaultValue: 0.75,
    },
    distortionStrength: {
        type: ControlType.Number, title: "Distortion",
        min: 0, max: 4, step: 0.1, defaultValue: 1.3,
    },
    cellOpacity: {
        type: ControlType.Number, title: "Opacity",
        min: 0.2, max: 1, step: 0.05, defaultValue: 1,
    },
    islandDensity: {
        type: ControlType.Number, title: "Island Density",
        min: 0, max: 80, step: 1, unit: "%", defaultValue: 20,
    },
    islandScatter: {
        type: ControlType.Number, title: "Island Scatter",
        min: 0, max: 40, step: 1, unit: "%", defaultValue: 14,
    },
    islandFade: {
        type: ControlType.Number, title: "Island Fade",
        min: 0, max: 1, step: 0.05, defaultValue: 0.4,
    },
    ambientMotion: {
        type: ControlType.Boolean, title: "Ambient Motion", defaultValue: true,
    },
    motionAmount: {
        type: ControlType.Number, title: "Motion Amount",
        min: 0, max: 2, step: 0.05, defaultValue: 0.25,
        hidden: (pp) => !pp.ambientMotion,
    },
    drift: {
        type: ControlType.Number, title: "Drift",
        min: 0, max: 2, step: 0.05, defaultValue: 0.12,
        hidden: (pp) => !pp.ambientMotion,
    },
    flicker: {
        type: ControlType.Number, title: "Flicker",
        min: 0, max: 1, step: 0.05, defaultValue: 0.03,
        hidden: (pp) => !pp.ambientMotion,
    },
    rotationEnabled: {
        type: ControlType.Boolean, title: "Rotation", defaultValue: true,
    },
    rotationStrength: {
        type: ControlType.Number, title: "Rotation Strength",
        min: 0, max: 45, step: 1, unit: "°", defaultValue: 8,
        hidden: (pp) => !pp.rotationEnabled,
    },
    hoverEnabled: {
        type: ControlType.Boolean, title: "Hover Reactive", defaultValue: true,
    },
    hoverRadius: {
        type: ControlType.Number, title: "Hover Radius",
        min: 30, max: 300, step: 5, unit: "px", defaultValue: 110,
        hidden: (pp) => !pp.hoverEnabled,
    },
    hoverIntensity: {
        type: ControlType.Number, title: "Hover Intensity",
        min: 0, max: 1, step: 0.05, defaultValue: 0.5,
        hidden: (pp) => !pp.hoverEnabled,
    },
    hoverRecovery: {
        type: ControlType.Number, title: "Hover Recovery",
        min: 0.01, max: 0.2, step: 0.01, defaultValue: 0.05,
        hidden: (pp) => !pp.hoverEnabled,
    },
    contrast: {
        type: ControlType.Number, title: "Contrast",
        min: -50, max: 50, step: 1, defaultValue: 0,
    },
    blur: {
        type: ControlType.Number, title: "Blur",
        min: 0, max: 8, step: 0.5, unit: "px", defaultValue: 0,
    },
    grain: {
        type: ControlType.Boolean, title: "Grain", defaultValue: false,
    },
})
