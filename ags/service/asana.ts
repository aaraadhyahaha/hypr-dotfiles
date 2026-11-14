import GLib from "gi://GLib"
import Soup from "gi://Soup?version=3.0"
import Secret from "gi://Secret"
import { createState, type Accessor } from "ags"
import { execAsync } from "ags/process"
import { isoDay } from "../widget/desktop/dates"
import { mondayOf, parseTasks, type AsanaTask } from "./asanaModel"

// Your Asana "My Tasks" for the desktop's Asana Day widget. Read-only: only GET requests.
// The Personal Access Token lives in the keyring: `secret-tool store --label="Asana PAT" service asana`.
// Fetches every open task plus those finished since the shown week's Monday, so one read covers
// the whole week strip. Refreshes on start, on a week change, and every 5 minutes while the
// desktop can be seen.

export type AsanaProblem = "no-token" | "auth" | "offline" | "error" | null

const API = "https://app.asana.com/api/1.0"
const EVERY_S = 300
const FIELDS = "name,completed,due_on,due_at,permalink_url,projects.name"
const MAX_PAGES = 20 // 2000 tasks; a guard against an offset that never ends

const [tasks, setTasks] = createState<AsanaTask[] | null>(null)
const [problem, setProblem] = createState<AsanaProblem>(null)
const [week, setWeekState] = createState(mondayOf(isoDay(new Date())))
export { tasks as asanaTasks, problem as asanaProblem, week as asanaWeek }

// secret-tool stores under its generic schema, so match on the attribute alone
const SCHEMA = Secret.Schema.new("org.freedesktop.Secret.Generic", Secret.SchemaFlags.DONT_MATCH_NAME, {
  service: Secret.SchemaAttributeType.STRING,
})

function lookupToken(): Promise<string | null> {
  return new Promise((resolve) => {
    Secret.password_lookup(SCHEMA, { service: "asana" }, null, (_s, res) => {
      try {
        resolve(Secret.password_lookup_finish(res)?.trim() || null)
      } catch (e) {
        console.error("asana: keyring lookup failed", e)
        resolve(null)
      }
    })
  })
}

class HttpError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`)
  }
}

const session = new Soup.Session({ timeout: 20, userAgent: "ags-desktop" })

function get(path: string, token: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const msg = Soup.Message.new("GET", `${API}${path}`)
    if (!msg) return reject(new Error(`bad url ${path}`))
    msg.get_request_headers().append("Authorization", `Bearer ${token}`)
    msg.get_request_headers().append("Accept", "application/json")
    session.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, null, (_s, res) => {
      try {
        const bytes = session.send_and_read_finish(res)
        const status = msg.get_status()
        if (status < 200 || status >= 300) return reject(new HttpError(status))
        resolve(new TextDecoder().decode(bytes.get_data() ?? new Uint8Array()))
      } catch (e) {
        reject(e) // network: DNS, refused, timeout
      }
    })
  })
}

let token: string | null = null
let listGid: string | null = null

async function myTaskList(t: string): Promise<string> {
  if (listGid) return listGid
  const me = JSON.parse(await get("/users/me?opt_fields=workspaces.name", t))
  const ws = me?.data?.workspaces?.[0]?.gid
  if (typeof ws !== "string") throw new Error("no workspace")
  const list = JSON.parse(await get(`/users/me/user_task_list?workspace=${ws}&opt_fields=gid`, t))
  if (typeof list?.data?.gid !== "string") throw new Error("no My Tasks list")
  return (listGid = list.data.gid)
}

async function fetchWeek(t: string, monday: string): Promise<AsanaTask[]> {
  const gid = await myTaskList(t)
  // local midnight of the Monday, as UTC: Asana compares completion instants
  const [y, m, d] = monday.split("-").map(Number)
  const since = new Date(y, m - 1, d).toISOString()
  const out: AsanaTask[] = []
  let offset: string | null = null
  for (let i = 0; i < MAX_PAGES; i++) {
    const q = `completed_since=${encodeURIComponent(since)}&limit=100&opt_fields=${FIELDS}`
    const page = parseTasks(await get(`/user_task_lists/${gid}/tasks?${q}${offset ? `&offset=${encodeURIComponent(offset)}` : ""}`, t))
    if (!page) throw new Error("unreadable tasks page")
    out.push(...page.tasks)
    if (!(offset = page.next)) break
  }
  return out
}

let running = false
let again = false

export async function refreshAsana() {
  if (running) {
    again = true
    return
  }
  running = true
  try {
    token ??= await lookupToken()
    if (!token) {
      setProblem("no-token")
      return
    }
    const monday = week.get()
    const got = await fetchWeek(token, monday)
    // a week change while this was in flight: `again` brings the right one
    if (monday === week.get()) setTasks(got)
    setProblem(null)
  } catch (e) {
    // keep the last good tasks on screen; the widget says what's wrong
    if (e instanceof HttpError && (e.status === 401 || e.status === 403)) {
      token = null // re-read the keyring next time, in case it was replaced
      listGid = null
      setProblem("auth")
    } else if (e instanceof HttpError) {
      console.error("asana:", e.message)
      setProblem("error")
    } else if (e instanceof GLib.Error) {
      setProblem("offline")
    } else {
      console.error("asana: refresh failed", e)
      setProblem("error")
    }
  } finally {
    running = false
    if (again) {
      again = false
      refreshAsana()
    }
  }
}

// the widget's week strip moved: fetch that week's finished tasks too
export function setAsanaWeek(monday: string) {
  if (monday === week.get()) return
  setWeekState(monday)
  refreshAsana()
}

let started = false

// call from any widget that shows Asana data; the first call starts the refresh loop.
// While the desktop is hidden, ticks are skipped and one catch-up read runs when it shows.
export function useAsana(live: Accessor<boolean>) {
  if (started) return
  started = true
  let stale = false
  refreshAsana()
  GLib.timeout_add_seconds(GLib.PRIORITY_LOW, EVERY_S, () => {
    if (live.get()) refreshAsana()
    else stale = true
    return GLib.SOURCE_CONTINUE
  })
  live.subscribe(() => {
    if (live.get() && stale) {
      stale = false
      refreshAsana()
    }
  })
}

export function openTask(url: string) {
  execAsync(["xdg-open", url]).catch(console.error)
}
