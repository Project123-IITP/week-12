import os, time, sys
from playwright.sync_api import sync_playwright, expect

URL = "http://localhost:3000"
results = []
def check(name, cond, extra=""):
    results.append((name, bool(cond)))
    print(("PASS " if cond else "FAIL ") + name + (f"  [{extra}]" if extra else ""))

def texts(page, sel):
    return [t.strip() for t in page.locator(sel).all_inner_texts()]

with sync_playwright() as p:
    browser = p.chromium.launch()
    errors = {"A": [], "B": []}
    ctxA = browser.new_context(viewport={"width": 1100, "height": 700})
    ctxB = browser.new_context(viewport={"width": 1100, "height": 700})
    A, B = ctxA.new_page(), ctxB.new_page()
    A.on("console", lambda m: errors["A"].append(m.text) if m.type == "error" else None)
    B.on("console", lambda m: errors["B"].append(m.text) if m.type == "error" else None)
    A.on("pageerror", lambda e: errors["A"].append(str(e)))
    B.on("pageerror", lambda e: errors["B"].append(str(e)))
    A.goto(URL); B.goto(URL)

    # 2/3 socket connection + status on login screen
    expect(A.get_by_test_id("connection-status")).to_have_text("Connected", timeout=5000)
    check("Socket connects, status shows Connected", True)

    # 4 username validation
    A.get_by_test_id("join-button").click()
    check("Empty username rejected", A.get_by_test_id("notice").is_visible() and A.get_by_test_id("username-input").is_visible(),
          texts(A, "[data-testid=notice]")[0])
    A.get_by_test_id("username-input").fill("   ")
    A.get_by_test_id("join-button").click()
    check("Whitespace-only username rejected", A.get_by_test_id("notice").is_visible())
    A.get_by_test_id("username-input").fill("R")
    A.get_by_test_id("join-button").click()
    check("1-char username rejected", "at least 2" in A.get_by_test_id("notice").inner_text())
    A.get_by_test_id("username-input").fill("a" * 25)
    A.get_by_test_id("join-button").click()
    check("Over-long username rejected", "20 characters" in A.get_by_test_id("notice").inner_text())
    A.screenshot(path="screenshots/01-login-error.png")

    A.get_by_test_id("username-input").fill("  Ravi  ")
    A.get_by_test_id("join-button").click()
    expect(A.get_by_test_id("logged-in-as")).to_contain_text("Ravi")
    check("Valid username joins; shows 'Logged in as: Ravi'", A.get_by_test_id("logged-in-as").inner_text().strip() == "Logged in as: Ravi")

    # duplicate username from B
    B.get_by_test_id("username-input").fill("ravi")
    B.get_by_test_id("join-button").click()
    expect(B.get_by_test_id("notice")).to_contain_text("already taken")
    check("Duplicate username (case-insensitive) rejected", True)
    B.get_by_test_id("username-input").fill("Nakul")
    B.get_by_test_id("join-button").click()
    expect(B.get_by_test_id("logged-in-as")).to_contain_text("Nakul")

    # 5 General room
    expect(A.get_by_test_id("room-title")).to_have_text("General")
    expect(B.get_by_test_id("room-title")).to_have_text("General")
    expect(A.get_by_test_id("room-members")).to_contain_text("Nakul", timeout=3000)
    check("Both land in General; roster shows both", "Ravi" in A.get_by_test_id("room-members").inner_text() and "Nakul" in A.get_by_test_id("room-members").inner_text(),
          A.get_by_test_id("room-members").inner_text())

    # 7/8 messaging both ways + no duplicates (StrictMode)
    A.get_by_test_id("message-input").fill("Hello Nakul")
    A.get_by_test_id("send-button").click()
    expect(B.get_by_test_id("message").filter(has_text="Hello Nakul")).to_have_count(1, timeout=3000)
    check("Nakul instantly receives 'Hello Nakul' exactly once", True)
    time.sleep(0.5)
    check("Ravi's own view has exactly one copy (no duplicates)", A.get_by_test_id("message").filter(has_text="Hello Nakul").count() == 1)
    check("Own message right-aligned (data-own=true)", A.get_by_test_id("message").first.get_attribute("data-own") == "true")
    check("Other's message left-aligned (data-own=false)", B.get_by_test_id("message").first.get_attribute("data-own") == "false")
    B.get_by_test_id("message-input").fill("Hi Ravi!")
    B.get_by_test_id("message-input").press("Enter")
    expect(A.get_by_test_id("message").filter(has_text="Hi Ravi!")).to_have_count(1, timeout=3000)
    check("Bidirectional: Ravi receives 'Hi Ravi!'", True)

    # 9/10 typing
    B.get_by_test_id("message-input").press_sequentially("typing now", delay=60)
    expect(A.get_by_test_id("typing-indicator")).to_contain_text("Nakul is typing...", timeout=3000)
    check("Typing indicator shows 'Nakul is typing...' for Ravi", True)
    check("Nakul does not see his own typing indicator", B.get_by_test_id("typing-indicator").inner_text().strip() == "")
    A.screenshot(path="screenshots/02-typing.png")
    expect(A.get_by_test_id("typing-indicator")).to_have_text("", timeout=4000)
    check("Typing indicator clears after idle (typing_stop)", True)
    B.get_by_test_id("message-input").fill("")  # clear for next steps

    # throttle check: count typing events emitted by B during 40 keystrokes
    B.evaluate("""() => { window.__typingCount = 0; const s = window.__sock; }""")

    # 11/12 room switching & isolation
    B.get_by_test_id("room-tech-support").click()
    expect(B.get_by_test_id("room-title")).to_have_text("Tech Support")
    check("Nakul switched to Tech Support; message list reset", B.get_by_test_id("message").count() == 0)
    expect(A.get_by_test_id("room-members")).not_to_contain_text("Nakul", timeout=3000)
    check("Ravi's roster no longer lists Nakul", True)

    A.get_by_test_id("message-input").fill("General message")
    A.get_by_test_id("send-button").click()
    expect(A.get_by_test_id("message").filter(has_text="General message")).to_have_count(1)
    time.sleep(1.0)
    check("ISOLATION: Nakul (Tech Support) did NOT receive 'General message'", B.get_by_text("General message").count() == 0)

    B.get_by_test_id("message-input").fill("Tech Support message")
    B.get_by_test_id("send-button").click()
    expect(B.get_by_test_id("message").filter(has_text="Tech Support message")).to_have_count(1)
    time.sleep(1.0)
    check("ISOLATION: Ravi (General) did NOT receive 'Tech Support message'", A.get_by_text("Tech Support message").count() == 0)

    # typing isolation
    B.get_by_test_id("message-input").press_sequentially("secret typing", delay=40)
    time.sleep(0.8)
    check("Typing in Tech Support is not shown in General", A.get_by_test_id("typing-indicator").inner_text().strip() == "")
    B.get_by_test_id("message-input").fill("")

    A.screenshot(path="screenshots/03-general-ravi.png")
    B.screenshot(path="screenshots/04-techsupport-nakul.png")

    # switching back shows stale state cleared; join same room again
    A.get_by_test_id("room-tech-support").click()
    expect(A.get_by_test_id("room-members")).to_contain_text("Nakul", timeout=3000)
    A.get_by_test_id("message-input").fill("Now we are together")
    A.get_by_test_id("send-button").click()
    expect(B.get_by_test_id("message").filter(has_text="Now we are together")).to_have_count(1, timeout=3000)
    check("Both in Tech Support: messages flow again", True)

    # typing indicator clears when typer switches room mid-typing
    B.get_by_test_id("message-input").press_sequentially("abc", delay=30)
    expect(A.get_by_test_id("typing-indicator")).to_contain_text("Nakul is typing", timeout=3000)
    B.get_by_test_id("room-general").click()
    expect(A.get_by_test_id("typing-indicator")).to_have_text("", timeout=3000)
    check("Typing indicator reset when typer switches rooms", True)
    B.get_by_test_id("room-tech-support").click()
    expect(B.get_by_test_id("room-title")).to_have_text("Tech Support")

    # validation in UI
    B.get_by_test_id("message-input").fill("   ")
    B.get_by_test_id("send-button").click()
    check("Empty message rejected in UI", B.get_by_test_id("input-error").is_visible(), B.get_by_test_id("input-error").inner_text())
    B.get_by_test_id("message-input").fill("x" * 520)
    B.get_by_test_id("send-button").click()
    check("Over-500-char message rejected in UI", "too long" in B.get_by_test_id("input-error").inner_text())
    B.get_by_test_id("message-input").fill("x" * 500)
    B.get_by_test_id("send-button").click()
    time.sleep(0.5)
    check("Exactly-500-char message accepted", A.get_by_test_id("message").filter(has_text="x" * 50).count() == 1)

    # 13 disconnect handling: really kill the backend, then restart it
    import subprocess, os
    subprocess.run(["pkill", "-f", "node server.js"])
    expect(B.get_by_test_id("connection-status")).not_to_have_text("Connected", timeout=10000)
    st = B.get_by_test_id("connection-status").inner_text()
    check("Backend killed: status leaves 'Connected'", st != "Connected", st)
    check("Backend killed: input disabled + reconnect banner", B.get_by_test_id("message-input").is_disabled() and "reconnect" in " ".join(texts(B, "[data-testid=notice]")).lower() + "connecting")
    time.sleep(3)
    check("Still no connection after retries: shows Connection error/Connecting/Disconnected", B.get_by_test_id("connection-status").inner_text() in ("Connection error","Connecting","Disconnected"), B.get_by_test_id("connection-status").inner_text())
    B.screenshot(path="screenshots/05-backend-down.png")
    subprocess.Popen(f"cd {os.path.join(os.path.dirname(os.path.abspath(__file__)), chr(46)+chr(46), 'backend')} && exec node server.js > /dev/null 2>&1", shell=True, start_new_session=True)
    expect(B.get_by_test_id("connection-status")).to_have_text("Connected", timeout=30000)
    expect(A.get_by_test_id("connection-status")).to_have_text("Connected", timeout=30000)
    check("Backend restarted: both clients auto-reconnect", True)
    expect(B.get_by_test_id("message-input")).to_be_enabled()
    time.sleep(2.0)  # allow login + join_room re-run
    B.get_by_test_id("message-input").fill("after reconnect")
    B.get_by_test_id("send-button").click()
    expect(A.get_by_test_id("message").filter(has_text="after reconnect")).to_have_count(1, timeout=5000)
    check("After server restart both clients auto re-login + re-join; messages flow", True)

    # disconnect notice: close B page
    ctxB.close()
    expect(A.get_by_test_id("system-message").filter(has_text="disconnected")).to_have_count(1, timeout=5000)
    check("A sees 'Nakul disconnected' when B closes", True)

    # backend down
    A.screenshot(path="screenshots/06-a-final.png")
    check("No browser console/page errors on A", not [e for e in errors["A"] if "ERR_INTERNET_DISCONNECTED" not in e], str(errors["A"][:3]))
    browser.close()

fails = [n for n, ok in results if not ok]
print(f"\n{len(results)-len(fails)}/{len(results)} checks passed")
sys.exit(1 if fails else 0)
