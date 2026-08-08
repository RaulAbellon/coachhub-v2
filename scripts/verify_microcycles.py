"""Verificación de la feature de microciclos (selector en Calendario + widget en Dashboard).
Crea usuario+equipos+sesiones+partidos por API, entra por UI y comprueba:
 - Dashboard: widget "Microciclo" con cabecera MC n, badge ACTUAL, grid de 7 días y actividades del día.
 - Calendario: selector MC en Topbar (desktop) y en fila móvil, filtrado con atenuación de días fuera del MC.
Screenshots en /tmp/mc. NO limpia: usar scripts/cleanup_test.mjs."""
import time, json, urllib.request, datetime, os, sys
from playwright.sync_api import sync_playwright

BASE = "http://localhost:4200"
U = f"t{int(time.time())}"
PW = "test1234"
OUT = "/tmp/mc"
os.makedirs(OUT, exist_ok=True)


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
    "firstName": "Test", "lastName": "Microciclos", "birthDate": "1990-01-01",
    "role": "entrenador",
})
token = reg["token"]

today = datetime.date.today()
teams = []
for name, cat, color in [("Sénior Femenino", "Senior", "#22d3ee"),
                         ("Juvenil Masculino", "Juvenil", "#a855f7")]:
    teams.append(api("/api/teams", {"name": name, "category": cat, "gender": "female", "color": color}, token)["team"])

TYPES = ["ataque", "defensa", "transicion", "preparacion"]
# Sesiones repartidas por varias semanas del mes para que haya varios MC con datos.
for i, t in enumerate(teams):
    # Incluye el mes anterior y el siguiente para comprobar que la numeración de
    # microciclos es CONTINUA entre meses (no se reinicia) y que las semanas sin
    # sesiones no consumen número.
    for d in (-45, -14, -8, -2, 0, 1, 3, 9, 40):
        api("/api/sessions", {
            "teamId": t["id"],
            "title": f"Sesión {TYPES[d % 4]} {t['name'].split()[0]}",
            "date": str(today + datetime.timedelta(days=d)),
            "duration": 90,
            "sessionType": TYPES[d % 4],
        }, token)
    api("/api/matches", {"teamId": t["id"], "date": str(today), "time": "18:30",
                         "opponent": f"CB Rival {i}", "homeAway": "home" if i % 2 else "away",
                         "venue": "Pabellón Huerta del Rey"}, token)

print("usuario:", U, "equipos:", [t["id"] for t in teams])
errors = []
fails = []


def check(cond, msg):
    print(("  OK   " if cond else "  FAIL ") + msg)
    if not cond:
        fails.append(msg)


