from pathlib import Path

DEPLOY_DIR = Path(__file__).resolve().parents[1].parent / "deploy"


def test_caddy_ingress_template_enables_https_reverse_proxy_and_security_headers():
    caddyfile = (DEPLOY_DIR / "Caddyfile").read_text(encoding="utf-8")

    assert "graphmind.example.com" in caddyfile
    assert "reverse_proxy frontend:80" in caddyfile
    assert "reverse_proxy backend:8000" in caddyfile
    assert "Strict-Transport-Security" in caddyfile
    assert "Content-Security-Policy" in caddyfile
    assert "X-Frame-Options" in caddyfile
    assert "header /api/* Cache-Control no-store" in caddyfile


def test_tls_compose_profile_exposes_https_ingress_without_frontend_or_workspace_ports():
    compose = (DEPLOY_DIR / "docker-compose.tls.yml").read_text(encoding="utf-8")

    assert "caddy:" in compose
    assert "80:80" in compose
    assert "443:443" in compose
    assert "caddy-data:" in compose
    assert "deploy/Caddyfile" in compose
    assert "ports: !reset []" in compose
    assert "graphmind-workspace:" not in compose


def test_compose_readiness_graph_starts_worker_before_backend_ready_and_gates_ingress():
    compose = (DEPLOY_DIR / "docker-compose.yml").read_text(encoding="utf-8")
    tls_compose = (DEPLOY_DIR / "docker-compose.tls.yml").read_text(encoding="utf-8")

    assert "http://127.0.0.1:8000/api/ready" in compose
    assert "backend:\n        condition: service_started" in compose
    frontend_dependencies = (
        "backend:\n        condition: service_healthy\n"
        "      worker:\n        condition: service_healthy"
    )
    assert frontend_dependencies in compose
    assert "test -f /var/lib/graphmind/workspace/state/import-worker-heartbeat" in compose
    assert "worker:\n        condition: service_healthy" in tls_compose


def test_ops_profile_mounts_the_production_workspace_volume_and_backup_directory():
    compose = (DEPLOY_DIR / "docker-compose.yml").read_text(encoding="utf-8")

    assert "ops:" in compose
    assert 'profiles: ["ops"]' in compose
    assert "graphmind-workspace:/var/lib/graphmind" in compose
    assert "GRAPHMIND_WORKSPACE_ROOT: /var/lib/graphmind/workspace" in compose
    assert "${GRAPHMIND_BACKUP_DIR:-/var/backups/graphmind}:/backups" in compose
