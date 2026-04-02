// ─── Page Choreographer ──────────────────────────────────────────────────────
// The ONLY component you need. Drop one per section/group of elements.
// The first instance automatically sets up:
//   • The shared animation store
//   • Link click interception (exit animations before navigation)
//   • Enter animation playback on page load
//
// Each instance has its OWN animation settings (duration, easing, stagger, etc.)
// so different sections can have completely different effects.
//
// Presets provide quick common effects. Choose "Custom" for full control over
// opacity, offset X/Y, scale, rotate, and blur — matching Framer's native
// appear effect level of control.

import * as React from "react"
import { addPropertyControls, ControlType, RenderTarget } from "framer"

var STORE_KEY = "__pageChoreographerStore_v3"

// ─── Easing presets ──────────────────────────────────────────────────────────

var EASING_MAP: Record<string, number[]> = {
    smooth: [0.4, 0, 0.2, 1],
    snappy: [0.16, 1, 0.3, 1],
    dramatic: [0.76, 0, 0.24, 1],
    gentle: [0.25, 0.1, 0.25, 1],
    bounce: [0.34, 1.56, 0.64, 1],
    linear: [0, 0, 1, 1],
}

function easingToCss(e: number[]): string {
    return "cubic-bezier(" + e[0] + "," + e[1] + "," + e[2] + "," + e[3] + ")"
}

// ─── Helpers ────────────────────────────────────────────────────────────────

var maskDirectionPool = ["left", "right", "up", "down", "topLeft", "topRight", "bottomLeft", "bottomRight"]

// WAAPI keyframes use camelCase (clipPath, transformOrigin) but
// CSSStyleDeclaration.setProperty/removeProperty need kebab-case
// (clip-path, transform-origin).  Without this conversion, bake/unbake
// silently fails for hyphenated properties, leaving no inline clip-path
// after WAAPI cancel — which triggers CSS transitions on re-entry.
function camelToKebab(s: string): string {
    return s.replace(/[A-Z]/g, function (m) { return "-" + m.toLowerCase() })
}

function resolveMaskDirection(dir: string): string {
    if (dir === "random") {
        return maskDirectionPool[Math.floor(Math.random() * maskDirectionPool.length)]
    }
    return dir
}

// ─── Keyframe builders ───────────────────────────────────────────────────────

function buildEnterKeyframes(t: TargetEntry) {
    if (t.enterPreset === "custom") {
        var from: any = { opacity: String(t.enterOpacity) }
        var to: any = { opacity: "1" }

        var has3D = t.enterRotateX !== 0 || t.enterRotateY !== 0
        var persp = has3D && t.enterPerspective > 0
            ? "perspective(" + t.enterPerspective + "px) " : ""

        from.transform = persp +
            "translateX(" + t.enterOffsetX + "px) " +
            "translateY(" + t.enterOffsetY + "px) " +
            "scale(" + t.enterScale + ") " +
            "rotateX(" + t.enterRotateX + "deg) " +
            "rotateY(" + t.enterRotateY + "deg) " +
            "rotateZ(" + t.enterRotateZ + "deg)"
        to.transform = persp +
            "translateX(0px) translateY(0px) scale(1) " +
            "rotateX(0deg) rotateY(0deg) rotateZ(0deg)"

        if (t.enterBlur > 0) {
            from.filter = "blur(" + t.enterBlur + "px)"
            to.filter = "blur(0px)"
        }

        return { from: from, to: to }
    }

    var d = t.distance
    switch (t.enterPreset) {
        case "fadeDown":
            return {
                from: { opacity: "0", transform: "translateY(" + -d + "px)" },
                to: { opacity: "1", transform: "translateY(0px)" },
            }
        case "fadeLeft":
            return {
                from: { opacity: "0", transform: "translateX(" + d + "px)" },
                to: { opacity: "1", transform: "translateX(0px)" },
            }
        case "fadeRight":
            return {
                from: { opacity: "0", transform: "translateX(" + -d + "px)" },
                to: { opacity: "1", transform: "translateX(0px)" },
            }
        case "scaleIn": {
            var sf = t.scaleFrom
            var so = t.scaleOpacity != null ? t.scaleOpacity : 0
            var sd = t.enterScaleDirection || "center"
            // transform-origin maps direction to the edge/corner the scale originates FROM
            var originMap: Record<string, string> = {
                center: "center center",
                left: "left center",
                right: "right center",
                up: "top center",
                down: "bottom center",
                topLeft: "top left",
                topRight: "top right",
                bottomLeft: "bottom left",
                bottomRight: "bottom right",
            }
            var origin = originMap[sd] || "center center"
            var scaleFrom: any = {
                opacity: String(so),
                transform: "scale(" + sf + ")",
                transformOrigin: origin,
            }
            var scaleTo: any = {
                opacity: "1",
                transform: "scale(1)",
                transformOrigin: origin,
            }
            // Optional mask: pair a clip-path reveal with the scale
            var sMaskDir = resolveMaskDirection(t.enterMaskDirection || "none")
            if (sMaskDir !== "none") {
                var sm = Math.max(0, Math.min(100, 100 - (t.maskStart || 0)))
                var sMask = "inset(0 " + sm + "% 0 0)" // default: left
                switch (sMaskDir) {
                    case "right":      sMask = "inset(0 0 0 " + sm + "%)"; break
                    case "up":         sMask = "inset(0 0 " + sm + "% 0)"; break
                    case "down":       sMask = "inset(" + sm + "% 0 0 0)"; break
                    case "topLeft":    sMask = "inset(0 " + sm + "% " + sm + "% 0)"; break
                    case "topRight":   sMask = "inset(0 0 " + sm + "% " + sm + "%)"; break
                    case "bottomLeft": sMask = "inset(" + sm + "% " + sm + "% 0 0)"; break
                    case "bottomRight":sMask = "inset(" + sm + "% 0 0 " + sm + "%)"; break
                }
                scaleFrom.clipPath = sMask
                scaleTo.clipPath = "inset(0 0 0 0)"
            }
            // Mask shift: offset the content behind the mask for an
            // asymmetric reveal.  Combines with the scale transform.
            if (t.maskShiftX !== 0 || t.maskShiftY !== 0) {
                scaleFrom.transform = "scale(" + sf + ") translateX(" + t.maskShiftX + "px) translateY(" + t.maskShiftY + "px)"
                scaleTo.transform = "scale(1) translateX(0px) translateY(0px)"
            }
            return { from: scaleFrom, to: scaleTo }
        }
        case "blurIn":
            return {
                from: {
                    opacity: "0",
                    filter: "blur(" + t.blurAmount + "px)",
                },
                to: { opacity: "1", filter: "blur(0px)" },
            }
        case "maskReveal": {
            // inset(top right bottom left) — 100% = fully clipped on that edge
            var s = Math.max(0, Math.min(100, 100 - (t.maskStart || 0))) // remaining mask %
            var mFrom = "inset(0 " + s + "% 0 0)" // default: left to right
            var resolvedMaskDir = resolveMaskDirection(t.enterMaskDirection)
            switch (resolvedMaskDir) {
                case "right":      mFrom = "inset(0 0 0 " + s + "%)"; break
                case "up":         mFrom = "inset(0 0 " + s + "% 0)"; break
                case "down":       mFrom = "inset(" + s + "% 0 0 0)"; break
                case "topLeft":    mFrom = "inset(0 " + s + "% " + s + "% 0)"; break
                case "topRight":   mFrom = "inset(0 0 " + s + "% " + s + "%)"; break
                case "bottomLeft": mFrom = "inset(" + s + "% " + s + "% 0 0)"; break
                case "bottomRight":mFrom = "inset(" + s + "% 0 0 " + s + "%)"; break
            }
            var enterFrom: any = { clipPath: mFrom }
            var enterTo: any = { clipPath: "inset(0 0 0 0)" }
            if (t.maskOpacity < 1) {
                enterFrom.opacity = String(t.maskOpacity)
                enterTo.opacity = "1"
            }
            if (t.maskShiftX !== 0 || t.maskShiftY !== 0) {
                enterFrom.transform = "translateX(" + t.maskShiftX + "px) translateY(" + t.maskShiftY + "px)"
                enterTo.transform = "translateX(0px) translateY(0px)"
            }
            return { from: enterFrom, to: enterTo }
        }
        case "fadeUp":
        default:
            return {
                from: { opacity: "0", transform: "translateY(" + d + "px)" },
                to: { opacity: "1", transform: "translateY(0px)" },
            }
    }
}

function buildExitKeyframes(t: TargetEntry) {
    if (t.exitPreset === "custom") {
        var from: any = { opacity: "1" }
        var to: any = { opacity: String(t.exitOpacity) }

        var has3D = t.exitRotateX !== 0 || t.exitRotateY !== 0
        var persp = has3D && t.exitPerspective > 0
            ? "perspective(" + t.exitPerspective + "px) " : ""

        from.transform = persp +
            "translateX(0px) translateY(0px) scale(1) " +
            "rotateX(0deg) rotateY(0deg) rotateZ(0deg)"
        to.transform = persp +
            "translateX(" + t.exitOffsetX + "px) " +
            "translateY(" + t.exitOffsetY + "px) " +
            "scale(" + t.exitScale + ") " +
            "rotateX(" + t.exitRotateX + "deg) " +
            "rotateY(" + t.exitRotateY + "deg) " +
            "rotateZ(" + t.exitRotateZ + "deg)"

        if (t.exitBlur > 0) {
            from.filter = "blur(0px)"
            to.filter = "blur(" + t.exitBlur + "px)"
        }

        return { from: from, to: to }
    }

    var d = t.distance
    switch (t.exitPreset) {
        case "blurLift":
            return {
                from: {
                    opacity: "1",
                    transform: "translateY(0px)",
                    filter: "blur(0px)",
                },
                to: {
                    opacity: "0",
                    transform: "translateY(" + -(d * 0.5) + "px)",
                    filter: "blur(" + t.blurAmount + "px)",
                },
            }
        case "scaleFadeGrid":
            return {
                from: { opacity: "1", transform: "scale(1)" },
                to: { opacity: "0", transform: "scale(" + t.scaleFrom + ")" },
            }
        case "fadeDown":
            return {
                from: { opacity: "1", transform: "translateY(0px)" },
                to: { opacity: "0", transform: "translateY(" + d + "px)" },
            }
        case "fadeLeft":
            return {
                from: { opacity: "1", transform: "translateX(0px)" },
                to: { opacity: "0", transform: "translateX(" + -d + "px)" },
            }
        case "fadeRight":
            return {
                from: { opacity: "1", transform: "translateX(0px)" },
                to: { opacity: "0", transform: "translateX(" + d + "px)" },
            }
        case "maskOut": {
            var mTo = "inset(0 0 0 100%)" // default: left to right
            var resolvedExitMaskDir = resolveMaskDirection(t.exitMaskDirection)
            switch (resolvedExitMaskDir) {
                case "right":      mTo = "inset(0 100% 0 0)"; break
                case "up":         mTo = "inset(100% 0 0 0)"; break
                case "down":       mTo = "inset(0 0 100% 0)"; break
                case "topLeft":    mTo = "inset(0 100% 100% 0)"; break
                case "topRight":   mTo = "inset(0 0 100% 100%)"; break
                case "bottomLeft": mTo = "inset(100% 100% 0 0)"; break
                case "bottomRight":mTo = "inset(100% 0 0 100%)"; break
            }
            var exitFrom: any = { clipPath: "inset(0 0 0 0)" }
            var exitTo: any = { clipPath: mTo }
            if (t.maskOpacity < 1) {
                exitFrom.opacity = "1"
                exitTo.opacity = String(t.maskOpacity)
            }
            if (t.maskShiftX !== 0 || t.maskShiftY !== 0) {
                exitFrom.transform = "translateX(0px) translateY(0px)"
                exitTo.transform = "translateX(" + (-t.maskShiftX) + "px) translateY(" + (-t.maskShiftY) + "px)"
            }
            return { from: exitFrom, to: exitTo }
        }
        case "scaleOut": {
            var soSf = t.scaleFrom
            var soSo = t.scaleOpacity != null ? t.scaleOpacity : 0
            var soSd = t.enterScaleDirection || "center"
            var soOriginMap: Record<string, string> = {
                center: "center center",
                left: "left center",
                right: "right center",
                up: "top center",
                down: "bottom center",
                topLeft: "top left",
                topRight: "top right",
                bottomLeft: "bottom left",
                bottomRight: "bottom right",
            }
            var soOrigin = soOriginMap[soSd] || "center center"
            var soFrom: any = {
                opacity: "1",
                transform: "scale(1)",
                transformOrigin: soOrigin,
            }
            var soTo: any = {
                opacity: String(soSo),
                transform: "scale(" + soSf + ")",
                transformOrigin: soOrigin,
            }
            // Optional mask: reverse of scaleIn mask
            var soMaskDir = resolveMaskDirection(t.enterMaskDirection || "none")
            if (soMaskDir !== "none") {
                var soM = Math.max(0, Math.min(100, 100 - (t.maskStart || 0)))
                var soMask = "inset(0 " + soM + "% 0 0)"
                switch (soMaskDir) {
                    case "right":      soMask = "inset(0 0 0 " + soM + "%)"; break
                    case "up":         soMask = "inset(0 0 " + soM + "% 0)"; break
                    case "down":       soMask = "inset(" + soM + "% 0 0 0)"; break
                    case "topLeft":    soMask = "inset(0 " + soM + "% " + soM + "% 0)"; break
                    case "topRight":   soMask = "inset(0 0 " + soM + "% " + soM + "%)"; break
                    case "bottomLeft": soMask = "inset(" + soM + "% " + soM + "% 0 0)"; break
                    case "bottomRight":soMask = "inset(" + soM + "% 0 0 " + soM + "%)"; break
                }
                soFrom.clipPath = "inset(0 0 0 0)"
                soTo.clipPath = soMask
            }
            if (t.maskShiftX !== 0 || t.maskShiftY !== 0) {
                soFrom.transform = "scale(1) translateX(0px) translateY(0px)"
                soTo.transform = "scale(" + soSf + ") translateX(" + (-t.maskShiftX) + "px) translateY(" + (-t.maskShiftY) + "px)"
            }
            return { from: soFrom, to: soTo }
        }
        case "riseWave":
        default:
            return {
                from: { opacity: "1", transform: "translateY(0px)" },
                to: { opacity: "0", transform: "translateY(" + -d + "px)" },
            }
    }
}

// ─── Store (singleton on window) ─────────────────────────────────────────────

interface TargetEntry {
    id: string
    ref: { current: HTMLElement | null }
    groupId: string
    enterPreset: string
    exitPreset: string
    enterEnabled: boolean
    exitEnabled: boolean
    sortPriority: number
    delayOffset: number
    mobileEnabled: boolean
    trigger: string
    duration: number
    stagger: number
    easing: number[]
    staggerDirection: string
    priorityGap: number
    distance: number
    enterMaskDirection: string
    exitMaskDirection: string
    maskStart: number
    maskShiftX: number
    maskShiftY: number
    maskOpacity: number
    blurAmount: number
    scaleFrom: number
    enterScaleDirection: string
    scaleOpacity: number
    // Custom enter
    enterOpacity: number
    enterOffsetX: number
    enterOffsetY: number
    enterScale: number
    enterRotateX: number
    enterRotateY: number
    enterRotateZ: number
    enterBlur: number
    enterPerspective: number
    // Custom exit
    exitOpacity: number
    exitOffsetX: number
    exitOffsetY: number
    exitScale: number
    exitRotateX: number
    exitRotateY: number
    exitRotateZ: number
    exitBlur: number
    exitPerspective: number
}

