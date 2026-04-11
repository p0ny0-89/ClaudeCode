import { addPropertyControls, ControlType } from "framer"
import React, {
    useRef,
    useState,
    useEffect,
    useCallback,
    useMemo,
} from "react"

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

// A single visual fragment: a shaped, clipped piece of re-sampled image
interface Fragment {
    // Position within the grid (cell-aligned)
    cellX: number
    cellY: number
    cellW: number
    cellH: number
    // Sample offset: where this fragment pulls image data from
    sampleOffsetX: number
    sampleOffsetY: number
    // Shape
    clipPath: string | null
    // Visual
    opacity: number
    rotation: number // subtle internal rotation
    scale: number
    // Identity
    id: number
    depth: number // 0=deepest, higher=front
    zone: "core" | "falloff" | "island"
    activity: number
    // Animation seeds
    phase: number
    nx: number
    ny: number
}

// A cluster source: defines a shared sampling "pull" that nearby fragments inherit
interface ClusterSource {
    cx: number
    cy: number
    pullX: number // px: how far this cluster drags the sample
    pullY: number // px: how far this cluster drags the sample
    radius: number // normalized influence radius
    strength: number
    shapeFamily: number // 0-3, which shape set this cluster prefers
    layerCount: number // how many layers fragments in this cluster tend to have
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
    const x =
        Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453
    return x - Math.floor(x)
}

function smoothstep(edge0: number, edge1: number, x: number): number {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)))
    return t * t * (3 - 2 * t)
}

function getDirectionalDistance(
    nx: number,
    ny: number,
    direction: Direction
): number {
    switch (direction) {
        case "left":
            return nx
        case "right":
            return 1 - nx
        case "top":
            return ny
        case "bottom":
            return 1 - ny
        case "top-left":
            return Math.sqrt(nx * nx + ny * ny) / Math.SQRT2
        case "top-right":
            return Math.sqrt((1 - nx) ** 2 + ny * ny) / Math.SQRT2
        case "bottom-left":
            return Math.sqrt(nx * nx + (1 - ny) ** 2) / Math.SQRT2
        case "bottom-right":
            return Math.sqrt((1 - nx) ** 2 + (1 - ny) ** 2) / Math.SQRT2
    }
}

function getDirectionVector(d: Direction): { dx: number; dy: number } {
    switch (d) {
        case "left":
            return { dx: 1, dy: 0 }
        case "right":
            return { dx: -1, dy: 0 }
        case "top":
            return { dx: 0, dy: 1 }
        case "bottom":
            return { dx: 0, dy: -1 }
        case "top-left":
            return { dx: 0.707, dy: 0.707 }
        case "top-right":
            return { dx: -0.707, dy: 0.707 }
        case "bottom-left":
            return { dx: 0.707, dy: -0.707 }
        case "bottom-right":
            return { dx: -0.707, dy: -0.707 }
    }
}

// ─── Geometric Shape Library ─────────────────────────────────────────────────
// These clip-paths create the quarter-circle, triangle, and half-shape
// fragments visible in the reference. Each "family" is a group of
// complementary shapes that interlock visually.

const SHAPE_FAMILIES = [
    // Family 0: Quarter circles
    [
        "circle(71% at 0% 0%)",
        "circle(71% at 100% 0%)",
        "circle(71% at 0% 100%)",
        "circle(71% at 100% 100%)",
    ],
    // Family 1: Triangles
    [
        "polygon(0% 0%, 100% 0%, 0% 100%)",
        "polygon(0% 0%, 100% 0%, 100% 100%)",
        "polygon(0% 0%, 100% 100%, 0% 100%)",
        "polygon(100% 0%, 100% 100%, 0% 100%)",
    ],
    // Family 2: Half shapes
    [
        "inset(0% 0% 50% 0%)",
        "inset(50% 0% 0% 0%)",
        "inset(0% 0% 0% 50%)",
        "inset(0% 50% 0% 0%)",
    ],
    // Family 3: Larger quarter circles (softer, wider coverage)
    [
        "circle(100% at 0% 0%)",
        "circle(100% at 100% 0%)",
        "circle(100% at 0% 100%)",
        "circle(100% at 100% 100%)",
    ],
]

