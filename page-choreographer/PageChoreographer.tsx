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
            return {
                from: {
                    opacity: String(so),
                    transform: "scale(" + sf + ")",
                    transformOrigin: origin,
                },
                to: {
                    opacity: "1",
                    transform: "scale(1)",
                    transformOrigin: origin,
                },
            }
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
            switch (t.enterMaskDirection) {
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
            switch (t.exitMaskDirection) {
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
        case "scaleOut":
            return {
                from: { opacity: "1", transform: "scale(1)" },
                to: { opacity: "0", transform: "scale(" + t.scaleFrom + ")" },
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
    }

    // ─── Play enter for inView groups (batched by priority) ─────────────────

    var pendingGroups: string[] = []
    var groupBatchTimer: any = null

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
        getTargetCount: getTargetCount,
        getAllTargets: getAllTargets,
        sortTargets: sortTargets,
        playEnter: playEnter,
        playEnterGroup: playEnterGroup,
        resetGroup: resetGroup,
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
        return (window as any)[STORE_KEY]
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

// Walk up from an element to find the section-level ancestor
// (a child of the page root, which has many siblings like
// Hero, Projects, Footer, etc.)
function findSection(el: HTMLElement): HTMLElement {
    var node = el
    while (node.parentElement) {
        var siblingCount = node.parentElement.children.length
        // Page root has many direct children (the sections)
        if (siblingCount >= 3) return node
        node = node.parentElement
    }
    return el // fallback to original element
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
        if (contentCount >= 2 && contentCount > bestCount) {
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
    splitText?: boolean
): HTMLElement[] {
    var result: HTMLElement[] = []
    if (scanMode === "cmsItems") {
        var listNode = findNodeWithMostChildren(parent, marker)
        if (listNode) {
            for (var j = 0; j < listNode.children.length; j++) {
                var child = listNode.children[j] as HTMLElement
                if (!isMarkerBranch(child, marker)) result.push(child)
            }
        }
    } else if (scanMode === "cmsNested") {
        // Component is nested INSIDE a CMS item. Walk UP from parent
        // to find the CMS collection list (ancestor with many children
        // that look like repeated CMS items), then target those items.
        var cmsListNode: HTMLElement | null = null
        var walkUp = parent.parentElement
        var walkDepth = 10
        while (walkUp && walkDepth > 0) {
            // Count non-marker children
            var childCount = 0
            for (var ci = 0; ci < walkUp.children.length; ci++) {
                if (!isMarkerBranch(walkUp.children[ci] as HTMLElement, marker))
                    childCount++
            }
            // A CMS collection typically has 3+ repeated items
            if (childCount >= 3) {
                cmsListNode = walkUp
                break
            }
            walkUp = walkUp.parentElement
            walkDepth--
        }
        if (cmsListNode) {
            for (var cj = 0; cj < cmsListNode.children.length; cj++) {
                var cmsChild = cmsListNode.children[cj] as HTMLElement
                if (!isMarkerBranch(cmsChild, marker)) result.push(cmsChild)
            }
        }
    } else {
        for (var k = 0; k < parent.children.length; k++) {
            var el = parent.children[k] as HTMLElement
            if (isMarkerBranch(el, marker)) continue
            result.push(el)
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
    // Expand text elements into individual lines
    if (splitText) {
        result = splitTextTargets(result)
    }
    return result
}

// ─── Component ───────────────────────────────────────────────────────────────

var groupCounter = 0
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
        scanMode = "cmsItems",
        excludeSelector = "",
        splitText = false,
        enterPreset = "fadeUp",
        exitPreset = "riseWave",
        enterEnabled = true,
        exitEnabled = true,
        mobileEnabled = true,
        trigger = "onLoad",
        viewOffset = 100,
        viewRepeat = false,
        scrollLength = 500,
        scrollStart = "bottom",
        scrollPin = true,
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

    var markerRef = React.useRef(null) as React.MutableRefObject<HTMLDivElement | null>
    var baseId = useStableGroupId()
    var registeredIds = React.useRef<string[]>([])

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

    React.useEffect(function () {
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

        // Pre-hide elements that will animate in (inView / onLoad) so they
        // don't flash visible before the animation starts. Only in preview —
        // on canvas elements should stay visible for editing.
        // Uses visibility:hidden which doesn't interfere with WAAPI animations
        // and is cleanly removed when the animation starts.
        var preHiddenEls: HTMLElement[] = []
        var preHideStyleTag: HTMLStyleElement | null = null
        if ((trigger === "inView" || trigger === "onLoad" || trigger === "onScroll") && enterEnabled &&
            RenderTarget.current() !== RenderTarget.canvas) {

            // For onScroll, use a <style> tag + data attribute for
            // bulletproof hiding that survives React re-renders and
            // Framer's style management
            if (trigger === "onScroll") {
                var styleTag = document.createElement("style")
                styleTag.textContent = "[data-choreo-hide] { opacity: 0 !important; visibility: hidden !important; pointer-events: none !important; }"
                document.head.appendChild(styleTag)
                preHideStyleTag = styleTag
            }

            // Compute initial clip-path for maskPreview mode
            var previewClip = ""
            if (maskPreview && enterPreset === "maskReveal" && trigger === "onScroll") {
                var ms = Math.max(0, Math.min(100, 100 - (maskStart || 0)))
                switch (enterMaskDirection) {
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
                if (maskPreview && previewClip && trigger === "onScroll") {
                    // Show element with initial mask instead of hiding
                    phEl.style.setProperty("clip-path", previewClip)
                } else if (trigger === "onScroll") {
                    phEl.setAttribute("data-choreo-hide", "1")
                } else {
                    phEl.style.setProperty("visibility", "hidden")
                }
                preHiddenEls.push(phEl)
            }
        }

        // MutationObserver for dynamic CMS content
        var observeTarget = parent
        if (scanMode === "cmsItems") {
            for (var i = 0; i < parent.children.length; i++) {
                var ch = parent.children[i] as HTMLElement
                if (isMarkerBranch(ch, marker)) continue
                if (ch.children.length > 1) {
                    observeTarget = ch
                    break
                }
            }
        }

        var mutObs: MutationObserver | null = null
        try {
            if (typeof MutationObserver !== "undefined") {
                mutObs = new MutationObserver(function () {
                    var s = getStore()
                    if (!s || !marker) return
                    var p = findRealParent(marker)
                    if (!p) return
                    unregisterAll(s)
                    var t = collectTargets(p, marker, scanMode, excludeSelector, splitText)
                    registerElements(t, s)
                })
                mutObs.observe(observeTarget, { childList: true })
            }
        } catch (e) {}

        // IntersectionObserver for "inView" trigger
        var intObs: IntersectionObserver | null = null
        if (trigger === "inView" && typeof IntersectionObserver !== "undefined") {
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
                                if (s2) s2.resetGroup(baseId)
                            }
                        }
                    },
                    { rootMargin: "0px 0px " + viewOffset + "px 0px" }
                )
                intObs.observe(parent)
            } catch (e) {}
        }

        // ─── Scroll-scrub trigger ────────────────────────────────────────────
        // All DOM manipulation (wrapper creation) is deferred to the first
        // scroll event. On Framer canvas, scroll never fires, so the DOM is
        // never modified and elements render naturally.
        var scrollAnims: Animation[] = []
        var scrollHandler: (() => void) | null = null
        var scrollResizeHandler: (() => void) | null = null
        var scrollWrapper: HTMLElement | null = null
        var scrollSectionEl: HTMLElement | null = null
        var scrollSpacer: HTMLElement | null = null
        var scrollOverflowAncestors: Array<{ el: HTMLElement; orig: string }> = []
        var scrollPinEl: HTMLElement | null = null
        var scrollSetupRaf = 0
        var scrollResizeTimer = 0
        var scrollPinState = { pinned: false, afterPin: false, completed: false, origStyles: "" }

        var isPreview = RenderTarget.current() !== RenderTarget.canvas

        if (trigger === "onScroll" && parent && isPreview) {

            // Defer setup to next frame so CMS/async content has laid out
            scrollSetupRaf = requestAnimationFrame(function () {
            scrollSetupRaf = requestAnimationFrame(function () {
            scrollSetupRaf = 0

            var timelineDuration = 0

            // ── Measure after layout has settled ──
            var parentHeight = parent.offsetHeight
            var parentWidth = parent.offsetWidth
            var parentGP = parent.parentElement

            // ── Create wrapper inside the section ──
            var wrapper = document.createElement("div")

            if (parentGP) {
                // Copy the parent's flex-child properties so wrapper
                // occupies the same position/size in the section
                var parentCS = window.getComputedStyle(parent)
                wrapper.style.setProperty("align-self", parentCS.alignSelf)
                wrapper.style.setProperty("justify-self", parentCS.justifySelf)
                wrapper.style.setProperty("order", parentCS.order)
                wrapper.style.setProperty("grid-column", parentCS.gridColumn)
                wrapper.style.setProperty("grid-row", parentCS.gridRow)
                // Preserve the parent's flex sizing (e.g. flex:1 for "fill")
                // In flex layouts, flex-basis overrides width when != auto,
                // so width:100% is safe as a baseline — flex handles sharing.
                wrapper.style.setProperty("flex-grow", parentCS.flexGrow)
                wrapper.style.setProperty("flex-shrink", parentCS.flexShrink)
                wrapper.style.setProperty("flex-basis", parentCS.flexBasis)
                wrapper.style.setProperty("width", "100%")

                // Mirror the section's flex layout so the Stack inside
                // the wrapper retains its flex-based sizing & centering
                var gpCS = window.getComputedStyle(parentGP)
                wrapper.style.setProperty("display", "flex")
                wrapper.style.setProperty("flex-direction", gpCS.flexDirection)
                wrapper.style.setProperty("align-items", gpCS.alignItems)
                wrapper.style.setProperty("justify-content", gpCS.justifyContent)
                wrapper.style.setProperty("gap", gpCS.gap)
            }
            // Copy parent's responsive height if set (e.g. "100vh", "50vh")
            // so the wrapper doesn't collapse when the parent has viewport height.
            // Use the inline style value (responsive unit) rather than computed (px).
            var parentInlineHeight = parent.style.height
            if (parentInlineHeight && /vh|vw|svh|dvh|lvh|%/.test(parentInlineHeight)) {
                wrapper.style.setProperty("height", parentInlineHeight)
            } else {
                // Also check computed style for viewport-relative heights
                // that might come from Framer's layout system
                var parentComputedH = window.getComputedStyle(parent).height
                var parentRect = parent.getBoundingClientRect()
                var vpH = window.innerHeight
                // If parent height is very close to viewport height, it's likely 100vh
                if (Math.abs(parentRect.height - vpH) < 2) {
                    wrapper.style.setProperty("height", "100vh")
                }
            }
            wrapper.style.setProperty("position", "relative")
            wrapper.style.setProperty("overflow", "hidden")

            // Insert wrapper into the section
            parentGP!.insertBefore(wrapper, parent)
            wrapper.appendChild(parent)
            scrollWrapper = wrapper

            // Find the actual section element (e.g. Hero) that has
            // the background — this may be above parentGP
            var sectionEl = parentGP ? findSection(parentGP) : parentGP!
            scrollSectionEl = sectionEl

            // Check if the SECTION (Hero) expanded to fit the wrapper.
            // Important: check sectionEl, not parentGP — parentGP (inner
            // Stack) may grow but the section (100vh) won't.
            var neededHeight = parentHeight + scrollLength
            var sectionGrew = sectionEl.offsetHeight >= neededHeight * 0.98

            // Deduplication: if another Page Choreographer instance already
            // claimed this section for spacer-mode pinning, this instance
            // should NOT create a second spacer or try to pin the section.
            // Instead it joins the existing pin (wrapper mode, no section pin).
            var sectionAlreadyClaimed = sectionEl.hasAttribute("data-choreo-pin-owner")


            // ── Determine pin mode ──
            // When scrollPin is enabled: spacer + sticky pinning on the section.
            // When disabled: section scrolls naturally, animation scrubs based on position.
            var isFollower = scrollPin && sectionAlreadyClaimed
            var isOwner = scrollPin && !isFollower

            // No fixed height on wrapper — let content size it naturally.
            // This prevents gaps when responsive content changes height.

            if (isOwner && sectionEl) {
                sectionEl.setAttribute("data-choreo-pin-owner", baseId)

                // Create spacer AFTER the section for external scroll room
                var spacer = document.createElement("div")
                spacer.style.setProperty("height", scrollLength + "px")
                spacer.style.setProperty("width", "100%")
                spacer.style.setProperty("pointer-events", "none")
                spacer.style.setProperty("flex-shrink", "0")
                spacer.setAttribute("data-choreo-spacer", baseId)
                if (sectionEl.parentElement) {
                    sectionEl.parentElement.insertBefore(spacer, sectionEl.nextSibling)
                }
                scrollSpacer = spacer

                // Walk UP from section, set overflow:visible on ancestors
                // with clip/hidden so position:sticky works
                var overflowNode = sectionEl.parentElement
                while (overflowNode && overflowNode !== document.documentElement) {
                    var ov = window.getComputedStyle(overflowNode).overflow
                    if (ov === "clip" || ov === "hidden") {
                        scrollOverflowAncestors.push({ el: overflowNode, orig: ov })
                        overflowNode.style.setProperty("overflow", "visible", "important")
                    }
                    overflowNode = overflowNode.parentElement
                }

                // Apply sticky positioning — browser compositor handles this
                // with zero jitter (no JS-per-frame transforms needed)
                sectionEl.style.setProperty("position", "sticky", "important")
                sectionEl.style.setProperty("top", "0px", "important")
            }

            var pinEl: HTMLElement = parent
            var pinElWidth: number = parentWidth
            var pinElHeight: number = parentHeight
            scrollPinState.origStyles = parent.style.cssText
            scrollPinEl = pinEl

            // Measure pin/scroll range
            // Calculate pinStart based on scrollStart alignment
            // "bottom" = element top reaches viewport top (latest, default)
            // "center" = element center at viewport center
            // "top" = element top enters viewport bottom (earliest)
            var measureEl = (scrollPin && sectionEl) ? sectionEl : wrapper
            var measureRect = measureEl.getBoundingClientRect()
            var measureDocTop = measureRect.top + window.scrollY
            var vh = window.innerHeight
            var startOffset = 0
            if (scrollStart === "top") {
                startOffset = -vh // start when element enters viewport bottom
            } else if (scrollStart === "center") {
                startOffset = -(vh / 2) + (measureRect.height / 2) // center-aligned
            }
            // "bottom" = 0 offset (element top at viewport top)

            var pinStart = Math.max(0, measureDocTop + startOffset)
            var totalPinLength = scrollLength
            var pinEnd = pinStart + totalPinLength
            var wrapRectLeft = pinEl.getBoundingClientRect().left

            // ── Animation creation/destruction ──
            var reduced =
                window.matchMedia &&
                window.matchMedia("(prefers-reduced-motion: reduce)").matches
            var mobile = window.innerWidth < 768

            var scrollAnimFinalStyles: Array<{ el: HTMLElement; to: Record<string, string> }> = []

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

            var bakeAndCancelAnims = function () {
                for (var bf = 0; bf < scrollAnimFinalStyles.length; bf++) {
                    var item = scrollAnimFinalStyles[bf]
                    var keys = Object.keys(item.to)
                    for (var k = 0; k < keys.length; k++) {
                        item.el.style.setProperty(keys[k], item.to[keys[k]])
                    }
                    // Animations done — unblock hover
                    item.el.style.removeProperty("pointer-events")
                }
                for (var ca = 0; ca < scrollAnims.length; ca++) {
                    try { scrollAnims[ca].cancel() } catch (e) {}
                }
                scrollAnims = []
                releasedIndices = {}
            }

            // Block pointer-events on all animated elements to prevent
            // Framer hover effects from conflicting with active animations.
            // Unblocked per-element when its animation is released (98%).
            var blockAnimatedPointerEvents = function () {
                for (var bp = 0; bp < scrollAnimFinalStyles.length; bp++) {
                    scrollAnimFinalStyles[bp].el.style.setProperty("pointer-events", "none", "important")
                }
            }

            var unbakeAndRecreateAnims = function () {
                for (var ub = 0; ub < scrollAnimFinalStyles.length; ub++) {
                    var item = scrollAnimFinalStyles[ub]
                    var keys = Object.keys(item.to)
                    for (var k = 0; k < keys.length; k++) {
                        item.el.style.removeProperty(keys[k])
                    }
                }
                releasedIndices = {}
                scrollAnimsCreated = false
                ensureScrollAnims()
                blockAnimatedPointerEvents()
            }

            var updateAnimProgress = function (progress: number) {
                for (var a = 0; a < scrollAnims.length; a++) {
                    try {
                        var anim = scrollAnims[a]
                        var timing = anim.effect && anim.effect.getComputedTiming
                            ? anim.effect.getComputedTiming()
                            : null
                        var animDelay = timing ? (timing.delay || 0) : 0
                        var animDur = timing ? (timing.duration || 600) : 600
                        var time = progress * timelineDuration
                        anim.currentTime = Math.max(0, Math.min(time, animDelay + (animDur as number)))
                    } catch (e) {}
                }
            }

            var scrollAnimsCreated = false
            var visibilityRevealed = false

            var ensureScrollAnims = function () {
                if (scrollAnimsCreated) return
                scrollAnimsCreated = true
                createScrollAnims()
                // Don't remove visibility:hidden here — keep elements
                // hidden until scroll progress > 0 to prevent flash
            }

            // interactivity is now per-element (see updateInteractivity)

            var revealIfNeeded = function (progress: number) {
                // For maskPreview, elements are already visible — skip the
                // scrollY/progress gate since there's nothing to "reveal"
                if (visibilityRevealed) return
                if (!maskPreview && (progress <= 0 || window.scrollY <= 0)) return
                visibilityRevealed = true
                for (var ph = 0; ph < preHiddenEls.length; ph++) {
                    preHiddenEls[ph].removeAttribute("data-choreo-hide")
                    preHiddenEls[ph].style.removeProperty("visibility")
                    preHiddenEls[ph].style.removeProperty("opacity")
                    preHiddenEls[ph].style.removeProperty("pointer-events")
                    // Remove inline clip-path so the animation takes over
                    preHiddenEls[ph].style.removeProperty("clip-path")
                }
                // Remove the style tag — no longer needed
                if (preHideStyleTag && preHideStyleTag.parentNode) {
                    preHideStyleTag.parentNode.removeChild(preHideStyleTag)
                    preHideStyleTag = null
                }
            }

            // Per-element animation release: when an individual element's
            // animation reaches 100%, cancel it WITHOUT setting any inline
            // styles. The element reverts to its natural CSS state (which IS
            // the animation's final frame: full opacity, no transform, no clip).
            // With no active animation AND no conflicting inline styles,
            // Framer's hover system (whileHover / inline style manipulation)
            // can freely control the element.
            var releasedIndices: Record<number, boolean> = {}

            var updateInteractivity = function (progress: number) {
                for (var ai = 0; ai < scrollAnims.length; ai++) {
                    try {
                        var anim = scrollAnims[ai]
                        var finalStyle = scrollAnimFinalStyles[ai]
                        if (!anim || !finalStyle) continue

                        var isReleased = releasedIndices[ai]

                        if (!isReleased) {
                            var at = anim.effect && anim.effect.getComputedTiming
                                ? anim.effect.getComputedTiming() : null
                            var aDelay = at ? (at.delay || 0) : 0
                            var aDur = at ? (at.duration || 600) : 600
                            var aTime = (anim.currentTime || 0) as number
                            var elEnd = aDelay + (aDur as number)

                            if (aTime >= elEnd * 0.98) {
                                // Animation complete — cancel without baking.
                                // Element reverts to CSS state = final frame.
                                releasedIndices[ai] = true
                                try { anim.cancel() } catch (e) {}
                                // Unblock pointer-events so hover effects work
                                finalStyle.el.style.removeProperty("pointer-events")
                            }
                        }
                    } catch (e) {}
                }
            }

            // When scrolling back, we need to recreate all animations.
            // This is handled by unbakeAndRecreateAnims which is already
            // called when transitioning from afterPin back to pinned zone.
            // For mid-animation scroll-back, detect and rebuild:
            var checkScrollBack = function (progress: number) {
                var anyReleased = false
                for (var ri in releasedIndices) {
                    if (releasedIndices[ri]) { anyReleased = true; break }
                }
                if (!anyReleased) return

                // Check if progress has dropped enough to need re-animation
                // If overall progress < 0.95, recreate all animations
                if (progress < 0.95) {
                    releasedIndices = {}
                    scrollAnimsCreated = false
                    ensureScrollAnims()
                    blockAnimatedPointerEvents()
                    updateAnimProgress(progress)
                }
            }

            // Create animations eagerly so they're ready for scroll
            ensureScrollAnims()
            blockAnimatedPointerEvents()
            updateAnimProgress(0)

            // ── Viewport clip helper ──
            // Clips the wrapper to viewport bounds so the mask reveal
            // aligns with the viewport edge as the element scrolls in.
            var vpClipPad = maskViewportPadding || 0
            var updateViewportClip = function () {
                if (!maskViewportClip || !wrapper) return
                var wRect = wrapper.getBoundingClientRect()
                var vpH = window.innerHeight
                var vpW = window.innerWidth
                // Overflow-based clips (content extending past viewport)
                var overflowTop = Math.max(0, -wRect.top)
                var overflowRight = Math.max(0, wRect.right - vpW)
                var overflowBottom = Math.max(0, wRect.bottom - vpH)
                var overflowLeft = Math.max(0, -wRect.left)
                // Padding-based clips (inset from viewport edge into the element)
                // Only apply padding on sides where the element reaches/extends to the viewport edge
                var padTop = (wRect.top <= vpClipPad) ? Math.max(0, vpClipPad - wRect.top) : 0
                var padRight = (wRect.right >= vpW - vpClipPad) ? Math.max(0, vpClipPad - (vpW - wRect.right)) : 0
                var padBottom = (wRect.bottom >= vpH - vpClipPad) ? Math.max(0, vpClipPad - (vpH - wRect.bottom)) : 0
                var padLeft = (wRect.left <= vpClipPad) ? Math.max(0, vpClipPad - wRect.left) : 0
                // Use whichever is larger: overflow clip or padding clip
                var clipTop = Math.round(Math.max(overflowTop, padTop))
                var clipRight = Math.round(Math.max(overflowRight, padRight))
                var clipBottom = Math.round(Math.max(overflowBottom, padBottom))
                var clipLeft = Math.round(Math.max(overflowLeft, padLeft))
                if (clipTop === 0 && clipRight === 0 && clipBottom === 0 && clipLeft === 0) {
                    wrapper.style.removeProperty("clip-path")
                } else {
                    wrapper.style.setProperty("clip-path",
                        "inset(" + clipTop + "px " + clipRight + "px " + clipBottom + "px " + clipLeft + "px)", "important")
                }
            }

            // ── Scroll handler ──
            // Sticky handles the visual pinning (zero jitter). The scroll
            // handler only scrubs animation progress and manages the
            // sticky → relative transition at pinEnd.
            var handleScroll = function () {
                if (!parent || !wrapper) return

                var scrollY = window.scrollY

                if (scrollY >= pinStart && scrollY <= pinEnd) {
                    // ── PINNED ZONE ──
                    // Sticky keeps the section in place — just scrub animations
                    ensureScrollAnims()

                    if (scrollPinState.afterPin) {
                        scrollPinState.afterPin = false
                        // Switching back from relative to sticky
                        if (isOwner && sectionEl) {
                            sectionEl.style.setProperty("position", "sticky", "important")
                            sectionEl.style.setProperty("top", "0px", "important")
                        }
                        unbakeAndRecreateAnims()
                    }

                    scrollPinState.pinned = true

                    var progress = (scrollY - pinStart) / scrollLength
                    var clampedProgress = Math.max(0, Math.min(1, progress))
                    revealIfNeeded(clampedProgress)
                    checkScrollBack(clampedProgress)
                    updateAnimProgress(clampedProgress)
                    updateInteractivity(clampedProgress)
                    updateViewportClip()

                    if (scrollOnce && clampedProgress >= 1 && !scrollPinState.completed) {
                        scrollPinState.completed = true
                        bakeAndCancelAnims()
                    }

                } else if (scrollY < pinStart) {
                    // ── BEFORE PIN ──
                    if (scrollPinState.afterPin) {
                        scrollPinState.afterPin = false
                        if (isOwner && sectionEl) {
                            sectionEl.style.setProperty("position", "sticky", "important")
                            sectionEl.style.setProperty("top", "0px", "important")
                        }
                        unbakeAndRecreateAnims()
                    }
                    scrollPinState.pinned = false
                    checkScrollBack(0)
                    updateAnimProgress(0)
                    updateInteractivity(0)
                    updateViewportClip()

                } else {
                    // ── AFTER PIN ──
                    // Switch from sticky to relative so section scrolls away.
                    // relative + top:scrollLength places the section at the
                    // exact same viewport position as sticky had it, so the
                    // transition is seamless.
                    if (!scrollPinState.afterPin) {
                        if (isOwner && sectionEl) {
                            sectionEl.style.setProperty("position", "relative", "important")
                            sectionEl.style.setProperty("top", totalPinLength + "px", "important")
                        }
                        scrollPinState.afterPin = true
                        scrollPinState.pinned = false
                        updateAnimProgress(1)
                        bakeAndCancelAnims()
                        updateInteractivity(1)
                    }
                    // Always update viewport clip while scrolling past pin end
                    // so clipping stays aligned as the section moves away
                    updateViewportClip()
                }
            }

            scrollHandler = handleScroll
            window.addEventListener("scroll", handleScroll, { passive: true })

            // ── Resize handler ──
            var handleResize = function () {
                clearTimeout(scrollResizeTimer)
                scrollResizeTimer = window.setTimeout(function () {
                    if (!wrapper || !parent) return

                    // Temporarily reset to sticky for accurate measurement
                    if (isOwner && sectionEl && scrollPinState.afterPin) {
                        sectionEl.style.setProperty("position", "sticky", "important")
                        sectionEl.style.setProperty("top", "0px", "important")
                    }

                    // Re-measure all dimensions
                    parentHeight = parent.offsetHeight
                    parentWidth = parent.offsetWidth

                    var wp = wrapper.parentElement
                    if (wp) {
                        parentWidth = wp.clientWidth
                    }
                    // wrapper height is auto — content sizes it
                    pinElWidth = parentWidth
                    pinElHeight = parentHeight

                    // Update spacer height
                    if (scrollSpacer) {
                        scrollSpacer.style.setProperty("height", scrollLength + "px")
                    }

                    // Recalculate pin range with scrollStart offset
                    totalPinLength = scrollLength
                    var resizeMeasureEl = (scrollPin && sectionEl) ? sectionEl : wrapper
                    var resizeRect = resizeMeasureEl.getBoundingClientRect()
                    var resizeVh = window.innerHeight
                    var resizeOffset = 0
                    if (scrollStart === "top") {
                        resizeOffset = -resizeVh
                    } else if (scrollStart === "center") {
                        resizeOffset = -(resizeVh / 2) + (resizeRect.height / 2)
                    }
                    pinStart = Math.max(0, resizeRect.top + window.scrollY + resizeOffset)
                    pinEnd = pinStart + totalPinLength

                    // Reset afterPin so handleScroll re-evaluates state
                    scrollPinState.afterPin = false

                    // Re-run scroll handler
                    handleScroll()
                }, 150) as unknown as number
            }
            scrollResizeHandler = handleResize
            window.addEventListener("resize", handleResize)

            // Run initial scroll check — use >= so hero sections
            // (pinStart=0) get pinned immediately on load
            if (window.scrollY >= pinStart) {
                handleScroll()
            }

            }) // end inner rAF
            }) // end outer rAF
        }

        return function () {
            // For onScroll, keep visibility:hidden — the scroll handler
            // removes it when progress > 0. Removing it here would cause
            // a flash between cleanup and re-render. For other triggers,
            // the animation itself manages visibility.
            if (trigger !== "onScroll") {
                for (var rph = 0; rph < preHiddenEls.length; rph++) {
                    try {
                        preHiddenEls[rph].style.removeProperty("visibility")
                    } catch (e) {}
                }
            }
            // Clean up style tag on unmount (but NOT on re-render
            // for onScroll — the new effect will create a fresh one)
            if (preHideStyleTag && preHideStyleTag.parentNode) {
                preHideStyleTag.parentNode.removeChild(preHideStyleTag)
            }
            if (mutObs) {
                try { mutObs.disconnect() } catch (e) {}
            }
            if (intObs) {
                try { intObs.disconnect() } catch (e) {}
            }
            // Clean up scroll-scrub
            if (scrollSetupRaf) {
                cancelAnimationFrame(scrollSetupRaf)
            }
            if (scrollResizeHandler) {
                window.removeEventListener("resize", scrollResizeHandler)
                clearTimeout(scrollResizeTimer)
            }
            if (scrollHandler) {
                window.removeEventListener("scroll", scrollHandler)
            }
            for (var sa = 0; sa < scrollAnims.length; sa++) {
                try { scrollAnims[sa].cancel() } catch (e) {}
            }
            // Restore pointer-events on animated elements
            if (typeof scrollAnimFinalStyles !== "undefined") {
                for (var pe = 0; pe < scrollAnimFinalStyles.length; pe++) {
                    try { scrollAnimFinalStyles[pe].el.style.removeProperty("pointer-events") } catch (e) {}
                }
            }
            // Restore overflow on ancestors
            for (var oc = 0; oc < scrollOverflowAncestors.length; oc++) {
                scrollOverflowAncestors[oc].el.style.setProperty("overflow", scrollOverflowAncestors[oc].orig)
            }
            scrollOverflowAncestors = []
            // Remove spacer
            if (scrollSpacer && scrollSpacer.parentElement) {
                scrollSpacer.parentElement.removeChild(scrollSpacer)
            }
            scrollSpacer = null
            // Clean section styles and release claim
            if (scrollSectionEl) {
                scrollSectionEl.style.removeProperty("position")
                scrollSectionEl.style.removeProperty("top")
                if (scrollSectionEl.getAttribute("data-choreo-pin-owner") === baseId) {
                    scrollSectionEl.removeAttribute("data-choreo-pin-owner")
                }
            }
            if (scrollWrapper && scrollWrapper.parentElement && parent) {
                scrollWrapper.parentElement.insertBefore(parent, scrollWrapper)
                scrollWrapper.parentElement.removeChild(scrollWrapper)
            }
            scrollPinEl = null
            unregisterAll(getStore())
        }
    }, [
        baseId, scanMode, excludeSelector, splitText, trigger, viewOffset, viewRepeat, scrollLength, scrollStart, scrollPin, scrollOnce,
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
                }
            }}
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
        defaultValue: "cmsItems",
        options: ["siblings", "cmsItems", "cmsNested"],
        optionTitles: ["Siblings", "CMS Items", "CMS Nested"],
        description: "Siblings: direct children of parent. CMS Items: auto-find CMS list. CMS Nested: use when placed inside a CMS item to target all sibling items in the collection.",
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
        type: ControlType.Boolean,
        title: "Split Text",
        defaultValue: false,
        description: "Animate each line of text separately.",
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
    scrollPin: {
        type: ControlType.Boolean,
        title: "Pin Section",
        defaultValue: true,
        description: "When enabled, the section stays pinned (sticky) while the scroll animation plays. When disabled, the section scrolls naturally while the animation scrubs.",
        hidden: function (props: any) { return props.trigger !== "onScroll" },
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
        title: "↳ Direction",
        defaultValue: "left",
        options: ["left", "right", "up", "down", "topLeft", "topRight", "bottomLeft", "bottomRight"],
        optionTitles: ["Left → Right", "Right → Left", "Top → Bottom", "Bottom → Top", "↘ Top-Left", "↙ Top-Right", "↗ Bottom-Left", "↖ Bottom-Right"],
        hidden: function (props: any) {
            return props.enterEnabled === false || props.enterPreset !== "maskReveal"
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
        options: ["left", "right", "up", "down", "topLeft", "topRight", "bottomLeft", "bottomRight"],
        optionTitles: ["Left → Right", "Right → Left", "Top → Bottom", "Bottom → Top", "↘ Top-Left", "↙ Top-Right", "↗ Bottom-Left", "↖ Bottom-Right"],
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
            "bottomToTop", "rowMajor", "columnMajor",
        ],
        optionTitles: [
            "Left → Right", "Right → Left", "Top → Bottom",
            "Bottom → Top", "Row Major", "Column Major",
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
            var enterMatch = props.enterEnabled !== false && props.enterPreset === "maskReveal"
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
            var enterMatch = props.enterEnabled !== false && props.enterPreset === "maskReveal"
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
            return props.enterPreset !== "maskReveal"
        },
    },
    maskPreview: {
        type: ControlType.Boolean,
        title: "↳ Show Preview",
        defaultValue: false,
        description: "When enabled, shows the element at its Mask Start percentage on mount instead of hiding it until the scroll animation begins.",
        hidden: function (props: any) {
            return props.enterPreset !== "maskReveal" || (props.maskStart || 0) <= 0 || props.trigger !== "onScroll"
        },
    },
    maskViewportClip: {
        type: ControlType.Boolean,
        title: "↳ Viewport Clip",
        defaultValue: false,
        description: "Clips the reveal to the viewport edge so the mask never extends past the screen boundary. Use Viewport Padding to add consistent inset from the edges.",
        hidden: function (props: any) {
            return props.enterPreset !== "maskReveal" || props.trigger !== "onScroll"
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
            return props.enterPreset !== "maskReveal" || props.trigger !== "onScroll" || !props.maskViewportClip
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
            var enterMatch = props.enterEnabled !== false && props.enterPreset === "maskReveal"
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
