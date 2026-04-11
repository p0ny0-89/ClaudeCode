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

interface Cluster {
    cx: number // normalized center x (0-1)
    cy: number // normalized center y (0-1)
    offsetX: number // px offset this cluster "drags" the image
    offsetY: number // px offset this cluster "drags" the image
    rotation: number // subtle angular tilt for this cluster
    scale: number // subtle zoom for this cluster
    radius: number // influence radius in normalized space
    strength: number // 0-1
}

interface CellData {
    id: number
    col: number
    row: number
    x: number
    y: number
    w: number
    h: number
    nx: number
    ny: number
    dist: number
    zone: "core" | "falloff" | "island" | "clean"
    activity: number
    phase: number
    seed: number
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function seededRandom(seed: number): number {
    const x = Math.sin(seed * 127.1 + seed * 311.7) * 43758.5453
    return x - Math.floor(x)
}

function seededRandom2(a: number, b: number): number {
    const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453
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

// Get the directional axis for a given direction (used for cluster drag alignment)
function getDirectionVector(direction: Direction): {
    dx: number
    dy: number
} {
    switch (direction) {
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

// ─── Cluster Generation ──────────────────────────────────────────────────────

function generateClusters(
    direction: Direction,
    coverage: number,
    falloffWidth: number,
    distortionStrength: number,
    containerW: number,
    containerH: number
): Cluster[] {
    const coverageNorm = coverage / 100
    const falloffEnd = coverageNorm + falloffWidth / 100
    const { dx, dy } = getDirectionVector(direction)

    const clusters: Cluster[] = []
    // Generate cluster centers distributed within the active zone
    // More clusters near origin, fewer toward falloff
    const clusterCount = Math.round(8 + coverageNorm * 12)

    for (let i = 0; i < clusterCount; i++) {
        const seed1 = seededRandom(i * 73 + 13)
        const seed2 = seededRandom(i * 137 + 29)
        const seed3 = seededRandom(i * 251 + 41)
        const seed4 = seededRandom(i * 397 + 67)
        const seed5 = seededRandom(i * 521 + 83)

        // Position: bias toward the origin side
        let cx: number, cy: number

        switch (direction) {
            case "left":
                cx = seed1 * falloffEnd * 0.95
                cy = seed2
                break
            case "right":
                cx = 1 - seed1 * falloffEnd * 0.95
                cy = seed2
                break
            case "top":
                cx = seed2
                cy = seed1 * falloffEnd * 0.95
                break
            case "bottom":
                cx = seed2
                cy = 1 - seed1 * falloffEnd * 0.95
                break
            case "top-left":
                cx = seed1 * falloffEnd
                cy = seed2 * falloffEnd
                break
            case "top-right":
                cx = 1 - seed1 * falloffEnd
                cy = seed2 * falloffEnd
                break
            case "bottom-left":
                cx = seed1 * falloffEnd
                cy = 1 - seed2 * falloffEnd
                break
            case "bottom-right":
                cx = 1 - seed1 * falloffEnd
                cy = 1 - seed2 * falloffEnd
                break
        }

        const dist = getDirectionalDistance(cx, cy, direction)
        const depthStrength = 1 - dist / falloffEnd

        // Offset: each cluster defines a directional "drag" of the image sample
        // Mostly aligned with the field direction, with some lateral spread
        const dragMagnitude =
            distortionStrength * (10 + seed3 * 25) * depthStrength
        const lateralSpread = (seed4 - 0.5) * distortionStrength * 12

        const offsetX = dx * dragMagnitude + dy * lateralSpread
        const offsetY = dy * dragMagnitude + dx * lateralSpread

        // Subtle rotation — most clusters have zero or near-zero
        const rotation =
            seed5 < 0.3
                ? (seed5 - 0.15) * 8 * distortionStrength * depthStrength
                : 0

        // Scale: mostly 1, slight variation
        const scale =
            1 + (seed3 - 0.5) * 0.04 * distortionStrength * depthStrength

        // Radius: how far this cluster influences
        const radius = 0.06 + seed2 * 0.1

        clusters.push({
            cx,
            cy,
            offsetX,
            offsetY,
            rotation,
            scale,
            radius,
            strength: depthStrength,
        })
    }

    return clusters
}

// ─── Cell Generation ─────────────────────────────────────────────────────────

function generateCells(
    containerW: number,
    containerH: number,
    direction: Direction,
    coverage: number,
    falloffWidth: number,
    edgeStepping: number,
    randomness: number,
    cellSize: number,
    density: number,
    islandDensity: number,
    islandScatter: number,
    islandFade: number
): CellData[] {
    if (containerW <= 0 || containerH <= 0) return []

    const cols = Math.max(1, Math.floor(containerW / cellSize))
    const rows = Math.max(1, Math.floor(containerH / cellSize))
    const cellW = containerW / cols
    const cellH = containerH / rows

    const coverageNorm = coverage / 100
    const falloffNorm = falloffWidth / 100
    const falloffEnd = coverageNorm + falloffNorm

    const cells: CellData[] = []
    let id = 0

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const nx = (col + 0.5) / cols
            const ny = (row + 0.5) / rows
            const seed = seededRandom2(col, row)
            const phase = seededRandom(col * 571 + row * 239 + 17)

            const x = col * cellW
            const y = row * cellH

            const dist = getDirectionalDistance(nx, ny, direction)

            let zone: CellData["zone"] = "clean"
            let activity = 0

            const stepCount = Math.max(1, edgeStepping)
            // Per-cell boundary jitter — but less than before
            const stepOffset = (seed - 0.5) * randomness * 0.08

            if (dist < coverageNorm + stepOffset) {
                zone = "core"
                activity = 1
            } else if (dist < falloffEnd + stepOffset) {
                zone = "falloff"
                const rawT =
                    (dist - coverageNorm) / Math.max(0.001, falloffNorm)

                // Stepped quantization
                const steppedT = Math.floor(rawT * stepCount) / stepCount
                activity = Math.max(0, 1 - steppedT)

                // Density culling per step band
                const stepDensity = density * activity
                if (seed > stepDensity) {
                    zone = "clean"
                    activity = 0
                }
            }

            // Island logic — sparse, detached
            if (
                zone === "clean" &&
                dist >= falloffEnd &&
                dist < falloffEnd + islandScatter / 100
            ) {
                const islandThreshold = 1 - (islandDensity / 100) * 0.2
                // Islands are small groups: check if a neighbor would also be active
                const neighborSeed = seededRandom2(col + 1, row)
                const isGrouped = neighborSeed > islandThreshold * 0.97

                if (phase > islandThreshold && isGrouped) {
                    zone = "island"
                    const islandDist =
                        (dist - falloffEnd) / (islandScatter / 100)
                    activity =
                        Math.max(0, 1 - islandDist) *
                        (1 - islandFade) *
                        0.45
                }
            }

            cells.push({
                id: id++,
                col,
                row,
                x,
                y,
                w: cellW,
                h: cellH,
                nx,
                ny,
                dist,
                zone,
                activity,
                phase,
                seed,
            })
        }
    }

    return cells
}

// ─── Compute cluster influence on a cell ─────────────────────────────────────

function getClusterInfluence(
    nx: number,
    ny: number,
    clusters: Cluster[]
): {
    offsetX: number
    offsetY: number
    rotation: number
    scale: number
} {
    let totalWeight = 0
    let ox = 0
    let oy = 0
    let rot = 0
    let sc = 0

    for (const cluster of clusters) {
        const dx = nx - cluster.cx
        const dy = ny - cluster.cy
        const d = Math.sqrt(dx * dx + dy * dy)
        if (d > cluster.radius * 2) continue

        // Smooth falloff from cluster center
        const w =
            smoothstep(cluster.radius * 2, 0, d) * cluster.strength
        if (w < 0.001) continue

        ox += cluster.offsetX * w
        oy += cluster.offsetY * w
        rot += cluster.rotation * w
        sc += (cluster.scale - 1) * w
        totalWeight += w
    }

    if (totalWeight > 0) {
        // Normalize — but allow overlap accumulation up to a point
        const norm = Math.min(totalWeight, 2)
        return {
            offsetX: ox / norm,
            offsetY: oy / norm,
            rotation: rot / norm,
            scale: 1 + sc / norm,
        }
    }

    return { offsetX: 0, offsetY: 0, rotation: 0, scale: 1 }
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
    rotationFrequency: number
    rotationRandomness: number
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
    cellSize: 36,
    density: 0.9,
    distortionStrength: 1,
    cellOpacity: 0.95,
    islandDensity: 30,
    islandScatter: 18,
    islandFade: 0.35,
    ambientMotion: true,
    motionAmount: 0.35,
    drift: 0.2,
    flicker: 0.08,
    rotationEnabled: true,
    rotationStrength: 4,
    rotationFrequency: 0.5,
    rotationRandomness: 0.3,
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
    const hoverMapRef = useRef<Map<number, number>>(new Map())
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

    // Generate clusters — these define shared sampling behavior for groups of cells
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

    // Generate cells
    const cells = useMemo(
        () =>
            generateCells(
                containerSize.w,
                containerSize.h,
                props.direction,
                props.coverage,
                props.falloffWidth,
                props.edgeStepping,
                props.randomness,
                props.cellSize,
                props.density,
                props.islandDensity,
                props.islandScatter,
                props.islandFade
            ),
        [
            containerSize.w,
            containerSize.h,
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
                for (const [id, val] of map.entries()) {
                    if (!mouseRef.current.active) {
                        const next = val * (1 - props.hoverRecovery)
                        if (next < 0.01) map.delete(id)
                        else map.set(id, next)
                    }
                }
            }

            setTick((t) => t + 1)
            rafRef.current = requestAnimationFrame(animate)
        }
        rafRef.current = requestAnimationFrame(animate)
        return () => cancelAnimationFrame(rafRef.current)
    }, [props.ambientMotion, props.hoverEnabled, props.hoverRecovery])

