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
    nx: number // normalized center x (0-1)
    ny: number // normalized center y (0-1)
    dist: number // normalized distance from origin (0-1)
    zone: "core" | "falloff" | "island" | "clean"
    activity: number // 0-1, how active/distorted this cell is
    phase: number // random phase for animation
    seed: number // random seed for this cell
    syncGroup: number // rotation sync group
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function seededRandom(seed: number): number {
    const x = Math.sin(seed * 127.1 + seed * 311.7) * 43758.5453
    return x - Math.floor(x)
}

function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * Math.max(0, Math.min(1, t))
}

function smoothstep(edge0: number, edge1: number, x: number): number {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)))
    return t * t * (3 - 2 * t)
}

function getOriginPoint(direction: Direction): { ox: number; oy: number } {
    switch (direction) {
        case "left":
            return { ox: 0, oy: 0.5 }
        case "right":
            return { ox: 1, oy: 0.5 }
        case "top":
            return { ox: 0.5, oy: 0 }
        case "bottom":
            return { ox: 0.5, oy: 1 }
        case "top-left":
            return { ox: 0, oy: 0 }
        case "top-right":
            return { ox: 1, oy: 0 }
        case "bottom-left":
            return { ox: 0, oy: 1 }
        case "bottom-right":
            return { ox: 1, oy: 1 }
    }
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

function applyBiasCurve(t: number, bias: number): number {
    if (bias === 1) return t
    return Math.pow(t, bias)
}

// ─── Cell Generation ─────────────────────────────────────────────────────────

function generateCells(
    containerW: number,
    containerH: number,
    props: FragmentFieldProps
): CellData[] {
    if (containerW <= 0 || containerH <= 0) return []

    const {
        direction,
        coverage,
        falloffWidth,
        biasCurve,
        edgeStepping,
        stepRandomness,
        cellSizeMin,
        cellSizeMax,
        cellDensity,
        islandDensity,
        islandSize,
        islandScatter,
        islandRandomness,
        islandFade,
    } = props

    const avgCellSize = (cellSizeMin + cellSizeMax) / 2
    const cols = Math.max(1, Math.floor(containerW / avgCellSize))
    const rows = Math.max(1, Math.floor(containerH / avgCellSize))
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
            const phase = seededRandom(col * 317 + row * 131 + 99)

            // Vary cell size within range
            const sizeFactor = lerp(
                cellSizeMin / avgCellSize,
                cellSizeMax / avgCellSize,
                seed
            )
            const w = cellW * sizeFactor
            const h = cellH * sizeFactor
            const x = col * cellW + (cellW - w) / 2
            const y = row * cellH + (cellH - h) / 2

            const rawDist = getDirectionalDistance(nx, ny, direction)
            const dist = applyBiasCurve(rawDist, biasCurve)

            // Determine zone and activity
            let zone: CellData["zone"] = "clean"
            let activity = 0

            // Apply edge stepping: add randomized threshold per cell
            const stepOffset =
                (seed - 0.5) * stepRandomness * 0.15 * edgeStepping

            if (dist < coverageNorm + stepOffset) {
                zone = "core"
                activity = 1
            } else if (dist < falloffEnd + stepOffset) {
                zone = "falloff"
                const falloffT =
                    (dist - coverageNorm - stepOffset) / falloffNorm

                // Stepped falloff: quantize the transition
                const steps = Math.max(1, Math.round(edgeStepping * 8))
                const steppedT =
                    Math.floor(falloffT * steps) / steps +
                    (seed - 0.5) * stepRandomness * 0.1

                activity = Math.max(
                    0,
                    1 - Math.min(1, steppedT + seed * stepRandomness * 0.2)
                )

                // Density-based culling in falloff
                if (seed > cellDensity * activity) {
                    zone = "clean"
                    activity = 0
                }
            }

            // Island logic: detached cells beyond the main zone
            if (zone === "clean" && dist < falloffEnd + islandScatter / 100) {
                const islandSeed = seededRandom(col * 571 + row * 239 + 17)
                const islandThreshold =
                    1 - (islandDensity / 100) * (1 - islandRandomness * 0.5)

                if (islandSeed > islandThreshold) {
                    const islandDist = dist - falloffEnd
                    const islandActivity =
                        (1 - islandDist / (islandScatter / 100)) *
                        (1 - islandFade)
                    if (islandActivity > 0.1) {
                        zone = "island"
                        activity = Math.min(0.7, islandActivity * 0.6)
                    }
                }
            }

            // Density culling for core cells too
            if (zone === "core" && seed > cellDensity) {
                // Keep most core cells but thin some out
                if (seed > cellDensity * 1.3) {
                    zone = "clean"
                    activity = 0
                }
            }

            const syncGroup = Math.floor(seededRandom(col * 23 + row * 47) * 4)

            cells.push({
                id: id++,
                col,
                row,
                x,
                y,
                w,
                h,
                nx,
                ny,
                dist,
                zone,
                activity,
                phase,
                seed,
                syncGroup,
            })
        }
    }

    return cells
}

