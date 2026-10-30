import asyncio
import asyncmy


async def main():
    conn = await asyncmy.connect(
        host="localhost", port=3306, user="root", password="root", db="azentio_db"
    )
    async with conn.cursor() as cur:
        await cur.execute("SHOW TABLES;")
        rows = await cur.fetchall()
    await conn.ensure_closed()
    tables = [r[0] for r in rows]
    print("Tables in azentio_db:")
    for t in tables:
        print(f"  {t}")
    expected = {"alembic_version", "organisations", "products", "users", "organisation_memberships", "demo_enquiries"}
    missing = expected - set(tables)
    if missing:
        print(f"MISSING: {missing}")
    else:
        print("All expected tables present.")


asyncio.run(main())
