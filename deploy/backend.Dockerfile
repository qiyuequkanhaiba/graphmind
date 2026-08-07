FROM python:3.11-slim@sha256:94c50be2dc994b873b55bc123e95e6dbade08095b3dfd790f51c34de3f08cbb7

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV GRAPHMIND_WORKSPACE_ROOT=/var/lib/graphmind
ENV PATH="/app/backend/.venv/bin:$PATH"
ENV UV_COMPILE_BYTECODE=1
ENV UV_LINK_MODE=copy

WORKDIR /app/backend

RUN groupadd --gid 10001 graphmind \
    && useradd --uid 10001 --gid graphmind --home-dir /var/lib/graphmind \
        --create-home --shell /usr/sbin/nologin graphmind

COPY --from=ghcr.io/astral-sh/uv:0.9.27@sha256:143b40f4ab56a780f43377604702107b5a35f83a4453daf1e4be691358718a6a /uv /uvx /bin/
COPY backend/pyproject.toml backend/uv.lock ./

RUN uv sync --frozen --no-dev --no-install-project

COPY backend/ ./

RUN uv sync --frozen --no-dev \
    && mkdir -p /var/lib/graphmind \
    && chown -R graphmind:graphmind /var/lib/graphmind /app/backend

USER graphmind

EXPOSE 8000

CMD ["uvicorn", "graphmind.api.app:app", "--host", "0.0.0.0", "--port", "8000"]