    // Update hover influence
    if (props.hoverEnabled && mouseRef.current.active && containerSize.w > 0) {
        const mx = mouseRef.current.x
        const my = mouseRef.current.y
        const r = props.hoverRadius
        for (const cell of cells) {
            const cx = cell.x + cell.w / 2
            const cy = cell.y + cell.h / 2
            const d = Math.sqrt((mx - cx) ** 2 + (my - cy) ** 2)
            if (d < r) {
                const inf = smoothstep(r, r * 0.25, d) * props.hoverIntensity
                const cur = hoverMapRef.current.get(cell.id) || 0
                hoverMapRef.current.set(cell.id, Math.max(cur, inf))
            }
        }
    }

    const time = timeRef.current
    const cW = containerSize.w
    const cH = containerSize.h

    // Render data — cluster-driven sampling
    const renderCells = useMemo(() => {
        if (cW <= 0 || cH <= 0) return []

        return cells
            .filter((c) => {
                const hoverInf = hoverMapRef.current.get(c.id) || 0
                return c.zone !== "clean" || hoverInf > 0.05
            })
            .map((cell) => {
                const hoverInf = hoverMapRef.current.get(cell.id) || 0
                const totalActivity = Math.min(1, cell.activity + hoverInf)
                if (totalActivity < 0.02) return null

                // ── Get cluster-driven distortion ──
                // Cells inherit offset/rotation from nearby clusters,
                // so neighboring cells share related transforms
                const clusterInf = getClusterInfluence(
                    cell.nx,
                    cell.ny,
                    clusters
                )

                // Scale cluster influence by cell activity
                let offsetX = clusterInf.offsetX * totalActivity
                let offsetY = clusterInf.offsetY * totalActivity
                let rotation = clusterInf.rotation * totalActivity
                let scale = 1 + (clusterInf.scale - 1) * totalActivity

                // Only add rotation if enabled; otherwise purely offset-based
                if (!props.rotationEnabled) {
                    rotation = 0
                } else {
                    rotation *= props.rotationStrength / 10
                }

                // Ambient motion: slow cluster-coherent drift
                if (props.ambientMotion && totalActivity > 0.05) {
                    const amt = props.motionAmount * totalActivity
                    const spd = props.drift

                    // Use cluster position as phase so nearby cells drift together
                    const clusterPhaseX =
                        Math.sin(
                            time * spd * 0.5 +
                                cell.nx * Math.PI * 2 * 0.8
                        ) *
                        amt *
                        1.5

                    const clusterPhaseY =
                        Math.cos(
                            time * spd * 0.35 +
                                cell.ny * Math.PI * 2 * 0.6
                        ) *
                        amt *
                        1.0

                    offsetX += clusterPhaseX
                    offsetY += clusterPhaseY

                    // Very subtle rotation oscillation
                    if (props.rotationEnabled) {
                        rotation +=
                            Math.sin(
                                time * spd * 0.2 +
                                    cell.nx * Math.PI * 3
                            ) *
                            0.5 *
                            amt *
                            (props.rotationStrength / 10)
                    }
                }

                // Hover boost: intensify the cluster offset
                if (hoverInf > 0) {
                    offsetX *= 1 + hoverInf * 0.6
                    offsetY *= 1 + hoverInf * 0.6
                }

                // Background position: base alignment + cluster offset
                const bgX = -cell.x + offsetX
                const bgY = -cell.y + offsetY

                // Rotation compensation for scale to avoid edge gaps
                const rotComp = 1 + Math.abs(rotation) * 0.01
                const finalScale = scale * rotComp

                // Opacity
                let opacity = props.cellOpacity * totalActivity
                if (cell.zone === "island") {
                    opacity *= 0.6
                }

                // Subtle flicker
                if (props.ambientMotion && props.flicker > 0) {
                    const fl =
                        Math.sin(time * 1.8 + cell.phase * Math.PI * 8) *
                        props.flicker *
                        0.08 *
                        props.motionAmount
                    opacity = Math.max(0.1, Math.min(1, opacity + fl))
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

                return {
                    cell,
                    bgX,
                    bgY,
                    rotation,
                    finalScale,
                    opacity,
                    filter: filters.length > 0 ? filters.join(" ") : "none",
                }
            })
            .filter(Boolean)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cells, clusters, tick, props, cW, cH])

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

            {/* Distortion cell overlay */}
            <div
                style={{
                    position: "absolute",
                    inset: 0,
                    pointerEvents: "none",
                }}
            >
                {renderCells.map((data) => {
                    if (!data) return null
                    const {
                        cell,
                        bgX,
                        bgY,
                        rotation,
                        finalScale,
                        opacity,
                        filter,
                    } = data

                    return (
                        <div
                            key={cell.id}
                            style={{
                                // Outer cell: grid-aligned, stable frame
                                position: "absolute",
                                left: cell.x,
                                top: cell.y,
                                width: cell.w,
                                height: cell.h,
                                overflow: "hidden",
                                opacity,
                            }}
                        >
                            {/* Inner: distorted media sample */}
                            <div
                                style={{
                                    position: "absolute",
                                    inset: -6,
                                    backgroundImage: `url(${props.source})`,
                                    backgroundSize: `${cW}px ${cH}px`,
                                    backgroundPosition: `${bgX - 6}px ${bgY - 6}px`,
                                    backgroundRepeat: "no-repeat",
                                    transform:
                                        rotation !== 0 || finalScale !== 1
                                            ? `rotate(${rotation}deg) scale(${finalScale})`
                                            : undefined,
                                    transformOrigin: "center center",
                                    filter,
                                    willChange: props.ambientMotion
                                        ? "transform"
                                        : undefined,
                                }}
                            />
                        </div>
                    )
                })}
            </div>

            {/* Grain overlay */}
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
    // ── Media ──
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

    // ── Field ──
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

    // ── Cells ──
    cellSize: {
        type: ControlType.Number,
        title: "Cell Size",
        min: 12,
        max: 120,
        step: 2,
        unit: "px",
        defaultValue: 36,
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

    // ── Islands ──
    islandDensity: {
        type: ControlType.Number,
        title: "Density",
        min: 0,
        max: 80,
        step: 1,
        unit: "%",
        defaultValue: 30,
    },
    islandScatter: {
        type: ControlType.Number,
        title: "Scatter",
        min: 0,
        max: 40,
        step: 1,
        unit: "%",
        defaultValue: 18,
    },
    islandFade: {
        type: ControlType.Number,
        title: "Fade",
        min: 0,
        max: 1,
        step: 0.05,
        defaultValue: 0.35,
    },

    // ── Ambient Motion ──
    ambientMotion: {
        type: ControlType.Boolean,
        title: "Enabled",
        defaultValue: true,
    },
    motionAmount: {
        type: ControlType.Number,
        title: "Amount",
        min: 0,
        max: 2,
        step: 0.05,
        defaultValue: 0.35,
        hidden: (p) => !p.ambientMotion,
    },
    drift: {
        type: ControlType.Number,
        title: "Drift",
        min: 0,
        max: 2,
        step: 0.05,
        defaultValue: 0.2,
        hidden: (p) => !p.ambientMotion,
    },
    flicker: {
        type: ControlType.Number,
        title: "Flicker",
        min: 0,
        max: 1,
        step: 0.05,
        defaultValue: 0.08,
        hidden: (p) => !p.ambientMotion,
    },

    // ── Rotation ──
    rotationEnabled: {
        type: ControlType.Boolean,
        title: "Enabled",
        defaultValue: true,
    },
    rotationStrength: {
        type: ControlType.Number,
        title: "Strength",
        min: 0,
        max: 20,
        step: 1,
        unit: "°",
        defaultValue: 4,
        hidden: (p) => !p.rotationEnabled,
    },
    rotationFrequency: {
        type: ControlType.Number,
        title: "Frequency",
        min: 0.1,
        max: 3,
        step: 0.1,
        defaultValue: 0.5,
        hidden: (p) => !p.rotationEnabled,
    },
    rotationRandomness: {
        type: ControlType.Number,
        title: "Randomness",
        min: 0,
        max: 1,
        step: 0.05,
        defaultValue: 0.3,
        hidden: (p) => !p.rotationEnabled,
    },

    // ── Hover ──
    hoverEnabled: {
        type: ControlType.Boolean,
        title: "Enabled",
        defaultValue: true,
    },
    hoverRadius: {
        type: ControlType.Number,
        title: "Radius",
        min: 30,
        max: 300,
        step: 5,
        unit: "px",
        defaultValue: 100,
        hidden: (p) => !p.hoverEnabled,
    },
    hoverIntensity: {
        type: ControlType.Number,
        title: "Intensity",
        min: 0,
        max: 1,
        step: 0.05,
        defaultValue: 0.6,
        hidden: (p) => !p.hoverEnabled,
    },
    hoverRecovery: {
        type: ControlType.Number,
        title: "Recovery",
        min: 0.01,
        max: 0.2,
        step: 0.01,
        defaultValue: 0.06,
        hidden: (p) => !p.hoverEnabled,
    },

    // ── Style ──
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
