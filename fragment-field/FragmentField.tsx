import { addPropertyControls, ControlType } from "framer"
import React, {
    useRef,
    useState,
    useEffect,
    useCallback,
    useMemo,
} from "react"

/*
 * FragmentField — Radial rotational cascade
 *
 * Cells radiate from rotational attractor centers in concentric
 * rings. Cell size scales continuously with distance from attractors
 * (small dense cells at core, large sparse cells at periphery).
 * Rotation follows the tangential field of each attractor, creating
 * coherent orbital flow. No quadtree — no axis-aligned subdivision
 * boundaries — no serrated tile artifacts.
 *
 * Rendering: each cell is a full-opacity rectangle with CSS-rotated
 * cover-correct background-image. Paint order is outside-in so
 * smaller core cells cascade visually on top of larger outer cells.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

type Direction =
    | "left" | "right" | "top" | "bottom"
    | "top-left" | "top-right" | "bottom-left" | "bottom-right"

interface Attractor {
    cx: number
    cy: number
    strength: number
    radius: number
    spin: number
}

interface CellData {
    id: number
    x: number
    y: number
    w: number
    h: number
    nx: number
    ny: number
    angle: number
    zone: "core" | "falloff" | "island"
    activity: number
    ringDist: number  // normalized distance from nearest attractor (0=center, 1=edge)
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

// ─── Rotational Attractors ──────────────────────────────────────────────────

function makeAttractors(
    dir: Direction, coverage: number, falloffWidth: number, rotStr: number
): Attractor[] {
    const covN = coverage / 100
    const fallEnd = covN + falloffWidth / 100

    const s1 = sr(42), s2 = sr(137)
    const depth1 = 0.25, depth2 = 0.55

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

    const p1 = placeInField(depth1, 0.35 + s1 * 0.3)
    const p2 = placeInField(depth2, 0.25 + s2 * 0.5)
    const baseRad = rotStr * (Math.PI / 180)

    return [
        {
            cx: p1.cx, cy: p1.cy,
            strength: baseRad * 1.2,
            radius: 0.28 + covN * 0.18,
            spin: 1,
        },
        {
            cx: p2.cx, cy: p2.cy,
            strength: baseRad * 0.7,
            radius: 0.20 + covN * 0.12,
            spin: -1,
        },
    ]
}

// ─── Radial Cell Generation ─────────────────────────────────────────────────
// Cells are placed in concentric rings around each attractor.
// Ring radius determines cell size (continuous, no jumps).
// Angular position along the ring creates the orbiting feel.
// Gap-fill cells cover active areas between attractors.

function makeCells(
    contW: number, contH: number,
    attractors: Attractor[],
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

    // Zone classification for any normalized point
    function getZone(nx: number, ny: number): {
        zone: "core" | "falloff" | "island" | "clean"
        activity: number
    } {
        const dist = getDistance(nx, ny, dir)
        const seed = sr2(nx * 10.7, ny * 10.7)
        const jit = (seed - 0.5) * randomness * 0.08

        if (dist < covN + jit) {
            return { zone: "core", activity: 1 }
        }
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

    const cells: CellData[] = []
    let cid = 0

    // Track occupied regions to prevent too much overlap
    const occupied = new Set<string>()
    function gridKey(x: number, y: number, gridStep: number): string {
        return `${Math.floor(x / gridStep)},${Math.floor(y / gridStep)}`
    }

    // ── PHASE 1: Radial rings around each attractor ──
    // Cells orbit each attractor in concentric rings.
    // Inner rings = small cells, strong rotation.
    // Outer rings = large cells, gentle rotation.

    for (let ai = 0; ai < attractors.length; ai++) {
        const att = attractors[ai]
        const attPxX = att.cx * contW
        const attPxY = att.cy * contH
        const maxR = att.radius * scale * 1.8

        const minDim = Math.max(8, cellSize * 0.45)
        const maxDim = cellSize * 3.5

        let ringR = minDim * 0.6
        let ringIdx = 0

        while (ringR < maxR) {
            // Continuous size: grows smoothly with ring radius
            const t = Math.min(1, ringR / maxR)
            const dim = lerp(minDim, maxDim, Math.pow(t, 0.55))

            // Aspect ratio variation: some cells wider, some taller
            const aspectSeed = sr(ringIdx * 47 + ai * 200)
            const aspectR = 0.7 + aspectSeed * 0.6 // 0.7 to 1.3
            const cellW = dim * Math.sqrt(aspectR)
            const cellH = dim / Math.sqrt(aspectR)

            // Cells per ring — fills circumference with cells + gaps
            const circ = 2 * Math.PI * ringR
            const spacedDim = dim * (1.1 + (1 - density) * 0.8)
            const nCells = Math.max(3, Math.floor(circ / spacedDim))
            const angStep = (2 * Math.PI) / nCells

            // Per-ring angular offset for organic staggering
            const ringOffset = sr(ringIdx * 31 + ai * 97) * angStep * 0.7

            for (let ci = 0; ci < nCells; ci++) {
                // Skip some cells for sparsity at outer rings
                const skipSeed = sr3(ringIdx + 0.1, ci + 0.1, ai * 13 + 0.1)
                const keepProb = lerp(1.0, 0.5, Math.pow(t, 1.5)) * density
                if (skipSeed > keepProb) continue

                const theta = ci * angStep + ringOffset

                // Position with organic jitter
                const jitR = (sr3(ringR * 0.1, theta * 10, ai * 7 + 1) - 0.5) * dim * 0.35 * randomness
                const jitT = (sr3(ringR * 0.1, theta * 10, ai * 7 + 2) - 0.5) * angStep * 0.3 * randomness
                const finalR = ringR + jitR
                const finalTheta = theta + jitT

                const px = attPxX + finalR * Math.cos(finalTheta)
                const py = attPxY + finalR * Math.sin(finalTheta)

                const nx = px / contW
                const ny = py / contH
                if (nx < -0.02 || nx > 1.02 || ny < -0.02 || ny > 1.02) continue

                // Zone check
                const { zone, activity } = getZone(nx, ny)
                if (zone === "clean" || activity < 0.02) continue

                // Check occupancy to avoid excessive stacking
                const gStep = dim * 0.6
                const gk = gridKey(px, py, gStep)
                if (occupied.has(gk)) continue
                occupied.add(gk)

                // ── Rotation: orbital + attractor spin ──
                // Tangential direction (perpendicular to radius from attractor)
                const tangential = finalTheta + Math.PI / 2

                // Attractor influence: strong near center, fading out
                const influence = smoothstep(1, 0, t)

                // Base rotation from attractor spin
                const baseAngle = att.strength * att.spin * influence

                // Tangential twist: cells rotate as if orbiting
                const twist = tangential * 0.12 * influence

                // Inherited angular drift: cascade from ring to ring
                const inheritDrift = (sr3(ringIdx * 0.3, ci * 0.7, ai * 11) - 0.5)
                    * 0.06 * (ringIdx + 1)

                const cellAngle = (baseAngle + twist + inheritDrift) * activity * distStr

                cells.push({
                    id: cid++,
                    x: px - cellW / 2,
                    y: py - cellH / 2,
                    w: cellW,
                    h: cellH,
                    nx, ny,
                    angle: cellAngle,
                    zone: zone as CellData["zone"],
                    activity,
                    ringDist: t,
                    phase: sr3(px * 0.1, py * 0.1, 17),
                })
            }

            // Ring spacing: continuous, proportional to cell size
            ringR += dim * (0.65 + (1 - density) * 0.4)
            ringIdx++
        }
    }

    // ── PHASE 2: Gap-fill cells ──
    // The radial rings don't perfectly tile the active zone.
    // Scatter additional cells in active areas not already occupied.
    // These use a loose grid to fill gaps organically.

    const fillSize = cellSize * 1.8
    const fillCols = Math.ceil(contW / fillSize)
    const fillRows = Math.ceil(contH / fillSize)

    for (let r = 0; r < fillRows; r++) {
        for (let c = 0; c < fillCols; c++) {
            // Jittered grid position
            const baseX = (c + 0.5) * fillSize
            const baseY = (r + 0.5) * fillSize
            const jx = (sr2(c * 7.3, r * 11.1) - 0.5) * fillSize * 0.6
            const jy = (sr2(c * 11.1, r * 7.3) - 0.5) * fillSize * 0.6
            const px = baseX + jx
            const py = baseY + jy

            const nx = px / contW
            const ny = py / contH
            if (nx < -0.02 || nx > 1.02 || ny < -0.02 || ny > 1.02) continue

            const { zone, activity } = getZone(nx, ny)
            if (zone === "clean" || activity < 0.02) continue

            // Only fill where radial rings didn't reach
            const gStep = fillSize * 0.5
            const gk = gridKey(px, py, gStep)
            if (occupied.has(gk)) continue
            occupied.add(gk)

            // Density-based skip
            const skipSeed = sr3(c + 0.1, r + 0.1, 33)
            if (skipSeed > density * 0.7) continue

            // Size varies based on distance to nearest attractor
            let minAttDist = Infinity
            let nearestAtt: Attractor | null = null
            for (const att of attractors) {
                const dx = nx - att.cx, dy = ny - att.cy
                const d = Math.sqrt(dx * dx + dy * dy)
                if (d < minAttDist) {
                    minAttDist = d
                    nearestAtt = att
                }
            }

            const attNormDist = Math.min(1, minAttDist / 0.5)
            const dim = lerp(cellSize * 0.8, cellSize * 2.5, Math.pow(attNormDist, 0.5))

            // Rotation from nearest attractor (weaker for gap-fills)
            let cellAngle = 0
            if (nearestAtt) {
                const dx = nx - nearestAtt.cx, dy = ny - nearestAtt.cy
                const tang = Math.atan2(dy, dx) + Math.PI / 2
                const inf = smoothstep(nearestAtt.radius * 2, 0, minAttDist)
                cellAngle = (nearestAtt.strength * nearestAtt.spin * inf
                    + tang * 0.08 * inf) * activity * distStr * 0.6
            }

            cells.push({
                id: cid++,
                x: px - dim / 2,
                y: py - dim / 2,
                w: dim,
                h: dim,
                nx, ny,
                angle: cellAngle,
                zone: zone as CellData["zone"],
                activity,
                ringDist: attNormDist,
                phase: sr3(px * 0.1, py * 0.1, 17),
            })
        }
    }

    // Sort: outer (large) cells first, inner (small) cells on top
    // This creates the visual cascade: small rotated cells on top of larger ones
    cells.sort((a, b) => b.ringDist - a.ringDist)

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
    cellSize: 28,
    density: 0.92,
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
    rotationStrength: 14,
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

    const cells = useMemo(
        () => makeCells(
            size.w, size.h, attractors, p.direction,
            p.coverage, p.falloffWidth, p.edgeStepping, p.randomness,
            p.cellSize, p.density,
            p.islandDensity, p.islandScatter, p.islandFade,
            p.distortionStrength
        ),
        [size.w, size.h, attractors, p.direction, p.coverage, p.falloffWidth,
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

            // ── Rotation angle ──
            let angle = p.rotationEnabled ? c.angle : 0

            // Ambient: gentle orbital oscillation
            if (p.ambientMotion && act > 0.05) {
                const a = p.motionAmount * act
                const s = p.drift
                // Use ringDist to create wave-like propagation from center
                angle += Math.sin(
                    time * s * 0.3 + c.ringDist * Math.PI * 2 + c.phase * 1.5
                ) * a * 0.04 * p.distortionStrength
            }

            // Hover: intensify rotation near cursor
            if (hInf > 0) {
                angle *= 1 + hInf * 0.6
            }

            const angleDeg = angle * (180 / Math.PI)

            // ── Background position (cover-correct) ──
            const bgX = -(c.x + cropX)
            const bgY = -(c.y + cropY)

            // ── Inner div expansion for rotation ──
            const absAngle = Math.abs(angle)
            const sinA = Math.sin(absAngle), cosA = Math.cos(absAngle)
            const expandX = (c.w * cosA + c.h * sinA - c.w) / 2 + 2
            const expandY = (c.w * sinA + c.h * cosA - c.h) / 2 + 2

            // Opacity
            let op = p.cellOpacity
            if (c.zone === "island") op *= 0.6 * act
            if (p.ambientMotion && p.flicker > 0) {
                op += Math.sin(time * 1.5 + c.phase * Math.PI * 6) * p.flicker * 0.04
                op = Math.max(0.1, Math.min(1, op))
            }

            // Subtle border radius on core cells for organic feel
            const bRadius = c.ringDist < 0.4 ? Math.round(Math.min(c.w, c.h) * 0.06) : 0

            // Filters
            let filter: string | undefined
            const fl: string[] = []
            if (p.contrast !== 0) fl.push(`contrast(${1 + p.contrast * act * 0.01})`)
            if (p.blur > 0) fl.push(`blur(${p.blur * act * 0.25}px)`)
            if (fl.length) filter = fl.join(" ")

            return { c, bgX, bgY, angleDeg, expandX, expandY, op, filter, bRadius }
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

            {/* Fragment field — radial cascade from attractor centers */}
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
                            borderRadius: d.bRadius,
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
                            transform: `rotate(${d.angleDeg}deg)`,
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
        min: 12, max: 80, step: 2, unit: "px", defaultValue: 28,
    },
    density: {
        type: ControlType.Number, title: "Density",
        min: 0.2, max: 1, step: 0.05, defaultValue: 0.92,
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
        min: 0, max: 45, step: 1, unit: "°", defaultValue: 14,
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
