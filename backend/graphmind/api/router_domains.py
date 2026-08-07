from dataclasses import dataclass

from fastapi import APIRouter


@dataclass(frozen=True)
class DomainRouters:
    projects: APIRouter
    imports: APIRouter
    graph: APIRouter
    reviews: APIRouter
    evidence: APIRouter
    ai: APIRouter

    def as_dict(self) -> dict[str, APIRouter]:
        return {
            "projects": self.projects,
            "imports": self.imports,
            "graph": self.graph,
            "reviews": self.reviews,
            "evidence": self.evidence,
            "ai": self.ai,
        }


def create_domain_routers() -> DomainRouters:
    return DomainRouters(
        projects=APIRouter(tags=["projects"]),
        imports=APIRouter(tags=["imports"]),
        graph=APIRouter(tags=["graph"]),
        reviews=APIRouter(tags=["reviews"]),
        evidence=APIRouter(tags=["evidence"]),
        ai=APIRouter(tags=["ai"]),
    )
