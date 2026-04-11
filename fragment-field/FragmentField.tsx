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
 * A uniform rectangular grid overlays the source media.
 * Cluster sources within the distortion zone define "pull vectors"
 * that displace the image sample shown inside nearby cells.
 * Cells near the same cluster show related sample offsets,
 * creating pockets of repeated / echoed image content.
 *
 * Core zone cells can carry 2-3 overlapping sample layers
 * (each offset slightly differently from the same cluster pull)
 * to create denser optical reiteration.
 *
 * All cells remain rectangular and grid-aligned.
 * Visual richness comes from sampling behavior, not shape variety.
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
    cx: number // normalized x
    cy: number // normalized y
    pullX: number // px displacement along x
    pullY: number // px displacement along y
    radius: number // normalized influence radius
    strength: number // 0-1, depth-based
}

// A single renderable fragment (one layer inside one cell)
interface FragmentLayer {
    id: number
    // Grid position (px)
    x: number
    y: number
    w: number
    h: number
    // Normalized position
    nx: number
    ny: number
    // Sample displacement inherited from clusters
    sampleX: number
    sampleY: number
    // Visual
    opacity: number
    zone: "core" | "falloff" | "island"
    activity: number
    layer: number // 0 = base, 1+ = echo layers
    // Animation
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

// ─── Cluster Generation ──────────────────────────────────────────────────────
// Clusters are invisible "pull sources" that define how nearby cells
// displace their image sampling. They create coherent pockets where
// groups of cells show related shifted image content.

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

        // Place clusters within the active zone, biased toward origin
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

        // Pull: mostly directional, with slight lateral deviation
        const mag = strength * (12 + s3 * 22) * depthStr
        const lat = (s4 - 0.5) * strength * 8 * depthStr
        const pullX = dx * mag + dy * lat
        const pullY = dy * mag + dx * lat

        clusters.push({
            cx, cy,
            pullX, pullY,
            radius: 0.06 + s2 * 0.09,
            strength: depthStr,
        })
    }

    return clusters
}

// ─── Resolve cluster influence at a point ────────────────────────────────────
// Returns the blended pull vector from all nearby clusters.
// Because clusters overlap, neighboring cells naturally get
// related (but not identical) displacement — this creates
// the "echo pocket" effect.

function resolveClusterPull(
    nx: number,
    ny: number,
    clusters: ClusterSource[]
): { px: number; py: number; w: number } {
    let px = 0, py = 0, tw = 0

    for (const c of clusters) {
        const ddx = nx - c.cx
        const ddy = ny - c.cy
        const d = Math.sqrt(ddx * ddx + ddy * ddy)
        if (d > c.radius * 2.5) continue
        const w = smoothstep(c.radius * 2.5, 0, d) * c.strength
        if (w < 0.001) continue
        px += c.pullX * w
        py += c.pullY * w
        tw += w
    }

    if (tw > 0.001) {
        const norm = Math.min(tw, 1.5)
        return { px: px / norm, py: py / norm, w: tw }
    }
    return { px: 0, py: 0, w: 0 }
}

// ─── Fragment Generation ─────────────────────────────────────────────────────

