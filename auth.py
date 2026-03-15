"""Simple username/password authentication with session management."""
import os
import hashlib
import hmac
import secrets
import logging
from functools import wraps
from flask import request, jsonify, session, redirect, url_for

logger = logging.getLogger(__name__)

# Default credentials (override via env vars or through first-run setup)
DEFAULT_USERNAME = os.environ.get("BOOKER_USERNAME", "admin")
DEFAULT_PASSWORD = os.environ.get("BOOKER_PASSWORD", "booker")


def _hash_password(password: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 260_000).hex()


def check_credentials(username: str, password: str, settings_model) -> bool:
    stored_user = settings_model.get("auth_username") or DEFAULT_USERNAME
    stored_hash = settings_model.get("auth_password_hash")
    stored_salt = settings_model.get("auth_password_salt")

    if stored_hash and stored_salt:
        if username != stored_user:
            return False
        computed = _hash_password(password, stored_salt)
        return hmac.compare_digest(computed, stored_hash)
    else:
        # No stored credentials yet – use env/default values
        return username == DEFAULT_USERNAME and password == DEFAULT_PASSWORD


def set_password(username: str, password: str, settings_model):
    """Hash and store new credentials."""
    salt = secrets.token_hex(32)
    hashed = _hash_password(password, salt)
    settings_model.set("auth_username", username)
    settings_model.set("auth_password_hash", hashed)
    settings_model.set("auth_password_salt", salt)


def login_required(f):
    """Decorator: require an authenticated session for API routes."""
    @wraps(f)
    def decorated(*args, **kwargs):
        if not session.get("authenticated"):
            if request.path.startswith("/api/"):
                return jsonify({"error": "Unauthorized"}), 401
            return redirect("/login")
        return f(*args, **kwargs)
    return decorated


def register_auth_routes(app, Settings):
    """Register login/logout routes on the Flask app."""

    @app.route("/login")
    def login_page():
        if session.get("authenticated"):
            return redirect("/")
        from flask import render_template
        return render_template("login.html")

    @app.route("/api/auth/login", methods=["POST"])
    def api_login():
        data = request.get_json(force=True) or {}
        username = (data.get("username") or "").strip()
        password = data.get("password") or ""
        if check_credentials(username, password, Settings):
            session["authenticated"] = True
            session["username"] = username
            session.permanent = True
            return jsonify({"success": True})
        return jsonify({"error": "Invalid username or password"}), 401

    @app.route("/api/auth/logout", methods=["POST"])
    def api_logout():
        session.clear()
        return jsonify({"success": True})

    @app.route("/api/auth/status", methods=["GET"])
    def api_auth_status():
        return jsonify({
            "authenticated": bool(session.get("authenticated")),
            "username": session.get("username"),
        })

    @app.route("/api/auth/change-password", methods=["POST"])
    @login_required
    def api_change_password():
        data = request.get_json(force=True) or {}
        current = data.get("current_password", "")
        new_pass = data.get("new_password", "")
        username = data.get("username") or session.get("username") or DEFAULT_USERNAME
        if not check_credentials(session.get("username", ""), current, Settings):
            return jsonify({"error": "Current password incorrect"}), 403
        if len(new_pass) < 6:
            return jsonify({"error": "Password must be at least 6 characters"}), 400
        set_password(username, new_pass, Settings)
        return jsonify({"success": True})
