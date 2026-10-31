"""Real HTTP journey against the isolated synthetic MySQL demo; no API mocks.

Use --credentials-file produced by seed_local_demo. Prints evidence, never tokens.
"""
import argparse
import json
import time
import uuid
from pathlib import Path

import httpx


def run(path: Path):
    fixture = json.loads(path.read_text())
    api = httpx.Client(base_url="http://127.0.0.1:8000/api/v1", timeout=15)
    for attempt in range(30):
        try:
            api.get("/health").raise_for_status()
            break
        except httpx.HTTPError:
            if attempt == 29:
                raise RuntimeError("Loopback FastAPI did not become ready") from None
            time.sleep(.5)
    tokens = {}
    checks = 0

    def request(method, route, role=None, body=None, expected=200):
        nonlocal checks
        response = api.request(method, route, json=body,
            headers={"Authorization": "Bearer " + tokens[role]} if role else {})
        assert response.status_code == expected, f"{method} {route.split('?')[0]}: expected {expected}, received {response.status_code}"
        checks += 1
        return response.json().get("data")

    request("GET", "/health")
    request("GET", "/auth/me", expected=401)
    for role, user in fixture["users"].items():
        auth = request("POST", "/auth/login", body={"email": user["email"], "password": user["password"]})
        tokens[role] = auth["access_token"]
        me = request("GET", "/auth/me", role)
        assert me["id"] == user["id"]
        if role == "admin":
            auth = request("POST", "/auth/refresh", body={"refresh_token": auth["refresh_token"]})
            tokens[role] = auth["access_token"]
    print("PASS real HTTP authentication: all synthetic roles, 401 and refresh")
    product = fixture["product_id"]
    assert any(p["id"] == product for p in request("GET", "/products"))
    request("GET", "/products/" + product)
    for org in ["a", "b"]:
        request("POST", "/entitlements/product", "admin", {
            "organisation_id": fixture["organisations"][org], "product_id": product, "is_active": True})
    marker = "Synthetic HTTP " + uuid.uuid4().hex[:10]
    payload = {"title": marker, "description": "PRIVATE-SOURCE synthetic original must never cross tenants.",
        "organisation_id": fixture["organisations"]["a"], "product_id": product}
    request("POST", "/observations", "client_b", payload, expected=403)
    obs = request("POST", "/observations", "client_a", payload, expected=201)
    oid = obs["id"]
    assert obs["consent_status"] == "not_granted"
    request("GET", "/observations/" + oid, "client_b", expected=404)
    request("GET", "/observations?organisation_id=" + fixture["organisations"]["a"], "client_b", expected=403)
    assert not any(o["id"] == oid for o in request("GET", "/moderation/observations", "moderator"))
    request("POST", f"/observations/{oid}/consent", "client_b", {"reason": "Foreign tenant"}, expected=404)
    request("POST", f"/observations/{oid}/consent", "peer_a", {"reason": "Not the author"}, expected=403)
    request("POST", f"/observations/{oid}/consent", "client_a", {"reason": "Explicit synthetic shared-learning permission"})
    assert any(o["id"] == oid for o in request("GET", "/moderation/observations", "moderator"))
    decision = {"decision": "approved", "redacted_title": marker + " approved", "redacted_content": "Reviewed fictional payment calculation insight only."}
    request("POST", f"/moderation/observations/{oid}/decision", "client_a", decision, expected=403)
    request("POST", f"/moderation/observations/{oid}/publish", "moderator", expected=409)
    request("POST", f"/moderation/observations/{oid}/decision", "moderator", decision)
    shared = request("POST", f"/moderation/observations/{oid}/publish", "moderator")
    sid = shared["id"]
    safe = request("GET", "/shared-learning/" + sid, "client_b")
    assert safe["title"] == decision["redacted_title"] and safe["content"] == decision["redacted_content"]
    assert not any(k in safe for k in ["observation_id", "source_organisation_id", "description", "created_by_user_id"])
    assert "PRIVATE-SOURCE" not in json.dumps(safe)
    request("GET", "/shared-learning/" + sid, "client_c", expected=404)
    print("PASS real HTTP tenant isolation, explicit consent, moderation, approved-copy allowlist and entitlement denial")
    improvement = request("POST", "/product-improvements", "owner", {"title": marker + " improvement",
        "description": "Synthetic evidence-linked improvement for local verification.", "product_id": product,
        "organisation_id": fixture["organisations"]["a"], "evidence_entry_ids": [sid]}, expected=201)
    iid = improvement["id"]
    request("PATCH", f"/product-improvements/{iid}/status", "owner", {"status": "completed"}, expected=409)
    request("PATCH", f"/product-improvements/{iid}/status", "owner", {"status": "under_review", "reason": "Synthetic review"})
    assert any(i["id"] == iid and i["status"] == "under_review" for i in request("GET", "/product-improvements", "client_a"))
    request("DELETE", f"/observations/{oid}/consent", "peer_a", {"reason": "Not the author"}, expected=403)
    start = time.monotonic()
    request("DELETE", f"/observations/{oid}/consent", "client_a", {"reason": "Synthetic author withdrawal"})
    request("GET", "/shared-learning/" + sid, "client_b", expected=404)
    assert not any(e["id"] == sid for e in request("GET", "/shared-learning", "client_b"))
    idea = next(i for i in request("GET", "/product-improvements", "client_a") if i["id"] == iid)
    assert all(not e["active"] and e["title"] is None for e in idea["evidence"])
    elapsed = time.monotonic() - start
    assert elapsed < 60
    assert any(e["resource_id"] == oid for e in request("GET", "/audit-events", "admin"))
    print(f"PASS real HTTP improvements, invalid transition, audit and withdrawal/evidence invalidation ({elapsed:.2f}s)")
    fixture["last_http_journey"] = {"observation_id": oid, "shared_id": sid, "improvement_id": iid}
    path.write_text(json.dumps(fixture, indent=2))
    api.close()
    print(f"PASS {checks} real HTTP assertions; FastAPI database is configured separately, verify MySQL independently")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--credentials-file", type=Path, required=True)
    run(parser.parse_args().credentials_file)