// ─── Cluster Generation ──────────────────────────────────────────────────────

function generateClusters(
    direction: Direction,
    coverage: number,
    falloffWidth: number,
    strength: number,
    containerW: number,
    containerH: number
): ClusterSource[] {
    if (containerW <= 0 || containerH <= 0) return []

    const coverageNorm = coverage / 100
    const falloffEnd = coverageNorm + falloffWidth / 100
    const { dx, dy } = getDirectionVector(direction)

    const clusters: ClusterSource[] = []
    const count = Math.round(6 + coverageNorm * 14)

    for (let i = 0; i < count; i++) {
        const s1 = sr(i * 73 + 13)
        const s2 = sr(i * 137 + 29)
        const s3 = sr(i * 251 + 41)
        const s4 = sr(i * 397 + 67)
        const s5 = sr(i * 521 + 83)

        // Position biased toward origin
        let cx: number, cy: number
        const reach = falloffEnd * 0.92

        switch (direction) {
            case "left":
                cx = s1 * reach; cy = s2; break
            case "right":
                cx = 1 - s1 * reach; cy = s2; break
            case "top":
                cx = s2; cy = s1 * reach; break
            case "bottom":
                cx = s2; cy = 1 - s1 * reach; break
            case "top-left":
                cx = s1 * reach; cy = s2 * reach; break
            case "top-right":
                cx = 1 - s1 * reach; cy = s2 * reach; break
            case "bottom-left":
                cx = s1 * reach; cy = 1 - s2 * reach; break
            case "bottom-right":
                cx = 1 - s1 * reach; cy = 1 - s2 * reach; break
        }

        const dist = getDirectionalDistance(cx, cy, direction)
        const depthStrength = Math.max(0, 1 - dist / falloffEnd)

        // Directional pull — the main distortion vector
        const pullMag = strength * (8 + s3 * 30) * depthStrength
        const lateral = (s4 - 0.5) * strength * 10
        const pullX = dx * pullMag + dy * lateral
        const pullY = dy * pullMag + dx * lateral

        // Shape family: each cluster prefers one geometric style
        const shapeFamily = Math.floor(s5 * SHAPE_FAMILIES.length)

        // Layer count: clusters deeper in the field spawn more layers
        const layerCount = Math.round(1.5 + depthStrength * 2.5)

        clusters.push({
            cx,
            cy,
            pullX,
            pullY,
            radius: 0.05 + s2 * 0.12,
            strength: depthStrength,
            shapeFamily,
            layerCount,
        })
    }

    return clusters
}

// ─── Fragment Generation ─────────────────────────────────────────────────────
// Instead of one-tile-per-cell, we generate multiple shaped fragments
// per active cell. The number of layers and shape variety depends on
// how deep the cell is within the distortion field.

