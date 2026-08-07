from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class WorkspacePaths:
    root: Path

    @property
    def database_path(self) -> Path:
        return self.root / "state" / "graphmind.sqlite3"

    @property
    def duckdb_path(self) -> Path:
        return self.root / "state" / "graphmind.duckdb"

    @property
    def imports_dir(self) -> Path:
        return self.root / "imports"

    @property
    def import_jobs_dir(self) -> Path:
        return self.root / "import_jobs"

    @property
    def import_worker_heartbeat_path(self) -> Path:
        return self.root / "state" / "import-worker-heartbeat"

    def ensure(self) -> None:
        self.root.mkdir(parents=True, exist_ok=True)
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self.duckdb_path.parent.mkdir(parents=True, exist_ok=True)
        self.imports_dir.mkdir(parents=True, exist_ok=True)
        self.import_jobs_dir.mkdir(parents=True, exist_ok=True)