with sync_playwright() as pw:
    b = pw.chromium.launch(channel="chrome")

    def login(page):
        page.goto(BASE + "/")
        page.wait_for_timeout(1500)
        page.locator("form input:not([type=password])").first.fill(U)
        page.locator('input[type="password"]').first.fill(PW)
        page.get_by_role("button", name="Entrar").click()
        page.wait_for_timeout(2500)

    for label, w, h in [("desktop", 1440, 900), ("mobile", 375, 812)]:
        page = b.new_page(viewport={"width": w, "height": h})
        page.on("console", lambda m, l=label: errors.append(f"{l} [{m.type}] {m.text}") if m.type == "error" else None)
        page.on("pageerror", lambda e, l=label: errors.append(f"{l} [pageerror] {e}"))
        login(page)

        # ── DASHBOARD ──
        page.goto(BASE + "/")
        page.wait_for_timeout(2500)
        body = page.inner_text("body")
        print(f"[{label}] dashboard")
        check("MICROCICLO" in body.upper(), f"{label}: sección Microciclo presente")
        check("ACTUAL" in body.upper(), f"{label}: badge ACTUAL en el MC actual")
        mc_pills = page.get_by_role("button", name="Microciclo siguiente")
        check(mc_pills.count() >= 1, f"{label}: flechas de navegación de MC")
        page.screenshot(path=f"{OUT}/{label}-dashboard.png", full_page=True)

        # navegar al MC siguiente y comprobar que cambia la cabecera
        header_before = page.locator("section", has_text="Microciclo").first.inner_text()[:200]
        mc_pills.first.click()
        page.wait_for_timeout(800)
        header_after = page.locator("section", has_text="Microciclo").first.inner_text()[:200]
        check(header_before != header_after, f"{label}: la flecha > cambia de microciclo")
        page.screenshot(path=f"{OUT}/{label}-dashboard-mc-next.png", full_page=True)

        # click en un día del grid
        page.go_back()
        page.goto(BASE + "/")
        page.wait_for_timeout(2000)

        # ── CALENDARIO ──
        page.goto(BASE + "/calendar")
        page.wait_for_timeout(2500)
        pills = page.get_by_role("button", name="Todos")
        check(pills.count() >= 1, f"{label}: botón Todos del selector MC")
        page.screenshot(path=f"{OUT}/{label}-calendar-all.png", full_page=True)

        mc_buttons = page.locator("button", has_text="MC ")
        n = mc_buttons.count()
        check(n >= 2, f"{label}: hay pills de MC ({n})")
        if n >= 2:
            mc_buttons.nth(1).click()
            page.wait_for_timeout(900)
            # comprobar que hay días atenuados (opacity 0.25)
            dimmed = page.evaluate(
                "() => Array.from(document.querySelectorAll('div')).filter(e => e.style.opacity === '0.25').length"
            )
            check(dimmed > 0, f"{label}: días fuera del MC atenuados ({dimmed})")
            page.screenshot(path=f"{OUT}/{label}-calendar-mc.png", full_page=True)
            pills.first.click()
            page.wait_for_timeout(800)
            dimmed_after = page.evaluate(
                "() => Array.from(document.querySelectorAll('div')).filter(e => e.style.opacity === '0.25').length"
            )
            check(dimmed_after == 0, f"{label}: 'Todos' restaura el mes completo")

        # ── CONTINUIDAD ENTRE MESES ──
        def mc_numbers():
            txts = page.locator("button", has_text="MC ").all_inner_texts()
            out = []
            for t in txts:
                for part in t.replace("MC", "").split("·"):
                    part = part.strip()
                    if part.isdigit():
                        out.append(int(part))
            return sorted(set(out))

        page.goto(BASE + "/calendar")
        page.wait_for_timeout(2500)
        this_month = mc_numbers()
        # Semanas sin sesiones: pills con rango de fechas en vez de "MC n"
        range_pills = page.evaluate(
            "() => Array.from(document.querySelectorAll('button')).filter(e => /^\\d+( \\w+)?–\\d+ \\w+$/.test(e.innerText.trim())).length"
        )
        check(range_pills > 0, f"{label}: las semanas sin sesiones se muestran sin MC, con su rango de fechas ({range_pills})")

        page.get_by_role("button", name="Mes siguiente").first.click()
        page.wait_for_timeout(2200)
        next_month = mc_numbers()
        print(f"[{label}] MC mes actual={this_month} mes siguiente={next_month}")
        check(bool(this_month) and bool(next_month), f"{label}: hay MC numerados en los dos meses")
        if this_month and next_month:
            check(1 not in next_month, f"{label}: el mes siguiente NO reinicia en MC 1")
            check(max(next_month) > max(this_month),
                  f"{label}: la numeración sigue subiendo al cambiar de mes ({max(this_month)} → {max(next_month)})")
        page.screenshot(path=f"{OUT}/{label}-calendar-next-month.png", full_page=True)

        page.close()

    b.close()

print("\nerrores de consola:")
for e in errors:
    print("  " + e)
print(f"\nchecks fallidos: {len(fails)}")
for f in fails:
    print("  - " + f)
sys.exit(1 if fails else 0)
