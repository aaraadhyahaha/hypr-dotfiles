import GLib from "gi://GLib"

export type Phase = "focus" | "short" | "long"

export interface Settings {
    focus: number
    short: number
    long: number
    longEvery: number
    goal: number
}

export interface Day {
    sessions: number
    minutes: number
}

export interface PomodoroState {
    phase: Phase
    remaining: number
    total: number
    running: boolean
    task: string
    cycle: number
}

interface Saved {
    phase: Phase
    remaining: number
    total: number
    running: boolean
    endWall: number
    task: string
    cycle: number
}

interface Data {
    settings: Settings
    days: Record<string, Day>
    timer?: Saved
}

const DIR = `${GLib.get_user_data_dir()}/pomodoro`
const FILE = `${DIR}/data.json`
const SOUND = "/usr/share/sounds/freedesktop/stereo/complete.oga"

const DEFAULTS: Settings = { focus: 25, short: 5, long: 15, longEvery: 4, goal: 8 }

export const dayKey = (d: Date): string =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

function load(): Data {
    try {
        const [ok, bytes] = GLib.file_get_contents(FILE)
        if (ok) {
            const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Partial<Data>
            return {
                settings: { ...DEFAULTS, ...parsed.settings },
                days: parsed.days ?? {},
                timer: parsed.timer,
            }
        }
    } catch {

    }
    return { settings: { ...DEFAULTS }, days: {} }
}

function save(data: Data): void {
    try {
        GLib.mkdir_with_parents(DIR, 0o755)
        GLib.file_set_contents(FILE, new TextEncoder().encode(JSON.stringify(data)))
    } catch (e) {
        console.error("pomodoro: save failed", e)
    }
}

function run(argv: string[]): void {
    try {
        GLib.spawn_async(null, argv, null, GLib.SpawnFlags.SEARCH_PATH, null)
    } catch (e) {
        console.error("pomodoro: spawn failed", e)
    }
}

class Pomodoro {
    private data: Data = load()
    private listeners = new Set<() => void>()
    private endAt = 0
    private source = 0

    state: PomodoroState = {
        phase: "focus",
        remaining: 0,
        total: 0,
        running: false,
        task: "",
        cycle: 0,
    }

    constructor() {
        const saved = this.data.timer
        if (saved) this.restore(saved)
        else this.applyPhase("focus")
    }

    subscribe(cb: () => void): () => void {
        this.listeners.add(cb)
        return () => this.listeners.delete(cb)
    }

    private emit(): void {
        for (const cb of this.listeners) cb()
    }

    get settings(): Settings {
        return this.data.settings
    }

    get days(): Record<string, Day> {
        return this.data.days
    }

    get today(): Day {
        return this.data.days[dayKey(new Date())] ?? { sessions: 0, minutes: 0 }
    }

    get streak(): number {
        const cur = new Date()
        if (!this.data.days[dayKey(cur)]?.sessions) cur.setDate(cur.getDate() - 1)
        let n = 0
        while (this.data.days[dayKey(cur)]?.sessions) {
            n++
            cur.setDate(cur.getDate() - 1)
        }
        return n
    }

    get fraction(): number {
        const { total, remaining, running } = this.state
        if (total <= 0) return 0
        if (!running) return remaining / total
        const left = Math.max(0, (this.endAt - GLib.get_monotonic_time()) / 1_000_000)
        return left / total
    }


    toggle(): void {
        if (this.state.running) this.pause()
        else this.start()
    }

    start(): void {
        if (this.state.running) return
        this.endAt = GLib.get_monotonic_time() + this.state.remaining * 1_000_000
        this.state.running = true
        this.schedule()
        this.persist()
        this.emit()
    }

    pause(): void {
        if (!this.state.running) return
        this.stopTimer()
        this.persist()
        this.emit()
    }

    reset(): void {
        this.stopTimer()
        this.applyPhase(this.state.phase)
        this.persist()
        this.emit()
    }

    skip(): void {
        this.stopTimer()
        this.advance(false)
        this.emit()
    }

