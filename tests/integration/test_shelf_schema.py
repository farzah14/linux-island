from pathlib import Path
import xml.etree.ElementTree as ET

p = Path(__file__).resolve().parents[2] / 'schemas/io.github.linuxisland.Shelf1.xml'
i = ET.parse(p).getroot().find("interface[@name='io.github.linuxisland.Shelf1']")
assert i is not None, 'Shelf1 interface must exist'
methods = {e.attrib['name']: [(a.attrib['name'], a.attrib['type'], a.attrib['direction'])
                              for a in e.findall('arg')]
           for e in i.findall('method')}
signals = {e.attrib['name']: [(a.attrib['name'], a.attrib['type']) for a in e.findall('arg')]
           for e in i.findall('signal')}

assert methods == {
    'GetShelf': [('shelf', 'a{sv}', 'out')],
    'AddFiles': [('uris', 'as', 'in'), ('accepted', 'b', 'out')],
    'RemoveFile': [('id', 's', 'in'), ('accepted', 'b', 'out')],
    'ClearShelf': [('accepted', 'b', 'out')],
}, methods
assert signals == {
    'ShelfChanged': [('revision', 't'), ('shelf', 'a{sv}')],
}, signals
print('PASS: Shelf1 XML signatures frozen')
