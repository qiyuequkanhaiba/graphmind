import pytest

from graphmind.services.provider_policy import validate_runtime_provider_endpoint


def test_runtime_endpoint_policy_changes_from_development_to_production():
    endpoint = "http://api.example.com/v1/chat/completions"

    validate_runtime_provider_endpoint(
        endpoint,
        environ={"GRAPHMIND_DEPLOYMENT_MODE": "development"},
    )

    with pytest.raises(ValueError, match="HTTPS"):
        validate_runtime_provider_endpoint(
            endpoint,
            environ={
                "GRAPHMIND_DEPLOYMENT_MODE": "production",
                "GRAPHMIND_AI_PROVIDER_ALLOWLIST": "api.example.com",
            },
        )

    with pytest.raises(ValueError, match="ALLOWLIST"):
        validate_runtime_provider_endpoint(
            "https://api.example.com/v1/chat/completions",
            environ={"GRAPHMIND_DEPLOYMENT_MODE": "production"},
        )
