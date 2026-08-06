"""Verificación visual del rediseño Dashboard Pro.
Crea usuario+equipos+sesiones+partidos+jugadores por API, entra por UI
y captura screenshots de las rutas clave (desktop 1440 y móvil 375).
Reporta errores de consola. NO limpia: usar scripts/cleanup_test.mjs."""
import time, json, urllib.request, datetime, sys
from playwright.sync_api import sync_playwright

BASE = "http://localhost:4200"
U = f"t{int(time.time())}"
PW = "test1234"
OUT = "/tmp/redesign"

def api(path, payload=None, token=None, method=None):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method or ("POST" if data else "GET"))
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read() or b"{}")

reg = api("/api/auth/register", {
    "username": U, "password": PW, "email": f"{U}@example.com",
    "firstName": "Test", "lastName": "Redesign", "birthDate": "1990-01-01",
    "role": "entrenador",
})
token = reg["token"]

today = datetime.date.today()
teams = []
for name, cat, color in [("Sénior Femenino", "Senior", "#22d3ee"),
                         ("Juvenil Masculino", "Juvenil", "#a855f7"),
                         ("Cadete Femenino", "Cadete", "#22c55e")]:
    t = api("/api/teams", {"name": name, "category": cat, "gender": "female", "color": color}, token)["team"]
    teams.append(t)

TYPES = ["ataque", "defensa", "transicion", "preparacion"]
for i, t in enumerate(teams):
    for p in range(4):
        api("/api/players", {"teamId": t["id"], "name": f"Jugadora {i}{p}", "number": p + 1}, token)
    for d in (-6, -3, -1, 0, 2, 5):
        api("/api/sessions", {
            "teamId": t["id"],
            "title": f"Sesión {TYPES[d % 4]} {t['name'].split()[0]}",
            "date": str(today + datetime.timedelta(days=d)),
            "duration": 90,
            "sessionType": TYPES[d % 4],
        }, token)
    api("/api/matches", {"teamId": t["id"], "date": str(today + datetime.timedelta(days=3 + i)),
                         "time": "18:30", "opponent": f"CB Rival {i}", "homeAway": "home" if i % 2 else "away",
                         "venue": "Pabellón Huerta del Rey"}, token)
    api("/api/matches", {"teamId": t["id"], "date": str(today - datetime.timedelta(days=4)),
                         "time": "12:00", "opponent": f"CD Pasado {i}", "homeAway": "home",
                         "goalsFor": 28, "goalsAgainst": 24}, token)

print("usuario:", U, "equipos:", [t["id"] for t in teams])

T0 = teams[0]["id"]
sess = api(f"/api/sessions?teamId={T0}", token=token)
sid = (sess.get("sessions") or sess)[0]["id"] if (sess.get("sessions") or sess) else None
mts = api(f"/api/matches?teamId={T0}", token=token)
mid = (mts.get("matches") or mts)[0]["id"] if (mts.get("matches") or mts) else None
ROUTES = ["/", "/calendar", "/teams", f"/teams/{T0}/players", f"/teams/{T0}/sessions",
          f"/teams/{T0}/matches", "/sessions/new", "/matches/new", "/profile"]
if sid: ROUTES.append(f"/sessions/{sid}")
if mid: ROUTES.append(f"/matches/{mid}")
errors = []

with sync_playwright() as pw:
    b = pw.chromium.launch(channel="chrome")

    def run(label, width, height, routes):
        page = b.new_page(viewport={"width": width, "height": height})
        page.on("console", lambda m: errors.append(f"{label} [{m.type}] {m.text}") if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(f"{label} [pageerror] {e}"))
        page.goto(BASE + "/")
        page.wait_for_timeout(1500)
        page.locator("form input:not([type=password])").first.fill(U)
        page.locator('input[type="password"]').first.fill(PW)
        page.get_by_role("button", name="Entrar").click()
        page.wait_for_timeout(2500)
        for r in routes:
            page.goto(BASE + r)
            page.wait_for_timeout(2200)
            body = page.inner_text("body").strip()
            print(f"  {label} {r} -> {len(body)} chars")
            page.screenshot(path=f"{OUT}/{label}{r.replace('/','_') or '_home'}.png", full_page=True)
        # click a un día del calendario para ver el panel
        page.goto(BASE + "/calendar")
        page.wait_for_timeout(2000)
        cells = page.locator(f"text='{today.day}'")
        if cells.count():
            cells.first.click()
            page.wait_for_timeout(1200)
            page.screenshot(path=f"{OUT}/{label}_calendar_day.png", full_page=True)
        page.close()

    run("desktop", 1440, 900, ROUTES)
    run("mobile", 375, 812, ROUTES)
    b.close()

print("\nERRORES DE CONSOLA:", len(errors))
for e in errors[:40]:
    print(" -", e)