// ─── Component Props ─────────────────────────────────────────────────────────

interface FragmentFieldProps {
    // Media
    source: string
    mediaType: "image" | "video"
    objectFit: "cover" | "contain" | "fill"
    positionX: number
    positionY: number
    borderRadius: number

    // Distortion zone
    direction: Direction
    coverage: number
    falloffWidth: number
    biasCurve: number
    edgeStepping: number
    stepRandomness: number

    // Cells
    cellSizeMin: number
    cellSizeMax: number
    cellDensity: number
    cellOpacity: number
    scaleJitter: number
    offsetJitter: number
    distortionStrength: number

    // Islands
    islandDensity: number
    islandSize: number
    islandScatter: number
    islandRandomness: number
    islandFade: number

    // Ambient motion
    ambientMotion: boolean
    motionAmount: number
    driftSpeed: number
    flickerAmount: number
    reClusterAmount: number

    // Rotation
    rotationEnabled: boolean
    rotationStrength: number
    rotationFrequency: number
    rotationRandomness: number
    rotationSyncMode: "free" | "grouped" | "wave"
    rotationFalloff: boolean

    // Hover
    hoverReactive: boolean
    hoverRadius: number
    hoverIntensity: number
    hoverFalloff: number
    hoverSpawnIslands: boolean
    hoverRecoverySpeed: number
    hoverRotationBoost: number

    // Scroll
    scrollReactive: boolean
    scrollIntensity: number
    scrollDrift: number
    scrollCompression: number
    scrollClampToCoverage: boolean
    scrollRotationModulation: number

    // Style
    blendMode: string
    brightnessShift: number
    contrastShift: number
    softBlur: number
    grainOverlay: boolean

    // Framer
    width: number
    height: number
}

// ─── Default Props ───────────────────────────────────────────────────────────