function generateFragments(
    containerW: number,
    containerH: number,
    clusters: ClusterSource[],
    direction: Direction,
    coverage: number,
    falloffWidth: number,
    edgeStepping: number,
    randomness: number,
    cellSize: number,
    density: number,
    islandDensity: number,
    islandScatter: number,
    islandFade: number,
    distortionStrength: number
): Fragment[] {
    if (containerW <= 0 || containerH <= 0) return []

    const cols = Math.max(1, Math.floor(containerW / cellSize))
    const rows = Math.max(1, Math.floor(containerH / cellSize))
    const cellW = containerW / cols
    const cellH = containerH / rows

    const coverageNorm = coverage / 100
    const falloffNorm = falloffWidth / 100
    const falloffEnd = coverageNorm + falloffNorm

    const fragments: Fragment[] = []
    let fid = 0

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const nx = (col + 0.5) / cols
            const ny = (row + 0.5) / rows
            const seed = sr2(col, row)
            const phase = sr(col * 571 + row * 239 + 17)

            const cellX = col * cellW
            const cellY = row * cellH

            const dist = getDirectionalDistance(nx, ny, direction)

            // ── Zone determination ──
            let zone: Fragment["zone"] | "clean" = "clean"
            let activity = 0

            const stepCount = Math.max(1, edgeStepping)
            const stepOffset = (seed - 0.5) * randomness * 0.08

            if (dist < coverageNorm + stepOffset) {
                zone = "core"
                activity = 1
            } else if (dist < falloffEnd + stepOffset) {
                zone = "falloff"
                const rawT =
                    (dist - coverageNorm) / Math.max(0.001, falloffNorm)
                const steppedT =
                    Math.floor(rawT * stepCount) / stepCount
                activity = Math.max(0, 1 - steppedT)

                const stepDensity = density * activity
                if (seed > stepDensity) {
                    zone = "clean"
                    activity = 0
                }
            }

            // Islands
            if (
                zone === "clean" &&
                dist >= falloffEnd &&
                dist < falloffEnd + islandScatter / 100
            ) {
                const islandThreshold =
                    1 - (islandDensity / 100) * 0.2
                const neighborSeed = sr2(col + 1, row)
                if (
                    phase > islandThreshold &&
                    neighborSeed > islandThreshold * 0.97
                ) {
                    zone = "island"
                    const islandDist =
                        (dist - falloffEnd) / (islandScatter / 100)
                    activity =
                        Math.max(0, 1 - islandDist) *
                        (1 - islandFade) *
                        0.45
                }
            }

            if (zone === "clean" || activity < 0.02) continue

            // ── Find dominant cluster for this cell ──
            let bestCluster: ClusterSource | null = null
            let bestWeight = 0

            for (const cluster of clusters) {
                const cdx = nx - cluster.cx
                const cdy = ny - cluster.cy
                const d = Math.sqrt(cdx * cdx + cdy * cdy)
                const w =
                    smoothstep(cluster.radius * 2.5, 0, d) *
                    cluster.strength
                if (w > bestWeight) {
                    bestWeight = w
                    bestCluster = cluster
                }
            }

            // Blended cluster influence for sample offset
            let blendPullX = 0
            let blendPullY = 0
            let totalW = 0
            for (const cluster of clusters) {
                const cdx = nx - cluster.cx
                const cdy = ny - cluster.cy
                const d = Math.sqrt(cdx * cdx + cdy * cdy)
                const w =
                    smoothstep(cluster.radius * 2.5, 0, d) *
                    cluster.strength
                if (w > 0.001) {
                    blendPullX += cluster.pullX * w
                    blendPullY += cluster.pullY * w
                    totalW += w
                }
            }
            if (totalW > 0) {
                blendPullX /= Math.max(totalW, 1)
                blendPullY /= Math.max(totalW, 1)
            }

            // ── Determine layer count ──
            // Core cells: 2-4 layers (richer fragmentation)
            // Falloff cells: 1-2 layers
            // Islands: 1 layer
            let layerCount = 1
            if (zone === "core") {
                const clusterLayers =
                    bestCluster ? bestCluster.layerCount : 3
                layerCount = Math.max(
                    2,
                    Math.min(4, Math.round(clusterLayers * activity))
                )
                // Some core cells can be simpler for variety
                if (sr3(col, row, 99) < 0.15) layerCount = 1
            } else if (zone === "falloff") {
                layerCount = activity > 0.6 ? 2 : 1
            }

            // ── Shape family from dominant cluster ──
            const familyIdx = bestCluster
                ? bestCluster.shapeFamily
                : Math.floor(sr3(col, row, 7) * SHAPE_FAMILIES.length)
            const shapes = SHAPE_FAMILIES[familyIdx]

            // ── Generate fragment layers ──
            for (let layer = 0; layer < layerCount; layer++) {
                const ls = sr3(col, row, layer * 31 + 5)
                const ls2 = sr3(col, row, layer * 53 + 11)
                const ls3 = sr3(col, row, layer * 79 + 23)

                // Sample offset: base from cluster pull, varied per layer
                // Layers echo the same general pull but with slight variation
                // creating the "repeated/dragged sample" effect
                const layerSpread = layer / Math.max(1, layerCount - 1)
                const offsetX =
                    blendPullX * activity * (0.6 + layerSpread * 0.8) +
                    (ls - 0.5) * 3 * distortionStrength
                const offsetY =
                    blendPullY * activity * (0.6 + layerSpread * 0.8) +
                    (ls2 - 0.5) * 3 * distortionStrength

                // Shape: pick from family, or no clip for one layer
                let clipPath: string | null = null
                if (layerCount === 1) {
                    // Single-layer cells: sometimes shaped, sometimes full
                    clipPath =
                        ls > 0.4 ? shapes[Math.floor(ls * 4) % 4] : null
                } else {
                    // Multi-layer: each layer gets a different shape
                    // One layer is typically full-cell, others are shaped
                    if (layer === 0 && ls > 0.35) {
                        clipPath = null // base layer: full cell
                    } else {
                        clipPath =
                            shapes[(layer + Math.floor(ls3 * 3)) % 4]
                    }
                }

                // Opacity: front layers slightly more transparent
                const baseOpacity =
                    zone === "island"
                        ? 0.5 * activity
                        : 0.85 + ls * 0.15
                const layerOpacity =
                    baseOpacity * (1 - layer * 0.12) * activity

                // Rotation: very subtle, only on some layers in core
                let rotation = 0
                if (zone === "core" && layer > 0 && ls3 < 0.25) {
                    rotation =
                        (ls3 - 0.125) * 6 * distortionStrength * activity
                }

                // Scale: slight variation between layers
                const scale =
                    1 + (ls2 - 0.5) * 0.03 * distortionStrength * activity

                fragments.push({
                    cellX,
                    cellY,
                    cellW,
                    cellH,
                    sampleOffsetX: offsetX,
                    sampleOffsetY: offsetY,
                    clipPath,
                    opacity: Math.min(1, layerOpacity),
                    rotation,
                    scale,
                    id: fid++,
                    depth: layer,
                    zone: zone as Fragment["zone"],
                    activity,
                    phase,
                    nx,
                    ny,
                })
            }
        }
    }

    return fragments
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface FragmentFieldProps {
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

const defaultProps: Partial<FragmentFieldProps> = {
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
    density: 0.9,
    distortionStrength: 1,
    cellOpacity: 0.95,
    islandDensity: 30,
    islandScatter: 18,
    islandFade: 0.35,
    ambientMotion: true,
    motionAmount: 0.3,
    drift: 0.18,
    flicker: 0.06,
    rotationEnabled: true,
    rotationStrength: 3,
    hoverEnabled: true,
    hoverRadius: 100,
    hoverIntensity: 0.6,
    hoverRecovery: 0.06,
    contrast: 0,
    blur: 0,
    grain: false,
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function FragmentField(rawProps: Partial<FragmentFieldProps>) {
    const props = { ...defaultProps, ...rawProps } as FragmentFieldProps

    if (!props.source) {
        return (
            <div
                style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "#1a1a1a",
                    color: "#666",
                    fontFamily: "Inter, system-ui, sans-serif",
                    fontSize: 14,
                    borderRadius: props.borderRadius,
                }}
            >
                Add an image to begin
            </div>
        )
    }

    const containerRef = useRef<HTMLDivElement>(null)
    const [containerSize, setContainerSize] = useState({ w: 0, h: 0 })
    const mouseRef = useRef({ x: -9999, y: -9999, active: false })
    const hoverMapRef = useRef<Map<string, number>>(new Map())
    const timeRef = useRef(0)
    const rafRef = useRef<number>(0)
    const [tick, setTick] = useState(0)

    useEffect(() => {
        const el = containerRef.current
        if (!el) return
        const obs = new ResizeObserver((entries) => {
            const { width, height } = entries[0].contentRect
            if (width > 0 && height > 0)
                setContainerSize({ w: width, h: height })
        })
        obs.observe(el)
        return () => obs.disconnect()
    }, [])

    const clusters = useMemo(
        () =>
            generateClusters(
                props.direction,
                props.coverage,
                props.falloffWidth,
                props.distortionStrength,
                containerSize.w,
                containerSize.h
            ),
        [
            props.direction,
            props.coverage,
            props.falloffWidth,
            props.distortionStrength,
            containerSize.w,
            containerSize.h,
        ]
    )

    const fragments = useMemo(
        () =>
            generateFragments(
                containerSize.w,
                containerSize.h,
                clusters,
                props.direction,
                props.coverage,
                props.falloffWidth,
                props.edgeStepping,
                props.randomness,
                props.cellSize,
                props.density,
                props.islandDensity,
                props.islandScatter,
                props.islandFade,
                props.distortionStrength
            ),
        [
            containerSize.w,
            containerSize.h,
            clusters,
            props.direction,
            props.coverage,
            props.falloffWidth,
            props.edgeStepping,
            props.randomness,
            props.cellSize,
            props.density,
            props.islandDensity,
            props.islandScatter,
            props.islandFade,
            props.distortionStrength,
        ]
    )

    const onMouseMove = useCallback(
        (e: React.MouseEvent) => {
            if (!props.hoverEnabled) return
            const rect = containerRef.current?.getBoundingClientRect()
            if (!rect) return
            mouseRef.current = {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top,
                active: true,
            }
        },
        [props.hoverEnabled]
    )

    const onMouseLeave = useCallback(() => {
        mouseRef.current = { ...mouseRef.current, active: false }
    }, [])

    useEffect(() => {
        if (!props.ambientMotion && !props.hoverEnabled) return
        let lastTime = performance.now()
        const animate = (now: number) => {
            const dt = Math.min((now - lastTime) / 1000, 0.1)
            lastTime = now
            timeRef.current += dt

            if (props.hoverEnabled) {
                const map = hoverMapRef.current
                for (const [key, val] of map.entries()) {
                    if (!mouseRef.current.active) {
                        const next = val * (1 - props.hoverRecovery)
                        if (next < 0.01) map.delete(key)
                        else map.set(key, next)
                    }
                }
            }

            setTick((t) => t + 1)
            rafRef.current = requestAnimationFrame(animate)
        }
        rafRef.current = requestAnimationFrame(animate)
        return () => cancelAnimationFrame(rafRef.current)
    }, [props.ambientMotion, props.hoverEnabled, props.hoverRecovery])

    // Hover influence
    if (props.hoverEnabled && mouseRef.current.active && containerSize.w > 0) {
        const mx = mouseRef.current.x
        const my = mouseRef.current.y
        const r = props.hoverRadius
        for (const frag of fragments) {
            const cx = frag.cellX + frag.cellW / 2
            const cy = frag.cellY + frag.cellH / 2
            const d = Math.sqrt((mx - cx) ** 2 + (my - cy) ** 2)
            if (d < r) {
                const inf =
                    smoothstep(r, r * 0.2, d) * props.hoverIntensity
                const key = `${frag.cellX},${frag.cellY}`
                const cur = hoverMapRef.current.get(key) || 0
                hoverMapRef.current.set(key, Math.max(cur, inf))
            }
        }
    }

    const time = timeRef.current
    const cW = containerSize.w
    const cH = containerSize.h

    const renderData = useMemo(() => {
        if (cW <= 0 || cH <= 0) return []

        return fragments.map((frag) => {
            const hoverKey = `${frag.cellX},${frag.cellY}`
            const hoverInf = hoverMapRef.current.get(hoverKey) || 0
            const totalActivity = Math.min(1, frag.activity + hoverInf * 0.5)

            let ox = frag.sampleOffsetX * totalActivity
            let oy = frag.sampleOffsetY * totalActivity
            let rot = frag.rotation
            let sc = frag.scale

            if (!props.rotationEnabled) rot = 0
            else rot *= props.rotationStrength / 4

            // Ambient motion — cluster-coherent: nearby fragments drift together
            if (props.ambientMotion && totalActivity > 0.05) {
                const amt = props.motionAmount * totalActivity
                const spd = props.drift

                // Spatial phase: neighboring cells share drift
                ox +=
                    Math.sin(
                        time * spd * 0.4 + frag.nx * Math.PI * 1.6
                    ) *
                    amt *
                    1.8
                oy +=
                    Math.cos(
                        time * spd * 0.3 + frag.ny * Math.PI * 1.2
                    ) *
                    amt *
                    1.2

                if (props.rotationEnabled && frag.depth > 0) {
                    rot +=
                        Math.sin(
                            time * spd * 0.15 +
                                frag.nx * Math.PI * 2
                        ) *
                        0.4 *
                        amt *
                        (props.rotationStrength / 4)
                }
            }

            // Hover boost
            if (hoverInf > 0) {
                ox *= 1 + hoverInf * 0.5
                oy *= 1 + hoverInf * 0.5
            }

            // Background position
            const bgX = -frag.cellX + ox - 6
            const bgY = -frag.cellY + oy - 6

            // Scale compensation for rotation
            const rotComp = 1 + Math.abs(rot) * 0.012
            const finalScale = sc * rotComp

            // Opacity with flicker
            let opacity = frag.opacity * props.cellOpacity
            if (props.ambientMotion && props.flicker > 0) {
                const fl =
                    Math.sin(
                        time * 1.5 + frag.phase * Math.PI * 6
                    ) *
                    props.flicker *
                    0.06 *
                    props.motionAmount
                opacity = Math.max(0.08, Math.min(1, opacity + fl))
            }

            // Filters
            const filters: string[] = []
            if (props.contrast !== 0) {
                filters.push(
                    `contrast(${1 + props.contrast * totalActivity * 0.01})`
                )
            }
            if (props.blur > 0) {
                filters.push(
                    `blur(${props.blur * totalActivity * 0.25}px)`
                )
            }

            const needsTransform = rot !== 0 || finalScale !== 1

            return {
                frag,
                bgX,
                bgY,
                rot,
                finalScale,
                needsTransform,
                opacity,
                filter: filters.length > 0 ? filters.join(" ") : undefined,
            }
        })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fragments, tick, props, cW, cH])

    const objectPosition = `${props.positionX}% ${props.positionY}%`

    return (
        <div
            ref={containerRef}
            onMouseMove={onMouseMove}
            onMouseLeave={onMouseLeave}
            style={{
                position: "relative",
                width: "100%",
                height: "100%",
                overflow: "hidden",
                borderRadius: props.borderRadius,
            }}
        >
            {/* Base media */}
            {props.mediaType === "image" ? (
                <img
                    src={props.source}
                    alt=""
                    style={{
                        position: "absolute",
                        inset: 0,
                        width: "100%",
                        height: "100%",
                        objectFit: props.objectFit,
                        objectPosition,
                        display: "block",
                    }}
                />
            ) : (
                <video
                    src={props.source}
                    autoPlay
                    loop
                    muted
                    playsInline
                    style={{
                        position: "absolute",
                        inset: 0,
                        width: "100%",
                        height: "100%",
                        objectFit: props.objectFit,
                        objectPosition,
                        display: "block",
                    }}
                />
            )}

            {/* Fragment overlay — layered geometric pieces */}
            <div
                style={{
                    position: "absolute",
                    inset: 0,
                    pointerEvents: "none",
                }}
            >
                {renderData.map((d) => {
                    const { frag } = d

                    return (
                        <div
                            key={frag.id}
                            style={{
                                // Outer: grid-aligned stable cell frame
                                position: "absolute",
                                left: frag.cellX,
                                top: frag.cellY,
                                width: frag.cellW,
                                height: frag.cellH,
                                overflow: "hidden",
                                // Geometric clip on the cell container
                                clipPath: frag.clipPath || undefined,
                                WebkitClipPath:
                                    frag.clipPath || undefined,
                                opacity: d.opacity,
                            }}
                        >
                            {/* Inner: re-sampled image content */}
                            <div
                                style={{
                                    position: "absolute",
                                    inset: -6,
                                    backgroundImage: `url(${props.source})`,
                                    backgroundSize: `${cW}px ${cH}px`,
                                    backgroundPosition: `${d.bgX}px ${d.bgY}px`,
                                    backgroundRepeat: "no-repeat",
                                    transform: d.needsTransform
                                        ? `rotate(${d.rot}deg) scale(${d.finalScale})`
                                        : undefined,
                                    transformOrigin: "center center",
                                    filter: d.filter,
                                    willChange: props.ambientMotion
                                        ? "transform"
                                        : undefined,
                                }}
                            />
                        </div>
                    )
                })}
            </div>

            {/* Grain */}
            {props.grain && (
                <div
                    style={{
                        position: "absolute",
                        inset: 0,
                        pointerEvents: "none",
                        opacity: 0.05,
                        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
                        backgroundRepeat: "repeat",
                        mixBlendMode: "overlay",
                    }}
                />
            )}
        </div>
    )
}

