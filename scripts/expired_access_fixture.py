"""Emit an already-expired JWT for a loopback development negative test only.

The browser harness captures stdout in memory; never log/store this output.
There is intentionally no option to issue a usable token or a future expiry.
"""
import sys
import uuid
from datetime import datetime, timedelta, timezone
from jose import jwt
from sqlalchemy.engine import make_url
from app.core.config import settings

url = make_url(settings.DATABASE_URL)
assert settings.APP_ENV == "development" and url.host in {"127.0.0.1", "localhost"}
assert url.database == "azentio_dev" and url.drivername.startswith("mysql")
subject = str(uuid.UUID(sys.argv[1]))
past = datetime.now(timezone.utc) - timedelta(minutes=1)
print(jwt.encode({"sub": subject, "type": "access", "iat": past - timedelta(minutes=1), "exp": past},
                 settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM))
