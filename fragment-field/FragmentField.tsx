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
    seed2: number
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function seededRandom(seed: number): number {
    const x = Math.sin(seed * 127.1 + seed * 311.7) * 43758.5453
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
            const seed = seededRandom(col * 1000 + row * 7 + 42)
            const seed2 = seededRandom(col * 317 + row * 131 + 99)
            const phase = seededRandom(col * 571 + row * 239 + 17)

            const x = col * cellW
            const y = row * cellH

            const dist = getDirectionalDistance(nx, ny, direction)

            let zone: CellData["zone"] = "clean"
            let activity = 0

            // Edge stepping: quantize the boundary with per-cell randomness
            const stepCount = Math.max(1, edgeStepping)
            const stepOffset = (seed - 0.5) * randomness * 0.12

            if (dist < coverageNorm + stepOffset) {
                // Core zone — dense contiguous clusters
                zone = "core"
                activity = 1
            } else if (dist < falloffEnd + stepOffset) {
                // Falloff zone — stepped, sparse transition
                zone = "falloff"
                const rawT = (dist - coverageNorm) / Math.max(0.001, falloffNorm)

                // Quantize into discrete steps
                const steppedT = Math.floor(rawT * stepCount) / stepCount

                // Activity decreases through steps
                activity = Math.max(0, 1 - steppedT)

                // Per-step density culling: fewer cells in later steps
                const stepDensity = density * activity
                if (seed > stepDensity) {
                    zone = "clean"
                    activity = 0
                }
            }

            // Island logic: sparse detached cells beyond falloff
            if (
                zone === "clean" &&
                dist >= falloffEnd &&
                dist < falloffEnd + islandScatter / 100
            ) {
                const islandThreshold = 1 - (islandDensity / 100) * 0.25
                if (phase > islandThreshold) {
                    zone = "island"
                    const islandDist =
                        (dist - falloffEnd) / (islandScatter / 100)
                    activity =
                        Math.max(0, (1 - islandDist)) *
                        (1 - islandFade) *
                        0.55
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
                seed2,
            })
        }
    }

    return cells
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface FragmentFieldProps {
    // Media
    source: string
    mediaType: "image" | "video"
    objectFit: "cover" | "contain" | "fill"
    positionX: number
    positionY: number
    borderRadius: number

    // Field
    direction: Direction
    coverage: number
    falloffWidth: number
    edgeStepping: number
    randomness: number

    // Cells
    cellSize: number
    density: number
    distortionStrength: number
    cellOpacity: number

    // Islands
    islandDensity: number
    islandScatter: number
    islandFade: number

    // Ambient motion
    ambientMotion: boolean
    motionAmount: number
    drift: number
    flicker: number

    // Rotation
    rotationEnabled: boolean
    rotationStrength: number
    rotationFrequency: number
    rotationRandomness: number

    // Hover
    hoverEnabled: boolean
    hoverRadius: number
    hoverIntensity: number
    hoverRecovery: number

    // Style
    contrast: number
    blur: number
    grain: boolean

    // Framer
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
    motionAmount: 0.4,
    drift: 0.25,
    flicker: 0.12,
    rotationEnabled: true,
    rotationStrength: 12,
    rotationFrequency: 0.5,
    rotationRandomness: 0.4,
    hoverEnabled: true,
    hoverRadius: 100,
    hoverIntensity: 0.6,
    hoverRecovery: 0.06,
    contrast: 0,
    blur: 0,
    grain: false,
}

