"""
Verify MySQL connection and create the azentio_db database.
Usage:
    set MYSQL_ROOT_PASSWORD=your_password
    .venv\Scripts\python.exe scripts\create_db.py
"""
import asyncio
import os
import sys

import asyncmy


async def main():
    password = os.environ.get("MYSQL_ROOT_PASSWORD", "")
    host = os.environ.get("MYSQL_HOST", "localhost")
    port = int(os.environ.get("MYSQL_PORT", "3306"))
    user = os.environ.get("MYSQL_USER", "root")
    db_name = "azentio_db"

    print(f"Connecting to MySQL at {host}:{port} as {user} ...")
    try:
        conn = await asyncmy.connect(host=host, port=port, user=user, password=password)
    except Exception as e:
        print(f"ERROR: Could not connect to MySQL: {e}")
        sys.exit(1)

    print("Connected successfully.")
    async with conn.cursor() as cur:
        await cur.execute(
            f"CREATE DATABASE IF NOT EXISTS `{db_name}` "
            f"CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
        )
        await cur.execute("SHOW DATABASES;")
        rows = await cur.fetchall()
        databases = [r[0] for r in rows]

    await conn.ensure_closed()

    if db_name in databases:
        print(f"Database '{db_name}' exists and is ready.")
    else:
        print(f"ERROR: Database '{db_name}' was not created.")
        sys.exit(1)


asyncio.run(main())
