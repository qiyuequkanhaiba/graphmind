from pathlib import Path

from graphmind.api.router_domains import create_domain_routers
from graphmind.api.routes import create_router


def test_api_router_declares_product_domain_routers():
    routers = create_domain_routers()

    assert set(routers.as_dict()) == {
        "ai",
        "evidence",
        "graph",
        "imports",
        "projects",
        "reviews",
    }
    assert routers.projects.tags == ["projects"]
    assert routers.imports.tags == ["imports"]
    assert routers.graph.tags == ["graph"]
    assert routers.reviews.tags == ["reviews"]
    assert routers.evidence.tags == ["evidence"]
    assert routers.ai.tags == ["ai"]


def test_create_router_keeps_public_paths_assigned_to_domain_boundaries():
    router = create_router(
        session_factory=lambda: None,  # not invoked while inspecting route metadata
        workspace_root=Path(".graphmind-test"),
        import_job_queue=object(),
    )
    route_tags = {
        (route.path, tuple(sorted(getattr(route, "methods", set()) or set()))): route.tags
        for route in router.routes
    }

    assert route_tags[("/api/projects", ("POST",))] == ["projects"]
    assert route_tags[("/api/projects/{project_id}/graph", ("GET",))] == ["graph"]
    assert route_tags[("/api/projects/{project_id}/import-jobs", ("GET",))] == ["imports"]
    assert route_tags[("/api/projects/{project_id}/sources/detail", ("GET",))] == ["evidence"]
    assert route_tags[("/api/projects/{project_id}/relationship-suggestions", ("GET",))] == [
        "reviews"
    ]
    assert route_tags[("/api/projects/{project_id}/chat", ("POST",))] == ["ai"]