// ─── Property Controls ───────────────────────────────────────────────────────

addPropertyControls(FragmentField, {
    source: {
        type: ControlType.Image,
        title: "Source",
    },
    mediaType: {
        type: ControlType.Enum,
        title: "Media Type",
        options: ["image", "video"],
        optionTitles: ["Image", "Video"],
        defaultValue: "image",
    },
    objectFit: {
        type: ControlType.Enum,
        title: "Object Fit",
        options: ["cover", "contain", "fill"],
        optionTitles: ["Cover", "Contain", "Fill"],
        defaultValue: "cover",
    },
    positionX: {
        type: ControlType.Number,
        title: "Position X",
        min: 0,
        max: 100,
        unit: "%",
        defaultValue: 50,
    },
    positionY: {
        type: ControlType.Number,
        title: "Position Y",
        min: 0,
        max: 100,
        unit: "%",
        defaultValue: 50,
    },
    borderRadius: {
        type: ControlType.Number,
        title: "Border Radius",
        min: 0,
        max: 100,
        defaultValue: 0,
    },
    direction: {
        type: ControlType.Enum,
        title: "Direction",
        options: [
            "left",
            "right",
            "top",
            "bottom",
            "top-left",
            "top-right",
            "bottom-left",
            "bottom-right",
        ],
        optionTitles: [
            "Left",
            "Right",
            "Top",
            "Bottom",
            "Top-Left",
            "Top-Right",
            "Bottom-Left",
            "Bottom-Right",
        ],
        defaultValue: "left",
    },
    coverage: {
        type: ControlType.Number,
        title: "Coverage",
        min: 5,
        max: 85,
        step: 1,
        unit: "%",
        defaultValue: 38,
    },
    falloffWidth: {
        type: ControlType.Number,
        title: "Falloff Width",
        min: 0,
        max: 50,
        step: 1,
        unit: "%",
        defaultValue: 22,
    },
    edgeStepping: {
        type: ControlType.Number,
        title: "Edge Stepping",
        min: 2,
        max: 12,
        step: 1,
        defaultValue: 6,
    },
    randomness: {
        type: ControlType.Number,
        title: "Randomness",
        min: 0,
        max: 1,
        step: 0.05,
        defaultValue: 0.5,
    },
    cellSize: {
        type: ControlType.Number,
        title: "Cell Size",
        min: 12,
        max: 120,
        step: 2,
        unit: "px",
        defaultValue: 32,
    },
    density: {
        type: ControlType.Number,
        title: "Density",
        min: 0.2,
        max: 1,
        step: 0.05,
        defaultValue: 0.9,
    },
    distortionStrength: {
        type: ControlType.Number,
        title: "Distortion",
        min: 0,
        max: 3,
        step: 0.1,
        defaultValue: 1,
    },
    cellOpacity: {
        type: ControlType.Number,
        title: "Opacity",
        min: 0.2,
        max: 1,
        step: 0.05,
        defaultValue: 0.95,
    },
    islandDensity: {
        type: ControlType.Number,
        title: "Island Density",
        min: 0,
        max: 80,
        step: 1,
        unit: "%",
        defaultValue: 30,
    },
    islandScatter: {
        type: ControlType.Number,
        title: "Island Scatter",
        min: 0,
        max: 40,
        step: 1,
        unit: "%",
        defaultValue: 18,
    },
    islandFade: {
        type: ControlType.Number,
        title: "Island Fade",
        min: 0,
        max: 1,
        step: 0.05,
        defaultValue: 0.35,
    },
    ambientMotion: {
        type: ControlType.Boolean,
        title: "Ambient Motion",
        defaultValue: true,
    },
    motionAmount: {
        type: ControlType.Number,
        title: "Motion Amount",
        min: 0,
        max: 2,
        step: 0.05,
        defaultValue: 0.3,
        hidden: (p) => !p.ambientMotion,
    },
    drift: {
        type: ControlType.Number,
        title: "Drift",
        min: 0,
        max: 2,
        step: 0.05,
        defaultValue: 0.18,
        hidden: (p) => !p.ambientMotion,
    },
    flicker: {
        type: ControlType.Number,
        title: "Flicker",
        min: 0,
        max: 1,
        step: 0.05,
        defaultValue: 0.06,
        hidden: (p) => !p.ambientMotion,
    },
    rotationEnabled: {
        type: ControlType.Boolean,
        title: "Internal Rotation",
        defaultValue: true,
    },
    rotationStrength: {
        type: ControlType.Number,
        title: "Rotation Strength",
        min: 0,
        max: 12,
        step: 0.5,
        unit: "°",
        defaultValue: 3,
        hidden: (p) => !p.rotationEnabled,
    },
    hoverEnabled: {
        type: ControlType.Boolean,
        title: "Hover Reactive",
        defaultValue: true,
    },
    hoverRadius: {
        type: ControlType.Number,
        title: "Hover Radius",
        min: 30,
        max: 300,
        step: 5,
        unit: "px",
        defaultValue: 100,
        hidden: (p) => !p.hoverEnabled,
    },
    hoverIntensity: {
        type: ControlType.Number,
        title: "Hover Intensity",
        min: 0,
        max: 1,
        step: 0.05,
        defaultValue: 0.6,
        hidden: (p) => !p.hoverEnabled,
    },
    hoverRecovery: {
        type: ControlType.Number,
        title: "Hover Recovery",
        min: 0.01,
        max: 0.2,
        step: 0.01,
        defaultValue: 0.06,
        hidden: (p) => !p.hoverEnabled,
    },
    contrast: {
        type: ControlType.Number,
        title: "Contrast",
        min: -50,
        max: 50,
        step: 1,
        defaultValue: 0,
    },
    blur: {
        type: ControlType.Number,
        title: "Blur",
        min: 0,
        max: 8,
        step: 0.5,
        unit: "px",
        defaultValue: 0,
    },
    grain: {
        type: ControlType.Boolean,
        title: "Grain",
        defaultValue: false,
    },
})
