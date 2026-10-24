from pathlib import Path
import xml.etree.ElementTree as ET

p = Path(__file__).resolve().parents[2] / 'schemas/io.github.linuxisland.Core1.xml'
i = ET.parse(p).getroot().find("interface[@name='io.github.linuxisland.Core1']")
assert i is not None
methods = {e.attrib['name']: [(a.attrib['type'], a.attrib['direction']) for a in e.findall('arg')]
           for e in i.findall('method')}
signals = {e.attrib['name']: [a.attrib['type'] for a in e.findall('arg')]
           for e in i.findall('signal')}
assert methods == {
 'GetSnapshot':[('a{sv}','out')], 'GetMediaState':[('a{sv}','out')],
 'ControlMedia':[('s','in'),('b','out')], 'SetActivePlayer':[('s','in'),('b','out')],
 'GetSettings':[('a{sv}','out')], 'UpdateSettings':[('a{sv}','in'),('t','out')],
}
assert signals == {
 'MediaChanged':['t','a{sv}'], 'SettingsChanged':['t','a{sv}'], 'CoreStatusChanged':['s'],
}
print('PASS: Core1 XML signatures frozen')
