from fastapi import APIRouter

from app.api.v1.routers import admin, auth, demo_enquiries, health, observations, products, phase4

router = APIRouter(prefix="/api/v1")
router.include_router(health.router)
router.include_router(auth.router)
router.include_router(products.router)
router.include_router(demo_enquiries.router)
router.include_router(observations.router)
router.include_router(phase4.router)
router.include_router(admin.router)