// ─── Main Component ──────────────────────────────────────────────────────────

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

    // Measure container
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

    // Mouse tracking
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

    // Animation loop
    useEffect(() => {
        if (!props.ambientMotion && !props.hoverEnabled) return

        let lastTime = performance.now()
        const animate = (now: number) => {
            const dt = Math.min((now - lastTime) / 1000, 0.1)
            lastTime = now
            timeRef.current += dt

            // Decay hover influence when mouse is gone
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

    // Update hover influence per cell
    if (
        props.hoverEnabled &&
        mouseRef.current.active &&
        containerSize.w > 0
    ) {
        const mx = mouseRef.current.x
        const my = mouseRef.current.y
        const r = props.hoverRadius

        for (const cell of cells) {
            const cx = cell.x + cell.w / 2
            const cy = cell.y + cell.h / 2
            const d = Math.sqrt((mx - cx) ** 2 + (my - cy) ** 2)
            if (d < r) {
                const inf = smoothstep(r, r * 0.3, d) * props.hoverIntensity
                const cur = hoverMapRef.current.get(cell.id) || 0
                hoverMapRef.current.set(cell.id, Math.max(cur, inf))
            }
        }
    }

    const time = timeRef.current
    const cW = containerSize.w
    const cH = containerSize.h

    // Compute per-cell rendering data
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

                const str = props.distortionStrength * totalActivity

                // ── Internal media distortion ──
                // These transforms apply to the INNER content, not the cell frame

                // Crop/sample offset: shift which part of the image this cell shows
                const sampleOffsetX = (cell.seed - 0.5) * str * 8
                const sampleOffsetY = (cell.seed2 - 0.5) * str * 8

                // Internal rotation: rotate the sampled media inside the cell
                let innerRotation = 0
                if (props.rotationEnabled) {
                    const rotActivity = totalActivity // diminishes through falloff
                    const baseRot = props.rotationStrength * rotActivity

                    // Per-cell rotation with phase variation
                    innerRotation =
                        (cell.seed - 0.5) *
                        2 *
                        baseRot *
                        (1 + props.rotationRandomness * (cell.seed2 - 0.5))
                }

                // Internal scale: subtle zoom variation
                const innerScale =
                    1 + (cell.seed2 - 0.5) * 0.06 * str

                // Ambient motion: subtle internal drift and oscillation
                let motionDriftX = 0
                let motionDriftY = 0
                let motionRotation = 0

                if (props.ambientMotion && totalActivity > 0.05) {
                    const amt = props.motionAmount * totalActivity
                    const spd = props.drift

                    motionDriftX =
                        Math.sin(
                            time * spd * 0.7 +
                                cell.phase * Math.PI * 6
                        ) *
                        amt *
                        2.5

                    motionDriftY =
                        Math.cos(
                            time * spd * 0.5 +
                                cell.phase * Math.PI * 4
                        ) *
                        amt *
                        1.8

                    if (props.rotationEnabled) {
                        motionRotation =
                            Math.sin(
                                time * spd * 0.3 +
                                    cell.phase * Math.PI * 2
                            ) *
                            props.rotationStrength *
                            0.12 *
                            amt
                    }
                }

                // Hover rotation boost
                if (hoverInf > 0 && props.rotationEnabled) {
                    innerRotation *= 1 + hoverInf * 0.8
                }

                // Background position: cell shows its grid region, shifted by distortion
                const bgX =
                    -cell.x +
                    sampleOffsetX +
                    motionDriftX
                const bgY =
                    -cell.y +
                    sampleOffsetY +
                    motionDriftY

                // Inner transform: rotation + scale applied to content inside cell
                const totalRotation = innerRotation + motionRotation
                // Scale up slightly to avoid showing edges when rotated
                const rotCompensation =
                    1 + Math.abs(totalRotation) * 0.008
                const finalScale = innerScale * rotCompensation

                // Opacity
                let opacity = props.cellOpacity * totalActivity
                if (cell.zone === "island") {
                    opacity *= 0.7
                }

                // Flicker
                if (props.ambientMotion && props.flicker > 0) {
                    const flickerVal =
                        Math.sin(
                            time * 2.5 + cell.phase * Math.PI * 10
                        ) *
                        props.flicker *
                        0.12 *
                        props.motionAmount
                    opacity = Math.max(0.1, opacity + flickerVal)
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
                        `blur(${props.blur * totalActivity * 0.3}px)`
                    )
                }

                return {
                    cell,
                    bgX,
                    bgY,
                    totalRotation,
                    finalScale,
                    opacity: Math.min(1, opacity),
                    filter: filters.length > 0 ? filters.join(" ") : "none",
                }
            })
            .filter(Boolean)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cells, tick, props, cW, cH])

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
            {/* Base media — always visible, provides the clean zone */}
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

            {/* Cell overlay — each cell is a stable grid-aligned frame
                with internally distorted media content */}
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
                        totalRotation,
                        finalScale,
                        opacity,
                        filter,
                    } = data

                    return (
                        <div
                            key={cell.id}
                            style={{
                                // Outer cell: stable, grid-aligned, no rotation
                                position: "absolute",
                                left: cell.x,
                                top: cell.y,
                                width: cell.w,
                                height: cell.h,
                                overflow: "hidden",
                                opacity,
                            }}
                        >
                            {/* Inner content: distorted media sampling */}
                            <div
                                style={{
                                    position: "absolute",
                                    // Extend slightly beyond cell bounds so
                                    // rotated content doesn't show gaps
                                    inset: -4,
                                    backgroundImage: `url(${props.source})`,
                                    backgroundSize: `${cW}px ${cH}px`,
                                    backgroundPosition: `${bgX - 4}px ${bgY - 4}px`,
                                    backgroundRepeat: "no-repeat",
                                    transform: `rotate(${totalRotation}deg) scale(${finalScale})`,
                                    transformOrigin: "center center",
                                    filter,
                                    willChange:
                                        props.ambientMotion
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
        defaultValue: 0.4,
        hidden: (p) => !p.ambientMotion,
    },
    drift: {
        type: ControlType.Number,
        title: "Drift",
        min: 0,
        max: 2,
        step: 0.05,
        defaultValue: 0.25,
        hidden: (p) => !p.ambientMotion,
    },
    flicker: {
        type: ControlType.Number,
        title: "Flicker",
        min: 0,
        max: 1,
        step: 0.05,
        defaultValue: 0.12,
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
        max: 30,
        step: 1,
        unit: "°",
        defaultValue: 12,
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
        defaultValue: 0.4,
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
