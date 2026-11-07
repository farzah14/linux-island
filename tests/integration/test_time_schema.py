from pathlib import Path
import xml.etree.ElementTree as ET

p = Path(__file__).resolve().parents[2] / 'schemas/io.github.linuxisland.Time1.xml'
i = ET.parse(p).getroot().find("interface[@name='io.github.linuxisland.Time1']")
assert i is not None, 'Time1 interface must exist'
methods = {e.attrib['name']: [(a.attrib['name'], a.attrib['type'], a.attrib['direction'])
                              for a in e.findall('arg')]
           for e in i.findall('method')}
signals = {e.attrib['name']: [(a.attrib['name'], a.attrib['type']) for a in e.findall('arg')]
           for e in i.findall('signal')}

assert methods == {
    'GetTimer': [('timer', 'a{sv}', 'out')],
    'GetTimerStats': [('stats', 'a{sv}', 'out')],
    'StartTimer': [('request', 'a{sv}', 'in'), ('accepted', 'b', 'out')],
    'ControlTimer': [('action', 's', 'in'), ('accepted', 'b', 'out')],
}, methods
assert signals == {
    'TimerChanged': [('revision', 't'), ('timer', 'a{sv}')],
}, signals
print('PASS: Time1 XML signatures frozen')
