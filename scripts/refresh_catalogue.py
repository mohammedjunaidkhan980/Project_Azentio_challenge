"""Refresh local demonstration marketing copy; preserve IDs and evidence links.

Offering concepts are presentation content, not a claim of released capability.
Only known integration-test products are unpublished, never deleted.
"""
import asyncio

from sqlalchemy import select
from sqlalchemy.engine import make_url

from app.core.config import settings
from app.db.session import AsyncSessionLocal, engine
from app.models.product import Product


CATALOGUE = [
    {"slug": "synthetic-demo-analysis", "name": "Financial Analysis Intelligence", "category": "Lending",
     "description": "Bring financial statements, cash-flow trends and key ratios into a consistent review workflow. Help lending teams assess business performance, understand seasonal patterns and build a clearer evidence base for credit decisions."},
    {"slug": "document-intelligence", "name": "Document Intelligence", "category": "Operations",
     "description": "Bring structure to document-intensive operations. Organise information from financial and business documents, keep supporting evidence close to each review and route exceptions to the right teams."},
    {"slug": "risk-compliance-intelligence", "name": "Risk & Compliance Intelligence", "category": "Risk & compliance",
     "description": "Connect risk signals, policy requirements and supporting evidence in one review workflow. Help risk and compliance teams prioritise exceptions, document assessments and maintain a clear audit trail."},
]


async def refresh(db):
    url = make_url(settings.DATABASE_URL)
    if settings.APP_ENV != "development" or url.host not in {"localhost", "127.0.0.1"} or url.database != "azentio_dev":
        raise RuntimeError("Catalogue refresh is restricted to the isolated local development database")
    products = {}
    for content in CATALOGUE:
        product = await db.scalar(select(Product).where(Product.slug == content["slug"]))
        if product is None:
            product = Product(**content, is_published=True)
            db.add(product)
        else:
            for key, value in content.items():
                setattr(product, key, value)
            product.is_published = True
        await db.flush()
        products[content["slug"]] = product
    archived = 0
    for product in (await db.execute(select(Product).where(Product.slug.startswith("synthetic-theme-")))).scalars():
        if product.is_published:
            product.is_published = False
            archived += 1
    return products, archived


async def main():
    async with AsyncSessionLocal.begin() as db:
        products, archived = await refresh(db)
    await engine.dispose()
    print(f"Catalogue refreshed: {len(products)} offerings; {archived} integration products unpublished; IDs retained")


if __name__ == "__main__":
    asyncio.run(main())
