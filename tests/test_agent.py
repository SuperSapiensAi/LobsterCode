"""
Test suite per Lobster Code V1.
Verifica permissions, tool execution, security e coerenza.
Esegui con: cd tests && python3 test_agent.py
"""
import sys
import os
import unittest

# Aggiungi ui/ al path per importare agent_server
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'ui'))

# Importa il modulo (non avvia il server)
import agent_server as srv


class TestPermissions(unittest.TestCase):
    """Verifica il sistema di permessi a 3 livelli."""

    def test_permission_levels_exist(self):
        self.assertIn("read-only", srv.PERMISSION_LEVELS)
        self.assertIn("workspace-write", srv.PERMISSION_LEVELS)
        self.assertIn("full-access", srv.PERMISSION_LEVELS)

    def test_permission_order(self):
        self.assertLess(srv.PERMISSION_LEVELS["read-only"], srv.PERMISSION_LEVELS["workspace-write"])
        self.assertLess(srv.PERMISSION_LEVELS["workspace-write"], srv.PERMISSION_LEVELS["full-access"])

    def test_default_permission_is_workspace_write(self):
        # Senza env var, il default deve essere workspace-write
        self.assertEqual(srv.PERMISSION_MODE, "workspace-write")

    def test_bash_allowed_in_workspace_write(self):
        """bash deve funzionare in workspace-write (bug fix V1.1)."""
        original = srv.PERMISSION_MODE
        srv.PERMISSION_MODE = "workspace-write"
        result = srv._check_permission("bash")
        srv.PERMISSION_MODE = original
        self.assertIsNone(result, "bash should be allowed in workspace-write")

    def test_bash_blocked_in_read_only(self):
        original = srv.PERMISSION_MODE
        srv.PERMISSION_MODE = "read-only"
        result = srv._check_permission("bash")
        srv.PERMISSION_MODE = original
        self.assertIsNotNone(result, "bash should be blocked in read-only")

    def test_read_file_allowed_in_read_only(self):
        original = srv.PERMISSION_MODE
        srv.PERMISSION_MODE = "read-only"
        result = srv._check_permission("read_file")
        srv.PERMISSION_MODE = original
        self.assertIsNone(result, "read_file should be allowed in read-only")

    def test_write_file_blocked_in_read_only(self):
        original = srv.PERMISSION_MODE
        srv.PERMISSION_MODE = "read-only"
        result = srv._check_permission("write_file")
        srv.PERMISSION_MODE = original
        self.assertIsNotNone(result, "write_file should be blocked in read-only")

    def test_all_tools_have_permissions(self):
        """Ogni tool nativo deve avere un livello di permesso definito."""
        for tool_def in srv.TOOLS:
            name = tool_def["function"]["name"]
            self.assertIn(name, srv.TOOL_PERMISSIONS,
                          f"Tool '{name}' manca da TOOL_PERMISSIONS")


class TestToolDefinitions(unittest.TestCase):
    """Verifica che i 7 tool nativi siano definiti correttamente."""

    EXPECTED_TOOLS = [
        "bash", "read_file", "write_file", "edit_file",
        "list_directory", "search_files", "glob_search"
    ]

    def test_seven_tools_exist(self):
        tool_names = [t["function"]["name"] for t in srv.TOOLS]
        self.assertEqual(len(tool_names), 7, f"Expected 7 tools, got {len(tool_names)}: {tool_names}")

    def test_all_expected_tools_present(self):
        tool_names = {t["function"]["name"] for t in srv.TOOLS}
        for expected in self.EXPECTED_TOOLS:
            self.assertIn(expected, tool_names, f"Tool '{expected}' missing")

    def test_tool_format(self):
        """Ogni tool deve avere il formato Ollama corretto."""
        for tool in srv.TOOLS:
            self.assertEqual(tool["type"], "function")
            fn = tool["function"]
            self.assertIn("name", fn)
            self.assertIn("description", fn)
            self.assertIn("parameters", fn)
            self.assertIn("type", fn["parameters"])