function createStore() {
    var targets: Record<string, TargetEntry> = {}
    var activeAnims: Animation[] = []
    var phase = "idle"
    var overlay: HTMLDivElement | null = null
    var linkInterceptionSetup = false
    var skipNextClick = false
    var exitTimeout = 3
    // WeakSet tracks DOM elements that have already been enter-animated.
    // React re-renders reuse the same DOM nodes → elements stay in set → skip.
    // Replay/reload/navigation creates fresh DOM nodes → not in set → animate.
    var animatedElements: WeakSet<Element> | null =
        typeof WeakSet !== "undefined" ? new WeakSet<Element>() : null

    // Map groupId → parent elements to dispatch choreo-done on
    var groupParents: { [gid: string]: HTMLElement[] } = {}

    function registerGroupParent(groupId: string, el: HTMLElement) {
        if (!groupParents[groupId]) groupParents[groupId] = []
        if (groupParents[groupId].indexOf(el) === -1) {
            groupParents[groupId].push(el)
        }
    }

    function unregisterGroupParent(groupId: string, el: HTMLElement) {
        if (!groupParents[groupId]) return
        var idx = groupParents[groupId].indexOf(el)
        if (idx !== -1) groupParents[groupId].splice(idx, 1)
    }

    function getGroupParents(groupId: string): HTMLElement[] | null {
        return groupParents[groupId] || null
    }

    function registerTarget(t: TargetEntry) {
        targets[t.id] = t
    }

    function unregisterTarget(id: string) {
        delete targets[id]
    }

    function getTargetCount() {
        return Object.keys(targets).length
    }

    function getAllTargets() {
        var result: TargetEntry[] = []
        for (var id in targets) {
            if (targets[id].ref.current) result.push(targets[id])
        }
        return result
    }

    function sortTargets(list: TargetEntry[], direction: string) {
        var sorted = list.slice()
        if (direction === "random") {
            // Fisher-Yates shuffle for uniform random order
            for (var si = sorted.length - 1; si > 0; si--) {
                var sj = Math.floor(Math.random() * (si + 1))
                var tmp = sorted[si]
                sorted[si] = sorted[sj]
                sorted[sj] = tmp
            }
            return sorted
        }
        sorted.sort(function (a, b) {
            if (a.sortPriority !== b.sortPriority)
                return a.sortPriority - b.sortPriority
            var elA = a.ref.current
            var elB = b.ref.current
            if (!elA || !elB) return 0
            var rA = elA.getBoundingClientRect()
            var rB = elB.getBoundingClientRect()
            var cxA = rA.left + rA.width / 2
            var cyA = rA.top + rA.height / 2
            var cxB = rB.left + rB.width / 2
            var cyB = rB.top + rB.height / 2
            switch (direction) {
                case "rightToLeft":
                    return cxB - cxA
                case "topToBottom":
                    return cyA - cyB
                case "bottomToTop":
                    return cyB - cyA
                case "rowMajor": {
                    var rowA = Math.round(rA.top / 80)
                    var rowB = Math.round(rB.top / 80)
                    if (rowA !== rowB) return rowA - rowB
                    return cxA - cxB
                }
                case "columnMajor": {
                    var colA = Math.round(rA.left / 200)
                    var colB = Math.round(rB.left / 200)
                    if (colA !== colB) return colA - colB
                    return cyA - cyB
                }
                case "leftToRight":
                default:
                    return cxA - cxB
            }
        })
        return sorted
    }

    function cancelActive() {
        for (var i = 0; i < activeAnims.length; i++) {
            try { activeAnims[i].cancel() } catch (e) {}
        }
        activeAnims = []
    }

    function lockInteractions() {
        if (overlay) return
        overlay = document.createElement("div")
        overlay.style.cssText =
            "position:fixed;top:0;left:0;right:0;bottom:0;z-index:99999;cursor:wait;"
        document.body.appendChild(overlay)
    }

    function unlockInteractions() {
        if (overlay) {
            overlay.remove()
            overlay = null
        }
    }

    function groupByGroupId(list: TargetEntry[]): Record<string, TargetEntry[]> {
        var groups: Record<string, TargetEntry[]> = {}
        for (var i = 0; i < list.length; i++) {
            var t = list[i]
            if (!groups[t.groupId]) groups[t.groupId] = []
            groups[t.groupId].push(t)
        }
        return groups
    }

    // Sort group IDs by their priority (ascending), so lower priority
    // numbers animate first. Groups with the same priority play together.
    function getSortedGroupIds(groups: Record<string, TargetEntry[]>): string[] {
        var gids = Object.keys(groups)
        gids.sort(function (a, b) {
            return groups[a][0].sortPriority - groups[b][0].sortPriority
        })
        return gids
    }

    function playEnter() {
        var reduced =
            window.matchMedia &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches
        var mobile = window.innerWidth < 768

        // Only auto-play "onLoad" targets — "inView" targets are
        // triggered independently by IntersectionObserver.
        // Skip elements already animated (WeakSet tracks DOM nodes).
        var eligible = getAllTargets().filter(function (t) {
            var el = t.ref.current
            return t.trigger === "onLoad" && t.enterEnabled &&
                (t.mobileEnabled || !mobile) && el &&
                !(animatedElements && animatedElements.has(el))
        })

        if (eligible.length === 0) return Promise.resolve()
        phase = "entering"

        var groups = groupByGroupId(eligible)
        var sortedGids = getSortedGroupIds(groups)
        var promises: Promise<any>[] = []
        var groupOffset = 0
        var prevPriority: number | null = null

        for (var gi = 0; gi < sortedGids.length; gi++) {
            var gid = sortedGids[gi]
            var group = groups[gid]
            var currentPriority = group[0].sortPriority
            var direction = group[0].staggerDirection
            var sorted = sortTargets(group, direction)

            // Same priority as previous group → no extra offset (play together)
            // Different priority → advance offset so this group starts after the last
            if (prevPriority !== null && currentPriority !== prevPriority) {
                // groupOffset was already accumulated from previous groups
            }

            var maxDelayInGroup = 0

            for (var i = 0; i < sorted.length; i++) {
                var target = sorted[i]
                var el = target.ref.current
                if (!el) continue

                var kf = reduced
                    ? { from: { opacity: "0" }, to: { opacity: "1" } }
                    : buildEnterKeyframes(target)

                var stagger = reduced ? 0 : target.stagger
                var localDelay = stagger * i + target.delayOffset
                var delay = localDelay + groupOffset
                var dur = reduced ? 10 : target.duration * 1000

                if (localDelay > maxDelayInGroup) maxDelayInGroup = localDelay

                // Mark element as animated BEFORE starting so re-renders
                // during the animation won't try to animate it again
                if (animatedElements) animatedElements.add(el)

                // Reveal pre-hidden element and block hover during animation
                el.style.removeProperty("visibility")
                el.style.pointerEvents = "none"

                try {
                    var anim = el.animate([kf.from, kf.to], {
                        duration: dur,
                        delay: delay * 1000,
                        easing: easingToCss(target.easing),
                        fill: "both",
                    })
                    activeAnims.push(anim)

                    promises.push(
                        anim.finished.then(
                            (function (a, e) {
                                return function () {
                                    // Restore pointer events so hover effects work
                                    e.style.pointerEvents = ""
                                    try { a.cancel() } catch (ex) {}
                                }
                            })(anim, el)
                        )
                    )
                } catch (e) {
                    el.style.pointerEvents = ""
                }
            }

            // If the NEXT group has a different priority, advance the offset
            // so it starts after this group's last element finishes animating
            // plus the priority gap
            var nextGid = sortedGids[gi + 1]
            if (nextGid) {
                var nextPriority = groups[nextGid][0].sortPriority
                if (nextPriority !== currentPriority) {
                    var groupDur = sorted.length > 0 ? sorted[0].duration : 0.6
                    var gap = group[0].priorityGap || 0
                    groupOffset += maxDelayInGroup + groupDur + gap
                }
            }
            prevPriority = currentPriority
        }

        return Promise.all(promises).then(function () {
            activeAnims = []
            phase = "done"
        })
    }

    function playExit() {
        if (phase === "exiting") return Promise.resolve()
        cancelActive()
        phase = "exiting"
        // Clear animated tracking so enter animations replay on next page
        animatedElements = typeof WeakSet !== "undefined" ? new WeakSet() : null
        lockInteractions()

        var reduced =
            window.matchMedia &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches
        var mobile = window.innerWidth < 768

        var eligible = getAllTargets().filter(function (t) {
            return t.exitEnabled && (t.mobileEnabled || !mobile) && t.ref.current
        })

        var groups = groupByGroupId(eligible)
        var sortedGids = getSortedGroupIds(groups)
        var promises: Promise<any>[] = []
        var groupOffset = 0
        var prevPriority: number | null = null

        for (var gi = 0; gi < sortedGids.length; gi++) {
            var gid = sortedGids[gi]
            var group = groups[gid]
            var currentPriority = group[0].sortPriority
            var direction = group[0].staggerDirection
            var sorted = sortTargets(group, direction)

            var maxDelayInGroup = 0

            for (var i = 0; i < sorted.length; i++) {
                var target = sorted[i]
                var el = target.ref.current
                if (!el) continue

                var kf = reduced
                    ? { from: { opacity: "1" }, to: { opacity: "0" } }
                    : buildExitKeyframes(target)

                var stagger = reduced ? 0 : target.stagger
                var localDelay = stagger * i + target.delayOffset
                var delay = localDelay + groupOffset

                if (localDelay > maxDelayInGroup) maxDelayInGroup = localDelay

                try {
                    var anim = el.animate([kf.from, kf.to], {
                        duration: reduced ? 10 : target.duration * 1000,
                        delay: delay * 1000,
                        easing: easingToCss(target.easing),
                        fill: "forwards",
                    })
                    activeAnims.push(anim)
                    promises.push(anim.finished)
                } catch (e) {}
            }

            var nextGid = sortedGids[gi + 1]
            if (nextGid) {
                var nextPriority = groups[nextGid][0].sortPriority
                if (nextPriority !== currentPriority) {
                    var groupDur = sorted.length > 0 ? sorted[0].duration : 0.6
                    var gap = group[0].priorityGap || 0
                    groupOffset += maxDelayInGroup + groupDur + gap
                }
            }
            prevPriority = currentPriority
        }

        return Promise.all(promises).then(function () {
            activeAnims = []
            unlockInteractions()
            phase = "done"
        })
    }

    // ─── Reset a group so it can be re-animated (used by viewRepeat) ────────

    function resetGroup(groupId: string) {
        if (!animatedElements) return
        var all = getAllTargets()
        for (var i = 0; i < all.length; i++) {
            if (all[i].groupId === groupId && all[i].ref.current) {
                animatedElements.delete(all[i].ref.current!)
            }
        }
        // Cancel any pending batch play for this group so a queued
        // playEnterGroupsBatch doesn't undo the reset's visibility:hidden.
        var pidx = pendingGroups.indexOf(groupId)
        if (pidx !== -1) pendingGroups.splice(pidx, 1)
    }

    // ─── Play enter for inView groups (batched by priority) ─────────────────

    var pendingGroups: string[] = []
    var groupBatchTimer: any = null

    function cancelPendingGroup(groupId: string) {
        var idx = pendingGroups.indexOf(groupId)
        if (idx !== -1) pendingGroups.splice(idx, 1)
    }

    function playEnterGroup(groupId: string) {
        // Collect group IDs that trigger within a short window,
        // then play them all together sorted by priority
        if (pendingGroups.indexOf(groupId) === -1) {
            pendingGroups.push(groupId)
        }
        if (groupBatchTimer) clearTimeout(groupBatchTimer)
        groupBatchTimer = setTimeout(function () {
            groupBatchTimer = null
            var batch = pendingGroups.slice()
            pendingGroups = []
            playEnterGroupsBatch(batch)
        }, 80)
    }

    function playEnterGroupsBatch(groupIds: string[]) {
        var reduced =
            window.matchMedia &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches
        var mobile = window.innerWidth < 768

        // Collect eligible targets for all requested groups
        var allEligible = getAllTargets().filter(function (t) {
            var el = t.ref.current
            return groupIds.indexOf(t.groupId) !== -1 && t.enterEnabled &&
                (t.mobileEnabled || !mobile) && el &&
                !(animatedElements && animatedElements.has(el))
        })

        if (allEligible.length === 0) return

        // Group by groupId, then sort groups by priority
        var groups = groupByGroupId(allEligible)
        var sortedGids = getSortedGroupIds(groups)
        var promises: Promise<any>[] = []
        var groupOffset = 0
        var prevPriority: number | null = null

        for (var gi = 0; gi < sortedGids.length; gi++) {
            var gid = sortedGids[gi]
            var group = groups[gid]
            var currentPriority = group[0].sortPriority
            var direction = group[0].staggerDirection
            var sorted = sortTargets(group, direction)

            var maxDelayInGroup = 0

            for (var i = 0; i < sorted.length; i++) {
                var target = sorted[i]
                var el = target.ref.current
                if (!el) continue

                if (animatedElements) animatedElements.add(el)
                el.style.removeProperty("visibility")
                el.style.pointerEvents = "none"

                var kf = reduced
                    ? { from: { opacity: "0" }, to: { opacity: "1" } }
                    : buildEnterKeyframes(target)

                var stagger = reduced ? 0 : target.stagger
                var localDelay = stagger * i + target.delayOffset
                var delay = localDelay + groupOffset
                var dur = reduced ? 10 : target.duration * 1000

                if (localDelay > maxDelayInGroup) maxDelayInGroup = localDelay

                try {
                    var anim = el.animate([kf.from, kf.to], {
                        duration: dur,
                        delay: delay * 1000,
                        easing: easingToCss(target.easing),
                        fill: "both",
                    })
                    activeAnims.push(anim)

                    promises.push(
                        anim.finished.then(
                            (function (a, e) {
                                return function () {
                                    e.style.pointerEvents = ""
                                    try { a.cancel() } catch (ex) {}
                                }
                            })(anim, el)
                        )
                    )
                } catch (e) {
                    el.style.pointerEvents = ""
                }
            }

            // Advance offset for next priority level
            var nextGid = sortedGids[gi + 1]
            if (nextGid) {
                var nextPriority = groups[nextGid][0].sortPriority
                if (nextPriority !== currentPriority) {
                    var groupDur = sorted.length > 0 ? sorted[0].duration : 0.6
                    var gap = group[0].priorityGap || 0
                    groupOffset += maxDelayInGroup + groupDur + gap
                }
            }
            prevPriority = currentPriority
        }

        Promise.all(promises).then(function () {
            // Notify child PCs that these groups have finished animating.
            // Dispatch on each animated target element...
            for (var di = 0; di < sortedGids.length; di++) {
                var dGroup = groups[sortedGids[di]]
                for (var dj = 0; dj < dGroup.length; dj++) {
                    var dEl = dGroup[dj].ref.current
                    if (dEl) {
                        dEl.dispatchEvent(new CustomEvent("choreo-done", {
                            bubbles: true,
                            detail: { groupId: sortedGids[di] },
                        }))
                    }
                }
                // ...AND on each registered group parent container.
                // This ensures child PCs in sibling stacks receive the
                // event even when the animated targets are in a different
                // branch of the DOM tree.
                var gps = groupParents[sortedGids[di]]
                if (gps) {
                    for (var gpi = 0; gpi < gps.length; gpi++) {
                        gps[gpi].dispatchEvent(new CustomEvent("choreo-done", {
                            bubbles: true,
                            detail: { groupId: sortedGids[di] },
                        }))
                    }
                }
            }
        })
        return Promise.all(promises)
    }

    // ─── Link interception ───────────────────────────────────────────────────

    function setupLinkInterception(timeout: number) {
        exitTimeout = timeout
        if (linkInterceptionSetup) return
        linkInterceptionSetup = true

        function findAnchor(target: EventTarget | null): HTMLAnchorElement | null {
            var node = target as HTMLElement | null
            while (node && node !== document.body) {
                if (node.tagName === "A") return node as HTMLAnchorElement
                node = node.parentElement
            }
            return null
        }

        function shouldIntercept(anchor: HTMLAnchorElement): boolean {
            if (!anchor.href) return false
            if (anchor.hasAttribute("data-no-exit")) return false
            if (anchor.target === "_blank") return false
            try {
                var url = new URL(anchor.href, window.location.origin)
                if (url.origin !== window.location.origin) return false
                if (url.pathname === window.location.pathname && url.hash) return false
            } catch (e) {
                return false
            }
            return true
        }

        function navigateViaAnchor(anchor: HTMLAnchorElement) {
            skipNextClick = true
            anchor.click()
        }

        document.addEventListener("click", function (e: MouseEvent) {
            if (skipNextClick) { skipNextClick = false; return }
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return

            var anchor = findAnchor(e.target)
            if (!anchor) return
            if (!shouldIntercept(anchor)) return
            if (getTargetCount() === 0) return

            e.preventDefault()
            e.stopPropagation()

            Promise.race([
                playExit(),
                new Promise(function (resolve) {
                    setTimeout(resolve, exitTimeout * 1000)
                }),
            ])
                .then(function () { navigateViaAnchor(anchor) })
                .catch(function () { navigateViaAnchor(anchor) })
        }, true)
    }

    // ─── Auto enter ──────────────────────────────────────────────────────────

    var scheduleTimer: any = null

    function scheduleEnter(delay: number) {
        // Debounce: each call resets the timer so we wait for all
        // components to finish registering before playing.
        // The WeakSet inside playEnter handles idempotency —
        // already-animated DOM elements are skipped automatically.
        if (scheduleTimer) clearTimeout(scheduleTimer)
        scheduleTimer = setTimeout(function () {
            scheduleTimer = null
            var delayMs = delay * 1000
            if (delayMs > 0) {
                setTimeout(function () { playEnter() }, delayMs)
            } else {
                playEnter()
            }
        }, 150)
    }

    return {
        registerTarget: registerTarget,
        unregisterTarget: unregisterTarget,
        registerGroupParent: registerGroupParent,
        unregisterGroupParent: unregisterGroupParent,
        getGroupParents: getGroupParents,
        getTargetCount: getTargetCount,
        getAllTargets: getAllTargets,
        sortTargets: sortTargets,
        playEnter: playEnter,
        playEnterGroup: playEnterGroup,
        resetGroup: resetGroup,
        cancelPendingGroup: cancelPendingGroup,
        playExit: playExit,
        cancelActive: cancelActive,
        setupLinkInterception: setupLinkInterception,
        scheduleEnter: scheduleEnter,
    }
}