    setTask(task: string): void {
        this.state.task = task
        this.persist()
        this.emit()
    }

    // a fresh focus session of `mins` (default: the setting) without changing the setting
    startFocus(mins?: number, task?: string): void {
        this.stopTimer()
        this.applyPhase("focus")
        if (mins) {
            this.state.total = mins * 60
            this.state.remaining = mins * 60
        }
        if (task !== undefined) this.state.task = task
        this.start()
    }

    setSettings(patch: Partial<Settings>): void {
        this.data.settings = { ...this.data.settings, ...patch }
        if (!this.state.running && this.state.remaining === this.state.total) {
            this.applyPhase(this.state.phase)
        }
        this.persist()
        this.emit()
    }

    private persist(): void {
        const { phase, remaining, total, running, task, cycle } = this.state
        this.data.timer = {
            phase,
            remaining,
            total,
            running,
            endWall: running ? Date.now() + remaining * 1000 : 0,
            task,
            cycle,
        }
        save(this.data)
    }

    private restore(t: Saved): void {
        const validPhase = t.phase === "focus" || t.phase === "short" || t.phase === "long"
        if (!validPhase || !(t.total > 0)) {
            this.applyPhase("focus")
            return
        }

        this.state.phase = t.phase
        this.state.total = t.total
        this.state.task = t.task ?? ""
        this.state.cycle = t.cycle ?? 0

        if (t.running) {
            const left = Math.ceil((t.endWall - Date.now()) / 1000)
            if (left > 0) {
                this.state.remaining = Math.min(left, t.total)
                this.start()
            } else {
                this.applyPhase(t.phase)
            }
        } else {
            this.state.remaining = Math.min(Math.max(0, t.remaining), t.total)
        }
    }

    private stopTimer(): void {
        if (this.source) {
            GLib.source_remove(this.source)
            this.source = 0
        }
        this.state.running = false
    }

    private applyPhase(phase: Phase): void {
        const minutes = this.data.settings[phase]
        this.state.phase = phase
        this.state.total = minutes * 60
        this.state.remaining = minutes * 60
    }

    // wake just after the shown second turns over, instead of polling several times a second
    private schedule(): void {
        const us = this.endAt - GLib.get_monotonic_time()
        const ms = Math.ceil((us % 1_000_000 || 1_000_000) / 1000) + 5
        this.source = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => this.tick())
    }

    private tick(): boolean {
        this.source = 0
        const left = Math.max(0, Math.ceil((this.endAt - GLib.get_monotonic_time()) / 1_000_000))
        if (left === 0) {
            this.state.running = false
            this.advance(true)
            this.emit()
            return GLib.SOURCE_REMOVE
        }
        if (left !== this.state.remaining) {
            this.state.remaining = left
            this.emit()
        }
        // a listener may have paused it during emit
        if (this.state.running) this.schedule()
        return GLib.SOURCE_REMOVE
    }

    private advance(finished: boolean): void {
        const { phase, task } = this.state
        const s = this.data.settings

        if (phase === "focus") {
            if (finished) {
                const key = dayKey(new Date())
                const day = this.data.days[key] ?? { sessions: 0, minutes: 0 }
                day.sessions += 1
                day.minutes += Math.round(this.state.total / 60)
                this.data.days[key] = day
                this.state.cycle += 1
            }
            const long = this.state.cycle > 0 && this.state.cycle % s.longEvery === 0
            this.applyPhase(long ? "long" : "short")
        } else {
            this.applyPhase("focus")
        }

        this.persist()

        if (finished) {
            const next = this.state.phase
            const title = phase === "focus" ? "Focus session done" : "Break over"
            const body =
                phase === "focus"
                    ? `${task ? task + " - " : ""}take a ${s[next]} min break`
                    : "Ready for the next focus session"
            run(["notify-send", "-a", "Pomodoro", title, body])
            run(["paplay", SOUND])
        }
    }
}

export const pomodoro = new Pomodoro()