"""Check graphical-session startup without stopping the user's desktop."""
import configparser
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]


class SessionServiceTest(unittest.TestCase):
    def test_core_follows_each_graphical_session_without_ordering_cycle(self):
        unit = configparser.ConfigParser(interpolation=None)
        unit.read(ROOT / 'packaging/systemd-user/linux-island-core.service.in')
        self.assertIn('graphical-session.target', unit['Install']['WantedBy'].split())
        self.assertIn('graphical-session.target', unit['Unit'].get('PartOf', '').split())
        # Targets order after their Wanted units; the reverse edge creates a cycle.
        self.assertNotIn('graphical-session.target', unit['Unit'].get('After', '').split())
        self.assertEqual(unit['Service']['BusName'], 'io.github.linuxisland.Core')
        self.assertEqual(unit['Service']['Type'], 'dbus')
        # The unit is a template: CMake substitutes the real libexec dir at
        # install time so `--prefix` and DESTDIR staging both work.
        self.assertEqual(unit['Service']['ExecStart'],
                         '@ISLAND_LIBEXECDIR@/linux-island-core')

    def test_no_ui_unit(self):
        """The Qt UI is an XDG autostart entry, not a systemd service.

        Its process is a graphical client that exits on GNOME by design, so a
        `Type=simple` unit would restart it forever and duplicate autostart.
        """
        self.assertFalse((ROOT / 'packaging/systemd-user/linux-island-ui.service').exists())


if __name__ == '__main__':
    unittest.main()