function getStore() {
    if (typeof window !== "undefined") {
        if (!(window as any)[STORE_KEY]) {
            ;(window as any)[STORE_KEY] = createStore()
        }
        var s = (window as any)[STORE_KEY]
        // Patch stores created by older code versions that lack group parent methods
        if (s && !s.cancelPendingGroup) {
            s.cancelPendingGroup = function () {}
        }
        if (s && !s.registerGroupParent) {
            var gp: { [gid: string]: HTMLElement[] } = {}
            s.registerGroupParent = function (groupId: string, el: HTMLElement) {
                if (!gp[groupId]) gp[groupId] = []
                if (gp[groupId].indexOf(el) === -1) gp[groupId].push(el)
            }
            s.unregisterGroupParent = function (groupId: string, el: HTMLElement) {
                if (!gp[groupId]) return
                var idx = gp[groupId].indexOf(el)
                if (idx !== -1) gp[groupId].splice(idx, 1)
            }
            s.getGroupParents = function (groupId: string) {
                return gp[groupId] || null
            }
        }
        return s
    }
    return null
}

// ─── DOM scanning ────────────────────────────────────────────────────────────

function findRealParent(marker: HTMLElement): HTMLElement | null {
    var node = marker.parentElement
    var maxDepth = 5
    while (node && maxDepth > 0) {
        var count = 0
        for (var i = 0; i < node.children.length; i++) count++
        if (count > 1) return node
        node = node.parentElement
        maxDepth--
    }
    return node
}

// Walk up from an element to find the section-level ancestor.
// Strategy:
//  1. Prefer an ancestor with data-framer-name (explicit Framer section)
//  2. Fall back to the "child of a parent with ≥3 siblings" heuristic
//  3. Reject candidates taller than 2× viewport (likely the page container)
//  4. Final fallback: return the starting element
function findSection(el: HTMLElement): HTMLElement {
    var vh = window.innerHeight
    var node = el
    var heuristicCandidate: HTMLElement | null = null
    var namedCandidate: HTMLElement | null = null

    while (node.parentElement) {
        // Framer sections have data-framer-name — good signal, but
        // reject page-level containers that are much taller than the
        // viewport (e.g. "main" wrapping the entire page).
        if (node.getAttribute("data-framer-name") != null && !namedCandidate) {
            if (node.offsetHeight <= vh * 2.5) {
                namedCandidate = node
            }
            // If too tall, skip — keep looking for a smaller named ancestor
        }

        var siblingCount = node.parentElement.children.length
        if (siblingCount >= 3 && !heuristicCandidate) {
            // Only accept if the candidate isn't the entire page
            if (node.offsetHeight < vh * 2) {
                heuristicCandidate = node
            }
        }

        node = node.parentElement
    }

    // Prefer named section, fall back to heuristic, then starting element
    return namedCandidate || heuristicCandidate || el
}

// Find the best element to use as the pin container's target.
// This is separate from findSection because the pin needs to wrap
// the SHARED visual section (the viewport-height block that contains
// all PC instances), even if it's unnamed.  findSection returns the
// local named ancestor (good for wrapper creation), but pin needs
// the page-level section that siblings other sections.
function findPinSection(el: HTMLElement): HTMLElement {
    var vh = window.innerHeight
    var node = el
    var best: HTMLElement | null = null

    while (node.parentElement) {
        // Skip over pin containers and spacers injected by previous
        // PC instances — these are NOT real page sections and must
        // never be returned as a pin section.
        if (node.hasAttribute("data-choreo-pin-container") ||
            node.hasAttribute("data-choreo-spacer")) {
            node = node.parentElement
            continue
        }
        // Never select body or html as a pin section — these are
        // page-level containers, not sections.
        if (node === document.body || node === document.documentElement) break
        var h = node.offsetHeight
        // Good pin candidate: a non-collapsed element whose parent
        // has at least 2 children (meaning it's a page-level section
        // that sits alongside other sections).  No strict height
        // range — sections can be any height (100vh, fill, fixed).
        // The sibling check + tree walk (preferring higher ancestors)
        // is the real section identifier.
        if (h >= 10) {
            var parentKids = node.parentElement.children.length
            if (parentKids >= 2) {
                best = node
                // If this node is viewport-height or taller, it's
                // likely a page-level section — stop here.  Smaller
                // nodes (cards, wrappers) continue climbing to find
                // the actual section.  This prevents separate stacks
                // from resolving to the same page container while
                // still allowing multi-PC sections to find their
                // correct section ancestor.
                if (h >= vh * 0.5) break
            }
        }
        // Stop climbing if we've gone past 3x viewport
        if (h > vh * 3) break
        node = node.parentElement
    }

    // Fall back to findSection if no page-level section found
    return best || findSection(el)
}

function isMarkerBranch(el: HTMLElement, marker: HTMLElement): boolean {
    return el === marker || el.contains(marker)
}

function findNodeWithMostChildren(
    root: HTMLElement,
    marker: HTMLElement
): HTMLElement | null {
    var best: HTMLElement | null = null
    var bestCount = 0
    function walk(node: HTMLElement) {
        var contentCount = 0
        for (var i = 0; i < node.children.length; i++) {
            if (!isMarkerBranch(node.children[i] as HTMLElement, marker))
                contentCount++
        }
        if (contentCount >= 1 && contentCount > bestCount) {
            bestCount = contentCount
            best = node
        }
        for (var j = 0; j < node.children.length; j++) {
            var child = node.children[j] as HTMLElement
            if (!isMarkerBranch(child, marker)) walk(child)
        }
    }
    walk(root)
    return best
}

function nodeMatchesNames(node: HTMLElement, names: string[]): boolean {
    var attrs = ["data-framer-name", "data-framer-component", "aria-label"]
    for (var a = 0; a < attrs.length; a++) {
        var val = (node.getAttribute(attrs[a]) || "").toLowerCase()
        if (!val) continue
        for (var n = 0; n < names.length; n++) {
            if (val === names[n] || val.indexOf(names[n]) !== -1) return true
        }
    }
    // Check trimmed text content (only if short — avoids matching paragraphs)
    var text = (node.textContent || "").trim().toLowerCase()
    if (text.length > 0 && text.length < 60) {
        for (var n = 0; n < names.length; n++) {
            if (text === names[n]) return true
        }
    }
    return false
}

function elementMatchesNames(el: HTMLElement, names: string[]): boolean {
    // Check element itself
    if (nodeMatchesNames(el, names)) return true
    // Check all descendants
    try {
        var all = el.querySelectorAll("*")
        for (var i = 0; i < all.length; i++) {
            if (nodeMatchesNames(all[i] as HTMLElement, names)) return true
        }
    } catch (e) {}
    return false
}

// Split text elements into individual words for per-word animation.
// Walks into text containers and wraps each whitespace-delimited word
// in an inline-block span so it can be animated independently.
function splitTextWords(targets: HTMLElement[]): HTMLElement[] {
    var result: HTMLElement[] = []
    for (var i = 0; i < targets.length; i++) {
        var el = targets[i]

        // Already split? Just collect existing word spans (avoids infinite re-split)
        var existing = el.querySelectorAll("[data-choreo-word]")
        if (existing.length > 0) {
            for (var ex = 0; ex < existing.length; ex++) {
                result.push(existing[ex] as HTMLElement)
            }
            continue
        }

        // Collect all text-bearing leaf nodes inside the element
        var textLeaves: HTMLElement[] = []
        var paragraphs = el.querySelectorAll("p, span, a, em, strong, b, i, u, h1, h2, h3, h4, h5, h6")
        if (paragraphs.length > 0) {
            for (var p = 0; p < paragraphs.length; p++) {
                var pEl = paragraphs[p] as HTMLElement
                // Only take leaf-level text containers
                if (pEl.children.length === 0 ||
                    (pEl.children.length > 0 && pEl.querySelector("br") != null)) {
                    textLeaves.push(pEl)
                }
            }
        }
        if (textLeaves.length === 0) textLeaves.push(el)

        var wordCount = 0
        for (var tl = 0; tl < textLeaves.length; tl++) {
            var leaf = textLeaves[tl]
            var nodes = leaf.childNodes
            var fragments: Node[] = []
            for (var cn = 0; cn < nodes.length; cn++) {
                var nd = nodes[cn]
                if (nd.nodeType === 3) { // Text node
                    var text = nd.textContent || ""
                    var parts = text.match(/\S+|\s+/g) || []
                    for (var wp = 0; wp < parts.length; wp++) {
                        if (/^\s+$/.test(parts[wp])) {
                            fragments.push(document.createTextNode(parts[wp]))
                        } else {
                            var wordSpan = document.createElement("span")
                            wordSpan.style.display = "inline-block"
                            wordSpan.style.whiteSpace = "nowrap"
                            wordSpan.setAttribute("data-choreo-word", "1")
                            wordSpan.textContent = parts[wp]
                            fragments.push(wordSpan)
                            wordCount++
                        }
                    }
                } else if (nd.nodeType === 1 && (nd as HTMLElement).tagName === "BR") {
                    fragments.push(nd.cloneNode(true))
                } else {
                    var inlineSpan = document.createElement("span")
                    inlineSpan.style.display = "inline-block"
                    inlineSpan.setAttribute("data-choreo-word", "1")
                    inlineSpan.appendChild(nd.cloneNode(true))
                    fragments.push(inlineSpan)
                    wordCount++
                }
            }
            while (leaf.firstChild) leaf.removeChild(leaf.firstChild)
            for (var fi = 0; fi < fragments.length; fi++) {
                leaf.appendChild(fragments[fi])
            }
        }

        if (wordCount > 0) {
            var wordSpans = el.querySelectorAll("[data-choreo-word]")
            for (var ws = 0; ws < wordSpans.length; ws++) {
                result.push(wordSpans[ws] as HTMLElement)
            }
            el.style.overflow = "visible"
        } else {
            result.push(el)
        }
    }
    return result
}

function splitTextChars(targets: HTMLElement[]): HTMLElement[] {
    var result: HTMLElement[] = []
    for (var i = 0; i < targets.length; i++) {
        var el = targets[i]

        // Already split? Collect existing char spans
        var existing = el.querySelectorAll("[data-choreo-char]")
        if (existing.length > 0) {
            for (var ex = 0; ex < existing.length; ex++) {
                result.push(existing[ex] as HTMLElement)
            }
            continue
        }

        // Collect all text-bearing leaf nodes inside the element
        var textLeaves: HTMLElement[] = []
        var paragraphs = el.querySelectorAll("p, span, a, em, strong, b, i, u, h1, h2, h3, h4, h5, h6")
        if (paragraphs.length > 0) {
            for (var p = 0; p < paragraphs.length; p++) {
                var pEl = paragraphs[p] as HTMLElement
                if (pEl.children.length === 0 ||
                    (pEl.children.length > 0 && pEl.querySelector("br") != null)) {
                    textLeaves.push(pEl)
                }
            }
        }
        if (textLeaves.length === 0) textLeaves.push(el)

        var charCount = 0
        for (var tl = 0; tl < textLeaves.length; tl++) {
            var leaf = textLeaves[tl]
            var nodes = leaf.childNodes
            var fragments: Node[] = []
            for (var cn = 0; cn < nodes.length; cn++) {
                var nd = nodes[cn]
                if (nd.nodeType === 3) { // Text node
                    var text = nd.textContent || ""
                    for (var ci = 0; ci < text.length; ci++) {
                        var ch = text[ci]
                        if (ch === " " || ch === "\t") {
                            // Wrap spaces in a non-animated span to
                            // preserve word spacing in inline-block flow
                            var spaceSpan = document.createElement("span")
                            spaceSpan.style.display = "inline-block"
                            spaceSpan.style.width = "0.3em"
                            spaceSpan.innerHTML = "&nbsp;"
                            fragments.push(spaceSpan)
                        } else if (ch === "\n" || ch === "\r") {
                            fragments.push(document.createElement("br"))
                        } else {
                            var charSpan = document.createElement("span")
                            charSpan.style.display = "inline-block"
                            charSpan.setAttribute("data-choreo-char", "1")
                            charSpan.textContent = ch
                            fragments.push(charSpan)
                            charCount++
                        }
                    }
                } else if (nd.nodeType === 1 && (nd as HTMLElement).tagName === "BR") {
                    fragments.push(nd.cloneNode(true))
                } else {
                    // Non-text inline element (e.g. <em>, <strong>)
                    // Recurse into its text content for char splitting
                    var inlineEl = nd as HTMLElement
                    var inlineText = inlineEl.textContent || ""
                    for (var ic = 0; ic < inlineText.length; ic++) {
                        var ich = inlineText[ic]
                        if (ich === " " || ich === "\t") {
                            var iSpaceSpan = document.createElement("span")
                            iSpaceSpan.style.display = "inline-block"
                            iSpaceSpan.style.width = "0.3em"
                            iSpaceSpan.innerHTML = "&nbsp;"
                            fragments.push(iSpaceSpan)
                        } else {
                            var iCharSpan = document.createElement("span")
                            iCharSpan.style.display = "inline-block"
                            iCharSpan.setAttribute("data-choreo-char", "1")
                            // Inherit the inline element's styling
                            iCharSpan.style.fontWeight = window.getComputedStyle(inlineEl).fontWeight
                            iCharSpan.style.fontStyle = window.getComputedStyle(inlineEl).fontStyle
                            iCharSpan.style.textDecoration = window.getComputedStyle(inlineEl).textDecoration
                            iCharSpan.textContent = ich
                            fragments.push(iCharSpan)
                            charCount++
                        }
                    }
                }
            }
            while (leaf.firstChild) leaf.removeChild(leaf.firstChild)
            for (var fi = 0; fi < fragments.length; fi++) {
                leaf.appendChild(fragments[fi])
            }
        }

        if (charCount > 0) {
            var charSpans = el.querySelectorAll("[data-choreo-char]")
            for (var cs = 0; cs < charSpans.length; cs++) {
                result.push(charSpans[cs] as HTMLElement)
            }
            el.style.overflow = "visible"
        } else {
            result.push(el)
        }
    }
    return result
}

