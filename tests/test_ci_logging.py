from pathlib import Path


WORKFLOW_PATH = Path('.github/workflows/tests.yml')


def test_frontend_vitest_logging_configuration() -> None:
    content = WORKFLOW_PATH.read_text()

    run_block = (
        "      - name: Run frontend tests\n"
        "        env:\n"
        "          CI: 'true'\n"
        "        run: |\n"
        "          mkdir -p artifacts\n"
        "          set -o pipefail\n"
        "          npx vitest --run --environment jsdom --reporter=verbose --reporter=junit --outputFile artifacts/vitest-junit.xml | tee artifacts/vitest.log\n"
    )
    assert run_block in content

    artifact_block = (
        "      - name: Upload vitest artifacts\n"
        "        if: always()\n"
        "        uses: actions/upload-artifact@v4\n"
        "        with:\n"
        "          name: vitest-artifacts\n"
        "          path: |\n"
        "            artifacts/vitest.log\n"
        "            artifacts/vitest-*\n"
    )
    assert artifact_block in content

    run_index = content.index("      - name: Run frontend tests")
    upload_index = content.index("      - name: Upload vitest artifacts")
    assert run_index < upload_index