function makeFragments(
    cW: number,
    cH: number,
    clusters: ClusterSource[],
    dir: Direction,
    coverage: number,
    falloffWidth: number,
    edgeStepping: number,
    randomness: number,
    cellSize: number,
    density: number,
    islandDensity: number,
    islandScatter: number,
    islandFade: number,
    distStr: number
): FragmentLayer[] {
    if (cW <= 0 || cH <= 0) return []

    const cols = Math.max(1, Math.floor(cW / cellSize))
    const rows = Math.max(1, Math.floor(cH / cellSize))
    const cellW = cW / cols
    const cellH = cH / rows
    const covN = coverage / 100
    const fallN = falloffWidth / 100
    const fallEnd = covN + fallN
    const steps = Math.max(1, edgeStepping)

    const frags: FragmentLayer[] = []
    let fid = 0

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const nx = (col + 0.5) / cols
            const ny = (row + 0.5) / rows
            const seed = sr2(col, row)
            const phase = sr(col * 571 + row * 239 + 17)
            const x = col * cellW
            const y = row * cellH
            const dist = getDistance(nx, ny, dir)

            // ── Zone ──
            let zone: FragmentLayer["zone"] | "clean" = "clean"
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
                // Density thinning per step
                if (seed > density * activity) {
                    zone = "clean"
                    activity = 0
                }
            }

            // Islands: prefer small groups (check neighbor)
            if (
                zone === "clean" &&
                dist >= fallEnd &&
                dist < fallEnd + islandScatter / 100
            ) {
                const thresh = 1 - (islandDensity / 100) * 0.18
                const nb = sr2(col + 1, row)
                if (phase > thresh && nb > thresh * 0.96) {
                    zone = "island"
                    const id2 = (dist - fallEnd) / (islandScatter / 100)
                    activity = Math.max(0, 1 - id2) * (1 - islandFade) * 0.4
                }
            }

            if (zone === "clean" || activity < 0.02) continue

            // ── Cluster pull ──
            const pull = resolveClusterPull(nx, ny, clusters)

            // ── Determine echo layer count ──
            // Core: 2-3 layers for optical density
            // Falloff: 1, maybe 2
            // Island: 1
            let layerCount = 1
            if (zone === "core") {
                // Deeper in core = more layers
                const coreDepth = 1 - dist / Math.max(0.01, covN)
                layerCount = coreDepth > 0.4 ? 3 : 2
                // Some cells stay single for rhythm
                if (sr3(col, row, 88) < 0.12) layerCount = 1
            } else if (zone === "falloff" && activity > 0.65) {
                layerCount = sr3(col, row, 44) > 0.6 ? 2 : 1
            }

            // ── Generate layers ──
            for (let L = 0; L < layerCount; L++) {
                const ls = sr3(col, row, L * 31 + 5)

                // Sample displacement:
                // Layer 0 (base): full cluster pull * activity
                // Layer 1+: echo — same direction, slightly different magnitude
                // This makes neighboring cells show related displaced content
                // and multi-layer cells show "echoed" repetitions
                const echoScale = L === 0
                    ? 1.0
                    : 0.5 + ls * 0.7 // echo layers: 50-120% of base pull
                const sampleX = pull.px * activity * echoScale * distStr
                const sampleY = pull.py * activity * echoScale * distStr

                // Opacity: echo layers stay bright (they show image, not dark overlays)
                // Visual separation comes from different sample offsets, not opacity stacking
                let opacity: number
                if (zone === "island") {
                    opacity = activity * 0.55
                } else if (L === 0) {
                    opacity = 0.95
                } else {
                    // Echo layers: high opacity — they show displaced image content,
                    // not dark panels. Differentiation is via sample offset.
                    opacity = 0.85 - L * 0.08
                }

                frags.push({
                    id: fid++,
                    x, y, w: cellW, h: cellH,
                    nx, ny,
                    sampleX,
                    sampleY,
                    opacity: Math.max(0.1, Math.min(1, opacity)),
                    zone: zone as FragmentLayer["zone"],
                    activity,
                    layer: L,
                    phase,
                })
            }
        }
    }

    return frags
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
    distortionStrength: 1,
    cellOpacity: 0.95,
    islandDensity: 25,
    islandScatter: 16,
    islandFade: 0.4,
    ambientMotion: true,
    motionAmount: 0.3,
    drift: 0.18,
    flicker: 0.05,
    rotationEnabled: true,
    rotationStrength: 4,
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
    const mouseRef = useRef({ x: -9999, y: -9999, on: false })
    const hoverRef = useRef<Map<string, number>>(new Map())
    const tRef = useRef(0)
    const rafRef = useRef(0)
    const [tick, setTick] = useState(0)

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

    // Clusters
    const clusters = useMemo(
        () => makeClusters(p.direction, p.coverage, p.falloffWidth, p.distortionStrength),
        [p.direction, p.coverage, p.falloffWidth, p.distortionStrength]
    )

    // Fragments
    const frags = useMemo(
        () => makeFragments(
            size.w, size.h, clusters, p.direction,
            p.coverage, p.falloffWidth, p.edgeStepping, p.randomness,
            p.cellSize, p.density, p.islandDensity, p.islandScatter,
            p.islandFade, p.distortionStrength
        ),
        [size.w, size.h, clusters, p.direction, p.coverage, p.falloffWidth,
         p.edgeStepping, p.randomness, p.cellSize, p.density,
         p.islandDensity, p.islandScatter, p.islandFade, p.distortionStrength]
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
            // Decay hover
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

    // Hover influence (cell-level, shared across layers)
    if (p.hoverEnabled && mouseRef.current.on && size.w > 0) {
        const mx = mouseRef.current.x, my = mouseRef.current.y, r = p.hoverRadius
        // Only check unique cell positions (layer 0)
        for (const f of frags) {
            if (f.layer !== 0) continue
            const cx = f.x + f.w / 2, cy = f.y + f.h / 2
            const d = Math.sqrt((mx - cx) ** 2 + (my - cy) ** 2)
            if (d < r) {
                const inf = smoothstep(r, r * 0.2, d) * p.hoverIntensity
                const k = `${f.x},${f.y}`
                const cur = hoverRef.current.get(k) || 0
                hoverRef.current.set(k, Math.max(cur, inf))
            }
        }
    }

    const time = tRef.current
    const cW = size.w, cH = size.h

    // Render data
    const renderData = useMemo(() => {
        if (cW <= 0 || cH <= 0) return []

        return frags.map((f) => {
            const hk = `${f.x},${f.y}`
            const hInf = hoverRef.current.get(hk) || 0
            const act = Math.min(1, f.activity + hInf * 0.4)

            // ── Sample offset — cluster-inherited, scaled by activity ──
            let sx = f.sampleX * act
            let sy = f.sampleY * act

            // ── Rotation as sample displacement ──
            // Instead of CSS rotate (which creates dark stacked slabs),
            // rotation translates into additional sample offset —
            // as if the sampling point is pivoted around the cell center.
            // This creates "dragged" / "pivoted crop" behavior:
            // the cell still shows image content, just pulled from
            // a rotationally-displaced source position.
            if (p.rotationEnabled) {
                const rotSeed = sr3(f.x, f.y, f.layer * 77 + 3)
                const zoneScale = f.zone === "core" ? 1
                    : f.zone === "falloff" ? 0.5
                    : 0.25

                // Rotation angle in radians
                let angle = (rotSeed - 0.5) * 2 * p.rotationStrength * act * zoneScale
                    * (Math.PI / 180)

                // Echo layers: additional angular separation
                if (f.layer > 0) {
                    angle += (sr3(f.x, f.y, f.layer * 131) - 0.5)
                        * p.rotationStrength * 0.5 * act * (Math.PI / 180)
                }

                // Ambient angular oscillation
                if (p.ambientMotion) {
                    angle += Math.sin(
                        time * p.drift * 0.2 + f.nx * Math.PI * 2.5
                    ) * p.rotationStrength * 0.12 * p.motionAmount * act
                        * (Math.PI / 180)
                }

                // Convert angle to sample offset displacement:
                // pivot radius scales with cell size and strength
                const pivotRadius = (f.w + f.h) * 0.35 * p.distortionStrength
                sx += Math.sin(angle) * pivotRadius
                sy += -Math.cos(angle) * pivotRadius + pivotRadius // bias downward offset
            }

            // ── Ambient drift — spatially coherent ──
            if (p.ambientMotion && act > 0.05) {
                const a = p.motionAmount * act
                const s = p.drift
                sx += Math.sin(time * s * 0.4 + f.nx * Math.PI * 1.6) * a * 1.6
                sy += Math.cos(time * s * 0.28 + f.ny * Math.PI * 1.2) * a * 1.0
            }

            // ── Hover boost ──
            if (hInf > 0) {
                sx *= 1 + hInf * 0.4
                sy *= 1 + hInf * 0.4
            }

            // ── Background position ──
            const bgX = -f.x + sx
            const bgY = -f.y + sy

            // ── Opacity ──
            let op = f.opacity * p.cellOpacity * act
            if (p.ambientMotion && p.flicker > 0 && f.layer === 0) {
                op += Math.sin(time * 1.5 + f.phase * Math.PI * 6) * p.flicker * 0.04
                op = Math.max(0.08, Math.min(1, op))
            }

            // ── Filters ──
            let filter: string | undefined
            const fl: string[] = []
            if (p.contrast !== 0) fl.push(`contrast(${1 + p.contrast * act * 0.01})`)
            if (p.blur > 0) fl.push(`blur(${p.blur * act * 0.25}px)`)
            if (fl.length) filter = fl.join(" ")

            return { f, bgX, bgY, op, filter }
        })
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [frags, tick, p, cW, cH])

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
            {/* Base media — clean zone */}
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

            {/* Fragment field */}
            <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
                {renderData.map((d) => {
                    const { f } = d
                    const bleed = 1

                    return (
                        <div
                            key={f.id}
                            style={{
                                position: "absolute",
                                left: f.x - bleed,
                                top: f.y - bleed,
                                width: f.w + bleed * 2,
                                height: f.h + bleed * 2,
                                overflow: "hidden",
                                opacity: d.op,
                            }}
                        >
                            {/* No CSS rotation — rotation is expressed as
                                sample displacement in bgX/bgY instead,
                                keeping the visual result image-based
                                rather than creating dark stacked panels */}
                            <div
                                style={{
                                    position: "absolute",
                                    inset: 0,
                                    backgroundImage: `url(${p.source})`,
                                    backgroundSize: `${cW}px ${cH}px`,
                                    backgroundPosition: `${d.bgX + bleed}px ${d.bgY + bleed}px`,
                                    backgroundRepeat: "no-repeat",
                                    filter: d.filter,
                                }}
                            />
                        </div>
                    )
                })}
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
        min: 0, max: 3, step: 0.1, defaultValue: 1,
    },
    cellOpacity: {
        type: ControlType.Number, title: "Opacity",
        min: 0.2, max: 1, step: 0.05, defaultValue: 0.95,
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
        type: ControlType.Boolean, title: "Internal Rotation", defaultValue: true,
    },
    rotationStrength: {
        type: ControlType.Number, title: "Rotation Strength",
        min: 0, max: 20, step: 0.5, unit: "°", defaultValue: 4,
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