// Split text elements into individual lines for per-line animation.
// Framer rich text renders each line as <p> inside a container.
// Plain text may use <br> tags — we wrap text runs between <br>s in spans.
function splitTextTargets(targets: HTMLElement[]): HTMLElement[] {
    var result: HTMLElement[] = []
    for (var i = 0; i < targets.length; i++) {
        var el = targets[i]

        // Look for <p> children (Framer rich text)
        var paragraphs = el.querySelectorAll(":scope > p, :scope > div > p")
        if (paragraphs.length > 1) {
            for (var j = 0; j < paragraphs.length; j++) {
                result.push(paragraphs[j] as HTMLElement)
            }
            // Set overflow visible on parent so animated lines aren't clipped
            el.style.overflow = "visible"
            continue
        }

        // Look for <br> tags (simple text)
        var brs = el.querySelectorAll("br")
        if (brs.length > 0) {
            // Walk child nodes, grouping text/inline nodes between <br>s
            var wrapper = el.firstElementChild || el
            var lineNodes: Node[][] = [[]]
            for (var c = 0; c < wrapper.childNodes.length; c++) {
                var node = wrapper.childNodes[c]
                if (node.nodeName === "BR") {
                    lineNodes.push([])
                } else {
                    lineNodes[lineNodes.length - 1].push(node)
                }
            }
            // Only split if we got multiple non-empty lines
            var nonEmpty = lineNodes.filter(function (ln) {
                return ln.some(function (n) {
                    return (n.textContent || "").trim().length > 0
                })
            })
            if (nonEmpty.length > 1) {
                // Clear the container and rebuild with wrapped lines
                while (wrapper.firstChild) wrapper.removeChild(wrapper.firstChild)
                for (var li = 0; li < lineNodes.length; li++) {
                    var span = document.createElement("span")
                    span.style.display = "block"
                    for (var ni = 0; ni < lineNodes[li].length; ni++) {
                        span.appendChild(lineNodes[li][ni])
                    }
                    wrapper.appendChild(span)
                    result.push(span)
                }
                el.style.overflow = "visible"
                continue
            }
        }

        // Not a multi-line text element — keep as-is
        result.push(el)
    }
    return result
}

function collectTargets(
    parent: HTMLElement,
    marker: HTMLElement,
    scanMode: string,
    excludeSelector?: string,
    splitText?: string
): HTMLElement[] {
    var result: HTMLElement[] = []

    // ── Auto CMS / collection detection ──
    // Walk up from the marker looking for a collection pattern:
    //  1. Children share the same data-framer-name (named CMS items)
    //  2. Children's first named descendant shares the same name (grid wrappers)
    //  3. Children are structurally identical: same tag + same child count
    //     (handles masonry/grid where no data-framer-name is set)
    // Picks the ancestor with the MOST homogeneous children.
    var cmsAncestor: HTMLElement | null = null
    var cmsAncestorCount = 0
    if (scanMode === "siblings" || scanMode === "cmsItems" || scanMode === "cmsNested") {
        var walkNode: HTMLElement | null = marker.parentElement
        var maxWalk = 15
        var walkDepth = 0
        while (walkNode && maxWalk > 0) {
            walkDepth++
            var wChildren: HTMLElement[] = []
            for (var wc = 0; wc < walkNode.children.length; wc++) {
                var wChild = walkNode.children[wc] as HTMLElement
                if (!isMarkerBranch(wChild, marker)) wChildren.push(wChild)
            }

            if (wChildren.length >= 2) {
                var detected = false

                // Strategy 1: direct children share data-framer-name
                var directName = wChildren[0].getAttribute("data-framer-name")
                if (directName) {
                    var allDirect = true
                    for (var wn = 1; wn < wChildren.length; wn++) {
                        if (wChildren[wn].getAttribute("data-framer-name") !== directName) {
                            allDirect = false
                            break
                        }
                    }
                    if (allDirect) detected = true
                }

                // Strategy 2: wrapper children's first named descendant matches
                if (!detected) {
                    var innerName: string | null = null
                    var allInner = true
                    for (var wi = 0; wi < wChildren.length; wi++) {
                        var named = wChildren[wi].querySelector("[data-framer-name]") as HTMLElement | null
                        var nm = named ? named.getAttribute("data-framer-name") : null
                        if (!nm) { allInner = false; break }
                        if (innerName === null) innerName = nm
                        else if (nm !== innerName) { allInner = false; break }
                    }
                    if (allInner && innerName) detected = true
                }

                // Strategy 3: structural homogeneity — all children are
                // the same tag with the same number of children.
                // Catches masonry/grid CMS where items have no names.
                if (!detected) {
                    var firstTag = wChildren[0].tagName
                    var firstCh = wChildren[0].children.length
                    var allStruct = firstCh > 0 // require at least 1 grandchild
                    for (var ws = 1; ws < wChildren.length; ws++) {
                        if (wChildren[ws].tagName !== firstTag ||
                            wChildren[ws].children.length !== firstCh) {
                            allStruct = false
                            break
                        }
                    }
                    if (allStruct) detected = true
                }

                // Prefer the ancestor with the most children (collection level)
                if (detected && wChildren.length > cmsAncestorCount) {
                    cmsAncestor = walkNode
                    cmsAncestorCount = wChildren.length
                }

                // Strategy 4: relaxed "most children" fallback.
                // In masonry layouts, items are split into columns. Each
                // column has ≥2 items that aren't structurally identical
                // (e.g. different child counts). Since each CMS item has
                // its own Page Choreographer instance, finding just the
                // column siblings is enough — all instances together cover
                // every item. Only use this if no strict match was found.
                // Require depth ≥ 2 to skip the card's own content level
                // (Image, Title, etc.) and only match at the column level.
                // Also require that this node's parent has ≥2 children —
                // a parent with 1 child means we're inside a card wrapper,
                // not at a real collection level.
                if (!detected && wChildren.length >= 2 && !cmsAncestor && walkDepth >= 2) {
                    // Only allow Strategy 4 at or BELOW the parent level.
                    // Walking above parent means grouping parent's siblings
                    // as a collection — those are structural containers,
                    // not CMS items.  parent.contains(walkNode) is true
                    // when walkNode is parent itself or inside parent.
                    var s4InScope = parent.contains(walkNode)
                    var s4ParentOk = s4InScope && walkNode.parentElement &&
                        walkNode.parentElement.children.length >= 2
                    if (s4ParentOk) {
                        // Require children to at least share the same tag
                        var fallbackTag = wChildren[0].tagName
                        var sameTag = true
                        for (var wf = 1; wf < wChildren.length; wf++) {
                            if (wChildren[wf].tagName !== fallbackTag) {
                                sameTag = false
                                break
                            }
                        }
                        if (sameTag) {
                            cmsAncestor = walkNode
                            cmsAncestorCount = wChildren.length
                        }
                    }
                }
            }
            walkNode = walkNode.parentElement
            maxWalk--
        }
    }

    // ── Reject CMS ancestor above the parent level ──
    // If the detected cmsAncestor is ABOVE parent in the DOM tree,
    // it means we'd be grouping parent's siblings as a collection.
    // Those are structural containers, not CMS items.  Drop the
    // match and let the fallback (direct siblings) handle it.
    if (cmsAncestor && !parent.contains(cmsAncestor)) {
        cmsAncestor = null
        cmsAncestorCount = 0
    }

    if (cmsAncestor) {
        // Check if the CMS ancestor is a masonry column — i.e., its parent
        // has multiple same-tag children. In masonry layouts, Framer splits
        // items into column wrappers. We need to collect from ALL columns
        // so every item is targeted regardless of column distribution.
        var colParent = cmsAncestor.parentElement
        var isMasonryColumn = false
        if (colParent && colParent.children.length >= 2) {
            var myTag = cmsAncestor.tagName
            var allColsSameTag = true
            for (var cs = 0; cs < colParent.children.length; cs++) {
                if ((colParent.children[cs] as HTMLElement).tagName !== myTag) {
                    allColsSameTag = false
                    break
                }
            }
            isMasonryColumn = allColsSameTag
        }

        if (isMasonryColumn) {
            // Masonry: collect items from ALL sibling columns.
            // Include ALL items (even the one containing this marker)
            // so every item is targeted regardless of which instance
            // finds it.  Identical animations from multiple instances
            // compose harmlessly for scroll-driven animations.
            for (var mc = 0; mc < colParent!.children.length; mc++) {
                var column = colParent!.children[mc] as HTMLElement
                for (var mi = 0; mi < column.children.length; mi++) {
                    result.push(column.children[mi] as HTMLElement)
                }
            }
        } else {
            // Single collection — use its children as targets
            for (var cj = 0; cj < cmsAncestor.children.length; cj++) {
                result.push(cmsAncestor.children[cj] as HTMLElement)
            }
        }
    } else {
        // No CMS collection found — try masonry grid detection:
        // walk up looking for a grid container whose children are columns
        // (same-tag siblings each containing multiple same-tag items).
        var masonryGrid: HTMLElement | null = null
        var mWalk: HTMLElement | null = marker.parentElement
        var mMaxWalk = 15
        while (mWalk && mMaxWalk > 0 && parent.contains(mWalk)) {
            if (mWalk.children.length >= 2) {
                var mColTag = (mWalk.children[0] as HTMLElement).tagName
                var mAllSame = true
                var mTotalItems = 0
                var mMaxColItems = 0
                for (var mg = 0; mg < mWalk.children.length; mg++) {
                    var mCol = mWalk.children[mg] as HTMLElement
                    if (mCol.tagName !== mColTag) { mAllSame = false; break }
                    mTotalItems += mCol.children.length
                    if (mCol.children.length > mMaxColItems) mMaxColItems = mCol.children.length
                }
                // Columns must share same tag, collectively have ≥3 items,
                // and at least one column must have ≥2 children (to
                // distinguish real masonry columns from card-internal
                // wrappers which typically have 1 child each).
                if (mAllSame && mTotalItems >= 3 && mMaxColItems >= 2) {
                    masonryGrid = mWalk
                    break
                }
            }
            mWalk = mWalk.parentElement
            mMaxWalk--
        }

        if (masonryGrid) {
            // Collect items from all columns (include all, even marker branch)
            for (var gc = 0; gc < masonryGrid.children.length; gc++) {
                var gCol = masonryGrid.children[gc] as HTMLElement
                for (var gi = 0; gi < gCol.children.length; gi++) {
                    result.push(gCol.children[gi] as HTMLElement)
                }
            }
        } else {
            // Final fallback — direct siblings.
            // Skip siblings that contain OTHER PC markers — those are
            // structural containers with their own instances, not targets.
            for (var k = 0; k < parent.children.length; k++) {
                var el = parent.children[k] as HTMLElement
                if (isMarkerBranch(el, marker)) continue
                if (el.querySelector("[data-choreo-marker]")) continue
                result.push(el)
            }
        }
    }
    // Filter out elements whose layer name matches any excluded name.
    // User types comma-separated layer names like "Load More, Footer".
    // Checks data-framer-name, data-framer-component, aria-label, and
    // trimmed text content — on the element itself and its descendants.
    if (excludeSelector && excludeSelector.trim()) {
        var names = excludeSelector.split(",").map(function (n) {
            return n.trim().toLowerCase()
        }).filter(function (n) { return n.length > 0 })

        if (names.length > 0) {
            result = result.filter(function (el) {
                return !elementMatchesNames(el, names)
            })
        }
    }
    // Expand text elements into individual lines or words
    if (splitText === "lines") {
        result = splitTextTargets(result)
    } else if (splitText === "words") {
        result = splitTextWords(result)
    } else if (splitText === "chars") {
        result = splitTextChars(result)
    }
    return result
}

// ─── GSAP CDN Loader ─────────────────────────────────────────────────────────
// Loads gsap + ScrollTrigger from CDN (standard license).
// Uses fetch + new Function to bypass CSP script-src restrictions
// in Framer's sandboxed preview iframe (script tags are blocked).
// Multiple callers share a single load promise.

var GSAP_CDN = "https://cdn.jsdelivr.net/npm/gsap@3.12/dist/gsap.min.js"
var ST_CDN = "https://cdn.jsdelivr.net/npm/gsap@3.12/dist/ScrollTrigger.min.js"

function loadGSAP(): Promise<{ gsap: any; ScrollTrigger: any }> {
    var key = "__choreoGsapLoad"
    if ((window as any)[key]) return (window as any)[key]
    ;(window as any)[key] = new Promise<{ gsap: any; ScrollTrigger: any }>(function (resolve, reject) {
        // If already loaded (another plugin, etc.), skip fetch
        if ((window as any).gsap && (window as any).ScrollTrigger) {
            resolve({ gsap: (window as any).gsap, ScrollTrigger: (window as any).ScrollTrigger })
            return
        }
        console.log("[Choreo] Loading GSAP from CDN...")
        // fetch + new Function bypasses CSP script-src restrictions
        // that block <script> tag injection in Framer's preview iframe
        fetch(GSAP_CDN)
            .then(function (r) {
                if (!r.ok) throw new Error("GSAP fetch failed: " + r.status)
                return r.text()
            })
            .then(function (gsapCode) {
                new Function(gsapCode)()
                return fetch(ST_CDN)
            })
            .then(function (r) {
                if (!r.ok) throw new Error("ScrollTrigger fetch failed: " + r.status)
                return r.text()
            })
            .then(function (stCode) {
                new Function(stCode)()
                var g = (window as any).gsap
                var ST = (window as any).ScrollTrigger
                if (!g || !ST) {
                    reject(new Error("GSAP globals not found after eval"))
                    return
                }
                g.registerPlugin(ST)
                console.log("[Choreo] GSAP + ScrollTrigger loaded successfully")
                resolve({ gsap: g, ScrollTrigger: ST })
            })
            .catch(function (err) {
                console.error("[Choreo] GSAP CDN load failed:", err)
                reject(err)
            })
    })
    return (window as any)[key]
}

// ─── Component ───────────────────────────────────────────────────────────────

var groupCounter = 0
// Global flag: suppresses ALL MutationObservers across PC instances
// during structural DOM changes (pin container, wrapper creation).
// Prevents cross-instance infinite re-render loops.
var choreoMutGlobalSuppress = false
function useStableGroupId() {
    var ref = React.useRef("")
    if (ref.current === "") {
        groupCounter += 1
        ref.current = "scan-" + groupCounter
    }
    return ref.current
}

