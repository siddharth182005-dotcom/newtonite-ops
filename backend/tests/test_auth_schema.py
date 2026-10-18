import pytest
from pydantic import ValidationError

from app.config import settings
from app.schemas import LoginIn


def test_login_accepts_reserved_test_domain_in_development(monkeypatch):
    monkeypatch.setattr(settings, "environment", "development")

    request = LoginIn(email="admin@demo.test", password="not-logged")

    assert request.email == "admin@demo.test"


def test_login_rejects_reserved_test_domain_in_production(monkeypatch):
    monkeypatch.setattr(settings, "environment", "production")

    with pytest.raises(ValidationError):
        LoginIn(email="admin@demo.test", password="not-logged")


def test_login_keeps_normal_email_validation_in_production(monkeypatch):
    monkeypatch.setattr(settings, "environment", "production")

    assert LoginIn(email="admin@newtonite.dev", password="not-logged").email == "admin@newtonite.dev"

    with pytest.raises(ValidationError):
        LoginIn(email="not-an-email", password="not-logged")
