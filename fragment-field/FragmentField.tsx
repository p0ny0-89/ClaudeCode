import { addPropertyControls, ControlType } from "framer"
import React, {
    useRef,
    useState,
    useEffect,
    useCallback,
    useMemo,
} from "react"

/*
 * FragmentField — Directional cell-based image fragmentation
 *
 * Visual model:
 * A rectangular grid of cells overlays source media. Within the
 * distortion zone, each active cell shows image content sampled
 * from a displaced position — driven by cluster pull vectors.
 *
 * Key design decisions:
 * - ONE div per cell, FULL opacity. No multi-layer stacking.
 * - background-size computed to match object-fit:cover exactly
 *   so cells show the SAME image rendering as the base layer.
 * - When a cell has zero displacement it is invisible (identical
 *   to base). Displacement makes cells visibly different.
 * - "Echo" effect: neighboring cells share related cluster offsets,
 *   creating grouped pockets of repeated image content.
 * - Some core cells inherit a neighbor's sample position entirely,
 *   creating crisp optical reiteration.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

type Direction =
    | "left"
    | "right"
    | "top"
    | "bottom"
    | "top-left"
    | "top-right"
    | "bottom-left"
    | "bottom-right"

interface ClusterSource {
    cx: number
    cy: number
    pullX: number
    pullY: number
    radius: number
    strength: number
}

interface CellData {
    id: number
    x: number
    y: number
    w: number
    h: number
    col: number
    row: number
    nx: number
    ny: number
    zone: "core" | "falloff" | "island"
    activity: number
    sampleX: number // px displacement of image sample
    sampleY: number
    phase: number
    seed: number
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

function smoothstep(edge0: number, edge1: number, x: number): number {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)))
    return t * t * (3 - 2 * t)
}

function getDistance(nx: number, ny: number, dir: Direction): number {
    switch (dir) {
        case "left": return nx
        case "right": return 1 - nx
        case "top": return ny
        case "bottom": return 1 - ny
        case "top-left": return Math.sqrt(nx * nx + ny * ny) / Math.SQRT2
        case "top-right": return Math.sqrt((1 - nx) ** 2 + ny * ny) / Math.SQRT2
        case "bottom-left": return Math.sqrt(nx * nx + (1 - ny) ** 2) / Math.SQRT2
        case "bottom-right": return Math.sqrt((1 - nx) ** 2 + (1 - ny) ** 2) / Math.SQRT2
    }
}

function getDirVec(dir: Direction): { dx: number; dy: number } {
    switch (dir) {
        case "left": return { dx: 1, dy: 0 }
        case "right": return { dx: -1, dy: 0 }
        case "top": return { dx: 0, dy: 1 }
        case "bottom": return { dx: 0, dy: -1 }
        case "top-left": return { dx: 0.707, dy: 0.707 }
        case "top-right": return { dx: -0.707, dy: 0.707 }
        case "bottom-left": return { dx: 0.707, dy: -0.707 }
        case "bottom-right": return { dx: -0.707, dy: -0.707 }
    }
}

// ─── Cover-equivalent background size ────────────────────────────────────────
// Computes the background-size and crop offset that replicates
// object-fit:cover + object-position for use with background-image.

function computeCoverSize(
    imgW: number,
    imgH: number,
    containerW: number,
    containerH: number,
    posX: number,
    posY: number
): { bgW: number; bgH: number; cropX: number; cropY: number } {
    const imgAspect = imgW / imgH
    const contAspect = containerW / containerH
    let bgW: number, bgH: number

    if (imgAspect > contAspect) {
        // Image wider than container: height fills, width overflows
        bgH = containerH
        bgW = containerH * imgAspect
    } else {
        // Image taller: width fills, height overflows
        bgW = containerW
        bgH = containerW / imgAspect
    }

    // Crop offset based on position (0-100%)
    const cropX = (bgW - containerW) * (posX / 100)
    const cropY = (bgH - containerH) * (posY / 100)

    return { bgW, bgH, cropX, cropY }
}

// ─── Clusters ────────────────────────────────────────────────────────────────

function makeClusters(
    dir: Direction,
    coverage: number,
    falloffWidth: number,
    strength: number
): ClusterSource[] {
    const covN = coverage / 100
    const fallEnd = covN + falloffWidth / 100
    const { dx, dy } = getDirVec(dir)
    const clusters: ClusterSource[] = []
    const count = Math.round(8 + covN * 10)

    for (let i = 0; i < count; i++) {
        const s1 = sr(i * 73 + 13)
        const s2 = sr(i * 137 + 29)
        const s3 = sr(i * 251 + 41)
        const s4 = sr(i * 397 + 67)

        let cx: number, cy: number
        const reach = fallEnd * 0.9

        switch (dir) {
            case "left": cx = s1 * reach; cy = s2; break
            case "right": cx = 1 - s1 * reach; cy = s2; break
            case "top": cx = s2; cy = s1 * reach; break
            case "bottom": cx = s2; cy = 1 - s1 * reach; break
            case "top-left": cx = s1 * reach; cy = s2 * reach; break
            case "top-right": cx = 1 - s1 * reach; cy = s2 * reach; break
            case "bottom-left": cx = s1 * reach; cy = 1 - s2 * reach; break
            case "bottom-right": cx = 1 - s1 * reach; cy = 1 - s2 * reach; break
        }

        const dist = getDistance(cx, cy, dir)
        const depthStr = Math.max(0, 1 - dist / fallEnd)

        const mag = strength * (14 + s3 * 28) * depthStr
        const lat = (s4 - 0.5) * strength * 10 * depthStr

        clusters.push({
            cx, cy,
            pullX: dx * mag + dy * lat,
            pullY: dy * mag + dx * lat,
            radius: 0.06 + s2 * 0.1,
            strength: depthStr,
        })
    }
    return clusters
}

function resolveClusterPull(
    nx: number, ny: number, clusters: ClusterSource[]
): { px: number; py: number } {
    let px = 0, py = 0, tw = 0
    for (const c of clusters) {
        const ddx = nx - c.cx, ddy = ny - c.cy
        const d = Math.sqrt(ddx * ddx + ddy * ddy)
        if (d > c.radius * 2.5) continue
        const w = smoothstep(c.radius * 2.5, 0, d) * c.strength
        if (w < 0.001) continue
        px += c.pullX * w
        py += c.pullY * w
        tw += w
    }
    if (tw > 0.001) {
        const n = Math.min(tw, 1.5)
        return { px: px / n, py: py / n }
    }
    return { px: 0, py: 0 }
}

// ─── Cell Generation ─────────────────────────────────────────────────────────

function makeCells(
    cW: number, cH: number,
    clusters: ClusterSource[],
    dir: Direction,
    coverage: number, falloffWidth: number,
    edgeStepping: number, randomness: number,
    cellSize: number, density: number,
    islandDensity: number, islandScatter: number, islandFade: number,
    distStr: number, rotEnabled: boolean, rotStr: number
): CellData[] {
    if (cW <= 0 || cH <= 0) return []

    const cols = Math.max(1, Math.floor(cW / cellSize))
    const rows = Math.max(1, Math.floor(cH / cellSize))
    const cellW = cW / cols
    const cellH = cH / rows
    const covN = coverage / 100
    const fallN = falloffWidth / 100
    const fallEnd = covN + fallN
    const steps = Math.max(1, edgeStepping)

    const cells: CellData[] = []
    let cid = 0

    // First pass: compute base data for all cells so neighbors can reference each other
    const grid: {
        zone: CellData["zone"] | "clean"
        activity: number
        pull: { px: number; py: number }
    }[][] = []

    for (let row = 0; row < rows; row++) {
        grid[row] = []
        for (let col = 0; col < cols; col++) {
            const nx = (col + 0.5) / cols
            const ny = (row + 0.5) / rows
            const seed = sr2(col, row)
            const dist = getDistance(nx, ny, dir)

            let zone: CellData["zone"] | "clean" = "clean"
            let activity = 0
            const jitter = (seed - 0.5) * randomness * 0.08

            if (dist < covN + jitter) {
                zone = "core"
                activity = 1
            } else if (dist < fallEnd + jitter) {
                zone = "falloff"
                const t = (dist - covN) / Math.max(0.001, fallN)
                const stepped = Math.floor(t * steps) / steps
                activity = Math.max(0, 1 - stepped)
                if (seed > density * activity) {
                    zone = "clean"
                    activity = 0
                }
            }

            // Islands
            if (zone === "clean" && dist >= fallEnd && dist < fallEnd + islandScatter / 100) {
                const thresh = 1 - (islandDensity / 100) * 0.18
                const phase = sr(col * 571 + row * 239 + 17)
                const nb = sr2(col + 1, row)
                if (phase > thresh && nb > thresh * 0.96) {
                    zone = "island"
                    const id2 = (dist - fallEnd) / (islandScatter / 100)
                    activity = Math.max(0, 1 - id2) * (1 - islandFade) * 0.45
                }
            }

            const pull = zone !== "clean"
                ? resolveClusterPull(nx, ny, clusters)
                : { px: 0, py: 0 }

            grid[row][col] = { zone, activity, pull }
        }
    }

    // Second pass: build cells with neighbor-aware sampling
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const g = grid[row][col]
            if (g.zone === "clean" || g.activity < 0.02) continue

            const nx = (col + 0.5) / cols
            const ny = (row + 0.5) / rows
            const seed = sr2(col, row)
            const phase = sr(col * 571 + row * 239 + 17)

            let sampleX = g.pull.px * g.activity * distStr
            let sampleY = g.pull.py * g.activity * distStr

            // ── Neighbor echo: some core cells duplicate a neighbor's sample ──
            // This creates visible repeated image fragments across the grid
            if (g.zone === "core") {
                const echoSeed = sr3(col, row, 55)
                if (echoSeed > 0.65) {
                    // Pick a neighbor to echo
                    const echoDir = Math.floor(sr3(col, row, 77) * 4)
                    const nCol = col + (echoDir === 0 ? -1 : echoDir === 1 ? 1 : 0)
                    const nRow = row + (echoDir === 2 ? -1 : echoDir === 3 ? 1 : 0)

                    if (nRow >= 0 && nRow < rows && nCol >= 0 && nCol < cols) {
                        const ng = grid[nRow][nCol]
                        if (ng.zone === "core" || ng.zone === "falloff") {
                            // Blend toward neighbor's sample: creates reiteration
                            const blend = 0.5 + echoSeed * 0.4
                            const neighborSX = ng.pull.px * ng.activity * distStr
                            const neighborSY = ng.pull.py * ng.activity * distStr
                            sampleX = sampleX * (1 - blend) + neighborSX * blend
                            sampleY = sampleY * (1 - blend) + neighborSY * blend
                        }
                    }
                }
            }

            // ── Rotation as sample displacement ──
            if (rotEnabled) {
                const rotSeed = sr3(col, row, 3)
                const zoneScale = g.zone === "core" ? 1
                    : g.zone === "falloff" ? 0.5 : 0.25
                let angle = (rotSeed - 0.5) * 2 * rotStr * g.activity * zoneScale * (Math.PI / 180)
                const pivotR = (cellW + cellH) * 0.35 * distStr
                sampleX += Math.sin(angle) * pivotR
                sampleY += (1 - Math.cos(angle)) * pivotR
            }

            cells.push({
                id: cid++,
                x: col * cellW,
                y: row * cellH,
                w: cellW, h: cellH,
                col, row, nx, ny,
                zone: g.zone as CellData["zone"],
                activity: g.activity,
                sampleX, sampleY,
                phase, seed,
            })
        }
    }

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
    direction: "left",
    coverage: 38,
    falloffWidth: 22,
    edgeStepping: 6,
    randomness: 0.5,
    cellSize: 32,
    density: 0.92,
    distortionStrength: 1.2,
    cellOpacity: 1,
    islandDensity: 25,
    islandScatter: 16,
    islandFade: 0.4,
    ambientMotion: true,
    motionAmount: 0.3,
    drift: 0.18,
    flicker: 0.05,
    rotationEnabled: true,
    rotationStrength: 6,
    hoverEnabled: true,
    hoverRadius: 100,
    hoverIntensity: 0.55,
    hoverRecovery: 0.06,
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

    // Load image natural dimensions for correct cover computation
    useEffect(() => {
        if (p.mediaType !== "image") return
        const img = new Image()
        img.onload = () => setImgDims({ w: img.naturalWidth, h: img.naturalHeight })
        img.src = p.source
    }, [p.source, p.mediaType])

    // Resize
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

    // Cover-equivalent background sizing
    const cover = useMemo(() => {
        if (imgDims.w <= 0 || imgDims.h <= 0 || size.w <= 0 || size.h <= 0) {
            return { bgW: size.w, bgH: size.h, cropX: 0, cropY: 0 }
        }
        return computeCoverSize(imgDims.w, imgDims.h, size.w, size.h, p.positionX, p.positionY)
    }, [imgDims.w, imgDims.h, size.w, size.h, p.positionX, p.positionY])

    // Clusters
    const clusters = useMemo(
        () => makeClusters(p.direction, p.coverage, p.falloffWidth, p.distortionStrength),
        [p.direction, p.coverage, p.falloffWidth, p.distortionStrength]
    )

    // Cells
    const cells = useMemo(
        () => makeCells(
            size.w, size.h, clusters, p.direction,
            p.coverage, p.falloffWidth, p.edgeStepping, p.randomness,
            p.cellSize, p.density,
            p.islandDensity, p.islandScatter, p.islandFade,
            p.distortionStrength, p.rotationEnabled, p.rotationStrength
        ),
        [size.w, size.h, clusters, p.direction, p.coverage, p.falloffWidth,
         p.edgeStepping, p.randomness, p.cellSize, p.density,
         p.islandDensity, p.islandScatter, p.islandFade,
         p.distortionStrength, p.rotationEnabled, p.rotationStrength]
    )

    // Mouse
    const onMM = useCallback((e: React.MouseEvent) => {
        if (!p.hoverEnabled) return
        const r = containerRef.current?.getBoundingClientRect()
        if (!r) return
        mouseRef.current = { x: e.clientX - r.left, y: e.clientY - r.top, on: true }
    }, [p.hoverEnabled])

    const onML = useCallback(() => {
        mouseRef.current = { ...mouseRef.current, on: false }
    }, [])

    // Animation
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

    // Hover
    if (p.hoverEnabled && mouseRef.current.on && size.w > 0) {
        const mx = mouseRef.current.x, my = mouseRef.current.y, r = p.hoverRadius
        for (const c of cells) {
            const cx = c.x + c.w / 2, cy = c.y + c.h / 2
            const d = Math.sqrt((mx - cx) ** 2 + (my - cy) ** 2)
            if (d < r) {
                const inf = smoothstep(r, r * 0.2, d) * p.hoverIntensity
                const cur = hoverRef.current.get(c.id) || 0
                hoverRef.current.set(c.id, Math.max(cur, inf))
            }
        }
    }

    const time = tRef.current
    const cW = size.w, cH = size.h
    const { bgW, bgH, cropX, cropY } = cover

    // Render
    const renderData = useMemo(() => {
        if (cW <= 0 || cH <= 0) return []

        return cells.map((c) => {
            const hInf = hoverRef.current.get(c.id) || 0
            const act = Math.min(1, c.activity + hInf * 0.5)

            let sx = c.sampleX * act
            let sy = c.sampleY * act

            // Ambient drift — spatially coherent
            if (p.ambientMotion && act > 0.05) {
                const a = p.motionAmount * act
                const s = p.drift
                sx += Math.sin(time * s * 0.4 + c.nx * Math.PI * 1.6) * a * 2
                sy += Math.cos(time * s * 0.28 + c.ny * Math.PI * 1.2) * a * 1.2
            }

            // Hover boost
            if (hInf > 0) {
                sx *= 1 + hInf * 0.5
                sy *= 1 + hInf * 0.5
            }

            // Background position: cover-correct alignment + displacement
            // With zero displacement, this exactly matches the base <img>
            const bgX = -(c.x + cropX) + sx
            const bgY = -(c.y + cropY) + sy

            // Opacity: full for most cells, only islands are slightly reduced
            let op = p.cellOpacity
            if (c.zone === "island") {
                op *= 0.65 * act
            }
            // Flicker
            if (p.ambientMotion && p.flicker > 0) {
                op += Math.sin(time * 1.5 + c.phase * Math.PI * 6) * p.flicker * 0.04
                op = Math.max(0.1, Math.min(1, op))
            }

            // Filters
            let filter: string | undefined
            const fl: string[] = []
            if (p.contrast !== 0) fl.push(`contrast(${1 + p.contrast * act * 0.01})`)
            if (p.blur > 0) fl.push(`blur(${p.blur * act * 0.25}px)`)
            if (fl.length) filter = fl.join(" ")

            return { c, bgX, bgY, op, filter }
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
            {/* Base media — clean, always visible */}
            {p.mediaType === "image" ? (
                <img
                    src={p.source} alt=""
                    style={{
                        position: "absolute", inset: 0,
                        width: "100%", height: "100%",
                        objectFit: p.objectFit, objectPosition: objPos,
                        display: "block",
                    }}
                />
            ) : (
                <video
                    src={p.source} autoPlay loop muted playsInline
                    style={{
                        position: "absolute", inset: 0,
                        width: "100%", height: "100%",
                        objectFit: p.objectFit, objectPosition: objPos,
                        display: "block",
                    }}
                />
            )}

            {/* Fragment cells — one div per cell, full opacity, displaced sampling */}
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
                            backgroundImage: `url(${p.source})`,
                            backgroundSize: `${bgW}px ${bgH}px`,
                            backgroundPosition: `${d.bgX}px ${d.bgY}px`,
                            backgroundRepeat: "no-repeat",
                            filter: d.filter,
                        }}
                    />
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
        defaultValue: "left",
    },
    coverage: {
        type: ControlType.Number, title: "Coverage",
        min: 5, max: 85, step: 1, unit: "%", defaultValue: 38,
    },
    falloffWidth: {
        type: ControlType.Number, title: "Falloff Width",
        min: 0, max: 50, step: 1, unit: "%", defaultValue: 22,
    },
    edgeStepping: {
        type: ControlType.Number, title: "Edge Stepping",
        min: 2, max: 12, step: 1, defaultValue: 6,
    },
    randomness: {
        type: ControlType.Number, title: "Randomness",
        min: 0, max: 1, step: 0.05, defaultValue: 0.5,
    },
    cellSize: {
        type: ControlType.Number, title: "Cell Size",
        min: 12, max: 120, step: 2, unit: "px", defaultValue: 32,
    },
    density: {
        type: ControlType.Number, title: "Density",
        min: 0.2, max: 1, step: 0.05, defaultValue: 0.92,
    },
    distortionStrength: {
        type: ControlType.Number, title: "Distortion",
        min: 0, max: 3, step: 0.1, defaultValue: 1.2,
    },
    cellOpacity: {
        type: ControlType.Number, title: "Opacity",
        min: 0.2, max: 1, step: 0.05, defaultValue: 1,
    },
    islandDensity: {
        type: ControlType.Number, title: "Island Density",
        min: 0, max: 80, step: 1, unit: "%", defaultValue: 25,
    },
    islandScatter: {
        type: ControlType.Number, title: "Island Scatter",
        min: 0, max: 40, step: 1, unit: "%", defaultValue: 16,
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
        min: 0, max: 2, step: 0.05, defaultValue: 0.3,
        hidden: (p) => !p.ambientMotion,
    },
    drift: {
        type: ControlType.Number, title: "Drift",
        min: 0, max: 2, step: 0.05, defaultValue: 0.18,
        hidden: (p) => !p.ambientMotion,
    },
    flicker: {
        type: ControlType.Number, title: "Flicker",
        min: 0, max: 1, step: 0.05, defaultValue: 0.05,
        hidden: (p) => !p.ambientMotion,
    },
    rotationEnabled: {
        type: ControlType.Boolean, title: "Rotation", defaultValue: true,
    },
    rotationStrength: {
        type: ControlType.Number, title: "Rotation Strength",
        min: 0, max: 20, step: 0.5, unit: "°", defaultValue: 6,
        hidden: (p) => !p.rotationEnabled,
    },
    hoverEnabled: {
        type: ControlType.Boolean, title: "Hover Reactive", defaultValue: true,
    },
    hoverRadius: {
        type: ControlType.Number, title: "Hover Radius",
        min: 30, max: 300, step: 5, unit: "px", defaultValue: 100,
        hidden: (p) => !p.hoverEnabled,
    },
    hoverIntensity: {
        type: ControlType.Number, title: "Hover Intensity",
        min: 0, max: 1, step: 0.05, defaultValue: 0.55,
        hidden: (p) => !p.hoverEnabled,
    },
    hoverRecovery: {
        type: ControlType.Number, title: "Hover Recovery",
        min: 0.01, max: 0.2, step: 0.01, defaultValue: 0.06,
        hidden: (p) => !p.hoverEnabled,
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
