from __future__ import annotations

import shutil
from collections.abc import Callable

import duckdb
from sqlalchemy.orm import Session

from graphmind.storage.models import (
    Dataset,
    DocumentChunk,
    DocumentSource,
    EvidenceIndexEntry,
    ExtractedEntity,
    ExtractedRelationship,
    FieldProfile,
    GraphEdge,
    GraphNode,
    ImportBatch,
    ImportItem,
    ImportJob,
    RelationshipSuggestion,
    Sheet,
)
from graphmind.storage.workspace import WorkspacePaths


class ProjectDataService:
    def __init__(self, paths: WorkspacePaths, session_factory: Callable[[], Session]) -> None:
        self.paths = paths
        self.session_factory = session_factory

    def reset_project_data(self, project_id: int) -> None:
        self.paths.ensure()
        with self.session_factory() as session:
            datasets = (
                session.query(Dataset)
                .filter(Dataset.project_id == project_id)
                .order_by(Dataset.id)
                .all()
            )
            raw_data_refs = [dataset.raw_data_ref for dataset in datasets if dataset.raw_data_ref]
            item_raw_data_refs = [
                raw_data_ref
                for (raw_data_ref,) in session.query(ImportItem.raw_data_ref)
                .filter(ImportItem.project_id == project_id)
                .all()
                if raw_data_ref
            ]
            duckdb_table_names = [
                table_name
                for (table_name,) in session.query(Sheet.duckdb_table_name)
                .join(Dataset, Sheet.dataset_id == Dataset.id)
                .filter(Dataset.project_id == project_id)
                .all()
            ]
            sheet_ids = [
                sheet_id
                for (sheet_id,) in session.query(Sheet.id)
                .join(Dataset, Sheet.dataset_id == Dataset.id)
                .filter(Dataset.project_id == project_id)
                .all()
            ]

            session.query(GraphEdge).filter(GraphEdge.project_id == project_id).delete(
                synchronize_session=False
            )
            session.query(GraphNode).filter(GraphNode.project_id == project_id).delete(
                synchronize_session=False
            )
            session.query(RelationshipSuggestion).filter(
                RelationshipSuggestion.project_id == project_id
            ).delete(synchronize_session=False)
            session.query(EvidenceIndexEntry).filter(
                EvidenceIndexEntry.project_id == project_id
            ).delete(synchronize_session=False)
            session.query(ExtractedRelationship).filter(
                ExtractedRelationship.project_id == project_id
            ).delete(synchronize_session=False)
            session.query(ExtractedEntity).filter(
                ExtractedEntity.project_id == project_id
            ).delete(synchronize_session=False)
            session.query(DocumentChunk).filter(DocumentChunk.project_id == project_id).delete(
                synchronize_session=False
            )
            session.query(DocumentSource).filter(DocumentSource.project_id == project_id).delete(
                synchronize_session=False
            )
            session.query(ImportJob).filter(ImportJob.project_id == project_id).delete(
                synchronize_session=False
            )
            session.query(ImportItem).filter(ImportItem.project_id == project_id).delete(
                synchronize_session=False
            )
            session.query(ImportBatch).filter(ImportBatch.project_id == project_id).delete(
                synchronize_session=False
            )
            if sheet_ids:
                session.query(FieldProfile).filter(FieldProfile.sheet_id.in_(sheet_ids)).delete(
                    synchronize_session=False
                )
            if sheet_ids:
                session.query(Sheet).filter(Sheet.id.in_(sheet_ids)).delete(
                    synchronize_session=False
                )
            session.query(Dataset).filter(Dataset.project_id == project_id).delete(
                synchronize_session=False
            )
            session.commit()

        self._drop_duckdb_tables(duckdb_table_names)
        self._remove_import_files([*raw_data_refs, *item_raw_data_refs])

    def _drop_duckdb_tables(self, table_names: list[str]) -> None:
        if not table_names or not self.paths.duckdb_path.exists():
            return

        with duckdb.connect(str(self.paths.duckdb_path)) as connection:
            for table_name in table_names:
                escaped_table_name = table_name.replace('"', '""')
                connection.execute(f'DROP TABLE IF EXISTS "{escaped_table_name}"')

    def _remove_import_files(self, raw_data_refs: list[str]) -> None:
        for raw_data_ref in raw_data_refs:
            if not raw_data_ref:
                continue
            raw_path = (self.paths.root / raw_data_ref).resolve()
            try:
                raw_path.relative_to(self.paths.root.resolve())
            except ValueError:
                continue
            raw_path.unlink(missing_ok=True)
            for directory in (raw_path.parent, raw_path.parent.parent):
                try:
                    directory.rmdir()
                except OSError:
                    break

        project_imports_dir = self.paths.imports_dir / "project_*"
        for project_dir in self.paths.imports_dir.glob(project_imports_dir.name):
            if project_dir.is_dir() and not any(project_dir.iterdir()):
                shutil.rmtree(project_dir, ignore_errors=True)