export default function PageChoreographer(props: any) {
    var {
        scanMode = "siblings",
        excludeSelector = "",
        splitText: splitTextRaw = "none",
        enterPreset = "fadeUp",
        exitPreset = "riseWave",
        enterEnabled = true,
        exitEnabled = true,
        mobileEnabled = true,
        trigger = "onLoad",
        viewOffset = 100,
        viewRepeat = false,
        waitForParent = false,
        scrollLength = 500,
        scrollStart = "bottom",
        scrollStartOffset = 0,
        scrollPin = true,
        pinPriority = false,
        scrollOnce = false,
        sortPriority = 0,
        priorityGap = 0,
        delayOffset = 0,
        duration = 0.6,
        stagger = 0.06,
        easingPreset = "smooth",
        staggerDirection = "leftToRight",
        distance = 40,
        enterMaskDirection = "left",
        exitMaskDirection = "left",
        maskStart = 0,
        maskPreview = false,
        maskViewportClip = false,
        maskViewportPadding = 0,
        maskShiftX = 0,
        maskShiftY = 0,
        maskOpacity = 1,
        blurAmount = 8,
        scaleFrom = 0.92,
        enterScaleDirection = "center",
        scaleOpacity = 0,
        exitTimeout = 3,
        enterDelay = 0.05,
        // Custom enter
        enterOpacity = 0,
        enterOffsetX = 0,
        enterOffsetY = 40,
        enterScale = 1,
        enterRotateX = 0,
        enterRotateY = 0,
        enterRotateZ = 0,
        enterBlur = 0,
        enterPerspective = 1000,
        // Custom exit
        exitOpacity = 0,
        exitOffsetX = 0,
        exitOffsetY = -40,
        exitScale = 1,
        exitRotateX = 0,
        exitRotateY = 0,
        exitRotateZ = 0,
        exitBlur = 0,
        exitPerspective = 1000,
        style,
    } = props

    // Backward compat: old boolean splitText (true → "lines", false → "none")
    var splitText = splitTextRaw === true ? "lines" : splitTextRaw === false ? "none" : splitTextRaw

    var markerRef = React.useRef(null) as React.MutableRefObject<HTMLDivElement | null>
    var baseId = useStableGroupId()
    var registeredIds = React.useRef<string[]>([])
    var initialTargetCount = React.useRef(0)
    var rescanState = React.useState(0)
    var rescanGeneration = rescanState[0]
    var setRescanGeneration = rescanState[1]

    function unregisterAll(store: any) {
        if (!store) return
        var ids = registeredIds.current
        for (var i = 0; i < ids.length; i++) {
            store.unregisterTarget(ids[i])
        }
        registeredIds.current = []
    }

    function registerElements(elements: HTMLElement[], store: any) {
        var easing = EASING_MAP[easingPreset] || EASING_MAP.smooth

        for (var i = 0; i < elements.length; i++) {
            var el = elements[i]
            var targetId = baseId + "-" + i

            store.registerTarget({
                id: targetId,
                ref: { current: el },
                groupId: baseId,
                enterPreset: enterPreset,
                exitPreset: exitPreset,
                enterEnabled: enterEnabled,
                exitEnabled: exitEnabled,
                sortPriority: sortPriority,
                priorityGap: priorityGap,
                delayOffset: delayOffset,
                mobileEnabled: mobileEnabled,
                trigger: trigger,
                duration: duration,
                stagger: stagger,
                easing: easing,
                staggerDirection: staggerDirection,
                distance: distance,
                enterMaskDirection: enterMaskDirection,
                exitMaskDirection: exitMaskDirection,
                maskStart: maskStart,
                maskShiftX: maskShiftX,
                maskShiftY: maskShiftY,
                maskOpacity: maskOpacity,
                blurAmount: blurAmount,
                scaleFrom: scaleFrom,
                enterScaleDirection: enterScaleDirection,
                scaleOpacity: scaleOpacity,
                enterOpacity: enterOpacity,
                enterOffsetX: enterOffsetX,
                enterOffsetY: enterOffsetY,
                enterScale: enterScale,
                enterRotateX: enterRotateX,
                enterRotateY: enterRotateY,
                enterRotateZ: enterRotateZ,
                enterBlur: enterBlur,
                enterPerspective: enterPerspective,
                exitOpacity: exitOpacity,
                exitOffsetX: exitOffsetX,
                exitOffsetY: exitOffsetY,
                exitScale: exitScale,
                exitRotateX: exitRotateX,
                exitRotateY: exitRotateY,
                exitRotateZ: exitRotateZ,
                exitBlur: exitBlur,
                exitPerspective: exitPerspective,
            })

            registeredIds.current.push(targetId)
        }
    }

    // useLayoutEffect ensures GSAP pin-spacer cleanup runs
    // synchronously BEFORE React reconciles the DOM.  With
    // useEffect, React tries removeChild on elements that GSAP
    // has reparented into pin-spacers, causing a crash.
    React.useLayoutEffect(function () {
        var store = getStore()
        var marker = markerRef.current
        if (!store || !marker) return

        store.setupLinkInterception(exitTimeout)

        // Only schedule global enter for "onLoad" groups
        if (trigger === "onLoad") {
            store.scheduleEnter(enterDelay)
        }

        var parent = findRealParent(marker)
        if (!parent) return

        unregisterAll(store)

        var targets = collectTargets(parent, marker, scanMode, excludeSelector, splitText)
        registerElements(targets, store)
        // Register parent as a group parent so choreo-done is dispatched
        // on the container element, not just on individual targets.
        // This ensures child PCs in sibling stacks receive the event.
        store.registerGroupParent(baseId, parent)
        // Delayed re-scan: masonry/grid layouts restructure the DOM
        // after initial render.  If re-scan finds MORE targets, force
        // the entire useEffect to re-run (via state update) so the full
        // pipeline (pre-hiding, triggers, animations) is rebuilt.
        initialTargetCount.current = targets.length
        var rescanTimer = setTimeout(function () {
            if (!marker || !marker.parentElement) return
            var p2 = findRealParent(marker)
            if (!p2) return
            var t2 = collectTargets(p2, marker, scanMode, excludeSelector, splitText)
            if (t2.length > initialTargetCount.current) {
                // Force full useEffect re-run — cleanup runs first,
                // then new setup with correct targets
                setRescanGeneration(function (g: number) { return g + 1 })
            }
        }, 400)

        // Pre-hide elements that will animate in (inView / onLoad) so they
        // don't flash visible before the animation starts. Only in preview —
        // on canvas elements should stay visible for editing.
        // Uses visibility:hidden which doesn't interfere with WAAPI animations
        // and is cleanly removed when the animation starts.
        //
        // IMPORTANT: For onScroll trigger, pre-hiding is deferred to the
        // scroll setup rAF (after the section ownership check).  This
        // prevents follower instances from hiding targets they'll never
        // reveal (because they bail out when another instance owns the
        // section).
        var preHiddenEls: HTMLElement[] = []
        var preHideStyleTag: HTMLStyleElement | null = null
        if ((trigger === "inView" || trigger === "onLoad") && enterEnabled &&
            RenderTarget.current() !== RenderTarget.canvas) {

            for (var phi = 0; phi < targets.length; phi++) {
                var phEl = targets[phi]
                if (!phEl) continue
                phEl.style.setProperty("visibility", "hidden")
                preHiddenEls.push(phEl)
            }
        }

        // MutationObserver for dynamic CMS content
        // Observe a few levels up to catch CMS collection changes
        var observeTarget: HTMLElement = parent
        var obsWalk: HTMLElement | null = parent
        for (var obsUp = 0; obsUp < 4 && obsWalk; obsUp++) {
            if (obsWalk.parentElement) obsWalk = obsWalk.parentElement
        }
        if (obsWalk) observeTarget = obsWalk

        var mutObs: MutationObserver | null = null
        var mutSuppressed = false // suppress during our own DOM mutations (e.g. word split)
        try {
            if (typeof MutationObserver !== "undefined") {
                mutObs = new MutationObserver(function (mutations) {
                    if (mutSuppressed || choreoMutGlobalSuppress) return
                    // Ignore mutations caused by Page Choreographer's own
                    // structural DOM changes (pin containers, spacers,
                    // wrappers, word splits). These would otherwise trigger
                    // infinite re-render loops between multiple PC instances.
                    var dominated = true
                    for (var mi = 0; mi < mutations.length; mi++) {
                        var m = mutations[mi]
                        for (var ai = 0; ai < m.addedNodes.length; ai++) {
                            var an = m.addedNodes[ai] as HTMLElement
                            if (an.nodeType === 3) continue // text nodes
                            if (an.nodeType === 1 && an.getAttribute) {
                                // Skip our own structural elements
                                if (an.getAttribute("data-choreo-word")) continue
                                if (an.getAttribute("data-choreo-pin-container")) continue
                                if (an.getAttribute("data-choreo-spacer")) continue
                                if (an.getAttribute("data-choreo-marker")) continue
                            }
                            dominated = false
                            break
                        }
                        if (!dominated) break
                        for (var ri = 0; ri < m.removedNodes.length; ri++) {
                            var rn = m.removedNodes[ri] as HTMLElement
                            if (rn.nodeType === 3) continue // text nodes
                            if (rn.nodeType === 1 && rn.getAttribute) {
                                if (rn.getAttribute("data-choreo-pin-container")) continue
                                if (rn.getAttribute("data-choreo-spacer")) continue
                                if (rn.getAttribute("data-choreo-marker")) continue
                            }
                            dominated = false
                            break
                        }
                        if (!dominated) break
                    }
                    if (dominated && mutations.length > 0) return

                    var s = getStore()
                    if (!s || !marker) return
                    var p = findRealParent(marker)
                    if (!p) return
                    unregisterAll(s)
                    mutSuppressed = true
                    var t = collectTargets(p, marker, scanMode, excludeSelector, splitText)
                    mutSuppressed = false
                    registerElements(t, s)
                })
                mutObs.observe(observeTarget, { childList: true, subtree: true })
            }
        } catch (e) {}

        // IntersectionObserver for "inView" trigger
        var intObs: IntersectionObserver | null = null
        var parentDoneHandler: ((e: Event) => void) | null = null
        var parentResetHandler: ((e: Event) => void) | null = null
        if (trigger === "inView" && waitForParent && parent) {
            // Wait for an ancestor PC to finish its animation before playing.
            // Listen on document (events bubble up from the parent PC's targets).
            var hasPlayed = false
            parentDoneHandler = function (e: Event) {
                var src = e.target as HTMLElement | null
                if (!src || !parent) return
                if (!src.contains(parent) && !parent.contains(src)) return
                var s = getStore()
                if (s && !hasPlayed) {
                    hasPlayed = true
                    s.playEnterGroup(baseId)
                }
            }
            parentResetHandler = function (e: Event) {
                var src = e.target as HTMLElement | null
                if (!src || !parent) return
                if (!src.contains(parent) && !parent.contains(src)) return
                if (hasPlayed && viewRepeat) {
                    hasPlayed = false
                    var s2 = getStore()
                    if (s2) {
                        s2.cancelPendingGroup(baseId)
                        s2.resetGroup(baseId)
                    }
                    // Immediately re-hide targets for replay
                    for (var rh = 0; rh < preHiddenEls.length; rh++) {
                        preHiddenEls[rh].style.setProperty("visibility", "hidden")
                    }
                }
            }
            document.addEventListener("choreo-done", parentDoneHandler)
            document.addEventListener("choreo-reset", parentResetHandler)
        } else if (trigger === "inView" && typeof IntersectionObserver !== "undefined") {
            var isVisible = false
            try {
                intObs = new IntersectionObserver(
                    function (entries) {
                        for (var e = 0; e < entries.length; e++) {
                            if (entries[e].isIntersecting && !isVisible) {
                                isVisible = true
                                var s = getStore()
                                if (s) s.playEnterGroup(baseId)
                                // If not repeating, stop observing
                                if (!viewRepeat && intObs) intObs.disconnect()
                            } else if (!entries[e].isIntersecting && isVisible && viewRepeat) {
                                // Element left viewport — clear from WeakSet so it replays
                                isVisible = false
                                var s2 = getStore()
                                if (s2) {
                                    s2.cancelPendingGroup(baseId)
                                    s2.resetGroup(baseId)
                                }
                                // Notify child PCs to reset for replay
                                if (parent) {
                                    parent.dispatchEvent(new CustomEvent("choreo-reset", {
                                        bubbles: true,
                                        detail: { groupId: baseId },
                                    }))
                                }
                                // Also dispatch on group parents for sibling-subtree children
                                if (s2) {
                                    var resetGps = s2.getGroupParents(baseId)
                                    if (resetGps) {
                                        for (var rgp = 0; rgp < resetGps.length; rgp++) {
                                            resetGps[rgp].dispatchEvent(new CustomEvent("choreo-reset", {
                                                bubbles: true,
                                                detail: { groupId: baseId },
                                            }))
                                        }
                                    }
                                }
                            }
                        }
                    },
                    { rootMargin: "0px 0px " + viewOffset + "px 0px" }
                )
                intObs.observe(parent)
            } catch (e) {}
        }

        // ─── Scroll-scrub trigger (GSAP ScrollTrigger) ─────────────────────
        // Uses GSAP ScrollTrigger for pinning and scroll progress.
        // WAAPI animations are kept for the actual element animations.
        var scrollAnims: Animation[] = []
        var scrollAnimFinalStyles: Array<{ el: HTMLElement; to: Record<string, string> }> = []
        var scrubStyleTag: HTMLStyleElement | null = null
        var scrollSafetyTimer = 0
        var gsapCtx: any = null
        var gsapScrollTrigger: any = null
        var scrollOverflowAncestors: Array<{ el: HTMLElement; orig: string }> = []
        var parentOrigOverflow = ""
        var gsapMounted = true
        var _scrollGateCleanup: (() => void) | null = null

        var isPreview = RenderTarget.current() !== RenderTarget.canvas

        if (trigger === "onScroll" && parent && isPreview && targets.length > 0) {
            console.log("[Choreo] SCROLL SETUP:", baseId, "trigger:", trigger, "scrollPin:", scrollPin, "targets:", targets.length, "parent:", parent.tagName + "#" + parent.id)

            // ── CMS bail-out ──
            // When multiple PCs live inside the same parent (CMS
            // collection items that duplicate a template), only one
            // should create a pin trigger.  But PCs in DIFFERENT
            // parents (e.g. two separate stacks on the page) must
            // each get their own trigger, even if findPinSection()
            // resolves to the same high-level ancestor.
            //
            // Check: does the pin section already have an owner AND
            // is there another PC marker in MY immediate parent?
            // Both must be true for CMS bail-out.
            var earlyPinSection = findPinSection(parent)
            if (scrollPin && earlyPinSection && earlyPinSection.hasAttribute("data-choreo-gsap-pin") && !pinPriority) {
                // Only bail if there's another PC in the SAME parent
                var sameParentMarkers = parent.querySelectorAll("[data-choreo-marker]")
                var hasSiblingPC = false
                for (var om = 0; om < sameParentMarkers.length; om++) {
                    if (sameParentMarkers[om] !== marker && !sameParentMarkers[om].hasAttribute("data-choreo-wait")) {
                        hasSiblingPC = true
                        break
                    }
                }
                // Also verify the existing pin owner is NOT in our
                // parent — if it is, we're a CMS duplicate.  If it's
                // in a different parent, we're a separate section.
                var existingOwner = earlyPinSection.getAttribute("data-choreo-gsap-pin") || ""
                var ownerMarker = earlyPinSection.querySelector("[data-choreo-marker='" + existingOwner + "']") ||
                                  document.querySelector("[data-choreo-marker='" + existingOwner + "']")
                var ownerInSameParent = ownerMarker ? parent.contains(ownerMarker) : false
                if (hasSiblingPC && ownerInSameParent) {
                    console.log("[Choreo] CMS bail-out:", baseId, "— another PC in same parent already owns pin")
                    return function () { unregisterAll(getStore()) }
                }
            }

            // ── Above-fold detection (early) ──
            // Check BEFORE pre-hiding: if the section is already in
            // the viewport at page load, do NOT hide its targets.
            // Hiding above-fold content causes a blank screen because
            // the WAAPI animations at progress 0 also make elements
            // invisible (opacity:0, translateY, etc.).
            var triggerCheckEl = (scrollPin && earlyPinSection) ? earlyPinSection : parent
            var earlyAboveFold = triggerCheckEl.getBoundingClientRect().top < window.innerHeight

            // ── Pre-hiding ──
            var existingScrub = document.querySelector("style[data-choreo-style='scrub']") as HTMLStyleElement
            if (existingScrub) {
                scrubStyleTag = existingScrub
            } else {
                scrubStyleTag = document.createElement("style")
                scrubStyleTag.setAttribute("data-choreo-style", "scrub")
                scrubStyleTag.textContent = "[data-choreo-scrubbing] { transition: none !important; pointer-events: none !important; }"
                document.head.appendChild(scrubStyleTag)
            }

            if (enterEnabled && !earlyAboveFold) {
                var existingHide = document.querySelector("style[data-choreo-style='hide']") as HTMLStyleElement
                if (existingHide) {
                    preHideStyleTag = existingHide
                } else {
                    var styleTag = document.createElement("style")
                    styleTag.setAttribute("data-choreo-style", "hide")
                    styleTag.textContent = "[data-choreo-hide] { opacity: 0 !important; visibility: hidden !important; pointer-events: none !important; }"
                    document.head.appendChild(styleTag)
                    preHideStyleTag = styleTag
                }

                // Compute initial clip-path for maskPreview mode
                var previewClip = ""
                var hasMaskPreset = enterPreset === "maskReveal" || (enterPreset === "scaleIn" && enterMaskDirection && enterMaskDirection !== "none")
                if (maskPreview && hasMaskPreset) {
                    var ms = Math.max(0, Math.min(100, 100 - (maskStart || 0)))
                    var previewMaskDir = resolveMaskDirection(enterMaskDirection)
                    switch (previewMaskDir) {
                        case "left":  default: previewClip = "inset(0 " + ms + "% 0 0)"; break
                        case "right":      previewClip = "inset(0 0 0 " + ms + "%)"; break
                        case "up":         previewClip = "inset(0 0 " + ms + "% 0)"; break
                        case "down":       previewClip = "inset(" + ms + "% 0 0 0)"; break
                        case "topLeft":    previewClip = "inset(0 " + ms + "% " + ms + "% 0)"; break
                        case "topRight":   previewClip = "inset(0 0 " + ms + "% " + ms + "%)"; break
                        case "bottomLeft": previewClip = "inset(" + ms + "% " + ms + "% 0 0)"; break
                        case "bottomRight":previewClip = "inset(" + ms + "% 0 0 " + ms + "%)"; break
                    }
                }

                for (var phi = 0; phi < targets.length; phi++) {
                    var phEl = targets[phi]
                    if (!phEl) continue
                    if (maskPreview && previewClip) {
                        phEl.style.setProperty("clip-path", previewClip)
                    } else {
                        phEl.setAttribute("data-choreo-hide", "1")
                    }
                    preHiddenEls.push(phEl)
                }
            }

            // ── Wrapper setup ──
            var wrapper: HTMLElement = parent
            wrapper.setAttribute("data-choreo-wrapper", baseId)
            parentOrigOverflow = parent.style.overflow
            if (maskViewportClip) {
                parent.style.setProperty("overflow", "hidden")
            }

            var pinSectionEl = earlyPinSection

            // ── Contain fix for Framer containers ──
            // GSAP ScrollTrigger handles overflow on its own via
            // pin-spacers.  We only need to fix `contain:paint/strict/
            // content` which creates a new stacking context that breaks
            // transform-based pinning.  Do NOT touch overflow — that
            // would interfere with GSAP's spacer mechanism.
            var overflowNode: HTMLElement | null = pinSectionEl || parent
            while (overflowNode && overflowNode !== document.documentElement) {
                var ovCS = window.getComputedStyle(overflowNode)
                var ovContain = ovCS.contain || ""
                if (/paint|strict|content/.test(ovContain)) {
                    scrollOverflowAncestors.push({ el: overflowNode, orig: ovContain })
                    overflowNode.style.setProperty("contain", "none", "important")
                }
                overflowNode = overflowNode.parentElement
            }

            // ── Synchronous pin coordination ──
            // Store this PC's pin-need BEFORE GSAP loads.  All PC effects
            // run synchronously in the same React commit, so by the time
            // any .then() callback fires, ALL PCs' pin-need attributes are
            // already present on the DOM.  This lets the first .then() to
            // create a ScrollTrigger read the MAX of all needs.
            var myScrollDist = scrollLength + Math.max(0, (scrollStartOffset / 100) * scrollLength)
            var isPinOwner = false
            if (scrollPin && pinSectionEl) {
                pinSectionEl.setAttribute("data-choreo-pin-need-" + baseId, myScrollDist.toString())
                // First PC to reach here claims pin ownership
                if (!pinSectionEl.hasAttribute("data-choreo-gsap-pin")) {
                    pinSectionEl.setAttribute("data-choreo-gsap-pin", baseId)
                    isPinOwner = true
                }
            }

            // ── Load GSAP and create ScrollTrigger ──
            // If GSAP is already loaded (cached), create triggers
            // synchronously so they survive React re-render cycles.
            //
            // For the first load (async path), we queue creation
            // functions into a global batch and process them all in
            // a single setTimeout(0).  This prevents one trigger's
            // pin-spacer DOM mutation from invalidating another
            // trigger's element references mid-microtask.
            var _existingGsap = (window as any).gsap
            var _existingST = (window as any).ScrollTrigger
            if (_existingGsap && _existingST) {
                _createScrollTrigger(_existingGsap, _existingST)
            } else {
                loadGSAP().then(function (libs) {
                    // Queue creation instead of running immediately.
                    // All .then() callbacks fire in the same microtask,
                    // so the queue collects ALL components.  The
                    // setTimeout(0) then creates them all at once.
                    var q: Array<() => void> = (window as any).__choreoCreateQueue = (window as any).__choreoCreateQueue || []
                    q.push(function () {
                        _createScrollTrigger(libs.gsap, libs.ScrollTrigger)
                    })
                    clearTimeout((window as any).__choreoCreateBatchTimer)
                    ;(window as any).__choreoCreateBatchTimer = setTimeout(function () {
                        var fns: Array<() => void> = (window as any).__choreoCreateQueue || []
                        ;(window as any).__choreoCreateQueue = []
                        console.log("[Choreo] Batch-creating", fns.length, "ScrollTriggers")
                        for (var bi = 0; bi < fns.length; bi++) {
                            fns[bi]()
                        }
                    }, 0)
                }).catch(function (err) {
                    console.warn("[Choreo] GSAP load failed:", err)
                    // Fallback: just reveal everything
                    for (var fb = 0; fb < preHiddenEls.length; fb++) {
                        preHiddenEls[fb].removeAttribute("data-choreo-hide")
                        preHiddenEls[fb].style.removeProperty("visibility")
                    }
                })
            }

            function _createScrollTrigger(gsap: any, ST: any) {
                if (!parent || !parent.isConnected) {
                    console.log("[Choreo] Skipping trigger creation for", baseId, "— parent not in DOM")
                    return
                }

                gsapCtx = gsap.context(function () {
                    var store = getStore()
                    if (!store) return

                    var timelineDuration = 0
                    var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches
                    var mobile = window.innerWidth < 768

                    // ── WAAPI animation creation ──
                    var createScrollAnims = function () {
                        for (var ca = 0; ca < scrollAnims.length; ca++) {
                            try { scrollAnims[ca].cancel() } catch (e) {}
                        }
                        scrollAnims = []
                        scrollAnimFinalStyles = []
                        timelineDuration = 0

                        var allTargets = store.getAllTargets().filter(function (t: any) {
                            return t.groupId === baseId && t.enterEnabled &&
                                (t.mobileEnabled || !mobile) && t.ref.current
                        })
                        var direction = allTargets.length > 0 ? allTargets[0].staggerDirection : "leftToRight"
                        var sorted = store.sortTargets(allTargets, direction)

                        for (var si = 0; si < sorted.length; si++) {
                            var target = sorted[si]
                            var el = target.ref.current
                            if (!el) continue
                            try {
                                var existing = el.getAnimations()
                                for (var ex = 0; ex < existing.length; ex++) { existing[ex].cancel() }
                            } catch (e) {}

                            var kf = reduced
                                ? { from: { opacity: "0" }, to: { opacity: "1" } }
                                : buildEnterKeyframes(target)
                            scrollAnimFinalStyles.push({ el: el, to: kf.to })

                            var staggerVal = reduced ? 0 : target.stagger
                            var itemDelay = staggerVal * si
                            var dur = reduced ? 10 : target.duration * 1000

                            try {
                                var scrollAnim = el.animate([kf.from, kf.to], {
                                    duration: dur,
                                    delay: itemDelay * 1000,
                                    easing: easingToCss(target.easing),
                                    fill: "both",
                                })
                                scrollAnim.pause()
                                scrollAnims.push(scrollAnim)
                            } catch (e) {}
                        }

                        if (sorted.length > 0) {
                            var lastStagger = (sorted.length - 1) * (reduced ? 0 : sorted[0].stagger)
                            var lastDur = reduced ? 10 : sorted[0].duration * 1000
                            timelineDuration = lastStagger * 1000 + lastDur
                        }
                    }

                    var updateAnimProgress = function (progress: number) {
                        for (var a = 0; a < scrollAnims.length; a++) {
                            try {
                                var anim = scrollAnims[a]
                                var timing = anim.effect && anim.effect.getComputedTiming
                                    ? anim.effect.getComputedTiming() : null
                                var animDelay = timing ? (timing.delay || 0) : 0
                                var animDur = timing ? (timing.duration || 600) : 600
                                var time = progress * timelineDuration
                                anim.currentTime = Math.max(0, Math.min(time, animDelay + (animDur as number)))
                            } catch (e) {}
                        }
                    }

                    var blockAnimatedPointerEvents = function () {
                        for (var bp = 0; bp < scrollAnimFinalStyles.length; bp++) {
                            scrollAnimFinalStyles[bp].el.setAttribute("data-choreo-scrubbing", "1")
                        }
                    }

                    var releaseAnimatedElements = function () {
                        for (var ra = 0; ra < scrollAnimFinalStyles.length; ra++) {
                            scrollAnimFinalStyles[ra].el.removeAttribute("data-choreo-scrubbing")
                        }
                    }

                    var visibilityRevealed = false
                    var revealIfNeeded = function (progress: number) {
                        if (visibilityRevealed) return
                        // Above-fold sections and maskPreview reveal
                        // immediately — the user can already see them.
                        // Below-fold sections require progress > 0 so
                        // they don't flash before the user scrolls.
                        if (!maskPreview && !_aboveFold && progress <= 0) return
                        visibilityRevealed = true
                        // Remove the data-choreo-hide attribute from THIS PC's
                        // elements only.  Do NOT remove the shared <style> tag —
                        // other PCs still rely on it for their hidden elements.
                        for (var ph = 0; ph < preHiddenEls.length; ph++) {
                            preHiddenEls[ph].removeAttribute("data-choreo-hide")
                            preHiddenEls[ph].style.removeProperty("visibility")
                            preHiddenEls[ph].style.removeProperty("opacity")
                            preHiddenEls[ph].style.removeProperty("pointer-events")
                            preHiddenEls[ph].style.removeProperty("clip-path")
                        }
                    }
                    var rehideIfNeeded = function () {
                        if (!visibilityRevealed) return
                        visibilityRevealed = false
                        for (var rh = 0; rh < preHiddenEls.length; rh++) {
                            preHiddenEls[rh].setAttribute("data-choreo-hide", "")
                        }
                    }

                    // ── Viewport clip helper ──
                    var vpClipPad = maskViewportPadding || 0
                    var animDone = false
                    var choreoDoneDispatched = false

                    var updateViewportClip = function () {
                        if (!maskViewportClip || !wrapper) return
                        if (animDone) {
                            wrapper.style.setProperty("transition", "clip-path 0.35s ease-out")
                            wrapper.style.removeProperty("clip-path")
                            return
                        }
                        wrapper.style.removeProperty("transition")
                        var wRect = wrapper.getBoundingClientRect()
                        var vpH = window.innerHeight
                        var vpW = window.innerWidth
                        var overflowTop = Math.max(0, -wRect.top)
                        var overflowRight = Math.max(0, wRect.right - vpW)
                        var overflowBottom = Math.max(0, wRect.bottom - vpH)
                        var overflowLeft = Math.max(0, -wRect.left)
                        var padBottom = (wRect.bottom >= vpH - vpClipPad) ? Math.max(0, vpClipPad - (vpH - wRect.bottom)) : 0
                        var clipTop = Math.round(Math.max(overflowTop, 0))
                        var clipRight = Math.round(Math.max(overflowRight, 0))
                        var clipBottom = Math.round(Math.max(overflowBottom, padBottom))
                        var clipLeft = Math.round(Math.max(overflowLeft, 0))
                        if (clipTop === 0 && clipRight === 0 && clipBottom === 0 && clipLeft === 0) {
                            wrapper.style.removeProperty("clip-path")
                        } else {
                            wrapper.style.setProperty("clip-path",
                                "inset(" + clipTop + "px " + clipRight + "px " + clipBottom + "px " + clipLeft + "px)", "important")
                        }
                    }

                    // ── Create animations eagerly ──
                    createScrollAnims()
                    blockAnimatedPointerEvents()
                    // Only set animations to "from" state for below-fold
                    // sections.  Above-fold sections must stay in their
                    // natural visible state until the trigger activates —
                    // setting progress(0) forces opacity:0/translateY/etc.
                    if (!earlyAboveFold) {
                        updateAnimProgress(0)
                    }

                    // ── Determine pin section and scroll range ──
                    var triggerEl = (scrollPin && pinSectionEl) ? pinSectionEl : wrapper

                    // Map scrollStart to GSAP start/end strings
                    var gsapStart: string
                    if (scrollStart === "top") {
                        // "top": animation begins when section top enters
                        // viewport from below (section top at viewport bottom)
                        gsapStart = "top bottom"
                    } else if (scrollStart === "center") {
                        gsapStart = "center center"
                    } else {
                        // "bottom" (default): animation begins when section
                        // top reaches the viewport top (fully scrolled into view)
                        gsapStart = "top top"
                    }

                    // Compute the scroll distance for this PC
                    var animOffset = Math.max(0, (scrollStartOffset / 100) * scrollLength)
                    var totalScrollDist = scrollLength + animOffset

                    // Read MAX of ALL pin-need attributes on this section.
                    // All pin-need attrs were set synchronously before GSAP
                    // loaded, so every PC's need is already present.
                    if (pinSectionEl) {
                        var pinNeedAttrs = pinSectionEl.attributes
                        for (var pna = 0; pna < pinNeedAttrs.length; pna++) {
                            if (pinNeedAttrs[pna].name.indexOf("data-choreo-pin-need-") === 0) {
                                var pnaVal = parseInt(pinNeedAttrs[pna].value) || 0
                                if (pnaVal > totalScrollDist) totalScrollDist = pnaVal
                            }
                        }
                    }

                    // Only the pin OWNER creates a pinning ScrollTrigger.
                    // isPinOwner was determined synchronously: the first PC
                    // with scrollPin=true to set data-choreo-gsap-pin wins.
                    // Other PCs use pin:false — they just scrub animations
                    // within the shared pin's scroll range.
                    var shouldPin = isPinOwner

                    // ── Create the ScrollTrigger ──
                    var triggerName = triggerEl.getAttribute("data-framer-name") || triggerEl.className.toString().slice(0, 40) || "(unnamed)"
                    var triggerRect = triggerEl.getBoundingClientRect()
                    console.log("[Choreo] Creating ScrollTrigger:", baseId, "trigger:", triggerEl.tagName + "." + triggerName, "size:", Math.round(triggerRect.width) + "x" + Math.round(triggerRect.height), "top:", Math.round(triggerRect.top), "pin:", shouldPin, "isPinOwner:", isPinOwner, "start:", gsapStart, "end: +=" + totalScrollDist, "animOffset:", animOffset)
                    // ── Reveal gating ──
                    // Determine whether the trigger element is "above
                    // the fold" — i.e. its top is within the first
                    // viewport height at page load.  Above-fold
                    // sections should reveal immediately.  Below-fold
                    // sections wait for actual user scroll to avoid
                    // flash-of-content on ultrawide/tall viewports.
                    var _aboveFold = triggerRect.top < window.innerHeight
                    var _userHasScrolled = _aboveFold // above-fold: pretend user already scrolled
                    var _progressBaseline = 0
                    var _scrollGateHandler: (() => void) | null = null
                    if (!_aboveFold) {
                        _scrollGateHandler = function () {
                            _userHasScrolled = true
                            window.removeEventListener("scroll", _scrollGateHandler!, true)
                        }
                        window.addEventListener("scroll", _scrollGateHandler, true)
                        _scrollGateCleanup = function () {
                            if (_scrollGateHandler) {
                                window.removeEventListener("scroll", _scrollGateHandler, true)
                            }
                        }
                    }

                    gsapScrollTrigger = ST.create({
                        id: baseId,
                        trigger: triggerEl,
                        pin: shouldPin,
                        pinSpacing: shouldPin,
                        anticipatePin: shouldPin ? 1 : 0,
                        start: gsapStart,
                        end: "+=" + totalScrollDist,
                        markers: { startColor: "lime", endColor: "red", fontSize: "10px" },
                        onUpdate: function (self: any) {
                            if (!gsapMounted) return
                            var progress = self.progress

                            // ── Rebase progress on first real scroll ──
                            // Below-fold sections on ultrawide/tall
                            // viewports can be mid-range on load.  Record
                            // baseline and remap so animation starts at 0.
                            // Above-fold sections skip this (gate is open).
                            if (!_userHasScrolled) {
                                _progressBaseline = progress
                                updateAnimProgress(0)
                                return
                            }

                            // Remap: baseline→1 becomes 0→1
                            var rebased = progress
                            if (_progressBaseline > 0.001 && _progressBaseline < 0.999) {
                                rebased = (progress - _progressBaseline) / (1 - _progressBaseline)
                                rebased = Math.max(0, Math.min(1, rebased))
                            }

                            // Apply animation offset: the first portion of
                            // scroll is "dead zone" before this PC's animation
                            // starts (allows staggered PCs within a shared pin).
                            var localProgress: number
                            if (animOffset > 0 && totalScrollDist > 0) {
                                var offsetFraction = animOffset / totalScrollDist
                                if (rebased <= offsetFraction) {
                                    localProgress = 0
                                } else {
                                    localProgress = (rebased - offsetFraction) / (1 - offsetFraction)
                                }
                            } else {
                                localProgress = rebased
                            }
                            localProgress = Math.max(0, Math.min(1, localProgress))

                            revealIfNeeded(rebased)
                            updateAnimProgress(localProgress)
                            updateViewportClip()

                            animDone = localProgress >= 1

                            // Dispatch choreo-done when animation completes
                            if (animDone && !choreoDoneDispatched && parent) {
                                choreoDoneDispatched = true
                                parent.dispatchEvent(new CustomEvent("choreo-done", {
                                    bubbles: true,
                                    detail: { groupId: baseId },
                                }))
                                var doneStore = getStore()
                                if (doneStore) {
                                    var gps = doneStore.getGroupParents(baseId)
                                    if (gps) {
                                        for (var gpi = 0; gpi < gps.length; gpi++) {
                                            gps[gpi].dispatchEvent(new CustomEvent("choreo-done", {
                                                bubbles: true,
                                                detail: { groupId: baseId },
                                            }))
                                        }
                                    }
                                }
                                releaseAnimatedElements()
                            }

                            if (scrollOnce && localProgress >= 1) {
                                releaseAnimatedElements()
                                if (gsapScrollTrigger) {
                                    gsapScrollTrigger.kill()
                                    gsapScrollTrigger = null
                                }
                            }
                        },
                        onLeaveBack: function () {
                            if (!gsapMounted) return
                            // Scrolled back before the trigger — re-hide
                            animDone = false
                            choreoDoneDispatched = false
                            blockAnimatedPointerEvents()
                            updateAnimProgress(0)
                            rehideIfNeeded()
                            if (wrapper) {
                                wrapper.style.removeProperty("transition")
                                wrapper.style.removeProperty("clip-path")
                            }
                        },
                    })

                    // Above-fold sections: reveal immediately.
                    // onUpdate only fires when scroll is between start
                    // and end, but above-fold content with start:
                    // "center center" doesn't trigger until scroll ~200.
                    // Content must be visible before that.
                    if (_aboveFold) {
                        revealIfNeeded(1)
                    }

                    // Defer sort/refresh until ALL PCs have created their
                    // ScrollTriggers.  All .then() callbacks fire in the
                    // same microtask (shared promise), so setTimeout(0)
                    // runs after all of them.  This ensures sort/refresh
                    // sees the complete set of triggers.
                    clearTimeout((window as any).__choreoRefreshTimer)
                    ;(window as any).__choreoRefreshTimer = setTimeout(function () {
                        if (!gsapMounted) return
                        ST.sort()
                        ST.refresh()
                        console.log("[Choreo] ScrollTrigger.sort() + refresh() — total triggers:", ST.getAll().length)
                    }, 0)

                    // No safety timer — elements stay hidden until the
                    // user scrolls into the trigger range.  The .catch()
                    // fallback handles GSAP load failures.

                }, parent) // end gsap.context scope
            } // end _createScrollTrigger
        }

        return function () {
            clearTimeout(rescanTimer)
            gsapMounted = false
            if (_scrollGateCleanup) {
                _scrollGateCleanup()
                _scrollGateCleanup = null
            }
            if (scrollSafetyTimer) {
                clearTimeout(scrollSafetyTimer)
            }
            // Remove pre-hide attributes
            for (var rph = 0; rph < preHiddenEls.length; rph++) {
                try { preHiddenEls[rph].removeAttribute("data-choreo-hide") } catch (e) {}
            }
            if (preHideStyleTag && preHideStyleTag.parentNode &&
                !document.querySelector("[data-choreo-hide]")) {
                preHideStyleTag.parentNode.removeChild(preHideStyleTag)
                preHideStyleTag = null
            }
            if (mutObs) {
                try { mutObs.disconnect() } catch (e) {}
            }
            if (intObs) {
                try { intObs.disconnect() } catch (e) {}
            }
            if (parentDoneHandler) {
                document.removeEventListener("choreo-done", parentDoneHandler)
            }
            if (parentResetHandler) {
                document.removeEventListener("choreo-reset", parentResetHandler)
            }
            var cleanupStore = getStore()
            if (cleanupStore) cleanupStore.cancelPendingGroup(baseId)
            if (cleanupStore && parent) {
                cleanupStore.unregisterGroupParent(baseId, parent)
            }
            // ── GSAP cleanup ──
            // gsap.context().revert() kills all ScrollTriggers created
            // within the context, removes spacers, restores pinned
            // element styles, and cleans up event listeners.
            if (gsapCtx) {
                gsapCtx.revert()
                gsapCtx = null
            }
            if (gsapScrollTrigger) {
                gsapScrollTrigger.kill()
                gsapScrollTrigger = null
            }
            // Cancel WAAPI animations (not tracked by gsap.context)
            for (var sa = 0; sa < scrollAnims.length; sa++) {
                try { scrollAnims[sa].cancel() } catch (e) {}
            }
            // Remove scrubbing attributes
            for (var pe = 0; pe < scrollAnimFinalStyles.length; pe++) {
                try { scrollAnimFinalStyles[pe].el.removeAttribute("data-choreo-scrubbing") } catch (e) {}
            }
            if (scrubStyleTag && scrubStyleTag.parentNode &&
                !document.querySelector("[data-choreo-scrubbing]")) {
                scrubStyleTag.parentNode.removeChild(scrubStyleTag)
            }
            // Restore contain on ancestors
            for (var oc = 0; oc < scrollOverflowAncestors.length; oc++) {
                scrollOverflowAncestors[oc].el.style.setProperty("contain", scrollOverflowAncestors[oc].orig)
            }
            scrollOverflowAncestors = []
            // Clean pin-need attributes
            if (pinSectionEl) {
                pinSectionEl.removeAttribute("data-choreo-pin-need-" + baseId)
                if (pinSectionEl.getAttribute("data-choreo-gsap-pin") === baseId) {
                    pinSectionEl.removeAttribute("data-choreo-gsap-pin")
                }
            }
            // Restore parent overflow
            if (parent) {
                parent.removeAttribute("data-choreo-wrapper")
                if (parentOrigOverflow) { parent.style.setProperty("overflow", parentOrigOverflow) } else { parent.style.removeProperty("overflow") }
                parent.style.removeProperty("clip-path")
                parent.style.removeProperty("transition")
            }
            unregisterAll(getStore())
        }
    }, [
        rescanGeneration,
        baseId, scanMode, excludeSelector, splitText, trigger, viewOffset, viewRepeat, waitForParent, scrollLength, scrollStart, scrollStartOffset, scrollPin, pinPriority, scrollOnce,
        enterPreset, exitPreset,
        enterEnabled, exitEnabled, sortPriority, priorityGap, delayOffset,
        mobileEnabled, duration, stagger,
        easingPreset, staggerDirection, distance,
        enterMaskDirection, exitMaskDirection, maskStart, maskPreview, maskViewportClip, maskViewportPadding, maskShiftX, maskShiftY, maskOpacity, blurAmount,
        scaleFrom, enterScaleDirection, scaleOpacity, exitTimeout, enterDelay,
        enterOpacity, enterOffsetX, enterOffsetY,
        enterScale, enterRotateX, enterRotateY, enterRotateZ,
        enterBlur, enterPerspective,
        exitOpacity, exitOffsetX, exitOffsetY,
        exitScale, exitRotateX, exitRotateY, exitRotateZ,
        exitBlur, exitPerspective,
    ])

    return (
        <div
            ref={(node) => {
                (markerRef as any).current = node
                if (node) {
                    node.style.setProperty("position", "absolute", "important")
                    // Framer wraps every component in a container div that
                    // participates in Stack/flex layout.  Collapse it so the
                    // marker takes zero space in Stacks and tickers.
                    var framerWrapper = node.parentElement
                    if (framerWrapper) {
                        framerWrapper.style.setProperty("position", "absolute", "important")
                        framerWrapper.style.setProperty("width", "0", "important")
                        framerWrapper.style.setProperty("height", "0", "important")
                        framerWrapper.style.setProperty("min-width", "0", "important")
                        framerWrapper.style.setProperty("min-height", "0", "important")
                        framerWrapper.style.setProperty("overflow", "hidden", "important")
                        framerWrapper.style.setProperty("pointer-events", "none", "important")
                        framerWrapper.style.setProperty("padding", "0", "important")
                        framerWrapper.style.setProperty("margin", "0", "important")
                        framerWrapper.style.setProperty("flex", "0 0 0px", "important")
                    }
                }
            }}
            data-choreo-marker="1"
            data-choreo-wait={waitForParent ? "1" : undefined}
            style={{
                width: 0,
                height: 0,
                overflow: "hidden",
                pointerEvents: "none",
                opacity: 0,
            }}
        />
    )
}