class TestSecurity(unittest.TestCase):
    """Verifica i blocchi di sicurezza."""

    BLOCKED_PATHS = [
        "/System/Library/test", "/Library/test", "/usr/bin/test",
        "/bin/sh", "/sbin/test", "/etc/passwd", "/var/log/test"
    ]

    def test_protected_paths_blocked_write(self):
        """Scrittura su path di sistema deve essere bloccata."""
        for path in self.BLOCKED_PATHS:
            blocked = srv._is_path_protected_write(path)
            self.assertTrue(blocked, f"Path '{path}' should be blocked for write but wasn't")

    def test_workspace_path_allowed_write(self):
        """Path nel workspace deve essere consentito per scrittura."""
        blocked = srv._is_path_protected_write(srv.WORKSPACE_ROOT + "/test.py")
        self.assertFalse(blocked, "Workspace path should not be blocked for write")

    def test_dangerous_commands_blocked(self):
        """Comandi distruttivi devono essere bloccati."""
        dangerous = ["rm -rf /", "sudo rm -rf /home", "mkfs.ext4 /dev/sda", "dd if=/dev/zero of=/dev/sda"]
        for cmd in dangerous:
            blocked = srv._is_bash_dangerous(cmd)
            self.assertTrue(blocked, f"Command '{cmd}' should be blocked")

    def test_safe_commands_allowed(self):
        """Comandi normali devono passare."""
        safe = ["ls -la", "cat file.py", "mkdir test", "echo hello", "python3 script.py"]
        for cmd in safe:
            blocked = srv._is_bash_dangerous(cmd)
            self.assertFalse(blocked, f"Command '{cmd}' should be allowed but was blocked")


class TestEngine(unittest.TestCase):
    """Verifica che il sistema engine sia semplificato a solo Ollama."""

    def test_engine_is_ollama(self):
        self.assertEqual(srv.get_active_engine(), "ollama")

    def test_no_claw_binary_reference(self):
        self.assertFalse(hasattr(srv, 'CLAW_BINARY') and srv.CLAW_BINARY,
                         "CLAW_BINARY should not exist or be empty")

    def test_engine_mode_fixed(self):
        self.assertEqual(srv.ENGINE_MODE, "ollama")


class TestMCP(unittest.TestCase):
    """Verifica che il client MCP sia inizializzato."""

    def test_mcp_registry_exists(self):
        self.assertIsNotNone(srv._mcp_registry)

    def test_mcp_registry_has_methods(self):
        reg = srv._mcp_registry
        self.assertTrue(hasattr(reg, 'is_mcp_tool'))
        self.assertTrue(hasattr(reg, 'execute_mcp_tool'))
        self.assertTrue(hasattr(reg, 'get_ollama_tools'))
        self.assertTrue(hasattr(reg, 'shutdown_all'))

    def test_mcp_tool_naming(self):
        """I tool nativi NON devono essere riconosciuti come MCP."""
        reg = srv._mcp_registry
        # Senza server configurati, nessun tool è MCP
        self.assertFalse(reg.is_mcp_tool("bash"))
        self.assertFalse(reg.is_mcp_tool("read_file"))
        # Il pattern MCP è mcp__<server>__<tool>
        self.assertTrue("mcp__" in "mcp__github__create_issue")


class TestProjectDNA(unittest.TestCase):
    """Verifica che Project DNA funzioni."""

    def test_get_project_context_returns_dict(self):
        ctx = srv.get_project_context()
        self.assertIsInstance(ctx, dict)

    def test_context_has_expected_keys(self):
        ctx = srv.get_project_context()
        # Almeno alcune chiavi dovrebbero esistere
        for key in ["stack", "languages"]:
            self.assertIn(key, ctx, f"Key '{key}' missing from project context")


if __name__ == "__main__":
    # Header
    print("=" * 60)
    print("  LOBSTER CODE V1 — Test Suite")
    print("=" * 60)
    print()

    unittest.main(verbosity=2)
