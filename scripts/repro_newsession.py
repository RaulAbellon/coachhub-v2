"""Reproduce el fallo de pantalla en negro al crear sesión.
Crea usuario+equipo por API, entra en la app y navega a /sessions/new.
Captura errores de consola. Limpia el usuario al final."""
import time, json, urllib.request, sys
from playwright.sync_api import sync_playwright

BASE = "http://localhost:4200"
U = f"t{int(time.time())}"
PW = "test1234"

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
    "firstName": "Test", "lastName": "Repro", "birthDate": "1990-01-01",
    "role": "entrenador",
})
token = reg["token"]
team = api("/api/teams", {"name": "Equipo Repro", "category": "Senior", "gender": "female"}, token)
print("user", U, "team", team["team"]["id"])

errors = []
with sync_playwright() as pw:
    b = pw.chromium.launch(channel="chrome")
    page = b.new_page()
    page.on("console", lambda m: errors.append(f"[{m.type}] {m.text}") if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(f"[pageerror] {e}"))
    page.on("requestfailed", lambda r: errors.append(f"[reqfail] {r.url} {r.failure}"))

    page.goto(BASE + "/")
    page.wait_for_timeout(1500)
    # login por UI
    page.locator("form input:not([type=password])").first.fill(U)
    page.locator('input[type="password"]').first.fill(PW)
    page.get_by_role("button", name="Entrar").click()
    page.wait_for_timeout(2500)
    print("URL tras login:", page.url)
    print("body login:", repr(page.inner_text("body")[:150]))

    # 1) navegación SPA (como el usuario: pulsar el botón)
    page.goto(BASE + "/calendar") if "/calendar" not in page.url else None
    page.wait_for_timeout(1500)
    btns = page.get_by_text("Nueva sesión")
    print("botones 'Nueva sesión':", btns.count())
    if btns.count():
        btns.first.click()
        page.wait_for_timeout(2500)
        print("URL:", page.url)
        body = page.inner_text("body")
        print(f"SPA /sessions/new -> {len(body.strip())} chars")
        print(repr(body[:400]))
        page.screenshot(path="/tmp/spa_newsession.png", full_page=True)

    # 2) todas las rutas clave, carga directa
    for route in ["/sessions/new", "/matches/new", "/calendar", "/teams", "/profile"]:
        page.goto(BASE + route)
        page.wait_for_timeout(2000)
        body = page.inner_text("body").strip()
        ok = "OK " if len(body) > 40 else "VACIA "
        print(f"  {ok}{route} -> {len(body)} chars, inputs={page.locator('input').count()}")
        if len(body) <= 40:
            page.screenshot(path=f"/tmp/vacia{route.replace('/','_')}.png", full_page=True)

    # 3) rellenar y guardar una sesion de verdad
    page.goto(BASE + "/sessions/new")
    page.wait_for_timeout(2000)
    page.locator("input[type=text]").first.fill("Sesion Repro")
    page.get_by_role("button", name="Guardar sesión").click() if page.get_by_role("button", name="Guardar sesión").count() else page.locator("button:has-text('Guardar')").first.click()
    page.wait_for_timeout(3000)
    print("  tras guardar ->", page.url, repr(page.inner_text("body")[:120]))

    b.close()

print("\n=== ERRORES ===")
for e in errors:
    print(e)
if not errors:
    print("(ninguno)")
print("\nCLEANUP_USER=" + U)
