"""Release selection and tag-update checks; no Docker, AWS, or cluster mutations."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import subprocess
import base64
import json

ROOT = Path(__file__).resolve().parents[1]

def module(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    loaded = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(loaded)
    return loaded

planner = module("planner", "scripts/ci/plan-images.py")
updater = module("updater", "scripts/kind/update-image-tags.py")
REGISTRY = "542697646590.dkr.ecr.us-east-1.amazonaws.com"
OLD = "sha-e6a29b6b98d1-39600051202-1"
NEW = "sha-0123456789ab-12345-2"

class SelectionTests(unittest.TestCase):
    def test_single_service_and_nested_sources(self):
        self.assertEqual(planner.select_services(["app/web/static/css/theme.css"]), ["web"])
        self.assertEqual(planner.select_services(["app/shipping/src/main/Controller.java"]), ["shipping"])

    def test_multiple_services_and_renames(self):
        self.assertEqual(planner.select_services(["app/cart/old.js", "app/user/new.js"]), ["cart", "user"])

    def test_shared_config_and_pipeline_changes_rebuild_all(self):
        for path in ["app/docker-compose.yaml", ".github/workflows/container-images.yml",
                     "scripts/kind/update-image-tags.py"]:
            self.assertEqual(planner.select_services([path]), list(planner.SERVICES))

    def test_non_application_docs_do_not_build_images(self):
        self.assertEqual(planner.select_services(["docs/kind-recovery.md"]), [])

    @patch.object(planner.subprocess, "run")
    def test_unpublished_service_changes_are_carried_forward(self, run):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            overlay = root / "k8s/overlays/kind"
            overlay.mkdir(parents=True)
            (overlay / "images.yaml").write_text("\n".join(
                f"image: {REGISTRY}/robotshop-kind/{service}:{OLD}" for service in planner.SERVICES))
            run.side_effect = [subprocess.CompletedProcess([], int(service == "web"))
                               for service in planner.SERVICES]
            self.assertEqual(planner.pending_services("a" * 40, root), {"web"})

    def test_manual_build_selects_every_service(self):
        self.assertEqual(planner.select_services([], force_all=True), list(planner.SERVICES))

class TagUpdateTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.overlay = Path(self.temp.name)
        self.web = self.overlay / "web.yaml"
        self.mysql = self.overlay / "mysql.yaml"
        self.web.write_text(f"image: {REGISTRY}/robotshop-kind/web:{OLD}\n")
        self.mysql.write_text(f"image: {REGISTRY}/robotshop-kind/mysql:{OLD}\n")

    def apply(self, services, tag=NEW):
        return updater.update_tags(self.overlay, REGISTRY, "robotshop-kind", services, tag)

    def test_updates_only_selected_service(self):
        original_mysql = self.mysql.read_text()
        changed = self.apply(["web"])
        self.assertEqual(set(changed), {self.web})
        self.assertIn(NEW, self.web.read_text())
        self.assertEqual(self.mysql.read_text(), original_mysql)

    def test_missing_image_fails_without_partial_updates(self):
        original = self.web.read_text()
        with self.assertRaises(ValueError):
            self.apply(["web", "payment"])
        self.assertEqual(self.web.read_text(), original)

    def test_duplicate_image_reference_fails_without_writing(self):
        self.web.write_text(self.web.read_text() * 2)
        original = self.web.read_text()
        with self.assertRaises(ValueError):
            self.apply(["web"])
        self.assertEqual(self.web.read_text(), original)

    def test_rejects_mutable_tags_and_unknown_services(self):
        for services, tag in [(["web"], "latest"), (["web", "web"], NEW), (["unknown"], NEW)]:
            with self.assertRaises(ValueError):
                self.apply(services, tag)

    def test_rejects_other_registry_and_prefix(self):
        with self.assertRaises(ValueError):
            updater.update_tags(self.overlay, "untrusted.example", "robotshop-kind", ["web"], NEW)
        with self.assertRaises(ValueError):
            updater.update_tags(self.overlay, REGISTRY, "robotshop-dev", ["web"], NEW)

refresh = module("refresh", "scripts/kind/refresh-ecr-secret.py")

class PullSecretTests(unittest.TestCase):
    @patch.object(refresh.subprocess, "run")
    def test_token_is_only_in_secret_stdin_and_uses_server_side_apply(self, run):
        run.side_effect = [subprocess.CompletedProcess([], 0, "example-token\n", ""),
                           subprocess.CompletedProcess([], 0, "", "")]
        refresh.main()
        args, kwargs = run.call_args_list[1]
        self.assertNotIn("example-token", " ".join(args[0]))
        self.assertIn("--server-side", args[0])
        secret = json.loads(kwargs["input"])
        self.assertEqual(secret["metadata"], {"name":"ecr-pull", "namespace":"robot-shop"})
        self.assertNotIn("annotations", secret["metadata"])
        self.assertEqual(secret["type"], "kubernetes.io/dockerconfigjson")
        config = json.loads(base64.b64decode(secret["data"][".dockerconfigjson"]))
        auth = config["auths"][REGISTRY]["auth"]
        self.assertEqual(base64.b64decode(auth).decode(), "AWS:example-token")

    @patch.object(refresh.subprocess, "run")
    def test_empty_token_never_updates_secret(self, run):
        run.return_value = subprocess.CompletedProcess([], 0, "\n", "")
        with self.assertRaises(RuntimeError):
            refresh.main()
        self.assertEqual(run.call_count, 1)

    @patch.object(refresh.subprocess, "run")
    def test_api_failure_does_not_echo_secret_payload(self, run):
        run.side_effect = [subprocess.CompletedProcess([], 0, "example-token", ""),
                           subprocess.CompletedProcess([], 1, "", "sensitive API payload")]
        with self.assertRaises(RuntimeError) as error:
            refresh.main()
        self.assertNotIn("sensitive", str(error.exception))

if __name__ == "__main__":
    unittest.main()
