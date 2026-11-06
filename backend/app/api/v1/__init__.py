from fastapi import APIRouter

from app.api.v1 import audit, auth, health, plants, query, report, uploads, users

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(auth.router, tags=["auth"])
api_router.include_router(users.router, tags=["users"])
api_router.include_router(plants.router, tags=["plants"])
api_router.include_router(uploads.router, tags=["uploads"])
api_router.include_router(query.router, tags=["query"])
api_router.include_router(report.router, tags=["report"])
api_router.include_router(audit.router, tags=["audit"])
