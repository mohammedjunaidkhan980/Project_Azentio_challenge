"""Real HTTP/MySQL permission audit; private credentials never printed.

Only the isolated synthetic database is eligible. Temporary verification/tenant
flags are restored in finally blocks, even when an assertion fails.
"""
import argparse
import asyncio
import json
import uuid
from pathlib import Path

import httpx
from sqlalchemy import text

from app.core.config import settings
from app.db.session import engine
from sqlalchemy.engine import make_url


async def run(path: Path):
    url = make_url(settings.DATABASE_URL)
    assert url.host in {"localhost", "127.0.0.1"} and url.database == "azentio_dev"
    assert settings.APP_ENV == "development" and url.drivername.startswith("mysql")
    f = json.loads(path.read_text())
    results = []
    async with httpx.AsyncClient(base_url="http://127.0.0.1:8000/api/v1", timeout=15) as api:
        tokens = {}
        for role, u in f["users"].items():
            r = await api.post("/auth/login", json={"email": u["email"], "password": u["password"]})
            assert r.status_code == 200
            tokens[role] = r.json()["data"]["access_token"]

        async def check(label, method, route, role, expected, body=None):
            r = await api.request(method, route, json=body,
                headers={"Authorization": "Bearer " + tokens[role]} if role else {})
            ok = r.status_code == expected
            results.append({"case": label, "status": "PASS" if ok else "FAIL", "expected": expected, "actual": r.status_code})
            return r

        for route in ["/observations", "/moderation/observations", "/admin/users", "/shared-learning", "/product-improvements"]:
            await check("public denied " + route, "GET", route, None, 401)
        for role in ["client_a", "employee", "owner"]:
            await check(role + " cannot manage users", "GET", "/admin/users", role, 403)
            await check(role + " cannot moderate", "GET", "/moderation/observations", role, 403)
        await check("portal admin has no implicit moderation grant", "GET", "/moderation/observations", "admin", 403)
        await check("moderator cannot manage users", "GET", "/admin/users", "moderator", 403)
        await check("employee has no publishing grant", "PATCH", "/products/" + str(uuid.uuid4()), "employee", 403, {"name": "Synthetic forbidden edit"})
        await check("owner has no publishing grant", "PATCH", "/products/" + str(uuid.uuid4()), "owner", 403, {"name": "Synthetic forbidden edit"})
        await check("moderator cannot grant entitlements", "POST", "/entitlements/product", "moderator", 403,
            {"organisation_id": f["organisations"]["a"], "product_id": f["product_id"]})
        oid = f["last_browser_journey"]["observation_id"]
        for role in ["client_b", "employee", "moderator", "admin", "owner"]:
            await check(role + " cannot read private client original", "GET", "/observations/" + oid, role, 404 if role == "client_b" else 403)
        for role in ["employee", "owner_b", "admin", "moderator"]:
            r = await api.get("/product-improvements", headers={"Authorization": "Bearer " + tokens[role]})
            leaked = any(i["organisation_id"] == f["organisations"]["a"] for i in r.json().get("data", []))
            results.append({"case": role + " cannot read unassigned tenant A improvements", "status": "FAIL" if leaked else "PASS"})
        await check("admin cannot change unassigned improvement", "PATCH", "/product-improvements/" + f["last_browser_journey"]["improvement_id"] + "/status", "admin", 403, {"status": "planned"})

        peer_id = f["users"]["peer_a"]["id"]
        detail = await check("admin can read membership administration", "GET", "/admin/users/" + peer_id, "admin", 200)
        membership = detail.json()["data"]["memberships"][0]
        await check("admin membership update persists", "PATCH", f"/admin/users/{peer_id}/memberships/{membership['id']}",
            "admin", 200, {"role": membership["role"], "is_active": membership["is_active"]})
        async with engine.connect() as db:
            count = (await db.execute(text("SELECT COUNT(*) FROM audit_events WHERE action='membership.updated' AND actor_user_id=:actor AND resource_id=:resource"),
                {"actor": f["users"]["admin"]["id"], "resource": membership["id"]})).scalar_one()
        results.append({"case": "membership update has persisted actor/resource audit", "status": "PASS" if count else "FAIL"})

        # An owner grant in B must not reveal internal A fields via a client-A grant.
        existing_b = next((m for m in detail.json()["data"]["memberships"] if m["organisation_id"] == f["organisations"]["b"]), None)
        admin_headers = {"Authorization": "Bearer " + tokens["admin"]}
        base = f"/admin/users/{peer_id}/memberships"
        if existing_b:
            temp_id = existing_b["id"]
            granted = await api.patch(base + "/" + temp_id, headers=admin_headers, json={"role": "product_owner", "is_active": True})
        else:
            granted = await api.post(base, headers=admin_headers, json={"organisation_id": f["organisations"]["b"], "role": "product_owner"})
            temp_id = granted.json()["data"]["id"]
        assert granted.status_code in {200, 201}
        try:
            ideas = await api.get("/product-improvements", headers={"Authorization": "Bearer " + tokens["peer_a"]})
            target = next(i for i in ideas.json()["data"] if i["id"] == f["last_browser_journey"]["improvement_id"])
            results.append({"case": "mixed client-A/owner-B membership hides A internal description", "status": "PASS" if target["description"] == "" else "FAIL"})
        finally:
            if existing_b:
                restored = await api.patch(base + "/" + temp_id, headers=admin_headers,
                    json={"role": existing_b["role"], "is_active": existing_b["is_active"]})
            else:
                restored = await api.delete(base + "/" + temp_id, headers=admin_headers)
            assert restored.status_code == 200

        async with engine.begin() as db:
            old_verified = (await db.execute(text("SELECT is_verified FROM users WHERE id=:id"), {"id": f["users"]["client_a"]["id"]})).scalar_one()
            await db.execute(text("UPDATE users SET is_verified=0 WHERE id=:id"), {"id": f["users"]["client_a"]["id"]})
        try:
            await check("unverified existing access token denied", "GET", "/observations", "client_a", 403)
            u = f["users"]["client_a"]
            await check("unverified login denied", "POST", "/auth/login", None, 401, {"email": u["email"], "password": u["password"]})
        finally:
            async with engine.begin() as db:
                await db.execute(text("UPDATE users SET is_verified=:value WHERE id=:id"), {"value": old_verified, "id": f["users"]["client_a"]["id"]})
        async with engine.begin() as db:
            old_active = (await db.execute(text("SELECT is_active FROM organisations WHERE id=:id"), {"id": f["organisations"]["a"]})).scalar_one()
            await db.execute(text("UPDATE organisations SET is_active=0 WHERE id=:id"), {"id": f["organisations"]["a"]})
        try:
            await check("inactive tenant admin grant denied", "GET", "/admin/users", "admin", 403)
            await check("inactive tenant moderator grant denied", "GET", "/moderation/observations", "moderator", 403)
            r = await api.get("/product-improvements", headers={"Authorization": "Bearer " + tokens["owner"]})
            results.append({"case": "inactive owner tenant cannot read improvements", "status": "PASS" if r.json().get("data") == [] else "FAIL"})
        finally:
            async with engine.begin() as db:
                await db.execute(text("UPDATE organisations SET is_active=:value WHERE id=:id"), {"value": old_active, "id": f["organisations"]["a"]})
    await engine.dispose()
    for result in results:
        print(result["status"], result["case"], f"({result.get('actual', '')})")
    print(f"{sum(r['status']=='PASS' for r in results)}/{len(results)} real role boundary checks passed")
    if any(r["status"] == "FAIL" for r in results):
        raise SystemExit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--credentials-file", type=Path, required=True)
    asyncio.run(run(parser.parse_args().credentials_file))
