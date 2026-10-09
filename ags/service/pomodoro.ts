import GLib from "gi://GLib"

export type Phase = "focus" | "short" | "long"

export interface Settings {
    focus: number // minutes
    short: number // minutes
    long: number // minutes
    longEvery: number // long break after N focus sessions
    goal: number // focus sessions per day
}

export interface Day {
    sessions: number
    minutes: number
}

export interface PomodoroState {
    phase: Phase
    remaining: number // seconds
    total: number // seconds
    running: boolean
    task: string
    cycle: number // focus sessions completed in the current cycle
}

interface Data {
    settings: Settings
    days: Record<string, Day>
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
            }
        }
    } catch {
        // first run or unreadable file: fall through to defaults
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
    private endAt = 0 // monotonic microseconds
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
        this.applyPhase("focus")
    }

    // ---- reactive-ish API -------------------------------------------------

    subscribe(cb: () => void): () => void {
        this.listeners.add(cb)
        return () => this.listeners.delete(cb)
    }

    private emit(): void {
        for (const cb of this.listeners) cb()
    }

    get fraction(): number {
    const { total, remaining, running } = this.state
    if (total <= 0) return 0
    if (!running) return remaining / total
    const left = Math.max(0, (this.endAt - GLib.get_monotonic_time()) / 1_000_000)
    return left / total
}

    // ---- read helpers -----------------------------------------------------

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

    // ---- controls ---------------------------------------------------------

    toggle(): void {
        if (this.state.running) this.pause()
        else this.start()
    }

    start(): void {
        if (this.state.running) return
        this.endAt = GLib.get_monotonic_time() + this.state.remaining * 1_000_000
        this.state.running = true
        this.source = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 250, () => this.tick())
        this.emit()
    }

    pause(): void {
        if (!this.state.running) return
        this.stopTimer()
        this.emit()
    }

    reset(): void {
        this.stopTimer()
        this.applyPhase(this.state.phase)
        this.emit()
    }

    skip(): void {
        this.stopTimer()
        this.advance(false)
        this.emit()
    }

    setTask(task: string): void {
        this.state.task = task
        this.emit()
    }

    setSettings(patch: Partial<Settings>): void {
        this.data.settings = { ...this.data.settings, ...patch }
        save(this.data)
        // only retime the current phase if it has not been started yet
        if (!this.state.running && this.state.remaining === this.state.total) {
            this.applyPhase(this.state.phase)
        }
        this.emit()
    }

    // ---- internals --------------------------------------------------------

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

    private tick(): boolean {
        const left = Math.max(0, Math.ceil((this.endAt - GLib.get_monotonic_time()) / 1_000_000))
        if (left === 0) {
            this.source = 0
            this.state.running = false
            this.advance(true)
            this.emit()
            return GLib.SOURCE_REMOVE
        }
        if (left !== this.state.remaining) {
            this.state.remaining = left
            this.emit()
        }
        return GLib.SOURCE_CONTINUE
    }

    // finished = timer ran out naturally (counts the session, plays sound)
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
                save(this.data)
            }
            const long = this.state.cycle > 0 && this.state.cycle % s.longEvery === 0
            this.applyPhase(long ? "long" : "short")
        } else {
            this.applyPhase("focus")
        }

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