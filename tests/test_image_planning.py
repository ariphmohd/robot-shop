"""Image build planning checks using separate app and infrastructure fixtures."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("planner", ROOT / "scripts/ci/plan-images.py")
planner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(planner)
REGISTRY = "542697646590.dkr.ecr.us-east-1.amazonaws.com"
OLD = "sha-e6a29b6b98d1-39600051202-1"

class SelectionTests(unittest.TestCase):
    def test_single_service_and_nested_sources(self):
        self.assertEqual(planner.select_services(["app/web/static/css/theme.css"]), ["web"])
        self.assertEqual(planner.select_services(["app/shipping/src/main/Controller.java"]), ["shipping"])

    def test_multiple_services_and_renames(self):
        self.assertEqual(planner.select_services(["app/cart/old.js", "app/user/new.js"]), ["cart", "user"])

    def test_shared_and_pipeline_changes_rebuild_all(self):
        for path in ["app/docker-compose.yaml", *planner.PIPELINE_PATHS]:
            self.assertEqual(planner.select_services([path]), list(planner.SERVICES))

    def test_docs_and_legacy_infra_do_not_build(self):
        self.assertEqual(planner.select_services(["docs/kind-recovery.md", "scripts/kind/update-image-tags.py"]), [])

    def test_manual_build_selects_every_service(self):
        self.assertEqual(planner.select_services([], force_all=True), list(planner.SERVICES))

class PendingTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.app = Path(self.temp.name) / "app-repo"
        self.infra = Path(self.temp.name) / "infra-repo"
        self.app.mkdir()
        self.overlay = self.infra / "k8s/overlays/kind"
        self.overlay.mkdir(parents=True)
        self.images = self.overlay / "images.yaml"
        self.images.write_text("\n".join(
            f"image: {REGISTRY}/robotshop-kind/{service}:{OLD}" for service in planner.SERVICES))

    def pending(self):
        return planner.pending_services("a" * 40, self.app, self.infra)

    @patch.object(planner.subprocess, "run")
    def test_reads_external_manifests_and_app_history(self, run):
        stale = self.app / "k8s/overlays/kind"
        stale.mkdir(parents=True)
        (stale / "images.yaml").write_text(self.images.read_text().replace(OLD, "sha-bbbbbbbbbbbb-9-1"))
        run.return_value = subprocess.CompletedProcess([], 0, "app/web/static/index.html\n", "")
        self.assertEqual(self.pending(), {"web"})
        for call in run.call_args_list:
            self.assertEqual(call.kwargs["cwd"], self.app)
            self.assertIn("e6a29b6b98d1", call.args[0])
            self.assertNotIn("bbbbbbbbbbbb", call.args[0])

    @patch.object(planner.subprocess, "run")
    def test_shared_change_from_unpublished_run_is_carried_forward(self, run):
        run.return_value = subprocess.CompletedProcess([], 0, "app/docker-compose.yaml\n", "")
        self.assertEqual(self.pending(), set(planner.SERVICES))

    @patch.object(planner.subprocess, "run")
    def test_unavailable_baseline_rebuilds(self, run):
        run.return_value = subprocess.CompletedProcess([], 128, "", "unknown revision")
        self.assertEqual(self.pending(), set(planner.SERVICES))

    @patch.object(planner.subprocess, "run")
    def test_unchanged_application_needs_no_carry_forward(self, run):
        run.return_value = subprocess.CompletedProcess([], 0, "README.md\n", "")
        self.assertEqual(self.pending(), set())

    @patch.object(planner.subprocess, "run")
    def test_missing_or_ambiguous_image_reference_rebuilds(self, run):
        run.return_value = subprocess.CompletedProcess([], 0, "", "")
        lines = self.images.read_text().splitlines()
        web = next(line for line in lines if "/web:" in line)
        self.images.write_text("\n".join(line for line in lines if "/mysql:" not in line) + "\n" + web)
        self.assertEqual(self.pending(), {"mysql", "web"})

    def test_missing_external_checkout_fails(self):
        with self.assertRaises(ValueError):
            planner.pending_services("a" * 40, self.app, self.app)

class EventTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.folder = Path(self.temp.name)
        self.event = self.folder / "event.json"
        self.output = self.folder / "output"
        self.env = {
            "GITHUB_EVENT_PATH": str(self.event), "GITHUB_OUTPUT": str(self.output),
            "GITHUB_SHA": "a" * 40, "GITHUB_RUN_ID": "12345", "GITHUB_RUN_ATTEMPT": "2",
        }

    def run_event(self, name, payload):
        self.event.write_text(json.dumps(payload))
        with patch.dict(os.environ, {**self.env, "GITHUB_EVENT_NAME": name}, clear=True):
            planner.main()
        return dict(line.split("=", 1) for line in self.output.read_text().splitlines())

    @patch.object(planner, "pending_services")
    @patch.object(planner.subprocess, "run")
    def test_pull_request_needs_no_infra_checkout(self, run, pending):
        run.return_value = subprocess.CompletedProcess([], 0, "app/web/static/index.html\n", "")
        result = self.run_event("pull_request", {"pull_request": {"base": {"sha": "b" * 40}, "head": {"sha": "a" * 40}}})
        pending.assert_not_called()
        self.assertEqual(json.loads(result["services"]), ["web"])
        self.assertEqual(result["image_tag"], "sha-aaaaaaaaaaaa-12345-2")

    @patch.object(planner, "pending_services")
    def test_manual_build_does_not_depend_on_baseline(self, pending):
        result = self.run_event("workflow_dispatch", {})
        pending.assert_not_called()
        self.assertEqual(json.loads(result["services"]), list(planner.SERVICES))

    @patch.object(planner.subprocess, "run")
    def test_push_requires_explicit_infra_root(self, run):
        run.return_value = subprocess.CompletedProcess([], 0, "app/web/static/index.html\n", "")
        with self.assertRaisesRegex(SystemExit, "INFRA_ROOT"):
            self.run_event("push", {"before": "b" * 40})
        self.assertFalse(self.output.exists())

    @patch.object(planner, "pending_services")
    @patch.object(planner.subprocess, "run")
    def test_push_unions_current_change_and_unpublished_services(self, run, pending):
        run.return_value = subprocess.CompletedProcess([], 0, "app/web/static/index.html\n", "")
        pending.return_value = {"payment"}
        self.env["INFRA_ROOT"] = str(self.folder / "infra")
        result = self.run_event("push", {"before": "b" * 40})
        self.assertEqual(json.loads(result["services"]), ["payment", "web"])
        self.assertEqual(pending.call_args.args[2], self.folder / "infra")

if __name__ == "__main__":
    unittest.main()