const defaultProps: Partial<FragmentFieldProps> = {
    source: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=1200&q=80",
    mediaType: "image",
    objectFit: "cover",
    positionX: 50,
    positionY: 50,
    borderRadius: 0,
    direction: "left",
    coverage: 40,
    falloffWidth: 25,
    biasCurve: 1,
    edgeStepping: 5,
    stepRandomness: 0.6,
    cellSizeMin: 28,
    cellSizeMax: 48,
    cellDensity: 0.85,
    cellOpacity: 0.95,
    scaleJitter: 0.08,
    offsetJitter: 4,
    distortionStrength: 1,
    islandDensity: 35,
    islandSize: 0.7,
    islandScatter: 20,
    islandRandomness: 0.5,
    islandFade: 0.3,
    ambientMotion: true,
    motionAmount: 0.5,
    driftSpeed: 0.3,
    flickerAmount: 0.15,
    reClusterAmount: 0.1,
    rotationEnabled: true,
    rotationStrength: 15,
    rotationFrequency: 0.4,
    rotationRandomness: 0.5,
    rotationSyncMode: "grouped",
    rotationFalloff: true,
    hoverReactive: true,
    hoverRadius: 120,
    hoverIntensity: 0.7,
    hoverFalloff: 0.5,
    hoverSpawnIslands: true,
    hoverRecoverySpeed: 0.08,
    hoverRotationBoost: 1.5,
    scrollReactive: false,
    scrollIntensity: 0.3,
    scrollDrift: 0.2,
    scrollCompression: 0.1,
    scrollClampToCoverage: true,
    scrollRotationModulation: 0.3,
    blendMode: "normal",
    brightnessShift: 0,
    contrastShift: 0,
    softBlur: 0,
    grainOverlay: false,
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function FragmentField(rawProps: Partial<FragmentFieldProps>) {
    const props = { ...defaultProps, ...rawProps } as FragmentFieldProps

    // Placeholder when no source is set
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
    const hoverInfluenceRef = useRef<Map<number, number>>(new Map())
    const scrollRef = useRef(0)
    const timeRef = useRef(0)
    const rafRef = useRef<number>(0)
    const [tick, setTick] = useState(0)

    // Measure container
    useEffect(() => {
        const el = containerRef.current
        if (!el) return

        const obs = new ResizeObserver((entries) => {
            const { width, height } = entries[0].contentRect
            if (width > 0 && height > 0) {
                setContainerSize({ w: width, h: height })
            }
        })
        obs.observe(el)
        return () => obs.disconnect()
    }, [])

    // Generate cells
    const cells = useMemo(
        () => generateCells(containerSize.w, containerSize.h, props),
        [
            containerSize.w,
            containerSize.h,
            props.direction,
            props.coverage,
            props.falloffWidth,
            props.biasCurve,
            props.edgeStepping,
            props.stepRandomness,
            props.cellSizeMin,
            props.cellSizeMax,
            props.cellDensity,
            props.islandDensity,
            props.islandSize,
            props.islandScatter,
            props.islandRandomness,
            props.islandFade,
        ]
    )

    // Scroll tracking
    useEffect(() => {
        if (!props.scrollReactive) return
        const onScroll = () => {
            const el = containerRef.current
            if (!el) return
            const rect = el.getBoundingClientRect()
            const viewH = window.innerHeight
            scrollRef.current = Math.max(
                0,
                Math.min(1, 1 - (rect.top + rect.height) / (viewH + rect.height))
            )
        }
        window.addEventListener("scroll", onScroll, { passive: true })
        onScroll()
        return () => window.removeEventListener("scroll", onScroll)
    }, [props.scrollReactive])

    // Mouse tracking
    const onMouseMove = useCallback(
        (e: React.MouseEvent) => {
            if (!props.hoverReactive) return
            const rect = containerRef.current?.getBoundingClientRect()
            if (!rect) return
            mouseRef.current = {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top,
                active: true,
            }
        },
        [props.hoverReactive]
    )

    const onMouseLeave = useCallback(() => {
        mouseRef.current = { ...mouseRef.current, active: false }
    }, [])

    // Animation loop
    useEffect(() => {
        if (!props.ambientMotion && !props.hoverReactive) return

        let lastTime = performance.now()

        const animate = (now: number) => {
            const dt = Math.min((now - lastTime) / 1000, 0.1)
            lastTime = now
            timeRef.current += dt

            // Decay hover influence
            if (props.hoverReactive) {
                const map = hoverInfluenceRef.current
                for (const [id, val] of map.entries()) {
                    if (!mouseRef.current.active) {
                        const next = val * (1 - props.hoverRecoverySpeed)
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
    }, [props.ambientMotion, props.hoverReactive, props.hoverRecoverySpeed])

    // Compute hover influence per cell
    if (props.hoverReactive && mouseRef.current.active && containerSize.w > 0) {
        const mx = mouseRef.current.x
        const my = mouseRef.current.y
        const radius = props.hoverRadius

        for (const cell of cells) {
            const cx = cell.x + cell.w / 2
            const cy = cell.y + cell.h / 2
            const d = Math.sqrt((mx - cx) ** 2 + (my - cy) ** 2)

            if (d < radius) {
                const influence =
                    smoothstep(radius, radius * (1 - props.hoverFalloff), d) *
                    props.hoverIntensity
                const current = hoverInfluenceRef.current.get(cell.id) || 0
                hoverInfluenceRef.current.set(
                    cell.id,
                    Math.max(current, influence)
                )
            }
        }
    }

    // Compute cell transforms
    const time = timeRef.current
    const scrollT = scrollRef.current

    const renderCells = useMemo(() => {
        return cells
            .filter((c) => {
                const hoverInf = hoverInfluenceRef.current.get(c.id) || 0
                return c.zone !== "clean" || hoverInf > 0.05
            })
            .map((cell) => {
                const hoverInf = hoverInfluenceRef.current.get(cell.id) || 0
                const totalActivity = Math.min(1, cell.activity + hoverInf)

                if (totalActivity < 0.02) return null

                const strength = props.distortionStrength * totalActivity

                // Offset
                let ox =
                    (cell.seed - 0.5) * props.offsetJitter * strength * 2
                let oy =
                    (seededRandom(cell.seed * 999) - 0.5) *
                    props.offsetJitter *
                    strength *
                    2

                // Scale jitter
                const scaleBase =
                    1 + (cell.seed - 0.5) * props.scaleJitter * strength * 2
                let scale =
                    cell.zone === "island"
                        ? scaleBase * props.islandSize
                        : scaleBase

                // Rotation
                let rotation = 0
                if (props.rotationEnabled) {
                    const rotFalloff =
                        props.rotationFalloff
                            ? totalActivity
                            : 1
                    const baseRot = props.rotationStrength * rotFalloff

                    if (props.rotationSyncMode === "free") {
                        rotation =
                            (cell.seed - 0.5) *
                            2 *
                            baseRot *
                            (1 + props.rotationRandomness * (cell.phase - 0.5))
                    } else if (props.rotationSyncMode === "grouped") {
                        const groupPhase = cell.syncGroup * 0.25 * Math.PI * 2
                        rotation =
                            Math.sin(groupPhase + cell.phase * Math.PI) *
                            baseRot *
                            (1 +
                                props.rotationRandomness *
                                    (cell.seed - 0.5) *
                                    2)
                    } else {
                        // wave
                        const wavePhase =
                            cell.nx * props.rotationFrequency * Math.PI * 2
                        rotation =
                            Math.sin(wavePhase) *
                            baseRot *
                            (1 +
                                props.rotationRandomness *
                                    (cell.seed - 0.5) *
                                    2)
                    }

                    // Hover rotation boost
                    if (hoverInf > 0) {
                        rotation *= 1 + hoverInf * props.hoverRotationBoost
                    }
                }

                // Ambient motion
                if (props.ambientMotion && totalActivity > 0.1) {
                    const amt = props.motionAmount * totalActivity
                    const spd = props.driftSpeed

                    // Drift
                    ox +=
                        Math.sin(time * spd * 0.7 + cell.phase * Math.PI * 6) *
                        amt *
                        3
                    oy +=
                        Math.cos(
                            time * spd * 0.5 + cell.phase * Math.PI * 4
                        ) *
                        amt *
                        2

                    // Rotation oscillation
                    if (props.rotationEnabled) {
                        rotation +=
                            Math.sin(
                                time * spd * 0.3 +
                                    cell.phase * Math.PI * 2 +
                                    cell.syncGroup
                            ) *
                            props.rotationStrength *
                            0.15 *
                            amt
                    }

                    // Flicker - subtle opacity variation handled in style
                    // Re-clustering - subtle scale breathing
                    scale +=
                        Math.sin(
                            time * spd * 0.2 + cell.seed * Math.PI * 8
                        ) *
                        props.reClusterAmount *
                        0.05 *
                        amt
                }

                // Scroll influence
                if (props.scrollReactive) {
                    const scrollAmt = props.scrollIntensity * scrollT
                    ox += scrollAmt * props.scrollDrift * 10 * (cell.seed - 0.5)
                    scale +=
                        scrollAmt *
                        props.scrollCompression *
                        0.1 *
                        (cell.seed - 0.5)

                    if (props.rotationEnabled) {
                        rotation +=
                            scrollAmt *
                            props.scrollRotationModulation *
                            10 *
                            (cell.seed - 0.5)
                    }
                }

                // Background position: each cell shows its corresponding
                // region of the full-size image, shifted slightly by distortion
                const sampleOffsetX =
                    (cell.seed - 0.5) * strength * 6
                const sampleOffsetY =
                    (seededRandom(cell.seed * 777) - 0.5) * strength * 6

                // Opacity
                let opacity = props.cellOpacity * totalActivity
                if (cell.zone === "island") {
                    opacity *= 1 - props.islandFade * 0.5
                }

                // Flicker
                if (props.ambientMotion && props.flickerAmount > 0) {
                    const flicker =
                        Math.sin(
                            time * 3 + cell.phase * Math.PI * 10
                        ) *
                        props.flickerAmount *
                        0.15 *
                        props.motionAmount
                    opacity = Math.max(0.1, opacity + flicker)
                }

                // Style filters
                const filters: string[] = []
                if (props.brightnessShift !== 0) {
                    filters.push(
                        `brightness(${1 + props.brightnessShift * totalActivity * 0.01})`
                    )
                }
                if (props.contrastShift !== 0) {
                    filters.push(
                        `contrast(${1 + props.contrastShift * totalActivity * 0.01})`
                    )
                }
                if (props.softBlur > 0) {
                    filters.push(
                        `blur(${props.softBlur * totalActivity * 0.3}px)`
                    )
                }

                return {
                    cell,
                    ox,
                    oy,
                    scale,
                    rotation,
                    opacity: Math.min(1, opacity),
                    sampleOffsetX,
                    sampleOffsetY,
                    filter: filters.length > 0 ? filters.join(" ") : "none",
                }
            })
            .filter(Boolean)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cells, tick, props])

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
            {/* Base media layer */}
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
                    mixBlendMode: props.blendMode as any,
                }}
            >
                {renderCells.map((data) => {
                    if (!data) return null
                    const {
                        cell,
                        ox,
                        oy,
                        scale,
                        rotation,
                        opacity,
                        sampleOffsetX,
                        sampleOffsetY,
                        filter,
                    } = data

                    // Background position: align cell's bg to its grid
                    // position, then shift by sample offset for distortion
                    const bgX = -cell.x + sampleOffsetX
                    const bgY = -cell.y + sampleOffsetY

                    return (
                        <div
                            key={cell.id}
                            style={{
                                position: "absolute",
                                left: cell.x,
                                top: cell.y,
                                width: cell.w,
                                height: cell.h,
                                backgroundImage: `url(${props.source})`,
                                backgroundSize: `${containerSize.w}px ${containerSize.h}px`,
                                backgroundPosition: `${bgX}px ${bgY}px`,
                                backgroundRepeat: "no-repeat",
                                transform: `translate(${ox}px, ${oy}px) scale(${scale}) rotate(${rotation}deg)`,
                                opacity,
                                filter,
                                willChange: props.ambientMotion
                                    ? "transform, opacity"
                                    : undefined,
                            }}
                        />
                    )
                })}
            </div>

            {/* Optional grain overlay */}
            {props.grainOverlay && (
                <div
                    style={{
                        position: "absolute",
                        inset: 0,
                        pointerEvents: "none",
                        opacity: 0.06,
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
    // Media
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

    // Distortion zone
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
            "Left → Right",
            "Right → Left",
            "Top → Bottom",
            "Bottom → Top",
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
        max: 90,
        step: 1,
        unit: "%",
        defaultValue: 40,
    },
    falloffWidth: {
        type: ControlType.Number,
        title: "Falloff Width",
        min: 0,
        max: 60,
        step: 1,
        unit: "%",
        defaultValue: 25,
    },
    biasCurve: {
        type: ControlType.Number,
        title: "Bias Curve",
        min: 0.2,
        max: 3,
        step: 0.1,
        defaultValue: 1,
    },
    edgeStepping: {
        type: ControlType.Number,
        title: "Edge Stepping",
        min: 1,
        max: 12,
        step: 1,
        defaultValue: 5,
    },
    stepRandomness: {
        type: ControlType.Number,
        title: "Step Randomness",
        min: 0,
        max: 1,
        step: 0.05,
        defaultValue: 0.6,
    },

    // Cells
    cellSizeMin: {
        type: ControlType.Number,
        title: "Cell Size Min",
        min: 8,
        max: 100,
        step: 1,
        unit: "px",
        defaultValue: 28,
    },
    cellSizeMax: {
        type: ControlType.Number,
        title: "Cell Size Max",
        min: 12,
        max: 150,
        step: 1,
        unit: "px",
        defaultValue: 48,
    },
    cellDensity: {
        type: ControlType.Number,
        title: "Cell Density",
        min: 0.1,
        max: 1,
        step: 0.05,
        defaultValue: 0.85,
    },
    cellOpacity: {
        type: ControlType.Number,
        title: "Cell Opacity",
        min: 0.1,
        max: 1,
        step: 0.05,
        defaultValue: 0.95,
    },
    scaleJitter: {
        type: ControlType.Number,
        title: "Scale Jitter",
        min: 0,
        max: 0.5,
        step: 0.01,
        defaultValue: 0.08,
    },
    offsetJitter: {
        type: ControlType.Number,
        title: "Offset Jitter",
        min: 0,
        max: 30,
        step: 1,
        unit: "px",
        defaultValue: 4,
    },
    distortionStrength: {
        type: ControlType.Number,
        title: "Distortion Strength",
        min: 0,
        max: 3,
        step: 0.1,
        defaultValue: 1,
    },

    // Islands
    islandDensity: {
        type: ControlType.Number,
        title: "Island Density",
        min: 0,
        max: 100,
        step: 1,
        unit: "%",
        defaultValue: 35,
    },
    islandSize: {
        type: ControlType.Number,
        title: "Island Size",
        min: 0.3,
        max: 1.5,
        step: 0.05,
        defaultValue: 0.7,
    },
    islandScatter: {
        type: ControlType.Number,
        title: "Island Scatter",
        min: 0,
        max: 50,
        step: 1,
        unit: "%",
        defaultValue: 20,
    },
    islandRandomness: {
        type: ControlType.Number,
        title: "Island Randomness",
        min: 0,
        max: 1,
        step: 0.05,
        defaultValue: 0.5,
    },
    islandFade: {
        type: ControlType.Number,
        title: "Island Fade",
        min: 0,
        max: 1,
        step: 0.05,
        defaultValue: 0.3,
    },

    // Ambient motion
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
        defaultValue: 0.5,
        hidden: (props) => !props.ambientMotion,
    },
    driftSpeed: {
        type: ControlType.Number,
        title: "Drift Speed",
        min: 0,
        max: 2,
        step: 0.05,
        defaultValue: 0.3,
        hidden: (props) => !props.ambientMotion,
    },
    flickerAmount: {
        type: ControlType.Number,
        title: "Flicker Amount",
        min: 0,
        max: 1,
        step: 0.05,
        defaultValue: 0.15,
        hidden: (props) => !props.ambientMotion,
    },
    reClusterAmount: {
        type: ControlType.Number,
        title: "Re-cluster Amount",
        min: 0,
        max: 1,
        step: 0.05,
        defaultValue: 0.1,
        hidden: (props) => !props.ambientMotion,
    },

    // Rotation
    rotationEnabled: {
        type: ControlType.Boolean,
        title: "Rotation",
        defaultValue: true,
    },
    rotationStrength: {
        type: ControlType.Number,
        title: "Rotation Strength",
        min: 0,
        max: 45,
        step: 1,
        unit: "°",
        defaultValue: 15,
        hidden: (props) => !props.rotationEnabled,
    },
    rotationFrequency: {
        type: ControlType.Number,
        title: "Rotation Frequency",
        min: 0.1,
        max: 3,
        step: 0.1,
        defaultValue: 0.4,
        hidden: (props) => !props.rotationEnabled,
    },
    rotationRandomness: {
        type: ControlType.Number,
        title: "Rotation Randomness",
        min: 0,
        max: 1,
        step: 0.05,
        defaultValue: 0.5,
        hidden: (props) => !props.rotationEnabled,
    },
    rotationSyncMode: {
        type: ControlType.Enum,
        title: "Rotation Sync",
        options: ["free", "grouped", "wave"],
        optionTitles: ["Free", "Grouped", "Wave"],
        defaultValue: "grouped",
        hidden: (props) => !props.rotationEnabled,
    },
    rotationFalloff: {
        type: ControlType.Boolean,
        title: "Rotation Falloff",
        defaultValue: true,
        hidden: (props) => !props.rotationEnabled,
    },

    // Hover
    hoverReactive: {
        type: ControlType.Boolean,
        title: "Hover Reactive",
        defaultValue: true,
    },
    hoverRadius: {
        type: ControlType.Number,
        title: "Hover Radius",
        min: 30,
        max: 400,
        step: 5,
        unit: "px",
        defaultValue: 120,
        hidden: (props) => !props.hoverReactive,
    },
    hoverIntensity: {
        type: ControlType.Number,
        title: "Hover Intensity",
        min: 0,
        max: 1,
        step: 0.05,
        defaultValue: 0.7,
        hidden: (props) => !props.hoverReactive,
    },
    hoverFalloff: {
        type: ControlType.Number,
        title: "Hover Falloff",
        min: 0,
        max: 1,
        step: 0.05,
        defaultValue: 0.5,
        hidden: (props) => !props.hoverReactive,
    },
    hoverSpawnIslands: {
        type: ControlType.Boolean,
        title: "Hover Islands",
        defaultValue: true,
        hidden: (props) => !props.hoverReactive,
    },
    hoverRecoverySpeed: {
        type: ControlType.Number,
        title: "Hover Recovery",
        min: 0.01,
        max: 0.3,
        step: 0.01,
        defaultValue: 0.08,
        hidden: (props) => !props.hoverReactive,
    },
    hoverRotationBoost: {
        type: ControlType.Number,
        title: "Hover Rotation Boost",
        min: 0,
        max: 3,
        step: 0.1,
        defaultValue: 1.5,
        hidden: (props) => !props.hoverReactive,
    },

    // Scroll
    scrollReactive: {
        type: ControlType.Boolean,
        title: "Scroll Reactive",
        defaultValue: false,
    },
    scrollIntensity: {
        type: ControlType.Number,
        title: "Scroll Intensity",
        min: 0,
        max: 1,
        step: 0.05,
        defaultValue: 0.3,
        hidden: (props) => !props.scrollReactive,
    },
    scrollDrift: {
        type: ControlType.Number,
        title: "Scroll Drift",
        min: 0,
        max: 1,
        step: 0.05,
        defaultValue: 0.2,
        hidden: (props) => !props.scrollReactive,
    },
    scrollCompression: {
        type: ControlType.Number,
        title: "Scroll Compression",
        min: 0,
        max: 1,
        step: 0.05,
        defaultValue: 0.1,
        hidden: (props) => !props.scrollReactive,
    },
    scrollClampToCoverage: {
        type: ControlType.Boolean,
        title: "Clamp to Coverage",
        defaultValue: true,
        hidden: (props) => !props.scrollReactive,
    },
    scrollRotationModulation: {
        type: ControlType.Number,
        title: "Scroll Rotation",
        min: 0,
        max: 1,
        step: 0.05,
        defaultValue: 0.3,
        hidden: (props) => !props.scrollReactive,
    },

    // Style
    blendMode: {
        type: ControlType.Enum,
        title: "Blend Mode",
        options: [
            "normal",
            "multiply",
            "screen",
            "overlay",
            "darken",
            "lighten",
            "color-dodge",
            "color-burn",
            "hard-light",
            "soft-light",
            "difference",
            "exclusion",
        ],
        optionTitles: [
            "Normal",
            "Multiply",
            "Screen",
            "Overlay",
            "Darken",
            "Lighten",
            "Color Dodge",
            "Color Burn",
            "Hard Light",
            "Soft Light",
            "Difference",
            "Exclusion",
        ],
        defaultValue: "normal",
    },
    brightnessShift: {
        type: ControlType.Number,
        title: "Brightness",
        min: -50,
        max: 50,
        step: 1,
        defaultValue: 0,
    },
    contrastShift: {
        type: ControlType.Number,
        title: "Contrast",
        min: -50,
        max: 50,
        step: 1,
        defaultValue: 0,
    },
    softBlur: {
        type: ControlType.Number,
        title: "Soft Blur",
        min: 0,
        max: 10,
        step: 0.5,
        unit: "px",
        defaultValue: 0,
    },
    grainOverlay: {
        type: ControlType.Boolean,
        title: "Grain Overlay",
        defaultValue: false,
    },
})
