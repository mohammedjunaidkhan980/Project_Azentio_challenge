"""Real HTTP checks for approved-only search and small-cohort suppression.

Uses synthetic accounts and a new synthetic product. --cleanup withdraws test
contributions after browser inspection. No source text or credentials logged.
"""
import argparse
import json
import uuid
import time
from pathlib import Path

import httpx


def run(path: Path, cleanup: bool):
    f = json.loads(path.read_text())
    with httpx.Client(base_url="http://127.0.0.1:8000/api/v1", timeout=15) as api:
        for attempt in range(30):
            try:
                api.get("/health").raise_for_status()
                break
            except httpx.HTTPError:
                if attempt == 29:
                    raise RuntimeError("Loopback FastAPI readiness timed out") from None
                time.sleep(.5)
        tokens = {}
        for role, user in f["users"].items():
            r = api.post("/auth/login", json={"email": user["email"], "password": user["password"]})
            assert r.status_code == 200
            tokens[role] = r.json()["data"]["access_token"]

        def call(method, route, role, body=None, expected=200):
            r = api.request(method, route, json=body, headers={"Authorization": "Bearer " + tokens[role]})
            assert r.status_code == expected, f"{method} {route.split('?')[0]}: {r.status_code}, expected {expected}"
            return r.json().get("data")

        if cleanup:
            for item in f["last_theme_journey"]["observations"]:
                obs = call("GET", "/observations/" + item["id"], item["role"])
                if obs["consent_status"] == "granted":
                    call("DELETE", "/observations/" + item["id"] + "/consent", item["role"], {"reason": "Synthetic test cleanup"})
            assert call("GET", "/learning-themes?product_id=" + f["last_theme_journey"]["product_id"], "client_a") == []
            print("PASS theme fixtures withdrawn and suppressed; no mock data or tokens persisted")
            return

        suffix = uuid.uuid4().hex[:10]
        product = call("POST", "/products", "admin", {"name": "SYNTHETIC Theme " + suffix,
            "slug": "synthetic-theme-" + suffix, "is_published": True}, expected=201)["id"]
        call("POST", "/product-improvements", "owner", {"title": "Not entitled",
            "description": "Synthetic permission denial", "product_id": product,
            "organisation_id": f["organisations"]["a"]}, expected=403)
        for org in ["a", "b", "c"]:
            call("POST", "/entitlements/product", "admin", {"organisation_id": f["organisations"][org], "product_id": product})
        observations = []
        f["last_theme_journey"] = {"product_id": product, "suffix": suffix, "observations": observations}
        def publish(role):
            obs = call("POST", "/observations", role, {"title": "Synthetic private " + suffix,
                "description": "PRIVATE-THEME-SOURCE " + suffix, "organisation_id": f["users"][role]["organisation_id"],
                "product_id": product, "category": "PRIVATE-THEME-SOURCE category"}, expected=201)
            observations.append({"id": obs["id"], "role": role})
            path.write_text(json.dumps(f, indent=2))
            call("POST", f"/observations/{obs['id']}/consent", role, {"reason": "Explicit synthetic publication permission"})
            call("POST", f"/moderation/observations/{obs['id']}/decision", "moderator", {"decision": "approved",
                "redacted_title": "Seasonality " + suffix, "redacted_content": "Approved seasonal cash-flow context " + suffix})
            return call("POST", f"/moderation/observations/{obs['id']}/publish", "moderator")
        route = "/learning-themes?product_id=" + product
        for role in ["client_a", "client_a", "client_a", "client_b"]:
            publish(role)
            assert call("GET", route, "client_a") == []
        published = publish("client_c")
        call("GET", "/shared-learning/" + published["id"], "owner")
        themes = call("GET", route, "client_a")
        assert len(themes) == 1 and themes[0]["distinct_organisations"] == 3
        assert len(themes[0]["supporting_contributions"]) == 5
        assert call("GET", route, "owner")[0]["distinct_organisations"] == 3
        assert "PRIVATE-THEME-SOURCE" not in json.dumps(themes)
        assert "source_organisation_id" not in json.dumps(themes)
        for role in ["employee", "admin", "moderator"]:
            call("GET", route, role, expected=403)
        for query, count in [(suffix, 5), ("PRIVATE-THEME-SOURCE", 0), ("%", 0), ("_", 0)]:
            r = api.get("/shared-learning", params={"product_id": product, "q": query},
                headers={"Authorization": "Bearer " + tokens["client_a"]})
            assert r.status_code == 200 and len(r.json()["data"]) == count and r.json()["meta"]["total"] == count
            assert all(item["category"] is None for item in r.json()["data"])
        call("DELETE", "/observations/" + observations[-1]["id"] + "/consent", "client_c", {"reason": "Synthetic privacy withdrawal"})
        assert call("GET", route, "client_a") == []
        call("GET", "/shared-learning/" + published["id"], "owner", expected=404)
        # Leave a newly reviewed third-org copy for the real browser theme check.
        publish("client_c")
        f["last_theme_journey"] = {"product_id": product, "suffix": suffix, "observations": observations}
        path.write_text(json.dumps(f, indent=2))
        print("PASS real MySQL search: approved-only/literal wildcards/counts; three-org cohort vs repeated posts; role denials; withdrawal suppresses theme and evidence")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--credentials-file", type=Path, required=True)
    parser.add_argument("--cleanup", action="store_true")
    args = parser.parse_args()
    run(args.credentials_file, args.cleanup)
