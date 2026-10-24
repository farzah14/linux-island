"""Check graphical-session startup without stopping the user's desktop."""
import configparser
from pathlib import Path
import unittest


class SessionServiceTest(unittest.TestCase):
    def test_core_follows_each_graphical_session_without_ordering_cycle(self):
        root = Path(__file__).resolve().parents[2]
        unit = configparser.ConfigParser(interpolation=None)
        unit.read(root / 'packaging/systemd-user/linux-island-core.service')
        self.assertIn('graphical-session.target', unit['Install']['WantedBy'].split())
        self.assertIn('graphical-session.target', unit['Unit'].get('PartOf', '').split())
        # Targets order after their Wanted units; the reverse edge creates a cycle.
        self.assertNotIn('graphical-session.target', unit['Unit'].get('After', '').split())
        self.assertEqual(unit['Service']['BusName'], 'io.github.linuxisland.Core')
        self.assertEqual(unit['Service']['Type'], 'dbus')


if __name__ == '__main__':
    unittest.main()