PageChoreographer.displayName = "Page Choreographer"

// ─── Property Controls ───────────────────────────────────────────────────────

addPropertyControls(PageChoreographer, {
    scanMode: {
        type: ControlType.Enum,
        title: "Scan Mode",
        defaultValue: "siblings",
        options: ["siblings", "children"],
        optionTitles: ["Auto", "Children"],
        description: "Auto: detects siblings and CMS collections automatically. Children: animates direct children of a specific element.",
    },
    excludeSelector: {
        type: ControlType.String,
        title: "Exclude",
        defaultValue: "",
        placeholder: "Layer Name",
        description:
            "Layer names to skip (comma-separated). e.g. Load More, Button",
    },
    splitText: {
        type: ControlType.Enum,
        title: "Split Text",
        defaultValue: "none",
        options: ["none", "lines", "words", "chars"],
        optionTitles: ["None", "Lines", "Words", "Characters"],
        description: "Split text for individual animation. Characters works best with short text (hero headings, titles) — avoid on long paragraphs (50+ chars) for performance.",
    },
    trigger: {
        type: ControlType.Enum,
        title: "Trigger",
        defaultValue: "onLoad",
        options: ["onLoad", "inView", "onScroll"],
        optionTitles: ["On Load", "In View", "On Scroll"],
    },
    scrollLength: {
        type: ControlType.Number,
        title: "Scroll Length",
        defaultValue: 500,
        min: 100,
        max: 5000,
        step: 50,
        unit: "px",
        description: "How many pixels of scrolling to complete the animation. Section stays pinned during this distance.",
        hidden: function (props: any) { return props.trigger !== "onScroll" },
    },
    scrollStart: {
        type: ControlType.Enum,
        title: "Start",
        defaultValue: "bottom",
        options: ["top", "center", "bottom"],
        optionTitles: ["Top", "Center", "Bottom"],
        optionIcons: ["align-top", "align-middle", "align-bottom"],
        description: "When the animation starts: Top = element enters viewport, Center = element at viewport center, Bottom = element reaches viewport top.",
        hidden: function (props: any) { return props.trigger !== "onScroll" },
    },
    scrollStartOffset: {
        type: ControlType.Number,
        title: "Start Offset",
        defaultValue: 0,
        min: -100,
        max: 100,
        step: 5,
        unit: "%",
        description: "Shift the animation start within the scroll range. When multiple PCs share a pinned section, use this to stagger reveals (e.g. 0% for image, 30% for text).",
        hidden: function (props: any) { return props.trigger !== "onScroll" },
    },
    scrollPin: {
        type: ControlType.Boolean,
        title: "Pin Section",
        defaultValue: true,
        description: "When enabled, the section stays pinned (sticky) while the scroll animation plays. When disabled, the section scrolls naturally while the animation scrubs.",
        hidden: function (props: any) { return props.trigger !== "onScroll" },
    },
    pinPriority: {
        type: ControlType.Boolean,
        title: "Pin Priority",
        defaultValue: false,
        description: "Designate this instance as the pin owner. Its scroll length controls how long the section stays pinned. Other instances in the same section animate independently within that pin duration.",
        hidden: function (props: any) { return props.trigger !== "onScroll" || !props.scrollPin },
    },
    scrollOnce: {
        type: ControlType.Boolean,
        title: "Play Once",
        defaultValue: false,
        description: "When enabled, the scroll animation plays once and won't reverse when scrolling back up.",
        hidden: function (props: any) { return props.trigger !== "onScroll" },
    },
    viewOffset: {
        type: ControlType.Number,
        title: "View Offset",
        defaultValue: 100,
        min: -200,
        max: 500,
        step: 10,
        unit: "px",
        hidden: function (props: any) { return props.trigger !== "inView" },
    },
    viewRepeat: {
        type: ControlType.Boolean,
        title: "Repeat",
        defaultValue: false,
        hidden: function (props: any) { return props.trigger !== "inView" },
    },
    waitForParent: {
        type: ControlType.Boolean,
        title: "Wait for Parent",
        defaultValue: false,
        description: "Delay this animation until a parent Page Choreographer finishes its enter animation. Useful for chained reveals (e.g. text animates after its container unmasks).",
        hidden: function (props: any) { return props.trigger !== "inView" },
    },

    // ── Enter ────────────────────────────────────────────────────────────────

    enterEnabled: {
        type: ControlType.Boolean,
        title: "Enter",
        defaultValue: true,
    },
    enterPreset: {
        type: ControlType.Enum,
        title: "Enter Effect",
        defaultValue: "fadeUp",
        options: [
            "fadeUp", "fadeDown", "fadeLeft", "fadeRight",
            "maskReveal", "scaleIn", "blurIn", "custom",
        ],
        optionTitles: [
            "Fade Up", "Fade Down", "Fade Left", "Fade Right",
            "Mask Reveal", "Scale In", "Blur In", "Custom",
        ],
        hidden: function (props: any) { return props.enterEnabled === false },
    },
    enterMaskDirection: {
        type: ControlType.Enum,
        title: "↳ Mask Direction",
        defaultValue: "left",
        options: ["none", "left", "right", "up", "down", "topLeft", "topRight", "bottomLeft", "bottomRight", "random"],
        optionTitles: ["None", "Left → Right", "Right → Left", "Top → Bottom", "Bottom → Top", "↘ Top-Left", "↙ Top-Right", "↗ Bottom-Left", "↖ Bottom-Right", "Random"],
        hidden: function (props: any) {
            if (props.enterEnabled === false) return true
            return props.enterPreset !== "maskReveal" && props.enterPreset !== "scaleIn"
        },
    },
    enterOpacity: {
        type: ControlType.Number,
        title: "↳ Opacity",
        defaultValue: 0,
        min: 0,
        max: 1,
        step: 0.05,
        hidden: function (props: any) {
            return props.enterEnabled === false || props.enterPreset !== "custom"
        },
    },
    enterOffsetX: {
        type: ControlType.Number,
        title: "↳ Offset X",
        defaultValue: 0,
        min: -2000,
        max: 2000,
        step: 5,
        unit: "px",
        hidden: function (props: any) {
            return props.enterEnabled === false || props.enterPreset !== "custom"
        },
    },
    enterOffsetY: {
        type: ControlType.Number,
        title: "↳ Offset Y",
        defaultValue: 40,
        min: -2000,
        max: 2000,
        step: 5,
        unit: "px",
        hidden: function (props: any) {
            return props.enterEnabled === false || props.enterPreset !== "custom"
        },
    },
    enterScale: {
        type: ControlType.Number,
        title: "↳ Scale",
        defaultValue: 1,
        min: 0,
        max: 2,
        step: 0.01,
        hidden: function (props: any) {
            return props.enterEnabled === false || props.enterPreset !== "custom"
        },
    },
    enterRotateX: {
        type: ControlType.Number,
        title: "↳ Rotate X",
        defaultValue: 0,
        min: -360,
        max: 360,
        step: 5,
        unit: "°",
        hidden: function (props: any) {
            return props.enterEnabled === false || props.enterPreset !== "custom"
        },
    },
    enterRotateY: {
        type: ControlType.Number,
        title: "↳ Rotate Y",
        defaultValue: 0,
        min: -360,
        max: 360,
        step: 5,
        unit: "°",
        hidden: function (props: any) {
            return props.enterEnabled === false || props.enterPreset !== "custom"
        },
    },
    enterRotateZ: {
        type: ControlType.Number,
        title: "↳ Rotate Z",
        defaultValue: 0,
        min: -360,
        max: 360,
        step: 5,
        unit: "°",
        hidden: function (props: any) {
            return props.enterEnabled === false || props.enterPreset !== "custom"
        },
    },
    enterPerspective: {
        type: ControlType.Number,
        title: "↳ Perspective",
        defaultValue: 1000,
        min: 100,
        max: 3000,
        step: 50,
        unit: "px",
        hidden: function (props: any) {
            if (props.enterEnabled === false || props.enterPreset !== "custom") return true
            return props.enterRotateX === 0 && props.enterRotateY === 0
        },
    },
    enterBlur: {
        type: ControlType.Number,
        title: "↳ Blur",
        defaultValue: 0,
        min: 0,
        max: 50,
        step: 1,
        unit: "px",
        hidden: function (props: any) {
            return props.enterEnabled === false || props.enterPreset !== "custom"
        },
    },

    // ── Exit ─────────────────────────────────────────────────────────────────

    exitEnabled: {
        type: ControlType.Boolean,
        title: "Exit",
        defaultValue: true,
    },
    exitPreset: {
        type: ControlType.Enum,
        title: "Exit Effect",
        defaultValue: "riseWave",
        options: [
            "riseWave", "fadeDown", "fadeLeft", "fadeRight",
            "maskOut", "blurLift", "scaleFadeGrid", "scaleOut", "custom",
        ],
        optionTitles: [
            "Rise Wave", "Fade Down", "Fade Left", "Fade Right",
            "Mask Out", "Blur Lift", "Scale Fade", "Scale Out", "Custom",
        ],
        hidden: function (props: any) { return props.exitEnabled === false },
    },
    exitMaskDirection: {
        type: ControlType.Enum,
        title: "↳ Direction",
        defaultValue: "left",
        options: ["left", "right", "up", "down", "topLeft", "topRight", "bottomLeft", "bottomRight", "random"],
        optionTitles: ["Left → Right", "Right → Left", "Top → Bottom", "Bottom → Top", "↘ Top-Left", "↙ Top-Right", "↗ Bottom-Left", "↖ Bottom-Right", "Random"],
        hidden: function (props: any) {
            return props.exitEnabled === false || props.exitPreset !== "maskOut"
        },
    },
    exitOpacity: {
        type: ControlType.Number,
        title: "↳ Opacity",
        defaultValue: 0,
        min: 0,
        max: 1,
        step: 0.05,
        hidden: function (props: any) {
            return props.exitEnabled === false || props.exitPreset !== "custom"
        },
    },
    exitOffsetX: {
        type: ControlType.Number,
        title: "↳ Offset X",
        defaultValue: 0,
        min: -2000,
        max: 2000,
        step: 5,
        unit: "px",
        hidden: function (props: any) {
            return props.exitEnabled === false || props.exitPreset !== "custom"
        },
    },
    exitOffsetY: {
        type: ControlType.Number,
        title: "↳ Offset Y",
        defaultValue: -40,
        min: -2000,
        max: 2000,
        step: 5,
        unit: "px",
        hidden: function (props: any) {
            return props.exitEnabled === false || props.exitPreset !== "custom"
        },
    },
    exitScale: {
        type: ControlType.Number,
        title: "↳ Scale",
        defaultValue: 1,
        min: 0,
        max: 2,
        step: 0.01,
        hidden: function (props: any) {
            return props.exitEnabled === false || props.exitPreset !== "custom"
        },
    },
    exitRotateX: {
        type: ControlType.Number,
        title: "↳ Rotate X",
        defaultValue: 0,
        min: -360,
        max: 360,
        step: 5,
        unit: "°",
        hidden: function (props: any) {
            return props.exitEnabled === false || props.exitPreset !== "custom"
        },
    },
    exitRotateY: {
        type: ControlType.Number,
        title: "↳ Rotate Y",
        defaultValue: 0,
        min: -360,
        max: 360,
        step: 5,
        unit: "°",
        hidden: function (props: any) {
            return props.exitEnabled === false || props.exitPreset !== "custom"
        },
    },
    exitRotateZ: {
        type: ControlType.Number,
        title: "↳ Rotate Z",
        defaultValue: 0,
        min: -360,
        max: 360,
        step: 5,
        unit: "°",
        hidden: function (props: any) {
            return props.exitEnabled === false || props.exitPreset !== "custom"
        },
    },
    exitPerspective: {
        type: ControlType.Number,
        title: "↳ Perspective",
        defaultValue: 1000,
        min: 100,
        max: 3000,
        step: 50,
        unit: "px",
        hidden: function (props: any) {
            if (props.exitEnabled === false || props.exitPreset !== "custom") return true
            return props.exitRotateX === 0 && props.exitRotateY === 0
        },
    },
    exitBlur: {
        type: ControlType.Number,
        title: "↳ Blur",
        defaultValue: 0,
        min: 0,
        max: 50,
        step: 1,
        unit: "px",
        hidden: function (props: any) {
            return props.exitEnabled === false || props.exitPreset !== "custom"
        },
    },

    // ── Timing ───────────────────────────────────────────────────────────────

    duration: {
        type: ControlType.Number,
        title: "Duration",
        defaultValue: 0.6,
        min: 0.1,
        max: 3,
        step: 0.05,
        unit: "s",
    },
    stagger: {
        type: ControlType.Number,
        title: "Stagger",
        defaultValue: 0.06,
        min: 0,
        max: 0.5,
        step: 0.01,
        unit: "s",
    },
    easingPreset: {
        type: ControlType.Enum,
        title: "Easing",
        defaultValue: "smooth",
        options: ["smooth", "snappy", "dramatic", "gentle", "bounce", "linear"],
        optionTitles: ["Smooth", "Snappy", "Dramatic", "Gentle", "Bounce", "Linear"],
    },
    staggerDirection: {
        type: ControlType.Enum,
        title: "Stagger Order",
        defaultValue: "leftToRight",
        options: [
            "leftToRight", "rightToLeft", "topToBottom",
            "bottomToTop", "rowMajor", "columnMajor", "random",
        ],
        optionTitles: [
            "Left → Right", "Right → Left", "Top → Bottom",
            "Bottom → Top", "Row Major", "Column Major", "Random",
        ],
    },

    // ── Preset parameters ────────────────────────────────────────────────────

    distance: {
        type: ControlType.Number,
        title: "Distance",
        defaultValue: 40,
        min: 0,
        max: 2000,
        step: 5,
        unit: "px",
        description: "How far elements travel during directional animations.",
        hidden: function (props: any) {
            var directionalEnter = ["fadeUp", "fadeDown", "fadeLeft", "fadeRight"]
            var directionalExit = ["riseWave", "fadeDown", "fadeLeft", "fadeRight", "blurLift"]
            var enterUsesDistance = directionalEnter.indexOf(props.enterPreset) !== -1
            var exitUsesDistance = directionalExit.indexOf(props.exitPreset) !== -1
            return !enterUsesDistance && !exitUsesDistance
        },
    },
    maskShiftX: {
        type: ControlType.Number,
        title: "Mask Shift X",
        defaultValue: 0,
        min: -200,
        max: 200,
        step: 1,
        unit: "px",
        hidden: function (props: any) {
            var enterMatch = props.enterEnabled !== false && (props.enterPreset === "maskReveal" || (props.enterPreset === "scaleIn" && props.enterMaskDirection && props.enterMaskDirection !== "none"))
            var exitMatch = props.exitEnabled !== false && props.exitPreset === "maskOut"
            return !enterMatch && !exitMatch
        },
    },
    maskShiftY: {
        type: ControlType.Number,
        title: "Mask Shift Y",
        defaultValue: 0,
        min: -200,
        max: 200,
        step: 1,
        unit: "px",
        hidden: function (props: any) {
            var enterMatch = props.enterEnabled !== false && (props.enterPreset === "maskReveal" || (props.enterPreset === "scaleIn" && props.enterMaskDirection && props.enterMaskDirection !== "none"))
            var exitMatch = props.exitEnabled !== false && props.exitPreset === "maskOut"
            return !enterMatch && !exitMatch
        },
    },
    maskStart: {
        type: ControlType.Number,
        title: "Mask Start",
        defaultValue: 0,
        min: 0,
        max: 100,
        step: 5,
        unit: "%",
        description: "How much of the element is visible before the mask animation begins. 0% = fully masked, 50% = half visible.",
        hidden: function (props: any) {
            if (props.enterPreset === "maskReveal") return false
            if (props.enterPreset === "scaleIn" && props.enterMaskDirection && props.enterMaskDirection !== "none") return false
            return true
        },
    },
    maskPreview: {
        type: ControlType.Boolean,
        title: "↳ Show Preview",
        defaultValue: false,
        description: "When enabled, shows the element at its Mask Start percentage on mount instead of hiding it until the scroll animation begins.",
        hidden: function (props: any) {
            var hasMask = props.enterPreset === "maskReveal" || (props.enterPreset === "scaleIn" && props.enterMaskDirection && props.enterMaskDirection !== "none")
            return !hasMask || (props.maskStart || 0) <= 0 || props.trigger !== "onScroll"
        },
    },
    maskViewportClip: {
        type: ControlType.Boolean,
        title: "↳ Viewport Clip",
        defaultValue: false,
        description: "Clips the reveal to the viewport edge so the mask never extends past the screen boundary. Use Viewport Padding to add consistent inset from the edges.",
        hidden: function (props: any) {
            var hasMask = props.enterPreset === "maskReveal" || (props.enterPreset === "scaleIn" && props.enterMaskDirection && props.enterMaskDirection !== "none")
            return !hasMask || props.trigger !== "onScroll"
        },
    },
    maskViewportPadding: {
        type: ControlType.Number,
        title: "  ↳ Padding",
        defaultValue: 0,
        min: 0,
        max: 200,
        step: 1,
        unit: "px",
        description: "Inset padding from the viewport edges. The mask reveal will stay this many pixels away from the screen boundary.",
        hidden: function (props: any) {
            var hasMask = props.enterPreset === "maskReveal" || (props.enterPreset === "scaleIn" && props.enterMaskDirection && props.enterMaskDirection !== "none")
            return !hasMask || props.trigger !== "onScroll" || !props.maskViewportClip
        },
    },
    maskOpacity: {
        type: ControlType.Number,
        title: "Mask Opacity",
        defaultValue: 1,
        min: 0,
        max: 1,
        step: 0.05,
        hidden: function (props: any) {
            var enterMatch = props.enterEnabled !== false && (props.enterPreset === "maskReveal" || (props.enterPreset === "scaleIn" && props.enterMaskDirection && props.enterMaskDirection !== "none"))
            var exitMatch = props.exitEnabled !== false && props.exitPreset === "maskOut"
            return !enterMatch && !exitMatch
        },
    },
    blurAmount: {
        type: ControlType.Number,
        title: "Blur Amount",
        defaultValue: 8,
        min: 0,
        max: 50,
        step: 1,
        unit: "px",
        hidden: function (props: any) {
            return props.enterPreset !== "blurIn" && props.exitPreset !== "blurLift"
        },
    },
    scaleFrom: {
        type: ControlType.Number,
        title: "Scale From",
        defaultValue: 0.92,
        min: 0,
        max: 2,
        step: 0.01,
        hidden: function (props: any) {
            return (
                props.enterPreset !== "scaleIn" &&
                props.exitPreset !== "scaleFadeGrid" &&
                props.exitPreset !== "scaleOut"
            )
        },
    },
    enterScaleDirection: {
        type: ControlType.Enum,
        title: "↳ Direction",
        defaultValue: "center",
        options: ["center", "left", "right", "up", "down", "topLeft", "topRight", "bottomLeft", "bottomRight"],
        optionTitles: ["Center", "← Left", "→ Right", "↑ Top", "↓ Bottom", "↘ Top-Left", "↙ Top-Right", "↗ Bottom-Left", "↖ Bottom-Right"],
        hidden: function (props: any) {
            return props.enterPreset !== "scaleIn"
        },
    },
    scaleOpacity: {
        type: ControlType.Number,
        title: "↳ Start Opacity",
        defaultValue: 0,
        min: 0,
        max: 1,
        step: 0.05,
        description: "Opacity at the start of the scale animation. Set to 1 for a pure scale effect without fade.",
        hidden: function (props: any) {
            return props.enterPreset !== "scaleIn"
        },
    },

    // ── Advanced ─────────────────────────────────────────────────────────────

    sortPriority: {
        type: ControlType.Number,
        title: "Priority",
        defaultValue: 0,
        min: -10,
        max: 10,
        step: 1,
        description: "Controls animation order across groups. Lower numbers animate first.",
        hidden: function (props: any) { return props.trigger === "onScroll" },
    },
    priorityGap: {
        type: ControlType.Number,
        title: "Priority Gap",
        defaultValue: 0,
        min: -3,
        max: 5,
        step: 0.05,
        unit: "s",
        description: "Pause between priority groups. Negative values create overlap.",
        hidden: function (props: any) { return props.trigger === "onScroll" },
    },
    delayOffset: {
        type: ControlType.Number,
        title: "Delay Offset",
        defaultValue: 0,
        min: -1,
        max: 2,
        step: 0.01,
        unit: "s",
    },
    mobileEnabled: {
        type: ControlType.Boolean,
        title: "Mobile",
        defaultValue: true,
    },
    exitTimeout: {
        type: ControlType.Number,
        title: "Exit Timeout",
        defaultValue: 3,
        min: 0.5,
        max: 10,
        step: 0.5,
        unit: "s",
    },
    enterDelay: {
        type: ControlType.Number,
        title: "Enter Delay",
        defaultValue: 0.05,
        min: 0,
        max: 2,
        step: 0.05,
        unit: "s",
    },
})
