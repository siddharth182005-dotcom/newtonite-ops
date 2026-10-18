import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from .config import settings

log = logging.getLogger("newtonite")


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str, details: dict | None = None):
        self.status, self.code, self.message, self.details = status, code, message, details


def body(code, message, details=None):
    return {"error": {"code": code, "message": message, "details": details}}


def install(app: FastAPI):
    @app.exception_handler(ApiError)
    async def _api(_: Request, e: ApiError):
        return JSONResponse(body(e.code, e.message, e.details), status_code=e.status)

    @app.exception_handler(RequestValidationError)
    async def _val(_: Request, e: RequestValidationError):
        errs = [{"loc": list(x["loc"]), "msg": x["msg"]} for x in e.errors()]
        return JSONResponse(body("validation_error", "Request validation failed", {"errors": errs}), status_code=422)

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, e: StarletteHTTPException):
        return JSONResponse(body("http_error", str(e.detail)), status_code=e.status_code)

    @app.exception_handler(Exception)
    async def _any(_: Request, e: Exception):
        log.exception("unhandled error")
        msg = "Internal server error" if settings.environment == "production" else repr(e)
        return JSONResponse(body("internal_error", msg), status_code=500)
